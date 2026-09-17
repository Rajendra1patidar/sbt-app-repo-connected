import React, { useLayoutEffect, useRef, useState } from "react";

/* A minimal sliding-underline tab switcher — text labels, no filled pill
 * backgrounds, just a 2px underline that glides to the active label. Used
 * wherever the dashboard needs a lightweight view switch (Activity/Sales,
 * Recent transactions' estimates/expenses/returns) without adding another
 * boxed control to the page. */
export function UnderlineTabs<T extends string>({ tabs, active, onChange, size = "sm" }: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (key: T) => void;
  size?: "sm" | "md";
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const el = refs.current[active];
    if (el) setUnderline({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active, tabs]);

  return (
    <div className={`relative flex gap-4 border-b border-line ${size === "md" ? "mb-4" : "mb-3.5"}`}>
      {tabs.map((t) => (
        <button
          key={t.key}
          ref={(el) => { refs.current[t.key] = el; }}
          onClick={() => onChange(t.key)}
          className={`pb-2 text-[12.5px] font-semibold capitalize transition-colors duration-150 ${active === t.key ? "text-ink" : "text-ink/35 hover:text-ink/55"}`}
        >
          {t.label}
        </button>
      ))}
      <div className="absolute bottom-[-1px] h-[2px] bg-ink transition-all duration-300 ease-out" style={{ left: underline.left, width: underline.width }} />
    </div>
  );
}
