import { NAV, OWNER_ONLY_NAV_IDS, TABS } from "./constants";

/**
 * "The capture bar finds the rest by name": typing the name of any screen
 * ("ledger", "bank rec", "cash flow") offers to open it. Nothing is removed
 * from the app by grouping 28 destinations into five tabs.
 */
const ALIASES: Record<string, string[]> = {
  customers: ["customer", "party", "parties"],
  items: ["item", "product", "products", "price list"],
  godowns: ["godown", "warehouse"],
  orders: ["order"],
  vendors: ["vendor", "supplier", "suppliers"],
  purchases: ["purchase", "bought"],
  approvals: ["approval", "approve", "requests"],
  estimates: ["estimate", "bill", "bills", "invoice", "invoices"],
  challans: ["challan", "delivery"],
  payments: ["payment", "received", "receipts"],
  expenses: ["expense", "spend", "spending"],
  todo: ["inventory", "stock take", "stocktake", "count"],
  stockAdjustments: ["adjustment", "adjustments"],
  labour: ["labour", "labor", "workers", "loading"],
  contractors: ["contractor", "contractors"],
  vendorScorecard: ["vendor score", "vendor scorecard"],
  customerCredit: ["credit", "outstanding", "dues"],
  cashFlowForecast: ["cash flow", "cashflow", "forecast"],
  reports: ["report", "profit", "analytics"],
  ledger: ["ledger", "accounts", "books"],
  bankReconciliation: ["bank", "reconcile", "reconciliation", "statement"],
  financialYears: ["financial year", "fy", "year end"],
  sharereport: ["share report", "daily report"],
  billing: ["advanced billing", "billing", "reminders"],
  settings: ["settings", "setting", "staff", "pin", "preferences"],
  auditLog: ["audit", "log", "history"],
  portalAdmin: ["portal", "customer portal"],
  stock: ["stock", "cover"],
  sell: ["sell", "sales"],
  money: ["money", "finance"],
  team: ["team"],
  dashboard: ["home", "today"],
};

export interface Destination { id: string; label: string; tab: string }

export function findDestination(text: string, role: string = "owner"): Destination | null {
  const q = text.trim().toLowerCase().replace(/^(open|go to|show|goto)\s+/, "");
  if (q.length < 3) return null;
  const allowed = (id: string) => role !== "staff" || !OWNER_ONLY_NAV_IDS.has(id);
  const tabOf = (id: string) => TABS.find((t) => t.view === id || t.members.includes(id))?.label || "";

  const candidates: { id: string; label: string; score: number }[] = [];
  const consider = (id: string, label: string) => {
    if (!allowed(id)) return;
    const l = label.toLowerCase();
    const aliases = ALIASES[id] || [];
    let score = 0;
    if (l === q) score = 100;
    else if (l.startsWith(q)) score = 80;
    else if (aliases.some((a) => a === q)) score = 90;
    else if (aliases.some((a) => a.startsWith(q))) score = 70;
    else if (l.includes(q) && q.length >= 4) score = 50;
    else if (q.length >= 5 && aliases.some((a) => q.includes(a) && a.length >= 5)) score = 40;
    if (score > 0) candidates.push({ id, label, score });
  };
  for (const n of NAV) if (n.id !== "dashboard") consider(n.id, n.label);
  for (const t of TABS) if (t.id !== "home") consider(t.view, t.label);

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) return null;
  return { id: best.id, label: best.label, tab: tabOf(best.id) };
}
