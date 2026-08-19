/**
 * Parses a pasted stock-take list (one item per line, e.g.
 * "3. Duraguard ppc - 245" or "Barkas 3x6.5 - 23 pc") into { rawName, qty }
 * pairs, then fuzzy-matches each name against the existing item list so the
 * Stock Take screen can show a reviewable diff before anything is saved.
 */

export interface StockTakeLine {
  raw: string;
  rawName: string;
  qty: number | null;
}

export interface StockTakeMatch extends StockTakeLine {
  item: any | null; // best-guess match, or null if nothing scored
  candidates: any[]; // up to 5 alternates, for a manual picker
}

/** Strips leading numbering ("3.", "12)") and trailing punctuation noise. */
function stripNumbering(line: string): string {
  return line.trim().replace(/^\d+[.)]\s*/, "");
}

/** First plain number in a string — handles "245", "13.5", "1,000". Ignores
 *  numbers embedded in dimension-like tokens (e.g. "3x6.5", "1×2.5") by
 *  requiring the match not be immediately preceded/followed by x or ×. */
function firstStandaloneNumber(s: string): number | null {
  const re = /(?:^|[^0-9a-zA-Z×x])(\d[\d,]*\.?\d*)(?!\s*[×x]\s*\d)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const numStr = m[1];
    // Skip a number that's actually the start of a dims block like "3×6.5"
    const after = s.slice(m.index + m[0].length, m.index + m[0].length + 3);
    if (/^\s*[×x]/i.test(after)) continue;
    const val = parseFloat(numStr.replace(/,/g, ""));
    if (!Number.isNaN(val)) return val;
  }
  return null;
}

/** Used when a line has no " - " to split on (name and qty run together,
 *  e.g. "90mm Kasta agri 20ft 13.5 pc"). Numbers glued directly to a unit
 *  suffix with no space ("90mm", "20ft") are almost always spec/size, not
 *  the counted quantity — so those are deprioritized in favor of a
 *  free-standing number, and among free-standing numbers the LAST one is
 *  preferred since that's where the actual count tends to sit. */
function bestFreeStandingNumber(s: string): number | null {
  const re = /(\d[\d,]*\.?\d*)/g;
  let m: RegExpExecArray | null;
  const free: number[] = [];
  const glued: number[] = [];
  while ((m = re.exec(s))) {
    const numStr = m[1];
    const val = parseFloat(numStr.replace(/,/g, ""));
    if (Number.isNaN(val)) continue;
    const endIdx = m.index + m[0].length;
    const nextChar = s[endIdx] || "";
    const isGlued = /[a-zA-Z]/.test(nextChar) && !/^\s/.test(nextChar);
    (isGlued ? glued : free).push(val);
  }
  if (free.length) return free[free.length - 1];
  if (glued.length) return glued[glued.length - 1];
  return null;
}

export function parseStockTakeText(text: string): StockTakeLine[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: StockTakeLine[] = [];
  for (const raw of lines) {
    const cleaned = stripNumbering(raw);
    if (!cleaned) continue;

    // Split on the first " - " (or en-dash) that separates name from the
    // quantity/breakdown part. Falls back to no split if there isn't one.
    const dashSplit = cleaned.split(/\s+[-–]\s+/);
    let namePart = cleaned;
    let restPart = "";
    if (dashSplit.length >= 2) {
      namePart = dashSplit[0];
      restPart = dashSplit.slice(1).join(" - ");
    }

    // Quantity: prefer the number in the part after the dash (that's where
    // Step's lists put the counted total); fall back to scanning the whole
    // line if there was no dash to split on.
    const qty = restPart ? firstStandaloneNumber(restPart) : bestFreeStandingNumber(cleaned);

    out.push({ raw, rawName: namePart.trim(), qty });
  }
  return out;
}

const STOPWORDS = new Set(["pc", "pcs", "kg", "bundle", "bundles", "feet", "ft", "mm", "no", "liter", "litre", "the", "and"]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[×x](?=\d)/g, " ") // "3x6.5" -> keep dims as separate-ish tokens but don't let x glue to numbers
    .replace(/[^a-z0-9.]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

/** Token-overlap score between a parsed line's name and one item's name — same
 *  spirit as the capture bar's matcher, just standalone so this screen has no
 *  dependency on the capture flow. Higher is better; 0 means no overlap. */
function scoreMatch(queryTokens: string[], itemTokens: string[]): number {
  if (!queryTokens.length || !itemTokens.length) return 0;
  let shared = 0;
  const itemSet = new Set(itemTokens);
  for (const t of queryTokens) {
    if (itemSet.has(t)) shared += 1;
    else if (itemTokens.some((it) => it.startsWith(t) || t.startsWith(it))) shared += 0.5;
  }
  // Reward matching a larger fraction of both sides, so "Wonder PPC" beats a
  // long item name that merely contains "wonder" once among many words.
  return shared / Math.max(queryTokens.length, itemTokens.length);
}

export function matchStockTakeLines(lines: StockTakeLine[], items: any[]): StockTakeMatch[] {
  const activeItems = items.filter((it) => !it.deleted);
  const withTokens = activeItems.map((it) => ({ item: it, tokens: tokenize(it.name || "") }));

  return lines.map((line) => {
    const qTokens = tokenize(line.rawName);
    const scored = withTokens
      .map(({ item, tokens }) => ({ item, score: scoreMatch(qTokens, tokens) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const candidates = scored.slice(0, 5).map((s) => s.item);
    return { ...line, item: best && best.score >= 0.4 ? best.item : null, candidates };
  });
}
