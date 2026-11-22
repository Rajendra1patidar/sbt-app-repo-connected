import { useState } from "react";
import { LocationPickerModal } from "./LocationPickerModal";
import { FieldBlock, FormSheet, SelectInput, TextArea } from "../ui/blocks";
import { PinIcon } from "../ui/icons";
import { Field, Segmented, TextInput, cx } from "../ui/kit";

/* ---- FieldModal ----
 * The one generic form: a title, a list of field definitions, Save. Used for customers, items, vendors,
 * godowns, expenses, payments to vendors and the rest. It is a sheet now, so it swipes down to close,
 * keeps focus inside, and asks "Discard changes?" instead of throwing away what was typed. */

export function FieldModal({ title, fields, initial, onClose, onSave, danger }: any) {
  const [values, setValues] = useState<any>(() => initial || {});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setValues((s: any) => ({ ...s, [k]: v }));

  const visibleFields = fields.filter((f: any) => !f.showIf || f.showIf(values));
  const canSave = visibleFields.every((f: any) => !f.required || (values[f.key] !== undefined && values[f.key] !== ""));
  const dirty = JSON.stringify(values) !== JSON.stringify(initial || {});

  const handleSave = () => {
    if (!canSave || saving) return;
    setSaving(true);
    // onSave is a store action (saveItem, saveVendor, saveScoreRule, ...) that
    // may or may not return a promise depending on the caller — Promise.resolve
    // normalizes both so the button always re-enables once it's actually done,
    // rather than snapping back to "Save" before the backend request lands.
    Promise.resolve(onSave(values)).finally(() => setSaving(false));
  };

  const renderControl = (f: any) => {
    const value = values[f.key] ?? "";
    if (f.type === "select") {
      return (
        <SelectInput value={value} onChange={(e) => set(f.key, e.target.value)}>
          <option value="" disabled>Choose…</option>
          {f.options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectInput>
      );
    }
    if (f.type === "textarea") {
      return <TextArea value={value} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />;
    }
    if (f.type === "datalist") {
      return (
        <>
          <TextInput list={`${f.key}-options`} type="text" value={value} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
          <datalist id={`${f.key}-options`}>{f.options.map((o: any) => <option key={o} value={o} />)}</datalist>
        </>
      );
    }
    return (
      <TextInput
        type={f.type || "text"} value={value} placeholder={f.placeholder}
        inputMode={f.type === "number" ? "decimal" : f.type === "tel" ? "tel" : undefined}
        step={f.type === "number" ? "any" : undefined}
        readOnly={f.readOnly} disabled={f.readOnly}
        onChange={(e) => set(f.key, e.target.value)}
        className={cx(f.readOnly && "!bg-fill text-mute")}
      />
    );
  };

  return (
    <>
      <FormSheet title={title} onClose={onClose} dirty={dirty} onSave={handleSave} canSave={canSave} saving={saving} saveTone={danger ? "danger" : "action"}>
        <div className="space-y-4 pt-1">
          {visibleFields.map((f: any, i: number) => {
            const label = <>{f.label}{f.required && <span className="text-bad-600"> *</span>}</>;
            const hint = f.helpText;
            // A segmented control and an input-with-a-button are not one input, so they get a plain label
            // block (a <label> around two controls would send a tap on the label to the wrong one).
            if (f.type === "toggle") {
              return (
                <FieldBlock key={`${f.key}-${i}`} label={label} hint={hint}>
                  <Segmented ariaLabel={f.label} options={f.options} value={values[f.key] ?? ""} onChange={(v) => set(f.key, v)} />
                </FieldBlock>
              );
            }
            if (f.type === "location") {
              return (
                <FieldBlock key={`${f.key}-${i}`} label={label} hint={hint}>
                  <div className="flex gap-2">
                    <TextInput type="text" value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} aria-label={f.label} />
                    <button type="button" onClick={() => setPickerFor(f.key)}
                      className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-control border border-rule bg-card px-3.5 text-[15px] font-medium text-brand-600 transition active:opacity-60">
                      <PinIcon size={18} /> Map
                    </button>
                  </div>
                </FieldBlock>
              );
            }
            return <Field key={`${f.key}-${i}`} label={label} hint={hint}>{renderControl(f)}</Field>;
          })}
        </div>
      </FormSheet>

      {pickerFor && (
        <LocationPickerModal
          initialAddress={values[pickerFor]}
          initialLat={values[`${pickerFor}Lat`]}
          initialLng={values[`${pickerFor}Lng`]}
          onClose={() => setPickerFor(null)}
          onPick={({ address, lat, lng }: any) => {
            set(pickerFor, address);
            set(`${pickerFor}Lat`, lat);
            set(`${pickerFor}Lng`, lng);
            setPickerFor(null);
          }}
        />
      )}
    </>
  );
}
