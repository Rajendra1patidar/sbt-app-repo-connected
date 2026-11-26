import { useState } from "react";
import { FieldBlock, FormSheet, SelectInput } from "../ui/blocks";
import { Field, TextInput } from "../ui/kit";
import { SearchableSelect } from "../common/SearchableSelect";
import { qtyText } from "../../lib/money";

// `prefill` (optional) lets the Stock screens open this with the item and the godowns already chosen.
export function TransferModal({ items, godowns, onClose, onSave, prefill }: any) {
  const [itemId, setItemId] = useState(prefill?.itemId || "");
  const [fromGodownId, setFromGodownId] = useState(prefill?.fromGodownId || godowns.find((g: any) => g.isDefault)?.id || godowns[0]?.id || "");
  const [toGodownId, setToGodownId] = useState(prefill?.toGodownId || "");
  const [qty, setQty] = useState("");
  const [qtyKg, setQtyKg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const item = items.find((it: any) => it.id === itemId);
  const isWeight = item?.trackingMode === "weight";
  const atSource = item?.stockByGodown?.find((g: any) => String(g.godownId) === String(fromGodownId));
  const availablePieces = atSource?.stock ?? 0;
  const availableKg = atSource?.stockKg ?? 0;
  const overPieces = Number(qty) > availablePieces;
  const overKg = isWeight && Number(qtyKg) > availableKg;

  const canSave =
    itemId && fromGodownId && toGodownId && fromGodownId !== toGodownId &&
    Number(qty) > 0 && Number(qty) <= availablePieces &&
    (!isWeight || (Number(qtyKg) > 0 && Number(qtyKg) <= availableKg));
  const dirty = qty !== "" || qtyKg !== "" || itemId !== (prefill?.itemId || "") || toGodownId !== (prefill?.toGodownId || "");

  const submit = async () => {
    setSubmitting(true);
    try {
      await onSave({ itemId, fromGodownId, toGodownId, qty: Number(qty), qtyKg: isWeight ? Number(qtyKg) : undefined });
    } finally { setSubmitting(false); }
  };

  return (
    <FormSheet title="Transfer stock" onClose={onClose} dirty={dirty} canSave={!!canSave} saving={submitting} saveLabel="Transfer" savingLabel="Moving…" onSave={submit}>
      <div className="space-y-4 pt-1">
        <FieldBlock label="Item" required>
          <SearchableSelect
            options={items.filter((it: any) => !it.deleted).map((it: any) => ({ value: it.id, label: it.name, keywords: it.category || "" }))}
            value={itemId}
            onChange={(v: string) => { setItemId(v); setQty(""); setQtyKg(""); }}
            placeholder="Select item"
          />
        </FieldBlock>

        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <SelectInput value={fromGodownId} onChange={(e) => { setFromGodownId(e.target.value); if (e.target.value === toGodownId) setToGodownId(""); }}>
              {godowns.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="To">
            <SelectInput value={toGodownId} onChange={(e) => setToGodownId(e.target.value)}>
              <option value="">Select</option>
              {godowns.filter((g: any) => g.id !== fromGodownId).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </SelectInput>
          </Field>
        </div>

        {item && (
          <p className="text-[15px] text-mute">
            At the source: {isWeight ? `${qtyText(availableKg)} kg, ${qtyText(availablePieces)} pc` : `${qtyText(availablePieces)} ${item.unit || "unit"}`}
          </p>
        )}

        <Field label={isWeight ? "Pieces to move" : "Quantity to move"} hint={overPieces ? <span className="text-bad-600">Only {qtyText(availablePieces)} at the source.</span> : undefined}>
          <TextInput type="number" inputMode="decimal" min="0" max={availablePieces} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </Field>
        {isWeight && (
          <Field label="Weight to move, in kg" hint={overKg ? <span className="text-bad-600">Only {qtyText(availableKg)} kg at the source.</span> : "Weigh it again. Don't estimate."}>
            <TextInput type="number" inputMode="decimal" min="0" max={availableKg} value={qtyKg} onChange={(e) => setQtyKg(e.target.value)} placeholder="0" />
          </Field>
        )}
      </div>
    </FormSheet>
  );
}
