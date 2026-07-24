import React, { useState } from "react";
import { MapPin, X } from "lucide-react";
import { LocationPickerModal } from "./LocationPickerModal";

/* ---- FieldModal ---- */

export function FieldModal({ title, fields, initial, onClose, onSave, danger }: any) {
  const [values, setValues] = useState<any>(() => initial || {});
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const set = (k: string, v: any) => setValues((s: any) => ({ ...s, [k]: v }));
  
  const visibleFields = fields.filter((f: any) => !f.showIf || f.showIf(values));
  const canSave = visibleFields.every((f: any) => !f.required || (values[f.key] !== undefined && values[f.key] !== ""));
  
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          {visibleFields.map((f: any) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-semibold text-ink/50">{f.label}{f.required && <span className="text-bad-500"> *</span>}</label>
              {f.type === "select" ? (
                <select value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}
                  className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                  <option value="" disabled>Choose...</option>
                  {f.options.map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "toggle" ? (
                <div className="flex gap-2 rounded-full border border-line p-1 bg-paper">
                  {f.options.map((o: any) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set(f.key, o.value)}
                      className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition ${
                        values[f.key] === o.value
                          ? "bg-white text-brand-600 shadow-sm"
                          : "bg-paper text-ink/70 hover:text-ink"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              ) : f.type === "textarea" ? (
                <textarea value={values[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}
                  rows={3} placeholder={f.placeholder}
                  className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              ) : f.type === "location" ? (
                <div className="flex gap-2">
                  <input type="text" value={values[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder}
                    className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
                  <button type="button" onClick={() => setPickerFor(f.key)}
                    className="flex shrink-0 items-center gap-1 rounded-xl border border-line px-3 py-2.5 text-xs font-semibold text-ink/70 hover:bg-paper">
                    <MapPin size={14} /> Map
                  </button>
                </div>
              ) : (
                <input type={f.type || "text"} value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder}
                  className="w-full rounded-xl border border-line px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/70">Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave(values)}
            className={`flex-1 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-40 ${danger ? "bg-bad-600" : "bg-brand-600"}`}>Save</button>
        </div>
      </div>

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
    </div>
  );
}

/* ---- LocationPickerModal (Google Maps + Places) ---- */
