import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { CheckIcon, ChevronRightIcon, MinusIcon, PlusIcon, SearchIcon, SparkIcon, CloseIcon } from "./icons";
import { inrParts } from "../../lib/money";

/**
 * Building blocks for the design language ("One language for every screen").
 *
 *   Blue acts, violet suggests. Everything else stays quiet.
 *   Numbers lead: big, light and aligned in columns.
 *   One grouped surface per list, not a stack of cards.
 *   Tasks open as sheets. Pages are for browsing.
 *   Concentric corners (sheet 28 → group 16 → control 12) and 1 px hairlines.
 *   Shadows only on sheets and the capture bar.
 */

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ titles */

export function LargeTitle({ title, subtitle, right, className }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-3 pt-7", className)}>
      <div className="min-w-0">
        <h1 className="truncate text-large text-ink">{title}</h1>
        {subtitle && <p className="text-[14px] leading-5 text-mute">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2 pt-1">{right}</div>}
    </div>
  );
}

/** The small grey label that sits above a group. */
export function GroupLabel({ children, right, className }: { children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-1.5 mt-4 flex items-center justify-between px-1 text-caption text-mute", className)}>
      <span>{children}</span>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------ groups */

/** One grouped surface per list: white, 1 px hairline, 16 px corners. */
export function Group({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("overflow-hidden rounded-group border border-line bg-card", className)} {...rest}>
      {children}
    </div>
  );
}

type RowProps = {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  /** Show a chevron on the right (the row opens something). */
  chevron?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
};

/** A row inside a Group: hairline above every row but the first. */
export function GroupRow({ children, onClick, className, chevron, disabled, ariaLabel }: RowProps) {
  const base = "flex w-full items-center justify-between gap-3 border-t border-line px-4 text-left first:border-t-0";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel}
        className={cx(base, "transition-colors active:bg-paper disabled:opacity-50", className)}>
        <div className="min-w-0 flex-1">{children}</div>
        {chevron && <ChevronRightIcon size={18} className="text-faint" />}
      </button>
    );
  }
  return <div className={cx(base, className)}>{children}</div>;
}

/* ------------------------------------------------------------------ status */

export type ChipTone = "draft" | "due" | "partial" | "paid" | "overdue" | "insight" | "action" | "gain" | "caution" | "risk" | "neutral";

const CHIP_TONES: Record<ChipTone, string> = {
  draft: "bg-chip text-chipText",
  neutral: "bg-chip text-chipText",
  due: "bg-brand-100 text-brand-600",
  action: "bg-brand-100 text-brand-600",
  partial: "bg-warn-50 text-warn-700",
  caution: "bg-warn-50 text-warn-700",
  paid: "bg-good-50 text-good-600",
  gain: "bg-good-50 text-good-600",
  overdue: "bg-bad-100 text-bad-600",
  risk: "bg-bad-100 text-bad-600",
  insight: "bg-insight-100 text-insight-600",
};

/** Status is always a dot and a word. `dot={false}` gives the quieter inline form used inside rows. */
export function StatusChip({ tone, children, dot = true, small, className }: { tone: ChipTone; children: ReactNode; dot?: boolean; small?: boolean; className?: string }) {
  return (
    <span className={cx(
      "inline-flex items-center whitespace-nowrap font-medium",
      small ? "h-5 gap-1.5 rounded-[10px] px-2 text-[11px]" : "h-6 gap-1.5 rounded-[12px] px-2.5 text-[12px]",
      CHIP_TONES[tone], className,
    )}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ controls */

type Opt = string | { value: string; label: string };
const optVal = (o: Opt) => (typeof o === "string" ? o : o.value);
const optLabel = (o: Opt) => (typeof o === "string" ? o : o.label);

/** iOS-style segmented control: 36 px high, white thumb on the fill colour. */
export function Segmented({ options, value, onChange, className, ariaLabel }: { options: Opt[]; value: string; onChange: (v: string) => void; className?: string; ariaLabel?: string }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cx("flex h-9 rounded-[10px] bg-fill p-0.5", className)}>
      {options.map((o) => {
        const active = optVal(o) === value;
        return (
          <button key={optVal(o)} type="button" role="tab" aria-selected={active} onClick={() => onChange(optVal(o))}
            className={cx(
              "flex-1 whitespace-nowrap rounded-lg px-2 text-[13px] transition-colors",
              active ? "bg-card font-semibold text-ink shadow-[0_1px_2px_rgba(22,22,22,.12)]" : "font-medium text-mute",
            )}>
            {optLabel(o)}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder, ariaLabel, className, inputRef }: {
  value: string; onChange: (v: string) => void; placeholder: string; ariaLabel?: string; className?: string; inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className={cx("flex h-10 items-center gap-2 rounded-control bg-fill px-3 text-mute", className)}>
      <SearchIcon size={18} />
      <input ref={inputRef} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel || placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-mute [&::-webkit-search-cancel-button]:hidden" />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="-mr-1 flex h-6 w-6 items-center justify-center rounded-full text-faint active:bg-rule/40">
          <CloseIcon size={14} />
        </button>
      )}
    </label>
  );
}

/** 44 px circle. Solid = the one primary action on a screen; outline = a quiet utility. */
export function RoundButton({ children, label, onClick, variant = "outline", className, size = 44 }: {
  children: ReactNode; label: string; onClick?: () => void; variant?: "solid" | "outline"; className?: string; size?: number;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} style={{ width: size, height: size }}
      className={cx(
        "relative flex shrink-0 items-center justify-center rounded-full transition active:scale-95",
        variant === "solid" ? "bg-brand-500 text-white hover:bg-brand-600" : "border border-line bg-card text-mute",
        className,
      )}>
      {children}
    </button>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { full?: boolean };

/** The one filled action. 52 px in sheets, 48 px when two sit side by side. */
export function PrimaryButton({ children, className, size = "lg", full = true, ...rest }: BtnProps & { size?: "lg" | "md" }) {
  return (
    <button type="button" {...rest}
      className={cx(
        "rounded-[14px] bg-brand-500 font-semibold text-white transition active:scale-[0.985] hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40",
        size === "lg" ? "h-[52px] text-[16px]" : "h-12 text-[15px]",
        full && "w-full", className,
      )}>
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className, size = "md", full = true, ...rest }: BtnProps & { size?: "lg" | "md" }) {
  return (
    <button type="button" {...rest}
      className={cx(
        "rounded-[14px] border border-rule bg-card font-semibold text-brand-500 transition active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-40",
        size === "lg" ? "h-[52px] text-[16px]" : "h-12 text-[15px]",
        full && "w-full", className,
      )}>
      {children}
    </button>
  );
}

/** A plain text action — "Record payment", "Cancel". */
export function TextButton({ children, className, tone = "action", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "action" | "insight" | "risk" | "quiet" }) {
  const color = tone === "insight" ? "text-insight-600" : tone === "risk" ? "text-bad-500" : tone === "quiet" ? "text-mute" : "text-brand-500";
  return (
    <button type="button" {...rest} className={cx("h-11 text-[16px] font-medium transition-opacity active:opacity-60 disabled:opacity-40", color, className)}>
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label, tone = "action" }: { checked: boolean; onChange: (v: boolean) => void; label: string; tone?: "action" | "insight" }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx("relative h-[31px] w-[51px] shrink-0 rounded-[16px] transition-colors duration-150", checked ? (tone === "insight" ? "bg-insight-500" : "bg-brand-500") : "bg-rule")}>
      <span className={cx("absolute top-0.5 h-[27px] w-[27px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-all duration-150", checked ? "right-0.5" : "left-0.5")} />
    </button>
  );
}

/** − 5 + with a tappable number, so a quantity can be typed as well as nudged. */
export function Stepper({ value, onChange, label, step = 1, min = 0, max, decimals = false }: {
  value: number | string; onChange: (v: string) => void; label: string; step?: number; min?: number; max?: number; decimals?: boolean;
}) {
  const num = Number(value) || 0;
  const bump = (d: number) => {
    let next = Math.round((num + d) * 1000) / 1000;
    if (next < min) next = min;
    if (max != null && next > max) next = max;
    onChange(String(next));
  };
  const text = String(value ?? "");
  return (
    <div className="inline-flex h-9 items-center rounded-full bg-paper">
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => bump(-step)} className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-rule/40">
        <MinusIcon size={16} />
      </button>
      <input
        value={text} inputMode={decimals ? "decimal" : "numeric"} aria-label={`${label} quantity`}
        onChange={(e) => {
          const v = e.target.value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, "");
          onChange(v);
        }}
        onFocus={(e) => e.target.select()}
        style={{ width: `${Math.max(2, text.length) + 0.4}ch` }}
        className="min-w-[28px] bg-transparent text-center text-[16px] font-semibold tabular-nums text-ink outline-none"
      />
      <button type="button" aria-label={`Increase ${label}`} onClick={() => bump(step)} className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-rule/40">
        <PlusIcon size={16} />
      </button>
    </div>
  );
}

/** A suggestion that adds something: + Saria 10mm, + Freight. */
export function Pill({ children, onClick, className, active }: { children: ReactNode; onClick?: () => void; className?: string; active?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[14px] font-medium transition active:scale-[0.97]",
        active ? "border-brand-500 bg-brand-50 text-brand-600" : "border-edge bg-card text-ink",
        className,
      )}>
      {active ? <CheckIcon size={16} className="text-brand-500" /> : <PlusIcon size={16} className="text-brand-500" />}
      {children}
    </button>
  );
}

/** Violet = the app suggesting something. Always with the spark. */
export function InsightNote({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={cx("flex w-full items-start gap-2 rounded-control bg-insight-50 px-3 py-[10px] text-left text-[14px] leading-[19px] text-insight-600", className)}>
      <SparkIcon size={16} className="mt-[1.5px]" />
      <span className="min-w-0 flex-1">{children}</span>
    </Tag>
  );
}

export function Avatar({ name, size = 40, className }: { name?: string; size?: number; className?: string }) {
  const text = (name || "?").trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span style={{ width: size, height: size, fontSize: Math.round(size * 0.375) }}
      className={cx("flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-600", className)}>
      {text}
    </span>
  );
}

/* ------------------------------------------------------------------ numbers */

/** A hero number: big, light, tabular. The paise sit quieter beside it. */
export function HeroMoney({ value, currency = "₹", size = "hero", className, showPaise = true }: { value: number; currency?: string; size?: "hero" | "md" | "sm"; className?: string; showPaise?: boolean }) {
  const { sign, whole, paise } = inrParts(value, currency);
  const main = size === "hero" ? "text-hero" : size === "md" ? "text-hero-md" : "text-hero-sm";
  const sub = size === "hero" ? "text-[32px]" : size === "md" ? "text-[24px]" : "text-[18px]";
  return (
    <div className={cx("tabular-nums text-ink", main, className)}>
      {sign}{whole}{showPaise && <span className={cx(sub, "font-light text-faint")}>{paise}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ fields */

export const fieldClass = "h-11 w-full rounded-control border-0 bg-paper px-3 text-[16px] tabular-nums text-ink outline-none placeholder:text-faint focus:ring-2 focus:ring-brand-500/40";

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-micro text-mute">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-micro text-mute">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldClass, props.className)} />;
}

/* ------------------------------------------------------------------ sheets */

/**
 * Tasks open as sheets. A bottom sheet on phones (28 px top corners, grabber),
 * a centred sheet on larger screens. The footer stays pinned; the body scrolls.
 */
export function Sheet({ onClose, children, footer, label, title, trailing, tall, className, z = 50, canvas }: {
  onClose: () => void; children: ReactNode; footer?: ReactNode; label?: string;
  /** Large heading inside the sheet, with an optional trailing action ("Done"). */
  title?: ReactNode; trailing?: ReactNode; tall?: boolean; className?: string; z?: number;
  /** Sit on the Canvas colour instead of white, so white groups inside stand out (Add item, pickers). */
  canvas?: boolean;
}) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 flex items-end justify-center animate-fade-in md:items-center md:p-6" style={{ zIndex: z, background: "var(--scrim)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined} aria-label={title ? undefined : label}
        className={cx(
          "sheet-grab animate-sheet-up flex w-full max-w-[520px] flex-col rounded-t-sheet shadow-sheet md:rounded-sheet",
          canvas ? "bg-paper" : "bg-card",
          tall ? "h-[92vh]" : "max-h-[92vh]", className,
        )}
      >
        {title != null && (
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-[29px]">
            <h2 id={id} className="min-w-0 truncate text-[28px] font-semibold leading-[34px] tracking-[-0.02em] text-ink">{title}</h2>
            {trailing}
          </div>
        )}
        <div className={cx("min-h-0 flex-1 overflow-y-auto px-5", title == null && "pt-[29px]")}>{children}</div>
        {footer && <div className="px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3">{footer}</div>}
        {!footer && <div className="h-[calc(20px+env(safe-area-inset-bottom))] shrink-0" />}
      </div>
    </div>
  );
}

/** A full-screen task (the estimate form) that is still a sheet: slides up on phones, centred on desktop. */
export function FullSheet({ children, onClose, z = 50, label }: { children: ReactNode; onClose?: () => void; z?: number; label: string }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div
      className="fixed inset-0 flex justify-center bg-paper animate-sheet-up md:animate-fade-in md:items-center md:bg-[var(--scrim)] md:p-6"
      style={{ zIndex: z }} role="dialog" aria-modal="true" aria-label={label}
      onMouseDown={(e) => { if (onClose && e.target === e.currentTarget && window.matchMedia("(min-width: 768px)").matches) onClose(); }}
    >
      <div className="relative flex h-full w-full max-w-[520px] flex-col overflow-hidden bg-paper md:h-[min(860px,100%)] md:rounded-sheet md:shadow-sheet">{children}</div>
    </div>
  );
}

/** The blurred bar pinned to the bottom of a screen or sheet (tab bar, form total). */
export function GlassBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("border-t border-line backdrop-blur-[20px] backdrop-saturate-[1.8]", className)} style={{ background: "var(--glass)" }}>
      {children}
    </div>
  );
}
