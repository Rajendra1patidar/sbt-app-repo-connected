// Smart item search for the estimate form.
// - words can be typed in any order ("10mm kam" finds "Kamdhenu TMT 10mm")
// - each word can match the start of a word, any part of it, or be a short
//   form with letters in order ("cmnt" finds "cement")
// - name, category, brand and code are all searched
// - results are ranked best-first

export interface SearchableItem {
  id: string;
  name: string;
  category?: string;
  brand?: string;
  sku?: string;
  code?: string;
}

const norm = (s: string) => (s || "").toLowerCase();
const words = (s: string) => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

// true when every letter of `t` appears in `w` in the same order
function inOrder(t: string, w: string) {
  let k = 0;
  for (const ch of w) {
    if (ch === t[k]) k++;
    if (k === t.length) return true;
  }
  return false;
}

// 0 = best match, higher = weaker, -1 = no match
function tokenScore(t: string, nameWords: string[], nameFlat: string, extraWords: string[], extraFlat: string): number {
  if (nameWords.some((w) => w === t)) return 0;
  if (nameWords.some((w) => w.startsWith(t))) return 1;
  if (nameFlat.includes(t)) return 2;
  if (extraWords.some((w) => w.startsWith(t)) || extraFlat.includes(t)) return 3;
  if (t.length >= 3 && nameWords.some((w) => w[0] === t[0] && inOrder(t, w))) return 4;
  if (t.length >= 3 && extraWords.some((w) => w[0] === t[0] && inOrder(t, w))) return 5;
  return -1;
}

export function searchItems<T extends SearchableItem>(items: T[], query: string, limit = 40): T[] {
  const tokens = words(query);
  if (tokens.length === 0) return [];
  const out: { it: T; score: number }[] = [];
  for (const it of items) {
    const nameWords = words(it.name);
    const nameFlat = nameWords.join("");
    const extra = [it.category, it.brand, it.sku, it.code].filter(Boolean).join(" ");
    const extraWords = words(extra);
    const extraFlat = extraWords.join("");
    let total = 0;
    let ok = true;
    for (const t of tokens) {
      const s = tokenScore(t, nameWords, nameFlat, extraWords, extraFlat);
      if (s < 0) { ok = false; break; }
      total += s;
    }
    if (ok) out.push({ it, score: total });
  }
  out.sort((a, b) => a.score - b.score || a.it.name.localeCompare(b.it.name));
  return out.slice(0, limit).map((x) => x.it);
}

export function queryWords(query: string) {
  return words(query);
}