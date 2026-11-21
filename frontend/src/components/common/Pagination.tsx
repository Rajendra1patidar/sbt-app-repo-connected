import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { IconButton } from "../ui/kit";
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
      <p className="text-xs text-faint">
        {rangeStart != null ? `${rangeStart}–${rangeEnd} of ${total}` : `Page ${page} of ${totalPages}`}
      </p>
      <div className="flex items-center gap-1">
        <IconButton label="Previous page" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
          <ChevronLeft size={16} />
        </IconButton>
        <span className="min-w-[3.5rem] text-center text-xs font-semibold text-ink/70">{page} / {totalPages}</span>
        <IconButton label="Next page" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>
          <ChevronRight size={16} />
        </IconButton>
      </div>
    </div>
  );
}
