import React, { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Card, EmptyState, PillButton } from "../common/UIPrimitives";
import { Pagination } from "../common/Pagination";
import { usePagination } from "../../hooks/usePagination";
import { PAGE_SIZE } from "../../lib/constants";
import { fmtDate, fmtMoney } from "../../lib/format";

import { IconButton } from "../ui/kit";
/* ---- Expenses ---- */

export function ExpensesView({ expenses, currency, openModal, removeExpense }: any) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const filtered = !q ? expenses : expenses.filter((e: any) =>
    (e.category || "").toLowerCase().includes(q) || (e.vendor || "").toLowerCase().includes(q)
  );
  const { pageItems, page, setPage, totalPages, total, pageSize } = usePagination(filtered, PAGE_SIZE);
  return (
    <div className="space-y-3 px-5 pb-28">
      <div className="flex items-center justify-between pt-1">
        <p className="text-sm text-faint">{expenses.length} expense{expenses.length !== 1 ? "s" : ""}</p>
        <PillButton onClick={() => openModal("expense")}><Plus size={16} /> Record Expense</PillButton>
      </div>
      {expenses.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by category or vendor..."
            className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm"
          />
        </div>
      )}
      {expenses.length === 0
        ? <Card><EmptyState text="Record your expenses." cta="Record Expense" onCta={() => openModal("expense")} /></Card>
        : filtered.length === 0
        ? <Card><p className="text-center text-sm text-faint">No expenses match your search.</p></Card>
        : <>
          {pageItems.map((e: any) => (
            <Card key={e.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0"><p className="font-semibold text-ink truncate">{e.category}</p><p className="text-xs text-faint truncate">{e.vendor || "No vendor"} · {fmtDate(e.date)}</p></div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-semibold text-bad-600">-{fmtMoney(e.amount, currency)}</span>
                <IconButton label="Delete expense" tone="danger" className="-my-1.5" onClick={() => removeExpense(e.id)}><Trash2 size={16} /></IconButton>
              </div>
            </Card>
          ))}
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} pageSize={pageSize} />
        </>
      }
    </div>
  );
}
