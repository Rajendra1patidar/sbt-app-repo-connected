import { useState } from "react";
import { FormSheet } from "../ui/blocks";
import { Group, GroupRow, Stepper } from "../ui/kit";
import { round2 } from "../../lib/format";
import { inr, inrRate, qtyText } from "../../lib/money";

/** Return items: how many of each item came back, and the refund that comes with it. */
export function ReturnModal({ doc, items, currency, onClose, onSave }: any) {
  const alreadyReturned: Record<string, number> = {};
  const alreadyReturnedPieces: Record<string, number> = {};
  for (const r of doc.returns || []) {
    alreadyReturned[r.itemId] = (alreadyReturned[r.itemId] || 0) + r.qty;
    alreadyReturnedPieces[r.itemId] = (alreadyReturnedPieces[r.itemId] || 0) + Number(r.piecesQty || 0);
  }

  const returnableLines = (doc.lines || [])
    .map((l: any) => {
      const it = items.find((i: any) => i.id === l.itemId);
      return {
        itemId: l.itemId,
        rate: l.rate,
        qty: l.qty,
        piecesQty: l.piecesQty,
        returned: alreadyReturned[l.itemId] || 0,
        returnedPieces: alreadyReturnedPieces[l.itemId] || 0,
        isWeight: it?.trackingMode === "weight",
        name: it?.name || "Item",
      };
    })
    .filter((l: any) => l.qty - l.returned > 0 || (l.isWeight && Number(l.piecesQty || 0) - l.returnedPieces > 0));

  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [piecesMap, setPiecesMap] = useState<Record<string, string>>({});
  // Typing more than what can still be returned snaps back to that limit, so the number on screen is the number that saves.
  const clamp = (v: string, max: number) => (v !== "" && Number(v) > max ? String(max) : v);
  const setQty = (l: any, v: string) => setQtyMap((m) => ({ ...m, [l.itemId]: clamp(v, l.qty - l.returned) }));
  const setPieces = (l: any, v: string) => setPiecesMap((m) => ({ ...m, [l.itemId]: clamp(v, Number(l.piecesQty || 0) - l.returnedPieces) }));

  const lines = returnableLines
    .map((l: any) => ({
      ...l,
      returnQty: Math.min(Number(qtyMap[l.itemId] || 0), l.qty - l.returned),
      returnPieces: l.isWeight ? Math.min(Number(piecesMap[l.itemId] || 0), Number(l.piecesQty || 0) - l.returnedPieces) : 0,
    }))
    .filter((l: any) => l.returnQty > 0 && (!l.isWeight || l.returnPieces > 0));
  const refundTotal = round2(lines.reduce((s: number, l: any) => s + l.returnQty * l.rate, 0));
  const canSave = lines.length > 0;
  const touched = Object.values(qtyMap).some((v) => Number(v) > 0) || Object.values(piecesMap).some((v) => Number(v) > 0);

  const fillAll = () => {
    const qm: Record<string, string> = {};
    const pm: Record<string, string> = {};
    for (const l of returnableLines) {
      qm[l.itemId] = String(l.qty - l.returned);
      if (l.isWeight) pm[l.itemId] = String(Number(l.piecesQty || 0) - l.returnedPieces);
    }
    setQtyMap(qm);
    setPiecesMap(pm);
  };

  return (
    <FormSheet title="Return items" onClose={onClose} dirty={touched} canSave={canSave} saveTone="danger" tall={returnableLines.length > 3}
      saveLabel={refundTotal > 0 ? `Refund ${inr(refundTotal, currency)}` : "Refund"}
      onSave={() => canSave && onSave(lines.map((l: any) => ({ itemId: l.itemId, qty: l.returnQty, piecesQty: l.isWeight ? l.returnPieces : undefined })))}>
      <p className="text-[15px] leading-[21px] text-mute">
        <span className="font-doc text-[14px]">{doc.number}</span>: how many of each item are being returned?
      </p>

      {returnableLines.length === 0 ? (
        <p className="mt-4 rounded-control bg-paper px-3 py-3 text-[15px] text-mute">Every item on this estimate has already been returned.</p>
      ) : (
        <>
          {returnableLines.length > 1 && (
            <button type="button" onClick={fillAll} className="mt-4 min-h-[44px] w-full rounded-control bg-bad-50 px-4 py-2.5 text-[15px] font-medium text-bad-600 transition active:opacity-70">
              Customer is returning everything: fill all quantities
            </button>
          )}
          <Group className="mt-4">
            {returnableLines.map((l: any) => {
              const available = l.qty - l.returned;
              const qty = Math.min(Number(qtyMap[l.itemId] || 0), available);
              const lineRefund = round2(qty * l.rate);
              return (
                <GroupRow key={l.itemId} className="py-3">
                  <div className="w-full">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-medium text-ink">{l.name}</p>
                        <p className="text-caption text-mute">
                          {qtyText(available)}{l.isWeight ? " kg" : ""} available, {inrRate(l.rate, currency)}{l.isWeight ? " a kg" : " each"}
                          {l.returned > 0 ? `, ${qtyText(l.returned)} already returned` : ""}
                        </p>
                      </div>
                      <Stepper label={l.isWeight ? `${l.name} kg to return` : `${l.name} to return`} decimals max={available}
                        value={qtyMap[l.itemId] ?? "0"} onChange={(v) => setQty(l, v)} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-caption">
                      <span className="text-mute">{l.isWeight ? "Kg to return" : "Qty to return"}</span>
                      <span className="tabular-nums text-ink">{lineRefund > 0 ? `Refund ${inr(lineRefund, currency)}` : "No refund yet"}</span>
                    </div>
                    {l.isWeight && (
                      <div className="mt-2.5 flex items-center justify-between gap-3">
                        <span className="text-[15px] text-mute">Pieces returned</span>
                        <Stepper label={`${l.name} pieces returned`} max={Number(l.piecesQty || 0) - l.returnedPieces}
                          value={piecesMap[l.itemId] ?? "0"} onChange={(v) => setPieces(l, v)} />
                      </div>
                    )}
                  </div>
                </GroupRow>
              );
            })}
          </Group>
        </>
      )}
    </FormSheet>
  );
}
