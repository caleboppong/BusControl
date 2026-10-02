import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import supabase from "../services/supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storeFile = path.resolve(__dirname, "../data/store.json");

function readStore() {
  if (!fs.existsSync(storeFile)) {
    throw new Error(`store.json was not found at ${storeFile}`);
  }

  return JSON.parse(fs.readFileSync(storeFile, "utf8"));
}

function diversionToRow(item) {
  return {
    id: item.id,
    line_id: item.lineId,
    direction: item.direction,
    incident_id: item.incidentId,
    status: item.status || "PROPOSED",

    incident: item.incident || {},
    route_analysis: item.routeAnalysis || {},

    original_route_geometry: item.originalRouteGeometry || [],
    affected_geometry: item.affectedGeometry || null,
    start_point: item.startPoint || null,
    rejoin_point: item.rejoinPoint || null,
    waypoint: item.waypoint || null,
    geometry: item.geometry || null,

    distance_metres: Number(item.distanceMetres || 0),
    duration_seconds: Number(item.durationSeconds || 0),

    instructions: item.instructions || [],
    affected_section: item.affectedSection || null,
    risk: item.risk || {},

    revision: Number(item.revision || 1),
    revision_of_id: item.revisionOfId || null,
    root_diversion_id: item.rootDiversionId || null,
    revision_reason: item.revisionReason || null,
    previous_revision_status: item.previousRevisionStatus || null,

    approved_by: item.approvedBy || null,
    rejected_by: item.rejectedBy || null,
    cancelled_by: item.cancelledBy || null,
    superseded_by: item.supersededBy || null,

    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || item.createdAt || new Date().toISOString(),

    submitted_for_approval_at: item.submittedForApprovalAt || null,
    approved_at: item.approvedAt || null,
    activated_at: item.activatedAt || null,
    ended_at: item.endedAt || null,
    rejected_at: item.rejectedAt || null,
    cancelled_at: item.cancelledAt || null,
    superseded_at: item.supersededAt || null,
  };
}

function acknowledgementToRow(item) {
  return {
    id: item.id,
    diversion_id: item.diversionId,
    driver_name: item.driverName || "Driver",
    acknowledged_at: item.at || new Date().toISOString(),
  };
}

function reportToRow(item) {
  return {
    id: item.id,
    diversion_id: item.diversionId,
    driver_name: item.driverName || "Driver",
    message: item.message,
    status: item.status || "OPEN",
    reported_at: item.at || new Date().toISOString(),
  };
}

function auditToRow(item) {
  return {
    id: item.id,
    diversion_id: item.details?.diversionId || null,
    action: item.action,
    details: item.details || {},
    created_at: item.at || new Date().toISOString(),
  };
}

async function upsertRows(table, rows) {
  if (!rows.length) {
    console.log(`${table}: no records to migrate`);
    return;
  }

  const { error } = await supabase
    .from(table)
    .upsert(rows, {
      onConflict: "id",
    });

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  console.log(`${table}: migrated ${rows.length} record(s)`);
}

async function migrate() {
  console.log("");
  console.log("========================================");
  console.log(" BusControl Diversion Migration");
  console.log("========================================");

  const store = readStore();

  const diversions = Array.isArray(store.diversions)
    ? store.diversions
    : [];

  const acknowledgements = Array.isArray(store.acknowledgements)
    ? store.acknowledgements
    : [];

  const driverReports = Array.isArray(store.driverReports)
    ? store.driverReports
    : [];

  const audit = Array.isArray(store.audit)
    ? store.audit
    : [];

  console.log(`Diversions found: ${diversions.length}`);
  console.log(`Acknowledgements found: ${acknowledgements.length}`);
  console.log(`Driver reports found: ${driverReports.length}`);
  console.log(`Audit records found: ${audit.length}`);
  console.log("");

  /*
   * Diversions can reference other diversions through
   * revision_of_id, root_diversion_id and superseded_by.
   *
   * Import them first without those relationships so PostgreSQL
   * foreign-key checks do not depend on JSON ordering.
   */
  const diversionRows = diversions.map(diversionToRow);

  const firstPass = diversionRows.map((row) => ({
    ...row,
    revision_of_id: null,
    root_diversion_id: null,
    superseded_by: null,
  }));

  await upsertRows("diversions", firstPass);

  /*
   * Second pass restores the diversion relationships after every
   * diversion ID exists in PostgreSQL.
   */
  for (const row of diversionRows) {
    const { error } = await supabase
      .from("diversions")
      .update({
        revision_of_id: row.revision_of_id,
        root_diversion_id: row.root_diversion_id,
        superseded_by: row.superseded_by,
      })
      .eq("id", row.id);

    if (error) {
      throw new Error(
        `Unable to restore diversion relationship for ${row.id}: ${error.message}`
      );
    }
  }

  console.log("diversions: revision relationships restored");

  await upsertRows(
    "diversion_acknowledgements",
    acknowledgements.map(acknowledgementToRow)
  );

  await upsertRows(
    "diversion_driver_reports",
    driverReports.map(reportToRow)
  );

  /*
   * Some old audit records may not have a valid diversion ID.
   * Keep their details, but only use a foreign key where the
   * referenced diversion exists in this migration.
   */
  const diversionIds = new Set(diversions.map((item) => item.id));

  const auditRows = audit.map(auditToRow).map((row) => ({
    ...row,
    diversion_id:
      row.diversion_id && diversionIds.has(row.diversion_id)
        ? row.diversion_id
        : null,
  }));

  await upsertRows("diversion_audit", auditRows);

  console.log("");
  console.log("========================================");
  console.log(" Migration completed successfully");
  console.log("========================================");
  console.log("");
}

migrate().catch((error) => {
  console.error("");
  console.error("Migration failed:");
  console.error(error.message);
  console.error("");
  process.exit(1);
});