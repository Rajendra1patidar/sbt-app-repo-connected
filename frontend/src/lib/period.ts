import { fmtDate } from "./format";

/* ---- Period-range helpers (week/month/year navigation for the contractor filter) ---- */

export function startOfWeek(d: Date) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x; }

export function endOfWeek(d: Date) { const s = startOfWeek(d); const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23, 59, 59, 999); return e; }

export function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }

export function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }

export function startOfYear(d: Date) { return new Date(d.getFullYear(), 0, 1); }

export function endOfYear(d: Date) { return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999); }

export type PeriodPreset = "week" | "month" | "year" | "custom";

export function getPeriodRange(preset: PeriodPreset, anchor: Date, customFrom: string, customTo: string) {
  if (preset === "custom") {
    const from = customFrom ? new Date(`${customFrom}T00:00:00`) : null;
    const to = customTo ? new Date(`${customTo}T23:59:59`) : null;
    const label = from && to ? `${fmtDate(customFrom)} – ${fmtDate(customTo)}` : "Pick a date range";
    return { from, to, label };
  }
  if (preset === "week") {
    const from = startOfWeek(anchor), to = endOfWeek(anchor);
    return { from, to, label: `${from.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} – ${to.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` };
  }
  if (preset === "year") {
    const from = startOfYear(anchor), to = endOfYear(anchor);
    return { from, to, label: `${anchor.getFullYear()}` };
  }
  const from = startOfMonth(anchor), to = endOfMonth(anchor);
  return { from, to, label: anchor.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
}
