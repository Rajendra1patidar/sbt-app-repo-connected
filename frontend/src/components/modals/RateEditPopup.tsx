import { useState } from "react";
import { FormSheet } from "../ui/blocks";
import { Field, TextButton, TextInput } from "../ui/kit";
import { inrRate } from "../../lib/money";

// Opens over the estimate form (and its Add item sheet), so it sits at layer 70.
export function RateEditPopup({ itemName, listPrice, rate, onCancel, onReset, onSave }: any) {
  const [value, setValue] = useState(String(rate));
  const numeric = Number(value);
  const canSave = value !== "" && !isNaN(numeric) && numeric >= 0;
  const isOverridden = Number(rate) !== Number(listPrice);

  return (
    <FormSheet z={70} title="Edit rate" onClose={onCancel} dirty={value !== String(rate)} canSave={canSave} saveLabel="Save rate" onSave={() => canSave && onSave(numeric)}>
      <p className="-mt-1 mb-4 text-[15px] leading-[21px] text-mute">{itemName}. This changes the rate on this estimate only. The price saved on the Items list stays as it is.</p>
      <Field label="Rate per unit (₹)" hint={`List price ${inrRate(Number(listPrice))}`}>
        <TextInput autoFocus type="number" inputMode="decimal" min="0" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      {isOverridden && (
        <div className="mt-2">
          <TextButton className="-ml-1 px-1" onClick={onReset}>Reset to list price ({inrRate(Number(listPrice))})</TextButton>
        </div>
      )}
    </FormSheet>
  );
}
