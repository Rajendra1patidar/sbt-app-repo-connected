import React, { useState } from "react";
import { X } from "lucide-react";

// Deliberately minimal (name + phone + location only, no email/credit limit) —
// this exists for the fast path of adding a brand-new customer while creating
// an estimate, not as a replacement for the full "New Customer" form.
export function QuickAddCustomerPopup({ onCancel, onSave, saving }: any) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const canSave = name.trim().length > 0 && !saving;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 animate-fade-in">
      <div className="animate-pop-in w-full max-w-xs rounded-3xl bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">New customer</h3>
          <button onClick={onCancel} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink/50">Name *</label>
            <input
              autoFocus value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Customer name" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink/50">Phone</label>
            <input
              value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink/50">Location</label>
            <input
              value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="City, area (optional)" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
            />
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="flex-1 rounded-full border border-line py-3 text-sm font-semibold text-ink/50">Cancel</button>
          <button
            disabled={!canSave}
            onClick={() => onSave({ name: name.trim(), phone: phone.trim(), location: location.trim() })}
            className="flex-1 rounded-full bg-brand-500 py-3 text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {saving ? "Adding…" : "Add & select"}
          </button>
        </div>
      </div>
    </div>
  );
}
