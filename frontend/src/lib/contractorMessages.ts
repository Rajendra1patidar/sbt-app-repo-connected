import { fmtMoney, fmtNum } from "./format";
import { sariaToPoints } from "./points";

/* ---- Contractor share message/print builders ---- */

export function buildContractorMessage(name: string, c: any, currency: string, periodLabel: string, mode: "summary" | "full") {
  const points = c.cementQty + sariaToPoints(c.sariaQty);
  let msg = `*${name} — Contractor Summary*\n${periodLabel}\n\n`;
  msg += `Points: ${fmtNum(points)}\n`;
  msg += `Estimates: ${c.count} · Total: ${fmtMoney(c.total, currency)}\n`;
  if (mode === "full") {
    if (c.cementQty > 0) msg += `Cement: ${fmtNum(c.cementQty)} bags (${fmtNum(c.cementQty)} pts)\n`;
    if (c.sariaQty > 0) msg += `Saria: ${fmtNum(c.sariaQty)} kg (${fmtNum(sariaToPoints(c.sariaQty))} pts)\n`;
    const itemRows: any[] = Object.values(c.itemMap).sort((a: any, b: any) => b.amount - a.amount);
    if (itemRows.length) {
      msg += `\nItems:\n`;
      itemRows.forEach((r: any) => { msg += `• ${r.name} — ${fmtNum(r.qty)} units — ${fmtMoney(r.amount, currency)}\n`; });
    }
  }
  return msg;
}

export function buildContractorListMessage(names: string[], byContractor: Record<string, any>, currency: string, periodLabel: string, mode: "summary" | "full") {
  let msg = `*Contractor Points — ${periodLabel}*\n\n`;
  names.forEach((name) => {
    const c = byContractor[name];
    const points = c.cementQty + sariaToPoints(c.sariaQty);
    msg += `${name} — ${fmtNum(points)} pts · ${fmtMoney(c.total, currency)}\n`;
    if (mode === "full") {
      if (c.cementQty > 0) msg += `  Cement: ${fmtNum(c.cementQty)} bags\n`;
      if (c.sariaQty > 0) msg += `  Saria: ${fmtNum(c.sariaQty)} kg\n`;
    }
  });
  return msg;
}

export function capForWhatsApp(msg: string) {
  return msg.length > 1800 ? msg.slice(0, 1750) + "\n…(truncated — use Print for the full list)" : msg;
}

export function printContractorReport(rows: { name: string; c: any }[], periodLabel: string, mode: "summary" | "full", currency: string, heading: string) {
  const rowsHtml = rows.map(({ name, c }) => {
    const points = c.cementQty + sariaToPoints(c.sariaQty);
    const itemsHtml = mode === "full"
      ? `<tr><td colspan="4" class="sub-row"><div class="sub">${
          [
            c.cementQty > 0 ? `Cement: ${fmtNum(c.cementQty)} bags` : "",
            c.sariaQty > 0 ? `Saria: ${fmtNum(c.sariaQty)} kg` : "",
            ...Object.values(c.itemMap).sort((a: any, b: any) => b.amount - a.amount).map((r: any) => `${r.name}: ${fmtNum(r.qty)} units — ${fmtMoney(r.amount, currency)}`),
          ].filter(Boolean).join("<br/>")
        }</div></td></tr>`
      : "";
    return `<tr><td>${name}</td><td>${c.count}</td><td>${fmtNum(points)}</td><td>${fmtMoney(c.total, currency)}</td></tr>${itemsHtml}`;
  }).join("");

  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) { alert("Please allow pop-ups to print."); return; }
  w.document.write(`<!doctype html><html><head><title>${heading}</title><style>
    @page { size: A4; margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color:#0f172a; }
    h1 { font-size: 16px; margin-bottom:2px; }
    .period { font-size: 11px; color:#64748b; margin-bottom: 14px; }
    table { width:100%; border-collapse: collapse; font-size: 11px; }
    th, td { text-align:left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
    th { color:#64748b; font-size:10px; text-transform:uppercase; }
    .sub-row td { padding-top:0; border-bottom: 1px solid #e2e8f0; }
    .sub { font-size: 10px; color:#475569; padding: 2px 0 8px 8px; }
  </style></head><body>
    <h1>${heading}</h1>
    <div class="period">${periodLabel}</div>
    <table><thead><tr><th>Contractor</th><th>Estimates</th><th>Points</th><th>Total</th></tr></thead><tbody>${rowsHtml}</tbody></table>
  </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
