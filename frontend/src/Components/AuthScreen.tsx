import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../lib/api";

export function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (mode === "forgot") {
      if (!email) { setError("Enter the email on your account"); return; }
      setBusy(true);
      try {
        await api.auth.forgotPin(email.trim());
        setNotice("If that email has an account, we've sent a reset code to it.");
        setMode("reset");
      } catch (err: any) {
        setError(err.message || "Something went wrong");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (mode === "reset") {
      if (!email || !resetToken || !newPin) { setError("Email, reset code, and new PIN are all required"); return; }
      setBusy(true);
      try {
        await api.auth.resetPin(email.trim(), resetToken.trim(), newPin);
        setNotice("PIN reset — you can sign in with your new PIN now.");
        setMode("login");
        setPin("");
        setResetToken("");
        setNewPin("");
      } catch (err: any) {
        setError(err.message || "Something went wrong");
      } finally {
        setBusy(false);
      }
      return;
    }

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
            {mode === "login" ? "Sign in"
              : mode === "register" ? "Create your account"
              : mode === "forgot" ? "Reset your PIN"
              : "Enter your reset code"}
          </h1>
          <p className="text-sm text-ink/40">
            {mode === "forgot" ? "We'll email you a code to reset your PIN."
              : mode === "reset" ? "Check your email for the code we sent."
              : "Shree Balaji Traders"}
          </p>
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
        {(mode === "login" || mode === "register") && (
          <input
            className="mb-4 w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
            placeholder="PIN (4+ digits)"
            type="password"
            inputMode="numeric"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        )}
        {mode === "reset" && (
          <>
            <input
              className="mb-3 w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
              placeholder="Reset code from your email"
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
            />
            <input
              className="mb-4 w-full rounded-xl border border-line bg-paper/60 px-4 py-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all"
              placeholder="New PIN (4+ digits)"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
            />
          </>
        )}

        {notice && <p className="mb-3 text-sm font-medium text-good-500">{notice}</p>}
        {error && <p className="mb-3 text-sm font-medium text-bad-500">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-pill bg-brand-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy
            ? "Please wait…"
            : mode === "login" ? "Sign in"
            : mode === "register" ? "Create account"
            : mode === "forgot" ? "Send reset code"
            : "Reset PIN"}
        </button>

        {mode === "login" && (
          <button
            type="button"
            className="mt-3 w-full text-center text-xs font-medium text-ink/50 hover:text-brand-500 transition-colors"
            onClick={() => { setMode("forgot"); setError(""); setNotice(""); }}
          >
            Forgot your PIN?
          </button>
        )}

        <button
          type="button"
          className="mt-4 w-full text-center text-xs font-medium text-ink/50 hover:text-brand-500 transition-colors"
          onClick={() => {
            setError("");
            setNotice("");
            if (mode === "login") setMode("register");
            else setMode("login");
          }}
        >
          {mode === "login" ? "First time here? Create an account"
            : mode === "register" ? "Already have an account? Sign in"
            : "Back to sign in"}
        </button>
      </form>
    </div>
  );
}
