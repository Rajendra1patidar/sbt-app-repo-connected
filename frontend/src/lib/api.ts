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

/**
 * Downloads a file from an authenticated endpoint and triggers a browser
 * "Save As" for it. Separate from `request()` because that helper always
 * parses the response as JSON — this streams back binary/text and hands
 * it to the browser as a Blob instead.
 */
async function downloadFile(path: string, fallbackFilename: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      message = body?.message || message;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401) setToken(null);
    throw new ApiError(message, res.status);
  }

  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackFilename;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
    create: (v: any, idempotencyKey?: string) =>
      request(base, { method: "POST", body: JSON.stringify(v), headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined }),
    update: (id: string, v: any) => request(`${base}/${id}`, { method: "PUT", body: JSON.stringify(v) }),
    updateStatus: (id: string, status: string) =>
      request(`${base}/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
    addReturn: (id: string, lines: { itemId: string; qty: number }[], date?: string) =>
      request(`${base}/${id}/returns`, { method: "POST", body: JSON.stringify({ lines, date }) }),
    addDelivery: (id: string, lines: { itemId: string; qty: number }[], date?: string) =>
      request(`${base}/${id}/deliveries`, { method: "POST", body: JSON.stringify({ lines, date }) }),
    remove: (id: string) => request(`${base}/${id}`, { method: "DELETE" }),
    restore: (id: string) => request(`${base}/${id}/restore`, { method: "POST" }),
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
    forgotPin: (email: string) =>
      request("/api/auth/forgot-pin", { method: "POST", body: JSON.stringify({ email }) }),
    resetPin: (email: string, token: string, newPin: string) =>
      request("/api/auth/reset-pin", { method: "POST", body: JSON.stringify({ email, token, newPin }) }),
  },

  customers: crud("/api/customers"),
  items: { ...crud("/api/items"), lowStock: () => request("/api/items/meta/low-stock") },
  orders: { ...crud("/api/orders"), recordPayment: (id: string, v: any) => request(`/api/orders/${id}/payments`, { method: "POST", body: JSON.stringify(v) }) },
  expenses: crud("/api/expenses"),
  payments: crud("/api/payments"),
  contractors: crud("/api/contractors"),

  capture: {
    // AI fallback for the quick-capture bar — only called when the local
    // regex parser can't confidently read what was typed. Backend resolves
    // item/customer/vendor ids itself (it has the DB), so this only ever
    // sends the raw typed line, nothing else.
    parse: (text: string) => request("/api/capture/parse", { method: "POST", body: JSON.stringify({ text }) }),
  },

  vendors: {
    ...crud("/api/vendors"),
    findDuplicate: (name: string, phone: string) =>
      request(`/api/vendors/meta/find-duplicate?name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`),
    statement: (id: string) => request(`/api/vendors/${id}/statement`),
    recordPayment: (id: string, v: any) => request(`/api/vendors/${id}/payments`, { method: "POST", body: JSON.stringify(v) }),
  },

  godowns: {
    ...crud("/api/godowns"),
    setDefault: (id: string) => request(`/api/godowns/${id}/set-default`, { method: "PUT" }),
    transfer: (v: any) => request(`/api/inventory/transfer`, { method: "POST", body: JSON.stringify(v) }),
  },

  purchases: { ...crud("/api/purchases"), recordPayment: (id: string, v: any) => request(`/api/purchases/${id}/payments`, { method: "POST", body: JSON.stringify(v) }) },

  ledger: {
    trialBalance: (from?: string, to?: string) =>
      request(`/api/ledger/trial-balance${from && to ? `?startDate=${from}&endDate=${to}` : ""}`),
    profitAndLoss: (from?: string, to?: string) =>
      request(`/api/ledger/profit-loss${from && to ? `?startDate=${from}&endDate=${to}` : ""}`),
    balanceSheet: (asOfDate?: string) => request(`/api/ledger/balance-sheet${asOfDate ? `?asOfDate=${asOfDate}` : ""}`),
    dayBook: (from?: string, to?: string) =>
      request(`/api/ledger/day-book${from && to ? `?startDate=${from}&endDate=${to}` : ""}`),
    accountBalance: (account: string, from?: string, to?: string) => {
      const params = new URLSearchParams({ account });
      if (from) params.set("startDate", from);
      if (to) params.set("endDate", to);
      return request(`/api/ledger/account-balance?${params.toString()}`);
    },
    stockValuation: () => request("/api/ledger/stock-valuation"),
    customerStatement: (id: string) => request(`/api/ledger/customers/${id}/statement`),
  },

  financialYears: {
    list: () => request("/api/financial-years"),
    create: (v: any) => request("/api/financial-years", { method: "POST", body: JSON.stringify(v) }),
    close: (id: string) => request(`/api/financial-years/${id}/close`, { method: "POST" }),
  },

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

  stockAdjustments: {
    list: (itemId?: string) => request(`/api/stock-adjustments${itemId ? `?itemId=${itemId}` : ""}`),
    create: (v: { itemId: string; newStock: number; reason?: string; date?: string }) =>
      request("/api/stock-adjustments", { method: "POST", body: JSON.stringify(v) }),
    bulk: (v: { lines: { itemId: string; newStock: number; reason?: string }[]; reason?: string; date?: string }) =>
      request("/api/stock-adjustments/bulk", { method: "POST", body: JSON.stringify(v) }),
  },

  dataExport: {
    toJson: () => downloadFile("/api/export/json", "sbt-export.json"),
    toExcel: () => downloadFile("/api/export/excel", "sbt-export.xlsx"),
  },

  documents,

  reports: {
    summary: () => request("/api/reports/summary"),
    reorderSuggestions: () => request("/api/reports/reorder-suggestions"),
    deadStock: () => request("/api/reports/dead-stock"),
    arAging: (asOfDate?: string) => request(`/api/reports/ar-aging${asOfDate ? `?asOfDate=${asOfDate}` : ""}`),
    customerCredit: () => request("/api/reports/customer-credit"),
    vendorScorecard: () => request("/api/reports/vendor-scorecard"),
    cashFlowForecast: () => request("/api/reports/cash-flow-forecast"),
  },

  notifications: {
    list: () => request("/api/notifications"),
    unreadCount: () => request("/api/notifications/unread-count"),
    markRead: (id: string) => request(`/api/notifications/${id}/read`, { method: "PATCH" }),
    markAllRead: () => request("/api/notifications/mark-all-read", { method: "PATCH" }),
    remove: (id: string) => request(`/api/notifications/${id}`, { method: "DELETE" }),
    clearAll: () => request("/api/notifications", { method: "DELETE" }),
  },

  approvals: {
    list: (status?: string) => request(`/api/approvals${status ? `?status=${status}` : ""}`),
    approve: (id: string, note?: string) => request(`/api/approvals/${id}/approve`, { method: "POST", body: JSON.stringify({ note }) }),
    reject: (id: string, note?: string) => request(`/api/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) }),
  },

  staff: {
    list: () => request("/api/auth/staff"),
    create: (v: { email: string; pin: string; name?: string }) => request("/api/auth/staff", { method: "POST", body: JSON.stringify(v) }),
    remove: (id: string) => request(`/api/auth/staff/${id}`, { method: "DELETE" }),
  },

  bankStatement: {
    import: (rows: { date: string; description: string; amount: number }[]) =>
      request("/api/bank-statement/import", { method: "POST", body: JSON.stringify({ rows }) }),
    list: (matched?: boolean) => request(`/api/bank-statement${matched !== undefined ? `?matched=${matched}` : ""}`),
    candidates: (date: string, amount: number) => request(`/api/bank-statement/candidates?date=${date}&amount=${amount}`),
    match: (id: string, ledgerEntryId: string) => request(`/api/bank-statement/${id}/match`, { method: "POST", body: JSON.stringify({ ledgerEntryId }) }),
    unmatch: (id: string) => request(`/api/bank-statement/${id}/unmatch`, { method: "POST" }),
  },
};

export { ApiError };