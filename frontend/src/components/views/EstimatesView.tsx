import { useMemo, useState } from "react";
import { EmptyState } from "../common/UIPrimitives";
import { EstimateDetailSheet } from "./EstimateDetailSheet";
import { Group, GroupLabel, GroupRow, LargeTitle, RoundButton, SearchField, Segmented, Sheet, StatusChip, Switch, cx } from "../ui/kit";
import { ChevronDownIcon, FilterIcon, PlusIcon } from "../ui/icons";
import { estimateState, groupByRecency, localToday, matchesTab, sortNewest, type EstimateTab } from "../../lib/estimates";
import { useEstimateDraft } from "../../lib/estimateDraft";
import { inr, inrCompact } from "../../lib/money";

type SortKey = "newest" | "oldest" | "amount" | "customer";
const SORTS: [SortKey, string][] = [["newest", "Newest"], ["oldest", "Oldest"], ["amount", "Highest amount"], ["customer", "Customer A–Z"]];
const SORT_KEY = "sbt_est_sort_v2";
const COLLAPSE_KEY = "sbt_est_collapsed_v2";
const SEARCH_CAP = 80;

const readLS = (k: string): string | null => { try { return window.localStorage.getItem(k); } catch { return null; } };
const writeLS = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* ignore */ } };

/**
 * Estimates: a large title, a "+" for a new one, four tabs, search, and one
 * grouped surface per week or month. Tap a row and the detail opens as a sheet.
 */
export function EstimatesView({
  docs, customers, items, payments, currency, openModal, initialStatusFilter,
  removeDoc, restoreDoc, recordPayment, onReturn, onDeliver, onShareInvoice, onSharePortalAccess, onPrint, onView,
}: any) {
  const [tab, setTab] = useState<EstimateTab>(() => (["due", "overdue", "paid"].includes(initialStatusFilter) ? initialStatusFilter : "all"));
  const [search, setSearch] = useState("");
  const [onlyReturned, setOnlyReturned] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>(() => (SORTS.some(([k]) => k === readLS(SORT_KEY)) ? (readLS(SORT_KEY) as SortKey) : "newest"));
  const [filterOpen, setFilterOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => { try { return JSON.parse(readLS(COLLAPSE_KEY) || "{}"); } catch { return {}; } });
  const [capped, setCapped] = useState(true);
  const draft = useEstimateDraft();

  // A fresh filter from outside (e.g. "View overdue estimates") while this screen is already open.
  const [lastInitial, setLastInitial] = useState(initialStatusFilter);
  if (initialStatusFilter !== lastInitial) {
    setLastInitial(initialStatusFilter);
    if (["due", "overdue", "paid"].includes(initialStatusFilter)) setTab(initialStatusFilter);
  }

  const todayStr = localToday();
  const customerOf = useMemo(() => new Map<string, any>((customers || []).map((c: any) => [c.id, c])), [customers]);
  const nameOf = (id: string) => customerOf.get(id)?.name || "Unknown customer";

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d: any) => {
      const c = customerOf.get(d.customerId);
      return [c?.name, c?.location, d.number, d.notes, d.destination, d.contractorName].some((s) => String(s || "").toLowerCase().includes(q));
    });
  }, [docs, search, customerOf]);

  const withState = useMemo(() => searched.map((d: any) => ({ d, s: estimateState(d, todayStr) })), [searched, todayStr]);
  const deletedCount = useMemo(() => docs.filter((d: any) => d.deleted).length, [docs]);

  const visible = useMemo(() => {
    let list = withState.filter(({ d, s }: any) => {
      if (s.key === "void") return showDeleted && tab === "all" && !onlyReturned;
      if (!matchesTab(s, tab)) return false;
      if (onlyReturned && !(d.returns || []).length) return false;
      return true;
    }).map(({ d }: any) => d);
    if (sortBy === "newest") list = sortNewest(list);
    else if (sortBy === "oldest") list = sortNewest(list).reverse();
    else if (sortBy === "amount") list = [...list].sort((a: any, b: any) => Number(b.total || 0) - Number(a.total || 0));
    else list = [...list].sort((a: any, b: any) => nameOf(a.customerId).localeCompare(nameOf(b.customerId)));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withState, tab, onlyReturned, showDeleted, sortBy, customerOf]);

  const grouped = (sortBy === "newest" || sortBy === "oldest") && !search.trim();
  const groups = useMemo(() => (grouped ? groupByRecency(visible) : []), [visible, grouped]);

  const persistCollapsed = (next: Record<string, boolean>) => { setCollapsed(next); writeLS(COLLAPSE_KEY, JSON.stringify(next)); };
  const isCollapsed = (key: string, index: number) => (collapsed[key] !== undefined ? collapsed[key] : index > 1);
  const setSort = (k: SortKey) => { setSortBy(k); writeLS(SORT_KEY, k); };

  const filterActive = sortBy !== "newest" || onlyReturned || showDeleted;
  const opened = openId ? docs.find((d: any) => d.id === openId) : null;

  const row = (d: any) => {
    const s = estimateState(d, todayStr);
    const showLeft = (s.key === "partial" || s.key === "overdue") && s.paid > 0 && s.balance > 0;
    return (
      <GroupRow key={d.id} onClick={() => setOpenId(d.id)} className="min-h-[68px] py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={cx("truncate text-lead font-medium text-ink", s.key === "void" && "line-through opacity-60")}>{nameOf(d.customerId)}</p>
            <p className="truncate text-caption text-mute">
              <span className="font-doc text-[12.5px]">{d.number}</span>
              {showLeft && <span>, {inrCompact(s.balance, currency)} left</span>}
              {d.isAdvanceBooking && <span>, advance</span>}
              {d._offlinePending && <span>, pending sync</span>}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lead font-medium tabular-nums text-ink">{inr(d.total, currency)}</p>
            <StatusChip tone={s.tone} className="mt-1">{s.label}</StatusChip>
          </div>
        </div>
      </GroupRow>
    );
  };

  const empty = docs.length === 0;

  return (
    <div className="px-5 pb-28 md:pb-12">
      <LargeTitle title="Estimates" right={<RoundButton variant="solid" label="New estimate" onClick={() => openModal("estimate")}><PlusIcon size={24} /></RoundButton>} />

      <div className="mt-4">
        <Segmented ariaLabel="Filter estimates" options={[{ value: "all", label: "All" }, { value: "due", label: "Due" }, { value: "overdue", label: "Overdue" }, { value: "paid", label: "Paid" }]} value={tab} onChange={(v) => setTab(v as EstimateTab)} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <SearchField className="flex-1" value={search} onChange={setSearch} placeholder="Search customer or number" />
        <div className="relative">
          <RoundButton label="Sort and filter" size={40} onClick={() => setFilterOpen(true)}><FilterIcon size={20} /></RoundButton>
          {filterActive && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-brand-500" />}
        </div>
      </div>

      {draft && (
        <>
          <GroupLabel>Draft</GroupLabel>
          <Group>
            <GroupRow onClick={() => openModal("estimate")} chevron className="min-h-[64px] py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lead font-medium text-ink">{draft.customerId ? nameOf(draft.customerId) : "No customer yet"}</p>
                  <p className="text-caption text-mute">{(draft.lines || []).filter((l: any) => l.itemId).length} item{(draft.lines || []).filter((l: any) => l.itemId).length === 1 ? "" : "s"}, not saved</p>
                </div>
                <StatusChip tone="draft">Draft</StatusChip>
              </div>
            </GroupRow>
          </Group>
        </>
      )}

      {empty ? (
        <Group className="mt-4"><EmptyState text="Create estimates to send price quotes and bills to customers." cta="New estimate" onCta={() => openModal("estimate")} /></Group>
      ) : visible.length === 0 ? (
        <Group className="mt-4"><p className="px-4 py-8 text-center text-[15px] text-mute">{search ? "No estimates match your search." : "Nothing here."}</p></Group>
      ) : grouped ? (
        groups.map((g, i) => {
          const folded = g.collapsible && isCollapsed(g.key, i);
          return (
            <div key={g.key}>
              <GroupLabel
                right={<span className="tabular-nums">{inrCompact(g.total, currency)}</span>}
                className={g.collapsible ? "cursor-pointer" : ""}
              >
                {g.collapsible ? (
                  <button type="button" onClick={() => persistCollapsed({ ...collapsed, [g.key]: !folded })} aria-expanded={!folded} className="inline-flex items-center gap-1">
                    <ChevronDownIcon size={14} className={cx("transition-transform", folded && "-rotate-90")} />
                    {g.label} <span className="text-faint">· {g.docs.length}</span>
                  </button>
                ) : g.label}
              </GroupLabel>
              {!folded && <Group>{g.docs.map(row)}</Group>}
            </div>
          );
        })
      ) : (
        <>
          <GroupLabel right={<span>{visible.length} estimate{visible.length === 1 ? "" : "s"}</span>}>{search ? "Results" : SORTS.find(([k]) => k === sortBy)?.[1]}</GroupLabel>
          <Group>{(capped ? visible.slice(0, SEARCH_CAP) : visible).map(row)}</Group>
          {capped && visible.length > SEARCH_CAP && (
            <button type="button" onClick={() => setCapped(false)} className="mt-1 h-11 w-full text-[15px] font-medium text-brand-500">Show all {visible.length}</button>
          )}
        </>
      )}

      {filterOpen && (
        <Sheet onClose={() => setFilterOpen(false)} title="Sort and filter">
          <GroupLabel className="mt-0">Sort by</GroupLabel>
          <Group>
            {SORTS.map(([k, label]) => (
              <GroupRow key={k} onClick={() => setSort(k)} className="h-12">
                <div className="flex items-center justify-between">
                  <span className="text-[16px] text-ink">{label}</span>
                  {sortBy === k && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
                </div>
              </GroupRow>
            ))}
          </Group>
          <GroupLabel>Show</GroupLabel>
          <Group>
            <GroupRow className="h-14">
              <div className="flex items-center justify-between"><span className="text-[16px] text-ink">Only bills with returns</span><Switch checked={onlyReturned} onChange={setOnlyReturned} label="Only bills with returns" /></div>
            </GroupRow>
            {deletedCount > 0 && (
              <GroupRow className="h-14">
                <div className="flex items-center justify-between"><span className="text-[16px] text-ink">Deleted <span className="text-mute">({deletedCount})</span></span><Switch checked={showDeleted} onChange={setShowDeleted} label="Show deleted" /></div>
              </GroupRow>
            )}
          </Group>
          <div className="h-3" />
        </Sheet>
      )}

      {opened && (
        <EstimateDetailSheet
          doc={opened} customers={customers} items={items} payments={payments} estimates={docs} currency={currency}
          onClose={() => setOpenId(null)}
          onEdit={(d: any) => openModal("estimate", { editingDoc: d })}
          onView={onView} onRecordPayment={recordPayment} onReturn={onReturn} onDeliver={onDeliver}
          onShare={onShareInvoice} onPrint={onPrint} onPortal={onSharePortalAccess}
          onDelete={removeDoc} onRestore={restoreDoc}
          onNoPhone={(c: any) => { setOpenId(null); if (c) openModal("customer", { editingCustomer: c }); }}
        />
      )}
    </div>
  );
}
