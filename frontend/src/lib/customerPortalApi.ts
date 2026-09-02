/**
 * Thin client for the customer-facing Booking Portal (/booking-status).
 * Kept entirely separate from lib/api.ts: different token storage key (so a
 * customer and the shop owner can never share a session on the same device),
 * and it only ever talks to the public /api/customer-portal/* routes.
 */

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const TOKEN_KEY = "sbt_customer_portal_token";

function getToken(): string | null {
  return typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null;
}

function setToken(t: string | null) {
  if (typeof window === "undefined") return;
  if (t) window.localStorage.setItem(TOKEN_KEY, t);
  else window.localStorage.removeItem(TOKEN_KEY);
}

class PortalApiError extends Error {
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
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new PortalApiError("Can't reach the server. Check your connection and try again.", 0);
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new PortalApiError(body?.message || `Request failed (${res.status})`, res.status);
  }
  return body;
}

export const customerPortalApi = {
  getToken,
  setToken,
  isLoggedIn: () => !!getToken(),
  login: (phone: string, pin: string) => request("/api/customer-portal/login", { method: "POST", body: JSON.stringify({ phone, pin }) }),
  bookings: () => request("/api/customer-portal/bookings"),
};
