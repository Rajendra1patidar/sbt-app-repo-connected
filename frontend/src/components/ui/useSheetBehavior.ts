import { useEffect, useRef, type RefObject } from "react";

/**
 * What every sheet does, in one place (used by Sheet and FullSheet in kit.tsx):
 *
 *  - Focus moves into the sheet when it opens, Tab and Shift+Tab stay inside it, and
 *    focus goes back to the button that opened it when it closes.
 *  - Escape closes the TOP sheet only. A picker opened over a form closes by itself,
 *    not the form underneath it too.
 *  - The page behind doesn't scroll. A counter, not a saved value, so two sheets
 *    closing in any order can never leave the page stuck unscrollable.
 *  - On a phone, a sheet can be swiped down to close from its grabber or title row
 *    (anything marked `data-sheet-drag`). Past about a third of its height, or a quick
 *    flick, it closes; less than that, it springs back. The body never starts a drag,
 *    so scrolling and typing are never fought over.
 */

/** Sheets currently open, oldest first. Only the last one answers Escape and Tab. */
const openSheets: symbol[] = [];

let scrollLocks = 0;
let savedOverflow = "";
function lockScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}
function unlockScroll() {
  if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Bottom sheets only exist below Tailwind's `md` breakpoint; above it the sheet is a centred dialog. */
const isPhoneLayout = () => typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches;

const CLOSE_DISTANCE = 0.3; // fraction of the sheet's height
const CLOSE_VELOCITY = 0.6; // px per ms
const DRAG_START = 8; // px of downward travel before it counts as a drag

export function useSheetBehavior(
  // `HTMLElement | null`: React 19's useRef(null) gives a ref whose value can be null until it mounts.
  panelRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  { swipe = false, escape = true }: { swipe?: boolean; escape?: boolean } = {},
) {
  // Always call the latest onClose without re-running the effect (parents pass new closures every render).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const id = Symbol("sheet");
    openSheets.push(id);
    const isTop = () => openSheets[openSheets.length - 1] === id;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockScroll();
    // Don't steal focus from something inside that already asked for it (autoFocus).
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTop() || e.isComposing) return;
      // Many pop-ups in the app are still hand-built overlays that don't register here (they move onto
      // the shared sheet screen by screen). If focus is inside one of those, stacked above this sheet,
      // leave its Tab and Escape alone: only act when focus is in this sheet or nowhere in particular.
      const focused = document.activeElement;
      if (focused && focused !== document.body && !panel.contains(focused)) return;
      if (e.key === "Escape") {
        if (escape) { e.preventDefault(); closeRef.current(); }
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusableIn(panel);
      if (items.length === 0) { e.preventDefault(); panel.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const outside = active === panel || active === document.body || !active;
      if (e.shiftKey && (active === first || outside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || outside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);

    /* ---- swipe down to close ---- */
    let tracking = false;
    let dragging = false;
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let dy = 0;
    let samples: { t: number; y: number }[] = []; // the last ~100 ms of finger positions, for the flick speed
    let timer: number | undefined;

    const reset = (animated: boolean) => {
      panel.style.transition = animated && !prefersReducedMotion() ? "transform 200ms ease-out" : "none";
      panel.style.transform = "";
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!swipe || e.pointerType === "mouse" || !e.isPrimary || !isPhoneLayout()) return;
      if (!(e.target instanceof Element) || !e.target.closest("[data-sheet-drag]")) return;
      tracking = true; dragging = false; pointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY; dy = 0; samples = [{ t: e.timeStamp, y: e.clientY }];
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!tracking || e.pointerId !== pointerId) return;
      const moveY = e.clientY - startY;
      if (!dragging) {
        const moveX = e.clientX - startX;
        // A sideways or upward gesture isn't ours.
        if (Math.abs(moveX) > DRAG_START && Math.abs(moveX) > Math.abs(moveY)) { tracking = false; return; }
        if (moveY < -DRAG_START) { tracking = false; return; }
        if (moveY < DRAG_START) return;
        dragging = true;
        window.clearTimeout(timer);
        panel.style.animation = "none"; // the opening animation must not fight the drag
        panel.style.transition = "none";
        try { panel.setPointerCapture(pointerId); } catch { /* the pointer may already be gone */ }
      }
      dy = Math.max(0, moveY);
      samples.push({ t: e.timeStamp, y: e.clientY });
      while (samples.length > 2 && e.timeStamp - samples[0].t > 100) samples.shift();
      panel.style.transform = `translateY(${dy}px)`;
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (!tracking || e.pointerId !== pointerId) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      try { panel.releasePointerCapture(pointerId); } catch { /* already released */ }
      // The finger lifting after a drag must not also "tap" the button under it.
      const swallowClick = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", swallowClick, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallowClick, true), 100);

      const first = samples[0];
      const lastSample = samples[samples.length - 1];
      const span = lastSample.t - first.t;
      const velocity = span > 0 ? (lastSample.y - first.y) / span : 0;
      const closing = e.type === "pointerup" && (dy > panel.offsetHeight * CLOSE_DISTANCE || velocity > CLOSE_VELOCITY);
      if (!closing) { reset(true); return; }
      const slide = prefersReducedMotion() ? 0 : 180;
      panel.style.transition = slide ? `transform ${slide}ms ease-in` : "none";
      panel.style.transform = "translateY(100%)";
      timer = window.setTimeout(() => {
        closeRef.current();
        // A guarded close (an unsaved form asking "discard?") leaves the sheet open: bring it back.
        requestAnimationFrame(() => { if (panel.isConnected) reset(true); });
      }, slide);
    };

    panel.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      panel.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      const at = openSheets.indexOf(id);
      if (at >= 0) openSheets.splice(at, 1);
      unlockScroll();
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [panelRef, swipe, escape]);
}
