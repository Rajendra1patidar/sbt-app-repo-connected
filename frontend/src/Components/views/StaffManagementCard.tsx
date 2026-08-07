import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { api } from "../../lib/api";
import { Card } from "../common/UIPrimitives";

/* ---- Staff accounts: create/list/remove logins that share the owner's business data ---- */

export function StaffManagementCard() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerOnly, setOwnerOnly] = useState(false); // true if a staff account is viewing this (backend blocks it)
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", pin: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    api.staff
      .list()
      .then(setStaff)
      .catch((err: any) => setOwnerOnly(err?.status === 403))
      .finally(() => setLoading(false));
  }, []);

  const numOnly = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  const addStaff = async () => {
    setError("");
    if (!form.email.trim()) { setError("Email is required"); return; }
    if (form.pin.length < 4) { setError("PIN must be at least 4 digits"); return; }
    setSaving(true);
    try {
      const created = await api.staff.create({ email: form.email.trim(), pin: form.pin, name: form.name.trim() || undefined });
      setStaff((s) => [...s, created]);
      setForm({ name: "", email: "", pin: "" });
      setAdding(false);
    } catch (err: any) {
      setError(err?.message || "Couldn't create that staff account");
    } finally {
      setSaving(false);
    }
  };

  const removeStaffAccount = async (id: string) => {
    setRemovingId(id);
    try {
      await api.staff.remove(id);
      setStaff((s) => s.filter((m) => m.id !== id));
    } catch (err: any) {
      setError(err?.message || "Couldn't remove that account");
    } finally {
      setRemovingId(null);
    }
  };

  // A staff login can't create other staff — that's enforced server-side,
  // this just avoids showing them a form that would only 403.
  if (ownerOnly) {
    return (
      <Card className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-paper"><Users size={14} className="text-ink/70" /></div>
          <h3 className="text-sm font-bold text-ink">Staff accounts</h3>
        </div>
        <p className="text-xs text-ink/40">Only the business owner can manage staff accounts.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-paper"><Users size={14} className="text-ink/70" /></div>
        <h3 className="text-sm font-bold text-ink">Staff accounts</h3>
      </div>
      <p className="text-xs text-ink/40">
        Staff log in on their own and see your business data, scoped the same way yours is. A large manual purchase
        they create above your approval limit (below) waits for your review instead of going through right away.
      </p>

      {loading ? (
        <p className="text-xs text-ink/40">Loading…</p>
      ) : (
        staff.length > 0 && (
          <div className="space-y-1.5">
            {staff.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-xl bg-paper px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{m.name || m.email}</p>
                  <p className="truncate text-xs text-ink/40">{m.email}</p>
                </div>
                <button
                  onClick={() => removeStaffAccount(m.id)}
                  disabled={removingId === m.id}
                  className="rounded-full p-1.5 text-ink/30 hover:text-bad-500 disabled:opacity-40"
                >
                  {removingId === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {error && <p className="rounded-xl bg-bad-50 px-3 py-2 text-xs font-semibold text-bad-600">{error}</p>}

      {adding ? (
        <div className="space-y-2">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name (optional)"
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
          />
          <input
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="Email"
            type="email"
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
          />
          <input
            value={form.pin}
            onChange={(e) => setForm((f) => ({ ...f, pin: numOnly(e.target.value) }))}
            placeholder="4-6 digit PIN"
            inputMode="numeric"
            type="password"
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
          />
          <div className="flex gap-2">
            <button onClick={() => { setAdding(false); setError(""); }} className="flex-1 rounded-xl border border-line py-2 text-sm text-ink/50">
              Cancel
            </button>
            <button
              onClick={addStaff}
              disabled={saving}
              className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="mx-auto animate-spin" /> : "Add"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-line py-2.5 text-sm font-semibold text-ink/80 transition hover:bg-paper"
        >
          <Plus size={14} /> Add staff account
        </button>
      )}
    </Card>
  );
}
