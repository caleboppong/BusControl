import supabase from "../supabase.js";

function normaliseRoute(routeNumber) {
  return String(routeNumber || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export async function generateCurtailmentReference(
  routeNumber
) {
  const route = normaliseRoute(
    routeNumber
  );

  if (!route) {
    throw new Error(
      "Route number is required to generate a curtailment reference."
    );
  }

  const { data, error } =
    await supabase.rpc(
      "next_curtailment_reference",
      {
        p_route_number: route,
      }
    );

  if (error) {
    throw new Error(
      `Unable to generate curtailment reference: ${error.message}`
    );
  }

  if (!data) {
    throw new Error(
      "Supabase did not return a curtailment reference."
    );
  }

  return data;
}

export function buildCurtailmentRevisionReference(
  baseReference,
  revision = 1
) {
  const cleanReference = String(
    baseReference || ""
  )
    .trim()
    .replace(/-R\d+$/i, "");

  if (!cleanReference) {
    throw new Error(
      "A curtailment reference is required."
    );
  }

  const revisionNumber =
    Math.max(
      1,
      Number(revision) || 1
    );

  return `${cleanReference}-R${revisionNumber}`;
}