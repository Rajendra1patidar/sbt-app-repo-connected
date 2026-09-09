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
      className={`inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-paper hover:border-brand-200 active:scale-[0.97] transition-all duration-150 ${className}`}>
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

/** A compact single-select control — used in place of a native <select> wherever
 * there are just a handful of mutually-exclusive options (e.g. an estimate's
 * status), since it reads as a deliberate choice instead of unstyled browser chrome. */
export function SegmentedControl({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-pill bg-paper p-1">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex-1 whitespace-nowrap rounded-pill px-2 py-1.5 text-[11px] font-semibold transition ${value === opt ? "bg-ink text-white" : "text-ink/60"}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/** iOS-style on/off toggle for boolean settings inside sheets/modals. */
export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-pill transition-colors duration-150 ${checked ? "bg-ink" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

export function Card({ children, className = "", onClick }: any) {
  return (
    <div onClick={onClick}
      className={`rounded-card bg-card p-5 shadow-card border border-line/70 transition-all duration-150 ${onClick ? "cursor-pointer hover:border-brand-200 active:scale-[0.995]" : ""} ${className}`}>
      {children}
    </div>
  );
}
