import {
  getLineRoute,
  getLineRouteGeometry,
  getRoadDisruptions,
  getBusStopsNearPoint,
} from "../services/tfl/tflService.js";

import {
  normaliseRouteSequence,
  resolveRouteGeometry,
  findIncidentsNearRoute,
  findIncidentsNearRouteGeometry,
  analyseAffectedRouteSection,
} from "../services/diversion/routeAnalysisService.js";

const ROUTE_CACHE_MS = 5 * 60 * 1000;
const DISRUPTION_CACHE_MS = 60 * 1000;
const DETECTION_CACHE_MS = 2 * 60 * 1000;
const AUTO_CONCURRENCY = 2;
const AUTO_JOB_DELAY_MS = 250;

const routeDataCache = new Map();
const routeGeometryCache = new Map();
const detectionCache = new Map();

let disruptionCache = {
  data: null,
  expiresAt: 0,
};

let disruptionPromise = null;
let tflCooldownUntil = 0;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getCached(cache, key) {
  const item = cache.get(key);

  if (!item) {
    return null;
  }

  if (Date.now() >= item.expiresAt) {
    cache.delete(key);
    return null;
  }

  return item.data;
}

function setCached(cache, key, data, ttl) {
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttl,
  });

  return data;
}

function isRateLimitError(error) {
  return (
    error?.response?.status === 429 ||
    error?.response?.data?.statusCode === 429 ||
    error?.statusCode === 429
  );
}

function getRetrySeconds(error) {
  const retryAfter =
    error?.response?.headers?.["retry-after"];

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds)) {
      return Math.max(seconds, 1);
    }
  }

  const message =
    error?.response?.data?.message ||
    error?.message ||
    "";

  const match = String(message).match(
    /try again in\s+(\d+)\s+seconds?/i
  );

  if (match) {
    return Math.max(Number(match[1]), 1);
  }

  return 15;
}

function registerRateLimit(error) {
  const seconds = getRetrySeconds(error);

  tflCooldownUntil = Math.max(
    tflCooldownUntil,
    Date.now() + seconds * 1000
  );

  return seconds;
}

async function waitForTfLCooldown() {
  const remaining =
    tflCooldownUntil - Date.now();

  if (remaining > 0) {
    await sleep(remaining + 250);
  }
}

async function safeTfLRequest(request) {
  await waitForTfLCooldown();

  try {
    return await request();
  } catch (error) {
    if (!isRateLimitError(error)) {
      throw error;
    }

    const seconds =
      registerRateLimit(error);

    const rateLimitError =
      new Error(
        `TfL rate limit reached. Please try again in ${seconds} seconds.`
      );

    rateLimitError.statusCode = 429;
    rateLimitError.retryAfter = seconds;
    rateLimitError.originalError = error;

    throw rateLimitError;
  }
}

async function getCachedDisruptions() {
  if (
    disruptionCache.data &&
    Date.now() < disruptionCache.expiresAt
  ) {
    return disruptionCache.data;
  }

  if (disruptionPromise) {
    return disruptionPromise;
  }

  disruptionPromise = safeTfLRequest(
    () => getRoadDisruptions()
  )
    .then((data) => {
      disruptionCache = {
        data,
        expiresAt:
          Date.now() +
          DISRUPTION_CACHE_MS,
      };

      return data;
    })
    .finally(() => {
      disruptionPromise = null;
    });

  return disruptionPromise;
}

async function getCachedRouteData(lineId) {
  const key =
    String(lineId).toLowerCase();

  const cached =
    getCached(routeDataCache, key);

  if (cached) {
    return cached;
  }

  const data = await safeTfLRequest(
    () => getLineRoute(lineId)
  );

  return setCached(
    routeDataCache,
    key,
    data,
    ROUTE_CACHE_MS
  );
}

async function getCachedRouteGeometry(
  lineId,
  direction
) {
  const key =
    `${String(lineId).toLowerCase()}:${direction}`;

  const cached =
    getCached(
      routeGeometryCache,
      key
    );

  if (cached) {
    return cached;
  }

  const data = await safeTfLRequest(
    () =>
      getLineRouteGeometry(
        lineId,
        direction
      )
  );

  return setCached(
    routeGeometryCache,
    key,
    data,
    ROUTE_CACHE_MS
  );
}

function incidentCoordinates(incident) {
  const lat = Number(
    incident?.geography
      ?.coordinates?.[1] ??
      incident?.lat ??
      incident?.latitude
  );

  const lon = Number(
    incident?.geography
      ?.coordinates?.[0] ??
      incident?.lon ??
      incident?.longitude
  );

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }

  return {
    latitude: lat,
    longitude: lon,
  };
}

function getCandidateLines(stops) {
  const lines = new Map();

  for (const stop of stops || []) {
    for (const line of stop?.lines || []) {
      const id = String(
        line?.id ||
          line?.name ||
          ""
      ).trim();

      if (!id) {
        continue;
      }

      if (!lines.has(id)) {
        lines.set(id, {
          lineId: id,
          name:
            line?.name || id,
          nearbyStops: [],
        });
      }

      lines
        .get(id)
        .nearbyStops.push({
          id: stop.id,
          name: stop.commonName,
          distance: stop.distance,
        });
    }
  }

  return Array.from(
    lines.values()
  );
}

function confidenceForDistance(
  distance,
  fallbackUsed
) {
  if (!Number.isFinite(distance)) {
    return {
      confidence: "LOW",
      autoProposalEligible: false,
    };
  }

  if (
    distance <= 50 &&
    !fallbackUsed
  ) {
    return {
      confidence: "HIGH",
      autoProposalEligible: true,
    };
  }

  if (distance <= 100) {
    return {
      confidence:
        fallbackUsed
          ? "MEDIUM"
          : "HIGH",
      autoProposalEligible:
        !fallbackUsed,
    };
  }

  if (distance <= 250) {
    return {
      confidence: "MEDIUM",
      autoProposalEligible: false,
    };
  }

  return {
    confidence: "LOW",
    autoProposalEligible: false,
  };
}

async function analyseCandidateDirection(
  lineId,
  direction,
  incident,
  radius
) {
  try {
    const routeData =
      await getCachedRouteData(
        lineId
      );

    const geometryData =
      await getCachedRouteGeometry(
        lineId,
        direction
      );

    const sequences =
      normaliseRouteSequence(
        routeData,
        lineId
      );

    const totalStops =
      sequences.reduce(
        (total, sequence) =>
          total +
          (
            sequence.stops || []
          ).length,
        0
      );

    if (
      !sequences.length ||
      totalStops === 0
    ) {
      return null;
    }

    const geometryResult =
      resolveRouteGeometry(
        geometryData,
        sequences,
        direction
      );

    if (
      geometryResult.coordinates
        .length < 2
    ) {
      return null;
    }

    const affectedSection =
      analyseAffectedRouteSection(
        sequences,
        geometryResult.coordinates,
        incident,
        radius
      );

    if (!affectedSection) {
      return null;
    }

    const distance =
      affectedSection
        .distanceFromRouteMetres;

    const confidenceResult =
      confidenceForDistance(
        distance,
        geometryResult.fallbackUsed
      );

    return {
      lineId,
      direction,
      distanceFromRouteMetres:
        distance,
      affectedStops:
        affectedSection
          .affectedStops?.length ||
        0,
      confidence:
        confidenceResult.confidence,
      autoProposalEligible:
        confidenceResult
          .autoProposalEligible,
      geometrySource:
        geometryResult.source,
      geometryFallbackUsed:
        geometryResult.fallbackUsed,
      affectedSection,
    };
  } catch (error) {
    if (isRateLimitError(error)) {
      throw error;
    }

    console.error(
      `Automatic route analysis failed for ${lineId} ${direction}:`,
      error.response?.data ||
        error.message
    );

    return null;
  }
}

async function mapWithConcurrency(
  items,
  limit,
  worker
) {
  const results = [];
  let index = 0;
  let rateLimitError = null;

  async function run() {
    while (
      index < items.length &&
      !rateLimitError
    ) {
      const currentIndex =
        index++;

      if (currentIndex > 0) {
        await sleep(
          AUTO_JOB_DELAY_MS
        );
      }

      try {
        const result =
          await worker(
            items[currentIndex],
            currentIndex
          );

        if (result) {
          results.push(result);
        }
      } catch (error) {
        if (
          error?.statusCode === 429 ||
          isRateLimitError(error)
        ) {
          rateLimitError =
            error;

          break;
        }

        throw error;
      }
    }
  }

  const workers =
    Array.from(
      {
        length: Math.min(
          limit,
          items.length
        ),
      },
      () => run()
    );

  await Promise.all(workers);

  if (rateLimitError) {
    throw rateLimitError;
  }

  return results;
}

function detectionCacheKey(
  incidentId,
  radius,
  stopSearchRadius
) {
  return [
    incidentId,
    radius,
    stopSearchRadius,
  ].join(":");
}

export async function detectAffectedRoutes(
  req,
  res
) {
  try {
    const { incidentId } =
      req.params;

    const radius = Math.min(
      Math.max(
        Number(
          req.query.radius
        ) || 250,
        50
      ),
      500
    );

    const stopSearchRadius =
      Math.min(
        Math.max(
          Number(
            req.query.stopRadius
          ) || 500,
          100
        ),
        1000
      );

    const cacheKey =
      detectionCacheKey(
        incidentId,
        radius,
        stopSearchRadius
      );

    const cached =
      getCached(
        detectionCache,
        cacheKey
      );

    if (cached) {
      return res.json({
        ...cached,
        cached: true,
      });
    }

    const disruptions =
      await getCachedDisruptions();

    const incident =
      disruptions.find(
        (item) =>
          item.id === incidentId
      );

    if (!incident) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "The TfL incident was not found.",
        });
    }

    const coordinates =
      incidentCoordinates(
        incident
      );

    if (!coordinates) {
      return res
        .status(422)
        .json({
          success: false,
          message:
            "The incident does not contain usable geographic coordinates.",
        });
    }

    const nearbyStops =
      await safeTfLRequest(
        () =>
          getBusStopsNearPoint(
            coordinates.latitude,
            coordinates.longitude,
            stopSearchRadius
          )
      );

    const candidateLines =
      getCandidateLines(
        nearbyStops
      );

    if (
      !candidateLines.length
    ) {
      const response = {
        success: true,
        cached: false,
        incident: {
          id: incident.id,
          location:
            incident.location,
          severity:
            incident.severity,
          category:
            incident.category,
          status:
            incident.status,
        },
        analysis: {
          routeAnalysisRadiusMetres:
            radius,
          nearbyStopRadiusMetres:
            stopSearchRadius,
          nearbyStops:
            nearbyStops.length,
          candidateRoutes: 0,
          detectedRoutes: 0,
          highConfidenceRoutes: 0,
          automaticProposalCandidates: 0,
        },
        detectedRoutes: [],
        message:
          "No candidate bus routes were found near this incident.",
      };

      setCached(
        detectionCache,
        cacheKey,
        response,
        DETECTION_CACHE_MS
      );

      return res.json(response);
    }

    const jobs =
      candidateLines.flatMap(
        (candidate) => [
          {
            lineId:
              candidate.lineId,
            direction:
              "outbound",
            nearbyStops:
              candidate.nearbyStops,
          },
          {
            lineId:
              candidate.lineId,
            direction:
              "inbound",
            nearbyStops:
              candidate.nearbyStops,
          },
        ]
      );

    const analysed =
      await mapWithConcurrency(
        jobs,
        AUTO_CONCURRENCY,
        async (job) => {
          const result =
            await analyseCandidateDirection(
              job.lineId,
              job.direction,
              incident,
              radius
            );

          if (!result) {
            return null;
          }

          return {
            ...result,
            nearbyStops:
              job.nearbyStops,
          };
        }
      );

    const detectedRoutes =
      analysed
        .filter(
          (item) =>
            item
              .distanceFromRouteMetres <=
            radius
        )
        .sort(
          (a, b) =>
            a
              .distanceFromRouteMetres -
            b
              .distanceFromRouteMetres
        );

    const response = {
      success: true,
      cached: false,
      incident: {
        id: incident.id,
        location:
          incident.location,
        severity:
          incident.severity,
        category:
          incident.category,
        status:
          incident.status,
        comments:
          incident.comments,
        currentUpdate:
          incident.currentUpdate,
        coordinates,
      },
      analysis: {
        routeAnalysisRadiusMetres:
          radius,
        nearbyStopRadiusMetres:
          stopSearchRadius,
        nearbyStops:
          nearbyStops.length,
        candidateRoutes:
          candidateLines.length,
        detectedRoutes:
          detectedRoutes.length,
        highConfidenceRoutes:
          detectedRoutes.filter(
            (item) =>
              item.confidence ===
              "HIGH"
          ).length,
        automaticProposalCandidates:
          detectedRoutes.filter(
            (item) =>
              item
                .autoProposalEligible
          ).length,
      },
      detectedRoutes,
    };

    setCached(
      detectionCache,
      cacheKey,
      response,
      DETECTION_CACHE_MS
    );

    return res.json(
      response
    );
  } catch (error) {
    console.error(
      "Automatic affected-route detection error:",
      error.originalError
        ?.response?.data ||
        error.response?.data ||
        error.message
    );

    if (
      error?.statusCode === 429 ||
      isRateLimitError(error)
    ) {
      const seconds =
        error.retryAfter ||
        getRetrySeconds(error);

      res.set(
        "Retry-After",
        String(seconds)
      );

      return res
        .status(429)
        .json({
          success: false,
          rateLimited: true,
          retryAfter:
            seconds,
          message:
            `TfL is temporarily rate limiting requests. Please try again in ${seconds} seconds.`,
        });
    }

    return res
      .status(500)
      .json({
        success: false,
        message:
          error.response?.data
            ?.message ||
          error.message ||
          "Unable to automatically detect affected bus routes.",
      });
  }
}

export async function analyseRoute(
  req,
  res
) {
  try {
    const { lineId } =
      req.params;

    const direction =
      req.query.direction ===
      "inbound"
        ? "inbound"
        : "outbound";

    const threshold =
      Number(
        req.query.threshold
      ) || 150;

    if (!lineId) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "A bus route number is required.",
        });
    }

    const [
      routeData,
      geometryData,
      disruptions,
    ] = await Promise.all([
      getCachedRouteData(
        lineId
      ),
      getCachedRouteGeometry(
        lineId,
        direction
      ),
      getCachedDisruptions(),
    ]);

    const routeSequences =
      normaliseRouteSequence(
        routeData,
        lineId
      );

    const totalStops =
      routeSequences.reduce(
        (total, sequence) =>
          total +
          (
            sequence.stops || []
          ).length,
        0
      );

    if (
      !routeSequences.length ||
      totalStops === 0
    ) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            `Bus route ${lineId} was found, but TfL did not return usable stop data for this route.`,
        });
    }

    const geometryResult =
      resolveRouteGeometry(
        geometryData,
        routeSequences,
        direction
      );

    const routeCoordinates =
      geometryResult.coordinates;

    if (
      routeCoordinates.length <
      2
    ) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            `Bus route ${lineId} was found, but BusControl could not obtain enough geographic data to analyse it.`,
        });
    }

    const affectedIncidents =
      findIncidentsNearRoute(
        routeSequences,
        disruptions,
        threshold
      );

    const routeGeometryIncidents =
      findIncidentsNearRouteGeometry(
        routeCoordinates,
        disruptions,
        75
      );

    return res.json({
      success: true,
      route: {
        lineId,
        direction,
        sequenceCount:
          routeSequences.length,
        totalStops,
        geometryPoints:
          routeCoordinates.length,
        geometrySource:
          geometryResult.source,
        geometryFallbackUsed:
          geometryResult.fallbackUsed,
      },
      analysis: {
        stopProximityThresholdMetres:
          threshold,
        routeGeometryThresholdMetres:
          75,
        totalRoadDisruptions:
          disruptions.length,
        possibleAffectedIncidents:
          affectedIncidents.length,
        routeGeometryIncidents:
          routeGeometryIncidents.length,
      },
      geometry: {
        type: "LineString",
        coordinates:
          routeCoordinates,
      },
      sequences:
        routeSequences,
      affectedIncidents,
      routeGeometryIncidents,
    });
  } catch (error) {
    console.error(
      "Route analysis error:",
      error.originalError
        ?.response?.data ||
        error.response?.data ||
        error.message
    );

    if (
      error?.statusCode === 429 ||
      isRateLimitError(error)
    ) {
      const seconds =
        error.retryAfter ||
        getRetrySeconds(error);

      return res
        .status(429)
        .json({
          success: false,
          rateLimited: true,
          retryAfter:
            seconds,
          message:
            `TfL is temporarily rate limiting requests. Please try again in ${seconds} seconds.`,
        });
    }

    return res
      .status(500)
      .json({
        success: false,
        message:
          error.response?.data
            ?.message ||
          error.message ||
          "Unable to analyse the bus route.",
      });
  }
}

export async function analyseIncidentOnRoute(
  req,
  res
) {
  try {
    const {
      lineId,
      incidentId,
    } = req.params;

    const direction =
      req.query.direction ===
      "inbound"
        ? "inbound"
        : "outbound";

    const radius =
      Number(
        req.query.radius
      ) || 250;

    if (
      !lineId ||
      !incidentId
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "A bus route and incident are required.",
        });
    }

    const [
      routeData,
      geometryData,
      disruptions,
    ] = await Promise.all([
      getCachedRouteData(
        lineId
      ),
      getCachedRouteGeometry(
        lineId,
        direction
      ),
      getCachedDisruptions(),
    ]);

    const incident =
      disruptions.find(
        (item) =>
          item.id === incidentId
      );

    if (!incident) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            "The TfL incident was not found.",
        });
    }

    const routeSequences =
      normaliseRouteSequence(
        routeData,
        lineId
      );

    const totalStops =
      routeSequences.reduce(
        (total, sequence) =>
          total +
          (
            sequence.stops || []
          ).length,
        0
      );

    if (
      !routeSequences.length ||
      totalStops === 0
    ) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            `Route ${lineId} was found, but TfL did not return usable stop data for the selected direction.`,
        });
    }

    const geometryResult =
      resolveRouteGeometry(
        geometryData,
        routeSequences,
        direction
      );

    const routeCoordinates =
      geometryResult.coordinates;

    if (
      routeCoordinates.length <
      2
    ) {
      return res
        .status(404)
        .json({
          success: false,
          message:
            `Route ${lineId} was found, but BusControl could not obtain enough geographic data to analyse this route.`,
        });
    }

    const affectedSection =
      analyseAffectedRouteSection(
        routeSequences,
        routeCoordinates,
        incident,
        radius
      );

    if (!affectedSection) {
      return res
        .status(422)
        .json({
          success: false,
          message:
            "The affected route section could not be analysed.",
        });
    }

    const isLikelyAffected =
      affectedSection
        .distanceFromRouteMetres <=
      radius;

    return res.json({
      success: true,
      route: {
        lineId,
        direction,
        sequenceCount:
          routeSequences.length,
        totalStops,
        geometryPoints:
          routeCoordinates.length,
        geometrySource:
          geometryResult.source,
        geometryFallbackUsed:
          geometryResult.fallbackUsed,
      },
      incident: {
        id: incident.id,
        location:
          incident.location,
        severity:
          incident.severity,
        category:
          incident.category,
        status:
          incident.status,
        comments:
          incident.comments,
        currentUpdate:
          incident.currentUpdate,
      },
      analysis: {
        radiusMetres:
          radius,
        distanceFromRouteMetres:
          affectedSection
            .distanceFromRouteMetres,
        likelyAffected:
          isLikelyAffected,
        confidence:
          geometryResult
            .fallbackUsed
            ? "PROVISIONAL"
            : "GEOMETRY_MATCH",
        message:
          isLikelyAffected
            ? geometryResult
                .fallbackUsed
              ? `The incident is approximately ${affectedSection.distanceFromRouteMetres} metres from the route corridor reconstructed from TfL stop data. Controller verification is required.`
              : `The incident is approximately ${affectedSection.distanceFromRouteMetres} metres from the TfL route geometry.`
            : `The incident is approximately ${affectedSection.distanceFromRouteMetres} metres from route ${lineId}, outside the ${radius}-metre analysis radius.`,
      },
      geometry: {
        type: "LineString",
        coordinates:
          routeCoordinates,
      },
      affectedSection,
    });
  } catch (error) {
    console.error(
      "Incident route analysis error:",
      error.originalError
        ?.response?.data ||
        error.response?.data ||
        error.message
    );

    if (
      error?.statusCode === 429 ||
      isRateLimitError(error)
    ) {
      const seconds =
        error.retryAfter ||
        getRetrySeconds(error);

      return res
        .status(429)
        .json({
          success: false,
          rateLimited: true,
          retryAfter:
            seconds,
          message:
            `TfL is temporarily rate limiting requests. Please try again in ${seconds} seconds.`,
        });
    }

    return res
      .status(500)
      .json({
        success: false,
        message:
          error.response?.data
            ?.message ||
          error.message ||
          "Unable to analyse the incident against the bus route.",
      });
  }
}