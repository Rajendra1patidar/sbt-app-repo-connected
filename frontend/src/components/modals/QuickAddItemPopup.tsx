import { useState } from "react";
import { FormSheet } from "../ui/blocks";
import { Field, TextInput } from "../ui/kit";

// Deliberately minimal (name + selling price + unit + opening stock, no category/brand/
// vendor/box-tracking) — this exists for the fast path of adding a brand-new item while
// building an estimate or a purchase, not as a replacement for the full "New Item" form.
// Category defaults to "Others" server-side, same as the full form.
// It opens over the Add item sheet (layer 60) or the purchase form, so it sits one layer above those.
export function QuickAddItemPopup({ onCancel, onSave, saving }: any) {
  const [name, setName] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [stock, setStock] = useState("");
  const canSave = name.trim().length > 0 && !saving;
  const dirty = !!(name || sellingPrice || unit || stock);

  return (
    <FormSheet
      z={70} title="New item" onClose={onCancel} dirty={dirty} saving={!!saving} canSave={canSave}
      saveLabel="Add and select" savingLabel="Adding…"
      onSave={() => onSave({ name: name.trim(), sellingPrice: Number(sellingPrice || 0), unit: unit.trim(), stock: Number(stock || 0) })}
    >
      <div className="space-y-4 pt-1">
        <Field label="Item name *"><TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Cement 50 kg bag" autoComplete="off" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Selling price"><TextInput type="number" inputMode="decimal" min="0" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="0.00" /></Field>
          <Field label="Unit"><TextInput value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, pc, bundle" autoComplete="off" /></Field>
        </div>
        <Field label="Opening stock"><TextInput type="number" inputMode="decimal" min="0" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" /></Field>
      </div>
    </FormSheet>
  );
}
