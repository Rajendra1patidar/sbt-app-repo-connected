import { useMemo, useState } from "react";
import { DetailRow, EmptyNote } from "../ui/blocks";
import { ChevronDownIcon } from "../ui/icons";
import { Group, GroupLabel, GroupRow, PrimaryButton, SearchField, Segmented, Sheet, StatusChip, TextButton, cx, type ChipTone } from "../ui/kit";
import { groupByRecency, sortNewest } from "../../lib/estimates";
import { round2 } from "../../lib/format";
import { inr, inrCompact, inrRate, qtyText, shortDate } from "../../lib/money";

/* ---- Purchases ----
 * What you bought from vendors, grouped by week and month like Estimates and Payments. Each row is one
 * item on one bill, with whether you've paid for it. Tap a row for the figures; paying and deleting live
 * in that sheet, so a stray tap on the list can't do either. */

type Filter = "all" | "due" | "paid";
const SEARCH_CAP = 80;

const STATUS: Record<string, { tone: ChipTone; label: string }> = {
  paid: { tone: "paid", label: "Paid" },
  partial: { tone: "partial", label: "Part paid" },
  due: { tone: "due", label: "Due" },
};
const statusOf = (p: any) => STATUS[p.paymentStatus === "paid" ? "paid" : p.paymentStatus === "partial" ? "partial" : "due"];
const remainingOf = (p: any) => Math.max(0, round2((p.amount || 0) - (p.amountPaid || 0)));

export function PurchasesView({ purchases, vendors, items, currency, openModal, removePurchase }: any) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [capped, setCapped] = useState(true);

  const vendorName = (id: string) => (vendors || []).find((v: any) => v.id === id)?.name || "Unknown vendor";
  const itemName = (id: string) => (items || []).find((i: any) => i.id === id)?.name || "Unknown item";

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = (purchases || []).filter((p: any) => {
      if (filter === "paid" && p.paymentStatus !== "paid") return false;
      if (filter === "due" && p.paymentStatus === "paid") return false;
      if (!q) return true;
      return vendorName(p.vendorId).toLowerCase().includes(q) || itemName(p.itemId).toLowerCase().includes(q) || String(p.notes || "").toLowerCase().includes(q);
    });
    return sortNewest(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchases, vendors, items, filter, q]);

  const groups = useMemo(() => (q ? [] : groupByRecency(visible)), [visible, q]);
  const isCollapsed = (key: string, index: number) => (collapsed[key] !== undefined ? collapsed[key] : index > 1);
  const opened = openId ? (purchases || []).find((p: any) => p.id === openId) : null;
  const dueCount = (purchases || []).filter((p: any) => p.paymentStatus !== "paid").length;
  const owedTotal = (purchases || []).reduce((s: number, p: any) => s + remainingOf(p), 0);

  const row = (p: any) => {
    const st = statusOf(p);
    return (
      <GroupRow key={p.id} onClick={() => setOpenId(p.id)} className="min-h-[68px] py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lead font-medium text-ink">{vendorName(p.vendorId)}</p>
            <p className="truncate text-caption text-mute">{itemName(p.itemId)}</p>
            <p className="truncate text-caption tabular-nums text-mute">{qtyText(p.qtyKg || p.qty)}{p.qtyKg ? " kg" : ""} at {inrRate(p.rate, currency)}, {shortDate(p.date)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lead font-medium tabular-nums text-ink">{inr(p.amount || 0, currency)}</p>
            <StatusChip tone={st.tone} className="mt-1">{st.label}</StatusChip>
          </div>
        </div>
      </GroupRow>
    );
  };

  const groupRight = (docs: any[]) => {
    const due = docs.reduce((s, p) => s + remainingOf(p), 0);
    return due > 0
      ? <span className="tabular-nums text-warn-700">{inrCompact(due, currency)} due</span>
      : <span className="tabular-nums">{inrCompact(docs.reduce((s, p) => s + (p.amount || 0), 0), currency)}</span>;
  };

  return (
    <div className="px-5 pb-28 md:pb-12">
      {(purchases || []).length > 0 && (
        <p className="mt-3 px-1 text-caption text-mute">
          {owedTotal > 0 ? <>You owe vendors <span className="tabular-nums text-warn-700">{inr(owedTotal, currency)}</span> on {dueCount} purchase{dueCount === 1 ? "" : "s"}</> : "Everything you bought is paid for"}
        </p>
      )}
      <div className="mt-3">
        <Segmented ariaLabel="Filter purchases" value={filter} onChange={(v) => { setFilter(v as Filter); setCapped(true); }}
          options={[{ value: "all", label: "All" }, { value: "due", label: dueCount > 0 ? `Due (${dueCount})` : "Due" }, { value: "paid", label: "Paid" }]} />
      </div>
      <SearchField className="mt-3 !h-11" value={search} onChange={setSearch} placeholder="Search vendor, item or note" />

      {(purchases || []).length === 0 ? (
        <Group className="mt-4"><EmptyNote text="Record what you pay vendors. It keeps your item cost and profit numbers right." cta="New purchase" onCta={() => openModal("purchase")} /></Group>
      ) : visible.length === 0 ? (
        <Group className="mt-4"><p className="px-4 py-8 text-center text-[15px] text-mute">{q ? `No purchases match “${search}”.` : filter === "due" ? "Nothing is waiting to be paid." : "Nothing here."}</p></Group>
      ) : q ? (
        <>
          <GroupLabel right={<span>{visible.length} purchase{visible.length === 1 ? "" : "s"}</span>}>Results</GroupLabel>
          <Group>{(capped ? visible.slice(0, SEARCH_CAP) : visible).map(row)}</Group>
          {capped && visible.length > SEARCH_CAP && (
            <button type="button" onClick={() => setCapped(false)} className="mt-1 h-11 w-full text-[15px] font-medium text-brand-600">Show all {visible.length}</button>
          )}
        </>
      ) : (
        groups.map((g, i) => {
          const folded = g.collapsible && isCollapsed(g.key, i);
          return (
            <div key={g.key}>
              <GroupLabel right={groupRight(g.docs)}>
                {g.collapsible ? (
                  <button type="button" onClick={() => setCollapsed({ ...collapsed, [g.key]: !folded })} aria-expanded={!folded} className="inline-flex min-h-[28px] items-center gap-1">
                    <ChevronDownIcon size={14} className={cx("transition-transform", folded && "-rotate-90")} />
                    {g.label} <span className="text-faint">· {g.docs.length}</span>
                  </button>
                ) : g.label}
              </GroupLabel>
              {!folded && <Group>{g.docs.map(row)}</Group>}
            </div>
          );
        })
      )}

      {opened && (
        <PurchaseSheet
          purchase={opened} vendor={vendorName(opened.vendorId)} item={itemName(opened.itemId)} currency={currency}
          onClose={() => setOpenId(null)}
          onPay={() => { setOpenId(null); openModal("purchasePayment", { purchaseId: opened.id, vendorName: vendorName(opened.vendorId), remaining: remainingOf(opened), pending: opened.status !== "Received" }); }}
          onDelete={() => { setOpenId(null); removePurchase(opened.id); }}
        />
      )}
    </div>
  );
}

function PurchaseSheet({ purchase: p, vendor, item, currency, onClose, onPay, onDelete }: any) {
  const st = statusOf(p);
  const remaining = remainingOf(p);
  return (
    <Sheet onClose={onClose} label={`Purchase from ${vendor}`}
      footer={remaining > 0 ? <PrimaryButton onClick={onPay}>Pay {inr(remaining, currency)}</PrimaryButton> : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-section text-ink">{item}</h2>
        <p className="shrink-0 text-section tabular-nums text-ink">{inr(p.amount || 0, currency)}</p>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <StatusChip tone={st.tone}>{st.label}</StatusChip>
        <p className="min-w-0 truncate text-[15px] text-mute">{vendor}</p>
      </div>

      <Group className="mt-4">
        <DetailRow label="Date">{shortDate(p.date)}</DetailRow>
        <DetailRow label="Quantity">{qtyText(p.qty)}{p.qtyKg ? `, ${qtyText(p.qtyKg)} kg` : ""}</DetailRow>
        <DetailRow label={p.qtyKg ? "Rate a kg" : "Rate"}>{inrRate(p.rate || 0, currency)}</DetailRow>
        {p.notes && <DetailRow label="Notes">{p.notes}</DetailRow>}
      </Group>
      <Group className="mt-4">
        <DetailRow label="Paid" tone={p.amountPaid > 0 ? "good" : undefined}>{inr(p.amountPaid || 0, currency)}</DetailRow>
        <DetailRow label={remaining > 0 ? "Still to pay" : "Status"} tone={remaining > 0 ? "warn" : "good"}>{remaining > 0 ? inr(remaining, currency) : "Fully paid"}</DetailRow>
      </Group>

      <div className="mt-4 flex justify-center">
        <TextButton tone="risk" onClick={onDelete}>Delete purchase</TextButton>
      </div>
      <div className="h-1" />
    </Sheet>
  );
}
