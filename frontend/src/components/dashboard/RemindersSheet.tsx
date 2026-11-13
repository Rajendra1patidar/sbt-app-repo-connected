import { useMemo } from "react";
import { WHATSAPP_GREEN } from "../../lib/constants";
import { waLink } from "../../lib/contactLinks";
import { estimateState, localToday } from "../../lib/estimates";
import { inr } from "../../lib/money";
import { Group, GroupRow, Sheet } from "../ui/kit";
import { WhatsAppIcon } from "../ui/icons";

/** "Send reminders": every customer with an overdue bill, one WhatsApp message each. */
export function RemindersSheet({ estimates, customers, currency, onClose, onNoPhone }: {
  estimates: any[]; customers: any[]; currency: string; onClose: () => void; onNoPhone: (customer: any) => void;
}) {
  const rows = useMemo(() => {
    const t = localToday();
    const by = new Map<string, { customer: any; docs: any[]; balance: number; worst: number }>();
    for (const e of estimates) {
      const s = estimateState(e, t);
      if (s.key !== "overdue") continue;
      const c = customers.find((x) => x.id === e.customerId);
      const key = e.customerId || e.id;
      const cur = by.get(key) || { customer: c, docs: [], balance: 0, worst: 0 };
      cur.docs.push(e); cur.balance += s.balance; cur.worst = Math.max(cur.worst, s.daysLate);
      by.set(key, cur);
    }
    return [...by.values()].sort((a, b) => b.balance - a.balance);
  }, [estimates, customers]);

  const messageFor = (r: { customer: any; docs: any[]; balance: number }) => {
    const name = r.customer?.name || "there";
    if (r.docs.length === 1) return `Hi ${name}, this is a reminder about estimate ${r.docs[0].number} for ${inr(r.balance, currency)}. Please let us know if you have any questions.`;
    return `Hi ${name}, this is a reminder about ${r.docs.length} estimates (${r.docs.map((d) => d.number).join(", ")}) totalling ${inr(r.balance, currency)}. Please let us know if you have any questions.`;
  };

  return (
    <Sheet onClose={onClose} title="Send reminders" label="Send reminders">
      <p className="-mt-1 mb-3 text-caption text-mute">One WhatsApp message per customer. You send each one yourself.</p>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-[15px] text-mute">Nothing is overdue.</p>
      ) : (
        <Group>
          {rows.map((r) => {
            const phone = r.customer?.phone;
            return (
              <GroupRow key={r.customer?.id || r.docs[0].id} className="min-h-[64px] py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-medium text-ink">{r.customer?.name || "Unknown customer"}</p>
                    <p className="text-caption text-mute"><span className="tabular-nums">{inr(r.balance, currency)}</span>, {r.worst} day{r.worst === 1 ? "" : "s"} late{r.docs.length > 1 ? ` · ${r.docs.length} bills` : ""}</p>
                  </div>
                  {phone ? (
                    <a href={waLink(phone, messageFor(r))} target="_blank" rel="noreferrer"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold text-white active:scale-95"
                      style={{ backgroundColor: WHATSAPP_GREEN }}>
                      <WhatsAppIcon size={16} /> Remind
                    </a>
                  ) : (
                    <button type="button" onClick={() => onNoPhone(r.customer)} className="h-9 shrink-0 rounded-full border border-rule px-3.5 text-[14px] font-semibold text-brand-500 active:scale-95">
                      Add phone
                    </button>
                  )}
                </div>
              </GroupRow>
            );
          })}
        </Group>
      )}
    </Sheet>
  );
}
