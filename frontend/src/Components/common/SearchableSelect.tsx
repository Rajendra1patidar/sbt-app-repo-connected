import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

// How many rows we actually render at once. With ~500 items, rendering all of
// them on every keystroke is what makes the list feel sluggish — capping the
// render (and telling the user there's more) keeps it instant regardless of
// list size, while a query almost always narrows well below this anyway.
const MAX_RESULTS = 40;

function normalize(s: string) {
  return (s || "").toLowerCase();
}

// Ranks a match so "cement" typed for "White Cement 50kg" beats a coincidental
// substring hit buried in the middle of an unrelated label: exact match first,
// then "starts with", then "a word inside the label starts with it", then any
// substring match. Ties keep the original list order.
// `extra` folds in fields that should be searchable but aren't shown in the
// label itself (e.g. an item's category) — a category-only match still ranks,
// just behind a name match, so typing "saria" surfaces every saria item even
// though "Saria" only appears in their category, not their individual names.
function matchRank(label: string, extra: string, q: string): number {
  const l = normalize(label);
  if (l === q) return 0;
  if (l.startsWith(q)) return 1;
  if (l.split(/[\s,()-]+/).some((word) => word.startsWith(q))) return 2;
  if (l.includes(q)) return 3;
  const x = normalize(extra);
  if (x && (x === q || x.split(/[\s,()-]+/).some((word) => word.startsWith(q)) || x.includes(q))) return 4;
  return -1;
}

function highlight(label: string, q: string) {
  if (!q) return label;
  const idx = normalize(label).indexOf(q);
  if (idx === -1) return label;
  return (
    <>
      {label.slice(0, idx)}
      <mark className="rounded-sm bg-brand-100 text-brand-800">{label.slice(idx, idx + q.length)}</mark>
      {label.slice(idx + q.length)}
    </>
  );
}

export function SearchableSelect({ options, value, onChange, placeholder }: any) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o: any) => o.value === value);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options;
    return options
      .map((o: any) => ({ o, rank: matchRank(o.label, o.keywords || "", q) }))
      .filter((x: any) => x.rank !== -1)
      .sort((a: any, b: any) => a.rank - b.rank)
      .map((x: any) => x.o);
  }, [options, query]);

  const visible = filtered.slice(0, MAX_RESULTS);
  const q = normalize(query.trim());

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      // Focus the search box the moment the dropdown opens so typing starts
      // immediately — no extra click needed.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    // keep the highlighted row visible while navigating with arrow keys
    const el = listRef.current?.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const choose = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visible[activeIndex]) choose(visible[activeIndex].value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div
      className="relative"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); setQuery(""); } }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-line bg-card px-3 py-2.5 text-left text-sm"
      >
        <span className={selected ? "truncate text-ink" : "truncate text-ink/40"}>
          {selected ? selected.label : (placeholder || "Select...")}
        </span>
        <ChevronDown size={15} className="ml-2 shrink-0 text-ink/40" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-card shadow-lg">
          <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-card p-2">
            <Search size={14} className="shrink-0 text-ink/40" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search..."
              className="w-full text-sm outline-none"
            />
          </div>
          <div ref={listRef} className="max-h-56 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ink/40">No matches</p>
            ) : (
              visible.map((o: any, i: number) => (
                <button
                  type="button"
                  key={o.value}
                  data-idx={i}
                  onClick={() => choose(o.value)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`block w-full truncate px-3 py-2 text-left text-sm ${
                    o.value === value ? "bg-brand-50 font-semibold text-brand-700" : "text-ink/80"
                  } ${i === activeIndex ? "bg-paper" : ""}`}
                >
                  {highlight(o.label, q)}
                  {/* the label itself didn't contain the query but the item's category
                      did (e.g. typing "saria" for an item just named "Kamdhenu 10mm") —
                      show the category so it's clear why this row matched */}
                  {o.keywords && q && !normalize(o.label).includes(q) && normalize(o.keywords).includes(q) && (
                    <span className="ml-1.5 text-xs font-normal text-ink/40">— {o.keywords}</span>
                  )}
                </button>
              ))
            )}
          </div>
          {filtered.length > MAX_RESULTS && (
            <p className="border-t border-line px-3 py-1.5 text-[11px] text-ink/40">
              {filtered.length - MAX_RESULTS} more match{filtered.length - MAX_RESULTS !== 1 ? "es" : ""} — keep typing to narrow it down
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Due / Paid confirmation popup shown right before an estimate is saved ---- */
