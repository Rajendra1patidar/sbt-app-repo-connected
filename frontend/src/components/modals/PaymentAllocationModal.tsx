import { useMemo, useState } from "react";
import { CustomerPickerSheet } from "../estimate/CustomerPickerSheet";
import { FieldBlock, FormSheet } from "../ui/blocks";
import { Field, Group, GroupLabel, GroupRow, Segmented, TextInput, cx } from "../ui/kit";
import { round2, today } from "../../lib/format";
import { inr } from "../../lib/money";

const METHODS = [
  { value: "Cash", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "Bank Transfer", label: "Bank" },
  { value: "Card", label: "Card" },
];

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
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  // Opened from a specific estimate/customer (a row's "Record payment" action)
  // vs. opened generically (e.g. from the Payments tab) with nothing picked yet.
  const isContextual = !!initialCustomerId;

  const customerName = (customers || []).find((c: any) => c.id === customerId)?.name || "";

  // What each customer owes across their open estimates: shown in the picker, and what lets an
  // archived customer who still owes money be chosen (an archived customer who owes nothing isn't offered).
  const owes = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of estimates || []) {
      const due = round2(Number(e.total || 0) - Number(e.amountPaid || 0));
      if (e.status !== "Paid" && due > 0) m.set(e.customerId, round2((m.get(e.customerId) || 0) + due));
    }
    return m;
  }, [estimates]);
  const pickable = useMemo(() => (customers || []).filter((c: any) => !c.archived || (owes.get(c.id) || 0) > 0), [customers, owes]);

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
  // The estimate this was opened from (if it's still due), or the only one due: named under the
  // customer. With several due and none chosen, the line summarises them instead of naming one.
  const contextEstimate = dueEstimates.find((e: any) => e.id === initialInvoiceId) || (isSingle ? dueEstimates[0] : null);
  const totalDue = round2(dueEstimates.reduce((s: number, e: any) => s + e.due, 0));

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
        ? { tone: "good", text: `Marks it Paid, plus ${inr(extra, currency)} extra recorded as advance` }
        : { tone: "good", text: "This will mark the estimate Paid" };
    }
    return { tone: "warn", text: `${inr(singleDue.due - enteredTotal, currency)} will still be due: status becomes Part paid` };
  })();

  const canSave = isSingle
    ? !!customerId && enteredTotal > 0
    : !!customerId && enteredTotal > 0 && !overAllocated && (allocatedSum > 0 || advanceAmount > 0);
  const dirty = totalAmount !== "" || customized || (!isContextual && customerId !== "");

  const save = () => {
    if (!canSave || saving) return;
    const allocationList = isSingle
      ? [{ invoiceId: singleDue.id, amount: Math.min(enteredTotal, singleDue.due) }]
      : dueEstimates.map((e: any) => ({ invoiceId: e.id, amount: effectiveAllocations[e.id] || 0 })).filter((a: any) => a.amount > 0);
    const advance = isSingle ? round2(Math.max(0, enteredTotal - singleDue.due)) : advanceAmount;
    setSaving(true);
    // The store records it and closes this sheet; the button only re-enables if that didn't happen.
    Promise.resolve(onSave({ customerId, date, method, allocations: allocationList, advanceAmount: advance })).finally(() => setSaving(false));
  };

  const linkBtn = "-my-3 inline-flex min-h-[44px] items-center text-[14px] font-medium text-brand-600 active:opacity-60 disabled:opacity-30";

  return (
    <>
      <FormSheet title="Record payment" onClose={onClose} dirty={dirty} onSave={save} canSave={canSave} saving={saving}
        saveLabel={enteredTotal > 0 ? `Record ${inr(enteredTotal, currency)}` : "Record payment"}>
        <div className="pt-1">
          <Group>
            {isContextual ? (
              <GroupRow className="min-h-[60px] py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-medium text-ink">{customerName}</p>
                  {contextEstimate
                    ? <p className="truncate text-caption text-mute"><span className="font-doc text-[12.5px]">{contextEstimate.number}</span>, {inr(contextEstimate.due, currency)} due</p>
                    : dueEstimates.length > 1 && <p className="truncate text-caption text-mute">{dueEstimates.length} estimates, {inr(totalDue, currency)} due</p>}
                </div>
              </GroupRow>
            ) : (
              <GroupRow onClick={() => setPicking(true)} chevron className="min-h-[60px] py-2.5" ariaLabel={customerName ? `Customer: ${customerName}. Change` : "Choose a customer"}>
                <p className="text-micro text-mute">Customer</p>
                <p className={cx("truncate text-[16px]", customerName ? "font-medium text-ink" : "text-mute")}>{customerName || "Choose a customer"}</p>
              </GroupRow>
            )}
          </Group>

          <label className="mt-3 block rounded-group bg-paper px-4 py-3">
            <span className="text-micro text-mute">Amount received</span>
            <span className="flex items-baseline gap-1">
              <span className="text-[28px] font-light text-faint">{currency}</span>
              <input
                type="number" inputMode="decimal" step="any" min="0" placeholder="0" autoFocus
                value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[34px] font-light leading-[44px] tabular-nums text-ink outline-none placeholder:text-faint"
              />
            </span>
          </label>

          {customerId && isSingle && singlePreview && (
            <p className={cx("mt-2 px-1 text-[14px] leading-[19px]", singlePreview.tone === "good" ? "text-good-600" : "text-warn-700")}>{singlePreview.text}</p>
          )}

          {customerId && !isSingle && (
            dueEstimates.length === 0 ? (
              <p className="mt-3 rounded-control bg-paper px-3 py-2.5 text-[14px] leading-[19px] text-mute">No due estimates for this customer. This will be recorded as a general advance.</p>
            ) : (
              <>
                <GroupLabel right={
                  !customized
                    ? <button type="button" onClick={startCustomizing} disabled={enteredTotal <= 0} className={linkBtn}>Customize split</button>
                    : <button type="button" onClick={() => setCustomized(false)} className={linkBtn}>Automatic split</button>
                }>Applies to</GroupLabel>
                <Group>
                  {dueEstimates.map((e: any) => {
                    const amt = autoAllocations[e.id] || 0;
                    return (
                      <GroupRow key={e.id} className="min-h-[56px] py-2">
                        <div className="flex w-full items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-doc text-[15px] text-ink">{e.number}</p>
                            {customized && <p className="text-caption text-mute">{inr(e.due, currency)} due</p>}
                          </div>
                          {customized ? (
                            <div className="w-28 shrink-0">
                              <TextInput type="number" inputMode="decimal" step="any" min="0" max={e.due} placeholder="0" aria-label={`Amount for ${e.number}`}
                                value={allocations[e.id] || ""} onChange={(ev) => setAllocation(e.id, ev.target.value)} className="text-right" />
                            </div>
                          ) : (
                            <span className={cx("shrink-0 text-[15px] tabular-nums", amt >= e.due ? "font-medium text-good-600" : "text-mute")}>{inr(amt, currency)} of {inr(e.due, currency)}</span>
                          )}
                        </div>
                      </GroupRow>
                    );
                  })}
                </Group>
              </>
            )
          )}

          {!isSingle && customized && overAllocated && (
            <p className="mt-2 px-1 text-[14px] leading-[19px] text-bad-600">You've allocated more than the amount received. Adjust the split above.</p>
          )}
          {!isSingle && !overAllocated && advanceAmount > 0 && dueEstimates.length > 0 && (
            <p className="mt-3 rounded-control bg-good-50 px-3 py-2.5 text-[14px] leading-[19px] text-good-600">
              {inr(advanceAmount, currency)} is left over after those estimates. It will be recorded as a general advance for this customer.
            </p>
          )}

          <FieldBlock label="Method" className="mt-4">
            <Segmented ariaLabel="Payment method" options={METHODS} value={method} onChange={setMethod} />
          </FieldBlock>
          <Field label="Date" className="mt-3.5">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </FormSheet>

      {picking && (
        <CustomerPickerSheet
          customers={pickable} owes={owes} selectedId={customerId} currency={currency}
          onClose={() => setPicking(false)}
          onPick={(c: any) => { setCustomerId(c.id); setCustomized(false); setAllocations({}); setPicking(false); }}
        />
      )}
    </>
  );
}
