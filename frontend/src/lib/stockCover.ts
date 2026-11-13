/**
 * Days of cover: how long the stock on hand lasts at the current pace.
 *
 * Same idea as the server's reorder service (30-day window, at least three
 * sales before the pace is trusted), computed here from the estimates the app
 * already holds so every item can be placed on the cover map — not only the
 * ones that are due for reorder. Weight items (Saria) are measured in kg,
 * everything else in the item's own unit.
 */

export const COVER_WINDOW_DAYS = 30;
export const MIN_SALES_FOR_PACE = 3;
const BUFFER_DAYS = 30;
const DEFAULT_LEAD_TIME_DAYS = 7;

export type CoverTier = "ok" | "watch" | "soon" | "now";

/** Legend: 14+ days · 7 to 14 · 5 to 7 · Under 5. */
export function coverTier(days: number | null): CoverTier {
  if (days == null) return "ok";
  if (days < 5) return "now";
  if (days < 7) return "soon";
  if (days < 14) return "watch";
  return "ok";
}

export interface GodownHolding { id: string; name: string; qty: number }

export interface CoverRow {
  id: string;
  name: string;
  category: string;
  isWeight: boolean;
  /** Unit stock is measured in: kg for weight items, otherwise the item's unit. */
  unit: string;
  stock: number;
  /** Average daily sales in `unit`; null when there isn't enough history to trust a pace. */
  perDay: number | null;
  /** Days the stock lasts at that pace; null when the pace is unknown. */
  days: number | null;
  tier: CoverTier;
  /** Stock valued at purchase price — sizes the bubble. */
  value: number;
  holdings: GodownHolding[];
  /** Where it mostly sells from (falls back to the godown holding the most). */
  mainGodownId: string | null;
  vendorId?: string;
  vendorName?: string;
  /** Last price paid per unit (₹/kg for weight items). */
  lastRate?: number;
  /** Sales value per day at the current pace: what it costs you each day it's out. */
  dailyValue: number;
  /** How much to buy to be covered for another month after the vendor's lead time. */
  suggestQty: number;
  /** No trustworthy pace, and stock is at or under the item's low-stock level. */
  low: boolean;
  /** What the bubble says: "4d" when the pace is known, "Low" when it isn't but stock is short. */
  label: string;
}

const num = (v: any) => Number(v) || 0;
const round1 = (n: number) => Math.round(n * 10) / 10;

interface Inputs {
  items: any[];
  estimates: any[];
  purchases?: any[];
  vendors?: any[];
  godowns?: any[];
  /** Server pace suggestions, when present they win for items they cover. */
  reorderSuggestions?: any[];
  now?: Date;
}

export function computeCover({ items, estimates, purchases = [], vendors = [], godowns = [], reorderSuggestions = [], now = new Date() }: Inputs): CoverRow[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - COVER_WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Sales in the window: quantity sold, number of sales, and which godown they left from.
  const sold = new Map<string, { qty: number; count: number; byGodown: Map<string, number> }>();
  for (const e of estimates) {
    if (e.deleted || String(e.date || "").slice(0, 10) < cutoffStr) continue;
    for (const ln of e.lines || []) {
      const id = String(ln.itemId);
      const rec = sold.get(id) || { qty: 0, count: 0, byGodown: new Map() };
      rec.qty += num(ln.qty);
      rec.count += 1;
      if (ln.godownId) rec.byGodown.set(String(ln.godownId), (rec.byGodown.get(String(ln.godownId)) || 0) + num(ln.qty));
      sold.set(id, rec);
    }
    for (const r of e.returns || []) {
      const rec = sold.get(String(r.itemId));
      if (rec) rec.qty = Math.max(0, rec.qty - num(r.qty));
    }
  }

  const godownName = new Map<string, string>(godowns.map((g: any) => [String(g.id), g.name]));
  const vendorById = new Map<string, any>(vendors.map((v: any) => [String(v.id), v]));
  const serverPace = new Map<string, any>(reorderSuggestions.filter((s: any) => s.mode === "pace").map((s: any) => [String(s.itemId), s]));

  // Most recent purchase per item → last price and the vendor you actually bought from.
  const lastPurchase = new Map<string, any>();
  for (const p of purchases) {
    if (p.deleted) continue;
    const prev = lastPurchase.get(String(p.itemId));
    if (!prev || String(p.date || "") >= String(prev.date || "")) lastPurchase.set(String(p.itemId), p);
  }

  const rows: CoverRow[] = [];
  for (const it of items) {
    if (it.deleted) continue;
    const id = String(it.id);
    const isWeight = it.trackingMode === "weight";
    const stock = isWeight ? num(it.stockKg) : num(it.stock);
    const rec = sold.get(id);
    const trusted = !!rec && rec.count >= MIN_SALES_FOR_PACE && rec.qty > 0;
    let perDay: number | null = trusted ? rec!.qty / COVER_WINDOW_DAYS : null;
    let days: number | null = perDay && perDay > 0 ? stock / perDay : null;

    const server = serverPace.get(id);
    if (server && server.daysLeft != null && server.dailyRate) {
      // The server's pace is in pieces; keep its days-left and rescale the per-day to our unit.
      days = num(server.daysLeft);
      if (perDay == null || perDay <= 0) perDay = days > 0 ? stock / days : null;
    }

    const holdings: GodownHolding[] = (it.stockByGodown || [])
      .map((g: any) => ({ id: String(g.godownId), name: godownName.get(String(g.godownId)) || "Godown", qty: isWeight ? num(g.stockKg) : num(g.stock) }))
      .filter((g: GodownHolding) => g.qty > 0)
      .sort((a: GodownHolding, b: GodownHolding) => b.qty - a.qty);

    let mainGodownId: string | null = null;
    if (rec && rec.byGodown.size > 0) {
      mainGodownId = [...rec.byGodown.entries()].sort((a, b) => b[1] - a[1])[0][0];
    } else if (holdings.length > 0) {
      mainGodownId = holdings[0].id;
    }

    const last = lastPurchase.get(id);
    const vendorId = String(it.vendorId || last?.vendorId || "") || undefined;
    const vendor = vendorId ? vendorById.get(vendorId) : undefined;
    const lead = num(vendor?.leadTimeDays) || DEFAULT_LEAD_TIME_DAYS;
    const lastRate = num(last?.rate) || num(it.purchasePrice) || undefined;

    let suggestQty = 0;
    if (server && server.suggestedQty > 0) suggestQty = num(server.suggestedQty);
    else if (perDay && perDay > 0) suggestQty = Math.max(0, Math.ceil(perDay * (lead + BUFFER_DAYS) - stock));
    // Round big suggestions to something you'd actually say out loud: 200 kg, not 197.
    if (suggestQty >= 50) suggestQty = Math.ceil(suggestQty / 10) * 10;

    // Without enough sales to trust a pace, fall back to the item's own low-stock level.
    const lowLevel = it.lowStock != null && it.lowStock !== "" ? num(it.lowStock) : 5;
    const low = days == null && num(it.stock) <= lowLevel;
    const roundedDays = days != null ? Math.round(days) : null;

    rows.push({
      id, name: it.name, category: it.category || "Others", isWeight,
      unit: isWeight ? "kg" : (it.unit || "pc"),
      stock, perDay: perDay != null ? round1(perDay) : null,
      days: roundedDays,
      low, label: roundedDays != null ? `${roundedDays}d` : low ? "Low" : "",
      tier: low ? "now" : coverTier(days),
      value: Math.max(0, stock * num(it.purchasePrice)),
      holdings, mainGodownId,
      vendorId, vendorName: vendor?.name, lastRate, suggestQty,
      dailyValue: perDay ? Math.round(perDay * num(it.sellingPrice)) : 0,
    });
  }
  return rows;
}

/* ---- the groups shown on the cover map ---- */

export interface CoverGroup { label: string; rows: CoverRow[] }

const GROUP_OF: Record<string, string> = { Saria: "Saria", Cement: "Cement", CPVC: "CPVC and UPVC", UPVC: "CPVC and UPVC" };
const GROUP_ORDER = ["Saria", "Cement", "CPVC and UPVC"];

export function groupByCategory(rows: CoverRow[]): CoverGroup[] {
  const buckets = new Map<string, CoverRow[]>();
  for (const r of rows) {
    const label = GROUP_OF[r.category] || "__rest";
    buckets.set(label, [...(buckets.get(label) || []), r]);
  }
  const hasSanitary = rows.some((r) => r.category === "Sanitary");
  const out: CoverGroup[] = [];
  for (const label of GROUP_ORDER) {
    const list = buckets.get(label);
    if (list?.length) out.push({ label, rows: sortForMap(list) });
  }
  const rest = buckets.get("__rest");
  if (rest?.length) out.push({ label: hasSanitary ? "Sanitary and others" : "Others", rows: sortForMap(rest) });
  return out;
}

/** Biggest stock value first, so bubble sizes step down left to right. */
export function sortForMap(rows: CoverRow[]): CoverRow[] {
  return [...rows].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** Bubble diameter: 28 to 44 px by value of stock on hand (flagged bubbles never go below 30 so the label fits). */
export function bubbleSize(value: number, maxValue: number, flagged: boolean): number {
  const t = maxValue > 0 ? Math.sqrt(Math.max(0, value) / maxValue) : 0;
  const d = Math.round(28 + t * 16);
  return flagged ? Math.max(30, d) : d;
}

export const TIER_LABEL: Record<CoverTier, string> = { ok: "14+ days", watch: "7 to 14", soon: "5 to 7", now: "Under 5" };
