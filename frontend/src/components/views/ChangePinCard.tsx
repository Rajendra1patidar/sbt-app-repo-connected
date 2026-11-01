import React, { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { api } from "../../lib/api";
import { Card } from "../common/UIPrimitives";

/* ---- Settings ---- */

// A new PIN is 4 to 6 digits. The current PIN field is more forgiving (up to 12
// digits) because it only has to match whatever the PIN already is.
const MIN = 4;
const MAX = 6;
const CURRENT_MAX = 12;

export function ChangePinCard() {
  const [mode, setMode] = useState<"idle"|"current"|"new"|"confirm">("idle");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<{text:string;ok:boolean}|null>(null);
  const [saving, setSaving] = useState(false);

  const inputCls = "w-full rounded-xl border border-line px-3 py-2.5 text-sm tracking-[0.4em] text-center font-bold";
  const numOnly = (v: string, max: number) => v.replace(/\D/g, "").slice(0, max);
  const reset = () => { setCur(""); setNext(""); setAgain(""); };

  const handleConfirm = async () => {
    if (again.length < MIN) return;
    if (again !== next) { setMsg({ text: "PINs don't match. Try again.", ok: false }); setNext(""); setAgain(""); setMode("new"); return; }
    setSaving(true);
    try {
      const res: any = await api.auth.changePin(cur, again);
      // Changing the PIN signs out every other device. This one gets a fresh
      // token back so the person changing it stays signed in.
      if (res?.token) api.setToken(res.token);
      setMsg({ text: "PIN changed. Other devices will need the new PIN.", ok: true });
      reset(); setMode("idle");
    } catch (err: any) {
      setMsg({ text: err?.message || "Current PIN is incorrect.", ok: false });
      reset(); setMode("current");
    } finally {
      setSaving(false);
    }
  };

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
          <label htmlFor="pin-current" className="block text-xs font-semibold text-ink/50">Enter current PIN</label>
          <input id="pin-current" type="password" inputMode="numeric" maxLength={CURRENT_MAX} value={cur} onChange={(e) => setCur(numOnly(e.target.value, CURRENT_MAX))} placeholder="••••" className={inputCls} autoFocus />
          <div className="flex gap-2">
            <button onClick={() => { reset(); setMode("idle"); }} className="flex-1 rounded-xl border border-line py-2 text-sm text-ink/50">Cancel</button>
            <button disabled={cur.length < MIN} onClick={() => { setMsg(null); setMode("new"); }} className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
      {mode === "new" && (
        <div className="space-y-2">
          <label htmlFor="pin-new" className="block text-xs font-semibold text-ink/50">Enter new PIN ({MIN} to {MAX} digits)</label>
          <input id="pin-new" type="password" inputMode="numeric" maxLength={MAX} value={next} onChange={(e) => setNext(numOnly(e.target.value, MAX))} placeholder="••••" className={inputCls} autoFocus />
          <div className="flex gap-2">
            <button onClick={() => { reset(); setMode("idle"); }} className="flex-1 rounded-xl border border-line py-2 text-sm text-ink/50">Cancel</button>
            <button disabled={next.length < MIN} onClick={() => { setMsg(null); setMode("confirm"); }} className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
      {mode === "confirm" && (
        <div className="space-y-2">
          <label htmlFor="pin-confirm" className="block text-xs font-semibold text-ink/50">Enter the new PIN again</label>
          <input id="pin-confirm" type="password" inputMode="numeric" maxLength={MAX} value={again} onChange={(e) => setAgain(numOnly(e.target.value, MAX))} placeholder="••••" className={inputCls} autoFocus />
          <div className="flex gap-2">
            <button onClick={() => { reset(); setMode("idle"); }} className="flex-1 rounded-xl border border-line py-2 text-sm text-ink/50">Cancel</button>
            <button disabled={again.length < MIN || saving} onClick={handleConfirm} className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Saving…" : "Save PIN"}</button>
          </div>
        </div>
      )}
    </Card>
  );
}
