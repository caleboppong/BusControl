import axios from "axios";

const GOOGLE_ROUTES_URL =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

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

function buildContinuousInstructions(route) {
  const legs = Array.isArray(route?.legs) ? route.legs : [];
  const instructions = [];

  legs.forEach((leg) => {
    const steps = Array.isArray(leg?.steps) ? leg.steps : [];

    steps.forEach((step) => {
      const instruction = cleanInstruction(
        step?.navigationInstruction?.instructions,
      );

      if (!instruction) {
        return;
      }

      const previous = instructions[instructions.length - 1];

      if (previous?.toLowerCase() === instruction.toLowerCase()) {
        return;
      }

      instructions.push(instruction);
    });
  });

  return instructions;
}

async function computeRoute(points, { intermediatesAreVia = true } = {}) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured on the server.");
  }

  if (!Array.isArray(points) || points.length < 2) {
    throw new Error(
      "At least two valid coordinates are required to generate a driving route.",
    );
  }

  const validPoints = points.filter(isCoordinate);

  if (validPoints.length !== points.length) {
    throw new Error("One or more diversion coordinates are invalid.");
  }

  const origin = toWaypoint(validPoints[0]);
  const destination = toWaypoint(validPoints[validPoints.length - 1]);
  const intermediatePoints = validPoints.slice(1, -1);
  const intermediates = intermediatePoints.map((point) =>
    toWaypoint(point, intermediatesAreVia),
  );

  const requestBody = {
    origin,
    destination,
    ...(intermediates.length ? { intermediates } : {}),
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
    polylineEncoding: "GEO_JSON_LINESTRING",
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
    const response = await axios.post(GOOGLE_ROUTES_URL, requestBody, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      timeout: 20000,
    });

    data = response.data;
  } catch (error) {
    const googleError = error?.response?.data?.error;

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

    const details = Array.isArray(googleError?.details)
      ? googleError.details.map((detail) => JSON.stringify(detail)).join(" | ")
      : "";

    throw new Error(
      [googleError?.message, details].filter(Boolean).join(" - ") ||
        "Google Routes could not generate a diversion route.",
    );
  }

  const route = data?.routes?.[0];

  if (!route) {
    throw new Error("Google Routes could not generate a diversion route.");
  }

  const googleGeometry = route?.polyline?.geoJsonLinestring;
  const coordinates = googleGeometry?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error("Google Routes returned a route without usable geometry.");
  }

  return {
    ...route,
    geometry: {
      type: "LineString",
      coordinates,
    },
    distance: Number(route.distanceMeters) || 0,
    duration: parseDurationSeconds(route.duration),
    busControlInstructions: buildContinuousInstructions(route),
  };
}

function appendCoordinates(target, coordinates) {
  if (!Array.isArray(coordinates)) {
    return;
  }

  coordinates.forEach((coordinate, index) => {
    if (!isCoordinate(coordinate)) {
      return;
    }

    if (
      index === 0 &&
      target.length &&
      Number(target[target.length - 1][0]) === Number(coordinate[0]) &&
      Number(target[target.length - 1][1]) === Number(coordinate[1])
    ) {
      return;
    }

    target.push([Number(coordinate[0]), Number(coordinate[1])]);
  });
}

export async function getDrivingRoute(points) {
  const route = await computeRoute(points, {
    intermediatesAreVia: true,
  });

  const intermediatePoints = points.slice(1, -1);

  return {
    ...route,
    routingProvider: "GOOGLE",
    controllerWaypoints: intermediatePoints,
    routeSource: intermediatePoints.length
      ? "CONTROLLER_WAYPOINTS"
      : "AUTOMATIC",
  };
}

/*
 * Controller override routing is deliberately different from normal routing.
 *
 * Every pair of controller-selected points is calculated as its own Google
 * route segment. Google therefore cannot ignore a middle controller point and
 * optimise a materially different route across the complete diversion.
 *
 * If Google cannot calculate one of the selected movements (for example a
 * local bus exemption that its road restrictions do not recognise), the
 * failed segment is returned to BusControl. The UI can then require an
 * explicit controller override instead of silently choosing another road.
 */
export async function getControllerOverrideRoute(points) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error(
      "At least a diversion start point and rejoin point are required.",
    );
  }

  if (!points.every(isCoordinate)) {
    throw new Error("One or more controller diversion coordinates are invalid.");
  }

  const geometryCoordinates = [];
  const instructions = [];
  const segments = [];
  const failedSegments = [];

  let distance = 0;
  let duration = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];

    try {
      const route = await computeRoute([from, to], {
        intermediatesAreVia: false,
      });

      appendCoordinates(
        geometryCoordinates,
        route.geometry?.coordinates || [],
      );

      distance += Number(route.distance) || 0;
      duration += Number(route.duration) || 0;

      const segmentInstructions = route.busControlInstructions || [];

      segmentInstructions.forEach((instruction) => {
        const previous = instructions[instructions.length - 1];

        if (previous?.toLowerCase() !== instruction.toLowerCase()) {
          instructions.push(instruction);
        }
      });

      segments.push({
        index,
        from,
        to,
        status: "ROUTED",
        geometry: route.geometry,
        distanceMetres: Math.round(Number(route.distance) || 0),
        durationSeconds: Math.round(Number(route.duration) || 0),
        instructions: segmentInstructions,
      });
    } catch (error) {
      /*
       * Do not let Google silently substitute another controller movement.
       * Preserve the selected segment as a straight provisional override line.
       * The controller must explicitly confirm the local exemption before the
       * revision can be accepted.
       */
      appendCoordinates(geometryCoordinates, [from, to]);

      const failed = {
        index,
        from,
        to,
        status: "REQUIRES_CONTROLLER_OVERRIDE",
        message:
          error.message ||
          "Google Routes could not reproduce this controller-selected movement.",
      };

      failedSegments.push(failed);
      segments.push(failed);
    }
  }

  if (geometryCoordinates.length < 2) {
    throw new Error("Unable to build the controller diversion geometry.");
  }

  return {
    geometry: {
      type: "LineString",
      coordinates: geometryCoordinates,
    },
    distance,
    duration,
    busControlInstructions: instructions,
    routingProvider: "GOOGLE_SEGMENTED",
    controllerWaypoints: points.slice(1, -1),
    controllerPoints: points,
    routeSource: failedSegments.length
      ? "CONTROLLER_OVERRIDE_REQUIRED"
      : "CONTROLLER_DRAWN",
    requiresOverride: failedSegments.length > 0,
    failedSegments,
    segments,
  };
}