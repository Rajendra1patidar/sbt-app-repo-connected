import { useState } from "react";
import { FormSheet } from "../ui/blocks";
import { Field, TextInput } from "../ui/kit";

// Deliberately minimal (name + phone + location only, no email/credit limit) —
// this exists for the fast path of adding a brand-new customer while creating
// an estimate, not as a replacement for the full "New Customer" form.
// It opens over the customer picker (a sheet at layer 60), so it sits one layer above that.
export function QuickAddCustomerPopup({ onCancel, onSave, saving }: any) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const canSave = name.trim().length > 0 && !saving;
  const dirty = !!(name || phone || location);

  return (
    <FormSheet
      z={70} title="New customer" onClose={onCancel} dirty={dirty} saving={!!saving} canSave={canSave}
      saveLabel="Add and select" savingLabel="Adding…"
      onSave={() => onSave({ name: name.trim(), phone: phone.trim(), location: location.trim() })}
    >
      <div className="space-y-4 pt-1">
        <Field label="Name *"><TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" autoComplete="off" /></Field>
        <Field label="Phone"><TextInput type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" autoComplete="off" /></Field>
        <Field label="Location"><TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, area (optional)" autoComplete="off" /></Field>
      </div>
    </FormSheet>
  );
}
