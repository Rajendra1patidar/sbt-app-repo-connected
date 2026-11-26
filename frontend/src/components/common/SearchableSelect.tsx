import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { matchRanges, searchItemsRanked } from "../../lib/itemSearch";

// How many rows we actually render at once. With ~500 items, rendering all of
// them on every keystroke is what makes the list feel sluggish — capping the
// render (and telling the user there's more) keeps it instant regardless of
// list size, while a query almost always narrows well below this anyway.
const MAX_RESULTS = 40;


// "(current stock: 12)" style suffixes are for display only — keep them out of the search
function cleanLabel(label: string) {
  return (label || "").replace(/\s*\((?:current\s+)?stock[^)]*\)\s*$/i, "");
}

// Smart search: words in any order, spelling mistakes, sizes like 1.25 / 1 1/4,
// and a "closest matches" fallback — see lib/itemSearch.ts. `keywords` (e.g. an
// item's category) is searched too, just ranked behind the name.
function highlight(label: string, query: string) {
  const clean = cleanLabel(label);
  const ranges = matchRanges(clean, query);
  if (!ranges.length) return label;
  const out: React.ReactNode[] = [];
  let last = 0;
  ranges.forEach(([a, b], k) => {
    out.push(clean.slice(last, a));
    out.push(<mark key={k} className="rounded-sm bg-brand-100 text-brand-800">{clean.slice(a, b)}</mark>);
    last = b;
  });
  out.push(label.slice(last));
  return <>{out}</>;
}

export function SearchableSelect({ options, value, onChange, placeholder }: any) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o: any) => o.value === value);

  const { filtered, partial } = useMemo(() => {
    if (!query.trim()) return { filtered: options as any[], partial: false };
    const pool = options.map((o: any) => ({ id: String(o.value), name: cleanLabel(o.label), category: o.keywords || "", o }));
    const r = searchItemsRanked(pool, query, { limit: 5000 });
    return { filtered: r.items.map((x: any) => x.o), partial: r.partial };
  }, [options, query]);

  const visible = filtered.slice(0, MAX_RESULTS);
  const q = query.trim();

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (open) {
      // Focus the search box the moment the dropdown opens so typing starts
      // immediately — no extra click needed.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        // Inside a sheet the menu can open below the visible part of the form; bring it into view.
        menuRef.current?.scrollIntoView({ block: "nearest" });
      });
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
      // min-w-0 overrides the browser default of min-width:auto on flex/grid
      // items. Without it, a grid cell sizes itself to fit this button's
      // full un-truncated label (e.g. a long item name) instead of the
      // column width the grid template actually gives it — which pushed the
      // whole row (and the modal) wider than the viewport, so the "truncate"
      // on the label below never got a chance to kick in and the page
      // horizontal-scrolled instead of wrapping/ellipsizing in place.
      className="relative min-w-0"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); setQuery(""); } }}
    >
      <button
        type="button" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center justify-between rounded-control bg-paper px-3 text-left text-[16px]"
      >
        <span className={selected ? "truncate text-ink" : "truncate text-faint"}>
          {selected ? selected.label : (placeholder || "Select...")}
        </span>
        <ChevronDown size={18} className="ml-2 shrink-0 text-mute" />
      </button>
      {open && (
        <div ref={menuRef} className="absolute z-30 mt-1 w-full overflow-hidden rounded-control border border-line bg-card shadow-sheet">
          <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-card p-2">
            <Search size={16} className="shrink-0 text-mute" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search..."
              className="h-9 w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
            />
          </div>
          <div ref={listRef} className="max-h-56 overflow-y-auto">
            {partial && visible.length > 0 && (
              <p className="bg-warn-50 px-3 py-1.5 text-micro font-medium text-warn-700">No item has all your words. Closest matches:</p>
            )}
            {visible.length === 0 ? (
              <p className="px-3 py-3 text-[15px] text-mute">No matches</p>
            ) : (
              visible.map((o: any, i: number) => (
                <button
                  type="button"
                  key={o.value}
                  data-idx={i}
                  onClick={() => choose(o.value)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`block min-h-[44px] w-full px-3 py-2.5 text-left text-[15px] leading-snug ${
                    o.value === value ? "bg-brand-50 font-semibold text-brand-700" : "text-ink"
                  } ${i === activeIndex ? "bg-paper" : ""}`}
                >
                  {highlight(o.label, q)}
                  {/* the label itself didn't match but the item's category did (e.g. typing
                      "saria" for an item just named "Kamdhenu 10mm") — show the category
                      so it's clear why this row matched */}
                  {o.keywords && q && matchRanges(cleanLabel(o.label), q).length === 0 && (
                    <span className="ml-1.5 text-caption font-normal text-mute">— {o.keywords}</span>
                  )}
                </button>
              ))
            )}
          </div>
          {filtered.length > MAX_RESULTS && (
            <p className="border-t border-line px-3 py-2 text-micro text-mute">
              {filtered.length - MAX_RESULTS} more match{filtered.length - MAX_RESULTS !== 1 ? "es" : ""} — keep typing to narrow it down
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Due / Paid confirmation popup shown right before an estimate is saved ---- */