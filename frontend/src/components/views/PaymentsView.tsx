import { useMemo, useState } from "react";
import { DetailRow, EmptyNote } from "../ui/blocks";
import { ChevronDownIcon } from "../ui/icons";
import { Group, GroupLabel, GroupRow, SearchField, Segmented, Sheet, TextButton, cx } from "../ui/kit";
import { groupByRecency, sortNewest } from "../../lib/estimates";
import { inr, inrCompact, shortDate } from "../../lib/money";

/* ---- Payments ----
 * Money received, split four ways (advance, part payments, payments that settled a bill, refunds),
 * grouped by week and month like Estimates. Tap a row for the payment and the estimate it was against;
 * deleting lives there, not on the row, so a stray tap can't remove one. */

type TabKey = "advance" | "partial" | "full" | "refund";

const TABS: { key: TabKey; label: string; help: string; empty: string; kind: string }[] = [
  { key: "advance", label: "Advance", kind: "Advance or booking", help: "Deposits and bookings taken before a bill is raised.", empty: "Advance bookings and deposits will show up here." },
  { key: "partial", label: "Partial", kind: "Part payment", help: "Part payments on bills that are still open.", empty: "Partial payments will show up here." },
  { key: "full", label: "Received", kind: "Payment received", help: "Payments on bills that are now paid in full.", empty: "Completed payments will show up here." },
  { key: "refund", label: "Refunds", kind: "Refund", help: "Money paid back for returned items.", empty: "Refunds from returned items will show up here." },
];

const SEARCH_CAP = 80;

export function PaymentsView({ payments, customers, currency, openModal, removePayment, estimates = [] }: any) {
  const [tab, setTab] = useState<TabKey>("advance");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [capped, setCapped] = useState(true);

  const customerName = (id: string) => (customers || []).find((c: any) => c.id === id)?.name || "Unknown customer";
  const estimatesById = useMemo(() => Object.fromEntries((estimates || []).map((e: any) => [e.id, e])), [estimates]);

  const classify = (payment: any): TabKey => {
    if (payment.type) return payment.type as TabKey;
    const amount = Number(payment.amount || 0);
    if (amount < 0) return "refund";
    if (!payment.invoiceId) return "advance";
    const linkedId = typeof payment.invoiceId === "string" ? payment.invoiceId : payment.invoiceId?.id;
    const linkedEstimate = linkedId ? estimatesById[linkedId] : null;
    return linkedEstimate?.status === "Paid" ? "full" : "partial";
  };

  const grouped = useMemo(() => {
    const groups: Record<TabKey, any[]> = { advance: [], partial: [], full: [], refund: [] };
    (payments || []).forEach((p: any) => { groups[classify(p)].push(p); });
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, estimatesById]);

  const current = TABS.find((t) => t.key === tab)!;
  const activeList = grouped[tab] || [];
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = q
      ? activeList.filter((p: any) => customerName(p.customerId).toLowerCase().includes(q) || (p.invoiceNumber || "").toLowerCase().includes(q))
      : activeList;
    return sortNewest(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList, q, customers]);

  const sum = (list: any[]) => list.reduce((s, p) => s + Math.abs(Number(p.amount) || 0), 0);
  const groups = useMemo(() => (q ? [] : groupByRecency(filtered)), [filtered, q]);
  const isCollapsed = (key: string, index: number) => (collapsed[key] !== undefined ? collapsed[key] : index > 1);
  const opened = openId ? (payments || []).find((p: any) => p.id === openId) : null;

  const row = (p: any) => {
    const refund = Number(p.amount) < 0;
    return (
      <GroupRow key={p.id} onClick={() => setOpenId(p.id)} className="min-h-[64px] py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lead font-medium text-ink">{customerName(p.customerId)}</p>
            <p className="truncate text-caption text-mute">
              {shortDate(p.date)}{p.method ? `, ${p.method}` : ""},{" "}
              {p.invoiceNumber ? <span className="font-doc text-[12.5px]">{p.invoiceNumber}</span> : "not linked to an estimate"}
            </p>
          </div>
          <p className={cx("shrink-0 text-lead font-medium tabular-nums", refund ? "text-bad-600" : "text-good-600")}>{refund ? "−" : "+"}{inr(Math.abs(Number(p.amount)), currency)}</p>
        </div>
      </GroupRow>
    );
  };

  return (
    <div className="px-5 pb-28 md:pb-12">
      <div className="mt-4">
        <Segmented ariaLabel="Kind of payment" options={TABS.map((t) => ({ value: t.key, label: t.label }))} value={tab} onChange={(v) => { setTab(v as TabKey); setCapped(true); }} />
      </div>
      <SearchField className="mt-3 !h-11" value={search} onChange={setSearch} placeholder="Search customer or estimate number" />

      {(payments || []).length === 0 ? (
        <Group className="mt-4"><EmptyNote text="Payments you record against estimates will show up here." cta="Record payment" onCta={() => openModal("payment")} /></Group>
      ) : activeList.length === 0 ? (
        <>
          <GroupLabel>{current.help}</GroupLabel>
          <Group><EmptyNote text={current.empty} cta={tab === "refund" ? undefined : "Record payment"} onCta={() => openModal("payment")} /></Group>
        </>
      ) : filtered.length === 0 ? (
        <Group className="mt-4"><p className="px-4 py-8 text-center text-[15px] text-mute">No payments match “{search}”.</p></Group>
      ) : q ? (
        <>
          <GroupLabel right={<span>{filtered.length} payment{filtered.length === 1 ? "" : "s"}</span>}>Results</GroupLabel>
          <Group>{(capped ? filtered.slice(0, SEARCH_CAP) : filtered).map(row)}</Group>
          {capped && filtered.length > SEARCH_CAP && (
            <button type="button" onClick={() => setCapped(false)} className="mt-1 h-11 w-full text-[15px] font-medium text-brand-600">Show all {filtered.length}</button>
          )}
        </>
      ) : (
        <>
          <p className="mt-3 px-1 text-caption text-mute">{current.help}</p>
          {groups.map((g, i) => {
            const folded = g.collapsible && isCollapsed(g.key, i);
            return (
              <div key={g.key}>
                <GroupLabel right={<span className="tabular-nums">{inrCompact(sum(g.docs), currency)}</span>}>
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
          })}
        </>
      )}

      {opened && (
        <PaymentSheet
          payment={opened} name={customerName(opened.customerId)} kind={TABS.find((t) => t.key === classify(opened))!.kind}
          estimate={opened.invoiceId ? estimatesById[typeof opened.invoiceId === "string" ? opened.invoiceId : opened.invoiceId?.id] : null}
          currency={currency}
          onClose={() => setOpenId(null)}
          onOpenEstimate={(doc: any) => { setOpenId(null); openModal("viewEstimate", { doc }); }}
          onDelete={() => { setOpenId(null); removePayment(opened.id); }}
        />
      )}
    </div>
  );
}

function PaymentSheet({ payment, name, kind, estimate, currency, onClose, onOpenEstimate, onDelete }: any) {
  const refund = Number(payment.amount) < 0;
  return (
    <Sheet onClose={onClose} label={`Payment from ${name}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate text-section text-ink">{name}</h2>
        <p className={cx("shrink-0 text-section tabular-nums", refund ? "text-bad-600" : "text-good-600")}>{refund ? "−" : "+"}{inr(Math.abs(Number(payment.amount)), currency)}</p>
      </div>
      <p className="mt-0.5 text-[15px] text-mute">{kind}</p>

      <Group className="mt-4">
        <DetailRow label="Date">{shortDate(payment.date)}</DetailRow>
        <DetailRow label="Method">{payment.method || "Not recorded"}</DetailRow>
        {estimate
          ? <DetailRow label="Estimate" onClick={() => onOpenEstimate(estimate)}><span className="font-doc text-[15px] text-brand-600">{estimate.number}</span></DetailRow>
          : <DetailRow label="Estimate">{payment.invoiceNumber ? <span className="font-doc text-[15px]">{payment.invoiceNumber}</span> : "Not linked"}</DetailRow>}
      </Group>

      <div className="mt-4 flex justify-center">
        <TextButton tone="risk" onClick={onDelete}>Delete payment</TextButton>
      </div>
      <div className="h-1" />
    </Sheet>
  );
}
