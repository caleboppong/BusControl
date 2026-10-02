import { useEffect, useMemo, useState } from "react";
import {
  createCurtailment,
  getCurtailmentOperations,
  reviseCurtailment,
  setCurtailmentStatus,
} from "../../services/busControlApi";

const EMPTY_POINT = {
  name: "",
  location: "",
  setDownStop: "",
  turningRoute: "",
  standLocation: "",
  pickUpStop: "",
  operationalNotes: "",
  latitude: "",
  longitude: "",
  verified: false,
  source: "",
};

const EMPTY_FORM = {
  routeNumber: "",
  direction: "outbound",
  vehicleId: "",
  dutyNumber: "",
  controllerName: "Controller",
  reason: "LATE_RUNNING",
  reasonDetails: "",
  latenessMinutes: "",
  curtailmentPoint: EMPTY_POINT,
};

const STATUS_ACTIONS = {
  PROPOSED: [
    ["APPROVED", "Approve"],
    ["REJECTED", "Reject"],
    ["CANCELLED", "Cancel"],
  ],
  APPROVED: [
    ["ACTIVE", "Activate"],
    ["CANCELLED", "Cancel"],
  ],
  ACTIVE: [["ENDED", "End Curtailment"]],
};

function formatDate(value) {
  return value ? new Date(value).toLocaleString("en-GB") : "—";
}

function reasonLabel(value) {
  return String(value || "OTHER").replaceAll("_", " ");
}

function statusClass(status) {
  return `status-pill status-${String(status || "").toLowerCase()}`;
}

function Curtailments() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [operations, setOperations] = useState({
    curtailments: [],
    acknowledgements: [],
    driverReports: [],
    audit: [],
  });
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [revisionReason, setRevisionReason] = useState("");

  const loadOperations = async () => {
    try {
      const response = await getCurtailmentOperations();
      setOperations({
        curtailments: response.curtailments || [],
        acknowledgements: response.acknowledgements || [],
        driverReports: response.driverReports || [],
        audit: response.audit || [],
      });
      setError("");
    } catch (loadError) {
      console.error(loadError);
      setError("Unable to load curtailment operations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOperations();

    const timer = window.setInterval(loadOperations, 15000);

    return () => window.clearInterval(timer);
  }, []);

  const selected = useMemo(
    () =>
      operations.curtailments.find(
        (item) => item.id === selectedId
      ) || null,
    [operations.curtailments, selectedId]
  );

  const activeCount = operations.curtailments.filter(
    (item) => item.status === "ACTIVE"
  ).length;

  const proposedCount = operations.curtailments.filter(
    (item) => item.status === "PROPOSED"
  ).length;

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updatePoint = (field, value) => {
    setForm((current) => ({
      ...current,
      curtailmentPoint: {
        ...current.curtailmentPoint,
        [field]: value,
      },
    }));
  };

  const resetForm = () => {
    setForm({
      ...EMPTY_FORM,
      curtailmentPoint: {
        ...EMPTY_POINT,
      },
    });
  };

  const submitCurtailment = async (event) => {
    event.preventDefault();

    if (!form.routeNumber.trim()) {
      setError("Enter a route number.");
      return;
    }

    if (!form.curtailmentPoint.name.trim()) {
      setError("Enter or select a curtailment point.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await createCurtailment({
        ...form,
        routeNumber: form.routeNumber.trim().toUpperCase(),
        latenessMinutes:
          form.latenessMinutes === ""
            ? null
            : Number(form.latenessMinutes),
      });

      const curtailment = response.curtailment;

      setMessage(
        `${curtailment.reference} created successfully.`
      );

      setSelectedId(curtailment.id);
      resetForm();
      await loadOperations();
    } catch (submitError) {
      console.error(submitError);
      setError(
        submitError?.response?.data?.message ||
          "Unable to create curtailment."
      );
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (curtailment, status) => {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await setCurtailmentStatus(
        curtailment.id,
        status,
        "Controller"
      );

      setMessage(response.message || `Curtailment is now ${status}.`);
      setSelectedId(curtailment.id);
      await loadOperations();
    } catch (statusError) {
      console.error(statusError);
      setError(
        statusError?.response?.data?.message ||
          "Unable to update curtailment."
      );
    } finally {
      setBusy(false);
    }
  };

  const makeRevision = async () => {
    if (!selected) return;

    if (!revisionReason.trim()) {
      setError("Enter a reason for the revision.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await reviseCurtailment(selected.id, {
        revisionReason: revisionReason.trim(),
        controllerName: "Controller",
      });

      setSelectedId(response.curtailment.id);
      setRevisionReason("");
      setMessage(
        `${response.curtailment.reference} created as a new revision.`
      );

      await loadOperations();
    } catch (revisionError) {
      console.error(revisionError);
      setError(
        revisionError?.response?.data?.message ||
          "Unable to revise curtailment."
      );
    } finally {
      setBusy(false);
    }
  };

  const acknowledgementCount = (id) =>
    operations.acknowledgements.filter(
      (item) => item.curtailmentId === id
    ).length;

  const reportCount = (id) =>
    operations.driverReports.filter(
      (item) => item.curtailmentId === id
    ).length;

  return (
    <>
      <section className="workspace-heading">
        <div>
          <span className="eyebrow">SERVICE CONTROL</span>
          <h2>Curtailments</h2>
          <p>
            Regulate late-running services or issue incident-related
            curtailments using controller-approved operational points.
          </p>
        </div>
        <button
          className="secondary-action"
          type="button"
          onClick={loadOperations}
          disabled={busy}
        >
          Refresh
        </button>
      </section>

      {message && <div className="success-banner">{message}</div>}
      {error && <div className="error-banner">{error}</div>}

      <section className="stat-grid">
        <article className="stat-card">
          <span>TOTAL CURTAILMENTS</span>
          <strong>{operations.curtailments.length}</strong>
        </article>
        <article className="stat-card">
          <span>PROPOSED</span>
          <strong>{proposedCount}</strong>
        </article>
        <article className="stat-card">
          <span>ACTIVE</span>
          <strong>{activeCount}</strong>
        </article>
        <article className="stat-card">
          <span>DRIVER REPORTS</span>
          <strong>{operations.driverReports.length}</strong>
        </article>
      </section>

      <section className="selected-incident-panel">
        <div className="proposal-title">
          <div>
            <span className="eyebrow">NEW OPERATION</span>
            <h3>Create Curtailment</h3>
          </div>
        </div>

        <div className="risk-box">
          <strong>Curtailment point verification</strong>
          <p>
            Until the verified route curtailment-point dataset is connected,
            points entered here must be treated as controller-configured or
            test data. Do not assume a manually entered point is an approved
            operational curtailment point.
          </p>
        </div>

        <form onSubmit={submitCurtailment}>
          <div className="workflow-grid">
            <label>
              <span>ROUTE</span>
              <input
                value={form.routeNumber}
                onChange={(event) =>
                  updateField("routeNumber", event.target.value)
                }
                placeholder="215"
              />
            </label>

            <label>
              <span>DIRECTION</span>
              <select
                value={form.direction}
                onChange={(event) =>
                  updateField("direction", event.target.value)
                }
              >
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
            </label>

            <label>
              <span>VEHICLE</span>
              <input
                value={form.vehicleId}
                onChange={(event) =>
                  updateField("vehicleId", event.target.value)
                }
                placeholder="Vehicle or fleet number"
              />
            </label>

            <label>
              <span>DUTY</span>
              <input
                value={form.dutyNumber}
                onChange={(event) =>
                  updateField("dutyNumber", event.target.value)
                }
                placeholder="Duty number"
              />
            </label>

            <label>
              <span>REASON</span>
              <select
                value={form.reason}
                onChange={(event) =>
                  updateField("reason", event.target.value)
                }
              >
                <option value="LATE_RUNNING">
                  Late Running
                </option>
                <option value="SERVICE_REGULATION">
                  Service Regulation
                </option>
                <option value="INCIDENT">Incident</option>
                <option value="DISRUPTION">Disruption</option>
                <option value="OTHER">Other</option>
              </select>
            </label>

            <label>
              <span>MINUTES LATE</span>
              <input
                type="number"
                min="0"
                value={form.latenessMinutes}
                onChange={(event) =>
                  updateField("latenessMinutes", event.target.value)
                }
                placeholder="18"
              />
            </label>
          </div>

          <label>
            <span>REASON / CONTROL NOTES</span>
            <textarea
              value={form.reasonDetails}
              onChange={(event) =>
                updateField("reasonDetails", event.target.value)
              }
              placeholder="Reason for regulating this service..."
              rows="3"
            />
          </label>

          <div className="proposal-title">
            <div>
              <span className="eyebrow">OPERATIONAL POINT</span>
              <h3>Curtailment Point</h3>
            </div>
          </div>

          <div className="workflow-grid">
            <label>
              <span>POINT NAME</span>
              <input
                value={form.curtailmentPoint.name}
                onChange={(event) =>
                  updatePoint("name", event.target.value)
                }
                placeholder="Curtailment point"
              />
            </label>

            <label>
              <span>LOCATION</span>
              <input
                value={form.curtailmentPoint.location}
                onChange={(event) =>
                  updatePoint("location", event.target.value)
                }
                placeholder="Location"
              />
            </label>

            <label>
              <span>SET-DOWN STOP</span>
              <input
                value={form.curtailmentPoint.setDownStop}
                onChange={(event) =>
                  updatePoint("setDownStop", event.target.value)
                }
                placeholder="Set-down stop"
              />
            </label>

            <label>
              <span>PICK-UP STOP</span>
              <input
                value={form.curtailmentPoint.pickUpStop}
                onChange={(event) =>
                  updatePoint("pickUpStop", event.target.value)
                }
                placeholder="Pick-up stop"
              />
            </label>

            <label>
              <span>STAND LOCATION</span>
              <input
                value={form.curtailmentPoint.standLocation}
                onChange={(event) =>
                  updatePoint("standLocation", event.target.value)
                }
                placeholder="Stand location"
              />
            </label>

            <label>
              <span>SOURCE</span>
              <input
                value={form.curtailmentPoint.source}
                onChange={(event) =>
                  updatePoint("source", event.target.value)
                }
                placeholder="TfL route record / operator record"
              />
            </label>
          </div>

          <label>
            <span>TURNING / CURTAILMENT ROUTE</span>
            <textarea
              value={form.curtailmentPoint.turningRoute}
              onChange={(event) =>
                updatePoint("turningRoute", event.target.value)
              }
              placeholder="Operational turning instructions"
              rows="3"
            />
          </label>

          <label>
            <span>OPERATIONAL NOTES</span>
            <textarea
              value={form.curtailmentPoint.operationalNotes}
              onChange={(event) =>
                updatePoint("operationalNotes", event.target.value)
              }
              placeholder="Restrictions, stand information or controller notes"
              rows="3"
            />
          </label>

          <label>
            <input
              type="checkbox"
              checked={form.curtailmentPoint.verified}
              onChange={(event) =>
                updatePoint("verified", event.target.checked)
              }
            />
            <span>
              Point has been checked against an approved operational source
            </span>
          </label>

          <button
            className="primary-action"
            type="submit"
            disabled={busy}
          >
            {busy ? "Working..." : "Create Curtailment"}
          </button>
        </form>
      </section>

      <section className="selected-incident-panel">
        <div className="proposal-title">
          <div>
            <span className="eyebrow">OPERATIONS</span>
            <h3>Curtailment Records</h3>
          </div>
          <span>{operations.curtailments.length} records</span>
        </div>

        {loading && (
          <div className="empty-large">Loading curtailments...</div>
        )}

        {!loading && !operations.curtailments.length && (
          <div className="empty-large">
            No curtailment operations have been created.
          </div>
        )}

        <div className="diversion-table">
          {operations.curtailments.map((item) => (
            <button
              type="button"
              className="report-row"
              key={item.id}
              onClick={() => setSelectedId(item.id)}
            >
              <strong>{item.reference}</strong>
              <span>
                Route {item.routeNumber} · {item.direction}
              </span>
              <span>{reasonLabel(item.reason)}</span>
              <span className={statusClass(item.status)}>
                {item.status}
              </span>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <section className="selected-incident-panel">
          <div className="proposal-title">
            <div>
              <span className="eyebrow">SELECTED CURTAILMENT</span>
              <h3>{selected.reference}</h3>
            </div>
            <span className={statusClass(selected.status)}>
              {selected.status}
            </span>
          </div>

          <div className="workflow-grid">
            <div>
              <span>ROUTE</span>
              <strong>{selected.routeNumber}</strong>
            </div>
            <div>
              <span>DIRECTION</span>
              <strong>{selected.direction}</strong>
            </div>
            <div>
              <span>VEHICLE</span>
              <strong>{selected.vehicleId || "—"}</strong>
            </div>
            <div>
              <span>DUTY</span>
              <strong>{selected.dutyNumber || "—"}</strong>
            </div>
            <div>
              <span>REASON</span>
              <strong>{reasonLabel(selected.reason)}</strong>
            </div>
            <div>
              <span>LATENESS</span>
              <strong>
                {selected.latenessMinutes === null
                  ? "—"
                  : `${selected.latenessMinutes} min`}
              </strong>
            </div>
            <div>
              <span>DRIVER ACKS</span>
              <strong>{acknowledgementCount(selected.id)}</strong>
            </div>
            <div>
              <span>ROAD REPORTS</span>
              <strong>{reportCount(selected.id)}</strong>
            </div>
          </div>

          <div className="risk-box">
            <strong>
              {selected.curtailmentPoint?.verified
                ? "Verified operational point"
                : "Unverified / controller-configured point"}
            </strong>
            <p>
              {selected.curtailmentPoint?.name || "No point name"}
              {selected.curtailmentPoint?.location
                ? ` · ${selected.curtailmentPoint.location}`
                : ""}
            </p>
          </div>

          <div className="workflow-grid">
            <div>
              <span>SET DOWN</span>
              <strong>
                {selected.curtailmentPoint?.setDownStop || "—"}
              </strong>
            </div>
            <div>
              <span>PICK UP</span>
              <strong>
                {selected.curtailmentPoint?.pickUpStop || "—"}
              </strong>
            </div>
            <div>
              <span>STAND</span>
              <strong>
                {selected.curtailmentPoint?.standLocation || "—"}
              </strong>
            </div>
            <div>
              <span>CREATED</span>
              <strong>{formatDate(selected.createdAt)}</strong>
            </div>
          </div>

          {selected.curtailmentPoint?.turningRoute && (
            <div className="risk-box">
              <strong>Turning / curtailment route</strong>
              <p>{selected.curtailmentPoint.turningRoute}</p>
            </div>
          )}

          {selected.reasonDetails && (
            <div className="risk-box">
              <strong>Control notes</strong>
              <p>{selected.reasonDetails}</p>
            </div>
          )}

          <div className="action-row">
            {(STATUS_ACTIONS[selected.status] || []).map(
              ([nextStatus, label]) => (
                <button
                  key={nextStatus}
                  type="button"
                  className={
                    nextStatus === "APPROVED" ||
                    nextStatus === "ACTIVE"
                      ? "primary-action"
                      : "secondary-action"
                  }
                  disabled={busy}
                  onClick={() => changeStatus(selected, nextStatus)}
                >
                  {label}
                </button>
              )
            )}
          </div>

          {!["ENDED", "CANCELLED", "REJECTED", "SUPERSEDED"].includes(
            selected.status
          ) && (
            <div className="risk-box">
              <strong>Revise Curtailment</strong>
              <p>
                Create a new revision while retaining the original operational
                reference.
              </p>
              <input
                value={revisionReason}
                onChange={(event) =>
                  setRevisionReason(event.target.value)
                }
                placeholder="Reason for revision"
              />
              <button
                type="button"
                className="secondary-action"
                disabled={busy}
                onClick={makeRevision}
              >
                Create Revision
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}

export default Curtailments;