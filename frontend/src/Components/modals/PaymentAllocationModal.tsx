import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { SearchableSelect } from "../common/SearchableSelect";
import { fmtMoney, round2, today } from "../../lib/format";

/**
 * Replaces the old single "pick one estimate" payment form. A customer can have
 * several due estimates at once (e.g. a new estimate plus an older unpaid one) —
 * this shows all of them and lets the amount received be split across whichever
 * ones the person is actually clearing, instead of forcing an all-or-nothing pick
 * against a single estimate.
 */
export function PaymentAllocationModal({ customers, estimates, currency, initialCustomerId, initialInvoiceId, onClose, onSave }: any) {
  const [customerId, setCustomerId] = useState(initialCustomerId || "");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Cash");
  const [totalAmount, setTotalAmount] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [touchedTotal, setTouchedTotal] = useState(false);

  const customerOptions = (customers || []).map((c: any) => ({ value: c.id, label: c.name }));

  const dueEstimates = useMemo(
    () =>
      (estimates || [])
        .filter((e: any) => e.customerId === customerId && e.status !== "Paid")
        .map((e: any) => ({ ...e, due: round2(Number(e.total || 0) - Number(e.amountPaid || 0)) }))
        .filter((e: any) => e.due > 0)
        .sort((a: any, b: any) => (a.date || "").localeCompare(b.date || "")),
    [estimates, customerId]
  );

  // Preselect a specific estimate's full due when opened from that estimate's
  // "Record Payment" action, so the common single-estimate case still takes one tap.
  const initialisedFor = React.useRef<string | null>(null);
  if (customerId && initialisedFor.current !== customerId) {
    initialisedFor.current = customerId;
    if (initialInvoiceId) {
      const target = dueEstimates.find((e: any) => e.id === initialInvoiceId);
      if (target) {
        setAllocations({ [target.id]: String(target.due) });
        setTotalAmount(String(target.due));
      }
    }
  }

  const setAllocation = (id: string, val: string) => setAllocations((prev) => ({ ...prev, [id]: val }));

  const allocatedSum = round2(Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0));
  const enteredTotal = Number(totalAmount) || 0;
  const advanceAmount = touchedTotal ? round2(Math.max(0, enteredTotal - allocatedSum)) : 0;
  const overAllocated = allocatedSum > enteredTotal + 0.004 && touchedTotal;

  const autoFillOldestFirst = () => {
    let remaining = enteredTotal;
    const next: Record<string, string> = {};
    for (const e of dueEstimates) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, e.due);
      next[e.id] = String(round2(take));
      remaining = round2(remaining - take);
    }
    setAllocations(next);
  };

  const canSave =
    !!customerId &&
    enteredTotal > 0 &&
    !overAllocated &&
    (allocatedSum > 0 || advanceAmount > 0);

  const save = () => {
    if (!canSave) return;
    onSave({
      customerId,
      date,
      method,
      allocations: dueEstimates
        .map((e: any) => ({ invoiceId: e.id, amount: Number(allocations[e.id] || 0) }))
        .filter((a: any) => a.amount > 0),
      advanceAmount,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">Record Payment</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink/50">Customer <span className="text-bad-500">*</span></label>
            <SearchableSelect options={customerOptions} value={customerId} onChange={setCustomerId} placeholder="Select a customer" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink/50">Amount received <span className="text-bad-500">*</span></label>
            <input
              type="number" min="0" placeholder="0.00"
              value={totalAmount}
              onChange={(e) => { setTotalAmount(e.target.value); setTouchedTotal(true); }}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {customerId && (
            dueEstimates.length === 0 ? (
              <p className="rounded-xl bg-paper px-3 py-2.5 text-xs text-ink/50">No due estimates for this customer — this will be recorded as a general advance.</p>
            ) : (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-semibold text-ink/50">Apply to which estimate(s)?</label>
                  <button type="button" onClick={autoFillOldestFirst} disabled={enteredTotal <= 0}
                    className="text-xs font-semibold text-brand-600 disabled:opacity-30">
                    Auto-fill oldest first
                  </button>
                </div>
                <div className="space-y-2">
                  {dueEstimates.map((e: any) => (
                    <div key={e.id} className="flex items-center gap-2 rounded-xl border border-line p-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{e.number}</p>
                        <p className="text-xs text-ink/40">{fmtMoney(e.due, currency)} due</p>
                      </div>
                      <input
                        type="number" min="0" max={e.due} placeholder="0.00"
                        value={allocations[e.id] || ""}
                        onChange={(ev) => setAllocation(e.id, ev.target.value)}
                        className="w-24 rounded-xl border border-line px-2 py-2 text-right text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          )}

          {touchedTotal && overAllocated && (
            <p className="text-xs font-semibold text-bad-600">You've allocated more than the amount received — adjust the split above.</p>
          )}
          {touchedTotal && !overAllocated && advanceAmount > 0 && (
            <p className="rounded-xl bg-good-50 px-3 py-2 text-xs text-good-700">
              {fmtMoney(advanceAmount, currency)} left over after those estimates — will be recorded as a general advance for this customer.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                {["Cash", "Bank Transfer", "UPI", "Card"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={save}
            className="flex-1 rounded-full bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-40">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
