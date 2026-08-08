/* Quick-capture parsing: turns a free-typed line like
 *   "Sold 40 bags OPC cement to Patel Traders, 22500"
 * into a concrete action against real store data (items/customers/vendors),
 * falling back to a prefilled modal when we can't resolve every field with confidence. */

export type CaptureAction =
  | { kind: "sale"; item: any; customer: any; qty: number; amount?: number }
  | { kind: "sale_needs_review"; itemName: string; customerName: string; qty: number; amount?: number; item: any; customer: any }
  | { kind: "purchase"; item: any; vendor: any; qty: number; rate?: number }
  | { kind: "purchase_needs_review"; itemName: string; vendorName: string; qty: number; rate?: number; item: any; vendor: any }
  | { kind: "payment"; customer: any; amount: number }
  | { kind: "payment_needs_review"; customerName: string; amount: number }
  | { kind: "new_estimate"; customer: any }
  | { kind: "add_customer"; name: string; location?: string; existing?: any }
  | { kind: "unknown"; text: string };

const numFromMoney = (s?: string) => (s ? Number(s.replace(/[₹,\s]/g, "")) : undefined);

function bestMatch(name: string, pool: any[], keyFn: (x: any) => string): any {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  let best: any = null;
  let bestScore = 0;
  for (const item of pool) {
    const label = keyFn(item).toLowerCase();
    if (!label) continue;
    let score = 0;
    if (label === q) score = 3;
    else if (label.startsWith(q) || q.startsWith(label)) score = 2;
    else if (label.includes(q) || q.includes(label)) score = 1;
    if (score > bestScore) { bestScore = score; best = item; }
  }
  return best;
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
    const item = bestMatch(itemName, ctx.items, (i) => i.name);
    const customer = bestMatch(customerName, ctx.customers, (c) => c.name);
    if (item && customer) return { kind: "sale", item, customer, qty, amount };
    return { kind: "sale_needs_review", itemName, customerName, qty, amount, item, customer };
  }

  // "Received 2t 12mm saria from Agarwal Steel, rate 45" / "Received 2 12mm saria from Agarwal Steel"
  m = text.match(/^received\s+([\d.]+)\s*(?:bags?|pcs?|units?|t|tons?|kg)?\s*(.+?)\s+from\s+(.+?)(?:[,]?\s*rate\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?))?$/i);
  if (m) {
    const qty = Number(m[1]);
    const itemName = m[2].trim();
    const vendorName = m[3].trim();
    const rate = numFromMoney(m[4]);
    const item = bestMatch(itemName, ctx.items, (i) => i.name);
    const vendor = bestMatch(vendorName, ctx.vendors, (v) => v.name);
    if (item && vendor) return { kind: "purchase", item, vendor, qty, rate };
    return { kind: "purchase_needs_review", itemName, vendorName, qty, rate, item, vendor };
  }

  // "Logged payment of ₹5000 from Patel Traders"
  m = text.match(/^logged\s+payment\s+of\s+(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s+from\s+(.+)$/i);
  if (m) {
    const amount = Number(numFromMoney(m[1]));
    const customerName = m[2].trim();
    const customer = bestMatch(customerName, ctx.customers, (c) => c.name);
    if (customer && amount > 0) return { kind: "payment", customer, amount };
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
