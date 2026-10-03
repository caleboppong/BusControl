import axios from "axios";

const GOOGLE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

const GOOGLE_ROADS_URL =
  "https://roads.googleapis.com/v1/snapToRoads";

const DETOUR_RATIO_THRESHOLD = 3;
const DETOUR_EXTRA_METRES_THRESHOLD = 750;
const MIN_DIRECT_DISTANCE_FOR_RATIO_CHECK = 100;

// Google recommends points describing the road trace to be reasonably close.
// We use a slightly stricter operational threshold than the documented
// approximate 300 m recommendation.
const MAX_CONTROLLER_POINT_SPACING_METRES = 280;

function isCoordinate(point) {
  return (
    Array.isArray(point) &&
    point.length >= 2 &&
    Number.isFinite(Number(point[0])) &&
    Number.isFinite(Number(point[1]))
  );
}

function cleanInstruction(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function toWaypoint([longitude, latitude], via = false) {
  return {
    location: {
      latLng: {
        latitude: Number(latitude),
        longitude: Number(longitude),
      },
    },
    ...(via ? { via: true } : {}),
  };
}

function parseDurationSeconds(value) {
  if (typeof value !== "string") {
    return 0;
  }

  const seconds = Number(value.replace("s", ""));

  return Number.isFinite(seconds) ? seconds : 0;
}

function degreesToRadians(value) {
  return (Number(value) * Math.PI) / 180;
}

function directDistanceMetres(from, to) {
  if (!isCoordinate(from) || !isCoordinate(to)) {
    return 0;
  }

  const [longitude1, latitude1] = from.map(Number);
  const [longitude2, latitude2] = to.map(Number);

  const earthRadiusMetres = 6371000;

  const latitudeDifference =
    degreesToRadians(latitude2 - latitude1);

  const longitudeDifference =
    degreesToRadians(longitude2 - longitude1);

  const latitude1Radians =
    degreesToRadians(latitude1);

  const latitude2Radians =
    degreesToRadians(latitude2);

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(latitude1Radians) *
      Math.cos(latitude2Radians) *
      Math.sin(longitudeDifference / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    );

  return earthRadiusMetres * c;
}

function analyseSegmentDeviation(
  from,
  to,
  routedDistanceMetres,
) {
  const directDistance =
    directDistanceMetres(from, to);

  const routedDistance =
    Number(routedDistanceMetres) || 0;

  if (!directDistance || !routedDistance) {
    return {
      directDistanceMetres:
        Math.round(directDistance || 0),

      routedDistanceMetres:
        Math.round(routedDistance || 0),

      extraDistanceMetres: 0,
      detourRatio: 1,
      excessiveDetour: false,
    };
  }

  const extraDistance =
    Math.max(
      0,
      routedDistance - directDistance,
    );

  const detourRatio =
    routedDistance / directDistance;

  const excessiveDetour =
    directDistance >=
      MIN_DIRECT_DISTANCE_FOR_RATIO_CHECK &&
    detourRatio >=
      DETOUR_RATIO_THRESHOLD &&
    extraDistance >=
      DETOUR_EXTRA_METRES_THRESHOLD;

  return {
    directDistanceMetres:
      Math.round(directDistance),

    routedDistanceMetres:
      Math.round(routedDistance),

    extraDistanceMetres:
      Math.round(extraDistance),

    detourRatio:
      Number(detourRatio.toFixed(2)),

    excessiveDetour,
  };
}

function buildContinuousInstructions(route) {
  const legs =
    Array.isArray(route?.legs)
      ? route.legs
      : [];

  const instructions = [];

  legs.forEach((leg) => {
    const steps =
      Array.isArray(leg?.steps)
        ? leg.steps
        : [];

    steps.forEach((step) => {
      const instruction =
        cleanInstruction(
          step?.navigationInstruction
            ?.instructions,
        );

      if (!instruction) {
        return;
      }

      const previous =
        instructions[
          instructions.length - 1
        ];

      if (
        previous?.toLowerCase() ===
        instruction.toLowerCase()
      ) {
        return;
      }

      instructions.push(instruction);
    });
  });

  return instructions;
}

async function computeRoute(
  points,
  {
    intermediatesAreVia = true,
  } = {},
) {
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY is not configured on the server.",
    );
  }

  if (
    !Array.isArray(points) ||
    points.length < 2
  ) {
    throw new Error(
      "At least two valid coordinates are required to generate a driving route.",
    );
  }

  const validPoints =
    points.filter(isCoordinate);

  if (
    validPoints.length !== points.length
  ) {
    throw new Error(
      "One or more diversion coordinates are invalid.",
    );
  }

  const origin =
    toWaypoint(validPoints[0]);

  const destination =
    toWaypoint(
      validPoints[
        validPoints.length - 1
      ],
    );

  const intermediatePoints =
    validPoints.slice(1, -1);

  const intermediates =
    intermediatePoints.map((point) =>
      toWaypoint(
        point,
        intermediatesAreVia,
      ),
    );

  const requestBody = {
    origin,
    destination,

    ...(intermediates.length
      ? { intermediates }
      : {}),

    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,

    routeModifiers: {
      avoidTolls: false,
      avoidHighways: false,
      avoidFerries: true,
    },

    languageCode: "en-GB",
    regionCode: "GB",
    units: "METRIC",

    polylineQuality: "HIGH_QUALITY",
    polylineEncoding:
      "GEO_JSON_LINESTRING",
  };

  const fieldMask = [
    "routes.distanceMeters",
    "routes.duration",
    "routes.staticDuration",
    "routes.polyline.geoJsonLinestring",
    "routes.legs.distanceMeters",
    "routes.legs.duration",
    "routes.legs.staticDuration",
    "routes.legs.steps.distanceMeters",
    "routes.legs.steps.staticDuration",
    "routes.legs.steps.navigationInstruction",
    "routes.legs.steps.startLocation",
    "routes.legs.steps.endLocation",
  ].join(",");

  let data;

  try {
    const response =
      await axios.post(
        GOOGLE_ROUTES_URL,
        requestBody,
        {
          headers: {
            "Content-Type":
              "application/json",

            "X-Goog-Api-Key":
              apiKey,

            "X-Goog-FieldMask":
              fieldMask,
          },

          timeout: 20000,
        },
      );

    data = response.data;
  } catch (error) {
    const googleError =
      error?.response?.data?.error;

    console.error(
      "Google Routes API error:",
      JSON.stringify(
        error?.response?.data || {
          message: error.message,
        },
        null,
        2,
      ),
    );

    const details =
      Array.isArray(
        googleError?.details,
      )
        ? googleError.details
            .map((detail) =>
              JSON.stringify(detail),
            )
            .join(" | ")
        : "";

    throw new Error(
      [
        googleError?.message,
        details,
      ]
        .filter(Boolean)
        .join(" - ") ||
        "Google Routes could not generate a diversion route.",
    );
  }

  const route =
    data?.routes?.[0];

  if (!route) {
    throw new Error(
      "Google Routes could not generate a diversion route.",
    );
  }

  const googleGeometry =
    route?.polyline
      ?.geoJsonLinestring;

  const coordinates =
    googleGeometry?.coordinates;

  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2
  ) {
    throw new Error(
      "Google Routes returned a route without usable geometry.",
    );
  }

  return {
    ...route,

    geometry: {
      type: "LineString",
      coordinates,
    },

    distance:
      Number(route.distanceMeters) || 0,

    duration:
      parseDurationSeconds(
        route.duration,
      ),

    busControlInstructions:
      buildContinuousInstructions(
        route,
      ),
  };
}

function appendCoordinates(
  target,
  coordinates,
) {
  if (!Array.isArray(coordinates)) {
    return;
  }

  coordinates.forEach(
    (coordinate, index) => {
      if (!isCoordinate(coordinate)) {
        return;
      }

      if (
        index === 0 &&
        target.length &&
        Number(
          target[
            target.length - 1
          ][0],
        ) ===
          Number(coordinate[0]) &&
        Number(
          target[
            target.length - 1
          ][1],
        ) ===
          Number(coordinate[1])
      ) {
        return;
      }

      target.push([
        Number(coordinate[0]),
        Number(coordinate[1]),
      ]);
    },
  );
}

function appendInstructions(
  target,
  newInstructions,
) {
  if (
    !Array.isArray(newInstructions)
  ) {
    return;
  }

  newInstructions.forEach(
    (instruction) => {
      const cleaned =
        cleanInstruction(instruction);

      if (!cleaned) {
        return;
      }

      const previous =
        target[target.length - 1];

      if (
        previous?.toLowerCase() ===
        cleaned.toLowerCase()
      ) {
        return;
      }

      target.push(cleaned);
    },
  );
}

function geometryDistanceMetres(
  coordinates,
) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2
  ) {
    return 0;
  }

  let total = 0;

  for (
    let index = 0;
    index < coordinates.length - 1;
    index += 1
  ) {
    total +=
      directDistanceMetres(
        coordinates[index],
        coordinates[index + 1],
      );
  }

  return total;
}

function validateControllerSpacing(
  points,
) {
  const problems = [];

  for (
    let index = 0;
    index < points.length - 1;
    index += 1
  ) {
    const distance =
      directDistanceMetres(
        points[index],
        points[index + 1],
      );

    if (
      distance >
      MAX_CONTROLLER_POINT_SPACING_METRES
    ) {
      problems.push({
        index,

        from:
          points[index],

        to:
          points[index + 1],

        distanceMetres:
          Math.round(distance),
      });
    }
  }

  return problems;
}

async function snapControllerTraceToRoads(
  points,
) {
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY is not configured on the server.",
    );
  }

  if (
    !Array.isArray(points) ||
    points.length < 2 ||
    !points.every(isCoordinate)
  ) {
    throw new Error(
      "At least two valid controller road points are required.",
    );
  }

  if (points.length > 100) {
    throw new Error(
      "A controller road trace cannot contain more than 100 points.",
    );
  }

  const spacingProblems =
    validateControllerSpacing(points);

  if (spacingProblems.length) {
    const first =
      spacingProblems[0];

    const error =
      new Error(
        `Controller road points ${first.index + 1} and ${first.index + 2} are approximately ${first.distanceMetres} metres apart. Add more points along the intended road before calculating the override.`,
      );

    error.code =
      "CONTROLLER_TRACE_TOO_SPARSE";

    error.spacingProblems =
      spacingProblems;

    throw error;
  }

  // Roads API expects latitude,longitude.
  const path =
    points
      .map(
        ([longitude, latitude]) =>
          `${Number(latitude)},${Number(longitude)}`,
      )
      .join("|");

  let data;

  try {
    const response =
      await axios.get(
        GOOGLE_ROADS_URL,
        {
          params: {
            path,
            interpolate: true,
            key: apiKey,
          },

          timeout: 20000,
        },
      );

    data = response.data;
  } catch (error) {
    console.error(
      "Google Roads API error:",
      JSON.stringify(
        error?.response?.data || {
          message: error.message,
        },
        null,
        2,
      ),
    );

    throw new Error(
      error?.response?.data?.error
        ?.message ||
        "Google Roads could not match the controller trace to the road network.",
    );
  }

  const snappedPoints =
    Array.isArray(data?.snappedPoints)
      ? data.snappedPoints
      : [];

  const coordinates =
    snappedPoints
      .map((item) => {
        const latitude =
          Number(
            item?.location?.latitude,
          );

        const longitude =
          Number(
            item?.location?.longitude,
          );

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return null;
        }

        return [
          longitude,
          latitude,
        ];
      })
      .filter(Boolean);

  if (coordinates.length < 2) {
    const error =
      new Error(
        "Google Roads could not establish road-following geometry from the controller trace. Add more points along the intended roads and calculate again.",
      );

    error.code =
      "CONTROLLER_TRACE_NOT_MATCHED";

    throw error;
  }

  const snappedInputIndexes =
    new Set(
      snappedPoints
        .map(
          (item) =>
            item.originalIndex,
        )
        .filter(
          (value) =>
            Number.isInteger(value),
        ),
    );

  // Every controller point should have a corresponding
  // snapped point. Interpolated points do not have originalIndex.
  const unmatchedInputIndexes =
    points
      .map((_, index) => index)
      .filter(
        (index) =>
          !snappedInputIndexes.has(index),
      );

  if (unmatchedInputIndexes.length) {
    const error =
      new Error(
        "Google Roads could not confidently match every controller point to the road network. Add points more precisely along the intended road and calculate again.",
      );

    error.code =
      "CONTROLLER_TRACE_PARTIALLY_MATCHED";

    error.unmatchedInputIndexes =
      unmatchedInputIndexes;

    throw error;
  }

  return {
    geometry: {
      type: "LineString",
      coordinates,
    },

    coordinates,

    distance:
      geometryDistanceMetres(
        coordinates,
      ),

    snappedPointCount:
      coordinates.length,

    controllerPointCount:
      points.length,

    provider:
      "GOOGLE_ROADS",

    interpolated: true,
  };
}

export async function getDrivingRoute(
  points,
) {
  const route =
    await computeRoute(points, {
      intermediatesAreVia: true,
    });

  const intermediatePoints =
    points.slice(1, -1);

  return {
    ...route,

    routingProvider: "GOOGLE",

    controllerWaypoints:
      intermediatePoints,

    routeSource:
      intermediatePoints.length
        ? "CONTROLLER_WAYPOINTS"
        : "AUTOMATIC",
  };
}

export async function getControllerOverrideRoute(
  points,
) {
  if (
    !Array.isArray(points) ||
    points.length < 2
  ) {
    throw new Error(
      "At least a diversion start point and rejoin point are required.",
    );
  }

  if (!points.every(isCoordinate)) {
    throw new Error(
      "One or more controller diversion coordinates are invalid.",
    );
  }

  /*
   * First obtain a road-matched representation of the
   * controller's complete intended trace.
   *
   * This is NOT used to decide where the bus should go.
   * The controller's clicks establish that intention.
   * Roads API is used only to replace unsafe straight
   * point-to-point geometry with road-following geometry.
   */
  let controllerRoadTrace;

  try {
    controllerRoadTrace =
      await snapControllerTraceToRoads(
        points,
      );
  } catch (error) {
    error.message =
      error.message ||
      "Unable to verify the controller road trace.";

    throw error;
  }

  const geometryCoordinates = [];
  const instructions = [];
  const segments = [];
  const failedSegments = [];

  let distance = 0;
  let duration = 0;

  /*
   * We still test each controller-selected movement with
   * Google Routes independently.
   *
   * Normal sections use Routes geometry/instructions.
   * Sections where Routes produces an excessive detour
   * remain explicit controller overrides.
   *
   * The complete Roads API trace is retained as the
   * authoritative road-following geometry whenever any
   * override is required.
   */
  for (
    let index = 0;
    index < points.length - 1;
    index += 1
  ) {
    const from =
      points[index];

    const to =
      points[index + 1];

    try {
      const route =
        await computeRoute(
          [from, to],
          {
            intermediatesAreVia:
              false,
          },
        );

      const routeDistance =
        Number(route.distance) || 0;

      const routeDuration =
        Number(route.duration) || 0;

      const deviation =
        analyseSegmentDeviation(
          from,
          to,
          routeDistance,
        );

      if (
        deviation.excessiveDetour
      ) {
        const flagged = {
          index,
          from,
          to,

          status:
            "REQUIRES_CONTROLLER_OVERRIDE",

          reason:
            "EXCESSIVE_GOOGLE_DETOUR",

          message:
            `Google Routes produced a ${deviation.routedDistanceMetres} m route ` +
            `between controller points approximately ${deviation.directDistanceMetres} m apart. ` +
            `The controller trace has been road-matched using Google Roads and requires explicit operational verification.`,

          directDistanceMetres:
            deviation.directDistanceMetres,

          googleDistanceMetres:
            deviation.routedDistanceMetres,

          extraDistanceMetres:
            deviation.extraDistanceMetres,

          detourRatio:
            deviation.detourRatio,

          googleGeometry:
            route.geometry,

          googleInstructions:
            route.busControlInstructions ||
            [],

          overrideGeometrySource:
            "GOOGLE_ROADS_CONTROLLER_TRACE",
        };

        failedSegments.push(
          flagged,
        );

        segments.push(
          flagged,
        );

        continue;
      }

      appendCoordinates(
        geometryCoordinates,
        route.geometry
          ?.coordinates || [],
      );

      distance += routeDistance;
      duration += routeDuration;

      const segmentInstructions =
        route.busControlInstructions ||
        [];

      appendInstructions(
        instructions,
        segmentInstructions,
      );

      segments.push({
        index,
        from,
        to,

        status: "ROUTED",

        geometry:
          route.geometry,

        distanceMetres:
          Math.round(
            routeDistance,
          ),

        durationSeconds:
          Math.round(
            routeDuration,
          ),

        instructions:
          segmentInstructions,

        directDistanceMetres:
          deviation
            .directDistanceMetres,

        detourRatio:
          deviation.detourRatio,
      });
    } catch (error) {
      const directDistance =
        Math.round(
          directDistanceMetres(
            from,
            to,
          ),
        );

      const failed = {
        index,
        from,
        to,

        status:
          "REQUIRES_CONTROLLER_OVERRIDE",

        reason:
          "GOOGLE_ROUTE_UNAVAILABLE",

        message:
          `${error.message || "Google Routes could not reproduce this movement."} ` +
          `The controller trace has been road-matched using Google Roads and requires explicit operational verification.`,

        directDistanceMetres:
          directDistance,

        overrideGeometrySource:
          "GOOGLE_ROADS_CONTROLLER_TRACE",
      };

      failedSegments.push(
        failed,
      );

      segments.push(
        failed,
      );
    }
  }

  const requiresOverride =
    failedSegments.length > 0;

  let finalGeometry;
  let finalDistance;

  if (requiresOverride) {
    /*
     * Critical safety behaviour:
     *
     * We DO NOT concatenate [from, to] straight lines.
     * We DO NOT use Google's excessive detour.
     *
     * The controller's road-matched Roads API trace is
     * the geometry presented for explicit override review.
     */
    finalGeometry =
      controllerRoadTrace.geometry;

    finalDistance =
      Math.round(
        controllerRoadTrace.distance,
      );
  } else {
    if (
      geometryCoordinates.length < 2
    ) {
      throw new Error(
        "Unable to build the controller diversion geometry.",
      );
    }

    finalGeometry = {
      type: "LineString",
      coordinates:
        geometryCoordinates,
    };

    finalDistance =
      Math.round(distance);
  }

  return {
    geometry:
      finalGeometry,

    distance:
      finalDistance,

    /*
     * Duration remains based only on successfully routed
     * Google sections. We deliberately do not invent a
     * travel time for controller-overridden movements.
     */
    duration:
      Math.round(duration),

    busControlInstructions:
      instructions,

    routingProvider:
      requiresOverride
        ? "GOOGLE_ROADS_OVERRIDE"
        : "GOOGLE_SEGMENTED",

    controllerWaypoints:
      points.slice(1, -1),

    controllerPoints:
      points,

    routeSource:
      requiresOverride
        ? "CONTROLLER_OVERRIDE_REQUIRED"
        : "CONTROLLER_DRAWN",

    requiresOverride,

    failedSegments,

    segments,

    controllerRoadTrace:
      requiresOverride
        ? {
            geometry:
              controllerRoadTrace
                .geometry,

            distanceMetres:
              Math.round(
                controllerRoadTrace
                  .distance,
              ),

            snappedPointCount:
              controllerRoadTrace
                .snappedPointCount,

            controllerPointCount:
              controllerRoadTrace
                .controllerPointCount,

            provider:
              controllerRoadTrace
                .provider,

            interpolated:
              controllerRoadTrace
                .interpolated,
          }
        : null,

    routingReview: {
      required:
        requiresOverride,

      flaggedSegmentCount:
        failedSegments.length,

      totalSegmentCount:
        points.length - 1,

      detourRatioThreshold:
        DETOUR_RATIO_THRESHOLD,

      detourExtraMetresThreshold:
        DETOUR_EXTRA_METRES_THRESHOLD,

      maxControllerPointSpacingMetres:
        MAX_CONTROLLER_POINT_SPACING_METRES,

      overrideGeometryProvider:
        requiresOverride
          ? "GOOGLE_ROADS"
          : null,
    },
  };
}