import { useEffect, useMemo, useState } from "react";
import Login from "./components/auth/Login";
import {
  getCurrentUserProfile,
  getSession,
  onAuthStateChange,
  signOut,
} from "./services/authService";
import ControlMap from "./maps/ControlMap";
import Vehicles from "./components/management/Vehicles";
import Reports from "./components/management/Reports";
import History from "./components/management/History";
import Curtailments from "./components/operations/Curtailments";
import UserManagement from "./components/admin/UserManagement";

import {
  acknowledgeDiversion,
  acceptManualDiversionRoute,
  analyseIncident,
  analyseRoute,
  calculateManualDiversionRoute,
  detectAffectedRoutes,
  generateDiversion,
  getBusLines,
  getLineStatus,
  getOperations,
  getRoadDisruptions,
  reportDiversionProblem,
  setDiversionStatus,
  acknowledgeCurtailment,
  getCurtailmentOperations,
  reportCurtailmentProblem,
} from "./services/busControlApi";

import "./App.css";
const NAV = [
  "Control Board",
  "Incidents",
  "Diversions",
  "Curtailments",
  "Routes",
  "Drivers",
  "Vehicles",
  "Reports",
  "History",
  "Administration",
];
const fmtDistance = (value) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${value || 0} m`;
const fmtDuration = (value) =>
  `${Math.max(1, Math.round((value || 0) / 60))} min`;
const when = (value) =>
  value ? new Date(value).toLocaleString("en-GB") : "—";

function Shell({ user, onLogout, children }) {
  const roleLabel =
    user?.role === "SUPER_ADMIN"
      ? "Super Admin"
      : user?.role === "CONTROLLER"
        ? "Controller"
        : "Driver";

  return (
    <div className="controller-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">BC</div>
          <div>
            <h1>BusControl</h1>
            <span>Live Diversion Management</span>
          </div>
        </div>

        <div className="topbar-status">
          <span className="live-indicator">
            <span className="live-dot" />
            LIVE
          </span>

          <div className="account-summary">
            <strong>{user?.fullName || user?.email}</strong>
            <span>{roleLabel}</span>
          </div>

          <button
            type="button"
            className="secondary-action"
            onClick={onLogout}
          >
            Sign out
          </button>
        </div>
      </header>

      {children}
    </div>
  );
}

function Heading({ kicker, title, text, children }) {
  return (
    <section className="workspace-heading">
      <div>
        <span className="eyebrow">{kicker}</span>
        <h2>{title}</h2>
        {text && <p>{text}</p>}
      </div>
      {children}
    </section>
  );
}
function RouteForm({
  routeSearch,
  setRouteSearch,
  direction,
  setDirection,
  search,
  busy,
  submitLabel = "Analyse Route",
}) {
  return (
    <form className="route-search-form" onSubmit={search}>
      <div className="route-input-group">
        <label>Bus route</label>
        <input
          value={routeSearch}
          onChange={(event) => setRouteSearch(event.target.value)}
          placeholder="e.g. 55"
        />
      </div>
      <div className="route-input-group">
        <label>Direction</label>
        <select
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
        >
          <option value="outbound">Outbound</option>
          <option value="inbound">Inbound</option>
        </select>
      </div>
      <button className="analyse-route-button" disabled={busy}>
        {busy ? "Working..." : submitLabel}
      </button>
    </form>
  );
}
function Proposal({ diversion, onStatus, busy }) {
  return (
    <div className="proposal">
      <div className="proposal-title">
        <h3>Route {diversion.lineId} diversion</h3>
        <span className={`status-pill status-${diversion.status.toLowerCase()}`}>
          {diversion.status.replaceAll("_", " ")}
        </span>
      </div>
      <div className="workflow-grid">
        <div>
          <span>DISTANCE</span>
          <strong>{fmtDistance(diversion.distanceMetres)}</strong>
        </div>
        <div>
          <span>EST. TIME</span>
          <strong>{fmtDuration(diversion.durationSeconds)}</strong>
        </div>
        <div>
          <span>POTENTIAL MISSED STOPS</span>
          <strong>{diversion.potentiallyMissedStops?.length || 0}</strong>
        </div>
        <div>
          <span>REVISION</span>
          <strong>{diversion.revision || 1}</strong>
        </div>
      </div>
      <div className="risk-box">
        <strong>Controller safety review required</strong>
        {diversion.risk?.warnings?.map((warning, index) => (
          <p key={index}>• {warning}</p>
        ))}
      </div>
      {diversion.potentiallyMissedStops?.length > 0 && (
        <details>
          <summary>Potentially affected stops</summary>
          <ol>
            {diversion.potentiallyMissedStops.map((stop) => (
              <li key={stop.id}>{stop.name}</li>
            ))}
          </ol>
        </details>
      )}
      <details>
        <summary>Turn-by-turn proposal</summary>
        <ol>
          {diversion.instructions?.map((instruction, index) => (
            <li key={index}>{instruction}</li>
          ))}
        </ol>
      </details>
      <div className="incident-actions">
        {diversion.status === "PROPOSED" && (
          <button
            className="secondary-action"
            disabled={busy}
            onClick={() => onStatus("AWAITING_APPROVAL")}
          >
            Send for Approval
          </button>
        )}
        {["PROPOSED", "AWAITING_APPROVAL"].includes(diversion.status) && (
          <>
            <button
              className="secondary-action"
              disabled={busy}
              onClick={() => onStatus("REJECTED")}
            >
              Reject
            </button>
            <button
              className="primary-action"
              disabled={busy}
              onClick={() => onStatus("APPROVED")}
            >
              Approve
            </button>
          </>
        )}
        {diversion.status === "APPROVED" && (
          <button
            className="primary-action"
            disabled={busy}
            onClick={() => onStatus("ACTIVE")}
          >
            Activate & Issue to Drivers
          </button>
        )}
        {diversion.status === "ACTIVE" && (
          <button
            className="primary-action"
            disabled={busy}
            onClick={() => onStatus("ENDED")}
          >
            End Diversion
          </button>
        )}
      </div>
    </div>
  );
}
function ControlBoard(props) {
  return (
    <>
      <Heading
        kicker="LIVE OPERATIONS"
        title="Controller Control Board"
        text="Analyse routes, investigate incidents, approve diversions and monitor live operations."
      />
      <section className="stat-grid">
        <article className="stat-card">
          <span>LIVE INCIDENTS</span>
          <strong>{props.disruptions.length}</strong>
        </article>
        <article className="stat-card serious">
          <span>SERIOUS</span>
          <strong>{props.serious}</strong>
        </article>
        <article className="stat-card">
          <span>PENDING REVIEW</span>
          <strong>{props.pending}</strong>
        </article>
        <article className="stat-card">
          <span>ACTIVE DIVERSIONS</span>
          <strong>{props.active}</strong>
        </article>
      </section>
      <section className="route-control-panel">
        <span className="panel-kicker">ROUTE INTELLIGENCE</span>
        <h3>Analyse a London bus route</h3>
        <RouteForm {...props} />
        {props.route && (
          <div className="route-summary">
            <div>
              <span>Route</span>
              <strong>{props.route}</strong>
            </div>
            <div>
              <span>Direction</span>
              <strong>{props.direction}</strong>
            </div>
            <div>
              <span>Stops</span>
              <strong>{props.stops.length}</strong>
            </div>
            <div>
              <span>Route matched</span>
              <strong>{props.matches.length}</strong>
            </div>
          </div>
        )}
      </section>
      <section className="operations-grid">
        <div className="map-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">OPERATIONAL MAP</span>
              <h3>Route, incident and diversion</h3>
            </div>
          </div>
          <ControlMap
            disruptions={props.disruptions}
            selectedIncident={props.selected}
            onSelectIncident={props.openIncident}
            routeGeometry={props.geometry}
            routeStops={props.stops}
            routeNumber={props.route}
            direction={props.direction}
            routeMatchedIncidents={props.matches}
            affectedGeometry={props.affected?.affectedGeometry}
            diversionGeometry={
              props.manualDiversionPreview?.geometry ||
              (["DRAW", "EDIT"].includes(props.diversionEditMode)
                ? null
                : props.proposal?.geometry)
            }
            diversionEditMode={props.diversionEditMode}
            diversionDraftPoints={props.diversionDraftPoints}
            onDiversionMapClick={props.onDiversionMapClick}
            onRemoveDiversionDraftPoint={props.onRemoveDiversionDraftPoint}
          />
        </div>
        <aside className="incident-panel">
          <div className="panel-heading">
            <h3>Matched incidents</h3>
            <span className="incident-count">{props.matches.length}</span>
          </div>
          <div className="incident-list">
            {props.matches.map((match) => (
              <button
                key={match.incident.id}
                className="incident-card"
                onClick={() => props.openIncident(match.incident)}
              >
                <strong>{match.incident.location}</strong>
                <p>{match.incident.comments || match.incident.currentUpdate}</p>
                <small>{match.distanceMetres}m from route · Investigate →</small>
              </button>
            ))}
            {!props.matches.length && (
              <div className="empty-state">
                No current incidents matched to this route.
              </div>
            )}
          </div>
        </aside>
      </section>
      <section className="selected-incident-panel">
        <h3>Current operations</h3>
        <div className="diversion-table">
          {(props.ops.diversions || []).slice(0, 8).map((diversion) => {
            const ackCount = (props.ops.acknowledgements || []).filter(
              (item) => item.diversionId === diversion.id
            ).length;
            const reportCount = (props.ops.driverReports || []).filter(
              (item) => item.diversionId === diversion.id
            ).length;
            return (
              <button
                key={diversion.id}
                onClick={() => props.openDiversion(diversion)}
              >
                <strong>Route {diversion.lineId}</strong>
                <span>{diversion.direction}</span>
                <span className={`status-pill status-${diversion.status.toLowerCase()}`}>
                  {diversion.status.replaceAll("_", " ")}
                </span>
                <span>
                  {diversion.incident?.location} · {ackCount} ack · {reportCount} report{reportCount === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
          {!props.ops.diversions?.length && (
            <div className="empty-state">No diversion records yet.</div>
          )}
        </div>
      </section>
    </>
  );
}
function Incidents({
  items,
  filter,
  setFilter,
  selected,
  onSelect,
  routeSearch,
  setRouteSearch,
  direction,
  setDirection,
  analyseSelected,
  affected,
  proposal,
  makeDiversion,
  status,
  busy,
  geometry,
  stops,
  matches,
  detectedRoutes,
  detectionInfo,
  detecting,
  chooseDetectedRoute,
  refreshDetection,
  diversionEditMode,
  diversionDraftPoints,
  onDiversionMapClick,
  onRemoveDiversionDraftPoint,
  startDrawingDiversion,
  startEditingDiversion,
  undoDiversionPoint,
  clearDiversionDrawing,
  cancelDiversionEditing,
  cancelDiversionProposal,
  manualDiversionPreview,
  calculateDiversionPreview,
  acceptDiversionPreview,
  useSuggestedDiversion,
}) {
  return (
    <>
      <Heading
        kicker="LIVE OPERATIONS"
        title="Incidents"
        text="Select a live TfL incident, choose the bus route and direction, analyse the impact and create a controller-reviewed diversion."
      />
      {selected && (
        <section className="selected-incident-panel">
          <div className="selected-incident-header">
            <div>
              <span className="panel-kicker">INCIDENT COMMAND</span>
              <h3>{selected.location || "London road disruption"}</h3>
            </div>
            <span
              className={`severity-badge severity-${selected.severity?.toLowerCase()}`}
            >
              {selected.severity || "Unknown"}
            </span>
          </div>
          <p className="selected-description">
            {selected.comments || selected.currentUpdate || "No description available."}
          </p>
          <div className="selected-incident-panel">
            <div className="selected-incident-header">
              <div>
                <span className="panel-kicker">AUTOMATIC ROUTE DETECTION</span>
                <h3>Affected bus routes</h3>
              </div>
              <button className="secondary-action" disabled={detecting || busy} onClick={refreshDetection}>
                {detecting ? "Detecting..." : "Refresh Detection"}
              </button>
            </div>
            {detecting && <div className="empty-state">Checking nearby TfL stops and bus route geometry...</div>}
            {!detecting && detectionInfo && (
              <div className="workflow-grid">
                <div><span>NEARBY STOPS</span><strong>{detectionInfo.nearbyStops || 0}</strong></div>
                <div><span>CANDIDATE ROUTES</span><strong>{detectionInfo.candidateRoutes || 0}</strong></div>
                <div><span>DETECTED</span><strong>{detectionInfo.detectedRoutes || 0}</strong></div>
                <div><span>HIGH CONFIDENCE</span><strong>{detectionInfo.highConfidenceRoutes || 0}</strong></div>
              </div>
            )}
            {!detecting && detectedRoutes.length > 0 && (
              <div className="cards-grid">
                {detectedRoutes.map((item) => (
                  <article className="management-card" key={`${item.lineId}-${item.direction}`}>
                    <div className="proposal-title">
                      <h3>Route {item.lineId} · {item.direction}</h3>
                      <span className={`status-pill status-${item.confidence === "HIGH" ? "active" : "proposed"}`}>
                        {item.confidence} CONFIDENCE
                      </span>
                    </div>
                    <p>{Math.round(item.distanceFromRouteMetres || 0)} m from incident · {item.affectedStops || 0} affected stops</p>
                    {item.autoProposalEligible && <small>Recommended for controller review</small>}
                    <div className="incident-actions">
                      <button
                        className={item.autoProposalEligible ? "primary-action" : "secondary-action"}
                        disabled={busy}
                        onClick={() => chooseDetectedRoute(item)}
                      >
                        Analyse This Route
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {!detecting && detectionInfo && !detectedRoutes.length && (
              <div className="empty-state">No affected bus routes were detected automatically. Use the manual route analysis below.</div>
            )}
          </div>
          <span className="panel-kicker">MANUAL ROUTE ANALYSIS</span>
          <RouteForm
            routeSearch={routeSearch}
            setRouteSearch={setRouteSearch}
            direction={direction}
            setDirection={setDirection}
            search={analyseSelected}
            busy={busy}
            submitLabel="Analyse Impact"
          />
          {affected && (
            <>
              <div className="workflow-grid">
                <div>
                  <span>DISTANCE FROM ROUTE</span>
                  <strong>{affected.distanceFromRouteMetres} m</strong>
                </div>
                <div>
                  <span>AFFECTED STOPS</span>
                  <strong>{affected.affectedStopCount}</strong>
                </div>
                <div>
                  <span>ANALYSIS RADIUS</span>
                  <strong>{affected.analysisRadiusMetres} m</strong>
                </div>
                <div>
                  <span>DIRECTION</span>
                  <strong>{direction}</strong>
                </div>
              </div>
              {affected.distanceFromRouteMetres > 300 && (
                <div className="risk-box">
                  <strong>Route verification required</strong>
                  <p>
                    This incident is more than 300 metres from the selected route.
                    Confirm that the route is genuinely affected before continuing.
                  </p>
                </div>
              )}
              <div className="map-panel routes-map">
                <ControlMap
                  disruptions={[selected]}
                  selectedIncident={selected}
                  routeGeometry={geometry}
                  routeStops={stops}
                  routeNumber={routeSearch}
                  direction={direction}
                  routeMatchedIncidents={matches}
                  affectedGeometry={affected.affectedGeometry}
                  diversionGeometry={
                    manualDiversionPreview?.geometry ||
                    (["DRAW", "EDIT"].includes(diversionEditMode)
                      ? null
                      : proposal?.geometry)
                  }
                  diversionEditMode={diversionEditMode}
                  diversionDraftPoints={diversionDraftPoints}
                  onDiversionMapClick={onDiversionMapClick}
                  onRemoveDiversionDraftPoint={onRemoveDiversionDraftPoint}
                />
              </div>
              {!proposal ? (
                <div className="incident-actions">
                  <button
                    className="primary-action"
                    disabled={busy || affected.distanceFromRouteMetres > 300}
                    onClick={makeDiversion}
                  >
                    {busy ? "Generating..." : "Generate Diversion Proposal"}
                  </button>
                </div>
              ) : (
                <>
                  <div className="diversion-editor">
                    <div className="diversion-editor-heading">
                      <div>
                        <span className="panel-kicker">DIVERSION ROUTE CONTROL</span>
                        <h3>
                          {diversionEditMode === "DRAW"
                            ? "Draw Different Diversion"
                            : diversionEditMode === "EDIT"
                              ? "Edit Suggested Route"
                              : "Automatic Diversion Proposal"}
                        </h3>
                      </div>
                      {diversionEditMode !== "VIEW" && (
                        <span className="status-pill status-proposed">
                          {diversionDraftPoints.length} POINTS
                        </span>
                      )}
                    </div>

                    {diversionEditMode === "VIEW" ? (
                      <>
                        <p className="diversion-editor-help">
                          Use the Google-generated suggestion, edit its routing points,
                          or draw a different road-following diversion before approval.
                        </p>
                        <div className="diversion-editor-actions">
                          <button
                            className="secondary-action"
                            disabled={busy}
                            onClick={useSuggestedDiversion}
                          >
                            Use Suggested Route
                          </button>
                          <button
                            className="secondary-action"
                            disabled={busy}
                            onClick={startEditingDiversion}
                          >
                            Edit Suggested Route
                          </button>
                          <button
                            className="primary-action"
                            disabled={busy}
                            onClick={startDrawingDiversion}
                          >
                            Draw Different Diversion
                          </button>
                          <button
                            className="danger-action"
                            disabled={busy}
                            onClick={cancelDiversionProposal}
                          >
                            Cancel Proposal
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="diversion-drawing-guide">
                          <strong>
                            {diversionEditMode === "DRAW"
                              ? "Click START → optional road waypoints → REJOIN"
                              : "Click the map to add routing points, or click a cyan marker to remove it."}
                          </strong>
                          <span>
                            Google Routes will convert these points into a road-following bus diversion.
                          </span>
                        </div>

                        {manualDiversionPreview?.requiresOverride && (
                          <div className="controller-override-warning">
                            <strong>CONTROLLER OVERRIDE REQUIRED</strong>

                            <p>
                              Google Routes could not safely reproduce{" "}
                              {manualDiversionPreview.failedSegments?.length || 0}{" "}
                              controller-selected movement(s). Review each movement below
                              before accepting this diversion.
                            </p>

                            <div className="controller-override-segments">
                              {(manualDiversionPreview.failedSegments || []).map((segment) => {
                                const segmentIndex = Number(segment.index) || 0;
                                const totalPoints =
                                  manualDiversionPreview.controllerPoints?.length ||
                                  diversionDraftPoints.length;

                                const fromLabel =
                                  segmentIndex === 0 ? "S" : String(segmentIndex);

                                const toLabel =
                                  segmentIndex + 1 === totalPoints - 1
                                    ? "R"
                                    : String(segmentIndex + 1);

                                const reasonLabel =
                                  segment.reason === "EXCESSIVE_GOOGLE_DETOUR"
                                    ? "Excessive Google detour"
                                    : segment.reason === "GOOGLE_ROUTE_UNAVAILABLE"
                                      ? "Google route unavailable"
                                      : "Controller review required";

                                return (
                                  <div
                                    className="controller-override-segment"
                                    key={`override-${segmentIndex}`}
                                  >
                                    <div className="controller-override-segment-heading">
                                      <strong>
                                        {fromLabel} → {toLabel}
                                      </strong>

                                      <span>{reasonLabel}</span>
                                    </div>

                                    {segment.reason === "EXCESSIVE_GOOGLE_DETOUR" && (
                                      <div className="controller-override-metrics">
                                        <span>
                                          Direct:{" "}
                                          {Number(segment.directDistanceMetres || 0).toLocaleString()} m
                                        </span>

                                        <span>
                                          Google:{" "}
                                          {Number(segment.googleDistanceMetres || 0).toLocaleString()} m
                                        </span>

                                        <span>
                                          Detour: {Number(segment.detourRatio || 0).toFixed(1)}×
                                        </span>
                                      </div>
                                    )}

                                    {segment.message && (
                                      <p className="controller-override-message">
                                        {segment.message}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            <p className="controller-override-instruction">
                              Verify that the bus is operationally permitted to make each
                              flagged movement. Accepting this route will require a controller
                              override reason.
                            </p>
                          </div>
                        )}

                        {manualDiversionPreview && (
                          <div className="diversion-preview-summary">
                            <div>
                              <span>DISTANCE</span>
                              <strong>
                                {(Number(manualDiversionPreview.distanceMetres || 0) / 1000).toFixed(1)} km
                              </strong>
                            </div>
                            <div>
                              <span>DURATION</span>
                              <strong>
                                {Math.max(
                                  1,
                                  Math.round(Number(manualDiversionPreview.durationSeconds || 0) / 60),
                                )} min
                              </strong>
                            </div>
                            <div>
                              <span>WAYPOINTS</span>
                              <strong>
                                {manualDiversionPreview.controllerWaypoints?.length || 0}
                              </strong>
                            </div>
                            <div>
                              <span>ROUTING</span>
                              <strong>Google</strong>
                            </div>
                          </div>
                        )}

                        <div className="diversion-editor-actions">
                          <button
                            className="secondary-action"
                            disabled={busy || diversionDraftPoints.length === 0}
                            onClick={undoDiversionPoint}
                          >
                            Undo Point
                          </button>
                          <button
                            className="secondary-action"
                            disabled={busy || diversionDraftPoints.length === 0}
                            onClick={clearDiversionDrawing}
                          >
                            Clear Drawing
                          </button>
                          <button
                            className="primary-action"
                            disabled={busy || diversionDraftPoints.length < 2}
                            onClick={calculateDiversionPreview}
                          >
                            {busy ? "Calculating..." : "Calculate Diversion"}
                          </button>
                          {manualDiversionPreview && (
                            <button
                              className="approve-route-action"
                              disabled={busy}
                              onClick={acceptDiversionPreview}
                            >
                              Accept This Route
                            </button>
                          )}
                          <button
                            className="secondary-action"
                            disabled={busy}
                            onClick={cancelDiversionEditing}
                          >
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <Proposal diversion={proposal} onStatus={status} busy={busy} />
                </>
              )}
            </>
          )}
        </section>
      )}
      <section className="route-control-panel">
        <div className="route-input-group">
          <label>Search incidents</label>
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Location, category, severity or description"
          />
        </div>
      </section>
      <section className="cards-grid">
        {items.map((incident) => (
          <article className="management-card" key={incident.id}>
            <div>
              <span
                className={`severity-badge severity-${incident.severity?.toLowerCase()}`}
              >
                {incident.severity || "Unknown"}
              </span>
              <small>{incident.category}</small>
            </div>
            <h3>{incident.location || "London road disruption"}</h3>
            <p>
              {incident.comments ||
                incident.currentUpdate ||
                "No description available."}
            </p>
            <button
              className="secondary-action"
              onClick={() => onSelect(incident)}
            >
              Investigate
            </button>
          </article>
        ))}
      </section>
    </>
  );
}
function DiversionOperations({
  diversion,
  ops,
  geometry,
  stops,
  matches,
  onBack,
  changeStatus,
  reviseDiversion,
  busy,
}) {
  const acknowledgements = (ops.acknowledgements || []).filter(
    (item) => item.diversionId === diversion.id
  );
  const reports = (ops.driverReports || []).filter(
    (item) => item.diversionId === diversion.id
  );
  const routeGeometry =
    geometry ||
    (diversion.originalRouteGeometry
      ? { type: "LineString", coordinates: diversion.originalRouteGeometry }
      : null);
  const confirmEnd = () => {
    const confirmed = window.confirm(
      `End the active diversion for route ${diversion.lineId}? Drivers will no longer see this diversion as active.`
    );
    if (confirmed) {
      changeStatus(diversion, "ENDED");
    }
  };
  return (
    <>
      <Heading
        kicker="DIVERSION OPERATIONS"
        title={`Route ${diversion.lineId} · ${diversion.direction}`}
        text="Operational diversion detail, controller safety review and driver response monitoring."
      >
        <button className="secondary-action" onClick={onBack}>
          Back to Diversions
        </button>
      </Heading>
      <section className="selected-incident-panel">
        <div className="selected-incident-header">
          <div>
            <span className="panel-kicker">LIVE DIVERSION RECORD</span>
            <h3>{diversion.incident?.location || "London road disruption"}</h3>
          </div>
          <span className={`status-pill status-${diversion.status.toLowerCase()}`}>
            {diversion.status.replaceAll("_", " ")}
          </span>
        </div>
        <p className="selected-description">
          {diversion.incident?.comments ||
            diversion.incident?.currentUpdate ||
            "No incident description available."}
        </p>
        <div className="workflow-grid">
          <div>
            <span>DIVERSION DISTANCE</span>
            <strong>{fmtDistance(diversion.distanceMetres)}</strong>
          </div>
          <div>
            <span>EST. TIME</span>
            <strong>{fmtDuration(diversion.durationSeconds)}</strong>
          </div>
          <div>
            <span>DRIVER ACKS</span>
            <strong>{acknowledgements.length}</strong>
          </div>
          <div>
            <span>ROAD REPORTS</span>
            <strong>{reports.length}</strong>
          </div>
        </div>
        {diversion.status === "ACTIVE" && reports.length > 0 && (
          <div className="risk-box">
            <strong>Driver attention required</strong>
            <p>
              {reports.length} road problem report{reports.length === 1 ? " has" : "s have"} been received for this active diversion. Review the feedback before continuing normal diversion operation.
            </p>
          </div>
        )}
      </section>
      <section className="map-panel routes-map">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">OPERATIONAL MAP</span>
            <h3>Original route, affected section and diversion</h3>
          </div>
        </div>
        <ControlMap
          disruptions={diversion.incident ? [diversion.incident] : []}
          selectedIncident={diversion.incident || null}
          routeGeometry={routeGeometry}
          routeStops={stops}
          routeNumber={diversion.lineId}
          direction={diversion.direction}
          routeMatchedIncidents={matches}
          affectedGeometry={diversion.affectedSection?.affectedGeometry || diversion.affectedGeometry}
          diversionGeometry={diversion.geometry}
        />
      </section>
      <section className="admin-grid">
        <div className="selected-incident-panel">
          <span className="panel-kicker">CONTROLLER SAFETY REVIEW</span>
          <h3>Risk and route verification</h3>

          <div className="risk-box">
            <strong>
              {diversion.risk?.level?.replaceAll("_", " ") || "REVIEW REQUIRED"}
            </strong>

            {(diversion.risk?.warnings || []).map((warning, index) => (
              <p key={index}>• {warning}</p>
            ))}
          </div>

          <div className="workflow-grid">
            <div>
              <span>DIVERSION SOURCE</span>
              <strong>
                {diversion.routeSource === "CONTROLLER_OVERRIDE"
                  ? "Controller Override"
                  : diversion.routeSource === "CONTROLLER_DRAWN"
                    ? "Controller Drawn"
                    : diversion.routingProvider === "google"
                      ? "Google Routes"
                      : "Automatic Diversion"}
              </strong>
            </div>

            <div>
              <span>DIVERSION DISTANCE</span>
              <strong>{fmtDistance(diversion.distanceMetres)}</strong>
            </div>

            <div>
              <span>CONTROLLER OVERRIDE</span>
              <strong>{diversion.controllerOverride ? "YES" : "NO"}</strong>
            </div>

            <div>
              <span>REVISION</span>
              <strong>{diversion.revision || 1}</strong>
            </div>
          </div>

          {diversion.controllerOverrideConfirmed && (
            <div className="controller-override-warning">
              <strong>CONTROLLER OVERRIDE RECORDED</strong>

              <p>
                This diversion contains one or more movements that Google Routes
                could not reproduce normally. The controller explicitly confirmed
                the operational movement before creating this revision.
              </p>

              {diversion.controllerOverrideReason && (
                <div className="audit-row">
                  <strong>Override reason</strong>
                  <span>{diversion.controllerOverrideReason}</span>
                  <small>Controller confirmed</small>
                </div>
              )}

              {Array.isArray(diversion.failedSegments) &&
                diversion.failedSegments.length > 0 && (
                  <div className="controller-override-segments">
                    {diversion.failedSegments.map((segment, index) => {
                      const segmentIndex = Number(segment.index) || 0;

                      const totalPoints =
                        diversion.controllerPoints?.length || 0;

                      const fromLabel =
                        segmentIndex === 0
                          ? "S"
                          : String(segmentIndex);

                      const toLabel =
                        totalPoints &&
                          segmentIndex + 1 === totalPoints - 1
                          ? "R"
                          : String(segmentIndex + 1);

                      const reasonLabel =
                        segment.reason === "EXCESSIVE_GOOGLE_DETOUR"
                          ? "Excessive Google detour"
                          : segment.reason === "GOOGLE_ROUTE_UNAVAILABLE"
                            ? "Google route unavailable"
                            : "Controller verification";

                      return (
                        <div
                          className="controller-override-segment"
                          key={`${segmentIndex}-${index}`}
                        >
                          <div className="controller-override-segment-heading">
                            <strong>
                              {fromLabel} → {toLabel}
                            </strong>

                            <span>{reasonLabel}</span>
                          </div>

                          {segment.reason === "EXCESSIVE_GOOGLE_DETOUR" && (
                            <div className="controller-override-metrics">
                              <span>
                                Direct:{" "}
                                {Number(
                                  segment.directDistanceMetres || 0,
                                ).toLocaleString()}{" "}
                                m
                              </span>

                              <span>
                                Google:{" "}
                                {Number(
                                  segment.googleDistanceMetres || 0,
                                ).toLocaleString()}{" "}
                                m
                              </span>

                              <span>
                                Detour:{" "}
                                {Number(
                                  segment.detourRatio || 0,
                                ).toFixed(1)}
                                ×
                              </span>
                            </div>
                          )}

                          {segment.message && (
                            <p className="controller-override-message">
                              {segment.message}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
            </div>
          )}
        </div>

        <div className="selected-incident-panel">
          <span className="panel-kicker">LIFECYCLE</span>
          <h3>Approval and activation record</h3>

          <div className="audit-row">
            <strong>Created</strong>

            <span>
              Revision {diversion.revision || 1}
              {diversion.revisionOfId ? " · revised proposal" : ""}
            </span>

            <small>{when(diversion.createdAt)}</small>
          </div>

          {diversion.revisionReason && (
            <div className="audit-row">
              <strong>Revision reason</strong>
              <span>{diversion.revisionReason}</span>
              <small>Controller recalculation</small>
            </div>
          )}

          {diversion.controllerOverrideConfirmed && (
            <div className="audit-row">
              <strong>Controller override</strong>

              <span>
                {diversion.controllerOverrideReason ||
                  "Controller override confirmed"}
              </span>

              <small>Verified before acceptance</small>
            </div>
          )}

          <div className="audit-row">
            <strong>Approved</strong>
            <span>{diversion.approvedBy || "—"}</span>
            <small>{when(diversion.approvedAt)}</small>
          </div>

          <div className="audit-row">
            <strong>Activated</strong>

            <span>
              {diversion.activatedAt
                ? "Issued to drivers"
                : "—"}
            </span>

            <small>{when(diversion.activatedAt)}</small>
          </div>

          {diversion.endedAt && (
            <div className="audit-row">
              <strong>Ended</strong>
              <span>Returned to normal operation</span>
              <small>{when(diversion.endedAt)}</small>
            </div>
          )}
        </div>
      </section>
      <section className="admin-grid">
        <div className="selected-incident-panel">
          <span className="panel-kicker">DRIVER INSTRUCTION</span>
          <h3>Turn-by-turn diversion</h3>
          {diversion.instructions?.length ? (
            <ol className="driver-instructions">
              {diversion.instructions.map((instruction, index) => (
                <li key={index}>{instruction}</li>
              ))}
            </ol>
          ) : (
            <div className="empty-state">No turn-by-turn instructions recorded.</div>
          )}
        </div>
        <div className="selected-incident-panel">
          <span className="panel-kicker">AFFECTED STOPS</span>
          <h3>Potentially missed stops</h3>
          {diversion.potentiallyMissedStops?.length ? (
            <div className="stop-grid">
              {diversion.potentiallyMissedStops.map((stop, index) => (
                <div className="stop-row" key={stop.id || `${stop.name}-${index}`}>
                  <b>{index + 1}</b>
                  <span>{stop.name}</span>
                  <small>{stop.id || "TfL stop"}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">No potentially missed stops recorded.</div>
          )}
        </div>
      </section>
      <section className="admin-grid">
        <div className="selected-incident-panel">
          <span className="panel-kicker">DRIVER RESPONSE</span>
          <h3>Acknowledgements · {acknowledgements.length}</h3>
          {acknowledgements.map((item) => (
            <div className="audit-row" key={item.id}>
              <strong>{item.driverName}</strong>
              <span>Acknowledged</span>
              <small>{when(item.at)}</small>
            </div>
          ))}
          {!acknowledgements.length && (
            <div className="empty-state">No driver acknowledgements yet.</div>
          )}
        </div>
        <div className="selected-incident-panel">
          <span className="panel-kicker">ROAD FEEDBACK</span>
          <h3>Driver problem reports · {reports.length}</h3>
          {reports.map((item) => (
            <div className="audit-row" key={item.id}>
              <strong>{item.driverName}</strong>
              <span>{item.message}</span>
              <small>{when(item.at)}</small>
            </div>
          ))}
          {!reports.length && (
            <div className="empty-state">No driver problems reported.</div>
          )}
        </div>
      </section>
      <section className="selected-incident-panel">
        <span className="panel-kicker">OPERATIONAL CONTROL</span>
        <h3>Diversion lifecycle</h3>
        <div className="incident-actions">
          {diversion.status === "PROPOSED" && (
            <button
              className="secondary-action"
              disabled={busy}
              onClick={() => changeStatus(diversion, "AWAITING_APPROVAL")}
            >
              Send for Approval
            </button>
          )}
          {["PROPOSED", "AWAITING_APPROVAL"].includes(diversion.status) && (
            <>
              <button
                className="secondary-action"
                disabled={busy}
                onClick={() => changeStatus(diversion, "REJECTED")}
              >
                Reject
              </button>
              <button
                className="primary-action"
                disabled={busy}
                onClick={() => changeStatus(diversion, "APPROVED")}
              >
                Approve Diversion
              </button>
            </>
          )}
          {diversion.status === "APPROVED" && (
            <button
              className="primary-action"
              disabled={busy}
              onClick={() => changeStatus(diversion, "ACTIVE")}
            >
              Activate & Issue to Drivers
            </button>
          )}
          {diversion.status === "ACTIVE" && (
            <>
              <button
                className="secondary-action"
                disabled={busy}
                onClick={() => reviseDiversion(diversion)}
              >
                Revise & Recalculate
              </button>
              <button className="primary-action" disabled={busy} onClick={confirmEnd}>
                End Diversion
              </button>
            </>
          )}
          {["ENDED", "REJECTED", "CANCELLED", "SUPERSEDED"].includes(diversion.status) && (
            <div className="empty-state">
              This diversion is closed and no further lifecycle action is available.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
function Diversions({ ops, open, changeStatus, reviseDiversion, selectedDiversion, close, geometry, stops, matches, busy }) {
  const diversions = ops.diversions || [];
  if (selectedDiversion) {
    const current =
      diversions.find((item) => item.id === selectedDiversion.id) || selectedDiversion;
    return (
      <DiversionOperations
        diversion={current}
        ops={ops}
        geometry={geometry}
        stops={stops}
        matches={matches}
        onBack={close}
        changeStatus={changeStatus}
        reviseDiversion={reviseDiversion}
        busy={busy}
      />
    );
  }
  return (
    <>
      <Heading
        kicker="OPERATIONS"
        title="Diversions"
        text="Review every diversion through its operational lifecycle."
      />
      <section className="cards-grid">
        {diversions.map((diversion) => {
          const ackCount = (ops.acknowledgements || []).filter(
            (item) => item.diversionId === diversion.id
          ).length;
          const reportCount = (ops.driverReports || []).filter(
            (item) => item.diversionId === diversion.id
          ).length;
          return (
            <article className="management-card" key={diversion.id}>
              <div className="proposal-title">
                <h3>Route {diversion.lineId} · {diversion.direction}</h3>
                <span className={`status-pill status-${diversion.status.toLowerCase()}`}>
                  {diversion.status.replaceAll("_", " ")}
                </span>
              </div>
              <p>{diversion.incident?.location}</p>
              <small>
                {fmtDistance(diversion.distanceMetres)} · {fmtDuration(diversion.durationSeconds)} · Revision {diversion.revision || 1}
              </small>
              <div className="workflow-grid">
                <div><span>DRIVER ACKS</span><strong>{ackCount}</strong></div>
                <div><span>ROAD REPORTS</span><strong>{reportCount}</strong></div>
              </div>
              {diversion.status === "ACTIVE" && reportCount > 0 && (
                <div className="risk-box">
                  <strong>Controller review required</strong>
                  <p>Driver road feedback has been received for this active diversion.</p>
                </div>
              )}
              <div className="incident-actions">
                <button className="secondary-action" onClick={() => open(diversion)}>
                  Open
                </button>
                {diversion.status === "APPROVED" && (
                  <button
                    className="primary-action"
                    onClick={() => changeStatus(diversion, "ACTIVE")}
                  >
                    Activate
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!diversions.length && (
          <div className="empty-large">No diversion records yet.</div>
        )}
      </section>
    </>
  );
}
function Routes(props) {
  return (
    <>
      <Heading
        kicker="ROUTE INTELLIGENCE"
        title="Routes"
        text="Inspect bus route geometry, stops and live disruption matches."
      />
      <section className="route-control-panel">
        <RouteForm {...props} />
      </section>
      {props.route && (
        <>
          <section className="stat-grid">
            <article className="stat-card">
              <span>ROUTE</span>
              <strong>{props.route}</strong>
            </article>
            <article className="stat-card">
              <span>STOPS</span>
              <strong>{props.stops.length}</strong>
            </article>
            <article className="stat-card">
              <span>MATCHED INCIDENTS</span>
              <strong>{props.matches.length}</strong>
            </article>
          </section>
          <section className="map-panel routes-map">
            <ControlMap
              disruptions={props.disruptions}
              routeGeometry={props.geometry}
              routeStops={props.stops}
              routeNumber={props.route}
              direction={props.direction}
              routeMatchedIncidents={props.matches}
              onSelectIncident={props.openIncident}
            />
          </section>
          <section className="selected-incident-panel">
            <h3>Stops</h3>
            <div className="stop-grid">
              {props.stops.map((stop, index) => (
                <div className="stop-row" key={stop.id}>
                  <b>{index + 1}</b>
                  <span>{stop.name}</span>
                  <small>{stop.id}</small>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
function Drivers({ ops }) {
  const acknowledgements = ops.acknowledgements || [];
  const reports = ops.driverReports || [];
  const diversions = ops.diversions || [];
  const diversionFor = (id) => diversions.find((item) => item.id === id);
  const openReports = reports.filter((item) => item.status === "OPEN" || !item.status);
  return (
    <>
      <Heading
        kicker="DRIVER OPERATIONS"
        title="Drivers"
        text="Monitor diversion acknowledgements and problems reported from the road."
      />
      <section className="stat-grid">
        <article className="stat-card">
          <span>ACKNOWLEDGEMENTS</span>
          <strong>{acknowledgements.length}</strong>
        </article>
        <article className="stat-card serious">
          <span>ROAD REPORTS</span>
          <strong>{openReports.length}</strong>
        </article>
        <article className="stat-card">
          <span>ACTIVE DIVERSIONS</span>
          <strong>{diversions.filter((item) => item.status === "ACTIVE").length}</strong>
        </article>
      </section>
      <section className="admin-grid">
        <div className="selected-incident-panel">
          <h3>Driver acknowledgements</h3>
          {acknowledgements.map((item) => {
            const diversion = diversionFor(item.diversionId);
            return (
              <div className="audit-row" key={item.id}>
                <strong>{item.driverName}</strong>
                <span>
                  {diversion ? `Route ${diversion.lineId} · ${diversion.direction}` : item.diversionId}
                </span>
                <small>{when(item.at)}</small>
              </div>
            );
          })}
          {!acknowledgements.length && (
            <div className="empty-state">No driver acknowledgements yet.</div>
          )}
        </div>
        <div className="selected-incident-panel">
          <h3>Road problem reports</h3>
          {reports.map((item) => {
            const diversion = diversionFor(item.diversionId);
            return (
              <div className="audit-row" key={item.id}>
                <strong>{item.driverName}</strong>
                <span>
                  {diversion ? `Route ${diversion.lineId} · ${diversion.direction} · ` : ""}
                  {item.message}
                </span>
                <small>{when(item.at)}</small>
              </div>
            );
          })}
          {!reports.length && (
            <div className="empty-state">No driver road problems reported.</div>
          )}
        </div>
      </section>
    </>
  );
}



function Administration({ lines, setLines, lineStatus, setLineStatus }) {
  const [query, setQuery] = useState("55");
  const [busy, setBusy] = useState(false);
  const loadLines = async () => {
    setBusy(true);
    try {
      const response = await getBusLines();
      setLines(response.lines || response || []);
    } finally {
      setBusy(false);
    }
  };
  const checkStatus = async () => {
    setBusy(true);
    try {
      const response = await getLineStatus(query);
      setLineStatus(response.status || response || []);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        kicker="SYSTEM ADMINISTRATION"
        title="Administration"
        text="Operational configuration and TfL connectivity tools."
      />
      <section className="admin-grid">
        <div className="selected-incident-panel">
          <h3>TfL bus lines</h3>
          <button className="primary-action" onClick={loadLines} disabled={busy}>
            Load bus lines
          </button>
          <p className="selected-description">
            {lines.length
              ? `${lines.length} bus lines returned by TfL.`
              : "Use this check to verify TfL line connectivity."}
          </p>
        </div>
        <div className="selected-incident-panel">
          <h3>Line status check</h3>
          <div className="route-input-group">
            <label>Route</label>
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <button className="secondary-action" onClick={checkStatus} disabled={busy}>
            Check status
          </button>
          {lineStatus.map((item, index) => (
            <div className="audit-row" key={index}>
              <strong>{item.name || item.id || query}</strong>
              <span>
                {item.lineStatuses?.[0]?.statusSeverityDescription ||
                  item.statusSeverityDescription ||
                  "Status returned"}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="selected-incident-panel">
        <h3>Production configuration</h3>
        <p className="selected-description">
          User accounts, operator and garage master data, persistent fleet records and organisation isolation require your Supabase project credentials and database schema. The included local store is intended for project demonstration and testing.
        </p>
      </section>
    </>
  );
}
function Controller() {
  const [page, setPage] = useState("Control Board");
  const [disruptions, setDisruptions] = useState([]);
  const [ops, setOps] = useState({ diversions: [], acknowledgements: [], driverReports: [], audit: [] });
  const [routeSearch, setRouteSearch] = useState("55");
  const [route, setRoute] = useState("");
  const [direction, setDirection] = useState("outbound");
  const [geometry, setGeometry] = useState(null);
  const [stops, setStops] = useState([]);
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [affected, setAffected] = useState(null);
  const [proposal, setProposal] = useState(null);
  const [selectedDiversion, setSelectedDiversion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [lines, setLines] = useState([]);
  const [lineStatus, setLineStatus] = useState([]);
  const [detectedRoutes, setDetectedRoutes] = useState([]);
  const [detectionInfo, setDetectionInfo] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [diversionEditMode, setDiversionEditMode] = useState("VIEW");
  const [diversionDraftPoints, setDiversionDraftPoints] = useState([]);
  const [manualDiversionPreview, setManualDiversionPreview] = useState(null);
  const load = async () => {
    try {
      const [disruptionResponse, operationsResponse] = await Promise.all([
        getRoadDisruptions(),
        getOperations(),
      ]);
      const disruptionList = Array.isArray(disruptionResponse)
        ? disruptionResponse
        : Array.isArray(disruptionResponse?.disruptions)
          ? disruptionResponse.disruptions
          : [];

      setDisruptions(disruptionList);

      setOps(operationsResponse);
    } catch (loadError) {
      console.error(loadError);
      setError("Unable to refresh live operational data.");
    }
  };
  useEffect(() => {
    load();
    const hasActiveDiversion = (ops.diversions || []).some(
      (item) => item.status === "ACTIVE"
    );
    const timer = window.setInterval(load, hasActiveDiversion ? 15000 : 60000);
    return () => window.clearInterval(timer);
  }, [ops.diversions?.some((item) => item.status === "ACTIVE")]);

  const safeDisruptions = Array.isArray(disruptions)
    ? disruptions
    : [];

  const serious = safeDisruptions.filter((item) =>
    ["serious", "severe"].includes(
      item.severity?.toLowerCase()
    )
  ).length;

  const active = (ops.diversions || []).filter(
    (item) => item.status === "ACTIVE"
  ).length;

  const pending = (ops.diversions || []).filter((item) =>
    ["PROPOSED", "AWAITING_APPROVAL"].includes(
      item.status
    )
  ).length;

  const query = filter.toLowerCase().trim();

  const filtered = query
    ? safeDisruptions.filter((item) =>
      `${item.location || ""} ${item.comments || ""} ${item.currentUpdate || ""} ${item.category || ""} ${item.severity || ""}`
        .toLowerCase()
        .includes(query)
    )
    : safeDisruptions;

  const applyRouteResponse = (response, routeNumber) => {
    setRoute(routeNumber);
    setGeometry(response.geometry || null);
    setMatches(response.routeGeometryIncidents || []);
    const sequences = response.sequences || [];
    const directionSequences = sequences.filter(
      (sequence) => !sequence.direction || sequence.direction.toLowerCase() === direction.toLowerCase()
    );
    const source = directionSequences.length ? directionSequences : sequences;
    const uniqueStops = Array.from(
      new Map(source.flatMap((sequence) => sequence.stops || []).map((stop) => [stop.id, stop])).values()
    );
    setStops(uniqueStops);
  };
  const search = async (event) => {
    event?.preventDefault();
    const routeNumber = routeSearch.trim();
    if (!routeNumber) {
      setError("Enter a bus route number.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await analyseRoute(routeNumber, direction);
      applyRouteResponse(response, routeNumber);
    } catch (searchError) {
      console.error(searchError);
      setError(`Unable to analyse route ${routeNumber}.`);
    } finally {
      setBusy(false);
    }
  };
  const runAutomaticDetection = async (incident) => {
    if (!incident?.id) return;
    setDetecting(true);
    setDetectedRoutes([]);
    setDetectionInfo(null);
    try {
      const response = await detectAffectedRoutes(incident.id);
      setDetectedRoutes(response.detectedRoutes || []);
      setDetectionInfo(response.analysis || null);
    } catch (detectionError) {
      console.error(detectionError);
      setDetectedRoutes([]);
      setDetectionInfo(null);
      setError(
        detectionError.response?.data?.message ||
        "Unable to automatically detect affected bus routes. Manual route analysis is still available."
      );
    } finally {
      setDetecting(false);
    }
  };
  const openIncident = (incident) => {
    setSelected(incident);
    setAffected(null);
    setProposal(null);
    setDetectedRoutes([]);
    setDetectionInfo(null);
    setError("");
    setPage("Incidents");
    runAutomaticDetection(incident);
  };
  const chooseDetectedRoute = async (detected) => {
    if (!selected || !detected?.lineId) return;
    const routeNumber = String(detected.lineId);
    const selectedDirection = detected.direction === "inbound" ? "inbound" : "outbound";
    setRouteSearch(routeNumber);
    setDirection(selectedDirection);
    setProposal(null);
    setBusy(true);
    setError("");
    try {
      const [routeResponse, incidentResponse] = await Promise.all([
        analyseRoute(routeNumber, selectedDirection),
        analyseIncident(routeNumber, selected.id, selectedDirection),
      ]);
      setRoute(routeNumber);
      setGeometry(routeResponse.geometry || null);
      setMatches(routeResponse.routeGeometryIncidents || []);
      const sequences = routeResponse.sequences || [];
      const directionSequences = sequences.filter(
        (sequence) => !sequence.direction || sequence.direction.toLowerCase() === selectedDirection
      );
      const source = directionSequences.length ? directionSequences : sequences;
      setStops(
        Array.from(
          new Map(source.flatMap((sequence) => sequence.stops || []).map((stop) => [stop.id, stop])).values()
        )
      );
      setAffected(incidentResponse.affectedSection);
    } catch (analysisError) {
      console.error(analysisError);
      setAffected(null);
      setError(
        analysisError.response?.data?.message ||
        `Unable to analyse Route ${routeNumber} ${selectedDirection}.`
      );
    } finally {
      setBusy(false);
    }
  };
  const analyseSelected = async (event) => {
    event?.preventDefault();
    const routeNumber = routeSearch.trim();
    if (!selected) {
      setError("Select an incident first.");
      return;
    }
    if (!routeNumber) {
      setError("Enter the bus route that may be affected.");
      return;
    }
    setBusy(true);
    setError("");
    setProposal(null);
    try {
      const [routeResponse, incidentResponse] = await Promise.all([
        analyseRoute(routeNumber, direction),
        analyseIncident(routeNumber, selected.id, direction),
      ]);
      applyRouteResponse(routeResponse, routeNumber);
      setAffected(incidentResponse.affectedSection);
    } catch (analysisError) {
      console.error(analysisError);
      setAffected(null);
      setError(
        analysisError.response?.data?.message ||
        "Unable to analyse this incident against the selected route."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDiversionMapClick = (coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return;

    setManualDiversionPreview(null);
    setDiversionDraftPoints((current) => [
      ...current,
      coordinate,
    ]);
  };

  const handleRemoveDiversionDraftPoint = (index) => {
    setManualDiversionPreview(null);
    setDiversionDraftPoints((current) =>
      current.filter((_, pointIndex) => pointIndex !== index)
    );
  };

  const startDrawingDiversion = () => {
    setDiversionEditMode("DRAW");
    setDiversionDraftPoints([]);
    setManualDiversionPreview(null);
    setError("");
  };

  const startEditingDiversion = () => {
    if (!proposal) return;

    const startPoint = proposal.startPoint;
    const controllerWaypoints = Array.isArray(proposal.controllerWaypoints)
      ? proposal.controllerWaypoints
      : proposal.waypoint
        ? [proposal.waypoint]
        : [];
    const rejoinPoint = proposal.rejoinPoint;

    const points = [
      startPoint,
      ...controllerWaypoints,
      rejoinPoint,
    ].filter(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
    );

    setDiversionDraftPoints(points);
    setDiversionEditMode("EDIT");
    setManualDiversionPreview(null);
    setError("");
  };

  const undoDiversionPoint = () => {
    setManualDiversionPreview(null);
    setDiversionDraftPoints((current) =>
      current.slice(0, -1)
    );
  };

  const clearDiversionDrawing = () => {
    setManualDiversionPreview(null);
    setDiversionDraftPoints([]);
  };

  const cancelDiversionEditing = () => {
    setDiversionEditMode("VIEW");
    setDiversionDraftPoints([]);
    setManualDiversionPreview(null);
    setError("");
  };

  const useSuggestedDiversion = () => {
    setDiversionEditMode("VIEW");
    setDiversionDraftPoints([]);
    setManualDiversionPreview(null);
    setError("");
  };

  const calculateDiversionPreview = async () => {
    console.log("CALCULATE CLICKED", {
      proposalId: proposal?.id,
      pointCount: diversionDraftPoints.length,
      points: diversionDraftPoints,
    });

    if (!proposal || diversionDraftPoints.length < 2) {
      console.log("CALCULATION STOPPED", {
        hasProposal: Boolean(proposal),
        pointCount: diversionDraftPoints.length,
      });
      return;
    }

    setBusy(true);
    setError("");

    try {
      console.log("SENDING MANUAL ROUTE REQUEST");

      const response = await calculateManualDiversionRoute(
        proposal.id,
        diversionDraftPoints,
      );

      console.log("MANUAL ROUTE RESPONSE", response);

      setManualDiversionPreview(response.preview);
    } catch (routeError) {
      console.error("MANUAL ROUTE ERROR", routeError);

      setManualDiversionPreview(null);

      setError(
        routeError.response?.data?.message ||
        "Unable to calculate the controller diversion.",
      );
    } finally {
      setBusy(false);
    }
  };

  const acceptDiversionPreview = async () => {
    if (
      !proposal ||
      !manualDiversionPreview ||
      diversionDraftPoints.length < 2
    ) {
      return;
    }

    const revisionReason = window.prompt(
      "Reason for changing the automatic diversion:",
      diversionEditMode === "DRAW"
        ? "Controller selected a different operational diversion."
        : "Controller adjusted the suggested diversion route.",
    );

    if (revisionReason === null) {
      return;
    }

    let confirmOverride = false;
    let overrideReason = "";

    if (manualDiversionPreview.requiresOverride) {
      const flaggedSegments =
        manualDiversionPreview.failedSegments || [];

      const segmentNames = flaggedSegments
        .map((segment) => {
          const index = Number(segment.index) || 0;
          const totalPoints =
            manualDiversionPreview.controllerPoints?.length ||
            diversionDraftPoints.length;

          const from =
            index === 0 ? "S" : String(index);

          const to =
            index + 1 === totalPoints - 1
              ? "R"
              : String(index + 1);

          return `${from} → ${to}`;
        })
        .join(", ");

      overrideReason = window.prompt(
        [
          "CONTROLLER OVERRIDE REQUIRED",
          "",
          `Movements requiring verification: ${segmentNames}`,
          "",
          "Only continue if you have verified that the bus is permitted to make these movements.",
          "",
          "Enter the operational reason for the override:",
        ].join("\n"),
        "Test only - controller verified local bus movement.",
      );

      if (overrideReason === null) {
        return;
      }

      overrideReason = overrideReason.trim();

      if (overrideReason.length < 5) {
        setError(
          "An operational reason is required before a controller override can be accepted.",
        );
        return;
      }

      confirmOverride = true;
    }

    setBusy(true);
    setError("");

    try {
      const response = await acceptManualDiversionRoute(
        proposal.id,
        diversionDraftPoints,
        revisionReason.trim() ||
        "Controller manually adjusted diversion route.",
        confirmOverride,
        overrideReason,
      );

      if (!response?.diversion) {
        throw new Error(
          "The server did not return the accepted diversion revision.",
        );
      }

      setProposal(response.diversion);
      setSelectedDiversion(response.diversion);

      setDiversionEditMode("VIEW");
      setDiversionDraftPoints([]);
      setManualDiversionPreview(null);

      await load();
    } catch (routeError) {
      console.error(
        "Unable to accept controller diversion:",
        routeError,
      );

      setError(
        routeError.response?.data?.message ||
        routeError.message ||
        "Unable to save the controller diversion.",
      );
    } finally {
      setBusy(false);
    }
  };

  const cancelDiversionProposal = async () => {
    if (!proposal) return;

    const confirmed = window.confirm(
      `Cancel the diversion proposal for Route ${proposal.lineId}?`
    );

    if (!confirmed) return;

    await updateProposalStatus("CANCELLED");
    setDiversionEditMode("VIEW");
    setDiversionDraftPoints([]);
    setManualDiversionPreview(null);
  };

  const makeDiversion = async () => {
    if (!selected || !affected || !route) return;
    setBusy(true);
    setError("");
    try {
      const response = await generateDiversion({
        lineId: route,
        direction,
        incidentId: selected.id,
      });
      setProposal(response.diversion);
      await load();
    } catch (generationError) {
      console.error(generationError);
      setError(
        generationError.response?.data?.message ||
        "Unable to generate diversion. Check the server Google Routes configuration."
      );
    } finally {
      setBusy(false);
    }
  };
  const updateProposalStatus = async (nextStatus) => {
    if (!proposal) return;
    setBusy(true);
    setError("");
    try {
      const response = await setDiversionStatus(proposal.id, nextStatus, "Controller");
      setProposal(response.diversion);
      await load();
    } catch (statusError) {
      console.error(statusError);
      setError(statusError.response?.data?.message || "Unable to update diversion status.");
    } finally {
      setBusy(false);
    }
  };
  const changeDiversionStatus = async (diversion, nextStatus) => {
    setBusy(true);
    setError("");
    try {
      const response = await setDiversionStatus(diversion.id, nextStatus, "Controller");
      if (proposal?.id === diversion.id) {
        setProposal(response.diversion);
      }
      if (selectedDiversion?.id === diversion.id) {
        setSelectedDiversion(response.diversion);
      }
      await load();
    } catch (statusError) {
      console.error(statusError);
      setError(statusError.response?.data?.message || "Unable to update diversion status.");
    } finally {
      setBusy(false);
    }
  };
  const reviseDiversion = async (diversion) => {
    const reason = window.prompt(
      `Why are you revising Route ${diversion.lineId} revision ${diversion.revision || 1}?`,
      (ops.driverReports || []).some((item) => item.diversionId === diversion.id)
        ? "Driver road feedback requires diversion recalculation."
        : "Controller operational review requires diversion recalculation."
    );
    if (reason === null) return;
    setBusy(true);
    setError("");
    try {
      const response = await generateDiversion({
        lineId: diversion.lineId,
        direction: diversion.direction,
        incidentId: diversion.incidentId,
        revisionOfId: diversion.id,
        revisionReason: reason.trim() || "Controller recalculation.",
      });
      setProposal(response.diversion);
      setSelectedDiversion(response.diversion);
      setSelected(response.diversion.incident || diversion.incident || null);
      setAffected(response.diversion.affectedSection || null);
      setRoute(response.diversion.lineId);
      setRouteSearch(response.diversion.lineId);
      setDirection(response.diversion.direction || "outbound");
      await load();
    } catch (revisionError) {
      console.error(revisionError);
      setError(
        revisionError.response?.data?.message ||
        "Unable to generate the revised diversion."
      );
    } finally {
      setBusy(false);
    }
  };
  const openDiversion = async (diversion) => {
    setSelectedDiversion(diversion);
    setProposal(diversion);
    setSelected(diversion.incident || null);
    setRouteSearch(diversion.lineId || "");
    setRoute(diversion.lineId || "");
    setDirection(diversion.direction || "outbound");
    setAffected(diversion.affectedSection || null);
    setPage("Diversions");
    if (diversion.lineId) {
      try {
        const response = await analyseRoute(diversion.lineId, diversion.direction || "outbound");
        setGeometry(response.geometry || null);
        setMatches(response.routeGeometryIncidents || []);
        const sequences = response.sequences || [];
        setStops(
          Array.from(
            new Map(sequences.flatMap((sequence) => sequence.stops || []).map((stop) => [stop.id, stop])).values()
          )
        );
      } catch (openError) {
        console.error(openError);
      }
    }
  };
  return (
    <div className="dashboard-body">
      <aside className="sidebar">
        <nav>
          {NAV.map((name) => (
            <button
              key={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              onClick={() => { setPage(name); setSelectedDiversion(null); }}
            >
              <span>{name[0]}</span>
              {name}
              {name === "Incidents" && <b>{disruptions.length}</b>}
              {name === "Diversions" && <b>{active}</b>}
            </button>
          ))}
        </nav>
        <div className="system-card">
          <span className="live-dot" /> Systems operational
          <small>TfL API · Google Maps</small>
        </div>
      </aside>
      <main className="workspace">
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}
        {page === "Control Board" && (
          <ControlBoard
            {...{
              disruptions,
              serious,
              pending,
              active,
              routeSearch,
              setRouteSearch,
              direction,
              setDirection,
              search,
              busy,
              route,
              stops,
              matches,
              geometry,
              selected,
              openIncident,
              affected,
              proposal,
              ops,
              openDiversion,
              diversionEditMode,
              diversionDraftPoints,
              manualDiversionPreview,
              onDiversionMapClick: handleDiversionMapClick,
              onRemoveDiversionDraftPoint: handleRemoveDiversionDraftPoint,
            }}
          />
        )}
        {page === "Incidents" && (
          <Incidents
            items={filtered}
            filter={filter}
            setFilter={setFilter}
            selected={selected}
            onSelect={openIncident}
            routeSearch={routeSearch}
            setRouteSearch={setRouteSearch}
            direction={direction}
            setDirection={setDirection}
            analyseSelected={analyseSelected}
            affected={affected}
            proposal={proposal}
            makeDiversion={makeDiversion}
            status={updateProposalStatus}
            busy={busy}
            geometry={geometry}
            stops={stops}
            matches={matches}
            detectedRoutes={detectedRoutes}
            detectionInfo={detectionInfo}
            detecting={detecting}
            chooseDetectedRoute={chooseDetectedRoute}
            refreshDetection={() =>
              selected && runAutomaticDetection(selected)
            }
            diversionEditMode={diversionEditMode}
            diversionDraftPoints={diversionDraftPoints}
            onDiversionMapClick={handleDiversionMapClick}
            onRemoveDiversionDraftPoint={handleRemoveDiversionDraftPoint}
            startDrawingDiversion={startDrawingDiversion}
            startEditingDiversion={startEditingDiversion}
            undoDiversionPoint={undoDiversionPoint}
            clearDiversionDrawing={clearDiversionDrawing}
            cancelDiversionEditing={cancelDiversionEditing}
            cancelDiversionProposal={cancelDiversionProposal}
            manualDiversionPreview={manualDiversionPreview}
            calculateDiversionPreview={calculateDiversionPreview}
            acceptDiversionPreview={acceptDiversionPreview}
            useSuggestedDiversion={useSuggestedDiversion}
          />
        )}
        {page === "Diversions" && (
          <Diversions
            ops={ops}
            open={openDiversion}
            changeStatus={changeDiversionStatus}
            reviseDiversion={reviseDiversion}
            selectedDiversion={selectedDiversion}
            close={() => setSelectedDiversion(null)}
            geometry={geometry}
            stops={stops}
            matches={matches}
            busy={busy}
          />
        )}
        {page === "Curtailments" && <Curtailments />}
        {page === "Routes" && (
          <Routes
            {...{
              routeSearch,
              setRouteSearch,
              direction,
              setDirection,
              search,
              busy,
              route,
              stops,
              matches,
              geometry,
              disruptions,
              openIncident,
            }}
          />
        )}
        {page === "Drivers" && <Drivers ops={ops} />}
        {page === "Vehicles" && <Vehicles />}
        {page === "Reports" && <Reports disruptions={disruptions} ops={ops} />}
        {page === "History" && <History ops={ops} />}
        {page === "Administration" && (
          <Administration
            lines={lines}
            setLines={setLines}
            lineStatus={lineStatus}
            setLineStatus={setLineStatus}
          />
        )}
      </main>
    </div>
  );
}

function Driver() {
  const [ops, setOps] = useState({
    diversions: [],
    acknowledgements: [],
    driverReports: [],
    audit: [],
  });
  const [curtailmentOps, setCurtailmentOps] = useState({
    curtailments: [],
    acknowledgements: [],
    driverReports: [],
    audit: [],
  });
  const [name, setName] = useState("Driver 101");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedOperationId, setSelectedOperationId] = useState("");
  const load = async () => {
    try {
      const [diversionResponse, curtailmentResponse] = await Promise.all([
        getOperations(),
        getCurtailmentOperations(),
      ]);
      setOps(diversionResponse);
      setCurtailmentOps(curtailmentResponse);
      setError("");
    } catch (loadError) {
      console.error(loadError);
      setError("Unable to refresh live operational instructions.");
    }
  };
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);
  const activeDiversions = (ops.diversions || [])
    .filter((item) => item.status === "ACTIVE")
    .map((item) => ({
      ...item,
      operationType: "DIVERSION",
      operationKey: `DIV-${item.id}`,
    }));
  const activeCurtailments = (curtailmentOps.curtailments || [])
    .filter((item) => item.status === "ACTIVE")
    .map((item) => ({
      ...item,
      operationType: "CURTAILMENT",
      operationKey: `CUR-${item.id}`,
    }));
  const activeOperations = [...activeCurtailments, ...activeDiversions];
  useEffect(() => {
    if (!activeOperations.length) {
      setSelectedOperationId("");
      return;
    }
    const stillActive = activeOperations.some(
      (item) => item.operationKey === selectedOperationId
    );
    if (!stillActive) {
      setSelectedOperationId(activeOperations[0].operationKey);
    }
  }, [activeOperations, selectedOperationId]);
  const selectedOperation =
    activeOperations.find(
      (item) => item.operationKey === selectedOperationId
    ) ||
    activeOperations[0] ||
    null;
  const isCurtailment = selectedOperation?.operationType === "CURTAILMENT";
  const cleanDriverInstructions = (instructions = [], routeNumber = "") => {
    const filtered = instructions.filter((instruction, index) => {
      if (typeof instruction !== "string" || !instruction.trim()) return false;
      const value = instruction.trim().toLowerCase();
      const isLast = index === instructions.length - 1;
      return !(!isLast && value.includes("arrived at your destination"));
    });
    return filtered.map((instruction, index) => {
      const value = instruction.trim().toLowerCase();
      const isLast = index === filtered.length - 1;
      if (
        isLast &&
        (value.includes("destination") || value.includes("arrived"))
      ) {
        return `Rejoin normal Route ${routeNumber}.`;
      }
      return instruction;
    });
  };
  const formatPoint = (point) => {
    if (!Array.isArray(point) || point.length < 2) {
      return "See operational map";
    }
    const longitude = Number(point[0]);
    const latitude = Number(point[1]);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      return "See operational map";
    }
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  };
  const acknowledgeOperation = async (operation) => {
    const driverName = name.trim();
    if (!driverName) {
      setError("Enter your driver name or identifier before acknowledging.");
      return;
    }
    try {
      if (operation.operationType === "CURTAILMENT") {
        await acknowledgeCurtailment(
          operation.id,
          driverName,
          operation.vehicleId || ""
        );
        setMessage(`${operation.reference} acknowledged.`);
      } else {
        await acknowledgeDiversion(operation.id, driverName);
        setMessage(`Route ${operation.lineId} diversion acknowledged.`);
      }
      setError("");
      await load();
    } catch (acknowledgeError) {
      console.error(acknowledgeError);
      setError(
        acknowledgeError.response?.data?.message ||
        "Unable to acknowledge this instruction."
      );
    }
  };
  const reportProblem = async (operation) => {
    const driverName = name.trim();
    if (!driverName) {
      setError(
        "Enter your driver name or identifier before reporting a problem."
      );
      return;
    }
    const text = window.prompt(
      operation.operationType === "CURTAILMENT"
        ? "Describe the problem with this curtailment instruction:"
        : "Describe the problem with this diversion. Include the road, restriction or instruction if possible:"
    );
    if (!text?.trim()) return;
    try {
      if (operation.operationType === "CURTAILMENT") {
        await reportCurtailmentProblem(
          operation.id,
          text.trim(),
          driverName,
          operation.vehicleId || ""
        );
      } else {
        await reportDiversionProblem(
          operation.id,
          text.trim(),
          driverName
        );
      }
      setMessage("Problem reported to Control.");
      setError("");
      await load();
    } catch (reportError) {
      console.error(reportError);
      setError(
        reportError.response?.data?.message ||
        "Unable to send the problem report to Control."
      );
    }
  };
  const acknowledged = selectedOperation
    ? selectedOperation.operationType === "CURTAILMENT"
      ? (curtailmentOps.acknowledgements || []).some(
        (item) =>
          item.curtailmentId === selectedOperation.id &&
          item.driverName === name.trim()
      )
      : (ops.acknowledgements || []).some(
        (item) =>
          item.diversionId === selectedOperation.id &&
          item.driverName === name.trim()
      )
    : false;
  const driverReports = selectedOperation
    ? selectedOperation.operationType === "CURTAILMENT"
      ? (curtailmentOps.driverReports || []).filter(
        (item) =>
          item.curtailmentId === selectedOperation.id &&
          item.driverName === name.trim()
      )
      : (ops.driverReports || []).filter(
        (item) =>
          item.diversionId === selectedOperation.id &&
          item.driverName === name.trim()
      )
    : [];
  const routeGeometry =
    !isCurtailment && selectedOperation?.originalRouteGeometry
      ? {
        type: "LineString",
        coordinates: selectedOperation.originalRouteGeometry,
      }
      : null;
  const instructions = !isCurtailment
    ? cleanDriverInstructions(
      selectedOperation?.instructions || [],
      selectedOperation?.lineId || ""
    )
    : [];
  return (
    <main className="standalone-page">
      <Heading
        kicker="DRIVER DASHBOARD"
        title="Live Operational Instructions"
        text="Only controller-activated diversions and curtailments are shown. Review the instruction, acknowledge it and report any operational problem immediately."
      >
        <input
          className="driver-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setMessage("");
          }}
          placeholder="Driver name or ID"
        />
      </Heading>
      {message && <div className="success-banner">{message}</div>}
      {error && (
        <div className="error-banner">
          {error}
          <button type="button" onClick={() => setError("")}>×</button>
        </div>
      )}
      {!activeOperations.length && (
        <div className="empty-large">
          No active operational instructions issued by Control. Continue normal
          route operation.
        </div>
      )}
      {activeOperations.length > 1 && (
        <section className="route-control-panel">
          <div className="route-input-group">
            <label>Active instruction</label>
            <select
              value={selectedOperation?.operationKey || ""}
              onChange={(event) => {
                setSelectedOperationId(event.target.value);
                setMessage("");
                setError("");
              }}
            >
              {activeOperations.map((operation) => (
                <option
                  key={operation.operationKey}
                  value={operation.operationKey}
                >
                  {operation.operationType === "CURTAILMENT"
                    ? `${operation.reference} · Route ${operation.routeNumber}`
                    : `Diversion · Route ${operation.lineId}`}{" "}
                  · {operation.direction}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}
      {selectedOperation && isCurtailment && (
        <>
          <section className="selected-incident-panel">
            <div className="selected-incident-header">
              <div>
                <span className="panel-kicker">
                  CONTROLLER ISSUED CURTAILMENT
                </span>
                <h3>{selectedOperation.reference}</h3>
              </div>
              <span className="status-pill status-active">ACTIVE</span>
            </div>
            <p className="selected-description">
              <strong>
                Route {selectedOperation.routeNumber} ·{" "}
                {selectedOperation.direction}
              </strong>
            </p>
            <div className="workflow-grid">
              <div>
                <span>REFERENCE</span>
                <strong>{selectedOperation.reference}</strong>
              </div>
              <div>
                <span>REASON</span>
                <strong>
                  {String(selectedOperation.reason || "OTHER").replaceAll(
                    "_",
                    " "
                  )}
                </strong>
              </div>
              <div>
                <span>RUNNING LATE</span>
                <strong>
                  {selectedOperation.latenessMinutes === null
                    ? "—"
                    : `${selectedOperation.latenessMinutes} min`}
                </strong>
              </div>
              <div>
                <span>DRIVER STATUS</span>
                <strong>
                  {acknowledged ? "ACKNOWLEDGED" : "ACTION REQUIRED"}
                </strong>
              </div>
              <div>
                <span>VEHICLE</span>
                <strong>{selectedOperation.vehicleId || "—"}</strong>
              </div>
              <div>
                <span>DUTY</span>
                <strong>{selectedOperation.dutyNumber || "—"}</strong>
              </div>
            </div>
          </section>
          <section className="selected-incident-panel">
            <span className="panel-kicker">CURTAILMENT INSTRUCTION</span>
            <h3>
              {selectedOperation.curtailmentPoint?.name ||
                "Curtailment point"}
            </h3>
            {selectedOperation.curtailmentPoint?.location && (
              <p className="selected-description">
                {selectedOperation.curtailmentPoint.location}
              </p>
            )}
            <div className="workflow-grid">
              <div>
                <span>SET DOWN</span>
                <strong>
                  {selectedOperation.curtailmentPoint?.setDownStop || "—"}
                </strong>
              </div>
              <div>
                <span>STAND</span>
                <strong>
                  {selectedOperation.curtailmentPoint?.standLocation || "—"}
                </strong>
              </div>
              <div>
                <span>PICK UP</span>
                <strong>
                  {selectedOperation.curtailmentPoint?.pickUpStop || "—"}
                </strong>
              </div>
              <div>
                <span>POINT STATUS</span>
                <strong>
                  {selectedOperation.curtailmentPoint?.verified
                    ? "VERIFIED"
                    : "CONTROL INSTRUCTION"}
                </strong>
              </div>
            </div>
          </section>
          {selectedOperation.curtailmentPoint?.turningRoute && (
            <section className="selected-incident-panel">
              <span className="panel-kicker">TURNING ROUTE</span>
              <h3>How to turn the bus</h3>
              <div className="risk-box">
                <strong>Follow the controller-issued turning instruction</strong>
                <p>{selectedOperation.curtailmentPoint.turningRoute}</p>
              </div>
            </section>
          )}
          {selectedOperation.curtailmentPoint?.operationalNotes && (
            <section className="selected-incident-panel">
              <span className="panel-kicker">OPERATIONAL NOTES</span>
              <h3>Controller information</h3>
              <p className="selected-description">
                {selectedOperation.curtailmentPoint.operationalNotes}
              </p>
            </section>
          )}
          <section className="selected-incident-panel">
            <span className="panel-kicker">DRIVER RESPONSE</span>
            <h3>Acknowledge or report a problem</h3>
            <p className="selected-description">
              Check the curtailment point, set-down, turning route and pick-up
              instructions before acknowledging.
            </p>
            <div className="incident-actions">
              <button
                type="button"
                className="primary-action"
                disabled={acknowledged}
                onClick={() => acknowledgeOperation(selectedOperation)}
              >
                {acknowledged
                  ? "Curtailment Acknowledged"
                  : "Acknowledge Curtailment"}
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => reportProblem(selectedOperation)}
              >
                Report Problem to Control
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={load}
              >
                Refresh Instructions
              </button>
            </div>
            {driverReports.length > 0 && (
              <div className="risk-box">
                <strong>Your reports for {selectedOperation.reference}</strong>
                {driverReports.map((report) => (
                  <p key={report.id}>
                    • {report.message} · {when(report.at)}
                  </p>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {selectedOperation && !isCurtailment && (
        <>
          <section className="selected-incident-panel">
            <div className="selected-incident-header">
              <div>
                <span className="panel-kicker">
                  CONTROLLER ISSUED DIVERSION
                </span>
                <h3>
                  Route {selectedOperation.lineId} ·{" "}
                  {selectedOperation.direction}
                </h3>
              </div>
              <span className="status-pill status-active">ACTIVE</span>
            </div>
            <p className="selected-description">
              <strong>Incident:</strong>{" "}
              {selectedOperation.incident?.location ||
                "London road disruption"}
            </p>
            <div className="workflow-grid">
              <div>
                <span>DIVERSION DISTANCE</span>
                <strong>
                  {fmtDistance(selectedOperation.distanceMetres)}
                </strong>
              </div>
              <div>
                <span>EST. TIME</span>
                <strong>
                  {fmtDuration(selectedOperation.durationSeconds)}
                </strong>
              </div>
              <div>
                <span>REVISION</span>
                <strong>{selectedOperation.revision || 1}</strong>
              </div>
              <div>
                <span>DRIVER STATUS</span>
                <strong>
                  {acknowledged ? "ACKNOWLEDGED" : "ACTION REQUIRED"}
                </strong>
              </div>
            </div>
          </section>
          <section className="map-panel routes-map">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">DRIVER DIVERSION MAP</span>
                <h3>Incident, affected route and diversion</h3>
              </div>
            </div>
            <ControlMap
              disruptions={
                selectedOperation.incident
                  ? [selectedOperation.incident]
                  : []
              }
              selectedIncident={selectedOperation.incident || null}
              routeGeometry={routeGeometry}
              routeStops={[]}
              routeNumber={selectedOperation.lineId}
              direction={selectedOperation.direction}
              routeMatchedIncidents={[]}
              affectedGeometry={
                selectedOperation.affectedSection?.affectedGeometry ||
                selectedOperation.affectedGeometry
              }
              diversionGeometry={selectedOperation.geometry}
            />
          </section>
          <section className="admin-grid">
            <div className="selected-incident-panel">
              <span className="panel-kicker">START DIVERSION</span>
              <h3>Leave normal route</h3>
              <div className="audit-row">
                <strong>Start point</strong>
                <span>{formatPoint(selectedOperation.startPoint)}</span>
                <small>Follow the green diversion line on the map.</small>
              </div>
            </div>
            <div className="selected-incident-panel">
              <span className="panel-kicker">REJOIN ROUTE</span>
              <h3>Return to normal route</h3>
              <div className="audit-row">
                <strong>Rejoin point</strong>
                <span>{formatPoint(selectedOperation.rejoinPoint)}</span>
                <small>Resume the normal route after the diversion.</small>
              </div>
            </div>
          </section>
          {selectedOperation.potentiallyMissedStops?.length > 0 && (
            <section className="selected-incident-panel">
              <span className="panel-kicker">AFFECTED STOPS</span>
              <h3>Potentially missed stops</h3>
              <div className="risk-box">
                <strong>
                  {selectedOperation.potentiallyMissedStops.length} stop
                  {selectedOperation.potentiallyMissedStops.length === 1
                    ? ""
                    : "s"}{" "}
                  may not be served
                </strong>
                {selectedOperation.potentiallyMissedStops.map(
                  (stop, index) => (
                    <p key={stop.id || `${stop.name}-${index}`}>
                      • {stop.name}
                    </p>
                  )
                )}
              </div>
            </section>
          )}
          <section className="selected-incident-panel">
            <span className="panel-kicker">TURN-BY-TURN</span>
            <h3>Driver instructions</h3>
            {instructions.length ? (
              <ol className="driver-instructions">
                {instructions.map((instruction, index) => (
                  <li key={`${index}-${instruction}`}>{instruction}</li>
                ))}
              </ol>
            ) : (
              <div className="empty-state">
                No turn-by-turn instructions are recorded. Contact Control
                before proceeding on the diversion.
              </div>
            )}
          </section>
          <section className="selected-incident-panel">
            <span className="panel-kicker">DRIVER RESPONSE</span>
            <h3>Acknowledge or report a problem</h3>
            <p className="selected-description">
              Acknowledge only after you have reviewed the diversion. Use
              Report Problem if the road is blocked, unsuitable for the vehicle
              or the instruction cannot be followed safely.
            </p>
            <div className="incident-actions">
              <button
                type="button"
                className="primary-action"
                disabled={acknowledged}
                onClick={() => acknowledgeOperation(selectedOperation)}
              >
                {acknowledged
                  ? "Diversion Acknowledged"
                  : "Acknowledge Diversion"}
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => reportProblem(selectedOperation)}
              >
                Report Problem to Control
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={load}
              >
                Refresh Instructions
              </button>
            </div>
            {driverReports.length > 0 && (
              <div className="risk-box">
                <strong>Your reports for this diversion</strong>
                {driverReports.map((report) => (
                  <p key={report.id}>
                    • {report.message} · {when(report.at)}
                  </p>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function Admin() {
  const [ops, setOps] = useState({
    diversions: [],
    driverReports: [],
    audit: [],
  });

  const [adminPage, setAdminPage] =
    useState("operations");

  useEffect(() => {
    getOperations()
      .then(setOps)
      .catch(() => { });
  }, []);

  return (
    <>
      <div className="admin-section-nav">
        <button
          type="button"
          className={
            adminPage === "operations"
              ? "active"
              : ""
          }
          onClick={() =>
            setAdminPage("operations")
          }
        >
          Operations & Audit
        </button>

        <button
          type="button"
          className={
            adminPage === "users"
              ? "active"
              : ""
          }
          onClick={() =>
            setAdminPage("users")
          }
        >
          Users & Roles
        </button>
      </div>

      {adminPage === "operations" && (
        <main className="standalone-page">
          <Heading
            kicker="SUPER ADMIN"
            title="Operations & Audit"
            text="System overview, driver reports and audit history."
          />

          <Reports
            disruptions={[]}
            ops={ops}
          />

          <History ops={ops} />
        </main>
      )}

      {adminPage === "users" && (
        <UserManagement />
      )}
    </>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [adminView, setAdminView] = useState("SUPER_ADMIN");

  const loadAuthenticatedUser = async (currentSession) => {
    if (!currentSession?.access_token) {
      setSession(null);
      setUser(null);
      setAuthLoading(false);
      return;
    }

    try {
      setAuthLoading(true);
      setAuthError("");

      const profile = await getCurrentUserProfile(
        currentSession.access_token
      );

      setSession(currentSession);
      setUser(profile);
    } catch (error) {
      console.error(error);
      setSession(null);
      setUser(null);
      setAuthError(
        error.message || "Unable to verify your BusControl account."
      );
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initialise = async () => {
      try {
        const currentSession = await getSession();

        if (mounted) {
          await loadAuthenticatedUser(currentSession);
        }
      } catch (error) {
        console.error(error);

        if (mounted) {
          setAuthError(
            error.message || "Unable to restore your login session."
          );
          setAuthLoading(false);
        }
      }
    };

    initialise();

    const {
      data: { subscription },
    } = onAuthStateChange((_event, currentSession) => {
      if (!mounted) return;

      if (!currentSession) {
        setSession(null);
        setUser(null);
        setAuthLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async (newSession) => {
    await loadAuthenticatedUser(newSession);
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error(error);
    } finally {
      setSession(null);
      setUser(null);
    }
  };

  if (authLoading) {
    return (
      <main className="standalone-page">
        <div className="empty-large">
          Loading BusControl...
        </div>
      </main>
    );
  }

  if (!session || !user) {
    return (
      <>
        {authError && (
          <div className="error-banner">
            {authError}
            <button
              type="button"
              onClick={() => setAuthError("")}
            >
              ×
            </button>
          </div>
        )}

        <Login onLogin={handleLogin} />
      </>
    );
  }

  return (
    <Shell user={user} onLogout={handleLogout}>
      {user.role === "SUPER_ADMIN" && (
        <div className="admin-view-bar">
          <div>
            <span>SUPER ADMIN ACCESS</span>
            <strong>View frontend as</strong>
          </div>

          <select
            value={adminView}
            onChange={(event) =>
              setAdminView(event.target.value)
            }
            className="role-switch"
          >
            <option value="SUPER_ADMIN">
              Super Admin
            </option>

            <option value="CONTROLLER">
              Controller
            </option>

            <option value="DRIVER">
              Driver
            </option>
          </select>
        </div>
      )}

      {user.role === "SUPER_ADMIN" ? (
        adminView === "CONTROLLER" ? (
          <Controller />
        ) : adminView === "DRIVER" ? (
          <Driver />
        ) : (
          <Admin />
        )
      ) : user.role === "CONTROLLER" ? (
        <Controller />
      ) : user.role === "DRIVER" ? (
        <Driver />
      ) : (
        <main className="standalone-page">
          <div className="error-banner">
            Your account does not have a valid BusControl role.
          </div>
        </main>
      )}
    </Shell>
  );
}
