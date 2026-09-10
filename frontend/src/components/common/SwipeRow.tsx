import React, { useEffect, useRef } from "react";

export interface SwipeAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string; // background/text color classes
  style?: React.CSSProperties; // for colors not in the tailwind palette (e.g. WhatsApp green)
}

/**
 * A row that reveals a strip of actions when dragged left, and stays put
 * otherwise — so routine per-row actions (view, record payment, share) don't
 * have to sit permanently visible as a wall of buttons on every card.
 *
 * `isOpen`/`onOpenChange` are controlled by the parent so only one row can be
 * swiped open at a time across a list. Uses pointer capture so the drag keeps
 * tracking correctly even once the row content has slid out from under the
 * pointer's original screen position.
 */
export function SwipeRow({ actions, isOpen, onOpenChange, children }: {
  actions: SwipeAction[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const frontRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const decided = useRef(false);
  const isSwipe = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const dx = useRef(0);
  const pointerId = useRef<number | null>(null);
  const ACTION_W = 46;
  const width = actions.length * ACTION_W;

  const setX = (x: number) => {
    if (frontRef.current) frontRef.current.style.transform = `translateX(${x}px)`;
  };

  // Snap to the controlled open/closed position whenever it changes externally
  // (e.g. another row was swiped open and this one got told to close).
  useEffect(() => {
    if (frontRef.current) frontRef.current.style.transition = "transform 0.2s ease";
    setX(isOpen ? -width : 0);
  }, [isOpen, width]);

  if (actions.length === 0) {
    // Nothing to reveal — render as a plain non-draggable row.
    return <div className="border-b border-line/70 last:border-none">{children}</div>;
  }

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    decided.current = false;
    isSwipe.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    pointerId.current = e.pointerId;
    if (frontRef.current) {
      frontRef.current.style.transition = "none";
      try { frontRef.current.setPointerCapture(e.pointerId); } catch { /* unsupported, drag still works via bubbling */ }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || e.pointerId !== pointerId.current) return;
    const mdx = e.clientX - start.current.x;
    const mdy = e.clientY - start.current.y;
    // A slightly forgiving threshold — real touchscreens have some contact-area
    // jitter on a tap, and this only runs on touch/pen now (desktop skips dragging
    // entirely — see DocumentList's isTouchDevice check), so there's no click to
    // accidentally swallow here the way there was when this ran for mouse too.
    if (!decided.current && (Math.abs(mdx) > 8 || Math.abs(mdy) > 8)) {
      decided.current = true;
      isSwipe.current = Math.abs(mdx) > Math.abs(mdy);
    }
    if (!isSwipe.current) return;
    e.preventDefault();
    dx.current = mdx;
    const base = isOpen ? -width : 0;
    setX(Math.max(-width, Math.min(0, base + mdx)));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragging.current || e.pointerId !== pointerId.current) return;
    dragging.current = false;
    if (frontRef.current) {
      frontRef.current.style.transition = "transform 0.2s ease";
      try { frontRef.current.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
    if (!isSwipe.current) return;
    const base = isOpen ? -width : 0;
    const finalX = Math.max(-width, Math.min(0, base + dx.current));
    onOpenChange(finalX < -width / 2);
  };

  // Stop a click from reaching the row's own onClick (e.g. "expand detail")
  // when that click was actually the tail end of a swipe drag.
  const onClickCapture = (e: React.MouseEvent) => {
    if (isSwipe.current) { e.stopPropagation(); e.preventDefault(); }
  };

  return (
    <div className="relative overflow-hidden border-b border-line/70 last:border-none">
      <div className="absolute right-0 top-0 flex h-full">
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            aria-label={a.label}
            onClick={() => { a.onClick(); onOpenChange(false); }}
            className={`flex h-full items-center justify-center text-base ${a.className || "bg-paper text-ink/60"}`}
            style={{ width: ACTION_W, ...a.style }}
          >
            {a.icon}
          </button>
        ))}
      </div>
      <div
        ref={frontRef}
        className="relative touch-pan-y bg-card"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
