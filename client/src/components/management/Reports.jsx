import { useMemo, useState } from "react";

const fmtDistance = (value) =>
  value >= 1000
    ? `${(value / 1000).toFixed(1)} km`
    : `${value || 0} m`;

const fmtDuration = (value) =>
  `${Math.max(1, Math.round((value || 0) / 60))} min`;

const when = (value) =>
  value
    ? new Date(value).toLocaleString("en-GB")
    : "—";

function Reports({ disruptions, ops }) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const diversions = ops.diversions || [];
  const acknowledgements =
    ops.acknowledgements || [];
  const driverReports =
    ops.driverReports || [];

  const active = diversions.filter(
    (item) => item.status === "ACTIVE"
  ).length;

  const pending = diversions.filter(
    (item) =>
      item.status === "PROPOSED" ||
      item.status === "AWAITING_APPROVAL" ||
      item.status === "APPROVED"
  ).length;

  const ended = diversions.filter(
    (item) => item.status === "ENDED"
  ).length;

  const rejected = diversions.filter(
    (item) => item.status === "REJECTED"
  ).length;

  const superseded = diversions.filter(
    (item) => item.status === "SUPERSEDED"
  ).length;

  const revisions = diversions.filter(
    (item) => Number(item.revision || 1) > 1
  ).length;

  const totalDistance = diversions.reduce(
    (total, item) =>
      total +
      Number(item.distanceMetres || 0),
    0
  );

  const averageDuration = diversions.length
    ? diversions.reduce(
        (total, item) =>
          total +
          Number(item.durationSeconds || 0),
        0
      ) / diversions.length
    : 0;

  const filteredDiversions = useMemo(() => {
    const query =
      search.trim().toLowerCase();

    return diversions.filter((item) => {
      const matchesStatus =
        filter === "ALL" ||
        item.status === filter;

      const searchable = [
        item.lineId,
        item.direction,
        item.status,
        item.incident?.location,
        item.incident?.category,
        item.incident?.severity,
        item.revision,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !query ||
        searchable.includes(query);

      return (
        matchesStatus &&
        matchesSearch
      );
    });
  }, [diversions, filter, search]);

  const countAcknowledgements = (id) =>
    acknowledgements.filter(
      (item) =>
        item.diversionId === id
    ).length;

  const countReports = (id) =>
    driverReports.filter(
      (item) =>
        item.diversionId === id
    ).length;

  return (
    <>
      <section className="workspace-heading">
        <div>
          <span className="eyebrow">
            REPORTING
          </span>

          <h2>Operational Reports</h2>

          <p>
            Review diversion activity,
            controller decisions and driver
            response across BusControl.
          </p>
        </div>
      </section>

      <section className="stat-grid">
        <article className="stat-card">
          <span>LIVE INCIDENTS</span>
          <strong>
            {disruptions.length}
          </strong>
        </article>

        <article className="stat-card">
          <span>
            DIVERSION RECORDS
          </span>
          <strong>
            {diversions.length}
          </strong>
        </article>

        <article className="stat-card">
          <span>
            ACTIVE DIVERSIONS
          </span>
          <strong>{active}</strong>
        </article>

        <article className="stat-card serious">
          <span>ROAD REPORTS</span>
          <strong>
            {driverReports.length}
          </strong>
        </article>
      </section>

      <section className="selected-incident-panel">
        <span className="panel-kicker">
          DIVERSION PERFORMANCE
        </span>

        <h3>
          Operational lifecycle
        </h3>

        <div className="workflow-grid">
          <div>
            <span>PENDING</span>
            <strong>{pending}</strong>
          </div>

          <div>
            <span>ACTIVE</span>
            <strong>{active}</strong>
          </div>

          <div>
            <span>ENDED</span>
            <strong>{ended}</strong>
          </div>

          <div>
            <span>REJECTED</span>
            <strong>{rejected}</strong>
          </div>

          <div>
            <span>SUPERSEDED</span>
            <strong>
              {superseded}
            </strong>
          </div>

          <div>
            <span>REVISIONS</span>
            <strong>{revisions}</strong>
          </div>

          <div>
            <span>DRIVER ACKS</span>
            <strong>
              {acknowledgements.length}
            </strong>
          </div>

          <div>
            <span>
              TOTAL DIVERSION DISTANCE
            </span>
            <strong>
              {fmtDistance(
                totalDistance
              )}
            </strong>
          </div>
        </div>
      </section>

      <section className="selected-incident-panel">
        <span className="panel-kicker">
          OPERATIONAL SUMMARY
        </span>

        <h3>Diversion statistics</h3>

        <div className="workflow-grid">
          <div>
            <span>
              AVG. DIVERSION TIME
            </span>
            <strong>
              {diversions.length
                ? fmtDuration(
                    averageDuration
                  )
                : "—"}
            </strong>
          </div>

          <div>
            <span>
              AVG. DRIVER ACKS
            </span>
            <strong>
              {diversions.length
                ? (
                    acknowledgements.length /
                    diversions.length
                  ).toFixed(1)
                : "0"}
            </strong>
          </div>

          <div>
            <span>
              AVG. ROAD REPORTS
            </span>
            <strong>
              {diversions.length
                ? (
                    driverReports.length /
                    diversions.length
                  ).toFixed(1)
                : "0"}
            </strong>
          </div>

          <div>
            <span>
              REVISED DIVERSION RECORDS
            </span>
            <strong>
              {revisions}
            </strong>
          </div>
        </div>
      </section>

      <section className="route-control-panel">
        <div className="route-input-group">
          <label>
            Search reports
          </label>

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Route, location, direction or status"
          />
        </div>

        <div className="route-input-group">
          <label>Status</label>

          <select
            value={filter}
            onChange={(event) =>
              setFilter(
                event.target.value
              )
            }
          >
            <option value="ALL">
              All statuses
            </option>

            <option value="PROPOSED">
              Proposed
            </option>

            <option value="AWAITING_APPROVAL">
              Awaiting Approval
            </option>

            <option value="APPROVED">
              Approved
            </option>

            <option value="ACTIVE">
              Active
            </option>

            <option value="ENDED">
              Ended
            </option>

            <option value="REJECTED">
              Rejected
            </option>

            <option value="SUPERSEDED">
              Superseded
            </option>

            <option value="CANCELLED">
              Cancelled
            </option>
          </select>
        </div>
      </section>

      <section className="selected-incident-panel">
        <div className="selected-incident-header">
          <div>
            <span className="panel-kicker">
              DIVERSION RECORDS
            </span>

            <h3>
              Operational report
            </h3>
          </div>

          <span className="incident-count">
            {filteredDiversions.length}
          </span>
        </div>

        <div className="diversion-table">
          {filteredDiversions.map(
            (diversion) => {
              const ackCount =
                countAcknowledgements(
                  diversion.id
                );

              const reportCount =
                countReports(
                  diversion.id
                );

              return (
                <div
                  className="report-row"
                  key={diversion.id}
                >
                  <strong>
                    Route{" "}
                    {diversion.lineId}
                  </strong>

                  <span>
                    {diversion.direction}
                  </span>

                  <span
                    className={`status-pill status-${diversion.status.toLowerCase()}`}
                  >
                    {diversion.status.replaceAll(
                      "_",
                      " "
                    )}
                  </span>

                  <span>
                    {diversion.incident
                      ?.location ||
                      "No incident location"}
                  </span>

                  <span>
                    Revision{" "}
                    {diversion.revision ||
                      1}
                  </span>

                  <span>
                    {fmtDistance(
                      diversion.distanceMetres
                    )}
                  </span>

                  <span>
                    {fmtDuration(
                      diversion.durationSeconds
                    )}
                  </span>

                  <span>
                    {ackCount} ack ·{" "}
                    {reportCount} report
                    {reportCount === 1
                      ? ""
                      : "s"}
                  </span>

                  <small>
                    {when(
                      diversion.createdAt
                    )}
                  </small>
                </div>
              );
            }
          )}

          {!filteredDiversions.length && (
            <div className="empty-large">
              No diversion records match
              the selected report filters.
            </div>
          )}
        </div>
      </section>

      <div className="risk-box">
        <strong>
          Operational reporting
        </strong>

        <p>
          These figures are generated from
          the current BusControl operational
          records. Persistent historical
          reporting will use the Supabase
          database when Stage 5 persistence
          is connected.
        </p>
      </div>
    </>
  );
}

export default Reports;