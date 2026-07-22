import React, { useState } from "react";
import { Phone } from "lucide-react";
import { Card, PillButton } from "../common/UIPrimitives";
import { ChangePinCard } from "./ChangePinCard";
import { WHATSAPP_GREEN } from "../../lib/constants";

export function SettingsView({ settings, setSettings }: any) {
  const [local, setLocal] = useState(settings);
  const set = (k: string, v: any) => setLocal((s: any) => ({ ...s, [k]: v }));
  const dirty = JSON.stringify(local) !== JSON.stringify(settings);
  return (
    <div className="space-y-4 px-5 pb-28">
      <Card className="space-y-4">
        {[["orgName","Organization name","Acme Ltd."],["ownerName","Your name",""],["email","Address / Email","Address or email"]].map(([k,l,p]) => (
          <div key={k}><label className="mb-1 block text-xs font-semibold text-ink/50">{l}</label>
          <input value={(local as any)[k]} onChange={(e) => set(k, e.target.value)} placeholder={p} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" /></div>
        ))}
        <div><label className="mb-1 block text-xs font-semibold text-ink/50">Currency symbol</label>
        <select value={local.currency} onChange={(e) => set("currency", e.target.value)} className="w-full rounded-xl border border-line px-3 py-2.5 text-sm">
          {["₹","$","€","£"].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      </Card>
      <Card className="space-y-3">
        <div className="flex items-center gap-2"><Phone size={16} style={{ color: WHATSAPP_GREEN }} /><h3 className="text-sm font-bold text-ink">WhatsApp integration</h3></div>
        <div><label className="mb-1 block text-xs font-semibold text-ink/50">Business WhatsApp number (with country code)</label>
        <input value={local.businessWhatsApp} onChange={(e) => set("businessWhatsApp", e.target.value)} placeholder="+91 98765 43210" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" /></div>
      </Card>
      <ChangePinCard />
      <PillButton disabled={!dirty} onClick={() => setSettings(local)} className="w-full justify-center">Save changes</PillButton>
    </div>
  );
}
