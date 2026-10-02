import { useMemo, useState } from "react";

const when = (value) =>
  value ? new Date(value).toLocaleString("en-GB") : "—";

function formatAction(value = "") {
  return value.replaceAll("_", " ");
}

function getActionGroup(action = "") {
  const value = action.toUpperCase();

  if (value.includes("DRIVER") || value.includes("ACKNOWLEDG")) {
    return "DRIVER";
  }

  if (
    value.includes("APPROV") ||
    value.includes("ACTIV") ||
    value.includes("STATUS") ||
    value.includes("END") ||
    value.includes("REJECT") ||
    value.includes("CANCEL")
  ) {
    return "LIFECYCLE";
  }

  if (
    value.includes("DIVERSION") ||
    value.includes("REVISION") ||
    value.includes("SUPERSEDE")
  ) {
    return "DIVERSION";
  }

  return "SYSTEM";
}

function getReference(item) {
  return (
    item.details?.lineId ||
    item.details?.routeNumber ||
    item.details?.diversionId ||
    item.details?.incidentId ||
    "System"
  );
}

function getDescription(item) {
  const details = item.details || {};

  if (details.lineId) {
    return `Route ${details.lineId}${
      details.direction ? ` · ${details.direction}` : ""
    }`;
  }

  if (details.driverName) {
    return details.driverName;
  }

  if (details.message) {
    return details.message;
  }

  if (details.diversionId) {
    return `Diversion ${details.diversionId}`;
  }

  if (details.incidentId) {
    return `Incident ${details.incidentId}`;
  }

  return "BusControl operational event";
}

function History({ ops }) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("ALL");

  const audit = ops.audit || [];

  const lifecycleCount = audit.filter(
    (item) => getActionGroup(item.action) === "LIFECYCLE"
  ).length;

  const diversionCount = audit.filter(
    (item) => getActionGroup(item.action) === "DIVERSION"
  ).length;

  const driverCount = audit.filter(
    (item) => getActionGroup(item.action) === "DRIVER"
  ).length;

  const filteredAudit = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...audit]
      .filter((item) => {
        const itemGroup = getActionGroup(item.action);

        if (group !== "ALL" && itemGroup !== group) {
          return false;
        }

        if (!query) {
          return true;
        }

        const searchable = [
          item.action,
          getReference(item),
          getDescription(item),
          item.details?.lineId,
          item.details?.direction,
          item.details?.driverName,
          item.details?.message,
          item.details?.diversionId,
          item.details?.incidentId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchable.includes(query);
      })
      .sort((a, b) => {
        const first = new Date(a.at || 0).getTime();
        const second = new Date(b.at || 0).getTime();

        return second - first;
      });
  }, [audit, search, group]);

  return (
    <>
      <section className="workspace-heading">
        <div>
          <span className="eyebrow">AUDIT & HISTORY</span>
          <h2>Operational History</h2>
          <p>
            Review the chronological audit trail of diversion,
            controller and driver activity recorded by BusControl.
          </p>
        </div>
      </section>

      <section className="stat-grid">
        <article className="stat-card">
          <span>AUDIT EVENTS</span>
          <strong>{audit.length}</strong>
        </article>

        <article className="stat-card">
          <span>LIFECYCLE EVENTS</span>
          <strong>{lifecycleCount}</strong>
        </article>

        <article className="stat-card">
          <span>DIVERSION EVENTS</span>
          <strong>{diversionCount}</strong>
        </article>

        <article className="stat-card">
          <span>DRIVER EVENTS</span>
          <strong>{driverCount}</strong>
        </article>
      </section>

      <section className="route-control-panel">
        <div className="route-input-group">
          <label>Search history</label>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Route, action, diversion, driver or incident"
          />
        </div>

        <div className="route-input-group">
          <label>Event type</label>
          <select
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            <option value="ALL">All events</option>
            <option value="LIFECYCLE">Lifecycle</option>
            <option value="DIVERSION">Diversion</option>
            <option value="DRIVER">Driver</option>
            <option value="SYSTEM">System</option>
          </select>
        </div>
      </section>

      <section className="selected-incident-panel">
        <div className="selected-incident-header">
          <div>
            <span className="panel-kicker">AUDIT TRAIL</span>
            <h3>Recorded operational events</h3>
          </div>

          <span className="incident-count">
            {filteredAudit.length}
          </span>
        </div>

        {filteredAudit.map((item) => {
          const actionGroup = getActionGroup(item.action);

          return (
            <div className="audit-row" key={item.id}>
              <strong>{formatAction(item.action)}</strong>

              <span>
                {getDescription(item)}
              </span>

              <small>
                {actionGroup} · {when(item.at)}
              </small>
            </div>
          );
        })}

        {!filteredAudit.length && (
          <div className="empty-large">
            No audit events match the selected filters.
          </div>
        )}
      </section>

      <section className="selected-incident-panel">
        <span className="panel-kicker">AUDIT PRINCIPLE</span>
        <h3>Operational accountability</h3>

        <div className="risk-box">
          <strong>Records are retained</strong>
          <p>
            Diversion revisions, approvals, activations, driver
            responses and closed operations should remain available
            in the audit trail rather than being overwritten.
          </p>
        </div>
      </section>
    </>
  );
}

export default History;