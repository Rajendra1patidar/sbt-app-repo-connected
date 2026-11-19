import { MessageSquare, Phone, Plus } from "lucide-react";
import { WHATSAPP_GREEN } from "../../lib/constants";
import { Segmented, StatusChip, Switch as KitSwitch, type ChipTone } from "../ui/kit";
import { smsLink, waLink } from "../../lib/contactLinks";

/* ---- atoms ---- */

export function PillButton({ children, onClick, className = "", disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-[14px] bg-brand-500 px-5 py-3 text-[15px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-600 active:scale-[0.98] transition-all duration-150 ${className}`}>
      {children}
    </button>
  );
}

export function GhostButton({ children, onClick, className = "" }: any) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-control border border-rule bg-card px-3 py-1.5 text-[13px] font-medium text-brand-600 active:scale-[0.97] transition-all duration-150 ${className}`}>
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

const BADGE_TONE: Record<string, { tone: ChipTone; label?: string }> = {
  Draft: { tone: "draft" },
  Sent: { tone: "due" },
  Accepted: { tone: "due" },
  Due: { tone: "due" },
  "Partially Paid": { tone: "partial", label: "Part paid" },
  "Part paid": { tone: "partial" },
  Paid: { tone: "paid" },
  Overdue: { tone: "overdue" },
  Pending: { tone: "partial" },
  Delivered: { tone: "paid" },
  Received: { tone: "paid" },
};

/** Status is always a dot and a word. */
export function Badge({ status }: any) {
  const m = BADGE_TONE[status] || { tone: "neutral" as ChipTone };
  return <StatusChip tone={m.tone}>{m.label || status}</StatusChip>;
}

export function EmptyState({ text, cta, onCta }: any) {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-mute text-sm max-w-xs">{text}</p>
      {cta && <PillButton onClick={onCta}><Plus size={16} /> {cta}</PillButton>}
    </div>
  );
}

/** A compact single-select control — used in place of a native <select> wherever
 * there are just a handful of mutually-exclusive options (e.g. an estimate's
 * status). Same iOS-style segmented control as the rest of the app. */
export function SegmentedControl({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return <Segmented options={options} value={value} onChange={onChange} />;
}

/** iOS-style on/off toggle for boolean settings inside sheets/modals. */
export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <KitSwitch checked={checked} onChange={onChange} label="Toggle" />;
}

export function Card({ children, className = "", onClick }: any) {
  return (
    <div onClick={onClick}
      className={`rounded-group bg-card p-5 border border-line transition-colors duration-150 ${onClick ? "cursor-pointer active:bg-paper" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** A borderless list row separated by a hairline divider instead of its own
 * boxed card — used on pages redesigned to read as one continuous surface
 * (Items, Inventory, Orders, Purchases, Godowns) rather than a stack of
 * individual cards. First row in a list has no divider above it. */
export function Row({ children, className = "", onClick }: any) {
  return (
    <div onClick={onClick}
      className={`border-t border-line/70 py-3 first:border-t-0 first:pt-0 transition-colors duration-150 ${onClick ? "cursor-pointer active:bg-paper/50" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** A full-bleed hairline used to separate major sections on a seamless page
 * (in place of stacking each section in its own bordered Card). */
export function SectionDivider({ className = "" }: any) {
  return <div className={`h-px bg-line/70 ${className}`} />;
}

/** Switches between two or three views on a page — the same segmented control
 * used everywhere else (was underline-style tabs before the design update). */
export function UnderlineTabs({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return <Segmented options={options.map((o) => ({ value: o.key, label: o.label }))} value={value} onChange={onChange} />;
}

/** A row of numbers separated by thin vertical rules instead of individual
 * stat cards — e.g. Stock value / Items tracked / Low stock / Dead stock.
 * Fixed at 2 columns to match this app's mobile-first list pages. */
export function StatStrip({ stats }: { stats: { label: string; value: React.ReactNode; tone?: "warn" | "bad" | "default" }[] }) {
  const toneClass = (tone?: string) => tone === "warn" ? "text-warn-700" : tone === "bad" ? "text-bad-600" : "text-ink";
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-group border border-line bg-card">
      {stats.map((s, i) => (
        <div key={s.label} className={`px-4 py-3 ${i % 2 === 1 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line" : ""}`}>
          <p className="text-micro text-mute">{s.label}</p>
          <p className={`mt-0.5 text-lead font-medium tabular-nums ${toneClass(s.tone)}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}
