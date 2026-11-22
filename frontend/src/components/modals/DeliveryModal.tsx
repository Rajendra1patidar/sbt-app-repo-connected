import { useState } from "react";
import { FormSheet } from "../ui/blocks";
import { Group, GroupRow, Stepper } from "../ui/kit";
import { bookingLineProgress } from "../../lib/bookingLogic";
import { qtyText } from "../../lib/money";

/** Record collection: how much of each booked item the customer is taking right now. */
export function DeliveryModal({ doc, items, onClose, onSave }: any) {
  const rows = bookingLineProgress(doc)
    .filter((r: any) => r.remaining > 0)
    .map((r: any) => ({ ...r, name: items.find((it: any) => it.id === r.itemId)?.name || "Item" }));

  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  // Typing more than what's left snaps back to what's left, so the number on screen is the number that saves.
  const setQty = (r: any, v: string) => setQtyMap((m) => ({ ...m, [r.itemId]: v !== "" && Number(v) > r.remaining ? String(r.remaining) : v }));

  const lines = rows
    .map((r: any) => ({ ...r, collectQty: Math.min(Number(qtyMap[r.itemId] || 0), r.remaining) }))
    .filter((r: any) => r.collectQty > 0);
  const canSave = lines.length > 0;

  return (
    <FormSheet title="Record collection" onClose={onClose} dirty={lines.length > 0} canSave={canSave} saveLabel="Record collection"
      onSave={() => canSave && onSave(lines.map((l: any) => ({ itemId: l.itemId, qty: l.collectQty })))}>
      <p className="text-[15px] leading-[21px] text-mute">
        <span className="font-doc text-[14px]">{doc.number}</span>: how much of each booked item is the customer taking now? It can't be more than what's left.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 rounded-control bg-paper px-3 py-3 text-[15px] text-mute">Everything booked on this estimate has already been collected.</p>
      ) : (
        <Group className="mt-4">
          {rows.map((r: any) => (
            <GroupRow key={r.itemId} className="min-h-[68px] py-2.5">
              <div className="flex w-full items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-medium text-ink">{r.name}</p>
                  <p className="text-caption text-mute">
                    {qtyText(r.remaining)} of {qtyText(r.booked)} left{r.delivered > 0 ? `, ${qtyText(r.delivered)} collected so far` : ""}
                  </p>
                </div>
                <Stepper label={r.name} decimals max={r.remaining} value={qtyMap[r.itemId] ?? "0"} onChange={(v) => setQty(r, v)} />
              </div>
            </GroupRow>
          ))}
        </Group>
      )}
    </FormSheet>
  );
}
