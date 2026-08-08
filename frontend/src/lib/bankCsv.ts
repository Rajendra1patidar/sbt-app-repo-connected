/* ---- Parses common bank-statement CSV shapes into { date, description, amount } rows ----
   Handles both a single signed "Amount" column and the more common Indian-bank shape of
   separate Withdrawal/Debit + Deposit/Credit columns. Dates are read as DD/MM/YYYY (or
   DD-MM-YYYY) by default, since that's the standard for Indian bank exports, falling back
   to ISO (YYYY-MM-DD) if that's what's already there. This is a best-effort parser, not a
   universal one — the caller always shows a preview before importing so mis-parsed rows
   are caught before anything is sent to the server. */

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseAmountCell(raw: string): number {
  const cleaned = (raw || "").replace(/[,₹$\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDateCell(raw: string): string {
  const s = (raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const [, d, mo, yRaw] = m;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return s;
}

export interface ParsedBankRow {
  date: string;
  description: string;
  amount: number;
}

export function parseBankCsv(text: string): ParsedBankRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const dateIdx = headers.findIndex((h) => h.includes("date"));
  const descIdx = headers.findIndex((h) => h.includes("narration") || h.includes("description") || h.includes("particular") || h.includes("remark"));
  const amountIdx = headers.findIndex((h) => h.includes("amount") && !h.includes("balance"));
  const debitIdx = headers.findIndex((h) => h.includes("debit") || h.includes("withdrawal"));
  const creditIdx = headers.findIndex((h) => h.includes("credit") || h.includes("deposit"));

  const rows: ParsedBankRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 2) continue;

    const date = dateIdx >= 0 ? parseDateCell(cols[dateIdx]) : "";
    const description = descIdx >= 0 ? cols[descIdx] : cols.filter((_, idx) => idx !== dateIdx && idx !== amountIdx).join(" ").trim();

    let amount = 0;
    if (debitIdx >= 0 || creditIdx >= 0) {
      const debit = debitIdx >= 0 ? parseAmountCell(cols[debitIdx]) : 0;
      const credit = creditIdx >= 0 ? parseAmountCell(cols[creditIdx]) : 0;
      amount = credit > 0 ? credit : -debit;
    } else if (amountIdx >= 0) {
      amount = parseAmountCell(cols[amountIdx]);
    }

    if (date && amount !== 0) rows.push({ date, description, amount });
  }
  return rows;
}
