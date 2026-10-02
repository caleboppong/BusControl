import supabase from "./supabase.js";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function request(path, options = {}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session?.access_token) {
    throw new Error("Your login session has expired.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message || "BusControl request failed."
    );
  }

  return data;
}

export function getUsers() {
  return request("/admin/users");
}

export function createUser(payload) {
  return request("/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUser(id, payload) {
  return request(
    `/admin/users/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export function deleteUser(id) {
  return request(
    `/admin/users/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    }
  );
}

export function sendPasswordRecovery(id) {
  return request(
    `/admin/users/${encodeURIComponent(id)}/password-recovery`,
    {
      method: "POST",
    }
  );
}