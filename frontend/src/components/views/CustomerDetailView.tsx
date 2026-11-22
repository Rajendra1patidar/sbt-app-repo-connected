import { useEffect, useMemo, useState } from "react";
import { CustomerPortalSharePopup } from "../modals/CustomerPortalSharePopup";
import { ActionTile, EmptyNote } from "../ui/blocks";
import { EditIcon, KeyIcon, MessageIcon, PinIcon, WhatsAppIcon } from "../ui/icons";
import { Group, GroupLabel, GroupRow, HeroMoney, LargeTitle, PrimaryButton, Segmented, SecondaryButton, StatusChip, TextButton, cx } from "../ui/kit";
import { api } from "../../lib/api";
import { smsLink, waLink } from "../../lib/contactLinks";
import { estimateState, localToday, sortNewest } from "../../lib/estimates";
import { inr, shortDate } from "../../lib/money";

/* ---- Customer detail ----
 * The title and the "Customers" back link come from the shell; this draws the person: what they
 * owe, the two things you do for them (a new estimate, a payment), how to reach them, and their
 * history one tab at a time (estimates, payments, the ledger statement). */

type Tab = "estimates" | "payments" | "statement";
const STATEMENT_TAIL = 30; // the latest rows show first; "Show earlier entries" brings the rest

export function CustomerDetailView({ customer, estimates, payments, currency, openModal, onBack, role, onRestore }: any) {
  const [showPortalShare, setShowPortalShare] = useState(false);
  const [statement, setStatement] = useState<any>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("estimates");
  const [allRows, setAllRows] = useState(false);

  useEffect(() => {
    if (!customer?.id) return;
    setStatementLoading(true);
    api.ledger.customerStatement(customer.id)
      .then((s: any) => setStatement(s))
      .catch(() => setStatement(null))
      .finally(() => setStatementLoading(false));
  }, [customer?.id]);

  const todayStr = localToday();
  const custEstimates = useMemo(
    () => sortNewest((estimates || []).filter((e: any) => String(e.customerId) === String(customer?.id))),
    [estimates, customer?.id],
  );
  const custPayments = useMemo(
    () => (payments || [])
      .filter((p: any) => String(p.customerId) === String(customer?.id))
      .sort((a: any, b: any) => (b.date || "").localeCompare(a.date || "")),
    [payments, customer?.id],
  );

  if (!customer) {
    return (
      <div className="px-5 pb-28 pt-6">
        <Group><EmptyNote text="This customer wasn't found. They may have been removed on another device." cta="Back to customers" onCta={onBack} /></Group>
      </div>
    );
  }

  const isStaff = role === "staff";
  const archived = !!customer.archived;
  const balance = Math.round(custEstimates.reduce((s: number, e: any) => s + (Number(e.total || 0) - Number(e.amountPaid || 0)), 0) * 100) / 100;
  const overdueCount = custEstimates.filter((e: any) => estimateState(e, todayStr).key === "overdue").length;
  const limit = customer.creditLimit != null && Number(customer.creditLimit) > 0 ? Number(customer.creditLimit) : null;
  const overLimit = limit != null && balance > limit;
  const msg = `Hi ${customer.name}, reaching out from ${customer.name}'s account.`;
  const mapsHref = customer.lat && customer.lng
    ? `https://www.google.com/maps/search/?api=1&query=${customer.lat},${customer.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.location || "")}`;
  const contact = [customer.phone, customer.email].filter(Boolean).join(", ") || "No phone or email yet";

  const rows: any[] = statement?.rows || [];
  const shownRows = allRows ? rows : rows.slice(-STATEMENT_TAIL);

  return (
    <div className="px-5 pb-28 md:pb-12">
      {showPortalShare && <CustomerPortalSharePopup customer={customer} onClose={() => setShowPortalShare(false)} />}

      <LargeTitle
        className="!pt-0.5"
        title={customer.name}
        subtitle={
          <>
            <span className="block truncate">{contact}</span>
            {customer.location && (
              <a href={mapsHref} target="_blank" rel="noreferrer" className="mt-0.5 flex min-h-[28px] items-center gap-1 text-brand-600 active:opacity-60">
                <PinIcon size={14} /> <span className="truncate">{customer.location}</span>
              </a>
            )}
          </>
        }
      />

      {archived && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-control bg-chip px-3.5 py-1.5">
          <p className="py-1.5 text-[14px] leading-[19px] text-chipText">Archived. Hidden from your customer list and pickers; everything below is kept.</p>
          {!isStaff && onRestore && <TextButton onClick={() => onRestore(customer.id)} className="shrink-0 text-[15px]">Restore</TextButton>}
        </div>
      )}

      {/* What they owe */}
      <Group className="mt-4 px-4 py-4">
        <p className="text-caption text-mute">{balance < 0 ? "Paid in advance" : "Balance due"}</p>
        <HeroMoney value={Math.abs(balance)} size="md" showPaise={Math.abs(balance) % 1 !== 0} className="mt-0.5" />
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {balance <= 0 && custEstimates.length > 0 && <StatusChip tone="paid">All settled</StatusChip>}
          {overdueCount > 0 && <StatusChip tone="overdue">{overdueCount} overdue</StatusChip>}
          {overLimit && <StatusChip tone="risk">Over credit limit</StatusChip>}
          <span className="text-caption text-mute">{limit != null ? `Credit limit ${inr(limit, currency)}` : "No credit limit set"}</span>
        </div>
      </Group>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <PrimaryButton size="md" disabled={archived} onClick={() => openModal("estimate", { customerId: customer.id })}>New estimate</PrimaryButton>
        <SecondaryButton onClick={() => openModal("payment", { customerId: customer.id })}>Record payment</SecondaryButton>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        <ActionTile icon={<WhatsAppIcon size={22} />} label="WhatsApp" disabled={!customer.phone} href={customer.phone ? waLink(customer.phone, msg) : undefined} />
        <ActionTile icon={<MessageIcon size={22} />} label="Message" disabled={!customer.phone} href={customer.phone ? smsLink(customer.phone, msg) : undefined} />
        <ActionTile icon={<KeyIcon size={22} />} label="Account link" onClick={() => setShowPortalShare(true)} />
        <ActionTile icon={<EditIcon size={22} />} label="Edit" onClick={() => openModal("customer", { editingCustomer: customer })} />
      </div>

      {/* History */}
      <div className="mt-6">
        <Segmented
          ariaLabel="Customer history"
          options={[
            { value: "estimates", label: `Estimates (${custEstimates.length})` },
            { value: "payments", label: `Payments (${custPayments.length})` },
            { value: "statement", label: "Statement" },
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
      </div>

      {tab === "estimates" && (
        <Group className="mt-3">
          {custEstimates.length === 0 ? <EmptyNote text="No estimates yet." /> : custEstimates.map((e: any) => {
            const s = estimateState(e, todayStr);
            return (
              <GroupRow key={e.id} onClick={() => openModal("viewEstimate", { doc: e })} className="min-h-[64px] py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lead font-medium tabular-nums text-ink">{inr(e.total, currency)}</p>
                    <p className="truncate text-caption text-mute">
                      <span className="font-doc text-[12.5px]">{e.number}</span>, {shortDate(e.date)}
                      {(s.key === "partial" || s.key === "overdue") && s.paid > 0 && s.balance > 0 && <span>, {inr(s.balance, currency)} left</span>}
                    </p>
                  </div>
                  <StatusChip tone={s.tone} className="shrink-0">{s.label}</StatusChip>
                </div>
              </GroupRow>
            );
          })}
        </Group>
      )}

      {tab === "payments" && (
        <Group className="mt-3">
          {custPayments.length === 0 ? <EmptyNote text="No payments yet." /> : custPayments.map((p: any) => {
            const refund = Number(p.amount) < 0;
            return (
              <GroupRow key={p.id} className="min-h-[60px] py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lead font-medium text-ink">
                      {p.invoiceNumber ? <span className="font-doc text-[15px]">{p.invoiceNumber}</span> : "Advance, not linked to an estimate"}
                    </p>
                    <p className="truncate text-caption text-mute">{shortDate(p.date)}{p.method ? `, ${p.method}` : ""}</p>
                  </div>
                  <p className={cx("shrink-0 text-lead font-medium tabular-nums", refund ? "text-bad-600" : "text-good-600")}>{refund ? "−" : "+"}{inr(Math.abs(Number(p.amount)), currency)}</p>
                </div>
              </GroupRow>
            );
          })}
        </Group>
      )}

      {tab === "statement" && (
        statementLoading ? (
          <Group className="mt-3"><p className="px-4 py-8 text-center text-[15px] text-mute">Loading the statement…</p></Group>
        ) : !statement || rows.length === 0 ? (
          <Group className="mt-3"><EmptyNote text="No ledger activity yet." /></Group>
        ) : (
          <>
            {rows.length > STATEMENT_TAIL && !allRows && (
              <button type="button" onClick={() => setAllRows(true)} className="mt-1 h-11 w-full text-[15px] font-medium text-brand-600">Show earlier entries ({rows.length - STATEMENT_TAIL})</button>
            )}
            <GroupLabel>Ledger statement</GroupLabel>
            <Group>
              {shownRows.map((r: any, i: number) => (
                <GroupRow key={i} className="min-h-[60px] py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[16px] text-ink">{r.narration}</p>
                      <p className="truncate text-caption text-mute">{shortDate(r.date)}, {r.account}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[16px] font-medium tabular-nums text-ink">{r.type === "debit" ? "Dr" : "Cr"} {inr(r.amount, currency)}</p>
                      <p className="text-caption tabular-nums text-mute">Balance {inr(r.balance, currency)}</p>
                    </div>
                  </div>
                </GroupRow>
              ))}
              <GroupRow className="min-h-[56px] bg-paper py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[16px] font-medium text-ink">Closing balance</span>
                  <span className={cx("text-lead font-medium tabular-nums", statement.closingBalance > 0 ? "text-bad-600" : "text-good-600")}>{inr(statement.closingBalance, currency)}</span>
                </div>
              </GroupRow>
            </Group>
          </>
        )
      )}
    </div>
  );
}
