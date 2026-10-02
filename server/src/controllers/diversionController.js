import {
  getLineRoute,
  getLineRouteGeometry,
  getRoadDisruptions,
} from "../services/tfl/tflService.js";

import {
  normaliseRouteSequence,
  resolveRouteGeometry,
  analyseAffectedRouteSection,
} from "../services/diversion/routeAnalysisService.js";

import {
  getDrivingRoute,
  getControllerOverrideRoute,
} from "../services/routing/googleRoutesService.js";

import {
  readStore,
  writeStore,
  audit,
} from "../services/diversion/diversionStore.js";

const TRANSITIONS = {
  PROPOSED: ["AWAITING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"],
  AWAITING_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ENDED", "CANCELLED"],
  REJECTED: [],
  ENDED: [],
  CANCELLED: [],
  SUPERSEDED: [],
};

function uniqueStops(sequences, direction) {
  const chosen = sequences.filter(
    (sequence) =>
      !sequence.direction ||
      sequence.direction.toLowerCase() === direction.toLowerCase(),
  );

  const source = chosen.length > 0 ? chosen : sequences;

  return Array.from(
    new Map(
      source
        .flatMap((sequence) => sequence.stops || [])
        .map((stop) => [stop.id, stop]),
    ).values(),
  );
}

function detourWaypoint(start, end, incident) {
  const [startLongitude, startLatitude] = start;
  const [endLongitude, endLatitude] = end;
  const [incidentLongitude, incidentLatitude] = incident;

  const dx = endLongitude - startLongitude;
  const dy = endLatitude - startLatitude;
  const length = Math.hypot(dx, dy) || 1;
  const offset = 0.005;

  return [
    incidentLongitude - (dy / length) * offset,
    incidentLatitude + (dx / length) * offset,
  ];
}

function buildWarnings(incident, geometryFallbackUsed) {
  const text = `${incident.comments || ""} ${
    incident.currentUpdate || ""
  }`.toLowerCase();

  const warnings = [
    "Computer-generated proposal: controller approval is mandatory before use.",
    "Confirm bus height, width, weight, turning space and local restrictions before approval.",
  ];

  if (geometryFallbackUsed) {
    warnings.push(
      "TfL line geometry was unavailable. BusControl reconstructed the route corridor from ordered TfL stop coordinates. The controller must verify the route and diversion visually before approval.",
    );
  }

  if (text.includes("bridge")) {
    warnings.push(
      "Bridge mentioned in incident: verify height and weight restrictions.",
    );
  }

  if (text.includes("closed") || text.includes("closure")) {
    warnings.push(
      "Road closure detected: confirm closure extent and access restrictions.",
    );
  }

  if (text.includes("temporary traffic")) {
    warnings.push(
      "Temporary traffic management detected: verify suitability for buses.",
    );
  }

  if (text.includes("weight") || text.includes("weight restriction")) {
    warnings.push(
      "Possible weight restriction detected: verify vehicle suitability before approval.",
    );
  }

  if (text.includes("height") || text.includes("low bridge")) {
    warnings.push(
      "Possible height restriction detected: verify vehicle clearance before approval.",
    );
  }

  return warnings;
}

function getRouteSegment(routeCoordinates, segmentIndex) {
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
    return null;
  }

  const safeSegmentIndex = Number.isInteger(segmentIndex)
    ? Math.max(0, Math.min(segmentIndex, routeCoordinates.length - 2))
    : 0;

  const buffer = Math.max(
    2,
    Math.min(8, Math.floor(routeCoordinates.length * 0.08)),
  );

  const startIndex = Math.max(0, safeSegmentIndex - buffer);

  const endIndex = Math.min(
    routeCoordinates.length - 1,
    safeSegmentIndex + buffer + 1,
  );

  return {
    startIndex,
    endIndex,
    startPoint: routeCoordinates[startIndex],
    rejoinPoint: routeCoordinates[endIndex],
  };
}

export async function generateDiversion(req, res) {
  try {
    const {
      lineId,
      direction = "outbound",
      incidentId,
      revisionOfId = null,
      revisionReason = "",
    } = req.body;

    if (!lineId || !incidentId) {
      return res.status(400).json({
        success: false,
        message: "lineId and incidentId are required.",
      });
    }

    const existingStore = await readStore();

    const revisionSource = revisionOfId
      ? existingStore.diversions.find((item) => item.id === revisionOfId)
      : null;

    if (revisionOfId && !revisionSource) {
      return res.status(404).json({
        success: false,
        message: "The diversion selected for revision could not be found.",
      });
    }

    const safeDirection = direction === "inbound" ? "inbound" : "outbound";

    if (
      revisionSource &&
      (revisionSource.lineId !== lineId ||
        revisionSource.direction !== safeDirection ||
        revisionSource.incidentId !== incidentId)
    ) {
      return res.status(409).json({
        success: false,
        message:
          "A revision must use the same route, direction and incident as the original diversion.",
      });
    }

    if (
      revisionSource &&
      ["ENDED", "REJECTED", "CANCELLED", "SUPERSEDED"].includes(
        revisionSource.status,
      )
    ) {
      return res.status(409).json({
        success: false,
        message: `A ${revisionSource.status.toLowerCase()} diversion cannot be revised.`,
      });
    }

    const [routeData, geometryData, disruptions] = await Promise.all([
      getLineRoute(lineId),
      getLineRouteGeometry(lineId, safeDirection),
      getRoadDisruptions(),
    ]);

    const incident = disruptions.find((item) => item.id === incidentId);

    if (!incident) {
      return res.status(404).json({
        success: false,
        message: "Incident not found.",
      });
    }

    const sequences = normaliseRouteSequence(routeData, lineId);

    const totalStops = sequences.reduce(
      (total, sequence) => total + (sequence.stops || []).length,
      0,
    );

    if (!sequences.length || totalStops === 0) {
      return res.status(404).json({
        success: false,
        message: `Route ${lineId} was found, but TfL did not return usable stop data.`,
      });
    }

    const geometryResult = resolveRouteGeometry(
      geometryData,
      sequences,
      safeDirection,
    );

    const geometry = geometryResult.coordinates;

    if (geometry.length < 2) {
      return res.status(422).json({
        success: false,
        message: `Route ${lineId} was found, but BusControl could not obtain enough geographic data to generate a diversion.`,
      });
    }

    const affected = analyseAffectedRouteSection(
      sequences,
      geometry,
      incident,
      300,
    );

    if (!affected) {
      return res.status(422).json({
        success: false,
        message: "Unable to determine the affected route section.",
      });
    }

    if (affected.distanceFromRouteMetres > 300) {
      return res.status(422).json({
        success: false,
        message: `This incident is approximately ${affected.distanceFromRouteMetres} metres from route ${lineId}. Confirm the affected bus route before generating a diversion.`,
      });
    }

    const routeSegment = getRouteSegment(
      geometry,
      affected.nearestRouteSegmentIndex,
    );

    if (!routeSegment) {
      return res.status(422).json({
        success: false,
        message:
          "BusControl could not determine suitable diversion start and rejoin points.",
      });
    }

    const { startIndex, endIndex, startPoint, rejoinPoint } = routeSegment;

    const waypoint = detourWaypoint(
      startPoint,
      rejoinPoint,
      affected.incidentCoordinates,
    );

    let generatedRoute;

    try {
      generatedRoute = await getDrivingRoute([
        startPoint,
        waypoint,
        rejoinPoint,
      ]);
    } catch (error) {
      console.error(
        "Google Routes diversion routing error:",
        error.response?.data || error.message,
      );

      return res.status(502).json({
        success: false,
        message:
          "BusControl identified the affected route section, but Google Routes could not generate an alternative driving route. The controller should verify the incident and try again.",
      });
    }

    const generatedGeometry = generatedRoute?.geometry;

    const generatedCoordinates =
      generatedGeometry?.type === "LineString" &&
      Array.isArray(generatedGeometry.coordinates)
        ? generatedGeometry.coordinates
        : Array.isArray(generatedGeometry)
          ? generatedGeometry
          : [];

    if (generatedCoordinates.length < 2) {
      return res.status(502).json({
        success: false,
        message: "Google Routes did not return usable diversion geometry.",
      });
    }

    const diversionGeometry =
      generatedGeometry?.type === "LineString"
        ? generatedGeometry
        : {
            type: "LineString",
            coordinates: generatedCoordinates,
          };

    const stops = uniqueStops(sequences, safeDirection);

    const affectedStopIds = new Set(
      affected.affectedStops.map((stop) => stop.id),
    );

    const potentiallyMissedStops = stops.filter((stop) =>
      affectedStopIds.has(stop.id),
    );

    const warnings = buildWarnings(incident, geometryResult.fallbackUsed);

    const diversion = {
      id: crypto.randomUUID(),
      lineId,
      direction: safeDirection,
      incidentId,

      incident: {
        id: incident.id,
        location: incident.location,
        severity: incident.severity,
        category: incident.category,
        status: incident.status,
        comments: incident.comments,
        currentUpdate: incident.currentUpdate,
      },

      status: "PROPOSED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      routeAnalysis: {
        geometrySource: geometryResult.source,
        geometryFallbackUsed: geometryResult.fallbackUsed,
        geometryPoints: geometry.length,
        distanceFromIncidentMetres: affected.distanceFromRouteMetres,
        originalRouteStartIndex: startIndex,
        originalRouteEndIndex: endIndex,
      },

      originalRouteGeometry: geometry,
      affectedGeometry: affected.affectedGeometry,

      startPoint,
      rejoinPoint,
      waypoint,

      geometry: generatedRoute.geometry,

      distanceMetres: Math.round(generatedRoute.distance || 0),
      durationSeconds: Math.round(generatedRoute.duration || 0),

      instructions: generatedRoute.busControlInstructions || [],

      affectedSection: affected,

      risk: {
        level: geometryResult.fallbackUsed
          ? "ENHANCED_REVIEW_REQUIRED"
          : "REVIEW_REQUIRED",
        warnings,
        controllerConfirmed: false,
      },

      revision: revisionSource ? (revisionSource.revision || 1) + 1 : 1,

      revisionOfId: revisionSource?.id || null,

      rootDiversionId:
        revisionSource?.rootDiversionId || revisionSource?.id || null,

      revisionReason: revisionReason?.trim() || null,

      previousRevisionStatus: revisionSource?.status || null,
    };

    const store = existingStore;

    store.diversions.unshift(diversion);

    audit(
      store,
      revisionSource ? "DIVERSION_REVISION_GENERATED" : "DIVERSION_GENERATED",
      {
        diversionId: diversion.id,
        revisionOfId: revisionSource?.id || null,
        revision: diversion.revision,
        revisionReason: diversion.revisionReason,
        lineId,
        direction: safeDirection,
        incidentId,
        geometrySource: geometryResult.source,
        geometryFallbackUsed: geometryResult.fallbackUsed,
      },
    );

    await writeStore(store);

    return res.status(201).json({
      success: true,

      message: revisionSource
        ? `Revision ${diversion.revision} generated. The existing diversion remains operational until this revision is approved and activated.`
        : geometryResult.fallbackUsed
          ? "Diversion proposal generated using the TfL stop-corridor fallback. Controller verification is required."
          : "Diversion proposal generated. Controller review is required.",

      diversion,
    });
  } catch (error) {
    console.error(
      "Diversion generation error:",
      error.response?.data || error.message,
    );

    return res.status(500).json({
      success: false,

      message:
        error.response?.data?.message ||
        error.message ||
        "Unable to generate diversion.",
    });
  }
}

export async function calculateManualDiversionRoute(req, res) {
  try {
    const { points } = req.body;

    if (!Array.isArray(points) || points.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Select at least a diversion start point and rejoin point.",
      });
    }

    const validPoints = points.every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1])),
    );

    if (!validPoints) {
      return res.status(400).json({
        success: false,
        message: "One or more diversion points are invalid.",
      });
    }

    const store = await readStore();

    const diversion = store.diversions.find(
      (item) => item.id === req.params.id,
    );

    if (!diversion) {
      return res.status(404).json({
        success: false,
        message: "Diversion proposal not found.",
      });
    }

    if (
      ["ENDED", "REJECTED", "CANCELLED", "SUPERSEDED"].includes(
        diversion.status,
      )
    ) {
      return res.status(409).json({
        success: false,
        message: `A ${diversion.status.toLowerCase()} diversion cannot be edited.`,
      });
    }

    const generatedRoute = await getControllerOverrideRoute(points);

    const preview = {
      diversionId: diversion.id,
      lineId: diversion.lineId,
      direction: diversion.direction,
      incidentId: diversion.incidentId,

      startPoint: points[0],
      rejoinPoint: points[points.length - 1],

      controllerWaypoints: points.slice(1, -1),
      controllerPoints: points,

      geometry: generatedRoute.geometry,

      distanceMetres: Math.round(generatedRoute.distance || 0),
      durationSeconds: Math.round(generatedRoute.duration || 0),

      instructions: generatedRoute.busControlInstructions || [],

      routingProvider: generatedRoute.routingProvider,
      routeSource: generatedRoute.routeSource,

      requiresOverride: generatedRoute.requiresOverride,

      failedSegments: generatedRoute.failedSegments || [],
      segments: generatedRoute.segments || [],

      preview: true,
      calculatedAt: new Date().toISOString(),
    };

    audit(store, "CONTROLLER_DIVERSION_PREVIEW_CALCULATED", {
      diversionId: diversion.id,
      lineId: diversion.lineId,
      direction: diversion.direction,

      pointCount: points.length,

      segmentCount: preview.segments.length,

      failedSegmentCount: preview.failedSegments.length,

      routeSource: preview.routeSource,

      routingProvider: preview.routingProvider,
    });

    await writeStore(store);

    return res.json({
      success: true,

      message: preview.requiresOverride
        ? "The controller route was preserved, but one or more selected movements could not be reproduced by Google Routes. Confirm the local bus exemption before accepting."
        : "Controller diversion calculated segment by segment. Review the green route before accepting it.",

      preview,
    });
  } catch (error) {
    console.error(
      "Controller diversion calculation error:",
      error.response?.data || error.message,
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Unable to calculate the controller diversion.",
    });
  }
}

export async function acceptManualDiversionRoute(req, res) {
  try {
    const {
      points,

      revisionReason = "Controller manually adjusted diversion route.",

      confirmOverride = false,

      overrideReason = "",
    } = req.body;

    if (!Array.isArray(points) || points.length < 2) {
      return res.status(400).json({
        success: false,
        message: "Select at least a diversion start point and rejoin point.",
      });
    }

    const validPoints = points.every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1])),
    );

    if (!validPoints) {
      return res.status(400).json({
        success: false,
        message: "One or more diversion points are invalid.",
      });
    }

    const store = await readStore();

    const source = store.diversions.find(
      (item) => item.id === req.params.id,
    );

    if (!source) {
      return res.status(404).json({
        success: false,
        message: "Diversion proposal not found.",
      });
    }

    if (
      ["ENDED", "REJECTED", "CANCELLED", "SUPERSEDED"].includes(
        source.status,
      )
    ) {
      return res.status(409).json({
        success: false,
        message: `A ${source.status.toLowerCase()} diversion cannot be revised.`,
      });
    }

    const generatedRoute = await getControllerOverrideRoute(points);

    if (generatedRoute.requiresOverride && !confirmOverride) {
      return res.status(409).json({
        success: false,

        code: "CONTROLLER_OVERRIDE_CONFIRMATION_REQUIRED",

        message:
          "Google Routes could not reproduce one or more controller-selected movements. Explicit controller override confirmation is required.",

        failedSegments: generatedRoute.failedSegments,
      });
    }

    if (
      generatedRoute.requiresOverride &&
      (!overrideReason || overrideReason.trim().length < 5)
    ) {
      return res.status(400).json({
        success: false,

        code: "OVERRIDE_REASON_REQUIRED",

        message:
          "Enter the operational reason for the controller override, for example a local bus turning exemption.",
      });
    }

    const controllerWaypoints = points.slice(1, -1);

    const now = new Date().toISOString();

    const diversion = {
      ...source,

      id: crypto.randomUUID(),

      status: "PROPOSED",

      createdAt: now,
      updatedAt: now,

      startPoint: points[0],

      rejoinPoint: points[points.length - 1],

      waypoint: controllerWaypoints[0] || null,

      controllerWaypoints,

      controllerPoints: points,

      geometry: generatedRoute.geometry,

      distanceMetres: Math.round(generatedRoute.distance || 0),

      durationSeconds: Math.round(generatedRoute.duration || 0),

      instructions: generatedRoute.busControlInstructions || [],

      routingProvider: generatedRoute.routingProvider,

      routeSource: generatedRoute.requiresOverride
        ? "CONTROLLER_OVERRIDE"
        : "CONTROLLER_DRAWN",

      controllerOverride: generatedRoute.requiresOverride,

      controllerOverrideReason: generatedRoute.requiresOverride
        ? overrideReason.trim()
        : null,

      controllerOverrideSegments: generatedRoute.failedSegments || [],

      routingSegments: generatedRoute.segments || [],

      revision: (source.revision || 1) + 1,

      revisionOfId: source.id,

      rootDiversionId: source.rootDiversionId || source.id,

      revisionReason:
        revisionReason?.trim() ||
        "Controller manually adjusted diversion route.",

      previousRevisionStatus: source.status,

      submittedForApprovalAt: null,

      approvedBy: null,
      approvedAt: null,

      activatedAt: null,

      endedAt: null,

      rejectedAt: null,
      rejectedBy: null,

      cancelledAt: null,
      cancelledBy: null,

      supersededAt: null,
      supersededBy: null,

      risk: {
        ...(source.risk || {}),

        controllerConfirmed: false,

        warnings: [
          ...new Set([
            ...(source.risk?.warnings || []),

            "Controller-drawn route: verify road suitability, vehicle restrictions and local operating conditions before approval.",

            ...(generatedRoute.requiresOverride
              ? [
                  `Controller override recorded: ${overrideReason.trim()}`,

                  "One or more route sections rely on an explicit controller-confirmed movement that Google Routes could not reproduce.",
                ]
              : []),
          ]),
        ],
      },
    };

    store.diversions.unshift(diversion);

    audit(store, "CONTROLLER_DIVERSION_REVISION_CREATED", {
      diversionId: diversion.id,

      revisionOfId: source.id,

      revision: diversion.revision,

      lineId: diversion.lineId,

      direction: diversion.direction,

      incidentId: diversion.incidentId,

      pointCount: points.length,

      segmentCount: generatedRoute.segments?.length || 0,

      overrideSegmentCount: generatedRoute.failedSegments?.length || 0,

      routingProvider: diversion.routingProvider,

      routeSource: diversion.routeSource,

      controllerOverride: diversion.controllerOverride,

      controllerOverrideReason: diversion.controllerOverrideReason,

      revisionReason: diversion.revisionReason,
    });

    await writeStore(store);

    return res.status(201).json({
      success: true,

      message: diversion.controllerOverride
        ? `Controller override saved as revision ${diversion.revision}. Review and approve it before activation.`
        : `Controller-drawn route saved as revision ${diversion.revision}. Review it before approval.`,

      diversion,
    });
  } catch (error) {
    console.error(
      "Accept controller diversion error:",
      error.response?.data || error.message,
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Unable to save the controller diversion.",
    });
  }
}

export async function listDiversions(req, res) {
  try {
    const store = await readStore();

    return res.json({
      success: true,
      diversions: store.diversions,
    });
  } catch (error) {
    console.error("List diversions error:", error.message);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to load diversions.",
    });
  }
}

export async function updateDiversionStatus(req, res) {
  try {
    const {
      status,
      controllerName = "Controller",
    } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "A diversion status is required.",
      });
    }

    const store = await readStore();

    const diversion = store.diversions.find(
      (item) => item.id === req.params.id,
    );

    if (!diversion) {
      return res.status(404).json({
        success: false,
        message: "Diversion not found.",
      });
    }

    const allowedNext = TRANSITIONS[diversion.status] || [];

    if (!allowedNext.includes(status)) {
      return res.status(409).json({
        success: false,

        message:
          `Diversion cannot move from ${diversion.status} to ${status}.`,
      });
    }

    diversion.status = status;

    diversion.updatedAt = new Date().toISOString();

    if (status === "AWAITING_APPROVAL") {
      diversion.submittedForApprovalAt =
        new Date().toISOString();
    }

    if (status === "APPROVED") {
      diversion.approvedBy = controllerName;

      diversion.approvedAt = new Date().toISOString();

      diversion.risk = {
        ...(diversion.risk || {}),
        controllerConfirmed: true,
      };
    }

    if (status === "ACTIVE") {
      diversion.activatedAt = new Date().toISOString();

      if (diversion.revisionOfId) {
        const previous = store.diversions.find(
          (item) =>
            item.id === diversion.revisionOfId,
        );

        if (
          previous &&
          ![
            "ENDED",
            "CANCELLED",
            "SUPERSEDED",
          ].includes(previous.status)
        ) {
          previous.status = "SUPERSEDED";

          previous.supersededAt =
            new Date().toISOString();

          previous.supersededBy = diversion.id;

          previous.updatedAt =
            new Date().toISOString();

          audit(
            store,
            "DIVERSION_SUPERSEDED",
            {
              diversionId: previous.id,

              supersededBy: diversion.id,

              previousRevision:
                previous.revision || 1,

              newRevision:
                diversion.revision || 1,

              controllerName,
            },
          );
        }
      }
    }

    if (status === "ENDED") {
      diversion.endedAt =
        new Date().toISOString();
    }

    if (status === "REJECTED") {
      diversion.rejectedAt =
        new Date().toISOString();

      diversion.rejectedBy =
        controllerName;
    }

    if (status === "CANCELLED") {
      diversion.cancelledAt =
        new Date().toISOString();

      diversion.cancelledBy =
        controllerName;
    }

    audit(
      store,
      `DIVERSION_${status}`,
      {
        diversionId: diversion.id,

        controllerName,

        previousRevision:
          diversion.revision,
      },
    );

    await writeStore(store);

    return res.json({
      success: true,
      diversion,
    });
  } catch (error) {
    console.error(
      "Update diversion status error:",
      error.message,
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Unable to update diversion.",
    });
  }
}

export async function acknowledgeDiversion(req, res) {
  try {
    const store = await readStore();

    const diversion = store.diversions.find(
      (item) => item.id === req.params.id,
    );

    const driverName =
      req.body.driverName?.trim() ||
      "Driver";

    if (!diversion) {
      return res.status(404).json({
        success: false,
        message: "Diversion not found.",
      });
    }

    if (diversion.status !== "ACTIVE") {
      return res.status(409).json({
        success: false,

        message:
          "Only active diversions can be acknowledged by drivers.",
      });
    }

    const existing =
      store.acknowledgements.find(
        (item) =>
          item.diversionId ===
            diversion.id &&
          item.driverName ===
            driverName,
      );

    if (existing) {
      return res.json({
        success: true,

        acknowledgement: existing,

        duplicate: true,
      });
    }

    const acknowledgement = {
      id: crypto.randomUUID(),

      diversionId: diversion.id,

      driverName,

      at: new Date().toISOString(),
    };

    store.acknowledgements.unshift(
      acknowledgement,
    );

    audit(
      store,
      "DRIVER_ACKNOWLEDGED",
      acknowledgement,
    );

    await writeStore(store);

    return res.status(201).json({
      success: true,
      acknowledgement,
    });
  } catch (error) {
    console.error(
      "Diversion acknowledgement error:",
      error.message,
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Unable to acknowledge diversion.",
    });
  }
}

export async function reportProblem(req, res) {
  try {
    const store = await readStore();

    const diversion = store.diversions.find(
      (item) => item.id === req.params.id,
    );

    if (!diversion) {
      return res.status(404).json({
        success: false,
        message: "Diversion not found.",
      });
    }

    if (diversion.status !== "ACTIVE") {
      return res.status(409).json({
        success: false,

        message:
          "Problems can only be reported against an active diversion.",
      });
    }

    const message =
      req.body.message?.trim();

    if (!message) {
      return res.status(400).json({
        success: false,

        message:
          "Please provide details of the problem.",
      });
    }

    const report = {
      id: crypto.randomUUID(),

      diversionId: diversion.id,

      driverName:
        req.body.driverName?.trim() ||
        "Driver",

      message,

      at: new Date().toISOString(),

      status: "OPEN",
    };

    store.driverReports.unshift(
      report,
    );

    audit(
      store,
      "DRIVER_PROBLEM_REPORTED",
      report,
    );

    await writeStore(store);

    return res.status(201).json({
      success: true,
      report,
    });
  } catch (error) {
    console.error(
      "Diversion problem report error:",
      error.message,
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Unable to report diversion problem.",
    });
  }
}

export async function operationalData(req, res) {
  try {
    const store = await readStore();

    return res.json({
      success: true,

      diversions:
        store.diversions,

      acknowledgements:
        store.acknowledgements,

      driverReports:
        store.driverReports,

      audit:
        store.audit.slice(0, 100),
    });
  } catch (error) {
    console.error(
      "Diversion operational data error:",
      error.message,
    );

    return res.status(500).json({
      success: false,

      message:
        error.message ||
        "Unable to load diversion operations.",
    });
  }
}