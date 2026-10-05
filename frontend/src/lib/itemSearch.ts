// Smart item search, used by the estimate item picker and every item/customer
// dropdown (SearchableSelect).
//
// What it understands:
// - words in ANY order, from any part of the name ("1 inch reducing cpvc")
// - typing mistakes and near spellings ("reducer" -> reducing, "couplar" -> coupler)
// - short forms with letters in order ("cmnt" -> cement, "cplr" -> coupler)
// - sizes as numbers: 1.25 = 1 1/4 = 1¼ ; "1x1.25" matches "1.25x1" ; 1" = 1 in = 1 inch
// - name, category, brand and code are all searched
// - if no item has every word, the closest items are shown instead of nothing
// - results are ranked: all words first, words side by side next, usual items boosted

export interface SearchableItem {
  id: string;
  name: string;
  category?: string;
  brand?: string;
  sku?: string;
  code?: string;
}

const FRACS: Record<string, string> = { "¼": "0.25", "½": "0.5", "¾": "0.75", "⅛": "0.125", "⅜": "0.375", "⅝": "0.625", "⅞": "0.875", "⅓": "0.333", "⅔": "0.667" };
const FRAC_CHARS = "¼½¾⅛⅜⅝⅞⅓⅔";

// different spellings of the same word are treated as one word
const CANON: Record<string, string> = {
  inches: "inch", inchs: "inch", ins: "inch",
  feet: "ft", foot: "ft",
  metre: "mtr", metres: "mtr", meter: "mtr", meters: "mtr", mtrs: "mtr",
  pcs: "pc", piece: "pc", pieces: "pc",
  millimeter: "mm", millimeters: "mm", millimetre: "mm", millimetres: "mm",
  kgs: "kg",
};

const fmtNum = (n: number) => String(parseFloat(n.toFixed(3)));
const isNum = (t: string) => t.charCodeAt(0) >= 48 && t.charCodeAt(0) <= 57;

// turns fractions into decimals and inch marks into the word "inch"
function normalizeText(raw: string): string {
  let s = (raw || "").toLowerCase();
  s = s.replace(new RegExp(`(\\d+)\\s*([${FRAC_CHARS}])`, "g"), (_m, a, f) => fmtNum(Number(a) + Number(FRACS[f])));
  s = s.replace(new RegExp(`[${FRAC_CHARS}]`, "g"), (f) => FRACS[f]);
  s = s.replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, (m, a, b, c) => (Number(c) ? fmtNum(Number(a) + Number(b) / Number(c)) : m));
  s = s.replace(/(\d+)\s*\/\s*(\d+)/g, (m, b, c) => (Number(c) ? fmtNum(Number(b) / Number(c)) : m));
  s = s.replace(/(\d)\s*(?:"|″|”|'')/g, "$1 inch ");
  s = s.replace(/(\d(?:\.\d+)?)\s*in(?![a-z])/g, "$1 inch ");
  return s;
}

// words and numbers; "10mm" -> 10, mm ; "1.25x1" -> 1.25, 1 ("x" between sizes is dropped)
function tokenize(s: string): string[] {
  const out: string[] = [];
  const re = /\d+(?:\.\d+)?|[a-z]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[0] === "x") continue;
    out.push(CANON[m[0]] || m[0]);
  }
  return out;
}

function stem(w: string) {
  for (const suf of ["ing", "ers", "er", "ors", "or", "ion", "ed", "es", "s", "ar"]) {
    if (w.length > suf.length + 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}

// true when every letter of `t` appears in `w` in the same order
function inOrder(t: string, w: string) {
  let k = 0;
  for (const ch of w) {
    if (ch === t[k]) k++;
    if (k === t.length) return true;
  }
  return false;
}

// spelling mistake check: at most `max` edits (a swap of two letters counts as one)
function within(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return false;
  const m = a.length, n = b.length;
  let prev2: number[] | null = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && prev2 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[n] <= max;
}

// how well query word `q` matches item word `w`: 0 = best, -1 = no match
function wordScore(q: string, w: string): number {
  const qn = isNum(q), wn = isNum(w);
  if (qn || wn) {
    if (!(qn && wn)) return -1;
    if (Number(q) === Number(w)) return 0;
    if (w.startsWith(q) && q.length < w.length) return 3; // "1.2" while still typing 1.25
    return -1;
  }
  if (q === w) return 0;
  if (w.startsWith(q)) return 1;
  const sq = stem(q), sw = stem(w);
  if (Math.min(sq.length, sw.length) >= 4 && (sq.startsWith(sw) || sw.startsWith(sq))) return 1.5;
  if (q.length >= 3 && w.includes(q)) return 2;
  if (q.length >= 4 && within(q, w, q.length >= 8 ? 2 : 1)) return 3;
  if (q.length >= 3 && q[0] === w[0] && inOrder(q, w)) return 4;
  return -1;
}

const cache = new WeakMap<object, { name: string[]; extra: string[] }>();
function indexOf(it: SearchableItem) {
  let c = cache.get(it);
  if (!c) {
    c = {
      name: tokenize(normalizeText(it.name)),
      extra: tokenize(normalizeText([it.category, it.brand, it.sku, it.code].filter(Boolean).join(" "))),
    };
    cache.set(it, c);
  }
  return c;
}

export function searchTokens(query: string): string[] {
  return tokenize(normalizeText(query));
}

export interface SearchOptions<T> {
  limit?: number;
  boost?: (item: T) => number; // 0..1, e.g. 1 for items this customer buys often
}

export function searchItemsRanked<T extends SearchableItem>(items: T[], query: string, opts: SearchOptions<T> = {}): { items: T[]; partial: boolean } {
  const qt = searchTokens(query);
  const n = qt.length;
  if (n === 0) return { items: [], partial: false };
  const limit = opts.limit ?? 40;

  const full: { it: T; key: number }[] = [];
  const near: { it: T; matched: number; total: number }[] = [];
  const needed = n >= 2 ? n - 1 : 1; // for "closest matches": at most one word may be missing

  for (const it of items) {
    const { name, extra } = indexOf(it);
    let matched = 0, total = 0;
    const positions: number[] = [];
    for (const q of qt) {
      let best = -1, bestPos = -1;
      for (let p = 0; p < name.length; p++) {
        const s = wordScore(q, name[p]);
        if (s >= 0 && (best < 0 || s < best)) { best = s; bestPos = p; }
      }
      if (best < 0) {
        for (const w of extra) {
          const s = wordScore(q, w);
          if (s >= 0 && (best < 0 || s + 3 < best)) { best = s + 3; bestPos = -1; }
        }
      }
      if (best >= 0) { matched++; total += best; if (bestPos >= 0) positions.push(bestPos); }
    }
    if (matched === n) {
      let key = total;
      const sorted = [...positions].sort((a, b) => a - b);
      if (n >= 2 && sorted.length === n && new Set(sorted).size === n && sorted[n - 1] - sorted[0] === n - 1) key -= 1.5; // words side by side
      if (opts.boost) key -= 0.8 * opts.boost(it);
      full.push({ it, key });
    } else if (n >= 2 && matched >= needed) {
      near.push({ it, matched, total });
    }
  }

  if (full.length) {
    full.sort((a, b) => a.key - b.key || a.it.name.localeCompare(b.it.name));
    return { items: full.slice(0, limit).map((x) => x.it), partial: false };
  }
  near.sort((a, b) => b.matched - a.matched || a.total - b.total || a.it.name.localeCompare(b.it.name));
  return { items: near.slice(0, limit).map((x) => x.it), partial: near.length > 0 };
}

// kept for older callers
export function searchItems<T extends SearchableItem>(items: T[], query: string, limit = 40): T[] {
  return searchItemsRanked(items, query, { limit }).items;
}

// which parts of `text` matched the query, as [start, end) pairs, for highlighting
export function matchRanges(text: string, query: string): Array<[number, number]> {
  const qt = searchTokens(query);
  if (!qt.length) return [];
  const out: Array<[number, number]> = [];
  const low = (text || "").toLowerCase();
  const re = /\d+(?:\.\d+)?|[a-z]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(low))) {
    if (m[0] === "x") continue;
    const w = CANON[m[0]] || m[0];
    if (qt.some((q) => wordScore(q, w) >= 0)) {
      const last = out[out.length - 1];
      if (last && low.slice(last[1], m.index).trim() === "" && m.index - last[1] <= 1) last[1] = m.index + m[0].length;
      else out.push([m.index, m.index + m[0].length]);
    }
  }
  return out;
}