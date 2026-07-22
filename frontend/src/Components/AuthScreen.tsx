import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../lib/api";

export function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !pin) { setError("Email and PIN are required"); return; }
    setBusy(true);
    try {
      const res: any = mode === "login"
        ? await api.auth.login(email.trim(), pin)
        : await api.auth.register(email.trim(), pin, name.trim());
      api.setToken(res.token);
      onAuthed();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-paper px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-card bg-white p-7 shadow-card border border-line/70">
        <div className="mb-5 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 font-display text-lg font-semibold text-white">SBT</div>
          <h1 className="font-display text-xl font-semibold text-ink">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="text-sm text-ink/40">Shree Balaji Traders</p>
        </div>

        {mode === "register" && (
          <input
            className="mb-3 w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          className="mb-3 w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
          placeholder="Email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="mb-4 w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
          placeholder="PIN (4+ digits)"
          type="password"
          inputMode="numeric"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />

        {error && <p className="mb-3 text-sm font-medium text-bad-500">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-pill bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        <button
          type="button"
          className="mt-4 w-full text-center text-xs font-medium text-ink/50 hover:text-brand-500 transition-colors"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
        >
          {mode === "login" ? "First time here? Create an account" : "Already have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
