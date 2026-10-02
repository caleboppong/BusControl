import supabase from "../supabase.js";

const empty = {
  diversions: [],
  acknowledgements: [],
  driverReports: [],
  audit: [],
};

function diversionFromRow(row) {
  return {
    id: row.id,
    lineId: row.line_id,
    direction: row.direction,
    incidentId: row.incident_id,
    status: row.status,

    incident: row.incident || {},
    routeAnalysis: row.route_analysis || {},

    originalRouteGeometry:
      row.original_route_geometry || [],
    affectedGeometry:
      row.affected_geometry || null,
    startPoint:
      row.start_point || null,
    rejoinPoint:
      row.rejoin_point || null,
    waypoint:
      row.waypoint || null,
    geometry:
      row.geometry || null,

    distanceMetres:
      Number(row.distance_metres || 0),
    durationSeconds:
      Number(row.duration_seconds || 0),

    instructions:
      row.instructions || [],
    affectedSection:
      row.affected_section || null,
    risk:
      row.risk || {},

    revision:
      Number(row.revision || 1),
    revisionOfId:
      row.revision_of_id || null,
    rootDiversionId:
      row.root_diversion_id || null,
    revisionReason:
      row.revision_reason || null,
    previousRevisionStatus:
      row.previous_revision_status || null,

    approvedBy:
      row.approved_by || null,
    rejectedBy:
      row.rejected_by || null,
    cancelledBy:
      row.cancelled_by || null,
    supersededBy:
      row.superseded_by || null,

    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,

    submittedForApprovalAt:
      row.submitted_for_approval_at || null,
    approvedAt:
      row.approved_at || null,
    activatedAt:
      row.activated_at || null,
    endedAt:
      row.ended_at || null,
    rejectedAt:
      row.rejected_at || null,
    cancelledAt:
      row.cancelled_at || null,
    supersededAt:
      row.superseded_at || null,
  };
}

function diversionToRow(item) {
  return {
    id: item.id,
    line_id: item.lineId,
    direction: item.direction,
    incident_id: item.incidentId,
    status: item.status,

    incident: item.incident || {},
    route_analysis:
      item.routeAnalysis || {},

    original_route_geometry:
      item.originalRouteGeometry || [],
    affected_geometry:
      item.affectedGeometry || null,
    start_point:
      item.startPoint || null,
    rejoin_point:
      item.rejoinPoint || null,
    waypoint:
      item.waypoint || null,
    geometry:
      item.geometry || null,

    distance_metres:
      Number(item.distanceMetres || 0),
    duration_seconds:
      Number(item.durationSeconds || 0),

    instructions:
      item.instructions || [],
    affected_section:
      item.affectedSection || null,
    risk:
      item.risk || {},

    revision:
      Number(item.revision || 1),
    revision_of_id:
      item.revisionOfId || null,
    root_diversion_id:
      item.rootDiversionId || null,
    revision_reason:
      item.revisionReason || null,
    previous_revision_status:
      item.previousRevisionStatus || null,

    approved_by:
      item.approvedBy || null,
    rejected_by:
      item.rejectedBy || null,
    cancelled_by:
      item.cancelledBy || null,
    superseded_by:
      item.supersededBy || null,

    created_at:
      item.createdAt ||
      new Date().toISOString(),
    updated_at:
      item.updatedAt ||
      new Date().toISOString(),

    submitted_for_approval_at:
      item.submittedForApprovalAt || null,
    approved_at:
      item.approvedAt || null,
    activated_at:
      item.activatedAt || null,
    ended_at:
      item.endedAt || null,
    rejected_at:
      item.rejectedAt || null,
    cancelled_at:
      item.cancelledAt || null,
    superseded_at:
      item.supersededAt || null,
  };
}

function acknowledgementFromRow(row) {
  return {
    id: row.id,
    diversionId:
      row.diversion_id,
    driverName:
      row.driver_name,
    at:
      row.acknowledged_at,
  };
}

function acknowledgementToRow(item) {
  return {
    id: item.id,
    diversion_id:
      item.diversionId,
    driver_name:
      item.driverName || "Driver",
    acknowledged_at:
      item.at ||
      new Date().toISOString(),
  };
}

function reportFromRow(row) {
  return {
    id: row.id,
    diversionId:
      row.diversion_id,
    driverName:
      row.driver_name,
    message:
      row.message,
    at:
      row.reported_at,
    status:
      row.status || "OPEN",
  };
}

function reportToRow(item) {
  return {
    id: item.id,
    diversion_id:
      item.diversionId,
    driver_name:
      item.driverName || "Driver",
    message:
      item.message,
    status:
      item.status || "OPEN",
    reported_at:
      item.at ||
      new Date().toISOString(),
  };
}

function auditFromRow(row) {
  return {
    id: row.id,
    action: row.action,
    details:
      row.details || {},
    at:
      row.created_at,
  };
}

function auditToRow(item) {
  return {
    id: item.id,
    diversion_id:
      item.details?.diversionId ||
      null,
    action:
      item.action,
    details:
      item.details || {},
    created_at:
      item.at ||
      new Date().toISOString(),
  };
}

export async function readStore() {
  const [
    diversionsResult,
    acknowledgementsResult,
    reportsResult,
    auditResult,
  ] = await Promise.all([
    supabase
      .from("diversions")
      .select("*")
      .order(
        "created_at",
        { ascending: false }
      ),

    supabase
      .from(
        "diversion_acknowledgements"
      )
      .select("*")
      .order(
        "acknowledged_at",
        { ascending: false }
      ),

    supabase
      .from(
        "diversion_driver_reports"
      )
      .select("*")
      .order(
        "reported_at",
        { ascending: false }
      ),

    supabase
      .from(
        "diversion_audit"
      )
      .select("*")
      .order(
        "created_at",
        { ascending: false }
      )
      .limit(500),
  ]);

  if (diversionsResult.error) {
    throw new Error(
      `Unable to load diversions: ${diversionsResult.error.message}`
    );
  }

  if (
    acknowledgementsResult.error
  ) {
    throw new Error(
      `Unable to load diversion acknowledgements: ${acknowledgementsResult.error.message}`
    );
  }

  if (reportsResult.error) {
    throw new Error(
      `Unable to load diversion driver reports: ${reportsResult.error.message}`
    );
  }

  if (auditResult.error) {
    throw new Error(
      `Unable to load diversion audit: ${auditResult.error.message}`
    );
  }

  return {
    diversions:
      (
        diversionsResult.data ||
        []
      ).map(diversionFromRow),

    acknowledgements:
      (
        acknowledgementsResult.data ||
        []
      ).map(
        acknowledgementFromRow
      ),

    driverReports:
      (
        reportsResult.data ||
        []
      ).map(reportFromRow),

    audit:
      (
        auditResult.data ||
        []
      ).map(auditFromRow),
  };
}

export async function writeStore(
  store
) {
  const safeStore = {
    ...empty,
    ...(store || {}),
  };

  const diversionRows =
    safeStore.diversions.map(
      diversionToRow
    );

  /*
   * Upsert diversions first.
   * Existing IDs are updated and new
   * IDs are inserted.
   */
  if (diversionRows.length) {
    const { error } =
      await supabase
        .from("diversions")
        .upsert(
          diversionRows,
          {
            onConflict: "id",
          }
        );

    if (error) {
      throw new Error(
        `Unable to save diversions: ${error.message}`
      );
    }
  }

  const acknowledgementRows =
    safeStore.acknowledgements.map(
      acknowledgementToRow
    );

  if (
    acknowledgementRows.length
  ) {
    const { error } =
      await supabase
        .from(
          "diversion_acknowledgements"
        )
        .upsert(
          acknowledgementRows,
          {
            onConflict: "id",
          }
        );

    if (error) {
      throw new Error(
        `Unable to save diversion acknowledgements: ${error.message}`
      );
    }
  }

  const reportRows =
    safeStore.driverReports.map(
      reportToRow
    );

  if (reportRows.length) {
    const { error } =
      await supabase
        .from(
          "diversion_driver_reports"
        )
        .upsert(
          reportRows,
          {
            onConflict: "id",
          }
        );

    if (error) {
      throw new Error(
        `Unable to save diversion driver reports: ${error.message}`
      );
    }
  }

  const auditRows =
    safeStore.audit.map(
      auditToRow
    );

  if (auditRows.length) {
    /*
     * Older audit records can reference
     * operations that no longer exist.
     * The details remain intact while the
     * FK is only stored where appropriate.
     */
    const diversionIds =
      new Set(
        safeStore.diversions.map(
          (item) => item.id
        )
      );

    const safeAuditRows =
      auditRows.map((row) => ({
        ...row,
        diversion_id:
          row.diversion_id &&
          diversionIds.has(
            row.diversion_id
          )
            ? row.diversion_id
            : null,
      }));

    const { error } =
      await supabase
        .from(
          "diversion_audit"
        )
        .upsert(
          safeAuditRows,
          {
            onConflict: "id",
          }
        );

    if (error) {
      throw new Error(
        `Unable to save diversion audit: ${error.message}`
      );
    }
  }

  return safeStore;
}

export function audit(
  store,
  action,
  details = {}
) {
  if (!store.audit) {
    store.audit = [];
  }

  store.audit.unshift({
    id: crypto.randomUUID(),
    action,
    details,
    at:
      new Date().toISOString(),
  });

  return store;
}