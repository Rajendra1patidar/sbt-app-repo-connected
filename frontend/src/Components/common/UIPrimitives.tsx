import { MessageSquare, Phone, Plus } from "lucide-react";
import { STATUS_STYLES, WHATSAPP_GREEN } from "../../lib/constants";
import { smsLink, waLink } from "../../lib/contactLinks";

/* ---- atoms ---- */

export function PillButton({ children, onClick, className = "", disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-600 active:scale-[0.97] transition-all duration-150 ${className}`}>
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, className = "" }: any) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-pill border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-paper hover:border-brand-200 active:scale-[0.97] transition-all duration-150 ${className}`}>
      {children}
    </button>
  );
}

export function WhatsAppButton({ phone, message, label = "WhatsApp", compact = false }: any) {
  const enabled = !!phone;
  if (compact) {
    return (
      <a href={enabled ? waLink(phone, message) : undefined} target="_blank" rel="noreferrer"
        onClick={(e) => !enabled && e.preventDefault()}
        aria-label={label}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition ${enabled ? "active:scale-[0.94]" : "opacity-40 cursor-not-allowed"}`}
        style={{ backgroundColor: WHATSAPP_GREEN }}>
        <Phone size={15} />
      </a>
    );
  }
  return (
    <a href={enabled ? waLink(phone, message) : undefined} target="_blank" rel="noreferrer"
      onClick={(e) => !enabled && e.preventDefault()}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition ${enabled ? "active:scale-[0.98]" : "opacity-40 cursor-not-allowed"}`}
      style={{ backgroundColor: WHATSAPP_GREEN }}>
      <Phone size={13} /> {label}
    </a>
  );
}

export function SmsButton({ phone, message, label = "SMS", compact = false }: any) {
  const enabled = !!phone;
  if (compact) {
    return (
      <a href={enabled ? smsLink(phone, message) : undefined}
        onClick={(e) => !enabled && e.preventDefault()}
        aria-label={label}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition ${enabled ? "active:scale-[0.94]" : "opacity-40 cursor-not-allowed"}`}
        style={{ backgroundColor: "#4f46e5" }}>
        <MessageSquare size={15} />
      </a>
    );
  }
  return (
    <a href={enabled ? smsLink(phone, message) : undefined}
      onClick={(e) => !enabled && e.preventDefault()}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white transition ${enabled ? "active:scale-[0.98]" : "opacity-40 cursor-not-allowed"}`}
      style={{ backgroundColor: "#4f46e5" }}>
      <MessageSquare size={13} /> {label}
    </a>
  );
}

export function Badge({ status }: any) {
  return <span className={`rounded-pill px-2.5 py-1 text-xs font-semibold tracking-tight ${STATUS_STYLES[status] || "bg-ink/5 text-ink/60"}`}>{status}</span>;
}

export function EmptyState({ text, cta, onCta }: any) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-ink/50 text-sm max-w-xs">{text}</p>
      {cta && <PillButton onClick={onCta}><Plus size={16} /> {cta}</PillButton>}
    </div>
  );
}

export function Card({ children, className = "", onClick }: any) {
  return (
    <div onClick={onClick}
      className={`rounded-card bg-white p-5 shadow-card border border-line/70 transition-all duration-150 ${onClick ? "cursor-pointer hover:border-brand-200 active:scale-[0.995]" : ""} ${className}`}>
      {children}
    </div>
  );
}
