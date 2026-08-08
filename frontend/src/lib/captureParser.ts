/* Quick-capture parsing: turns a free-typed line like
 *   "Sold 40 bags OPC cement to Patel Traders, 22500"
 * into a concrete action against real store data (items/customers/vendors).
 * Every actionable result is a *pending* action — the caller shows a preview
 * and only writes to the store once the user confirms. If more than one
 * candidate matches a name equally well, all of them are returned so the UI
 * can ask "which one?" instead of silently picking one. */

export interface MatchCandidate { entity: any; score: number }

export type CaptureAction =
  | { kind: "sale"; item: any; customer: any; qty: number; amount?: number; itemCandidates: MatchCandidate[]; customerCandidates: MatchCandidate[] }
  | { kind: "sale_needs_review"; itemName: string; customerName: string; qty: number; amount?: number; item: any; customer: any }
  | { kind: "purchase"; item: any; vendor: any; qty: number; rate?: number; itemCandidates: MatchCandidate[]; vendorCandidates: MatchCandidate[] }
  | { kind: "purchase_needs_review"; itemName: string; vendorName: string; qty: number; rate?: number; item: any; vendor: any }
  | { kind: "payment"; customer: any; amount: number; customerCandidates: MatchCandidate[] }
  | { kind: "payment_needs_review"; customerName: string; amount: number }
  | { kind: "new_estimate"; customer: any }
  | { kind: "add_customer"; name: string; location?: string; existing?: any }
  | { kind: "unknown"; text: string };

const numFromMoney = (s?: string) => (s ? Number(s.replace(/[₹,\s]/g, "")) : undefined);

/** All candidates whose score is within 1 point of the best score, sorted best-first.
 *  A single exact-name match (score 3) is never treated as ambiguous, even if
 *  something else partially matches too — an exact match should just win. */
function bestMatches(name: string, pool: any[], keyFn: (x: any) => string): MatchCandidate[] {
  const q = name.trim().toLowerCase();
  if (!q) return [];
  const scored: MatchCandidate[] = [];
  for (const entity of pool) {
    const label = keyFn(entity).toLowerCase();
    if (!label) continue;
    let score = 0;
    if (label === q) score = 3;
    else if (label.startsWith(q) || q.startsWith(label)) score = 2;
    else if (label.includes(q) || q.includes(label)) score = 1;
    if (score > 0) scored.push({ entity, score });
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];
  if (scored[0].score === 3) return [scored[0]]; // exact match — unambiguous
  const top = scored[0].score;
  return scored.filter((s) => s.score >= top - 1).slice(0, 4);
}

function bestMatch(name: string, pool: any[], keyFn: (x: any) => string): any {
  return bestMatches(name, pool, keyFn)[0]?.entity ?? null;
}

export function parseCapture(raw: string, ctx: { items: any[]; customers: any[]; vendors: any[] }): CaptureAction {
  const text = raw.trim();
  if (!text) return { kind: "unknown", text };

  // "Add customer Ramesh Traders, Sarangpur Road" / "Add customer Ramesh Traders at Sarangpur Road" / "Add customer Ramesh Traders"
  let m = text.match(/^add\s+customer\s+(.+?)(?:\s*,\s*|\s+(?:at|in|near|from)\s+)(.+)$/i);
  if (m) {
    const name = m[1].trim();
    const location = m[2].trim();
    const existing = bestMatch(name, ctx.customers, (c) => c.name);
    return { kind: "add_customer", name, location, existing };
  }
  m = text.match(/^add\s+customer\s+(.+)$/i);
  if (m) {
    const name = m[1].trim();
    const existing = bestMatch(name, ctx.customers, (c) => c.name);
    return { kind: "add_customer", name, existing };
  }

  // "Sold 40 bags OPC cement to Patel Traders, 22500" / "Sold 40 OPC cement to Patel Traders"
  m = text.match(/^sold\s+([\d.]+)\s*(?:bags?|pcs?|units?|t|tons?|kg)?\s*(.+?)\s+to\s+(.+?)(?:[,]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?))?$/i);
  if (m) {
    const qty = Number(m[1]);
    const itemName = m[2].trim();
    const customerName = m[3].trim();
    const amount = numFromMoney(m[4]);
    const itemCandidates = bestMatches(itemName, ctx.items, (i) => i.name);
    const customerCandidates = bestMatches(customerName, ctx.customers, (c) => c.name);
    const item = itemCandidates[0]?.entity ?? null;
    const customer = customerCandidates[0]?.entity ?? null;
    if (item && customer) return { kind: "sale", item, customer, qty, amount, itemCandidates, customerCandidates };
    return { kind: "sale_needs_review", itemName, customerName, qty, amount, item, customer };
  }

  // "Received 2t 12mm saria from Agarwal Steel, rate 45" / "Received 2 12mm saria from Agarwal Steel"
  m = text.match(/^received\s+([\d.]+)\s*(?:bags?|pcs?|units?|t|tons?|kg)?\s*(.+?)\s+from\s+(.+?)(?:[,]?\s*rate\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?))?$/i);
  if (m) {
    const qty = Number(m[1]);
    const itemName = m[2].trim();
    const vendorName = m[3].trim();
    const rate = numFromMoney(m[4]);
    const itemCandidates = bestMatches(itemName, ctx.items, (i) => i.name);
    const vendorCandidates = bestMatches(vendorName, ctx.vendors, (v) => v.name);
    const item = itemCandidates[0]?.entity ?? null;
    const vendor = vendorCandidates[0]?.entity ?? null;
    if (item && vendor) return { kind: "purchase", item, vendor, qty, rate, itemCandidates, vendorCandidates };
    return { kind: "purchase_needs_review", itemName, vendorName, qty, rate, item, vendor };
  }

  // "Logged payment of ₹5000 from Patel Traders"
  m = text.match(/^logged\s+payment\s+of\s+(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s+from\s+(.+)$/i);
  if (m) {
    const amount = Number(numFromMoney(m[1]));
    const customerName = m[2].trim();
    const customerCandidates = bestMatches(customerName, ctx.customers, (c) => c.name);
    const customer = customerCandidates[0]?.entity ?? null;
    if (customer && amount > 0) return { kind: "payment", customer, amount, customerCandidates };
    return { kind: "payment_needs_review", customerName, amount };
  }

  // "New estimate for Patel Traders"
  m = text.match(/^new\s+estimate\s+for\s+(.+)$/i);
  if (m) {
    const customer = bestMatch(m[1].trim(), ctx.customers, (c) => c.name);
    return { kind: "new_estimate", customer };
  }

  return { kind: "unknown", text };
}
