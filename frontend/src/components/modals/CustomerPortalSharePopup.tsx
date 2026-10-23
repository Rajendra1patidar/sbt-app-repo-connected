import { useState } from "react";
import { Check, Copy, KeyRound, X } from "lucide-react";
import { api } from "../../lib/api";
import { waLink } from "../../lib/contactLinks";

/**
 * Lets the owner give a customer access to their own account page (ledger + bookings).
 * Generating a PIN replaces any previous one, so it's a deliberate two-step: confirm,
 * then show the link + PIN with one-tap WhatsApp / copy. The PIN is only ever shown here —
 * the server stores just a hash.
 */
export function CustomerPortalSharePopup({ customer, onClose }: { customer: any; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const portalUrl = `${window.location.origin}/booking-status`;
  // The public shop (browse + "Enquire now"). Same phone number + PIN works there too.
  const shopUrl = (import.meta.env.VITE_PORTAL_URL as string | undefined)?.replace(/\/$/, "") || "https://portal-sbt.web.app";
  const message = `Hi ${customer.name}, you can see your account ledger and bookings with us anytime here: ${portalUrl}\nLog in with your phone number and this PIN: ${pin}\n\nYou can also browse our shop and send enquiries here: ${shopUrl} (same number and PIN).`;

  const generate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.customers.regeneratePortalPin(customer.id);
      setPin(res.pin);
    } catch (err: any) {
      setError(err?.message || "Couldn't generate a PIN. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — long-press the text above to copy it.");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-brand-600" />
            <h3 className="font-display text-lg font-bold text-ink">Share account link</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-ink/40"><X size={18} /></button>
        </div>
        <p className="mt-1 text-sm text-ink/50">{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</p>

        {!customer.phone && (
          <p className="mt-3 rounded-xl bg-warn-50 p-3 text-xs font-semibold text-warn-600">
            This customer has no phone number saved. They log in with their phone number, so add one first (Edit customer).
          </p>
        )}

        {!pin ? (
          <>
            <p className="mt-4 text-sm text-ink/70">
              This creates a 4-digit PIN so {customer.name} can open the link and see their own ledger and bookings.
              If they already have a PIN, it stops working.
            </p>
            {error && <p className="mt-3 text-sm font-semibold text-bad-500">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-full border border-line py-2.5 text-sm font-semibold text-ink/50">Cancel</button>
              <button onClick={generate} disabled={loading || !customer.phone}
                className="flex-1 rounded-full bg-brand-500 py-2.5 text-sm font-bold text-white disabled:opacity-50 active:scale-[0.98]">
                {loading ? "Generating…" : "Generate PIN"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 rounded-2xl bg-paper p-4 text-center">
              <p className="text-xs font-semibold text-ink/40">PIN</p>
              <p className="font-display text-3xl font-bold tracking-[0.4em] text-ink">{pin}</p>
            </div>
            <p className="mt-3 break-all rounded-xl border border-line/70 p-3 text-xs text-ink/60">{portalUrl}</p>
            <p className="mt-2 text-xs text-ink/40">Note this PIN down or send it now — it can't be shown again (you can always generate a new one).</p>
            {error && <p className="mt-2 text-sm font-semibold text-bad-500">{error}</p>}
            <div className="mt-4 flex gap-2">
              <a href={customer.phone ? waLink(customer.phone, message) : undefined} target="_blank" rel="noreferrer"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-good-500 py-2.5 text-sm font-bold text-white active:scale-[0.98]">
                Send on WhatsApp
              </a>
              <button onClick={copy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line py-2.5 text-sm font-semibold text-ink/70 active:scale-[0.98]">
                {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
              </button>
            </div>
            <button onClick={onClose} className="mt-3 w-full rounded-full py-2 text-sm font-semibold text-ink/50">Done</button>
          </>
        )}
      </div>
    </div>
  );
}
