/**
 * Money formatting for the new design language: whole rupees stay whole
 * ("₹1,950"), paise only appear when they exist ("₹62.5", "₹1,234.56"),
 * and big totals can be read at a glance ("₹1.2 L").
 */
const r2 = (n: number | string) => Math.round((Number(n) || 0) * 100) / 100;

export function inr(n: number | string, currency = "₹"): string {
  const v = r2(n);
  const neg = v < 0;
  const abs = Math.abs(v);
  const whole = Math.abs(abs - Math.round(abs)) < 0.005;
  const text = abs.toLocaleString("en-IN", whole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? "−" : ""}${currency}${text}`;
}

/** A per-unit rate reads trimmed: ₹390, ₹62.5, ₹62.75 — never ₹62.50. */
export function inrRate(n: number | string, currency = "₹"): string {
  const v = r2(n);
  const text = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${v < 0 ? "−" : ""}${currency}${text}`;
}

/** Whole + paise split for the hero number: ₹42,180 and .50 */
export function inrParts(n: number | string, currency = "₹"): { sign: string; whole: string; paise: string } {
  const v = r2(n);
  const abs = Math.abs(v);
  const whole = Math.floor(abs);
  const paise = Math.round((abs - whole) * 100);
  return {
    sign: v < 0 ? "−" : "",
    whole: `${currency}${whole.toLocaleString("en-IN")}`,
    paise: `.${String(paise).padStart(2, "0")}`,
  };
}

/** Indian compact form for sentences: ₹1.2 L, ₹3.4 Cr. Below a lakh it stays exact. */
export function inrCompact(n: number | string, currency = "₹"): string {
  const v = r2(n);
  const abs = Math.abs(v);
  const trim = (x: number) => String(Math.round(x * 10) / 10);
  if (abs >= 1e7) return `${v < 0 ? "−" : ""}${currency}${trim(abs / 1e7)} Cr`;
  if (abs >= 1e5) return `${v < 0 ? "−" : ""}${currency}${trim(abs / 1e5)} L`;
  return inr(v, currency);
}

/** A quantity without trailing zeros: 80, 62.5, 0.25 */
export function qtyText(n: number | string): string {
  const v = Math.round((Number(n) || 0) * 1000) / 1000;
  return v.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/** 28 Oct, or 28 Oct 2025 when it isn't this year. */
export function shortDate(d?: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Whole days from `from` to `to` (both local dates), negative when `to` is earlier. */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = new Date(typeof from === "string" ? (from.length === 10 ? `${from}T00:00:00` : from) : from);
  const b = new Date(typeof to === "string" ? (to.length === 10 ? `${to}T00:00:00` : to) : to);
  a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** "bag" → "bags", but "kg", "ft", "pc" stay as they are. Used for lines like "PPC cement, 5 bags". */
export function unitLabel(item: any, qty: number): string {
  const unit: string = item?.trackingMode === "weight" ? "kg" : (item?.unit || "pc");
  if (qty === 1) return unit;
  if (/^(kg|ft|mm|cm|m|g|l|pc|pcs|ton)$/i.test(unit)) return unit;
  if (/(x|s|ch|sh)$/i.test(unit)) return `${unit}es`;
  return `${unit}s`;
}
