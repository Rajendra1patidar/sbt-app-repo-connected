import { useRef, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { PrimaryButton, Sheet, TextButton, cx, fieldClass } from "./kit";
import { ChevronDownIcon } from "./icons";
import { confirm } from "../../lib/confirm";

/**
 * Parts shared by the screens that moved onto the design language after the kit itself:
 * forms inside a sheet, an action list, an action tile, a detail row and an empty note.
 * Written once so the remaining screens (Stock, Money, Team) reuse them instead of
 * hand-building another pop-up.
 */

/* ------------------------------------------------------------------ forms */

/** A native select with the app's field look and a chevron (the browser's own arrow is hidden). */
export function SelectInput({ children, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...rest} className={cx(fieldClass, "appearance-none pr-10", className)}>{children}</select>
      <ChevronDownIcon size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute" />
    </div>
  );
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...rest} className={cx(fieldClass, "h-auto min-h-[88px] resize-none py-2.5", className)} />;
}

/** A label above a control, for controls that are not a single input (a segmented control, an input plus a button). */
export function FieldBlock({ label, children, hint, required, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; required?: boolean; className?: string }) {
  return (
    <div className={className}>
      <span className="mb-1 block text-micro text-mute">{label}{required && <span className="text-bad-600"> *</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-micro text-mute">{hint}</span>}
    </div>
  );
}

/**
 * A form as a sheet: large title, Cancel on the right, one primary button pinned at the bottom.
 *
 * Closing it by ANY route (Cancel, swipe down, Escape, tapping outside) goes through one guard: when
 * `dirty` is true it first asks "Discard changes?" on the app's confirm sheet, so a stray swipe can
 * never throw away typing. Saving closes the form from the caller's side (the store's closeModal),
 * which does not go through the guard.
 */
export function FormSheet({
  title, onClose, dirty = false, children, onSave, saveLabel = "Save", savingLabel = "Saving…", canSave = true, saving = false,
  saveTone = "action", z, tall, canvas, footerNote,
}: {
  title: string; onClose: () => void; dirty?: boolean; children: ReactNode; onSave: () => void;
  saveLabel?: string; savingLabel?: string; canSave?: boolean; saving?: boolean; saveTone?: "action" | "danger";
  z?: number; tall?: boolean; canvas?: boolean; footerNote?: ReactNode;
}) {
  const asking = useRef(false);
  const attemptClose = async () => {
    if (!dirty) { onClose(); return; }
    if (asking.current) return;
    asking.current = true;
    try {
      const discard = await confirm({
        title: "Discard changes?", message: "What you typed here won't be saved.",
        confirmLabel: "Discard", cancelLabel: "Keep editing", tone: "danger",
      });
      if (discard) onClose();
    } finally { asking.current = false; }
  };

  return (
    <Sheet
      z={z} tall={tall} canvas={canvas} onClose={attemptClose}
      // Long, changing titles ("Pay Ambuja Cement Distributor") wrap and shrink a little instead of being cut off.
      title={<span className={cx("block whitespace-normal", title.length > 22 && "text-[22px] leading-7")}>{title}</span>}
      trailing={<TextButton tone="quiet" onClick={attemptClose} className="-mr-1 shrink-0 px-1">Cancel</TextButton>}
      footer={
        <>
          {footerNote}
          <PrimaryButton tone={saveTone} disabled={!canSave || saving} onClick={onSave}>{saving ? savingLabel : saveLabel}</PrimaryButton>
        </>
      }
    >
      {children}
      <div className="h-3" />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ lists */

/** One row of an action list inside a sheet: icon, label, optional hint. A link when `href` is set. */
export function ActionRow({ icon, label, onClick, href, danger, disabled, hint }: {
  icon: ReactNode; label: ReactNode; onClick?: () => void; href?: string; danger?: boolean; disabled?: boolean; hint?: ReactNode;
}) {
  const cls = cx(
    "flex h-[52px] w-full items-center gap-3 border-t border-line px-4 text-left text-[16px] transition-colors first:border-t-0 active:bg-paper",
    danger ? "text-bad-600" : "text-ink",
    disabled && "pointer-events-none opacity-40",
  );
  const inner = (
    <>
      <span className={danger ? "text-bad-600" : "text-mute"}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-caption text-mute">{hint}</span>}
    </>
  );
  if (href) return <a href={disabled ? undefined : href} target="_blank" rel="noreferrer" aria-disabled={disabled || undefined} onClick={onClick} className={cls}>{inner}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
}

/** A square action under a header (WhatsApp, Message, Account link, Edit): a 44 px+ target with the word beneath. */
export function ActionTile({ icon, label, onClick, href, disabled }: { icon: ReactNode; label: string; onClick?: () => void; href?: string; disabled?: boolean }) {
  const cls = cx(
    "flex h-[68px] flex-col items-center justify-center gap-1 rounded-group border border-line bg-card text-brand-600 transition active:scale-[0.97] active:bg-paper",
    disabled && "pointer-events-none opacity-40",
  );
  const inner = <>{icon}<span className="text-micro font-medium text-mute">{label}</span></>;
  if (href) return <a href={disabled ? undefined : href} target="_blank" rel="noreferrer" aria-disabled={disabled || undefined} className={cls}>{inner}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
}

/** A label on the left, its value on the right: the rows of a detail sheet. */
export function DetailRow({ label, children, onClick, tone }: { label: string; children: ReactNode; onClick?: () => void; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-good-600" : tone === "bad" ? "text-bad-600" : tone === "warn" ? "text-warn-700" : "text-ink";
  const inner = (
    <div className="flex min-h-[48px] w-full items-center justify-between gap-4 py-2">
      <span className="shrink-0 text-[16px] text-mute">{label}</span>
      <span className={cx("min-w-0 truncate text-right text-[16px] tabular-nums", color)}>{children}</span>
    </div>
  );
  const base = "block w-full border-t border-line px-4 text-left first:border-t-0";
  if (onClick) return <button type="button" onClick={onClick} className={cx(base, "transition-colors active:bg-paper")}>{inner}</button>;
  return <div className={base}>{inner}</div>;
}

/** What a group shows when there is nothing in it, with an optional single action. */
export function EmptyNote({ text, cta, onCta }: { text: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="mx-auto max-w-xs text-[15px] text-mute">{text}</p>
      {cta && onCta && (
        <div className="mt-4 flex justify-center">
          <PrimaryButton size="md" full={false} className="px-6" onClick={onCta}>{cta}</PrimaryButton>
        </div>
      )}
    </div>
  );
}
