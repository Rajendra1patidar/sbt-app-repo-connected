import React, { useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export function SearchableSelect({ options, value, onChange, placeholder }: any) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o: any) => o.value === value);
  const filtered = query
    ? options.filter((o: any) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div
      className="relative"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOpen(false); setQuery(""); } }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 text-left text-sm"
      >
        <span className={selected ? "truncate text-ink" : "truncate text-ink/40"}>
          {selected ? selected.label : (placeholder || "Select...")}
        </span>
        <ChevronDown size={15} className="ml-2 shrink-0 text-ink/40" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-white shadow-lg">
          <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-white p-2">
            <Search size={14} className="shrink-0 text-ink/40" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full text-sm outline-none"
            />
          </div>
          {filtered.length === 0
            ? <p className="px-3 py-2 text-xs text-ink/40">No matches</p>
            : filtered.map((o: any) => (
              <button
                type="button"
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                className={`block w-full truncate px-3 py-2 text-left text-sm hover:bg-paper ${o.value === value ? "bg-brand-50 font-semibold text-brand-700" : "text-ink/80"}`}
              >
                {o.label}
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
}

/* ---- Due / Paid confirmation popup shown right before an estimate is saved ---- */
