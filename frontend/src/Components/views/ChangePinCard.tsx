import React, { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { api } from "../../lib/api";
import { Card } from "../common/UIPrimitives";

/* ---- Settings ---- */

export function ChangePinCard() {
  const [mode, setMode] = useState<"idle"|"current"|"new"|"confirm">("idle");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{text:string;ok:boolean}|null>(null);
  const [saving, setSaving] = useState(false);
  const MAX = 4;

  const inputCls = "w-full rounded-xl border border-line px-3 py-2.5 text-sm tracking-[0.4em] text-center font-bold";

  const handleCurrent = () => {
    if (cur.length < MAX) return;
    setMsg(null); setMode("new");
  };
  const handleNew = () => {
    if (next.length < MAX) return;
    setMsg(null); setMode("confirm");
  };
  const handleConfirm = async (val: string) => {
    if (val.length < MAX) return;
    if (val !== next) { setMsg({ text: "PINs don't match. Try again.", ok: false }); setNext(""); setMode("new"); return; }
    setSaving(true);
    try {
      await api.auth.changePin(cur, val);
      setMsg({ text: "PIN changed successfully!", ok: true });
      setCur(""); setNext(""); setMode("idle");
    } catch (err: any) {
      setMsg({ text: err?.message || "Current PIN is incorrect.", ok: false });
      setCur(""); setNext(""); setMode("current");
    } finally {
      setSaving(false);
    }
  };

  const numOnly = (v: string) => v.replace(/\D/g, "").slice(0, MAX);

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-paper flex items-center justify-center"><SettingsIcon size={14} className="text-ink/70" /></div>
        <h3 className="text-sm font-bold text-ink">Change PIN</h3>
      </div>
      {msg && <p className={`rounded-xl px-3 py-2 text-xs font-semibold ${msg.ok ? "bg-good-50 text-good-700" : "bg-bad-50 text-bad-600"}`}>{msg.text}</p>}

      {mode === "idle" && (
        <button onClick={() => { setMode("current"); setMsg(null); }}
          className="w-full rounded-xl border border-line py-2.5 text-sm font-semibold text-ink/80 hover:bg-paper transition">
          Change my PIN
        </button>
      )}
      {mode === "current" && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-ink/50">Enter current PIN</label>
          <input type="password" inputMode="numeric" maxLength={MAX} value={cur} onChange={(e) => setCur(numOnly(e.target.value))} placeholder="••••" className={inputCls} />
          <div className="flex gap-2">
            <button onClick={() => setMode("idle")} className="flex-1 rounded-xl border border-line py-2 text-sm text-ink/50">Cancel</button>
            <button disabled={cur.length < MAX} onClick={handleCurrent} className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
      {mode === "new" && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-ink/50">Enter new PIN</label>
          <input type="password" inputMode="numeric" maxLength={MAX} value={next} onChange={(e) => setNext(numOnly(e.target.value))} placeholder="••••" className={inputCls} autoFocus />
          <div className="flex gap-2">
            <button onClick={() => setMode("idle")} className="flex-1 rounded-xl border border-line py-2 text-sm text-ink/50">Cancel</button>
            <button disabled={next.length < MAX} onClick={handleNew} className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
      {mode === "confirm" && (
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-ink/50">Confirm new PIN</label>
          <input type="password" inputMode="numeric" maxLength={MAX} placeholder="••••" className={inputCls} autoFocus
            onChange={(e) => { const v = numOnly(e.target.value); if (v.length === MAX) handleConfirm(v); }} />
          <button onClick={() => setMode("idle")} className="w-full rounded-xl border border-line py-2 text-sm text-ink/50">Cancel</button>
        </div>
      )}
    </Card>
  );
}
