import { useEffect, useMemo, useState } from "react";
import {
  createUser,
  deleteUser,
  getUsers,
  sendPasswordRecovery,
  updateUser,
} from "../../services/adminApi.js";

const EMPTY_FORM = {
  fullName: "",
  email: "",
  password: "",
  role: "DRIVER",
  employeeNumber: "",
  operatorName: "",
  isActive: true,
};

function roleLabel(role) {
  if (role === "SUPER_ADMIN") return "Super Admin";
  if (role === "CONTROLLER") return "Controller";
  return "Driver";
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedId) || null,
    [users, selectedId]
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return users;

    return users.filter((user) =>
      [
        user.fullName,
        user.email,
        user.role,
        user.employeeNumber,
        user.operatorName,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        )
    );
  }, [users, search]);

  const stats = useMemo(
    () => ({
      total: users.length,
      admins: users.filter(
        (user) => user.role === "SUPER_ADMIN"
      ).length,
      controllers: users.filter(
        (user) => user.role === "CONTROLLER"
      ).length,
      drivers: users.filter(
        (user) => user.role === "DRIVER"
      ).length,
    }),
    [users]
  );

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const data = await getUsers();
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message || "Unable to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function startCreate() {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setError("");
    setNotice("");
  }

  function startEdit(user) {
    setSelectedId(user.id);

    setForm({
      fullName: user.fullName || "",
      email: user.email || "",
      password: "",
      role: user.role || "DRIVER",
      employeeNumber: user.employeeNumber || "",
      operatorName: user.operatorName || "",
      isActive: user.isActive !== false,
    });

    setError("");
    setNotice("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setNotice("");

      if (selectedUser) {
        await updateUser(selectedUser.id, {
          fullName: form.fullName,
          role: form.role,
          employeeNumber: form.employeeNumber,
          operatorName: form.operatorName,
          isActive: form.isActive,
        });

        setNotice("User updated successfully.");
      } else {
        await createUser({
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          role: form.role,
          employeeNumber: form.employeeNumber,
          operatorName: form.operatorName,
        });

        setNotice("User created successfully.");
      }

      setSelectedId(null);
      setForm(EMPTY_FORM);
      await loadUsers();
    } catch (err) {
      setError(err.message || "Unable to save user.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user) {
    const confirmed = window.confirm(
      `Delete ${user.fullName || user.email}? This removes the BusControl login account.`
    );

    if (!confirmed) return;

    try {
      setError("");
      setNotice("");

      await deleteUser(user.id);

      if (selectedId === user.id) {
        startCreate();
      }

      setNotice("User deleted successfully.");
      await loadUsers();
    } catch (err) {
      setError(err.message || "Unable to delete user.");
    }
  }

  async function handleRecovery(user) {
    try {
      setError("");
      setNotice("");

      await sendPasswordRecovery(user.id);

      setNotice(
        `Password recovery requested for ${user.email}.`
      );
    } catch (err) {
      setError(
        err.message ||
          "Unable to request password recovery."
      );
    }
  }

  return (
    <main className="standalone-page">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h2>Users & Roles</h2>
          <p>
            Create and manage authorised BusControl users,
            operational roles and account access.
          </p>
        </div>

        <button
          type="button"
          className="primary-action"
          onClick={startCreate}
        >
          + New User
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      )}

      {notice && (
        <div className="success-banner">
          {notice}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <span>TOTAL USERS</span>
          <strong>{stats.total}</strong>
          <small>Authorised accounts</small>
        </div>

        <div className="stat-card">
          <span>SUPER ADMINS</span>
          <strong>{stats.admins}</strong>
          <small>System administrators</small>
        </div>

        <div className="stat-card">
          <span>CONTROLLERS</span>
          <strong>{stats.controllers}</strong>
          <small>Operational control staff</small>
        </div>

        <div className="stat-card">
          <span>DRIVERS</span>
          <strong>{stats.drivers}</strong>
          <small>Driver dashboard users</small>
        </div>
      </div>

      <div className="admin-users-layout">
        <section className="management-card">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">
                USER DIRECTORY
              </span>
              <h3>BusControl Users</h3>
            </div>

            <span className="incident-count">
              {filteredUsers.length}
            </span>
          </div>

          <div className="search-panel">
            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search name, email, role or employee number"
            />
          </div>

          {loading ? (
            <div className="empty-large">
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="empty-large">
              No users found.
            </div>
          ) : (
            <div className="admin-user-list">
              {filteredUsers.map((user) => (
                <button
                  type="button"
                  key={user.id}
                  className={`admin-user-row ${
                    selectedId === user.id
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => startEdit(user)}
                >
                  <div className="avatar">
                    {(user.fullName ||
                      user.email ||
                      "?")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>

                  <div>
                    <strong>
                      {user.fullName || "Unnamed user"}
                    </strong>
                    <span>{user.email}</span>
                  </div>

                  <div>
                    <span
                      className={`status-pill ${
                        user.isActive
                          ? "status-active"
                          : "status-cancelled"
                      }`}
                    >
                      {user.isActive
                        ? "ACTIVE"
                        : "INACTIVE"}
                    </span>

                    <small>
                      {roleLabel(user.role)}
                    </small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="management-card">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">
                {selectedUser
                  ? "EDIT ACCOUNT"
                  : "CREATE ACCOUNT"}
              </span>

              <h3>
                {selectedUser
                  ? selectedUser.fullName
                  : "New BusControl User"}
              </h3>
            </div>
          </div>

          <form
            className="admin-user-form"
            onSubmit={handleSubmit}
          >
            <label>
              Full name
              <input
                type="text"
                value={form.fullName}
                onChange={(event) =>
                  updateForm(
                    "fullName",
                    event.target.value
                  )
                }
                required
              />
            </label>

            <label>
              Email address
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  updateForm(
                    "email",
                    event.target.value
                  )
                }
                disabled={Boolean(selectedUser)}
                required
              />
            </label>

            {!selectedUser && (
              <label>
                Temporary password
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    updateForm(
                      "password",
                      event.target.value
                    )
                  }
                  minLength={8}
                  required
                />
              </label>
            )}

            <label>
              Role
              <select
                value={form.role}
                onChange={(event) =>
                  updateForm(
                    "role",
                    event.target.value
                  )
                }
              >
                <option value="DRIVER">
                  Driver
                </option>
                <option value="CONTROLLER">
                  Controller
                </option>
                <option value="SUPER_ADMIN">
                  Super Admin
                </option>
              </select>
            </label>

            <label>
              Employee / driver number
              <input
                type="text"
                value={form.employeeNumber}
                onChange={(event) =>
                  updateForm(
                    "employeeNumber",
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Operator
              <input
                type="text"
                value={form.operatorName}
                onChange={(event) =>
                  updateForm(
                    "operatorName",
                    event.target.value
                  )
                }
                placeholder="e.g. Stagecoach"
              />
            </label>

            {selectedUser && (
              <label className="admin-active-toggle">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) =>
                    updateForm(
                      "isActive",
                      event.target.checked
                    )
                  }
                />
                Account active
              </label>
            )}

            <div className="incident-actions">
              <button
                type="submit"
                className="primary-action"
                disabled={saving}
              >
                {saving
                  ? "Saving..."
                  : selectedUser
                    ? "Save Changes"
                    : "Create User"}
              </button>

              {selectedUser && (
                <>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() =>
                      handleRecovery(selectedUser)
                    }
                  >
                    Password Recovery
                  </button>

                  <button
                    type="button"
                    className="danger-action"
                    onClick={() =>
                      handleDelete(selectedUser)
                    }
                  >
                    Delete User
                  </button>
                </>
              )}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}