/**
 * Thin API client for the SBT backend.
 *
 * Set VITE_API_URL in the environment (Netlify build env var, or a local .env)
 * to point at the deployed backend, e.g. https://sbt-backend.onrender.com
 * Falls back to localhost for local dev.
 */

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const TOKEN_KEY = "sbt_token";

let token: string | null =
  typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;

function setToken(t: string | null) {
  token = t;
  if (typeof window === "undefined") return;
  if (t) window.localStorage.setItem(TOKEN_KEY, t);
  else window.localStorage.removeItem(TOKEN_KEY);
}

function getToken() {
  return token;
}

/** Mongo docs come back as _id — the whole frontend expects `id`. */
function normalize(value: any): any {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const { _id, __v, owner, ...rest } = value;
    const out: any = { ...rest };
    for (const key of Object.keys(out)) {
      if (out[key] && typeof out[key] === "object") out[key] = normalize(out[key]);
    }
    if (_id) out.id = _id;
    return out;
  }
  return value;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty body, e.g. some 204s */
  }

  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(body?.message || `Request failed (${res.status})`, res.status);
  }
  return normalize(body);
}

function crud(base: string) {
  return {
    list: () => request(base),
    create: (v: any) => request(base, { method: "POST", body: JSON.stringify(v) }),
    update: (id: string, v: any) => request(`${base}/${id}`, { method: "PUT", body: JSON.stringify(v) }),
    remove: (id: string) => request(`${base}/${id}`, { method: "DELETE" }),
  };
}

function documents(type: "estimate" | "challan") {
  const base = `/api/${type}s`;
  return {
    list: () => request(base),
    create: (v: any) => request(base, { method: "POST", body: JSON.stringify(v) }),
    update: (id: string, v: any) => request(`${base}/${id}`, { method: "PUT", body: JSON.stringify(v) }),
    updateStatus: (id: string, status: string) =>
      request(`${base}/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    addReturn: (id: string, lines: { itemId: string; qty: number }[], date?: string) =>
      request(`${base}/${id}/returns`, { method: "POST", body: JSON.stringify({ lines, date }) }),
    remove: (id: string) => request(`${base}/${id}`, { method: "DELETE" }),
  };
}

export const api = {
  setToken,
  getToken,

  auth: {
    register: (email: string, pin: string, name?: string) =>
      request("/api/auth/register", { method: "POST", body: JSON.stringify({ email, pin, name }) }),
    login: (email: string, pin: string) =>
      request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, pin }) }),
    me: () => request("/api/auth/me"),
    changePin: (currentPin: string, newPin: string) =>
      request("/api/auth/change-pin", { method: "POST", body: JSON.stringify({ currentPin, newPin }) }),
  },

  customers: crud("/api/customers"),
  items: { ...crud("/api/items"), lowStock: () => request("/api/items/meta/low-stock") },
  orders: { ...crud("/api/orders"), receive: (id: string) => request(`/api/orders/${id}/receive`, { method: "PATCH" }) },
  expenses: crud("/api/expenses"),
  payments: crud("/api/payments"),
  labourSessions: {
    list: (from?: string, to?: string) => request(`/api/labour-sessions${from && to ? `?from=${from}&to=${to}` : ""}`),
    create: (v: any) => request("/api/labour-sessions", { method: "POST", body: JSON.stringify(v) }),
    remove: (id: string) => request(`/api/labour-sessions/${id}`, { method: "DELETE" }),
    workers: () => request("/api/labour-sessions/meta/workers"),
  },

  settings: {
    get: () => request("/api/settings"),
    update: (v: any) => request("/api/settings", { method: "PUT", body: JSON.stringify(v) }),
  },

  documents,

  reports: {
    summary: () => request("/api/reports/summary"),
  },
};

export { ApiError };
