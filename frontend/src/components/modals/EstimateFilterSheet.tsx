import React from "react";
import { Switch } from "../common/UIPrimitives";

const STATUS_OPTIONS: [string, string][] = [
  ["all", "All"],
  ["due", "Due"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
  ["returned", "Returned items"],
];

const SORT_OPTIONS: [string, string][] = [
  ["newest", "Newest"],
  ["oldest", "Oldest"],
  ["amount", "Highest amount"],
  ["customer", "Customer A–Z"],
];

/**
 * Bottom sheet holding everything that used to be permanently-visible chip
 * rows above the estimate list: the status filter, sort order, and the
 * show-deleted toggle. Keeping these in one sheet (opened from a single pill
 * next to search) instead of stacking three separate chip rows in the header
 * every time — same controls, reached in one tap either way.
 */
export function EstimateFilterSheet({
  onClose,
  statusFilter,
  setStatusFilter,
  filterCounts,
  sortBy,
  setSortBy,
  showDeleted,
  setShowDeleted,
  deletedCount,
}: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-3xl bg-card px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl"
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-pill bg-line" />

        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">Status</p>
        <div className="mb-5 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold ${statusFilter === key ? "bg-ink text-white" : "bg-paper text-ink/70"}`}
            >
              {label}
              <span className={`rounded-pill px-1.5 py-0.5 text-[10px] font-extrabold ${statusFilter === key ? "bg-card/25" : "bg-ink/10"}`}>
                {filterCounts[key] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink/40">Sort by</p>
        <div className="mb-5 flex flex-wrap gap-2">
          {SORT_OPTIONS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`rounded-pill px-3 py-1.5 text-xs font-semibold ${sortBy === key ? "bg-ink text-white" : "bg-paper text-ink/70"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {deletedCount > 0 && (
          <div className="flex items-center justify-between border-t border-line py-3">
            <p className="text-sm font-semibold text-ink">
              Show deleted <span className="font-normal text-ink/40">({deletedCount})</span>
            </p>
            <Switch checked={showDeleted} onChange={setShowDeleted} />
          </div>
        )}
      </div>
    </div>
  );
}
