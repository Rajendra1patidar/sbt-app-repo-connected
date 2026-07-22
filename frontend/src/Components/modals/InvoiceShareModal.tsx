import React, { useEffect, useState } from "react";
import { ArrowDownToLine, MessageSquare, Send, X } from "lucide-react";
import { WHATSAPP_GREEN } from "../../lib/constants";
import { smsLink, waLink } from "../../lib/contactLinks";
import { fmtDate, fmtMoney, fmtNum } from "../../lib/format";

/* ---- InvoiceShareModal ---- */

export function InvoiceShareModal({ invoice, customer, items, settings, payment, onClose }: any) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const isOverdue = invoice.status === "Due" && invoice.dueDate && new Date(invoice.dueDate) < new Date();
  const statusColor = invoice.status === "Paid" ? "#10b981" : invoice.status === "Partially Paid" ? "#0284c7" : invoice.status === "Accepted" ? "#2563eb" : isOverdue ? "#e11d48" : "#d97706";

  // Short status text matching the printed slip ("Due" / "Paid" / "Overdue" ...), title-cased
  const compactStatusLabel = invoice.isAdvanceBooking
    ? "Advance Booked"
    : invoice.status === "Paid" ? "Paid"
    : invoice.status === "Partially Paid" ? "Partially Paid"
    : invoice.status === "Accepted" ? "Accepted"
    : isOverdue ? "Overdue" : "Due";

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;

    // Compact dashed-box receipt layout — mirrors the printed A4 estimate slip
    const CARD_W = 640;
    const PAD = 22;

    const lines = invoice.lines || [];
    const itemFont = lines.length <= 4 ? 26 : lines.length <= 8 ? 23 : 20;
    const rowH = itemFont + 22;

    const extras = ([
      ["Freight", Number(invoice.freightCost || 0)],
      ["Labour", Number(invoice.labourCost || 0)],
      ["Previous due", Number(invoice.previousDue || 0)],
    ] as [string, number][]).filter(([, v]) => v > 0);

    const HEADER_H = 96;   // name/date + location + divider
    const TOTAL_H = 78;
    const NOTES_H = invoice.notes ? 34 : 0;
    const STAT_H = 40;
    const H = HEADER_H + (lines.length + extras.length) * rowH + TOTAL_H + NOTES_H + STAT_H + PAD * 2;

    canvas.width = CARD_W; canvas.height = H;

    // white card with dashed border, like the print template
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, CARD_W, H);
    ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 2; ctx.setLineDash([7, 6]);
    ctx.strokeRect(1, 1, CARD_W - 2, H - 2); ctx.setLineDash([]);

    let y = PAD + 26;

    // header: customer name (left) + date (right), bold
    ctx.textAlign = "left"; ctx.font = "bold 26px Arial"; ctx.fillStyle = "#0f172a";
    ctx.fillText(customer?.name || "Customer", PAD, y);
    ctx.textAlign = "right"; ctx.fillText(fmtDate(invoice.date), CARD_W - PAD, y);
    ctx.textAlign = "left";

    // location
    y += 26; ctx.font = "20px Arial"; ctx.fillStyle = "#64748b";
    ctx.fillText(customer?.location || "", PAD, y);

    // divider
    y += 18; ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(CARD_W - PAD, y); ctx.stroke();

    // line items — "name × qty" left, amount right, dotted underline
    const drawRow = (label: string, amount: number) => {
      y += rowH;
      ctx.fillStyle = "#0f172a"; ctx.font = `${itemFont}px Arial`; ctx.textAlign = "left";
      ctx.fillText(label, PAD, y);
      ctx.textAlign = "right"; ctx.fillText(fmtMoney(amount, settings.currency), CARD_W - PAD, y);
      ctx.textAlign = "left";
      ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(PAD, y + 10); ctx.lineTo(CARD_W - PAD, y + 10); ctx.stroke();
      ctx.setLineDash([]);
    };
    lines.forEach((ln: any) => {
      const it = items.find((i: any) => i.id === ln.itemId);
      const name = it?.name || "Item"; const qty = Number(ln.qty || 0); const price = ln.rate ?? it?.price ?? 0;
      drawRow(`${name} × ${fmtNum(qty)}`, qty * price);
    });
    extras.forEach(([label, val]) => drawRow(label, val));

    // total — bold, border-top
    y += 20; ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(CARD_W - PAD, y); ctx.stroke();
    y += 36; ctx.font = "bold 28px Arial"; ctx.fillStyle = "#0f172a"; ctx.textAlign = "left";
    ctx.fillText("Total", PAD, y);
    ctx.textAlign = "right"; ctx.fillText(fmtMoney(invoice.total, settings.currency), CARD_W - PAD, y);
    ctx.textAlign = "left";

    // notes — small italic
    if (invoice.notes) {
      y += 30; ctx.font = "italic 18px Arial"; ctx.fillStyle = "#475569";
      ctx.fillText(invoice.notes, PAD, y);
    }

    // status — right-aligned, colored to match status (Due/Paid/Overdue/etc.)
    y += 34; ctx.font = "bold 18px Arial"; ctx.fillStyle = statusColor; ctx.textAlign = "right";
    ctx.fillText(compactStatusLabel, CARD_W - PAD, y); ctx.textAlign = "left";

    setImgUrl(canvas.toDataURL("image/png"));
  }, [invoice, customer, items, settings, payment, isOverdue, statusColor, compactStatusLabel]);

  const remainingDue = Number(invoice.total || 0) - Number(invoice.amountPaid || 0);
  const message = invoice.status === "Paid"
    ? `Hi ${customer?.name || ""}, thank you! Your payment for estimate ${invoice.number} (${fmtMoney(invoice.total, settings.currency)}) has been received.`
    : invoice.status === "Partially Paid"
    ? `Hi ${customer?.name || ""}, thanks for your payment on estimate ${invoice.number}. ${fmtMoney(remainingDue, settings.currency)} is still due.`
    : `Hi ${customer?.name || ""}, your estimate ${invoice.number} for ${fmtMoney(invoice.total, settings.currency)} is due on ${fmtDate(invoice.dueDate)}.`;
  const smsMsg = invoice.status === "Paid"
    ? `Hi ${customer?.name || ""}, payment for estimate ${invoice.number} (${fmtMoney(invoice.total, settings.currency)}) received. Thank you! - ${settings.orgName}`
    : invoice.status === "Partially Paid"
    ? `Hi ${customer?.name || ""}, payment received on estimate ${invoice.number}. ${fmtMoney(remainingDue, settings.currency)} still due. - ${settings.orgName}`
    : `Hi ${customer?.name || ""}, estimate ${invoice.number} for ${fmtMoney(invoice.total, settings.currency)} due ${fmtDate(invoice.dueDate)}. - ${settings.orgName}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">Share estimate</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-paper">
          {imgUrl ? <img src={imgUrl} alt={`Estimate ${invoice.number}`} className="block h-auto w-full" />
            : <div className="flex h-40 items-center justify-center text-sm text-ink/40">Generating preview…</div>}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink/40">Press and hold the image to save it, then share from your gallery — or use the buttons below.</p>
        <div className="mt-4 grid grid-cols-1 gap-2">
          <a href={imgUrl || undefined} download={`${invoice.number}.png`} onClick={(e) => { if (!imgUrl) e.preventDefault(); }}
            className={`flex items-center justify-center gap-2 rounded-full border border-line py-3 text-sm font-semibold text-ink/80 transition active:scale-[0.98] ${!imgUrl ? "opacity-40" : ""}`}>
            <ArrowDownToLine size={15} /> Download image
          </a>
          <a href={customer?.phone ? waLink(customer.phone, message) : undefined} target="_blank" rel="noreferrer"
            onClick={(e) => { if (!customer?.phone) e.preventDefault(); }}
            className={`flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition ${customer?.phone ? "active:scale-[0.98]" : "opacity-40 cursor-not-allowed"}`}
            style={{ backgroundColor: WHATSAPP_GREEN }}>
            <Send size={15} /> Send via WhatsApp
          </a>
          <a href={customer?.phone ? smsLink(customer.phone, smsMsg) : undefined}
            onClick={(e) => { if (!customer?.phone) e.preventDefault(); }}
            className={`flex items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition ${customer?.phone ? "active:scale-[0.98]" : "opacity-40 cursor-not-allowed"}`}
            style={{ backgroundColor: "#4f46e5" }}>
            <MessageSquare size={15} /> Send via SMS
          </a>
        </div>
        {!customer?.phone && <p className="mt-2 text-center text-xs text-bad-500">Add a phone number to enable sharing.</p>}
      </div>
    </div>
  );
}
