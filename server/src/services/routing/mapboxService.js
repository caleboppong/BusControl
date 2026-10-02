import axios from "axios";

const BASE =
  "https://api.mapbox.com/directions/v5/mapbox/driving";

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

  return value
    .replace(/\s+/g, " ")
    .trim();
}

function isIntermediateArrivalStep(step) {
  const type =
    step?.maneuver?.type?.toLowerCase();

  return type === "arrive";
}

function isIntermediateDepartureStep(step) {
  const type =
    step?.maneuver?.type?.toLowerCase();

  return type === "depart";
}

function buildContinuousInstructions(route) {
  const legs = Array.isArray(route?.legs)
    ? route.legs
    : [];

  const instructions = [];

  legs.forEach((leg, legIndex) => {
    const steps = Array.isArray(leg?.steps)
      ? leg.steps
      : [];

    steps.forEach((step, stepIndex) => {
      const instruction = cleanInstruction(
        step?.maneuver?.instruction
      );

      if (!instruction) {
        return;
      }

      const isFirstStep =
        stepIndex === 0;

      const isLastStep =
        stepIndex === steps.length - 1;

      const isFirstLeg =
        legIndex === 0;

      const isLastLeg =
        legIndex === legs.length - 1;

      /*
       * Mapbox treats every waypoint as the end of one leg
       * and the beginning of another.
       *
       * BusControl uses an internal waypoint to influence the
       * generated diversion. That waypoint is not a driver's
       * destination, so intermediate "arrive" and "depart"
       * instructions must not be issued to the driver.
       */

      if (
        !isLastLeg &&
        isLastStep &&
        isIntermediateArrivalStep(step)
      ) {
        return;
      }

      if (
        !isFirstLeg &&
        isFirstStep &&
        isIntermediateDepartureStep(step)
      ) {
        return;
      }

      /*
       * Additional protection against wording returned by
       * different Mapbox instruction variants.
       */

      const lowerInstruction =
        instruction.toLowerCase();

      if (
        !isLastLeg &&
        isLastStep &&
        (
          lowerInstruction.includes(
            "arrived at your destination"
          ) ||
          lowerInstruction.includes(
            "your destination is"
          )
        )
      ) {
        return;
      }

      /*
       * Keep the initial departure instruction and the genuine
       * final arrival instruction.
       */

      if (
        !isFirstLeg &&
        isFirstStep &&
        lowerInstruction.startsWith("drive ")
      ) {
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

      instructions.push(
        instruction
      );
    });
  });

  return instructions;
}

export async function getDrivingRoute(
  points
) {
  const token =
    process.env.MAPBOX_ACCESS_TOKEN;

  if (!token) {
    throw new Error(
      "MAPBOX_ACCESS_TOKEN is not configured on the server."
    );
  }

  if (
    !Array.isArray(points) ||
    points.length < 2
  ) {
    throw new Error(
      "At least two valid coordinates are required to generate a driving route."
    );
  }

  const validPoints =
    points.filter(isCoordinate);

  if (
    validPoints.length !==
    points.length
  ) {
    throw new Error(
      "One or more diversion coordinates are invalid."
    );
  }

  const coords =
    validPoints
      .map(
        ([longitude, latitude]) =>
          `${longitude},${latitude}`
      )
      .join(";");

  const { data } =
    await axios.get(
      `${BASE}/${coords}`,
      {
        params: {
          access_token: token,
          geometries: "geojson",
          overview: "full",
          steps: true,
          alternatives: false,
        },

        timeout: 20000,
      }
    );

  const route =
    data?.routes?.[0];

  if (!route) {
    throw new Error(
      "Mapbox could not generate a diversion route."
    );
  }

  const geometry =
    route?.geometry;

  if (
    !geometry ||
    geometry.type !==
      "LineString" ||
    !Array.isArray(
      geometry.coordinates
    ) ||
    geometry.coordinates.length <
      2
  ) {
    throw new Error(
      "Mapbox returned a route without usable geometry."
    );
  }

  return {
    ...route,

    geometry,

    busControlInstructions:
      buildContinuousInstructions(
        route
      ),
  };
}