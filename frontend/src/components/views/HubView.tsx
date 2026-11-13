import { useMemo } from "react";
import { ContractorPodium } from "../dashboard/ContractorPodium";
import { Group, GroupLabel, GroupRow, LargeTitle, RoundButton, StatusChip, cx } from "../ui/kit";
import { PlusIcon, SearchIcon } from "../ui/icons";
import { NAV, NAV_BLURB, OWNER_ONLY_NAV_IDS, TABS, type TabId } from "../../lib/constants";
import { totalsInWindow } from "../../lib/daySummary";
import { openBalance } from "../../lib/estimates";
import { inr, inrCompact } from "../../lib/money";

/* ---- Sell, Money and Team ----
 * Each tab's home: the numbers that matter at the top, then every destination in
 * one grouped list. Nothing was removed when 28 destinations became 5 tabs. */

export function HubView({ tabId, role, data, currency, scoreRules, openModal, go, onSearch }: {
  tabId: Exclude<TabId, "home" | "stock">; role: string; data: any; currency: string; scoreRules?: any;
  openModal: (type: string, payload?: any) => void; go: (view: string, query?: string) => void; onSearch: () => void;
}) {
  const tab = TABS.find((t) => t.id === tabId)!;
  const { estimates, payments, expenses, purchases, items } = data;
  const members = tab.members
    .filter((id) => role !== "staff" || !OWNER_ONLY_NAV_IDS.has(id))
    .map((id) => NAV.find((n) => n.id === id))
    .filter(Boolean) as any[];

  const { receivable, overdue, overdueCount } = useMemo(() => openBalance(estimates), [estimates]);
  const month = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return totalsInWindow(start, now.getTime() + 1, { estimates, payments, expenses, purchases });
  }, [estimates, payments, expenses, purchases]);

  const strip: [string, number][] | null =
    tabId === "sell" ? [["Owed to you", receivable], ["Overdue", overdue], ["Sold this month", month.sold]]
      : tabId === "money" ? [["Sold", month.sold], ["Received", month.received], ["Spent", month.spent]]
        : null;

  const badge = (id: string) => {
    if (id === "estimates" && overdueCount > 0) return <StatusChip tone="overdue">{overdueCount} overdue</StatusChip>;
    if (id === "customerCredit" && receivable > 0) return <span className="text-caption tabular-nums text-mute">{inrCompact(receivable, currency)}</span>;
    return null;
  };

  return (
    <div className="px-5 pb-28 md:pb-12">
      <LargeTitle
        title={tab.label} subtitle={tab.blurb}
        right={
          <>
            {tabId === "sell" && <RoundButton variant="solid" label="New estimate" onClick={() => openModal("estimate")}><PlusIcon size={24} /></RoundButton>}
            {tabId === "money" && <RoundButton variant="solid" label="New expense" onClick={() => openModal("expense")}><PlusIcon size={24} /></RoundButton>}
            <RoundButton label="Search" onClick={onSearch}><SearchIcon size={22} /></RoundButton>
          </>
        }
      />

      {strip && (
        <div className="mt-4 flex overflow-hidden rounded-group border border-line bg-card">
          {strip.map(([label, v], i) => (
            <div key={label} className={cx("min-w-0 flex-1 px-3.5 py-2.5", i > 0 && "border-l border-line")}>
              <p className="truncate text-micro text-mute">{label}</p>
              <p className={cx("truncate text-lead font-medium tabular-nums", label === "Overdue" && v > 0 ? "text-bad-600" : "text-ink")}>{inrCompact(v, currency)}</p>
            </div>
          ))}
        </div>
      )}

      <GroupLabel className="mt-5">{tabId === "sell" ? "Everything in Sell" : tabId === "money" ? "Everything in Money" : "Everything in Team"}</GroupLabel>
      <Group>
        {members.map((n) => (
          <GroupRow key={n.id} onClick={() => go(n.id)} chevron className="min-h-[64px] py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[16px] text-ink">{n.label}</p>
                <p className="text-micro text-mute">{NAV_BLURB[n.id]}</p>
              </div>
              {badge(n.id)}
            </div>
          </GroupRow>
        ))}
      </Group>

      {tabId === "team" && (
        <div className="mt-6"><ContractorPodium estimates={estimates} items={items} scoreRules={scoreRules} go={go} /></div>
      )}
    </div>
  );
}
