import { useEffect, useMemo, useState } from "react";
import { IndianRupee, Phone } from "lucide-react";
import { ActionTile, EmptyNote } from "../ui/blocks";
import { WhatsAppIcon } from "../ui/icons";
import { Avatar, Group, GroupLabel, GroupRow, HeroMoney, SearchField, Segmented, Sheet, StatusChip, TextButton } from "../ui/kit";
import { api } from "../../lib/api";
import { waLink } from "../../lib/contactLinks";
import { round2 } from "../../lib/format";
import { inr, inrCompact, shortDate } from "../../lib/money";

/* ---- Vendors ----
 * Who you buy from and what you owe them: the vendors you owe first, then the ones you've settled.
 * Tap a row for the sheet: the amount owed, pay / WhatsApp / call, the bills still open, and the
 * statement of every purchase and payment. Deleting a vendor lives at the bottom of that sheet. */

type Filter = "all" | "owed";
const SEARCH_CAP = 80;
const byName = (a: any, b: any) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });

export function VendorsView({ vendors, purchases, currency, openModal, removeVendor }: any) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [capped, setCapped] = useState(true);

  const owedBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of purchases || []) m.set(String(p.vendorId), (m.get(String(p.vendorId)) || 0) + (Number(p.amount || 0) - Number(p.amountPaid || 0)));
    return m;
  }, [purchases]);
  const owedTo = (id: string) => { const v = round2(owedBy.get(String(id)) || 0); return v > 0 ? v : 0; };

  const q = search.trim().toLowerCase();
  const visible = useMemo(() => (vendors || [])
    .filter((v: any) => (filter === "all" || owedTo(v.id) > 0)
      && (!q || String(v.name || "").toLowerCase().includes(q) || String(v.phone || "").toLowerCase().includes(q) || String(v.location || "").toLowerCase().includes(q)))
    .sort(byName),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [vendors, owedBy, filter, q]);

  const owing = visible.filter((v: any) => owedTo(v.id) > 0).sort((a: any, b: any) => owedTo(b.id) - owedTo(a.id));
  const settled = visible.filter((v: any) => owedTo(v.id) === 0);
  const totalOwed = (vendors || []).reduce((s: number, v: any) => s + owedTo(v.id), 0);
  const owedCount = (vendors || []).filter((v: any) => owedTo(v.id) > 0).length;
  const opened = openId ? (vendors || []).find((v: any) => v.id === openId) : null;

  const row = (v: any) => {
    const owed = owedTo(v.id);
    return (
      <GroupRow key={v.id} onClick={() => setOpenId(v.id)} className="min-h-[64px] py-2.5">
        <div className="flex items-center gap-3">
          <Avatar name={v.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lead font-medium text-ink">{v.name}</p>
            <p className="truncate text-caption text-mute">{[v.phone || "No phone", v.location].filter(Boolean).join(", ")}</p>
          </div>
          <div className="shrink-0 text-right">
            {owed > 0
              ? <><p className="text-lead font-medium tabular-nums text-warn-700">{inr(owed, currency)}</p><p className="text-caption text-mute">You owe</p></>
              : <StatusChip tone="paid" small>Settled</StatusChip>}
          </div>
        </div>
      </GroupRow>
    );
  };

  return (
    <div className="px-5 pb-28 md:pb-12">
      {(vendors || []).length > 0 && (
        <p className="mt-3 px-1 text-caption text-mute">
          {totalOwed > 0 ? <>You owe <span className="tabular-nums text-warn-700">{inr(totalOwed, currency)}</span> across {owedCount} vendor{owedCount === 1 ? "" : "s"}</> : "You owe no vendor anything"}
        </p>
      )}
      <div className="mt-3">
        <Segmented ariaLabel="Filter vendors" value={filter} onChange={(v) => { setFilter(v as Filter); setCapped(true); }}
          options={[{ value: "all", label: "All" }, { value: "owed", label: owedCount > 0 ? `You owe (${owedCount})` : "You owe" }]} />
      </div>
      <SearchField className="mt-3 !h-11" value={search} onChange={setSearch} placeholder="Search name, phone or place" />

      {(vendors || []).length === 0 ? (
        <Group className="mt-4"><EmptyNote text="Add the vendors you buy from, and you'll see what you owe each of them." cta="New vendor" onCta={() => openModal("vendor")} /></Group>
      ) : visible.length === 0 ? (
        <Group className="mt-4"><p className="px-4 py-8 text-center text-[15px] text-mute">{q ? `No vendors match “${search}”.` : "You owe no vendor anything."}</p></Group>
      ) : q ? (
        <>
          <GroupLabel right={<span>{visible.length} vendor{visible.length === 1 ? "" : "s"}</span>}>Results</GroupLabel>
          <Group>{(capped ? [...owing, ...settled].slice(0, SEARCH_CAP) : [...owing, ...settled]).map(row)}</Group>
          {capped && visible.length > SEARCH_CAP && <button type="button" onClick={() => setCapped(false)} className="mt-1 h-11 w-full text-[15px] font-medium text-brand-600">Show all {visible.length}</button>}
        </>
      ) : (
        <>
          {owing.length > 0 && (
            <>
              <GroupLabel right={<span className="tabular-nums text-warn-700">{inrCompact(owing.reduce((s: number, v: any) => s + owedTo(v.id), 0), currency)}</span>}>You owe</GroupLabel>
              <Group>{owing.map(row)}</Group>
            </>
          )}
          {settled.length > 0 && (
            <>
              <GroupLabel right={<span>{settled.length}</span>}>Settled</GroupLabel>
              <Group>{settled.map(row)}</Group>
            </>
          )}
        </>
      )}

      {opened && (
        <VendorSheet
          vendor={opened} owed={owedTo(opened.id)} currency={currency}
          open={(purchases || []).filter((p: any) => String(p.vendorId) === String(opened.id) && p.paymentStatus !== "paid")}
          onClose={() => setOpenId(null)}
          onPayVendor={() => { setOpenId(null); openModal("vendorPayment", { vendorId: opened.id, vendorName: opened.name, amount: owedTo(opened.id) > 0 ? owedTo(opened.id) : undefined }); }}
          onPayPurchase={(p: any, remaining: number) => { setOpenId(null); openModal("purchasePayment", { purchaseId: p.id, vendorName: opened.name, remaining, pending: p.status !== "Received" }); }}
          onDelete={() => { setOpenId(null); removeVendor(opened.id); }}
        />
      )}
    </div>
  );
}

function VendorSheet({ vendor: v, owed, open, currency, onClose, onPayVendor, onPayPurchase, onDelete }: any) {
  const [statement, setStatement] = useState<any>(undefined); // undefined = loading, null = failed
  const [allRows, setAllRows] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatement(undefined);
    api.vendors.statement(v.id).then((s: any) => { if (!cancelled) setStatement(s); }).catch(() => { if (!cancelled) setStatement(null); });
    return () => { cancelled = true; };
  }, [v.id]);

  const rows: any[] = statement?.rows || [];
  // Newest first reads best on a phone; the server returns oldest first with a running balance.
  const shown = (allRows ? [...rows] : [...rows].slice(-30)).reverse();

  return (
    <Sheet onClose={onClose} label={`Vendor ${v.name}`}>
      <div className="flex items-center gap-3">
        <Avatar name={v.name} size={48} />
        <div className="min-w-0">
          <h2 className="truncate text-section text-ink">{v.name}</h2>
          <p className="truncate text-[15px] text-mute">{[v.phone, v.location].filter(Boolean).join(", ") || "No contact details"}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-caption text-mute">{owed > 0 ? "You owe" : "You owe nothing"}</p>
        <HeroMoney value={owed} currency={currency} size="md" showPaise={false} className={owed > 0 ? "!text-warn-700" : undefined} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <ActionTile icon={<IndianRupee size={22} />} label="Pay" onClick={onPayVendor} />
        <ActionTile icon={<WhatsAppIcon size={22} />} label="WhatsApp" disabled={!v.phone} href={v.phone ? waLink(v.phone, `Hi ${v.name}, `) : undefined} />
        <ActionTile icon={<Phone size={22} />} label="Call" disabled={!v.phone} href={v.phone ? `tel:${String(v.phone).replace(/[^\d+]/g, "")}` : undefined} />
      </div>

      {open.length > 0 && (
        <>
          <GroupLabel>Bills still open</GroupLabel>
          <Group>
            {open.map((p: any) => {
              const remaining = round2(Number(p.amount) - Number(p.amountPaid));
              return (
                <div key={p.id} className="flex min-h-[60px] items-center justify-between gap-3 border-t border-line px-4 py-2 first:border-t-0">
                  <div className="min-w-0">
                    <p className="truncate text-[16px] text-ink">{shortDate(p.date)}</p>
                    <p className="truncate text-caption tabular-nums text-mute">{inr(p.amount, currency)} total, {inr(remaining, currency)} to pay</p>
                  </div>
                  <TextButton className="shrink-0 px-1" onClick={() => onPayPurchase(p, remaining)}>Pay</TextButton>
                </div>
              );
            })}
          </Group>
        </>
      )}

      <GroupLabel right={rows.length > 30 && !allRows ? <button type="button" onClick={() => setAllRows(true)} className="font-medium text-brand-600">Show all {rows.length}</button> : undefined}>Statement</GroupLabel>
      <Group>
        {statement === undefined ? <p className="px-4 py-6 text-center text-[15px] text-mute">Loading…</p>
          : statement === null ? <p className="px-4 py-6 text-center text-[15px] text-bad-600">Couldn't load the statement. Close this and try again.</p>
          : shown.length === 0 ? <p className="px-4 py-6 text-center text-[15px] text-mute">No purchases or payments with this vendor yet.</p>
          : shown.map((row: any, i: number) => (
            <div key={i} className="flex min-h-[60px] items-center justify-between gap-3 border-t border-line px-4 py-2 first:border-t-0">
              <div className="min-w-0">
                <p className="truncate text-[16px] text-ink">{row.narration}</p>
                <p className="text-caption text-mute">{shortDate(row.date)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-[16px] tabular-nums ${row.type === "credit" ? "text-warn-700" : "text-good-600"}`}>{row.type === "credit" ? "+" : "−"}{inr(row.amount, currency)}</p>
                <p className="text-caption tabular-nums text-mute">Balance {inr(row.balance, currency)}</p>
              </div>
            </div>
          ))}
      </Group>

      <div className="mt-4 flex justify-center"><TextButton tone="risk" onClick={onDelete}>Delete vendor</TextButton></div>
      <div className="h-1" />
    </Sheet>
  );
}
