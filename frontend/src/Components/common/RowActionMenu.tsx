import React, { useState } from "react";
import { MoreVertical } from "lucide-react";

export interface RowAction {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  onClick: () => void;
  danger?: boolean;
  href?: string; // if set, renders as a link (e.g. wa.me / tel:) instead of a button
}

/**
 * Compact "⋯" trigger that reveals a dropdown of row-level actions
 * (Edit / Share / Print / Delete, etc). Keeps list rows uncluttered —
 * used in place of stacking several always-visible icon buttons per row.
 */
export function RowActionMenu({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  if (!actions || actions.length === 0) return null;

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="More actions"
        className="flex h-9 w-9 items-center justify-center rounded-full text-ink/40 hover:bg-paper active:scale-95 transition"
      >
        <MoreVertical size={17} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-[56] min-w-[168px] overflow-hidden rounded-2xl border border-line bg-white shadow-xl animate-pop-in">
            {actions.map((a) => {
              const Icon = a.icon;
              const cls = `flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-semibold ${
                a.danger ? "text-bad-500 hover:bg-bad-50" : "text-ink/80 hover:bg-paper"
              } border-b border-line last:border-b-0`;
              if (a.href) {
                return (
                  <a key={a.key} href={a.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className={cls}>
                    <Icon size={15} /> {a.label}
                  </a>
                );
              }
              return (
                <button key={a.key} onClick={() => { a.onClick(); setOpen(false); }} className={cls}>
                  <Icon size={15} /> {a.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
