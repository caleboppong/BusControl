import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  InfoWindow,
  Map,
  Marker,
  Polyline,
  useMap,
} from "@vis.gl/react-google-maps";

const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const LONDON_CENTER = {
  lat: 51.509,
  lng: -0.118,
};

function getMarkerClass(severity) {
  const value = severity?.toLowerCase();

  if (
    value === "serious" ||
    value === "severe"
  ) {
    return "incident-marker incident-marker--serious";
  }

  if (value === "moderate") {
    return "incident-marker incident-marker--moderate";
  }

  return "incident-marker incident-marker--minimal";
}

function validCoordinate(coordinate) {
  return (
    Array.isArray(coordinate) &&
    coordinate.length >= 2 &&
    Number.isFinite(Number(coordinate[0])) &&
    Number.isFinite(Number(coordinate[1]))
  );
}

function normaliseCoordinate(coordinate) {
  if (!validCoordinate(coordinate)) {
    return null;
  }

  return [
    Number(coordinate[0]),
    Number(coordinate[1]),
  ];
}

function collectGeometryCoordinates(geometry) {
  if (!geometry) {
    return [];
  }

  if (Array.isArray(geometry)) {
    return geometry
      .map(normaliseCoordinate)
      .filter(Boolean);
  }

  if (
    geometry.type === "LineString" &&
    Array.isArray(geometry.coordinates)
  ) {
    return geometry.coordinates
      .map(normaliseCoordinate)
      .filter(Boolean);
  }

  return [];
}

function toGooglePath(geometry) {
  return collectGeometryCoordinates(geometry).map(
    ([longitude, latitude]) => ({
      lat: latitude,
      lng: longitude,
    })
  );
}

function OperationalMapController({
  operationalCoordinates,
  diversionGeometry,
  affectedGeometry,
}) {
  const map = useMap();

  useEffect(() => {
    if (
      !map ||
      !Array.isArray(operationalCoordinates) ||
      operationalCoordinates.length === 0
    ) {
      return;
    }

    const bounds =
      new window.google.maps.LatLngBounds();

    let validCount = 0;

    operationalCoordinates.forEach(
      (coordinate) => {
        if (!validCoordinate(coordinate)) {
          return;
        }

        bounds.extend({
          lat: Number(coordinate[1]),
          lng: Number(coordinate[0]),
        });

        validCount += 1;
      }
    );

    if (validCount === 0) {
      return;
    }

    const hasOperationalArea =
      collectGeometryCoordinates(
        diversionGeometry
      ).length > 1 ||
      collectGeometryCoordinates(
        affectedGeometry
      ).length > 1;

    const timer = window.setTimeout(() => {
      map.fitBounds(
        bounds,
        hasOperationalArea ? 70 : 50
      );

      window.setTimeout(() => {
        const currentZoom = map.getZoom();

        const maximumZoom =
          hasOperationalArea ? 16 : 14;

        if (
          typeof currentZoom === "number" &&
          currentZoom > maximumZoom
        ) {
          map.setZoom(maximumZoom);
        }
      }, 100);
    }, 150);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    map,
    operationalCoordinates,
    diversionGeometry,
    affectedGeometry,
  ]);

  return null;
}

function GoogleControlMap({
  disruptions = [],
  selectedIncident,
  onSelectIncident,
  routeGeometry = null,
  routeStops = [],
  routeNumber = "",
  direction = "outbound",
  routeMatchedIncidents = [],
  diversionGeometry = null,
  affectedGeometry = null,
  diversionEditMode = "VIEW",
  diversionDraftPoints = [],
  onDiversionMapClick,
  onRemoveDiversionDraftPoint,
}) {
  const [popupIncident, setPopupIncident] =
    useState(null);

  const validDisruptions = useMemo(
    () =>
      disruptions.filter((incident) => {
        const coordinates =
          incident?.geography?.coordinates;

        return validCoordinate(coordinates);
      }),
    [disruptions]
  );

  const routeMatchedIds = useMemo(
    () =>
      new Set(
        routeMatchedIncidents
          .map(
            (match) =>
              match?.incident?.id
          )
          .filter(Boolean)
      ),
    [routeMatchedIncidents]
  );

  const routePath = useMemo(
    () => toGooglePath(routeGeometry),
    [routeGeometry]
  );

  const affectedPath = useMemo(
    () => toGooglePath(affectedGeometry),
    [affectedGeometry]
  );

  const diversionPath = useMemo(
    () => toGooglePath(diversionGeometry),
    [diversionGeometry]
  );

  const operationalCoordinates =
    useMemo(() => {
      const coordinates = [];

      const diversion =
        collectGeometryCoordinates(
          diversionGeometry
        );

      const affected =
        collectGeometryCoordinates(
          affectedGeometry
        );

      /*
       * Operational diversion view.
       *
       * When a diversion or affected section
       * exists, fit the map to that operational
       * area rather than the complete bus route.
       */
      if (
        diversion.length ||
        affected.length
      ) {
        coordinates.push(
          ...affected,
          ...diversion
        );

        const incidentCoordinate =
          normaliseCoordinate(
            selectedIncident
              ?.geography
              ?.coordinates
          );

        if (incidentCoordinate) {
          coordinates.push(
            incidentCoordinate
          );
        }

        return coordinates;
      }

      /*
       * Normal route-analysis view.
       */
      const routeCoordinates =
        collectGeometryCoordinates(
          routeGeometry
        );

      if (routeCoordinates.length) {
        return routeCoordinates;
      }

      /*
       * Final fallback: bus stops.
       */
      return routeStops
        .filter(
          (stop) =>
            Number.isFinite(
              Number(stop.longitude)
            ) &&
            Number.isFinite(
              Number(stop.latitude)
            )
        )
        .map((stop) => [
          Number(stop.longitude),
          Number(stop.latitude),
        ]);
    }, [
      routeGeometry,
      routeStops,
      affectedGeometry,
      diversionGeometry,
      selectedIncident,
    ]);

  useEffect(() => {
    setPopupIncident(null);
  }, [routeNumber, direction]);

  function selectIncident(incident) {
    setPopupIncident(incident);
    onSelectIncident?.(incident);
  }

  const drawingDiversion =
    diversionEditMode === "DRAW" ||
    diversionEditMode === "EDIT";

  const draftPath = diversionDraftPoints
    .filter(validCoordinate)
    .map(([longitude, latitude]) => ({
      lat: Number(latitude),
      lng: Number(longitude),
    }));

  function handleMapClick(event) {
    if (!drawingDiversion) {
      return;
    }

    const lat = event?.detail?.latLng?.lat;
    const lng = event?.detail?.latLng?.lng;

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return;
    }

    onDiversionMapClick?.([
      lng,
      lat,
    ]);
  }

  return (
    <Map
      defaultCenter={LONDON_CENTER}
      onClick={handleMapClick}
      defaultZoom={10.5}
      gestureHandling="greedy"
      mapTypeControl={false}
      streetViewControl={false}
      fullscreenControl
      zoomControl
      style={{
        width: "100%",
        height: "100%",
      }}
    >
      <OperationalMapController
        operationalCoordinates={
          operationalCoordinates
        }
        diversionGeometry={
          diversionGeometry
        }
        affectedGeometry={
          affectedGeometry
        }
      />

      {routePath.length > 1 && (
        <>
          <Polyline
            path={routePath}
            strokeColor="#06101d"
            strokeWeight={9}
            strokeOpacity={0.9}
            clickable={false}
            zIndex={1}
          />

          <Polyline
            path={routePath}
            strokeColor="#4388ff"
            strokeWeight={5}
            strokeOpacity={1}
            clickable={false}
            zIndex={2}
          />
        </>
      )}

      {affectedPath.length > 1 && (
        <Polyline
          path={affectedPath}
          strokeColor="#ff5a67"
          strokeWeight={9}
          strokeOpacity={0.9}
          clickable={false}
          zIndex={3}
        />
      )}

      {drawingDiversion &&
        draftPath.length > 1 && (
          <Polyline
            path={draftPath}
            strokeColor="#00d9ff"
            strokeWeight={4}
            strokeOpacity={0.9}
            clickable={false}
            zIndex={20}
            icons={[
              {
                icon: {
                  path: "M 0,-1 0,1",
                  strokeOpacity: 1,
                  scale: 3,
                },
                offset: "0",
                repeat: "14px",
              },
            ]}
          />
        )}

      {drawingDiversion &&
        draftPath.map((position, index) => {
          const isStart = index === 0;
          const isLast =
            index === draftPath.length - 1;

          const label = isStart
            ? "S"
            : isLast
              ? "R"
              : String(index);

          return (
            <Marker
              key={`diversion-draft-${index}`}
              position={position}
              title={
                isStart
                  ? "Diversion start"
                  : isLast
                    ? "Current rejoin point"
                    : `Diversion waypoint ${index}`
              }
              label={{
                text: label,
                color: "#ffffff",
                fontSize: "11px",
                fontWeight: "800",
              }}
              icon={{
                path:
                  window.google.maps
                    .SymbolPath.CIRCLE,
                scale: 10,
                fillColor: isStart
                  ? "#4388ff"
                  : isLast
                    ? "#3ed598"
                    : "#00d9ff",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 2,
              }}
              zIndex={60 + index}
              onClick={() =>
                onRemoveDiversionDraftPoint?.(
                  index
                )
              }
            />
          );
        })}

      {diversionPath.length > 1 && (
        <Polyline
          path={diversionPath}
          strokeColor="#3ed598"
          strokeWeight={7}
          strokeOpacity={1}
          clickable={false}
          zIndex={4}
          icons={[
            {
              icon: {
                path: "M 0,-1 0,1",
                strokeOpacity: 1,
                scale: 3,
              },
              offset: "0",
              repeat: "18px",
            },
          ]}
        />
      )}



      {routeStops.map((stop, index) => {
        const latitude =
          Number(stop.latitude);

        const longitude =
          Number(stop.longitude);

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          return null;
        }

        return (
          <Marker
            key={`${stop.id}-${index}`}
            position={{
              lat: latitude,
              lng: longitude,
            }}
            title={stop.name}
            icon={{
              path:
                window.google.maps.SymbolPath.CIRCLE,
              scale: 4,
              fillColor: "#ffffff",
              fillOpacity: 1,
              strokeColor: "#4388ff",
              strokeWeight: 2,
            }}
            zIndex={10}
          />
        );
      })}

      {validDisruptions.map(
        (incident) => {
          const [
            longitude,
            latitude,
          ] =
            incident.geography.coordinates;

          const selected =
            selectedIncident?.id ===
            incident.id;

          const routeMatched =
            routeMatchedIds.has(
              incident.id
            );

          return (
            <Marker
              key={incident.id}
              position={{
                lat: Number(latitude),
                lng: Number(longitude),
              }}
              title={
                incident.location ||
                "Road disruption"
              }
              label={{
                text: "!",
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: "800",
              }}
              icon={{
                path:
                  window.google.maps
                    .SymbolPath.CIRCLE,
                scale: selected
                  ? 12
                  : routeMatched
                    ? 11
                    : 9,
                fillColor:
                  incident.severity
                    ?.toLowerCase() ===
                    "serious" ||
                    incident.severity
                      ?.toLowerCase() ===
                    "severe"
                    ? "#ff5a67"
                    : incident.severity
                      ?.toLowerCase() ===
                      "moderate"
                      ? "#ffb020"
                      : "#4388ff",
                fillOpacity: 1,
                strokeColor:
                  routeMatched
                    ? "#00d9ff"
                    : "#ffffff",
                strokeWeight:
                  selected ? 4 : 2,
              }}
              zIndex={
                selected
                  ? 50
                  : routeMatched
                    ? 40
                    : 30
              }
              onClick={() =>
                selectIncident(incident)
              }
            />
          );
        }
      )}

      {popupIncident?.geography
        ?.coordinates && (
          <InfoWindow
            position={{
              lat: Number(
                popupIncident.geography
                  .coordinates[1]
              ),
              lng: Number(
                popupIncident.geography
                  .coordinates[0]
              ),
            }}
            onClose={() =>
              setPopupIncident(null)
            }
            maxWidth={330}
          >
            <div className="map-popup">
              <strong>
                {popupIncident.location ||
                  "Road disruption"}
              </strong>

              <span>
                {popupIncident.category ||
                  "Incident"}{" "}
                ·{" "}
                {popupIncident.severity ||
                  "Unknown severity"}
              </span>

              <p>
                {popupIncident.comments ||
                  popupIncident.currentUpdate ||
                  "No additional information available."}
              </p>

              <button
                type="button"
                onClick={() =>
                  selectIncident(
                    popupIncident
                  )
                }
              >
                Open incident
              </button>
            </div>
          </InfoWindow>
        )}
    </Map>
  );
}

function ControlMap(props) {
  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="control-map">
        <div
          style={{
            padding: "24px",
            color: "#ffb020",
          }}
        >
          Google Maps API key is missing.
          Add
          {" "}
          VITE_GOOGLE_MAPS_API_KEY
          {" "}
          to client/.env and restart Vite.
        </div>
      </div>
    );
  }

  return (
    <div className="control-map">
      <APIProvider
        apiKey={GOOGLE_MAPS_API_KEY}
        region="GB"
        language="en-GB"
        onError={(error) => {
          console.error(
            "Google Maps failed to load:",
            error
          );
        }}
      >
        <GoogleControlMap {...props} />
      </APIProvider>
    </div>
  );
}

export default ControlMap;