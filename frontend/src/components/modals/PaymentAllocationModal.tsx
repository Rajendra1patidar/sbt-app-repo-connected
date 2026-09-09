import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { SearchableSelect } from "../common/SearchableSelect";
import { fmtMoney, round2, today } from "../../lib/format";

/**
 * A customer can have several due estimates at once (e.g. a new estimate plus
 * an older unpaid one) — this shows all of them and lets the amount received
 * be split across whichever ones are being cleared, instead of forcing an
 * all-or-nothing pick against a single estimate.
 *
 * Two things this deliberately avoids, both of which used to make the form
 * confusing in practice:
 *  - Asking for the amount twice. The overwhelmingly common case is exactly
 *    one due estimate, so that case skips the allocation list entirely — the
 *    amount you type IS the payment, full stop, with a plain-English preview
 *    of what it'll do to the estimate's status.
 *  - A separate "auto-fill" button you had to remember to press. When there
 *    genuinely are multiple due estimates, the oldest-first split now happens
 *    live as you type, shown as a read-only summary. "Customize split" is
 *    there for the cases where oldest-first isn't what's wanted.
 */
export function PaymentAllocationModal({ customers, estimates, currency, initialCustomerId, initialInvoiceId, onClose, onSave }: any) {
  const [customerId, setCustomerId] = useState(initialCustomerId || "");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Cash");
  const [totalAmount, setTotalAmount] = useState("");
  const [customized, setCustomized] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  // Opened from a specific estimate/customer (a row's "Record payment" action)
  // vs. opened generically (e.g. from the Payments tab) with nothing picked yet.
  const isContextual = !!initialCustomerId;

  const customerOptions = (customers || []).map((c: any) => ({ value: c.id, label: c.name }));
  const customerName = customers.find((c: any) => c.id === customerId)?.name || "";

  const dueEstimates = useMemo(
    () =>
      (estimates || [])
        .filter((e: any) => e.customerId === customerId && e.status !== "Paid")
        .map((e: any) => ({ ...e, due: round2(Number(e.total || 0) - Number(e.amountPaid || 0)) }))
        .filter((e: any) => e.due > 0)
        .sort((a: any, b: any) => (a.date || "").localeCompare(b.date || "")),
    [estimates, customerId]
  );
  const isSingle = dueEstimates.length === 1;
  const singleDue = isSingle ? dueEstimates[0] : null;
  // Prefer the estimate this was opened from if it's still in the due list,
  // purely for the "EST-0231" label on the single-estimate view.
  const contextEstimate = dueEstimates.find((e: any) => e.id === initialInvoiceId) || dueEstimates[0];

  const enteredTotal = Number(totalAmount) || 0;

  const autoAllocations = useMemo(() => {
    let remaining = enteredTotal;
    const next: Record<string, number> = {};
    for (const e of dueEstimates) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, e.due);
      next[e.id] = round2(take);
      remaining = round2(remaining - take);
    }
    return next;
  }, [dueEstimates, enteredTotal]);

  const effectiveAllocations: Record<string, number> = customized
    ? Object.fromEntries(dueEstimates.map((e: any) => [e.id, Number(allocations[e.id]) || 0]))
    : autoAllocations;
  const allocatedSum = round2(Object.values(effectiveAllocations).reduce((s: number, v: number) => s + v, 0));
  const advanceAmount = round2(Math.max(0, enteredTotal - allocatedSum));
  const overAllocated = customized && allocatedSum > enteredTotal + 0.004;

  const startCustomizing = () => {
    setAllocations(Object.fromEntries(dueEstimates.map((e: any) => [e.id, String(autoAllocations[e.id] || "")])));
    setCustomized(true);
  };
  const setAllocation = (id: string, val: string) => setAllocations((prev) => ({ ...prev, [id]: val }));

  // Single-due-estimate preview line — the whole point of skipping the allocation UI
  // is that this one sentence tells you everything the table used to.
  const singlePreview = (() => {
    if (!singleDue || enteredTotal <= 0) return null;
    if (enteredTotal >= singleDue.due) {
      const extra = round2(enteredTotal - singleDue.due);
      return extra > 0
        ? { tone: "good", text: `Marks it Paid, plus ${fmtMoney(extra, currency)} extra recorded as advance` }
        : { tone: "good", text: "This will mark the estimate Paid" };
    }
    return { tone: "warn", text: `${fmtMoney(singleDue.due - enteredTotal, currency)} will still be due — status becomes Partially Paid` };
  })();

  const canSave = isSingle
    ? !!customerId && enteredTotal > 0
    : !!customerId && enteredTotal > 0 && !overAllocated && (allocatedSum > 0 || advanceAmount > 0);

  const save = () => {
    if (!canSave) return;
    const allocationList = isSingle
      ? [{ invoiceId: singleDue.id, amount: Math.min(enteredTotal, singleDue.due) }]
      : dueEstimates.map((e: any) => ({ invoiceId: e.id, amount: effectiveAllocations[e.id] || 0 })).filter((a: any) => a.amount > 0);
    const advance = isSingle ? round2(Math.max(0, enteredTotal - singleDue.due)) : advanceAmount;
    onSave({ customerId, date, method, allocations: allocationList, advanceAmount: advance });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">Record Payment</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>

        <div className="space-y-4">
          {isContextual ? (
            <div className="rounded-xl bg-paper px-3 py-2.5">
              <p className="text-sm font-semibold text-ink">{contextEstimate ? `${contextEstimate.number} · ${customerName}` : customerName}</p>
              {contextEstimate && <p className="text-xs text-ink/50">{fmtMoney(contextEstimate.due, currency)} due</p>}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink/50">Customer <span className="text-bad-500">*</span></label>
              <SearchableSelect options={customerOptions} value={customerId} onChange={setCustomerId} placeholder="Select a customer" />
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink/50">Amount received <span className="text-bad-500">*</span></label>
            <input
              type="number" min="0" placeholder="0.00" autoFocus
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>

          {customerId && isSingle && singlePreview && (
            <p className={`text-xs font-semibold ${singlePreview.tone === "good" ? "text-good-700" : "text-warn-700"}`}>{singlePreview.text}</p>
          )}

          {customerId && !isSingle && (
            dueEstimates.length === 0 ? (
              <p className="rounded-xl bg-paper px-3 py-2.5 text-xs text-ink/50">No due estimates for this customer — this will be recorded as a general advance.</p>
            ) : (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-semibold text-ink/50">Apply to which estimate(s)?</label>
                  {!customized && (
                    <button type="button" onClick={startCustomizing} disabled={enteredTotal <= 0}
                      className="text-xs font-semibold text-brand-600 disabled:opacity-30">
                      Customize split
                    </button>
                  )}
                </div>
                {!customized ? (
                  <div className="space-y-1.5 rounded-xl bg-paper px-3 py-2.5">
                    {dueEstimates.map((e: any) => {
                      const amt = autoAllocations[e.id] || 0;
                      return (
                        <div key={e.id} className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-ink">{e.number}</span>
                          <span className={`font-semibold ${amt >= e.due ? "text-good-700" : "text-ink/50"}`}>{fmtMoney(amt, currency)} of {fmtMoney(e.due, currency)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
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
                    <button type="button" onClick={() => setCustomized(false)} className="text-xs font-semibold text-ink/40">
                      Use automatic split instead
                    </button>
                  </div>
                )}
              </div>
            )
          )}

          {!isSingle && customized && overAllocated && (
            <p className="text-xs font-semibold text-bad-600">You've allocated more than the amount received — adjust the split above.</p>
          )}
          {!isSingle && !overAllocated && advanceAmount > 0 && dueEstimates.length > 0 && (
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
