import supabase from "../supabase.js";
import {
  generateCurtailmentReference,
  buildCurtailmentRevisionReference,
} from "./curtailmentReferenceService.js";

const VALID_STATUSES = [
  "PROPOSED",
  "APPROVED",
  "ACTIVE",
  "ENDED",
  "REJECTED",
  "CANCELLED",
  "SUPERSEDED",
];

const VALID_REASONS = [
  "LATE_RUNNING",
  "SERVICE_REGULATION",
  "INCIDENT",
  "DISRUPTION",
  "OTHER",
];

function normaliseReason(reason) {
  const value = String(
    reason || ""
  )
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  return VALID_REASONS.includes(
    value
  )
    ? value
    : "OTHER";
}

function parseLateness(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.max(0, parsed)
    : null;
}

function numberOrNull(value) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function cleanPoint(point = {}) {
  return {
    id: point.id || null,
    name: String(
      point.name || ""
    ).trim(),
    location: String(
      point.location ||
        point.name ||
        ""
    ).trim(),
    setDownStop: String(
      point.setDownStop || ""
    ).trim(),
    turningRoute: String(
      point.turningRoute || ""
    ).trim(),
    standLocation: String(
      point.standLocation || ""
    ).trim(),
    pickUpStop: String(
      point.pickUpStop || ""
    ).trim(),
    operationalNotes: String(
      point.operationalNotes || ""
    ).trim(),
    latitude: numberOrNull(
      point.latitude
    ),
    longitude: numberOrNull(
      point.longitude
    ),
    verified: Boolean(
      point.verified
    ),
    source: String(
      point.source || ""
    ).trim(),
  };
}

function validateCurtailmentInput(
  payload
) {
  const routeNumber = String(
    payload.routeNumber ||
      payload.lineId ||
      ""
  )
    .trim()
    .toUpperCase();

  const direction = String(
    payload.direction || ""
  )
    .trim()
    .toLowerCase();

  const point = cleanPoint(
    payload.curtailmentPoint
  );

  if (!routeNumber) {
    throw new Error(
      "Route number is required."
    );
  }

  if (
    ![
      "inbound",
      "outbound",
    ].includes(direction)
  ) {
    throw new Error(
      "Direction must be inbound or outbound."
    );
  }

  if (!point.name) {
    throw new Error(
      "A curtailment point is required."
    );
  }

  return {
    routeNumber,
    direction,
    point,
  };
}

function rowToCurtailment(
  row
) {
  if (!row) return null;

  return {
    id: row.id,
    reference: row.reference,
    baseReference:
      row.base_reference,
    revision: row.revision,
    revisionOfId:
      row.revision_of_id,
    revisionReason:
      row.revision_reason,

    routeNumber:
      row.route_number,
    lineId: row.line_id,
    direction: row.direction,

    vehicleId:
      row.vehicle_id || "",
    dutyNumber:
      row.duty_number || "",
    driverName:
      row.driver_name || "",
    controllerName:
      row.controller_name ||
      "Controller",

    reason: row.reason,
    reasonDetails:
      row.reason_details || "",

    latenessMinutes:
      row.lateness_minutes,

    curtailmentPoint: {
      id: row.point_id,
      name:
        row.point_name || "",
      location:
        row.point_location || "",
      setDownStop:
        row.set_down_stop || "",
      turningRoute:
        row.turning_route || "",
      standLocation:
        row.stand_location || "",
      pickUpStop:
        row.pick_up_stop || "",
      operationalNotes:
        row.operational_notes || "",
      latitude:
        row.point_latitude,
      longitude:
        row.point_longitude,
      verified: Boolean(
        row.point_verified
      ),
      source:
        row.point_source || "",
    },

    status: row.status,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt:
      row.approved_at,
    activatedAt:
      row.activated_at,
    endedAt: row.ended_at,
  };
}

function rowToAcknowledgement(
  row
) {
  return {
    id: row.id,
    curtailmentId:
      row.curtailment_id,
    reference: row.reference,
    baseReference:
      row.base_reference,
    lineId: row.line_id,
    driverName:
      row.driver_name,
    vehicleId:
      row.vehicle_id || "",
    at: row.acknowledged_at,
  };
}

function rowToReport(row) {
  return {
    id: row.id,
    curtailmentId:
      row.curtailment_id,
    reference: row.reference,
    baseReference:
      row.base_reference,
    lineId: row.line_id,
    driverName:
      row.driver_name,
    vehicleId:
      row.vehicle_id || "",
    message: row.message,
    at: row.reported_at,
  };
}

function rowToAudit(row) {
  return {
    id: row.id,
    action: row.action,
    details: {
      ...(row.details || {}),
      curtailmentId:
        row.curtailment_id,
      reference:
        row.reference,
      baseReference:
        row.base_reference,
      lineId: row.line_id,
      direction: row.direction,
      controllerName:
        row.controller_name,
      driverName:
        row.driver_name,
      vehicleId:
        row.vehicle_id,
    },
    at: row.created_at,
  };
}

async function addAudit(
  action,
  details = {}
) {
  const {
    curtailmentId = null,
    reference = null,
    baseReference = null,
    lineId = null,
    direction = null,
    controllerName = null,
    driverName = null,
    vehicleId = null,
    ...extraDetails
  } = details;

  const { error } =
    await supabase
      .from(
        "curtailment_audit"
      )
      .insert({
        curtailment_id:
          curtailmentId,
        reference,
        base_reference:
          baseReference,
        action,
        line_id: lineId,
        direction,
        controller_name:
          controllerName,
        driver_name:
          driverName,
        vehicle_id:
          vehicleId,
        details: extraDetails,
      });

  if (error) {
    console.error(
      "Curtailment audit error:",
      error.message
    );
  }
}

async function getCurtailmentRow(
  id
) {
  const { data, error } =
    await supabase
      .from("curtailments")
      .select("*")
      .eq("id", id)
      .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load curtailment: ${error.message}`
    );
  }

  return data;
}

export async function createCurtailment(
  payload = {}
) {
  const {
    routeNumber,
    direction,
    point,
  } =
    validateCurtailmentInput(
      payload
    );

  const reference =
    await generateCurtailmentReference(
      routeNumber
    );

  const insertData = {
    reference,
    base_reference: reference,

    revision: 0,
    revision_of_id: null,
    revision_reason: null,

    route_number:
      routeNumber,
    line_id: routeNumber,
    direction,

    vehicle_id: String(
      payload.vehicleId || ""
    ).trim(),

    duty_number: String(
      payload.dutyNumber || ""
    ).trim(),

    driver_name: String(
      payload.driverName || ""
    ).trim(),

    controller_name: String(
      payload.controllerName ||
        "Controller"
    ).trim(),

    reason: normaliseReason(
      payload.reason
    ),

    reason_details: String(
      payload.reasonDetails || ""
    ).trim(),

    lateness_minutes:
      parseLateness(
        payload.latenessMinutes
      ),

    point_id: point.id,
    point_name: point.name,
    point_location:
      point.location,
    set_down_stop:
      point.setDownStop,
    turning_route:
      point.turningRoute,
    stand_location:
      point.standLocation,
    pick_up_stop:
      point.pickUpStop,
    operational_notes:
      point.operationalNotes,
    point_latitude:
      point.latitude,
    point_longitude:
      point.longitude,
    point_verified:
      point.verified,
    point_source:
      point.source,

    status: "PROPOSED",
  };

  const { data, error } =
    await supabase
      .from("curtailments")
      .insert(insertData)
      .select("*")
      .single();

  if (error) {
    throw new Error(
      `Unable to create curtailment: ${error.message}`
    );
  }

  const curtailment =
    rowToCurtailment(data);

  await addAudit(
    "CURTAILMENT_PROPOSED",
    {
      curtailmentId:
        curtailment.id,
      reference:
        curtailment.reference,
      baseReference:
        curtailment.baseReference,
      lineId:
        curtailment.routeNumber,
      direction:
        curtailment.direction,
      reason:
        curtailment.reason,
      latenessMinutes:
        curtailment.latenessMinutes,
      controllerName:
        curtailment.controllerName,
    }
  );

  return curtailment;
}

export async function reviseCurtailment(
  id,
  payload = {}
) {
  const originalRow =
    await getCurtailmentRow(
      id
    );

  if (!originalRow) {
    throw new Error(
      "Curtailment not found."
    );
  }

  const original =
    rowToCurtailment(
      originalRow
    );

  if (
    [
      "ENDED",
      "CANCELLED",
      "REJECTED",
      "SUPERSEDED",
    ].includes(original.status)
  ) {
    throw new Error(
      "This curtailment cannot be revised."
    );
  }

  const {
    routeNumber,
    direction,
    point,
  } =
    validateCurtailmentInput({
      ...original,
      ...payload,

      routeNumber:
        payload.routeNumber ??
        original.routeNumber,

      direction:
        payload.direction ??
        original.direction,

      curtailmentPoint:
        payload.curtailmentPoint ??
        original.curtailmentPoint,
    });

  const revision =
    Number(
      original.revision || 0
    ) + 1;

  const baseReference =
    original.baseReference ||
    original.reference.replace(
      /-R\d+$/i,
      ""
    );

  const reference =
    buildCurtailmentRevisionReference(
      baseReference,
      revision
    );

  const latenessMinutes =
    payload.latenessMinutes !==
    undefined
      ? parseLateness(
          payload.latenessMinutes
        )
      : original.latenessMinutes;

  const insertData = {
    reference,
    base_reference:
      baseReference,

    revision,
    revision_of_id:
      original.id,

    revision_reason: String(
      payload.revisionReason ||
        "Operational revision"
    ).trim(),

    route_number:
      routeNumber,
    line_id: routeNumber,
    direction,

    vehicle_id: String(
      payload.vehicleId ??
        original.vehicleId ??
        ""
    ).trim(),

    duty_number: String(
      payload.dutyNumber ??
        original.dutyNumber ??
        ""
    ).trim(),

    driver_name: String(
      payload.driverName ??
        original.driverName ??
        ""
    ).trim(),

    controller_name: String(
      payload.controllerName ||
        original.controllerName ||
        "Controller"
    ).trim(),

    reason: normaliseReason(
      payload.reason ??
        original.reason
    ),

    reason_details: String(
      payload.reasonDetails ??
        original.reasonDetails ??
        ""
    ).trim(),

    lateness_minutes:
      latenessMinutes,

    point_id: point.id,
    point_name: point.name,
    point_location:
      point.location,
    set_down_stop:
      point.setDownStop,
    turning_route:
      point.turningRoute,
    stand_location:
      point.standLocation,
    pick_up_stop:
      point.pickUpStop,
    operational_notes:
      point.operationalNotes,
    point_latitude:
      point.latitude,
    point_longitude:
      point.longitude,
    point_verified:
      point.verified,
    point_source:
      point.source,

    status: "PROPOSED",
  };

  const { data, error } =
    await supabase
      .from("curtailments")
      .insert(insertData)
      .select("*")
      .single();

  if (error) {
    throw new Error(
      `Unable to create curtailment revision: ${error.message}`
    );
  }

  const revised =
    rowToCurtailment(data);

  await addAudit(
    "CURTAILMENT_REVISED",
    {
      curtailmentId:
        revised.id,
      reference:
        revised.reference,
      baseReference:
        revised.baseReference,
      lineId:
        revised.routeNumber,
      direction:
        revised.direction,
      controllerName:
        revised.controllerName,
      previousCurtailmentId:
        original.id,
      previousReference:
        original.reference,
      revision,
      revisionReason:
        revised.revisionReason,
      previousStatus:
        original.status,
    }
  );

  return revised;
}

export async function setCurtailmentStatus(
  id,
  status,
  controllerName = "Controller"
) {
  const row =
    await getCurtailmentRow(
      id
    );

  if (!row) {
    throw new Error(
      "Curtailment not found."
    );
  }

  const curtailment =
    rowToCurtailment(row);

  const nextStatus = String(
    status || ""
  )
    .trim()
    .toUpperCase();

  if (
    !VALID_STATUSES.includes(
      nextStatus
    )
  ) {
    throw new Error(
      "Invalid curtailment status."
    );
  }

  const allowedTransitions = {
    PROPOSED: [
      "APPROVED",
      "REJECTED",
      "CANCELLED",
    ],
    APPROVED: [
      "ACTIVE",
      "CANCELLED",
    ],
    ACTIVE: ["ENDED"],
    ENDED: [],
    REJECTED: [],
    CANCELLED: [],
    SUPERSEDED: [],
  };

  if (
    curtailment.status !==
      nextStatus &&
    !allowedTransitions[
      curtailment.status
    ]?.includes(nextStatus)
  ) {
    throw new Error(
      `Curtailment cannot move from ${curtailment.status} to ${nextStatus}.`
    );
  }

  if (
    curtailment.status ===
    nextStatus
  ) {
    return curtailment;
  }

  const now =
    new Date().toISOString();

  const updateData = {
    status: nextStatus,
    controller_name: String(
      controllerName ||
        curtailment.controllerName ||
        "Controller"
    ).trim(),
  };

  if (
    nextStatus === "APPROVED"
  ) {
    updateData.approved_at =
      now;
  }

  if (
    nextStatus === "ACTIVE"
  ) {
    updateData.activated_at =
      now;
  }

  if (
    nextStatus === "ENDED"
  ) {
    updateData.ended_at = now;
  }

  if (
    nextStatus === "ACTIVE"
  ) {
    const { data: previous } =
      await supabase
        .from("curtailments")
        .select(
          "id, reference, status"
        )
        .eq(
          "base_reference",
          curtailment.baseReference
        )
        .neq(
          "id",
          curtailment.id
        )
        .in("status", [
          "PROPOSED",
          "APPROVED",
          "ACTIVE",
        ]);

    if (
      previous?.length
    ) {
      const previousIds =
        previous.map(
          (item) => item.id
        );

      const {
        error:
          supersedeError,
      } =
        await supabase
          .from(
            "curtailments"
          )
          .update({
            status:
              "SUPERSEDED",
          })
          .in(
            "id",
            previousIds
          );

      if (
        supersedeError
      ) {
        throw new Error(
          `Unable to supersede previous curtailment revision: ${supersedeError.message}`
        );
      }

      for (
        const previousItem of
        previous
      ) {
        await addAudit(
          "CURTAILMENT_SUPERSEDED",
          {
            curtailmentId:
              previousItem.id,
            reference:
              previousItem.reference,
            baseReference:
              curtailment.baseReference,
            lineId:
              curtailment.routeNumber,
            direction:
              curtailment.direction,
            replacementCurtailmentId:
              curtailment.id,
            replacementReference:
              curtailment.reference,
            previousStatus:
              previousItem.status,
          }
        );
      }
    }
  }

  const { data, error } =
    await supabase
      .from("curtailments")
      .update(updateData)
      .eq("id", id)
      .select("*")
      .single();

  if (error) {
    throw new Error(
      `Unable to update curtailment: ${error.message}`
    );
  }

  const updated =
    rowToCurtailment(data);

  await addAudit(
    `CURTAILMENT_${nextStatus}`,
    {
      curtailmentId:
        updated.id,
      reference:
        updated.reference,
      baseReference:
        updated.baseReference,
      lineId:
        updated.routeNumber,
      direction:
        updated.direction,
      controllerName:
        updated.controllerName,
      revision:
        updated.revision,
    }
  );

  return updated;
}

export async function acknowledgeCurtailment(
  id,
  driverName = "Driver",
  vehicleId = ""
) {
  const row =
    await getCurtailmentRow(
      id
    );

  if (!row) {
    throw new Error(
      "Curtailment not found."
    );
  }

  const curtailment =
    rowToCurtailment(row);

  if (
    curtailment.status !==
    "ACTIVE"
  ) {
    throw new Error(
      "Only an active curtailment can be acknowledged."
    );
  }

  const name = String(
    driverName || "Driver"
  ).trim();

  const vehicle = String(
    vehicleId ||
      curtailment.vehicleId ||
      ""
  ).trim();

  const {
    data: existing,
    error: existingError,
  } =
    await supabase
      .from(
        "curtailment_acknowledgements"
      )
      .select("*")
      .eq(
        "curtailment_id",
        id
      )
      .eq(
        "driver_name",
        name
      )
      .eq(
        "vehicle_id",
        vehicle
      )
      .maybeSingle();

  if (existingError) {
    throw new Error(
      `Unable to check acknowledgement: ${existingError.message}`
    );
  }

  if (existing) {
    return rowToAcknowledgement(
      existing
    );
  }

  const { data, error } =
    await supabase
      .from(
        "curtailment_acknowledgements"
      )
      .insert({
        curtailment_id: id,
        reference:
          curtailment.reference,
        base_reference:
          curtailment.baseReference,
        line_id:
          curtailment.routeNumber,
        driver_name: name,
        vehicle_id: vehicle,
      })
      .select("*")
      .single();

  if (error) {
    throw new Error(
      `Unable to acknowledge curtailment: ${error.message}`
    );
  }

  const acknowledgement =
    rowToAcknowledgement(
      data
    );

  await addAudit(
    "CURTAILMENT_DRIVER_ACKNOWLEDGED",
    {
      curtailmentId: id,
      reference:
        curtailment.reference,
      baseReference:
        curtailment.baseReference,
      lineId:
        curtailment.routeNumber,
      driverName: name,
      vehicleId: vehicle,
    }
  );

  return acknowledgement;
}

export async function reportCurtailmentProblem(
  id,
  message,
  driverName = "Driver",
  vehicleId = ""
) {
  const row =
    await getCurtailmentRow(
      id
    );

  if (!row) {
    throw new Error(
      "Curtailment not found."
    );
  }

  const curtailment =
    rowToCurtailment(row);

  if (
    curtailment.status !==
    "ACTIVE"
  ) {
    throw new Error(
      "Problems can only be reported against an active curtailment."
    );
  }

  const cleanMessage =
    String(
      message || ""
    ).trim();

  if (!cleanMessage) {
    throw new Error(
      "A problem description is required."
    );
  }

  const vehicle = String(
    vehicleId ||
      curtailment.vehicleId ||
      ""
  ).trim();

  const name = String(
    driverName || "Driver"
  ).trim();

  const { data, error } =
    await supabase
      .from(
        "curtailment_driver_reports"
      )
      .insert({
        curtailment_id: id,
        reference:
          curtailment.reference,
        base_reference:
          curtailment.baseReference,
        line_id:
          curtailment.routeNumber,
        driver_name: name,
        vehicle_id: vehicle,
        message:
          cleanMessage,
      })
      .select("*")
      .single();

  if (error) {
    throw new Error(
      `Unable to report curtailment problem: ${error.message}`
    );
  }

  const report =
    rowToReport(data);

  await addAudit(
    "CURTAILMENT_DRIVER_REPORT",
    {
      curtailmentId: id,
      reference:
        curtailment.reference,
      baseReference:
        curtailment.baseReference,
      lineId:
        curtailment.routeNumber,
      driverName: name,
      vehicleId: vehicle,
      message:
        cleanMessage,
    }
  );

  return report;
}

export async function getCurtailments() {
  const { data, error } =
    await supabase
      .from("curtailments")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw new Error(
      `Unable to load curtailments: ${error.message}`
    );
  }

  return (data || []).map(
    rowToCurtailment
  );
}

export async function getCurtailment(
  id
) {
  const row =
    await getCurtailmentRow(
      id
    );

  return rowToCurtailment(
    row
  );
}

export async function getActiveCurtailments() {
  const { data, error } =
    await supabase
      .from("curtailments")
      .select("*")
      .eq(
        "status",
        "ACTIVE"
      )
      .order(
        "activated_at",
        {
          ascending: false,
        }
      );

  if (error) {
    throw new Error(
      `Unable to load active curtailments: ${error.message}`
    );
  }

  return (data || []).map(
    rowToCurtailment
  );
}

export async function getCurtailmentOperations() {
  const [
    curtailmentResult,
    acknowledgementResult,
    reportResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from("curtailments")
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      ),

    supabase
      .from(
        "curtailment_acknowledgements"
      )
      .select("*")
      .order(
        "acknowledged_at",
        {
          ascending: false,
        }
      ),

    supabase
      .from(
        "curtailment_driver_reports"
      )
      .select("*")
      .order(
        "reported_at",
        {
          ascending: false,
        }
      ),

    supabase
      .from(
        "curtailment_audit"
      )
      .select("*")
      .order(
        "created_at",
        {
          ascending: false,
        }
      ),
  ]);

  if (
    curtailmentResult.error
  ) {
    throw new Error(
      `Unable to load curtailments: ${curtailmentResult.error.message}`
    );
  }

  if (
    acknowledgementResult.error
  ) {
    throw new Error(
      `Unable to load acknowledgements: ${acknowledgementResult.error.message}`
    );
  }

  if (reportResult.error) {
    throw new Error(
      `Unable to load driver reports: ${reportResult.error.message}`
    );
  }

  if (auditResult.error) {
    throw new Error(
      `Unable to load curtailment audit: ${auditResult.error.message}`
    );
  }

  return {
    curtailments:
      (
        curtailmentResult.data ||
        []
      ).map(
        rowToCurtailment
      ),

    acknowledgements:
      (
        acknowledgementResult.data ||
        []
      ).map(
        rowToAcknowledgement
      ),

    driverReports:
      (
        reportResult.data ||
        []
      ).map(
        rowToReport
      ),

    audit:
      (
        auditResult.data ||
        []
      ).map(rowToAudit),
  };
}