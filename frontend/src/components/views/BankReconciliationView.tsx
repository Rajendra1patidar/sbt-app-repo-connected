import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Link2, Loader2, Unlink, Upload } from "lucide-react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../common/UIPrimitives";
import { fmtDate, fmtMoney } from "../../lib/format";
import { parseBankCsv, type ParsedBankRow } from "../../lib/bankCsv";

/* ---- Bank statement import + reconciliation: parse -> preview -> import -> review unmatched ---- */

function MatchButton({ line, currency, onMatched }: { line: any; currency: string; onMatched: () => void }) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setLoading(true);
    try {
      const result = await api.bankStatement.candidates(line.date, line.amount);
      setCandidates(result);
    } catch { setCandidates([]); }
    finally { setLoading(false); }
  };

  const link = async (entryId: string) => {
    setLinkingId(entryId);
    try {
      await api.bankStatement.match(line.id, entryId);
      onMatched();
    } catch { /* leave the picker open so they can retry */ }
    finally { setLinkingId(null); }
  };

  return (
    <div>
      <button onClick={toggle} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline">
        <Link2 size={13} /> Find match
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 rounded-xl bg-paper p-2">
          {loading ? (
            <p className="px-2 py-2 text-xs text-ink/40">Searching…</p>
          ) : candidates.length === 0 ? (
            <p className="px-2 py-2 text-xs text-ink/40">No unclaimed ledger entries with this amount nearby.</p>
          ) : (
            candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => link(c.id)}
                disabled={linkingId === c.id}
                className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-xs hover:bg-brand-50 disabled:opacity-40"
              >
                <span className="text-ink/70">{fmtDate(c.date)}</span>
                <span className="font-semibold text-ink">{fmtMoney(c.amount, currency)}</span>
                {linkingId === c.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} className="text-good-500" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function BankReconciliationView({ currency }: { currency: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedBankRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<any>(null);

  const [tab, setTab] = useState<"unmatched" | "matched">("unmatched");
  const [lines, setLines] = useState<any[]>([]);
  const [loadingLines, setLoadingLines] = useState(true);

  const loadLines = () => {
    setLoadingLines(true);
    api.bankStatement.list(tab === "matched").then(setLines).catch(() => setLines([])).finally(() => setLoadingLines(false));
  };
  useEffect(loadLines, [tab]);

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportResult(null);
    setImportError("");
    const text = await file.text();
    setPreview(parseBankCsv(text));
  };

  const confirmImport = async () => {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    setImportError("");
    try {
      const result = await api.bankStatement.import(preview);
      setImportResult(result);
      setPreview(null);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTab("unmatched");
      loadLines();
    } catch (err: any) {
      setImportError(err?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const unmatchLine = async (id: string) => {
    try { await api.bankStatement.unmatch(id); loadLines(); } catch { /* leave as-is on failure */ }
  };

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card className="space-y-3">
        <h3 className="text-sm font-bold text-ink">Import a bank statement</h3>
        <p className="text-xs text-ink/40">
          Export a CSV from your bank (date, description, and either a signed amount or separate
          debit/credit columns work). Nothing is imported until you review the preview below and confirm.
        </p>

        {!preview && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-8 text-center hover:border-brand-300">
            <Upload size={20} className="text-ink/30" />
            <span className="text-xs font-semibold text-ink/50">Tap to choose a CSV file</span>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={onFileSelected} className="hidden" />
          </label>
        )}

        {preview && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-ink/60">{fileName} — {preview.length} row{preview.length !== 1 ? "s" : ""} parsed</p>
            {preview.length === 0 ? (
              <p className="rounded-xl bg-warn-50 px-3 py-2 text-xs text-warn-700">
                Couldn't find any usable rows — check the CSV has a date column and an amount (or debit/credit) column.
              </p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-paper p-2">
                {preview.slice(0, 50).map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-ink/50">{fmtDate(r.date)}</span>
                    <span className="mx-2 flex-1 truncate text-ink/70">{r.description}</span>
                    <span className={`font-semibold ${r.amount > 0 ? "text-good-600" : "text-bad-600"}`}>
                      {r.amount > 0 ? "+" : ""}{fmtMoney(r.amount, currency)}
                    </span>
                  </div>
                ))}
                {preview.length > 50 && <p className="pt-1 text-center text-[11px] text-ink/30">+ {preview.length - 50} more</p>}
              </div>
            )}
            {importError && <p className="rounded-xl bg-bad-50 px-3 py-2 text-xs font-semibold text-bad-600">{importError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setPreview(null); setFileName(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                className="flex-1 rounded-xl border border-line py-2.5 text-sm text-ink/50"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                disabled={importing || preview.length === 0}
                className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {importing ? <Loader2 size={14} className="mx-auto animate-spin" /> : `Import ${preview.length} row${preview.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        {importResult && (
          <div className="rounded-xl bg-good-50 px-3 py-2 text-xs font-semibold text-good-700">
            Imported {importResult.imported} rows — {importResult.matched} matched automatically, {importResult.unmatched} need a manual look below.
          </div>
        )}
      </Card>

      <div className="flex gap-2">
        {(["unmatched", "matched"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-pill px-4 py-2 text-xs font-semibold transition-colors ${tab === t ? "bg-brand-500 text-white" : "bg-white border border-line text-ink/60"}`}
          >
            {t === "unmatched" ? "Needs review" : "Matched"}
          </button>
        ))}
      </div>

      {loadingLines ? (
        <p className="py-10 text-center text-sm text-ink/40">Loading…</p>
      ) : lines.length === 0 ? (
        <EmptyState text={tab === "unmatched" ? "Nothing waiting for review." : "No matched lines yet."} />
      ) : (
        <div className="space-y-2">
          {lines.map((l) => (
            <Card key={l.id} className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{l.description || "—"}</p>
                  <p className="text-xs text-ink/40">{fmtDate(l.date)}</p>
                </div>
                <span className={`shrink-0 font-semibold ${l.amount > 0 ? "text-good-600" : "text-bad-600"}`}>
                  {l.amount > 0 ? "+" : ""}{fmtMoney(l.amount, currency)}
                </span>
              </div>
              {tab === "unmatched" ? (
                <MatchButton line={l} currency={currency} onMatched={loadLines} />
              ) : (
                <button onClick={() => unmatchLine(l.id)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink/40 hover:text-bad-600">
                  <Unlink size={13} /> {l.matchedManually ? "Manually matched — unmatch" : "Auto-matched — unmatch"}
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
