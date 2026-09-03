/* ---- Points helpers ----
 * Default rates when no ScoreRule overrides exist (unchanged from before):
 * 1 cement bag = 1 pt, 1kg saria = 0.1 pt (i.e. 10kg saria = 1 pt).
 *
 * A ScoreRule can override these:
 *  - category rule (rule.brand === "") sets the whole category's base rate
 *  - brand rule (rule.brand === "Ultratech" etc.) ADDS a bonus/penalty on
 *    top of the category's base rate, for that one brand only
 * Each rule is either permanent (no dates) or a dated scheme that only
 * applies while the estimate's date falls inside its window — a scheme
 * always wins over the permanent rate while it's active.
 *
 * Points are computed live against whatever rules exist right now — a rule
 * created today never retroactively changes points already computed for
 * past estimates outside its own window (there's nothing to "backfill";
 * each computation just looks at the estimate's own date).
 */

export const isCementItemName = (name: string) => /cement/i.test(name || "");

export const isSariaItemName = (name: string) => /saria/i.test(name || "");

export const sariaToPoints = (qty: number) => qty * 0.1;

const DEFAULT_CATEGORY_RATE: Record<string, number> = { Cement: 1, Saria: 0.1 };

const norm = (s: any) => String(s || "").trim().toLowerCase();

function activeRuleFor(rules: any[], category: string, brand: string, date: any) {
  const d = date ? new Date(date) : new Date();
  const relevant = (rules || []).filter((r: any) => norm(r.category) === norm(category) && norm(r.brand) === norm(brand));
  const scheme = relevant.find((r: any) => r.startDate && r.endDate && d >= new Date(r.startDate) && d <= new Date(r.endDate));
  if (scheme) return scheme;
  return relevant.find((r: any) => !r.startDate && !r.endDate) || null;
}

// The category's own base rate (falls back to the hardcoded default if no
// ScoreRule has been set for it).
export function categoryRate(category: string, date: any, scoreRules?: any[]) {
  const rule = activeRuleFor(scoreRules || [], category, "", date);
  if (rule) return Number(rule.pointsPerUnit) || 0;
  return DEFAULT_CATEGORY_RATE[category] ?? 0;
}

// The extra bonus/penalty for a specific brand within a category (0 if the
// item has no brand set, or no rule exists for that brand).
export function brandBonus(category: string, brand: string, date: any, scoreRules?: any[]) {
  if (!brand) return 0;
  const rule = activeRuleFor(scoreRules || [], category, brand, date);
  return rule ? Number(rule.pointsPerUnit) || 0 : 0;
}

// Points earned per unit for a line item: category base rate + brand bonus.
export function pointsPerUnit(category: string, brand: string, date: any, scoreRules?: any[]) {
  return categoryRate(category, date, scoreRules) + brandBonus(category, brand, date, scoreRules);
}

// Points for a single estimate only (cement + saria lines on that one doc).
// Any other item on the estimate (CPVC, UPVC, Kasta, etc.) is ignored.
// We check the item's category first (this is the authoritative field set
// via the Cement/Saria/CPVC/UPVC/Kasta/Others dropdown); if an item has no
// category for some reason, we fall back to matching on its name.
export function estimatePoints(doc: any, items: any[], scoreRules?: any[]) {
  let cementQty = 0;
  let sariaQty = 0;
  let cementPoints = 0;
  let sariaPoints = 0;
  (doc?.lines || []).forEach((ln: any) => {
    const it = items.find((i: any) => i.id === ln.itemId);
    const itemName = it?.name || ln.name || "";
    const category = it?.category || "";
    const brand = it?.brand || "";
    const qty = Number(ln.qty || 0);
    const isCement = category ? category === "Cement" : isCementItemName(itemName);
    const isSaria = category ? category === "Saria" : isSariaItemName(itemName);
    if (isCement) {
      cementQty += qty;
      cementPoints += qty * pointsPerUnit("Cement", brand, doc?.date, scoreRules);
    }
    if (isSaria) {
      sariaQty += qty;
      sariaPoints += qty * pointsPerUnit("Saria", brand, doc?.date, scoreRules);
    }
  });
  return { cementQty, sariaQty, cementPoints, sariaPoints, points: cementPoints + sariaPoints };
}
