function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getDistanceInMetres(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;

  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) *
      Math.cos(φ2) *
      Math.sin(Δλ / 2) *
      Math.sin(Δλ / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadius * c;
}

export function normaliseRouteSequence(data, lineId) {
  const sequences = Array.isArray(data?.stopPointSequences)
    ? data.stopPointSequences
    : [];

  return sequences.map((sequence, index) => {
    const stops = Array.isArray(sequence.stopPoint)
      ? sequence.stopPoint
          .map((stop) => ({
            id: stop.id,
            name: stop.name,
            latitude: toNumber(stop.lat),
            longitude: toNumber(stop.lon),
          }))
          .filter(
            (stop) =>
              stop.latitude !== null &&
              stop.longitude !== null
          )
      : [];

    return {
      id: `${lineId}-${index}`,
      lineId,
      direction: sequence.direction || null,
      branchId: sequence.branchId ?? index,
      nextBranchIds: sequence.nextBranchIds || [],
      previousBranchIds:
        sequence.prevBranchIds || [],
      stops,
    };
  });
}

function coordinateKey(coordinate) {
  if (!Array.isArray(coordinate)) {
    return "";
  }

  return `${Number(coordinate[0]).toFixed(6)},${Number(
    coordinate[1]
  ).toFixed(6)}`;
}

function removeConsecutiveDuplicateCoordinates(coordinates) {
  const cleaned = [];

  for (const coordinate of coordinates) {
    if (
      !Array.isArray(coordinate) ||
      coordinate.length < 2
    ) {
      continue;
    }

    const longitude = toNumber(coordinate[0]);
    const latitude = toNumber(coordinate[1]);

    if (
      longitude === null ||
      latitude === null
    ) {
      continue;
    }

    const nextCoordinate = [
      longitude,
      latitude,
    ];

    const previous =
      cleaned[cleaned.length - 1];

    if (
      previous &&
      coordinateKey(previous) ===
        coordinateKey(nextCoordinate)
    ) {
      continue;
    }

    cleaned.push(nextCoordinate);
  }

  return cleaned;
}

function extractCoordinates(value, output) {
  if (!value) {
    return;
  }

  let parsed = value;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return;
    }
  }

  if (!Array.isArray(parsed)) {
    return;
  }

  if (
    parsed.length >= 2 &&
    Number.isFinite(Number(parsed[0])) &&
    Number.isFinite(Number(parsed[1]))
  ) {
    output.push([
      Number(parsed[0]),
      Number(parsed[1]),
    ]);

    return;
  }

  for (const child of parsed) {
    extractCoordinates(child, output);
  }
}

export function normaliseRouteGeometry(data) {
  const coordinates = [];

  const possibleGeometrySources = [
    data?.lineStrings,
    data?.lineString,
    data?.routeSections,
  ];

  for (const source of possibleGeometrySources) {
    if (!source) {
      continue;
    }

    if (
      source === data?.routeSections &&
      Array.isArray(source)
    ) {
      for (const section of source) {
        extractCoordinates(
          section?.lineString,
          coordinates
        );
      }

      continue;
    }

    extractCoordinates(
      source,
      coordinates
    );
  }

  return removeConsecutiveDuplicateCoordinates(
    coordinates
  );
}

export function buildRouteGeometryFromStops(
  routeSequences,
  direction = null
) {
  if (!Array.isArray(routeSequences)) {
    return [];
  }

  const normalisedDirection =
    direction?.toLowerCase();

  let selectedSequences =
    routeSequences.filter((sequence) => {
      if (!normalisedDirection) {
        return true;
      }

      if (!sequence.direction) {
        return true;
      }

      return (
        sequence.direction.toLowerCase() ===
        normalisedDirection
      );
    });

  if (!selectedSequences.length) {
    selectedSequences = routeSequences;
  }

  const coordinates = [];

  for (const sequence of selectedSequences) {
    for (const stop of sequence.stops || []) {
      if (
        Number.isFinite(stop.longitude) &&
        Number.isFinite(stop.latitude)
      ) {
        coordinates.push([
          stop.longitude,
          stop.latitude,
        ]);
      }
    }
  }

  return removeConsecutiveDuplicateCoordinates(
    coordinates
  );
}

export function resolveRouteGeometry(
  geometryData,
  routeSequences,
  direction = null
) {
  const officialGeometry =
    normaliseRouteGeometry(geometryData);

  if (officialGeometry.length >= 2) {
    return {
      coordinates: officialGeometry,
      source: "tfl-line-geometry",
      fallbackUsed: false,
    };
  }

  const stopGeometry =
    buildRouteGeometryFromStops(
      routeSequences,
      direction
    );

  if (stopGeometry.length >= 2) {
    return {
      coordinates: stopGeometry,
      source: "ordered-stop-corridor",
      fallbackUsed: true,
    };
  }

  return {
    coordinates: [],
    source: "unavailable",
    fallbackUsed: false,
  };
}

export function findIncidentsNearRoute(
  routeSequences,
  disruptions,
  thresholdMetres = 150
) {
  const results = [];

  for (const incident of disruptions) {
    const coordinates =
      incident?.geography?.coordinates;

    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      continue;
    }

    const incidentLongitude =
      toNumber(coordinates[0]);

    const incidentLatitude =
      toNumber(coordinates[1]);

    if (
      incidentLongitude === null ||
      incidentLatitude === null
    ) {
      continue;
    }

    let nearestStop = null;
    let minimumDistance = Infinity;

    for (const sequence of routeSequences) {
      for (const stop of sequence.stops) {
        const distance =
          getDistanceInMetres(
            incidentLatitude,
            incidentLongitude,
            stop.latitude,
            stop.longitude
          );

        if (distance < minimumDistance) {
          minimumDistance = distance;

          nearestStop = {
            ...stop,
            direction:
              sequence.direction,
          };
        }
      }
    }

    if (
      minimumDistance <= thresholdMetres
    ) {
      results.push({
        incident,
        distanceMetres:
          Math.round(minimumDistance),
        nearestStop,
      });
    }
  }

  return results.sort(
    (a, b) =>
      a.distanceMetres -
      b.distanceMetres
  );
}

function distancePointToSegmentMetres(
  pointLat,
  pointLon,
  startLat,
  startLon,
  endLat,
  endLon
) {
  const referenceLat =
    ((pointLat + startLat + endLat) / 3) *
    (Math.PI / 180);

  const metresPerDegreeLat = 111320;

  const metresPerDegreeLon =
    111320 * Math.cos(referenceLat);

  const px =
    pointLon * metresPerDegreeLon;

  const py =
    pointLat * metresPerDegreeLat;

  const ax =
    startLon * metresPerDegreeLon;

  const ay =
    startLat * metresPerDegreeLat;

  const bx =
    endLon * metresPerDegreeLon;

  const by =
    endLat * metresPerDegreeLat;

  const abX = bx - ax;
  const abY = by - ay;

  const apX = px - ax;
  const apY = py - ay;

  const abSquared =
    abX * abX + abY * abY;

  if (abSquared === 0) {
    return Math.sqrt(
      (px - ax) ** 2 +
        (py - ay) ** 2
    );
  }

  let t =
    (apX * abX + apY * abY) /
    abSquared;

  t = Math.max(
    0,
    Math.min(1, t)
  );

  const nearestX =
    ax + t * abX;

  const nearestY =
    ay + t * abY;

  return Math.sqrt(
    (px - nearestX) ** 2 +
      (py - nearestY) ** 2
  );
}

export function findIncidentsNearRouteGeometry(
  routeCoordinates,
  disruptions,
  thresholdMetres = 75
) {
  if (
    !Array.isArray(routeCoordinates) ||
    routeCoordinates.length < 2
  ) {
    return [];
  }

  const matches = [];

  for (const incident of disruptions) {
    const coordinates =
      incident?.geography?.coordinates;

    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      continue;
    }

    const incidentLongitude =
      toNumber(coordinates[0]);

    const incidentLatitude =
      toNumber(coordinates[1]);

    if (
      incidentLongitude === null ||
      incidentLatitude === null
    ) {
      continue;
    }

    let minimumDistance = Infinity;
    let nearestRoutePoint = null;

    for (
      let index = 0;
      index <
      routeCoordinates.length - 1;
      index += 1
    ) {
      const start =
        routeCoordinates[index];

      const end =
        routeCoordinates[index + 1];

      if (
        !Array.isArray(start) ||
        !Array.isArray(end)
      ) {
        continue;
      }

      const startLongitude =
        toNumber(start[0]);

      const startLatitude =
        toNumber(start[1]);

      const endLongitude =
        toNumber(end[0]);

      const endLatitude =
        toNumber(end[1]);

      if (
        startLongitude === null ||
        startLatitude === null ||
        endLongitude === null ||
        endLatitude === null
      ) {
        continue;
      }

      const distance =
        distancePointToSegmentMetres(
          incidentLatitude,
          incidentLongitude,
          startLatitude,
          startLongitude,
          endLatitude,
          endLongitude
        );

      if (
        distance < minimumDistance
      ) {
        minimumDistance = distance;

        nearestRoutePoint = {
          segmentIndex: index,
          start,
          end,
        };
      }
    }

    if (
      minimumDistance <= thresholdMetres
    ) {
      matches.push({
        incident,
        distanceMetres:
          Math.round(minimumDistance),
        nearestRoutePoint,
      });
    }
  }

  return matches.sort(
    (a, b) =>
      a.distanceMetres -
      b.distanceMetres
  );
}

export function analyseAffectedRouteSection(
  routeSequences,
  routeCoordinates,
  incident,
  radiusMetres = 250
) {
  const incidentCoordinates =
    incident?.geography?.coordinates;

  if (
    !Array.isArray(incidentCoordinates) ||
    incidentCoordinates.length < 2
  ) {
    return null;
  }

  if (
    !Array.isArray(routeCoordinates) ||
    routeCoordinates.length < 2
  ) {
    return null;
  }

  const incidentLongitude =
    toNumber(incidentCoordinates[0]);

  const incidentLatitude =
    toNumber(incidentCoordinates[1]);

  if (
    incidentLongitude === null ||
    incidentLatitude === null
  ) {
    return null;
  }

  let nearestSegmentIndex = null;
  let minimumDistance = Infinity;

  for (
    let index = 0;
    index <
    routeCoordinates.length - 1;
    index += 1
  ) {
    const start =
      routeCoordinates[index];

    const end =
      routeCoordinates[index + 1];

    if (
      !Array.isArray(start) ||
      !Array.isArray(end)
    ) {
      continue;
    }

    const startLongitude =
      toNumber(start[0]);

    const startLatitude =
      toNumber(start[1]);

    const endLongitude =
      toNumber(end[0]);

    const endLatitude =
      toNumber(end[1]);

    if (
      startLongitude === null ||
      startLatitude === null ||
      endLongitude === null ||
      endLatitude === null
    ) {
      continue;
    }

    const distance =
      distancePointToSegmentMetres(
        incidentLatitude,
        incidentLongitude,
        startLatitude,
        startLongitude,
        endLatitude,
        endLongitude
      );

    if (
      distance < minimumDistance
    ) {
      minimumDistance = distance;
      nearestSegmentIndex = index;
    }
  }

  if (
    nearestSegmentIndex === null ||
    !Number.isFinite(minimumDistance)
  ) {
    return null;
  }

  const allStops =
    routeSequences.flatMap(
      (sequence) =>
        sequence.stops || []
    );

  const affectedStops =
    allStops
      .map((stop) => {
        const distance =
          getDistanceInMetres(
            incidentLatitude,
            incidentLongitude,
            stop.latitude,
            stop.longitude
          );

        return {
          ...stop,
          distanceFromIncidentMetres:
            Math.round(distance),
        };
      })
      .filter(
        (stop) =>
          stop.distanceFromIncidentMetres <=
          radiusMetres
      )
      .sort(
        (a, b) =>
          a.distanceFromIncidentMetres -
          b.distanceFromIncidentMetres
      );

  const uniqueAffectedStops =
    Array.from(
      new Map(
        affectedStops.map((stop) => [
          stop.id,
          stop,
        ])
      ).values()
    );

  const segmentBuffer = 8;

  const startIndex = Math.max(
    0,
    nearestSegmentIndex -
      segmentBuffer
  );

  const endIndex = Math.min(
    routeCoordinates.length - 1,
    nearestSegmentIndex +
      segmentBuffer
  );

  const affectedGeometry =
    routeCoordinates.slice(
      startIndex,
      endIndex + 1
    );

  return {
    incidentId: incident.id,

    incidentLocation:
      incident.location ||
      "Unknown location",

    incidentCoordinates: [
      incidentLongitude,
      incidentLatitude,
    ],

    distanceFromRouteMetres:
      Math.round(minimumDistance),

    nearestRouteSegmentIndex:
      nearestSegmentIndex,

    affectedGeometry,

    affectedStops:
      uniqueAffectedStops,

    affectedStopCount:
      uniqueAffectedStops.length,

    analysisRadiusMetres:
      radiusMetres,
  };
}