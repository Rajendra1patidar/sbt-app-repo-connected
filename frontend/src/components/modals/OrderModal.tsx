import { useState } from "react";
import { EmptyNote, FieldBlock, FormSheet, TextArea } from "../ui/blocks";
import { PlusIcon, TrashIcon } from "../ui/icons";
import { Field, Group, IconButton, SecondaryButton, TextInput } from "../ui/kit";
import { SearchableSelect } from "../common/SearchableSelect";
import { round2, today } from "../../lib/format";
import { inr } from "../../lib/money";

/* ---- OrderModal ----
 * Multi-item order entry — same shape as PurchaseModal: one vendor, one
 * date, one notes field shared across every line, but each line picks its
 * own item/qty/rate. Saving creates one Order (Purchase, source:"order")
 * record per line via saveOrder, which loops the existing single-item
 * create endpoint — same approach PurchaseModal's "New item" lines use.
 */

type OrderLine = { itemId: string; qty: number | string; rate: number | string };

export function OrderModal({ items, vendors, currency, onClose, onSave, prefill }: any) {
  const activeItems = items.filter((it: any) => !it.deleted);
  const itemById = (id: string) => activeItems.find((it: any) => it.id === id);

  const initialItemId = prefill?.itemId || activeItems[0]?.id || "";
  const initialVendor = prefill?.vendorId || "";
  const initialLines: OrderLine[] = [{
    itemId: initialItemId,
    qty: prefill?.qty || 1,
    rate: prefill?.rate ?? (itemById(initialItemId)?.purchasePrice ?? ""),
  }];
  const [vendorId, setVendorId] = useState(initialVendor);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLine[]>(initialLines);
  const [saving, setSaving] = useState(false);
  const [initialJson] = useState(() => JSON.stringify(initialLines));

  const addLine = () => setLines((l) => [...l, { itemId: "", qty: 1, rate: 0 }]);
  const updateLine = (i: number, patch: Partial<OrderLine>) => setLines((l) => l.map((ln, idx) => (idx === i ? { ...ln, ...patch } : ln)));
  const removeLine = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));

  const lineAmounts = lines.map((ln) => round2(Number(ln.qty || 0) * Number(ln.rate || 0)));
  const total = round2(lineAmounts.reduce((s, a) => s + a, 0));

  const canSave = lines.length > 0 && lines.every((l) => l.itemId && Number(l.qty) > 0 && Number(l.rate) >= 0 && l.rate !== "") && !saving;
  const dirty = JSON.stringify(lines) !== initialJson || notes.trim() !== "" || vendorId !== initialVendor;

  const handleSaveClick = () => {
    if (!canSave) return;
    setSaving(true);
    const payload = {
      vendorId: vendorId || undefined,
      date,
      notes,
      lines: lines.map((ln) => ({ itemId: ln.itemId, qty: Number(ln.qty), rate: Number(ln.rate || 0) })),
    };
    Promise.resolve(onSave(payload)).finally(() => setSaving(false));
  };

  return (
    <FormSheet tall title="New order" onClose={onClose} dirty={dirty} canSave={!!canSave && items.length > 0} saving={saving} saveLabel="Place order" savingLabel="Placing…" onSave={handleSaveClick}>
      {items.length === 0 ? <EmptyNote text="Add an item first, then order more of it." /> : (
        <div className="space-y-5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <FieldBlock label="Vendor">
              <SearchableSelect options={vendors.map((v: any) => ({ value: v.id, label: v.name }))} value={vendorId} onChange={setVendorId} placeholder="If you know it" />
            </FieldBlock>
            <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>

          <div>
            <span className="mb-1.5 block text-micro text-mute">Items <span className="text-bad-600">*</span></span>
            <div className="space-y-2.5">
              {lines.map((ln, i) => {
                const it = itemById(ln.itemId);
                const showBoxReminder = it && it.trackingMode === "box" && it.piecesPerBox > 0;
                return (
                  <div key={i} className="rounded-group border border-line p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <SearchableSelect
                          options={activeItems.map((opt: any) => ({ value: opt.id, label: `${opt.name} (current stock: ${opt.stock ?? 0})`, keywords: opt.category || "" }))}
                          value={ln.itemId}
                          onChange={(v: string) => updateLine(i, { itemId: v, rate: itemById(v)?.purchasePrice || itemById(v)?.sellingPrice || 0 })}
                          placeholder="Select item"
                        />
                      </div>
                      {lines.length > 1 && <IconButton label={`Remove line ${i + 1}`} tone="danger" className="-mr-1.5" onClick={() => removeLine(i)}><TrashIcon size={18} /></IconButton>}
                    </div>
                    <div className="mt-3 grid grid-cols-[1fr_1fr_1fr] gap-2">
                      <Field label="Qty"><TextInput type="number" inputMode="decimal" min="1" value={ln.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></Field>
                      <Field label="Rate"><TextInput type="number" inputMode="decimal" min="0" step="0.01" value={ln.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} /></Field>
                      <div>
                        <span className="mb-1 block text-micro text-mute">Amount</span>
                        <div className="flex h-11 items-center justify-end text-[16px] font-medium tabular-nums text-ink">{inr(lineAmounts[i], currency)}</div>
                      </div>
                    </div>
                    {showBoxReminder && <p className="mt-2 text-micro text-brand-600">This item comes in a box of {it.piecesPerBox} pieces.</p>}
                  </div>
                );
              })}
            </div>
            <SecondaryButton className="mt-2.5" onClick={addLine}><span className="inline-flex items-center justify-center gap-1.5"><PlusIcon size={18} /> Add another item</span></SecondaryButton>
          </div>

          <Field label="Notes"><TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" /></Field>

          <Group>
            <div className="flex min-h-[48px] items-center justify-between px-4"><span className="text-[16px] text-mute">Total</span><span className="text-[17px] font-semibold tabular-nums text-ink">{inr(total, currency)}</span></div>
          </Group>
        </div>
      )}
    </FormSheet>
  );
}
