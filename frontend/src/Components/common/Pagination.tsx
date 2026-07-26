import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({
  page, totalPages, onPageChange, total, pageSize,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  total?: number;
  pageSize?: number;
}) {
  if (totalPages <= 1) return null;
  const rangeStart = total != null && pageSize ? (page - 1) * pageSize + 1 : undefined;
  const rangeEnd = total != null && pageSize ? Math.min(page * pageSize, total) : undefined;

  return (
    <div className="flex items-center justify-between pt-1 pb-2">
      <p className="text-xs text-ink/40">
        {rangeStart != null ? `${rangeStart}–${rangeEnd} of ${total}` : `Page ${page} of ${totalPages}`}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded-full p-1.5 text-ink/60 hover:bg-paper disabled:opacity-30"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[3.5rem] text-center text-xs font-semibold text-ink/70">{page} / {totalPages}</span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="rounded-full p-1.5 text-ink/60 hover:bg-paper disabled:opacity-30"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
