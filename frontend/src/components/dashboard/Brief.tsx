import { Fragment } from "react";
import { SparkIcon } from "../ui/icons";
import type { BriefItem } from "../../lib/brief";

/** The Brief: violet suggests. One panel, a few things worth doing, one action each. */
export function Brief({ items, onAct }: { items: BriefItem[]; onAct: (item: BriefItem, which?: "more") => void }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Brief" className="rounded-[20px] border border-insight-200 bg-insight-50 px-4 pb-1 pt-3.5">
      <div className="flex items-center gap-1.5 text-[15px] font-semibold text-insight-700">
        <SparkIcon size={16} />
        Brief
      </div>
      {items.map((it, i) => (
        <Fragment key={it.id}>
          {i > 0 && <div className="h-px bg-insight-200" />}
          <p className={`text-[15px] leading-[21px] text-ink ${i === 0 ? "mt-1.5" : "mt-2.5"}`}>{it.text}</p>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => onAct(it)} className="h-11 text-[15px] font-semibold text-insight-600 transition-opacity active:opacity-60">
              {it.cta}
            </button>
            {it.more && (
              <button type="button" onClick={() => onAct(it, "more")} className="h-11 text-[13px] font-medium text-mute transition-opacity active:opacity-60">
                {it.more.text}
              </button>
            )}
          </div>
        </Fragment>
      ))}
    </section>
  );
}
