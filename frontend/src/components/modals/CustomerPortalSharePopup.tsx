import { useState } from "react";
import { api } from "../../lib/api";
import { confirm } from "../../lib/confirm";
import { waLink } from "../../lib/contactLinks";
import { PORTAL_URL, portalAccessMessage } from "../../lib/portalAccess";
import { CheckIcon, CopyIcon, WhatsAppIcon } from "../ui/icons";
import { PrimaryButton, SecondaryButton, Sheet, TextButton } from "../ui/kit";

/**
 * Lets the owner give a customer access to their own account page (ledger + bookings).
 * Generating a PIN replaces any previous one, so it's a deliberate two-step: confirm,
 * then show the link + PIN with one-tap WhatsApp / copy. The PIN is only ever shown here —
 * the server stores just a hash. So closing the sheet after a PIN is made but before it was sent
 * or copied asks first (a swipe or a tap outside would otherwise lose it).
 */
export function CustomerPortalSharePopup({ customer, onClose }: { customer: any; onClose: () => void }) {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [handedOver, setHandedOver] = useState(false); // sent on WhatsApp or copied: the PIN is safe

  const message = portalAccessMessage(customer.name, pin);

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
      setHandedOver(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Long-press the link above to copy it.");
    }
  };

  const attemptClose = async () => {
    if (pin && !handedOver) {
      const leave = await confirm({
        title: "Close without sending?", message: "This PIN can't be shown again. You can always make a new one.",
        confirmLabel: "Close", cancelLabel: "Stay", tone: "danger",
      });
      if (!leave) return;
    }
    onClose();
  };

  return (
    <Sheet
      z={60} onClose={attemptClose} title="Account link"
      trailing={<TextButton tone="quiet" onClick={attemptClose} className="-mr-1 shrink-0 px-1">{pin ? "Done" : "Cancel"}</TextButton>}
      footer={!pin ? (
        <PrimaryButton onClick={generate} disabled={loading || !customer.phone}>{loading ? "Generating…" : "Generate PIN"}</PrimaryButton>
      ) : (
        <div className="flex flex-col gap-2">
          <a href={customer.phone ? waLink(customer.phone, message) : undefined} target="_blank" rel="noreferrer" onClick={() => setHandedOver(true)}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-brand-500 text-[16px] font-semibold text-white transition active:scale-[0.985]">
            <WhatsAppIcon size={20} /> Send on WhatsApp
          </a>
          <SecondaryButton size="lg" onClick={copy}>
            <span className="inline-flex items-center justify-center gap-2">{copied ? <><CheckIcon size={18} /> Copied</> : <><CopyIcon size={18} /> Copy message</>}</span>
          </SecondaryButton>
        </div>
      )}
    >
      <p className="text-[16px] font-medium text-ink">{customer.name}</p>
      <p className="text-caption text-mute">{customer.phone || "No phone number saved"}</p>

      {!customer.phone && (
        <p className="mt-3 rounded-control bg-warn-50 px-3 py-2.5 text-[14px] leading-[19px] text-warn-700">
          This customer has no phone number saved. They log in with their phone number, so add one first (Edit customer).
        </p>
      )}

      {!pin ? (
        <>
          <p className="mt-4 text-[16px] leading-6 text-mute">
            This creates a 4-digit PIN so {customer.name} can open the link and see their own ledger and bookings. If they already have a PIN, it stops working.
          </p>
          {error && <p className="mt-3 text-[14px] font-medium text-bad-600">{error}</p>}
        </>
      ) : (
        <>
          <div className="mt-4 rounded-group bg-paper px-4 py-4 text-center">
            <p className="text-micro text-mute">PIN</p>
            <p className="text-[40px] font-semibold leading-[48px] tracking-[0.4em] tabular-nums text-ink">{pin}</p>
          </div>
          <p className="mt-3 break-all text-caption text-mute">{PORTAL_URL}</p>
          <p className="mt-2 text-caption text-mute">Note this PIN down or send it now: it can't be shown again (you can always generate a new one).</p>
          {error && <p className="mt-2 text-[14px] font-medium text-bad-600">{error}</p>}
        </>
      )}
      <div className="h-3" />
    </Sheet>
  );
}
