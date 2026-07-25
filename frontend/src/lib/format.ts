/* ---- helpers ---- */

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export const today = () => new Date().toISOString().slice(0, 10);

export const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// Round number to 2 decimal places to avoid floating-point precision issues
export function round2(n: number | string): number {
  const v = Number(n) || 0;
  return Math.round(v * 100) / 100;
}

export function fmtMoney(n: number | string, currency: string) {
  const v = round2(n);
  return `${currency}${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtNum(n: number | string) {
  const v = round2(n);
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
