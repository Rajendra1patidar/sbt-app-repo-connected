import { useMemo, useState } from "react";
import { waLink } from "../../lib/contactLinks";
import { estimateState, localToday, paymentHabit } from "../../lib/estimates";
import { bookingLineProgress, isFullyCollected } from "../../lib/bookingLogic";
import { daysBetween, inr, shortDate } from "../../lib/money";
import { Group, GroupRow, InsightNote, Sheet, StatusChip, TextButton, cx } from "../ui/kit";
import { ChevronDownIcon, EditIcon, EyeIcon, PrintIcon, RestoreIcon, ReturnIcon, ShareIcon, TrashIcon, TruckIcon, WhatsAppIcon } from "../ui/icons";

/**
 * Tasks open as sheets: tap an estimate and everything about it is here —
 * where it stands, how this customer usually pays, the story so far, and the
 * one thing to do next (a WhatsApp reminder, or a receipt).
 */

interface TimelineEvent { key: string; label: string; date: string; note?: string; tone: "done" | "late" | "open" | "paid" }

function buildTimeline(doc: any, payments: any[], state: ReturnType<typeof estimateState>, todayStr: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const created = (doc.history || []).find((h: any) => h.action === "Created")?.date || doc.date;
  events.push({ key: "created", label: "Estimate created", date: String(created || doc.date || "").slice(0, 10), tone: "done" });

  for (const h of doc.history || []) {
    if (h.action === "Return recorded") events.push({ key: `ret-${h.date}-${events.length}`, label: "Items returned", date: String(h.date || "").slice(0, 10), note: h.note, tone: "done" });
    else if (h.action === "Collection recorded") events.push({ key: `col-${h.date}-${events.length}`, label: "Collected", date: String(h.date || "").slice(0, 10), note: h.note, tone: "done" });
    else if (h.action === "Deleted") events.push({ key: `del-${h.date}`, label: "Deleted", date: String(h.date || "").slice(0, 10), tone: "done" });
    else if (h.action === "Restored") events.push({ key: `res-${h.date}`, label: "Restored", date: String(h.date || "").slice(0, 10), tone: "done" });
  }

  const paid = payments.filter((p) => p.invoiceId === doc.id).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const p of paid) {
    const amt = Number(p.amount) || 0;
    events.push({ key: `pay-${p.id}`, label: amt >= 0 ? `Payment received, ${inr(amt)}` : `Refund paid, ${inr(Math.abs(amt))}`, date: String(p.date || "").slice(0, 10), tone: "done" });
  }

  events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const due = String(doc.dueDate || "").slice(0, 10);
  if (state.key === "paid") {
    const last = paid.filter((p) => Number(p.amount) > 0).slice(-1)[0];
    events.push({ key: "settled", label: "Paid in full", date: String(last?.date || todayStr).slice(0, 10), tone: "paid" });
  } else if (state.key === "overdue") {
    events.push({ key: "due", label: "Payment due", date: due, note: `${shortDate(due)}, ${state.daysLate} day${state.daysLate === 1 ? "" : "s"} late`, tone: "late" });
  } else if (state.key !== "void" && due) {
    const left = daysBetween(todayStr, due);
    events.push({ key: "due", label: "Payment due", date: due, note: left === 0 ? "Today" : `${shortDate(due)}, in ${left} day${left === 1 ? "" : "s"}`, tone: "open" });
  }
  return events;
}

export function EstimateDetailSheet({ doc, customers, items, payments, estimates, currency, onClose, onEdit, onView, onRecordPayment, onReturn, onDeliver, onShare, onPrint, onPortal, onDelete, onRestore, onNoPhone }: any) {
  const [more, setMore] = useState(false);
  const todayStr = localToday();
  const customer = (customers || []).find((c: any) => c.id === doc.customerId);
  const name = customer?.name || "Unknown customer";
  const state = estimateState(doc, todayStr);
  const timeline = useMemo(() => buildTimeline(doc, payments || [], state, todayStr), [doc, payments, state, todayStr]);
  const habit = useMemo(() => (state.key === "overdue" || state.key === "due" || state.key === "partial" ? paymentHabit(doc, estimates || [], payments || []) : null), [doc, estimates, payments, state.key]);
  const canCollect = doc.isAdvanceBooking && (doc.lines || []).length > 0 && !isFullyCollected(doc);
  const advanceRows = doc.isAdvanceBooking ? bookingLineProgress(doc).filter((r: any) => r.remaining > 0) : [];

  const caption = (() => {
    if (state.key === "void") return "deleted";
    if (state.key === "paid") return "paid in full";
    if (state.key === "overdue") return `due since ${shortDate(doc.dueDate)}`;
    if (state.key === "partial") return `${inr(state.balance, currency)} left`;
    const due = String(doc.dueDate || "").slice(0, 10);
    return due === todayStr ? "due today" : due ? `due ${shortDate(due)}` : "no due date";
  })();

  const reminder = `Hi ${name}, this is a reminder about estimate ${doc.number} for ${inr(state.balance || doc.total, currency)}. Please let us know if you have any questions.`;
  const billMsg = `Hi ${name}, here is your estimate ${doc.number} for ${inr(doc.total, currency)}.`;
  const needsReminder = state.key === "overdue" || state.key === "due" || state.key === "partial";
  const primary = needsReminder
    ? { label: "Send reminder on WhatsApp", msg: reminder }
    : { label: state.key === "paid" ? "Send receipt on WhatsApp" : "Send on WhatsApp", msg: state.key === "paid" ? `Hi ${name}, thank you for the payment on estimate ${doc.number}.` : billMsg };

  const run = (fn?: () => void) => () => { onClose(); fn?.(); };

  return (
    <Sheet onClose={onClose} label={`Estimate ${doc.number}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className={cx("min-w-0 truncate text-section text-ink", state.key === "void" && "line-through opacity-60")}>{name}</h2>
        <p className="shrink-0 text-section tabular-nums text-ink">{inr(doc.total, currency)}</p>
      </div>
      <p className="mt-0.5 text-[15px] text-mute">
        <span className="font-doc text-[14px]">{doc.number}</span>, {caption}
        {doc._offlinePending && <StatusChip tone="partial" dot={false} small className="ml-2 align-middle">Pending sync</StatusChip>}
      </p>

      {habit && habit.late > 0 && (
        <InsightNote className="mt-3.5">Paid {habit.late} of the last {habit.of} estimates after the due date.</InsightNote>
      )}
      {habit && habit.late === 0 && (
        <InsightNote className="mt-3.5">Paid all of the last {habit.of} estimates on time.</InsightNote>
      )}

      {advanceRows.length > 0 && (
        <div className="mt-3.5 rounded-control bg-brand-50 px-3 py-2.5 text-[14px] leading-[19px] text-brand-600">
          <p className="font-semibold">Advance booking, collection pending</p>
          {advanceRows.map((r: any) => (
            <p key={r.itemId}>{items?.find?.((it: any) => it.id === r.itemId)?.name || "Item"}: {r.remaining} of {r.booked} left{r.delivered > 0 ? ` (${r.delivered} collected)` : ""}</p>
          ))}
        </div>
      )}

      {/* Timeline */}
      <ol className="mt-5 list-none p-0">
        {timeline.map((ev, i) => {
          const last = i === timeline.length - 1;
          const ring = ev.tone === "late" || ev.tone === "open";
          return (
            <li key={ev.key} className={cx("relative pl-[34px]", !last && "pb-3.5")}>
              {!last && <span className="absolute left-[6px] top-[18px] -bottom-0.5 w-0.5 bg-edge" />}
              <span className={cx(
                "absolute left-0 top-[3px] h-3.5 w-3.5 rounded-full",
                ring ? cx("border-2 bg-card", ev.tone === "late" ? "border-bad-500" : "border-brand-500") : ev.tone === "paid" ? "bg-good-500" : "bg-brand-500",
              )} />
              <div className="flex items-baseline justify-between gap-3">
                <span className={cx("text-[16px]", ev.tone === "late" ? "font-medium text-bad-600" : "text-ink")}>{ev.label}</span>
                <span className={cx("shrink-0 text-[15px] tabular-nums", ev.tone === "late" ? "font-medium text-bad-600" : "text-mute")}>
                  {ev.tone === "late" || (ev.tone === "open" && ev.note) ? ev.note : shortDate(ev.date)}
                </span>
              </div>
              {ev.note && ev.tone === "done" && <p className="text-caption text-mute">{ev.note}</p>}
            </li>
          );
        })}
      </ol>

      {/* Actions */}
      <div className="mt-6">
        {customer?.phone ? (
          <a href={waLink(customer.phone, primary.msg)} target="_blank" rel="noreferrer"
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-brand-500 text-[16px] font-semibold text-white transition active:scale-[0.985]">
            <WhatsAppIcon size={20} /> {primary.label}
          </a>
        ) : (
          <button type="button" onClick={() => onNoPhone?.(customer)} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-brand-500 text-[16px] font-semibold text-white transition active:scale-[0.985]">
            <WhatsAppIcon size={20} /> {primary.label}
          </button>
        )}
        <div className="mt-1 flex items-center justify-center gap-2">
          {state.key !== "paid" && state.key !== "void" && !canCollect && (
            <TextButton onClick={run(() => onRecordPayment(doc))}>Record payment</TextButton>
          )}
          {canCollect && <TextButton onClick={run(() => onDeliver(doc))}>Record collection</TextButton>}
          <TextButton tone="quiet" onClick={() => setMore((m) => !m)} aria-expanded={more} className="inline-flex items-center gap-1">
            More <ChevronDownIcon size={16} className={cx("transition-transform", more && "rotate-180")} />
          </TextButton>
        </div>
      </div>

      {more && (
        <Group className="mt-2">
          {state.key !== "void" && <ActionRow icon={<EditIcon size={20} />} label="Edit estimate" onClick={run(() => onEdit(doc))} />}
          {state.key !== "void" && (doc.lines || []).length > 0 && <ActionRow icon={<ReturnIcon size={20} />} label="Return items" onClick={run(() => onReturn(doc))} />}
          {state.key !== "void" && canCollect && state.key !== "paid" && <ActionRow icon={<TruckIcon size={20} />} label="Record collection" onClick={run(() => onDeliver(doc))} />}
          <ActionRow icon={<ShareIcon size={20} />} label="Share bill" onClick={run(() => onShare(doc))} />
          <ActionRow icon={<PrintIcon size={20} />} label="Print" onClick={run(() => onPrint(doc))} />
          {doc.isAdvanceBooking && onPortal && <ActionRow icon={<EyeIcon size={20} />} label="Send customer portal access" onClick={run(() => onPortal(doc.customerId))} />}
          <ActionRow icon={<EyeIcon size={20} />} label="Full details" onClick={run(() => onView(doc))} />
          {state.key === "void"
            ? <ActionRow icon={<RestoreIcon size={20} />} label="Restore estimate" onClick={run(() => onRestore(doc.id))} />
            : <ActionRow icon={<TrashIcon size={20} />} label="Delete estimate" danger onClick={run(() => onDelete(doc.id))} />}
        </Group>
      )}
      <div className="h-2" />
    </Sheet>
  );
}

function ActionRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <GroupRow onClick={onClick} className="h-[52px]">
      <div className={cx("flex items-center gap-3 text-[16px]", danger ? "text-bad-600" : "text-ink")}>
        <span className={danger ? "text-bad-600" : "text-mute"}>{icon}</span>
        {label}
      </div>
    </GroupRow>
  );
}
