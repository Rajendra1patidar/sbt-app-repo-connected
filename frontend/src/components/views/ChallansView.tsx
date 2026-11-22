import { useMemo, useState } from "react";
import { DetailRow, EmptyNote } from "../ui/blocks";
import { ChevronDownIcon } from "../ui/icons";
import { Group, GroupLabel, GroupRow, SearchField, Segmented, Sheet, StatusChip, TextButton, cx } from "../ui/kit";
import { groupByRecency, sortNewest } from "../../lib/estimates";
import { inr, shortDate } from "../../lib/money";

/* ---- Delivery challans ----
 * The route sheet for a trip: where it went, who took it, what the trip cost and brought in, and the
 * delivery fee (which someone should check). Grouped by when the trip started, like Estimates.
 * Tap a row for the figures; the status (Pending / Delivered) and delete live in that sheet. */

type Filter = "all" | "Pending" | "Delivered";
const SEARCH_CAP = 80;

const sum = (rows?: { amount?: number }[]) => (rows || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
const statusTone = (s?: string) => (s === "Delivered" ? "paid" : "partial");

export function ChallansView({ docs, currency, openModal, removeDoc, updateStatus }: any) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [capped, setCapped] = useState(true);

  // Trips are dated by the day they start; the shared grouping reads `date`.
  const dated = useMemo(() => (docs || []).map((d: any) => ({ ...d, date: d.fromDate || d.date || String(d.createdAt || "").slice(0, 10) })), [docs]);
  const q = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const list = dated.filter((d: any) => {
      if (filter !== "all" && d.status !== filter) return false;
      if (!q) return true;
      return [d.route, d.number, d.byWhom, d.transporter].some((s) => String(s || "").toLowerCase().includes(q));
    });
    return sortNewest(list);
  }, [dated, filter, q]);

  const groups = useMemo(() => (q ? [] : groupByRecency(visible)), [visible, q]);
  const isCollapsed = (key: string, index: number) => (collapsed[key] !== undefined ? collapsed[key] : index > 1);
  const opened = openId ? dated.find((d: any) => d.id === openId) : null;
  const pendingCount = dated.filter((d: any) => d.status === "Pending").length;

  const row = (d: any) => {
    const fee = Number(d.deliveryFee) || 0;
    const people = [d.byWhom && `By ${d.byWhom}`, d.transporter && `via ${d.transporter}`].filter(Boolean).join(", ");
    return (
      <GroupRow key={d.id} onClick={() => setOpenId(d.id)} className="min-h-[68px] py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lead font-medium text-ink">{d.route || "No route"}</p>
            <p className="truncate text-caption text-mute">
              <span className="font-doc text-[12.5px]">{d.number}</span>, {shortDate(d.fromDate)}{d.toDate && d.toDate !== d.fromDate ? ` to ${shortDate(d.toDate)}` : ""}
            </p>
            {people && <p className="truncate text-caption text-mute">{people}</p>}
          </div>
          <div className="shrink-0 text-right">
            {fee > 0 && <p className="text-lead font-medium tabular-nums text-ink">{inr(fee, currency)}</p>}
            <StatusChip tone={statusTone(d.status)} className={fee > 0 ? "mt-1" : ""}>{d.status || "Pending"}</StatusChip>
            {fee > 0 && !d.feeVerified && <p className="mt-0.5 text-micro text-warn-700">Fee not verified</p>}
          </div>
        </div>
      </GroupRow>
    );
  };

  return (
    <div className="px-5 pb-28 md:pb-12">
      <div className="mt-4">
        <Segmented
          ariaLabel="Filter challans"
          options={[{ value: "all", label: "All" }, { value: "Pending", label: pendingCount > 0 ? `Pending (${pendingCount})` : "Pending" }, { value: "Delivered", label: "Delivered" }]}
          value={filter}
          onChange={(v) => { setFilter(v as Filter); setCapped(true); }}
        />
      </div>
      <SearchField className="mt-3 !h-11" value={search} onChange={setSearch} placeholder="Search route, number or driver" />

      {(docs || []).length === 0 ? (
        <Group className="mt-4"><EmptyNote text="Create a delivery challan for each trip to track the goods sent, what it cost and the delivery fee." cta="New challan" onCta={() => openModal("challan")} /></Group>
      ) : visible.length === 0 ? (
        <Group className="mt-4"><p className="px-4 py-8 text-center text-[15px] text-mute">{q ? "No challans match your search." : "Nothing here."}</p></Group>
      ) : q ? (
        <>
          <GroupLabel right={<span>{visible.length} challan{visible.length === 1 ? "" : "s"}</span>}>Results</GroupLabel>
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
              <GroupLabel right={<span>{g.docs.length} trip{g.docs.length === 1 ? "" : "s"}</span>}>
                {g.collapsible ? (
                  <button type="button" onClick={() => setCollapsed({ ...collapsed, [g.key]: !folded })} aria-expanded={!folded} className="inline-flex min-h-[28px] items-center gap-1">
                    <ChevronDownIcon size={14} className={cx("transition-transform", folded && "-rotate-90")} />
                    {g.label}
                  </button>
                ) : g.label}
              </GroupLabel>
              {!folded && <Group>{g.docs.map(row)}</Group>}
            </div>
          );
        })
      )}

      {opened && (
        <ChallanSheet
          doc={opened} currency={currency} onClose={() => setOpenId(null)}
          onStatus={(s: string) => updateStatus(opened.id, s)}
          onDelete={() => { setOpenId(null); removeDoc(opened.id); }}
        />
      )}
    </div>
  );
}

function ChallanSheet({ doc, currency, onClose, onStatus, onDelete }: any) {
  const expenses = sum(doc.expenses);
  const incomes = sum(doc.incomes);
  const fee = Number(doc.deliveryFee) || 0;
  const lines = (title: string, rows: any[] | undefined, tone: "good" | "bad") => {
    const filled = (rows || []).filter((r) => (r.label || "").trim() || Number(r.amount));
    if (filled.length === 0) return null;
    return (
      <>
        <GroupLabel>{title}</GroupLabel>
        <Group>
          {filled.map((r, i) => <DetailRow key={i} label={r.label || "Unnamed"} tone={tone}>{inr(Number(r.amount) || 0, currency)}</DetailRow>)}
        </Group>
      </>
    );
  };

  return (
    <Sheet onClose={onClose} label={`Challan ${doc.number}`}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 truncate text-section text-ink">{doc.route || "No route"}</h2>
        <StatusChip tone={statusTone(doc.status)} className="mt-1 shrink-0">{doc.status || "Pending"}</StatusChip>
      </div>
      <p className="mt-0.5 text-[15px] text-mute">
        <span className="font-doc text-[14px]">{doc.number}</span>, {shortDate(doc.fromDate)}{doc.toDate && doc.toDate !== doc.fromDate ? ` to ${shortDate(doc.toDate)}` : ""}
      </p>

      <div className="mt-4">
        <Segmented ariaLabel="Delivery status" options={["Pending", "Delivered"]} value={doc.status || "Pending"} onChange={onStatus} />
      </div>

      <Group className="mt-4">
        {doc.byWhom && <DetailRow label="By">{doc.byWhom}</DetailRow>}
        {doc.transporter && <DetailRow label="Via">{doc.transporter}</DetailRow>}
        <DetailRow label="Expenses" tone={expenses > 0 ? "bad" : undefined}>{inr(expenses, currency)}</DetailRow>
        <DetailRow label="Income" tone={incomes > 0 ? "good" : undefined}>{inr(incomes, currency)}</DetailRow>
        <DetailRow label="Delivery fee">{fee > 0 ? inr(fee, currency) : "None"}</DetailRow>
        {fee > 0 && <DetailRow label="Fee checked" tone={doc.feeVerified ? "good" : "warn"}>{doc.feeVerified ? "Verified" : "Not verified"}</DetailRow>}
        <DetailRow label="Net">{inr(Number(doc.total) || 0, currency)}</DetailRow>
      </Group>

      {lines("Expenses", doc.expenses, "bad")}
      {lines("Income", doc.incomes, "good")}

      <div className="mt-4 flex justify-center">
        <TextButton tone="risk" onClick={onDelete}>Delete challan</TextButton>
      </div>
      <div className="h-1" />
    </Sheet>
  );
}
