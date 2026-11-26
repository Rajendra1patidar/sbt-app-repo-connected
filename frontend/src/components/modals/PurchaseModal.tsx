import { useState } from "react";
import { EmptyNote, FieldBlock, FormSheet, SelectInput, TextArea } from "../ui/blocks";
import { PlusIcon, TrashIcon } from "../ui/icons";
import { Field, Group, IconButton, SecondaryButton, Segmented, TextButton, TextInput } from "../ui/kit";
import { SearchableSelect } from "../common/SearchableSelect";
import { QuickAddItemPopup } from "./QuickAddItemPopup";
import { round2, today } from "../../lib/format";
import { inr } from "../../lib/money";

// Multi-item purchase entry — same ledger shape as the estimate form (item
// picker, qty, rate, right-aligned amount, inline payment status) but simpler:
// no discount column and no previous-due section, since neither concept
// exists for a purchase.
//
// IMPORTANT — this does NOT change the backend or the Purchase schema. A
// Purchase document is still always exactly one item (see the comment in
// Purchase.js: it's the same record that also powers the Orders screen and
// per-item stock movements, so splitting it into a lines[] array would be a
// real data-model migration, not a form change). Instead, one submit here
// creates one Purchase record per line — all sharing this vendor/date/notes —
// via savePurchaseBatch, which just calls the existing create-one-purchase
// endpoint once per line. From the vendor's side this is one bill with
// several items on it; under the hood it's still several independent,
// individually-reversible restock records, which is exactly how deleting a
// single line item off an old purchase already worked.
const PAYMENT_CHOICES = [
  { key: "unpaid", label: "Unpaid", desc: "Nothing paid yet." },
  { key: "partial", label: "Part paid", desc: "You're paying some of it now." },
  { key: "paid", label: "Paid", desc: "Paid in full." },
] as const;

type PurchaseLine = { itemId: string; qty: number | string; qtyKg?: number | string; rate: number | string };

export function PurchaseModal({ vendors, items, godowns, currency, onClose, onSave, onQuickAddItem }: any) {
  const activeItems = items.filter((it: any) => !it.deleted);
  const initialVendor = vendors[0]?.id || "";
  const [vendorId, setVendorId] = useState(initialVendor);
  const [date, setDate] = useState(today());
  const [godownId, setGodownId] = useState(godowns?.find((g: any) => g.isDefault)?.id || godowns?.[0]?.id || "");
  const [lines, setLines] = useState<PurchaseLine[]>([{ itemId: "", qty: 1, rate: 0 }]);
  const [notes, setNotes] = useState("");
  const [paymentChoice, setPaymentChoice] = useState<typeof PAYMENT_CHOICES[number]["key"]>("unpaid");
  const [amountPaid, setAmountPaid] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  const addLine = () => setLines((l) => [...l, { itemId: "", qty: 1, rate: 0 }]);
  const updateLine = (i: number, patch: Partial<PurchaseLine>) => setLines((l) => l.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));
  const itemById = (id: string) => activeItems.find((it: any) => it.id === id);

  const lineAmounts = lines.map((ln) => {
    const it = itemById(ln.itemId);
    const isWeight = it?.trackingMode === "weight";
    return round2((isWeight ? Number(ln.qtyKg || 0) : Number(ln.qty || 0)) * Number(ln.rate || 0));
  });
  const total = round2(lineAmounts.reduce((s, a) => s + a, 0));

  const isPartialChoice = paymentChoice === "partial";
  const amountPaidNum = Number(amountPaid || 0);
  const partialValid = !isPartialChoice || (amountPaidNum > 0 && amountPaidNum < total);
  const balanceAfter = paymentChoice === "paid" ? 0 : paymentChoice === "partial" ? round2(Math.max(total - amountPaidNum, 0)) : total;

  const canSave = vendorId && lines.length > 0 &&
    lines.every((l) => {
      if (!l.itemId || !(Number(l.qty) > 0)) return false;
      const it = itemById(l.itemId);
      return it?.trackingMode !== "weight" || Number(l.qtyKg) > 0;
    }) &&
    total > 0 && partialValid && !saving;
  const dirty = lines.some((l) => l.itemId) || notes.trim() !== "" || paymentChoice !== "unpaid" || amountPaid !== "" || vendorId !== initialVendor;

  // splits one batch-level "amount paid now" across lines proportionally to
  // each line's own amount, so the sum across lines always matches exactly
  // what was typed — the last line absorbs any rounding remainder.
  const splitAmountPaid = () => {
    if (paymentChoice !== "partial") return lines.map(() => 0);
    let remaining = round2(amountPaidNum);
    return lineAmounts.map((amt, idx) => {
      if (idx === lineAmounts.length - 1) return remaining;
      const share = total > 0 ? round2((amt / total) * amountPaidNum) : 0;
      remaining = round2(remaining - share);
      return share;
    });
  };

  const handleQuickAddItem = async (v: any) => {
    if (!onQuickAddItem) return;
    setAddingItem(true);
    try {
      const item = await onQuickAddItem(v);
      if (item) {
        // Fill the empty line the person was on, if there is one, rather than leaving it blank above a new one.
        setLines((l) => {
          const blank = l.findIndex((ln) => !ln.itemId);
          const filled = { itemId: item.id, qty: 1, rate: item.purchasePrice || item.sellingPrice || 0 };
          return blank >= 0 ? l.map((ln, i) => (i === blank ? { ...ln, ...filled } : ln)) : [...l, filled];
        });
        setShowAddItem(false);
      }
    } finally {
      setAddingItem(false);
    }
  };

  const handleSaveClick = () => {
    if (!canSave) return;
    setSaving(true);
    const perLinePaid = splitAmountPaid();
    const payload = {
      vendorId, date, notes, godownId: godownId || undefined,
      lines: lines.map((ln, i) => ({
        itemId: ln.itemId, qty: Number(ln.qty), qtyKg: itemById(ln.itemId)?.trackingMode === "weight" ? Number(ln.qtyKg || 0) : undefined,
        rate: Number(ln.rate || 0), godownId: godownId || undefined,
        paymentStatus: paymentChoice, amountPaid: perLinePaid[i],
      })),
    };
    Promise.resolve(onSave(payload)).finally(() => setSaving(false));
  };

  const blocked = vendors.length === 0 ? "Add a vendor first, then record what you bought from them."
    : activeItems.length === 0 && !onQuickAddItem ? "Add an item first." : "";

  return (
    <>
      <FormSheet tall title="New purchase" onClose={onClose} dirty={dirty} canSave={!!canSave && !blocked} saving={saving} saveLabel="Save purchase" savingLabel="Saving…" onSave={handleSaveClick}>
        {blocked ? <EmptyNote text={blocked} /> : (
          <div className="space-y-5 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <FieldBlock label="Vendor" required>
                <SearchableSelect options={vendors.map((v: any) => ({ value: v.id, label: v.name }))} value={vendorId} onChange={setVendorId} placeholder="Select vendor" />
              </FieldBlock>
              <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            </div>

            {godowns && godowns.length > 1 && (
              <Field label="Receiving into">
                <SelectInput value={godownId} onChange={(e) => setGodownId(e.target.value)}>
                  {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </SelectInput>
              </Field>
            )}

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-micro text-mute">Items <span className="text-bad-600">*</span></span>
                {onQuickAddItem && <TextButton className="-mr-1 px-1" onClick={() => setShowAddItem(true)}>New item</TextButton>}
              </div>
              <div className="space-y-2.5">
                {lines.map((ln, i) => {
                  const it = itemById(ln.itemId);
                  const isWeight = it?.trackingMode === "weight";
                  return (
                    <div key={i} className="rounded-group border border-line p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <SearchableSelect
                            options={activeItems.map((opt: any) => ({ value: opt.id, label: `${opt.name} (stock: ${opt.trackingMode === "weight" ? `${opt.stockKg ?? 0}kg` : opt.stock ?? 0})`, keywords: opt.category || "" }))}
                            value={ln.itemId} onChange={(v: string) => updateLine(i, { itemId: v, rate: itemById(v)?.purchasePrice || itemById(v)?.sellingPrice || 0 })}
                            placeholder="Select item"
                          />
                        </div>
                        {lines.length > 1 && <IconButton label={`Remove line ${i + 1}`} tone="danger" className="-mr-1.5" onClick={() => removeLine(i)}><TrashIcon size={18} /></IconButton>}
                      </div>
                      <div className="mt-3 grid grid-cols-[1fr_1fr_1fr] gap-2">
                        <Field label={isWeight ? "Pieces" : "Qty"}><TextInput type="number" inputMode="decimal" min="0" value={ln.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></Field>
                        <Field label={`Rate${isWeight ? " a kg" : ""}`}><TextInput type="number" inputMode="decimal" min="0" value={ln.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} /></Field>
                        <div>
                          <span className="mb-1 block text-micro text-mute">Amount</span>
                          <div className="flex h-11 items-center justify-end text-[16px] font-medium tabular-nums text-ink">{inr(lineAmounts[i], currency)}</div>
                        </div>
                      </div>
                      {isWeight && (
                        <Field className="mt-3" label="Weight received, in kg" hint="Weigh it again. Don't estimate.">
                          <TextInput type="number" inputMode="decimal" min="0" step="0.01" value={ln.qtyKg ?? ""} onChange={(e) => updateLine(i, { qtyKg: e.target.value })} placeholder="0" />
                        </Field>
                      )}
                    </div>
                  );
                })}
              </div>
              <SecondaryButton className="mt-2.5" onClick={addLine}><span className="inline-flex items-center justify-center gap-1.5"><PlusIcon size={18} /> Add another item</span></SecondaryButton>
            </div>

            <Field label="Notes"><TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>

            <FieldBlock label="Payment" hint={PAYMENT_CHOICES.find((c) => c.key === paymentChoice)?.desc}>
              <Segmented ariaLabel="Payment status" options={PAYMENT_CHOICES.map((c) => ({ value: c.key, label: c.label }))} value={paymentChoice} onChange={(v) => setPaymentChoice(v as any)} />
            </FieldBlock>
            {isPartialChoice && (
              <Field label="Paid now" hint={amountPaid !== "" && !partialValid ? <span className="text-bad-600">Enter more than 0 and less than {inr(total, currency)}.</span> : lines.length > 1 && amountPaid !== "" ? `Split across ${lines.length} items in proportion to each amount.` : undefined}>
                <TextInput type="number" inputMode="decimal" min="0" max={total} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="0" />
              </Field>
            )}

            <Group>
              <div className="flex min-h-[48px] items-center justify-between px-4"><span className="text-[16px] text-mute">Total</span><span className="text-[17px] font-semibold tabular-nums text-ink">{inr(total, currency)}</span></div>
              <div className="flex min-h-[48px] items-center justify-between border-t border-line px-4"><span className="text-[16px] text-mute">You'll owe after saving</span><span className="text-[16px] tabular-nums text-ink">{inr(balanceAfter, currency)}</span></div>
            </Group>
          </div>
        )}
      </FormSheet>

      {showAddItem && <QuickAddItemPopup saving={addingItem} onCancel={() => setShowAddItem(false)} onSave={handleQuickAddItem} />}
    </>
  );
}
