import { useEffect, useMemo, useState } from "react";
import ControlMap from "../../maps/ControlMap";
import {
    getRoadDisruptions,
    analyseRoute,
} from "../../services/busControlApi";

const REFRESH_INTERVAL = 5 * 60 * 1000;

function ControllerDashboard() {
    const [disruptions, setDisruptions] = useState([]);
    const [selectedIncident, setSelectedIncident] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [lastUpdated, setLastUpdated] = useState(null);
    const [severityFilter, setSeverityFilter] = useState("all");
    const [routeSearch, setRouteSearch] = useState("");
    const [selectedRoute, setSelectedRoute] = useState("");
    const [routeDirection, setRouteDirection] = useState("outbound");
    const [routeGeometry, setRouteGeometry] = useState(null);
    const [routeStops, setRouteStops] = useState([]);
    const [routeAnalysis, setRouteAnalysis] = useState(null);
    const [routeMatchedIncidents, setRouteMatchedIncidents] = useState([]);
    const [routeLoading, setRouteLoading] = useState(false);
    const [routeError, setRouteError] = useState("");

    async function loadDisruptions(backgroundRefresh = false) {
        try {
            if (backgroundRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            setError("");

            const response = await getRoadDisruptions();

            const records = Array.isArray(response.disruptions)
                ? response.disruptions
                : [];

            setDisruptions(records);
            setLastUpdated(new Date());
        } catch (err) {
            console.error(err);

            setError(
                "BusControl could not retrieve live TfL disruption data."
            );
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => {
        loadDisruptions();

        const interval = window.setInterval(() => {
            loadDisruptions(true);
        }, REFRESH_INTERVAL);

        return () => window.clearInterval(interval);
    }, []);

    const filteredDisruptions = useMemo(() => {
        if (severityFilter === "all") {
            return disruptions;
        }

        return disruptions.filter(
            (incident) =>
                incident.severity?.toLowerCase() === severityFilter
        );
    }, [disruptions, severityFilter]);

    const statistics = useMemo(() => {
        return {
            total: disruptions.length,

            serious: disruptions.filter((item) =>
                ["serious", "severe"].includes(
                    item.severity?.toLowerCase()
                )
            ).length,

            moderate: disruptions.filter(
                (item) => item.severity?.toLowerCase() === "moderate"
            ).length,

            closures: disruptions.filter((item) => {
                if (item.hasClosures) return true;

                return item.streets?.some(
                    (street) => street.closure?.toLowerCase() === "closed"
                );
            }).length,
        };
    }, [disruptions]);

    function formatTime(value) {
        if (!value) return "Unknown";

        return new Date(value).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    async function handleRouteSearch(event) {
        event.preventDefault();

        const routeNumber = routeSearch.trim();

        if (!routeNumber) {
            setRouteError("Enter a bus route number.");
            return;
        }

        try {
            setRouteLoading(true);
            setRouteError("");

            const response = await analyseRoute(
                routeNumber,
                routeDirection
            );

            setSelectedRoute(routeNumber);
            setRouteGeometry(response.geometry || null);
            setRouteAnalysis(response.analysis || null);

            setRouteMatchedIncidents(
                Array.isArray(response.routeGeometryIncidents)
                    ? response.routeGeometryIncidents
                    : []
            );

            const sequences = Array.isArray(response.sequences)
                ? response.sequences
                : [];

            const directionSequences = sequences.filter(
                (sequence) =>
                    !sequence.direction ||
                    sequence.direction.toLowerCase() ===
                    routeDirection.toLowerCase()
            );

            const sourceSequences =
                directionSequences.length > 0
                    ? directionSequences
                    : sequences;

            const stops = sourceSequences.flatMap(
                (sequence) => sequence.stops || []
            );

            const uniqueStops = Array.from(
                new Map(stops.map((stop) => [stop.id, stop])).values()
            );

            setRouteStops(uniqueStops);
        } catch (error) {
            console.error(error);

            setSelectedRoute("");
            setRouteGeometry(null);
            setRouteStops([]);
            setRouteAnalysis(null);
            setRouteMatchedIncidents([]);

            setRouteError(
                `Unable to load route ${routeNumber}.`
            );
        } finally {
            setRouteLoading(false);
        }
    }

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
                        TfL LIVE
                    </span>

                    <span className="updated-time">
                        Updated{" "}
                        {lastUpdated
                            ? formatTime(lastUpdated)
                            : "--:--"}
                    </span>

                    <button
                        type="button"
                        className="refresh-button"
                        onClick={() => loadDisruptions(true)}
                        disabled={refreshing}
                    >
                        {refreshing ? "Refreshing..." : "Refresh"}
                    </button>

                    <div className="controller-user">
                        <div className="avatar">CO</div>

                        <div>
                            <strong>Controller</strong>
                            <span>Control Centre</span>
                        </div>
                    </div>
                </div>
            </header>

            <div className="dashboard-body">
                <aside className="sidebar">
                    <nav>
                        <button className="nav-item active">
                            <span>▦</span>
                            Control Board
                        </button>

                        <button className="nav-item">
                            <span>◉</span>
                            Live Map
                        </button>

                        <button className="nav-item">
                            <span>!</span>
                            Incidents
                            <b>{statistics.total}</b>
                        </button>

                        <button className="nav-item">
                            <span>↝</span>
                            Diversions
                        </button>

                        <button className="nav-item">
                            <span>R</span>
                            Routes
                        </button>

                        <button className="nav-item">
                            <span>D</span>
                            Drivers
                        </button>

                        <button className="nav-item">
                            <span>V</span>
                            Vehicles
                        </button>

                        <div className="nav-divider" />

                        <button className="nav-item">
                            <span>▤</span>
                            Reports
                        </button>

                        <button className="nav-item">
                            <span>◷</span>
                            History
                        </button>

                        <button className="nav-item">
                            <span>⚙</span>
                            Administration
                        </button>
                    </nav>

                    <div className="system-status">
                        <span className="status-dot" />

                        <div>
                            <strong>Systems operational</strong>
                            <span>TfL data connected</span>
                        </div>
                    </div>
                </aside>

                <main className="control-workspace">
                    <section className="workspace-heading">
                        <div>
                            <span className="eyebrow">LIVE OPERATIONS</span>
                            <h2>Control Board</h2>
                            <p>
                                Monitor London's road network and manage bus
                                diversions.
                            </p>
                        </div>

                        <button type="button" className="new-incident-button">
                            + New Incident
                        </button>
                    </section>

                    <section className="stat-grid">
                        <article className="stat-card">
                            <span>LIVE INCIDENTS</span>
                            <strong>{statistics.total}</strong>
                            <small>TfL road disruptions</small>
                        </article>

                        <article className="stat-card serious">
                            <span>SERIOUS</span>
                            <strong>{statistics.serious}</strong>
                            <small>Priority incidents</small>
                        </article>

                        <article className="stat-card warning">
                            <span>MODERATE</span>
                            <strong>{statistics.moderate}</strong>
                            <small>Network disruptions</small>
                        </article>

                        <article className="stat-card closure">
                            <span>ROAD CLOSURES</span>
                            <strong>{statistics.closures}</strong>
                            <small>Detected from TfL data</small>
                        </article>
                    </section>

                    {error && <div className="error-banner">{error}</div>}

                    <section className="route-control-panel">
                        <div className="route-control-heading">
                            <div>
                                <span className="panel-kicker">
                                    ROUTE INTELLIGENCE
                                </span>

                                <h3>Bus Route Analysis</h3>
                            </div>

                            {selectedRoute && (
                                <div className="active-route">
                                    <span>ACTIVE ROUTE</span>
                                    <strong>{selectedRoute}</strong>
                                </div>
                            )}
                        </div>

                        <form
                            className="route-search-form"
                            onSubmit={handleRouteSearch}
                        >
                            <div className="route-input-group">
                                <label htmlFor="route-search">Bus route</label>

                                <input
                                    id="route-search"
                                    type="text"
                                    value={routeSearch}
                                    onChange={(event) =>
                                        setRouteSearch(event.target.value)
                                    }
                                    placeholder="e.g. 55"
                                    autoComplete="off"
                                />
                            </div>

                            <div className="route-input-group">
                                <label htmlFor="route-direction">
                                    Direction
                                </label>

                                <select
                                    id="route-direction"
                                    value={routeDirection}
                                    onChange={(event) =>
                                        setRouteDirection(event.target.value)
                                    }
                                >
                                    <option value="outbound">Outbound</option>
                                    <option value="inbound">Inbound</option>
                                </select>
                            </div>

                            <button
                                type="submit"
                                className="analyse-route-button"
                                disabled={routeLoading}
                            >
                                {routeLoading
                                    ? "Analysing..."
                                    : "Analyse Route"}
                            </button>
                        </form>

                        {routeError && (
                            <div className="route-error">{routeError}</div>
                        )}

                        {selectedRoute && routeAnalysis && (
                            <div className="route-summary">
                                <div>
                                    <span>Route</span>
                                    <strong>{selectedRoute}</strong>
                                </div>

                                <div>
                                    <span>Direction</span>
                                    <strong>{routeDirection}</strong>
                                </div>

                                <div>
                                    <span>Stops</span>
                                    <strong>{routeStops.length}</strong>
                                </div>

                                <div>
                                    <span>Nearby Candidates</span>
                                    <strong>
                                        {routeAnalysis.possibleAffectedIncidents ?? 0}
                                    </strong>
                                </div>

                                <div className="route-match-summary">
                                    <span>Route Matched</span>
                                    <strong>
                                        {routeAnalysis.routeGeometryIncidents ?? 0}
                                    </strong>
                                </div>
                            </div>
                        )}
                    </section>

                    {selectedRoute && (
                        <section className="route-incidents-panel">
                            <div className="route-incidents-heading">
                                <div>
                                    <span className="panel-kicker">
                                        ROUTE IMPACT ANALYSIS
                                    </span>

                                    <h3>
                                        Route {selectedRoute} —{" "}
                                        {routeDirection === "outbound"
                                            ? "Outbound"
                                            : "Inbound"}
                                    </h3>
                                </div>

                                <div className="route-match-count">
                                    <span>ROUTE MATCHED</span>
                                    <strong>{routeMatchedIncidents.length}</strong>
                                </div>
                            </div>

                            {routeMatchedIncidents.length === 0 ? (
                                <div className="no-route-incidents">
                                    <strong>
                                        No road incidents currently matched to this route
                                    </strong>

                                    <span>
                                        BusControl found no TfL road disruption within the
                                        current route-geometry threshold.
                                    </span>
                                </div>
                            ) : (
                                <div className="route-incident-list">
                                    {routeMatchedIncidents.map((match) => {
                                        const incident = match.incident;

                                        return (
                                            <button
                                                type="button"
                                                key={incident.id}
                                                className="route-incident-item"
                                                onClick={() => setSelectedIncident(incident)}
                                            >
                                                <div className="route-incident-status">
                                                    <span
                                                        className={`severity-badge severity-${incident.severity?.toLowerCase()}`}
                                                    >
                                                        {incident.severity || "Unknown"}
                                                    </span>

                                                    <span className="route-distance">
                                                        {match.distanceMetres}m from route
                                                    </span>
                                                </div>

                                                <strong>
                                                    {incident.location ||
                                                        "London road disruption"}
                                                </strong>

                                                <p>
                                                    {incident.comments ||
                                                        incident.currentUpdate ||
                                                        "No description available."}
                                                </p>

                                                <div className="route-incident-footer">
                                                    <span>
                                                        {incident.category || "Incident"}
                                                    </span>

                                                    <span>
                                                        {incident.status || "Unknown status"}
                                                    </span>

                                                    <span className="investigate-label">
                                                        Investigate →
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    )}

                    <section className="operations-grid">
                        <div className="map-panel">
                            <div className="panel-heading">
                                <div>
                                    <span className="panel-kicker">
                                        LONDON NETWORK
                                    </span>
                                    <h3>Live Control Map</h3>
                                </div>

                                <div className="map-legend">
                                    <span>
                                        <i className="legend-dot serious-dot" />
                                        Serious
                                    </span>

                                    <span>
                                        <i className="legend-dot moderate-dot" />
                                        Moderate
                                    </span>

                                    <span>
                                        <i className="legend-dot minimal-dot" />
                                        Minimal
                                    </span>
                                </div>
                            </div>

                            {loading ? (
                                <div className="map-loading">
                                    <div className="loader" />
                                    <strong>Loading London network...</strong>
                                    <span>Connecting to TfL live data</span>
                                </div>
                            ) : (
                                <ControlMap
                                    disruptions={filteredDisruptions}
                                    selectedIncident={selectedIncident}
                                    onSelectIncident={setSelectedIncident}
                                    routeGeometry={routeGeometry}
                                    routeStops={routeStops}
                                    routeNumber={selectedRoute}
                                    direction={routeDirection}
                                    routeMatchedIncidents={routeMatchedIncidents}
                                />
                            )}
                        </div>

                        <aside className="incident-panel">
                            <div className="panel-heading incident-heading">
                                <div>
                                    <span className="panel-kicker">
                                        OPERATIONAL FEED
                                    </span>
                                    <h3>Live Incidents</h3>
                                </div>

                                <span className="incident-count">
                                    {filteredDisruptions.length}
                                </span>
                            </div>

                            <div className="filter-row">
                                {["all", "serious", "moderate", "minimal"].map(
                                    (filter) => (
                                        <button
                                            key={filter}
                                            type="button"
                                            className={
                                                severityFilter === filter ? "selected" : ""
                                            }
                                            onClick={() => setSeverityFilter(filter)}
                                        >
                                            {filter}
                                        </button>
                                    )
                                )}
                            </div>

                            <div className="incident-list">
                                {filteredDisruptions.slice(0, 30).map((incident) => (
                                    <button
                                        type="button"
                                        key={incident.id}
                                        className={`incident-card ${selectedIncident?.id === incident.id
                                            ? "selected"
                                            : ""
                                            }`}
                                        onClick={() => setSelectedIncident(incident)}
                                    >
                                        <div className="incident-card-top">
                                            <span
                                                className={`severity-badge severity-${incident.severity?.toLowerCase()}`}
                                            >
                                                {incident.severity || "Unknown"}
                                            </span>

                                            <time>
                                                {formatTime(
                                                    incident.currentUpdateDateTime ||
                                                    incident.lastModifiedTime
                                                )}
                                            </time>
                                        </div>

                                        <strong>
                                            {incident.location || "London road disruption"}
                                        </strong>

                                        <p>
                                            {incident.comments ||
                                                incident.currentUpdate ||
                                                "No incident description available."}
                                        </p>

                                        <div className="incident-meta">
                                            <span>
                                                {incident.category || "Incident"}
                                            </span>

                                            <span>
                                                {incident.status || "Unknown status"}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </aside>
                    </section>

                    {selectedIncident && (
                        <section className="selected-incident-panel">
                            <div className="selected-incident-header">
                                <div>
                                    <span className="panel-kicker">
                                        SELECTED INCIDENT
                                    </span>

                                    <h3>
                                        {selectedIncident.location ||
                                            "London road disruption"}
                                    </h3>
                                </div>

                                <button
                                    type="button"
                                    className="close-button"
                                    onClick={() => setSelectedIncident(null)}
                                >
                                    ×
                                </button>
                            </div>

                            <div className="selected-details">
                                <div>
                                    <span>Reference</span>
                                    <strong>{selectedIncident.id}</strong>
                                </div>

                                <div>
                                    <span>Severity</span>
                                    <strong>{selectedIncident.severity}</strong>
                                </div>

                                <div>
                                    <span>Category</span>
                                    <strong>{selectedIncident.category}</strong>
                                </div>

                                <div>
                                    <span>Status</span>
                                    <strong>{selectedIncident.status}</strong>
                                </div>
                            </div>

                            <p className="selected-description">
                                {selectedIncident.comments ||
                                    selectedIncident.currentUpdate}
                            </p>

                            {selectedIncident.currentUpdate && (
                                <div className="tfl-update">
                                    <span>Latest TfL update</span>
                                    <p>{selectedIncident.currentUpdate}</p>
                                </div>
                            )}

                            <div className="incident-actions">
                                <button type="button" className="secondary-action">
                                    View Details
                                </button>

                                <button type="button" className="secondary-action">
                                    Analyse Routes
                                </button>

                                <button type="button" className="primary-action">
                                    Generate Diversion
                                </button>
                            </div>
                        </section>
                    )}
                </main>
            </div>
        </div>
    );
}

export default ControllerDashboard;