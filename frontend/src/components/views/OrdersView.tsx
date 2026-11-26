import { useMemo, useState } from "react";
import { EmptyNote, FilterChips } from "../ui/blocks";
import { ChevronDownIcon } from "../ui/icons";
import { Group, GroupLabel, GroupRow, SearchField, Segmented, StatusChip, cx, type ChipTone } from "../ui/kit";
import { ITEM_CATEGORIES } from "../../lib/constants";
import { groupByRecency, sortNewest } from "../../lib/estimates";
import { round2 } from "../../lib/format";
import { inr, inrCompact, inrRate, qtyText, shortDate } from "../../lib/money";

/* ---- Orders ----
 * Stock you've ordered from vendors. Pending orders (still to arrive) are grouped by vendor, so
 * "what is Kamdhenu sending me, and what do I owe for it" is one glance; received orders are grouped
 * by week and month. Tap an order for its sheet: the figures, the vendor's bill photo, Pay and Delete. */

type Tab = "pending" | "received";
const SEARCH_CAP = 80;

const PAY: Record<string, { tone: ChipTone; label: string }> = {
  paid: { tone: "paid", label: "Paid" },
  partial: { tone: "partial", label: "Part paid" },
  due: { tone: "due", label: "Due" },
};
const payOf = (o: any) => PAY[o.paymentStatus === "paid" ? "paid" : o.paymentStatus === "partial" ? "partial" : "due"];

export function OrdersView({ orders, items, vendors, categories, currency, openModal }: any) {
  const [tab, setTab] = useState<Tab>("pending");
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [capped, setCapped] = useState(true);

  const itemOf = (id: string) => (items || []).find((it: any) => it.id === id);
  const itemName = (id: string) => itemOf(id)?.name || "Unknown item";
  const itemCategory = (id: string) => itemOf(id)?.category || "Others";
  const vendorName = (id?: string) => (id ? (vendors || []).find((v: any) => v.id === id)?.name : null);

  const configured: string[] = categories?.length ? categories : ITEM_CATEGORIES;
  const categoryOptions = useMemo(() => {
    const present = new Set<string>((orders || []).map((o: any) => itemCategory(o.itemId)));
    const ordered = [...configured.filter((c) => present.has(c)), ...[...present].filter((c) => !configured.includes(c)).sort()];
    return ordered.length > 1 ? [{ value: "All", label: "All" }, ...ordered.map((c) => ({ value: c, label: c }))] : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, items, configured]);

  const q = search.trim().toLowerCase();
  const matching = useMemo(() => (orders || [])
    .filter((o: any) => category === "All" || itemCategory(o.itemId) === category)
    .filter((o: any) => !q || itemName(o.itemId).toLowerCase().includes(q) || (vendorName(o.vendorId) || "").toLowerCase().includes(q) || String(o.notes || "").toLowerCase().includes(q)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [orders, items, vendors, category, q]);
  const pending = matching.filter((o: any) => o.status === "Pending");
  const received = matching.filter((o: any) => o.status === "Received");
  const list = tab === "pending" ? pending : received;

  const allPending = (orders || []).filter((o: any) => o.status === "Pending");
  const stillToPay = allPending.reduce((s: number, o: any) => s + Math.max(0, round2((o.amount || 0) - (o.amountPaid || 0))), 0);
  const sumOf = (docs: any[]) => docs.reduce((s, o) => s + (o.amount || 0), 0);

  const byVendor = useMemo(() => {
    const map = new Map<string, { key: string; label: string; docs: any[] }>();
    for (const o of sortNewest(pending)) {
      const key = o.vendorId || "__none__";
      if (!map.has(key)) map.set(key, { key, label: vendorName(o.vendorId) || "No vendor yet", docs: [] });
      map.get(key)!.docs.push(o);
    }
    return [...map.values()].sort((a, b) => sumOf(b.docs) - sumOf(a.docs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, vendors]);
  const receivedGroups = useMemo(() => (q ? [] : groupByRecency(sortNewest(received))), [received, q]);
  const isCollapsed = (key: string, index: number) => (collapsed[key] !== undefined ? collapsed[key] : index > 1);

  const row = (o: any, withVendor: boolean) => {
    const st = o.status === "Received" ? { tone: "paid" as ChipTone, label: "Received" } : payOf(o);
    const meta = [`${qtyText(o.qty)} at ${inrRate(o.rate || 0, currency)}`, shortDate(o.date), withVendor ? vendorName(o.vendorId) : null].filter(Boolean).join(", ");
    return (
      <GroupRow key={o.id} onClick={() => openModal("orderDetail", { order: o })} className="min-h-[68px] py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lead font-medium text-ink">{itemName(o.itemId)}</p>
            <p className="truncate text-caption tabular-nums text-mute">{meta}</p>
            {(o.notes || o.invoiceImage?.fileId) && <p className="truncate text-caption text-mute">{[o.invoiceImage?.fileId ? "Bill attached" : "", o.notes].filter(Boolean).join(", ")}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lead font-medium tabular-nums text-ink">{inr(o.amount || 0, currency)}</p>
            <StatusChip tone={st.tone} className="mt-1">{st.label}</StatusChip>
          </div>
        </div>
      </GroupRow>
    );
  };

  const foldable = (key: string, index: number, label: string, right: React.ReactNode, count: number, collapsible: boolean) => {
    const folded = collapsible && isCollapsed(key, index);
    return {
      folded,
      label: (
        <GroupLabel right={right}>
          {collapsible ? (
            <button type="button" onClick={() => setCollapsed({ ...collapsed, [key]: !folded })} aria-expanded={!folded} className="inline-flex min-h-[28px] items-center gap-1">
              <ChevronDownIcon size={14} className={cx("transition-transform", folded && "-rotate-90")} />
              {label} <span className="text-faint">· {count}</span>
            </button>
          ) : label}
        </GroupLabel>
      ),
    };
  };

  return (
    <div className="px-5 pb-28 md:pb-12">
      {(orders || []).length > 0 && (
        <p className="mt-3 px-1 text-caption text-mute">
          {allPending.length > 0
            ? <>{allPending.length} on the way{stillToPay > 0 && <>, <span className="tabular-nums text-warn-700">{inr(stillToPay, currency)}</span> still to pay</>}</>
            : "Nothing is waiting to arrive"}
        </p>
      )}
      <div className="mt-3">
        <Segmented ariaLabel="Orders" value={tab} onChange={(v) => { setTab(v as Tab); setCapped(true); }}
          options={[{ value: "pending", label: allPending.length > 0 ? `Pending (${allPending.length})` : "Pending" }, { value: "received", label: "Received" }]} />
      </div>
      <SearchField className="mt-3 !h-11" value={search} onChange={setSearch} placeholder="Search item, vendor or note" />
      {categoryOptions.length > 0 && <FilterChips className="mt-3" ariaLabel="Item category" options={categoryOptions} value={category} onChange={setCategory} />}

      {(orders || []).length === 0 ? (
        <Group className="mt-4"><EmptyNote text="Place an order to restock. When an order is paid in full, the item's stock goes up automatically." cta="New order" onCta={() => openModal("order")} /></Group>
      ) : list.length === 0 ? (
        <Group className="mt-4"><p className="px-4 py-8 text-center text-[15px] text-mute">{q || category !== "All" ? "No orders match." : tab === "pending" ? "Nothing is waiting to arrive." : "No orders have been received yet."}</p></Group>
      ) : q ? (
        <>
          <GroupLabel right={<span>{list.length} order{list.length === 1 ? "" : "s"}</span>}>Results</GroupLabel>
          <Group>{(capped ? sortNewest(list).slice(0, SEARCH_CAP) : sortNewest(list)).map((o: any) => row(o, true))}</Group>
          {capped && list.length > SEARCH_CAP && <button type="button" onClick={() => setCapped(false)} className="mt-1 h-11 w-full text-[15px] font-medium text-brand-600">Show all {list.length}</button>}
        </>
      ) : tab === "pending" ? (
        byVendor.map((g) => (
          <div key={g.key}>
            <GroupLabel right={<span className="tabular-nums">{inrCompact(sumOf(g.docs), currency)}</span>}>{g.label} <span className="text-faint">· {g.docs.length}</span></GroupLabel>
            <Group>{g.docs.map((o: any) => row(o, false))}</Group>
          </div>
        ))
      ) : (
        receivedGroups.map((g, i) => {
          const f = foldable(g.key, i, g.label, <span className="tabular-nums">{inrCompact(sumOf(g.docs), currency)}</span>, g.docs.length, g.collapsible);
          return (
            <div key={g.key}>
              {f.label}
              {!f.folded && <Group>{g.docs.map((o: any) => row(o, true))}</Group>}
            </div>
          );
        })
      )}
    </div>
  );
}
