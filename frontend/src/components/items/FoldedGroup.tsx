import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "../ui/icons";
import { Group, cx } from "../ui/kit";

/** A grouped surface that is one line until asked for ("Quantity map", "Value by category"), so a list screen opens on its list. */
export function FoldedGroup({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Group className={className}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-full items-center justify-between px-4 text-left text-[16px] text-ink transition-colors active:bg-paper">
        {title}
        <ChevronDownIcon size={18} className={cx("text-mute transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-line">{children}</div>}
    </Group>
  );
}
