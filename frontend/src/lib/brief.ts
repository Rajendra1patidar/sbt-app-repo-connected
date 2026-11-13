import { inrCompact } from "./money";
import { estimateState, localToday } from "./estimates";
import type { CoverRow } from "./stockCover";

/**
 * The Brief: at most three things worth acting on today, each with one action.
 * Everything here is derived from data the app already holds.
 */
export type BriefAction =
  | { kind: "purchase"; row: CoverRow }
  | { kind: "reminders" }
  | { kind: "stock" };

export interface BriefItem {
  id: string; text: string; cta: string; action: BriefAction;
  /** A quieter second action on the same line, e.g. "3 more running low". */
  more?: { text: string; action: BriefAction };
}

function daysPhrase(days: number): string {
  if (days <= 0) return "is out";
  if (days === 1) return "runs out in about a day";
  return `runs out in about ${days} days`;
}

export function buildBrief({ cover, estimates, currency = "₹" }: { cover: CoverRow[]; estimates: any[]; currency?: string }): BriefItem[] {
  const out: BriefItem[] = [];

  // 1) the item closest to running out
  // Of what's running short, lead with the one that costs the most for each day it's out.
  const byPace = cover.filter((r) => r.days != null && r.days < 7).sort((a, b) => b.dailyValue - a.dailyValue || (a.days ?? 0) - (b.days ?? 0));
  const byLevel = cover.filter((r) => r.low).sort((a, b) => a.stock - b.stock);
  const running = [...byPace, ...byLevel];
  if (running.length > 0) {
    const r = running[0];
    const d = r.days;
    out.push({
      id: `stock-${r.id}`,
      text: d == null
        ? (r.stock <= 0 ? `${r.name} is out of stock.` : `${r.name} is low, ${r.stock} ${r.unit} left.`)
        : d <= 0 ? `${r.name} is out of stock.` : `${r.name} ${daysPhrase(d)} at the current pace.`,
      cta: "Create purchase",
      action: { kind: "purchase", row: r },
      ...(running.length > 1 ? { more: { text: `${running.length - 1} more running low`, action: { kind: "stock" } as BriefAction } } : {}),
    });
  }

  // 2) late money
  const t = localToday();
  const late = estimates.filter((e) => estimateState(e, t).key === "overdue");
  if (late.length > 0) {
    const total = late.reduce((s, e) => s + estimateState(e, t).balance, 0);
    out.push({
      id: "overdue",
      text: `${late.length} estimate${late.length === 1 ? " is" : "s are"} overdue, ${inrCompact(total, currency)} in total.`,
      cta: "Send reminders",
      action: { kind: "reminders" },
    });
  }
  return out.slice(0, 3);
}
