import React, { useMemo } from "react";
import { fmtMoney } from "../../lib/format";

function initials(name: string) {
  return (name || "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

function shortDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function DueThisWeek({ estimates, customers, currency, go }: any) {
  const rows = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const weekOut = new Date(now); weekOut.setDate(weekOut.getDate() + 7);
    const byCustomer: Record<string, { customerId: string; amount: number; earliest: string }> = {};
    (estimates || []).forEach((e: any) => {
      if (e.status === "Paid" || !e.dueDate) return;
      const due = new Date(e.dueDate);
      if (due < now || due > weekOut) return;
      const balance = Math.max(0, Number(e.total || 0) - Number(e.amountPaid || 0));
      if (balance <= 0) return;
      const key = e.customerId;
      if (!byCustomer[key]) byCustomer[key] = { customerId: key, amount: 0, earliest: e.dueDate };
      byCustomer[key].amount += balance;
      if (new Date(e.dueDate) < new Date(byCustomer[key].earliest)) byCustomer[key].earliest = e.dueDate;
    });
    return Object.values(byCustomer).sort((a, b) => new Date(a.earliest).getTime() - new Date(b.earliest).getTime()).slice(0, 6);
  }, [estimates]);

  const customerName = (id: string) => customers.find((c: any) => c.id === id)?.name || "Customer";

  return (
    <div className="rounded-card bg-card border border-line shadow-card overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-3.5 pb-2 border-b border-line">
        <h2 className="font-display text-[13.5px] font-medium text-ink">Due this week</h2>
        <span className="font-mono text-[10px] text-ink/40">{rows.length} account{rows.length !== 1 ? "s" : ""}</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[12.5px] text-ink/40">Nothing due in the next 7 days.</p>
      ) : (
        rows.map((r) => {
          const name = customerName(r.customerId);
          return (
            <button key={r.customerId} onClick={() => go?.("customers")} className="flex w-full items-center gap-2.5 px-4 py-2.5 border-b border-line last:border-none text-left hover:bg-paper/60">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-paper font-display text-[10.5px] font-semibold text-ink">{initials(name)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11.5px] font-semibold text-ink">{name}</p>
                <p className="font-mono text-[9.5px] text-ink/40">due {shortDate(r.earliest)}</p>
              </div>
              <span className="shrink-0 font-mono text-[11.5px] font-semibold text-bad-600">{fmtMoney(r.amount, currency)}</span>
            </button>
          );
        })
      )}
    </div>
  );
}
