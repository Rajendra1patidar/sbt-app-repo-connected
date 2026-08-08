/* Quick-capture parsing: turns a free-typed line like
 *   "Sold 40 bags OPC cement to Patel Traders, 22500"
 * into a concrete action against real store data (items/customers/vendors).
 * Every actionable result is a *pending* action — the caller shows a preview
 * and only writes to the store once the user confirms. If more than one
 * candidate matches a name equally well, all of them are returned so the UI
 * can ask "which one?" instead of silently picking one. */

export interface MatchCandidate { entity: any; score: number }

export type CaptureAction =
  | { kind: "sale"; item: any; customer: any; qty: number; amount?: number; rate?: number; itemCandidates: MatchCandidate[]; customerCandidates: MatchCandidate[]; priceWarning?: string }
  | { kind: "sale_needs_review"; itemName: string; customerName: string; qty: number; amount?: number; rate?: number; item: any; customer: any }
  | { kind: "purchase"; item: any; vendor: any; qty: number; rate?: number; itemCandidates: MatchCandidate[]; vendorCandidates: MatchCandidate[]; priceWarning?: string }
  | { kind: "purchase_needs_review"; itemName: string; vendorName: string; qty: number; rate?: number; item: any; vendor: any }
  | { kind: "payment"; customer: any; amount: number; customerCandidates: MatchCandidate[] }
  | { kind: "payment_needs_review"; customerName: string; amount: number }
  | { kind: "expense"; category: string; amount: number; vendor?: string }
  | { kind: "new_estimate"; customer: any }
  | { kind: "add_customer"; name: string; location?: string; existing?: any }
  | { kind: "unknown"; text: string };

const numFromMoney = (s?: string) => (s ? Number(s.replace(/[₹,\s]/g, "")) : undefined);

/** Flags a wildly implausible per-unit rate against the item's known price,
 *  e.g. someone meant "300 each" but the parser read "300 total" for 2 bags
 *  and landed on ₹150/bag when cement never sells anywhere near that. Doesn't
 *  block anything — just a warning shown on the preview card so the person
 *  can catch a misread before confirming, not a hard validation rule (prices
 *  do legitimately vary, discounts happen, etc). */
function checkPriceSanity(rate: number | undefined, expected: number | undefined, unitLabel: string): string | undefined {
  if (!rate || !expected || expected <= 0) return undefined;
  if (rate < expected * 0.4) return `₹${rate.toLocaleString("en-IN")}/${unitLabel} looks low — usual price is ₹${expected.toLocaleString("en-IN")}/${unitLabel}. Check if the amount typed was a total, not a rate.`;
  if (rate > expected * 2.5) return `₹${rate.toLocaleString("en-IN")}/${unitLabel} looks high — usual price is ₹${expected.toLocaleString("en-IN")}/${unitLabel}.`;
  return undefined;
}

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
  // "Sold 2 bags cement to Patel Traders at 300" / "...at ₹300 each" — "at"/"@" before
  // the number means a per-unit RATE, not the total, unlike a bare trailing number.
  m = text.match(/^sold\s+([\d.]+)\s*(?:bags?|pcs?|units?|t|tons?|kg)?\s*(.+?)\s+to\s+(.+?)(?:\s*,?\s*(?:(at|@)\s*)?(?:₹|\brs\.?|\binr)?\s*([\d,]+(?:\.\d+)?)(?:\s*(?:each|\/\s*(?:unit|bag|pc)))?)?$/i);
  if (m) {
    const qty = Number(m[1]);
    const itemName = m[2].trim();
    const customerName = m[3].trim();
    const isRate = !!m[4];
    const num = numFromMoney(m[5]);
    const amount = isRate ? undefined : num;
    const rate = isRate ? num : undefined;
    const itemCandidates = bestMatches(itemName, ctx.items, (i) => i.name);
    const customerCandidates = bestMatches(customerName, ctx.customers, (c) => c.name);
    const item = itemCandidates[0]?.entity ?? null;
    const customer = customerCandidates[0]?.entity ?? null;
    if (item && customer) {
      const effectiveRate = rate ?? (amount ? amount / qty : (item.sellingPrice ?? item.price));
      const priceWarning = checkPriceSanity(effectiveRate, item.sellingPrice ?? item.price, "unit");
      return { kind: "sale", item, customer, qty, amount, rate, itemCandidates, customerCandidates, priceWarning };
    }
    return { kind: "sale_needs_review", itemName, customerName, qty, amount, rate, item, customer };
  }

  // "Received 2t 12mm saria from Agarwal Steel, rate 45" / "Received 2 12mm saria from Agarwal Steel"
  m = text.match(/^received\s+([\d.]+)\s*(?:bags?|pcs?|units?|t|tons?|kg)?\s*(.+?)\s+from\s+(.+?)(?:[,]?\s*rate\s*(?:₹|\brs\.?|\binr)?\s*([\d,]+(?:\.\d+)?))?$/i);
  if (m) {
    const qty = Number(m[1]);
    const itemName = m[2].trim();
    const vendorName = m[3].trim();
    const rate = numFromMoney(m[4]);
    const itemCandidates = bestMatches(itemName, ctx.items, (i) => i.name);
    const vendorCandidates = bestMatches(vendorName, ctx.vendors, (v) => v.name);
    const item = itemCandidates[0]?.entity ?? null;
    const vendor = vendorCandidates[0]?.entity ?? null;
    if (item && vendor) {
      const effectiveRate = rate ?? item.purchasePrice;
      const priceWarning = checkPriceSanity(effectiveRate, item.purchasePrice, "unit");
      return { kind: "purchase", item, vendor, qty, rate, itemCandidates, vendorCandidates, priceWarning };
    }
    return { kind: "purchase_needs_review", itemName, vendorName, qty, rate, item, vendor };
  }

  // "Logged payment of ₹5000 from Patel Traders"
  m = text.match(/^logged\s+payment\s+of\s+(?:₹|\brs\.?|\binr)?\s*([\d,]+(?:\.\d+)?)\s+from\s+(.+)$/i);
  if (m) {
    const amount = Number(numFromMoney(m[1]));
    const customerName = m[2].trim();
    const customerCandidates = bestMatches(customerName, ctx.customers, (c) => c.name);
    const customer = customerCandidates[0]?.entity ?? null;
    if (customer && amount > 0) return { kind: "payment", customer, amount, customerCandidates };
    return { kind: "payment_needs_review", customerName, amount };
  }

  // "Logged expense of ₹500 for diesel" / "Expense ₹500 for diesel" /
  // "Spent 500 on diesel from Shell" / "Paid ₹1200 for transport"
  m = text.match(/^(?:logged\s+expense(?:\s+of)?|expense(?:\s+of)?|spent|paid)\s+(?:₹|\brs\.?|\binr)?\s*([\d,]+(?:\.\d+)?)\s+(?:for|on)\s+(.+?)(?:\s+(?:from|at)\s+(.+))?$/i);
  if (m) {
    const amount = Number(numFromMoney(m[1]));
    const category = m[2].trim();
    const vendor = m[3]?.trim();
    if (amount > 0 && category) return { kind: "expense", category, amount, vendor };
  }

  // "New estimate for Patel Traders"
  m = text.match(/^new\s+estimate\s+for\s+(.+)$/i);
  if (m) {
    const customer = bestMatch(m[1].trim(), ctx.customers, (c) => c.name);
    return { kind: "new_estimate", customer };
  }

  // None of the strict phrasings above matched — try again without assuming
  // a fixed word order or exact connector words. See parseLoose() below.
  const loose = parseLoose(text, ctx);
  if (loose) return loose;

  return { kind: "unknown", text };
}

const WORD_STOPLIST = new Set([
  "to", "from", "of", "the", "a", "an", "for", "and", "at", "in", "on", "rate",
  "bags", "bag", "pcs", "pc", "piece", "pieces", "units", "unit", "nos", "no",
  "t", "ton", "tons", "tonne", "tonnes", "kg", "kgs", "rs", "inr",
]);
const wordsOf = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);

/** Words appearing anywhere in an entity's name — used to spot a mention of
 *  that entity in free text regardless of word order or exact phrasing. */
function findMentions(text: string, pool: any[], keyFn: (x: any) => string): { candidates: MatchCandidate[]; claimedWords: string[] } {
  const textWords = new Set(wordsOf(text));
  const lower = text.toLowerCase();
  const scored: (MatchCandidate & { matchedWords: string[] })[] = [];
  for (const entity of pool) {
    const label = keyFn(entity);
    if (!label) continue;
    const labelWords = wordsOf(label).filter((w) => w.length > 1 && !WORD_STOPLIST.has(w));
    if (!labelWords.length) continue;
    const matchedWords = labelWords.filter((w) => textWords.has(w));
    if (!matchedWords.length) continue;
    let score = matchedWords.length * 2 + matchedWords.length / labelWords.length;
    if (lower.includes(label.toLowerCase())) score += 4; // exact phrase, strong signal
    scored.push({ entity, score, matchedWords });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return { candidates: [], claimedWords: [] };
  const top = scored[0].score;
  const candidates = scored.filter((s) => s.score >= top - 1.5).slice(0, 4);
  return { candidates: candidates.map(({ entity, score }) => ({ entity, score })), claimedWords: scored[0].matchedWords };
}

/** Removes matched-entity words from text before the next findMentions() pass,
 *  so e.g. "cement" claimed by an item match can't also read as part of a
 *  customer name that happens to contain the word "cement". */
function stripWords(text: string, words: string[]): string {
  let out = text;
  for (const w of words) out = out.replace(new RegExp(`\\b${w}\\b`, "ig"), " ");
  return out;
}

function extractNumbers(text: string, claimedDigitWords: string[]): { qty?: number; amount?: number; rate?: number } {
  // \b before rs/inr matters: without it "rs" also matches inside ordinary
  // words like "Brothers" or "Traders" (both end in "...rs"), which would
  // misread the *next* number in the sentence as a currency amount.
  const moneyMatch = text.match(/(?:₹\s*|\brs\.?\s*|\binr\s*)([\d,]+(?:\.\d+)?)/i);
  const explicitAmount = moneyMatch ? numFromMoney(moneyMatch[1]) : undefined;
  const rateMatch = text.match(/\b(?:rate|at|@)\s*(?:₹|\brs\.?|\binr)?\s*([\d,]+(?:\.\d+)?)\s*(?:each|\/\s*(?:unit|bag|pc))?/i);
  const rate = rateMatch ? numFromMoney(rateMatch[1]) : undefined;

  const allNums = [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((mm) => mm[0]);
  // numbers baked into a matched item's own name (e.g. the "12" in "12mm Saria")
  // aren't a quantity or amount — drop them before picking qty/amount
  const itemNums = new Set(claimedDigitWords.filter((w) => /^\d+$/.test(w)));
  const claimed = new Set([explicitAmount, rate].filter((v) => v !== undefined).map(String));
  const candidateNums = allNums
    .filter((n) => !itemNums.has(n.replace(/,/g, "")))
    .filter((n) => !claimed.has(n.replace(/,/g, "")));

  let qty: number | undefined;
  let amount = explicitAmount;
  if (candidateNums.length >= 2) {
    // first number = quantity, last number = amount — matches both
    // "40 bags cement to Patel, 22500" and "Patel — 40 bags cement, 22500"
    qty = Number(candidateNums[0].replace(/,/g, ""));
    if (amount === undefined) amount = Number(candidateNums[candidateNums.length - 1].replace(/,/g, ""));
  } else if (candidateNums.length === 1) {
    qty = Number(candidateNums[0].replace(/,/g, ""));
  }
  return { qty, amount, rate };
}

const SALE_VERBS = /\b(sold|sell|billed|bill|gave|give|invoiced)\b/i;
const PURCHASE_VERBS = /\b(bought|buy|purchased|purchase)\b/i;
const PAYMENT_HINTS = /\b(payment|paid|collected|receipt)\b/i;
const RECEIVED_VERB = /\breceived\b/i;

/** Fallback for phrasing the strict patterns above don't cover — different
 *  word order, missing connector words, dashes instead of "to"/"from", or
 *  synonyms like "billed"/"gave" for a sale. Instead of trying to regex out
 *  "the item" and "the party" from arbitrary phrasing, this scans the raw
 *  text for known item/customer/vendor names directly (see findMentions),
 *  which is far more robust once real records exist to match against. */
function parseLoose(text: string, ctx: { items: any[]; customers: any[]; vendors: any[] }): CaptureAction | null {
  const isPayment = PAYMENT_HINTS.test(text);
  const isPurchase = !isPayment && (PURCHASE_VERBS.test(text) || (RECEIVED_VERB.test(text) && /\bfrom\b/i.test(text)));
  const isSale = !isPayment && !isPurchase && SALE_VERBS.test(text);

  if (isPayment) {
    const { candidates: customerCandidates } = findMentions(text, ctx.customers, (c) => c.name);
    const { amount } = extractNumbers(text, []);
    const customerName = customerCandidates[0]?.entity?.name ?? text;
    const customer = customerCandidates[0]?.entity ?? null;
    if (customer && amount && amount > 0) return { kind: "payment", customer, amount, customerCandidates };
    if (amount && amount > 0) return { kind: "payment_needs_review", customerName, amount };
    return null;
  }

  if (isPurchase) {
    const { candidates: itemCandidates, claimedWords: itemWords } = findMentions(text, ctx.items, (i) => i.name);
    const reduced = stripWords(text, itemWords);
    const { candidates: vendorCandidates } = findMentions(reduced, ctx.vendors, (v) => v.name);
    const { qty, rate, amount } = extractNumbers(text, itemWords);
    if (!qty) return null;
    const item = itemCandidates[0]?.entity ?? null;
    const vendor = vendorCandidates[0]?.entity ?? null;
    const itemName = item?.name ?? "that item";
    const vendorName = vendor?.name ?? "that vendor";
    const effectiveRate = rate ?? amount;
    if (item && vendor) {
      const priceWarning = checkPriceSanity(effectiveRate ?? item.purchasePrice, item.purchasePrice, "unit");
      return { kind: "purchase", item, vendor, qty, rate: effectiveRate, itemCandidates, vendorCandidates, priceWarning };
    }
    return { kind: "purchase_needs_review", itemName, vendorName, qty, rate: effectiveRate, item, vendor };
  }

  // Default to a sale whenever there's an explicit sale verb, OR — for the
  // dash-separated shorthand "Patel Traders — 40 bags cement, 22500" — when
  // there's no verb at all but a customer, item, and quantity all resolve.
  const { candidates: itemCandidates, claimedWords: itemWords } = findMentions(text, ctx.items, (i) => i.name);
  const reduced = stripWords(text, itemWords);
  const { candidates: customerCandidates } = findMentions(reduced, ctx.customers, (c) => c.name);
  const { qty, amount, rate } = extractNumbers(text, itemWords);
  if (!qty || (!isSale && !itemCandidates.length)) return null;
  const item = itemCandidates[0]?.entity ?? null;
  const customer = customerCandidates[0]?.entity ?? null;
  const itemName = item?.name ?? "that item";
  const customerName = customer?.name ?? "that customer";
  // an explicit "at"/"rate" number is a per-unit rate; a bare trailing number
  // (picked up as `amount` above) is the total — don't double count both.
  const effectiveAmount = rate ? undefined : amount;
  if (item && customer) {
    const effectiveRate = rate ?? (effectiveAmount ? effectiveAmount / qty : (item.sellingPrice ?? item.price));
    const priceWarning = checkPriceSanity(effectiveRate, item.sellingPrice ?? item.price, "unit");
    return { kind: "sale", item, customer, qty, amount: effectiveAmount, rate, itemCandidates, customerCandidates, priceWarning };
  }
  if (isSale) return { kind: "sale_needs_review", itemName, customerName, qty, amount: effectiveAmount, rate, item, customer };
  return null;
}