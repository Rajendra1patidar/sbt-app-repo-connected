import type { ReactNode } from "react";

/**
 * Ask the person to confirm something, without a browser pop-up.
 *
 *   if (!(await confirm({ title: "Remove this change?", confirmLabel: "Remove", tone: "danger" }))) return;
 *   await notice({ title: "Allow pop-ups", message: "Your browser blocked the print window." });
 *
 * It reads like `window.confirm` / `window.alert` at the call site, but opens the app's own
 * confirm sheet (components/ui/ConfirmSheet.tsx, drawn by <ConfirmHost /> in App.tsx).
 * Dismissing the sheet any way at all (Cancel, swipe down, Escape, tapping outside) is "no".
 * If several are asked at once they are shown one after another, never stacked.
 */

export type ConfirmAsk = {
  title: string;
  /** Plain text; line breaks are kept. */
  message?: ReactNode;
  /** Default "Confirm" ("OK" for a notice). */
  confirmLabel?: string;
  /** Default "Cancel". `null` hides it (a notice has one button). */
  cancelLabel?: string | null;
  /** "danger" makes the button red and puts focus on Cancel, so a stray Enter can't delete. */
  tone?: "action" | "danger";
};

export type PendingConfirm = ConfirmAsk & { id: number; resolve: (ok: boolean) => void };

let nextId = 1;
let current: PendingConfirm | null = null;
const waiting: PendingConfirm[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function showNext() {
  current = waiting.shift() ?? null;
  emit();
}

export function confirm(ask: ConfirmAsk): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    waiting.push({ ...ask, id: nextId++, resolve });
    if (!current) showNext();
  });
}

/** A message with a single OK button, in place of `alert`. */
export function notice(ask: Omit<ConfirmAsk, "cancelLabel" | "tone">): Promise<void> {
  return confirm({ ...ask, confirmLabel: ask.confirmLabel ?? "OK", cancelLabel: null }).then(() => undefined);
}

/** Used by <ConfirmHost />. */
export function settleConfirm(ok: boolean) {
  const done = current;
  if (!done) return;
  current = null;
  done.resolve(ok);
  showNext();
}
export const subscribeConfirm = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const currentConfirm = () => current;
