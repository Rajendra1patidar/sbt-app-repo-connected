import { daysBetween } from "./money";

/** Today as a local YYYY-MM-DD (not UTC), so "due today" means today where the shop is. */
export function localToday(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type EstimateKey = "paid" | "overdue" | "partial" | "due" | "void";
export type EstimateTone = "paid" | "overdue" | "partial" | "due" | "draft";

export interface EstimateState {
  key: EstimateKey;
  /** The word on the chip. */
  label: string;
  tone: EstimateTone;
  total: number;
  paid: number;
  balance: number;
  /** Whole days past the due date (0 when not late). */
  daysLate: number;
}

const num = (v: any) => Number(v) || 0;

/**
 * One place that decides what an estimate's chip says.
 *   Paid     — settled
 *   Overdue  — unpaid (or part paid) and past its due date
 *   Part paid / Due — everything else that still owes something
 */
export function estimateState(e: any, todayStr: string = localToday()): EstimateState {
  const total = num(e.total);
  const paid = num(e.amountPaid);
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  if (e.deleted) return { key: "void", label: "Deleted", tone: "draft", total, paid, balance, daysLate: 0 };
  if (e.status === "Paid" || (total > 0 && balance <= 0)) return { key: "paid", label: "Paid", tone: "paid", total, paid, balance: 0, daysLate: 0 };
  const due = String(e.dueDate || "").slice(0, 10);
  if (due && due < todayStr) {
    return { key: "overdue", label: "Overdue", tone: "overdue", total, paid, balance, daysLate: Math.max(1, daysBetween(due, todayStr)) };
  }
  if (paid > 0) return { key: "partial", label: "Part paid", tone: "partial", total, paid, balance, daysLate: 0 };
  return { key: "due", label: "Due", tone: "due", total, paid, balance, daysLate: 0 };
}

export type EstimateTab = "all" | "due" | "overdue" | "paid";

export function matchesTab(state: EstimateState, tab: EstimateTab): boolean {
  if (tab === "all") return true;
  if (state.key === "void") return false;
  if (tab === "paid") return state.key === "paid";
  if (tab === "overdue") return state.key === "overdue";
  return state.key === "due" || state.key === "partial"; // still open, not late yet
}

export function openBalance(estimates: any[], todayStr = localToday()) {
  let receivable = 0, overdue = 0, overdueCount = 0;
  for (const e of estimates) {
    const s = estimateState(e, todayStr);
    if (s.key === "void" || s.key === "paid") continue;
    receivable += s.balance;
    if (s.key === "overdue") { overdue += s.balance; overdueCount += 1; }
  }
  return { receivable: Math.round(receivable * 100) / 100, overdue: Math.round(overdue * 100) / 100, overdueCount };
}

/* ---------------------------------------------------------------- grouping */

export interface DocGroup { key: string; label: string; docs: any[]; total: number; collapsible: boolean }

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return x;
}

/** "This week", then one group per month, newest first. Months are collapsible. */
export function groupByRecency(docs: any[], now: Date = new Date()): DocGroup[] {
  const weekStart = localToday(mondayOf(now));
  const thisMonth = localToday(now).slice(0, 7);
  const groups: DocGroup[] = [];
  const byKey = new Map<string, DocGroup>();
  const sum = (list: any[]) => list.reduce((s, d) => s + (d.deleted ? 0 : num(d.total)), 0);

  const push = (key: string, label: string, collapsible: boolean, doc: any) => {
    let g = byKey.get(key);
    if (!g) { g = { key, label, docs: [], total: 0, collapsible }; byKey.set(key, g); groups.push(g); }
    g.docs.push(doc);
  };

  for (const d of docs) {
    const date = String(d.date || "").slice(0, 10);
    if (!date) { push("nodate", "No date", true, d); continue; }
    if (date >= weekStart) { push("week", "This week", false, d); continue; }
    const ym = date.slice(0, 7);
    const monthDate = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);
    const label = ym === thisMonth
      ? "Earlier this month"
      : monthDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    push(ym, label, true, d);
  }
  groups.forEach((g) => { g.total = Math.round(sum(g.docs) * 100) / 100; });
  return groups;
}

export function sortNewest(docs: any[]): any[] {
  return [...docs].sort((a, b) => {
    const da = String(a.date || ""), db = String(b.date || "");
    if (da !== db) return da < db ? 1 : -1;
    return String(b.number || "").localeCompare(String(a.number || ""), undefined, { numeric: true });
  });
}

/* ---------------------------------------------------------------- insight */

/**
 * "Paid 3 of the last 4 estimates after the due date." — how this customer has
 * actually behaved on their recent paid bills, using the payment dates we hold.
 */
export function paymentHabit(doc: any, estimates: any[], payments: any[]): { late: number; of: number } | null {
  if (!doc.customerId) return null;
  const recentPaid = sortNewest(estimates.filter((e) => !e.deleted && e.id !== doc.id && e.customerId === doc.customerId && e.status === "Paid" && e.dueDate)).slice(0, 4);
  if (recentPaid.length < 2) return null;
  let late = 0;
  for (const e of recentPaid) {
    const paidDates = payments.filter((p) => p.invoiceId === e.id && num(p.amount) > 0).map((p) => String(p.date || "").slice(0, 10)).filter(Boolean).sort();
    const settledOn = paidDates[paidDates.length - 1];
    if (settledOn && settledOn > String(e.dueDate).slice(0, 10)) late += 1;
  }
  return { late, of: recentPaid.length };
}
