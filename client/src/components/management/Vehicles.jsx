import { useMemo, useState } from "react";

const INITIAL_VEHICLES = [
  {
    id: "DD-001",
    type: "Standard Double Deck",
    manufacturer: "Alexander Dennis",
    model: "Enviro400",
    garage: "London Garage",
    height: 4.4,
    width: 2.55,
    length: 11.5,
    status: "AVAILABLE",
  },
  {
    id: "EV-001",
    type: "Electric Double Deck",
    manufacturer: "Alexander Dennis",
    model: "Enviro400EV",
    garage: "London Garage",
    height: 4.39,
    width: 2.55,
    length: 11.1,
    status: "AVAILABLE",
  },
  {
    id: "SD-001",
    type: "Single Deck",
    manufacturer: "Generic",
    model: "Single Deck",
    garage: "London Garage",
    height: 3.2,
    width: 2.55,
    length: 11.8,
    status: "AVAILABLE",
  },
];

const EMPTY_FORM = {
  id: "",
  type: "Standard Double Deck",
  manufacturer: "",
  model: "",
  garage: "",
  height: "",
  width: "",
  length: "",
  status: "AVAILABLE",
};

function Vehicles() {
  const [vehicles, setVehicles] = useState(INITIAL_VEHICLES);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const filteredVehicles = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return vehicles;

    return vehicles.filter((vehicle) =>
      `${vehicle.id} ${vehicle.type} ${vehicle.manufacturer} ${vehicle.model} ${vehicle.garage} ${vehicle.status}`
        .toLowerCase()
        .includes(query)
    );
  }, [vehicles, search]);

  const available = vehicles.filter(
    (vehicle) => vehicle.status === "AVAILABLE"
  ).length;

  const unavailable = vehicles.length - available;

  const tallestVehicle = vehicles.reduce(
    (highest, vehicle) =>
      Number(vehicle.height) > Number(highest)
        ? Number(vehicle.height)
        : highest,
    0
  );

  const updateForm = (event) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const addVehicle = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const editVehicle = (vehicle) => {
    setForm({
      ...vehicle,
      height: String(vehicle.height),
      width: String(vehicle.width),
      length: String(vehicle.length),
    });

    setEditingId(vehicle.id);
    setShowForm(true);
  };

  const saveVehicle = (event) => {
    event.preventDefault();

    const vehicleId = form.id.trim().toUpperCase();

    if (
      !vehicleId ||
      !form.type.trim() ||
      !form.height ||
      !form.width ||
      !form.length
    ) {
      window.alert(
        "Vehicle ID, type, height, width and length are required."
      );
      return;
    }

    const vehicle = {
      ...form,
      id: vehicleId,
      manufacturer: form.manufacturer.trim(),
      model: form.model.trim(),
      garage: form.garage.trim(),
      height: Number(form.height),
      width: Number(form.width),
      length: Number(form.length),
    };

    if (editingId) {
      setVehicles((current) =>
        current.map((item) =>
          item.id === editingId ? vehicle : item
        )
      );
    } else {
      const exists = vehicles.some(
        (item) => item.id.toLowerCase() === vehicleId.toLowerCase()
      );

      if (exists) {
        window.alert("A vehicle with this ID already exists.");
        return;
      }

      setVehicles((current) => [...current, vehicle]);
    }

    resetForm();
  };

  const removeVehicle = (vehicle) => {
    const confirmed = window.confirm(
      `Remove vehicle ${vehicle.id} from the fleet profile?`
    );

    if (!confirmed) return;

    setVehicles((current) =>
      current.filter((item) => item.id !== vehicle.id)
    );
  };

  return (
    <>
      <section className="workspace-heading">
        <div>
          <span className="eyebrow">FLEET SAFETY</span>
          <h2>Vehicles</h2>
          <p>
            Manage vehicle profiles used by controllers when reviewing
            diversion suitability and road restrictions.
          </p>
        </div>

        <button className="primary-action" onClick={addVehicle}>
          Add Vehicle
        </button>
      </section>

      <section className="stat-grid">
        <article className="stat-card">
          <span>FLEET PROFILES</span>
          <strong>{vehicles.length}</strong>
        </article>

        <article className="stat-card">
          <span>AVAILABLE</span>
          <strong>{available}</strong>
        </article>

        <article className="stat-card serious">
          <span>UNAVAILABLE</span>
          <strong>{unavailable}</strong>
        </article>

        <article className="stat-card">
          <span>MAX HEIGHT</span>
          <strong>{tallestVehicle.toFixed(2)} m</strong>
        </article>
      </section>

      <section className="route-control-panel">
        <div className="route-input-group">
          <label>Search fleet</label>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Vehicle ID, type, model, garage or status"
          />
        </div>
      </section>

      {showForm && (
        <section className="selected-incident-panel">
          <div className="selected-incident-header">
            <div>
              <span className="panel-kicker">FLEET PROFILE</span>
              <h3>
                {editingId ? `Edit ${editingId}` : "Add Vehicle"}
              </h3>
            </div>

            <button className="secondary-action" onClick={resetForm}>
              Cancel
            </button>
          </div>

          <form onSubmit={saveVehicle}>
            <div className="workflow-grid">
              <div className="route-input-group">
                <label>Vehicle ID</label>
                <input
                  name="id"
                  value={form.id}
                  onChange={updateForm}
                  placeholder="e.g. DD-101"
                />
              </div>

              <div className="route-input-group">
                <label>Vehicle type</label>
                <select
                  name="type"
                  value={form.type}
                  onChange={updateForm}
                >
                  <option>Standard Double Deck</option>
                  <option>Electric Double Deck</option>
                  <option>Single Deck</option>
                </select>
              </div>

              <div className="route-input-group">
                <label>Manufacturer</label>
                <input
                  name="manufacturer"
                  value={form.manufacturer}
                  onChange={updateForm}
                  placeholder="Manufacturer"
                />
              </div>

              <div className="route-input-group">
                <label>Model</label>
                <input
                  name="model"
                  value={form.model}
                  onChange={updateForm}
                  placeholder="Vehicle model"
                />
              </div>

              <div className="route-input-group">
                <label>Garage</label>
                <input
                  name="garage"
                  value={form.garage}
                  onChange={updateForm}
                  placeholder="Operating garage"
                />
              </div>

              <div className="route-input-group">
                <label>Status</label>
                <select
                  name="status"
                  value={form.status}
                  onChange={updateForm}
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="OUT_OF_SERVICE">Out of Service</option>
                </select>
              </div>

              <div className="route-input-group">
                <label>Height (m)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="height"
                  value={form.height}
                  onChange={updateForm}
                  placeholder="4.40"
                />
              </div>

              <div className="route-input-group">
                <label>Width (m)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="width"
                  value={form.width}
                  onChange={updateForm}
                  placeholder="2.55"
                />
              </div>

              <div className="route-input-group">
                <label>Length (m)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  name="length"
                  value={form.length}
                  onChange={updateForm}
                  placeholder="11.50"
                />
              </div>
            </div>

            <div className="incident-actions">
              <button className="primary-action" type="submit">
                {editingId ? "Save Changes" : "Add Vehicle"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="cards-grid">
        {filteredVehicles.map((vehicle) => (
          <article className="management-card" key={vehicle.id}>
            <div className="proposal-title">
              <div>
                <small>{vehicle.id}</small>
                <h3>{vehicle.type}</h3>
              </div>

              <span
                className={`status-pill ${
                  vehicle.status === "AVAILABLE"
                    ? "status-active"
                    : "status-ended"
                }`}
              >
                {vehicle.status.replaceAll("_", " ")}
              </span>
            </div>

            <p>
              {vehicle.manufacturer || "Manufacturer not set"} ·{" "}
              {vehicle.model || "Model not set"}
            </p>

            <small>{vehicle.garage || "Garage not assigned"}</small>

            <div className="workflow-grid">
              <div>
                <span>HEIGHT</span>
                <strong>{Number(vehicle.height).toFixed(2)} m</strong>
              </div>

              <div>
                <span>WIDTH</span>
                <strong>{Number(vehicle.width).toFixed(2)} m</strong>
              </div>

              <div>
                <span>LENGTH</span>
                <strong>{Number(vehicle.length).toFixed(2)} m</strong>
              </div>
            </div>

            <div className="incident-actions">
              <button
                className="secondary-action"
                onClick={() => editVehicle(vehicle)}
              >
                Edit
              </button>

              <button
                className="secondary-action"
                onClick={() => removeVehicle(vehicle)}
              >
                Remove
              </button>
            </div>
          </article>
        ))}

        {!filteredVehicles.length && (
          <div className="empty-large">
            No vehicle profiles match your search.
          </div>
        )}
      </section>

      <div className="risk-box">
        <strong>Diversion safety integration</strong>
        <p>
          Vehicle dimensions are prepared for use by BusControl when
          checking diversion suitability. Low bridges, width limits,
          weight restrictions and other verified road restrictions will
          be incorporated into the diversion safety assessment.
        </p>
      </div>
    </>
  );
}

export default Vehicles;