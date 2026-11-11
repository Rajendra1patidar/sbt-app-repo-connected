import React, { useEffect, useState } from "react";
import { Download, Loader2, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";
import { Card } from "../common/UIPrimitives";

/* ---- Backups (owner only) ---- */

type RunStatus = "running" | "ok" | "error" | "skipped";

interface JobRun {
  job: string;
  day: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  summary: string;
  error: string;
}

interface BackupStatus {
  ready: boolean;
  problem: string | null;
  destinations: { telegram: boolean; email: boolean; emailDays: string[] };
  lastGoodBackup: {
    at: string;
    day: string;
    summary: string;
    sizeBytes: number | null;
    totalDocs: number | null;
    delivered: string[];
  } | null;
  lastBackupAttempt: JobRun | null;
  jobs: JobRun[];
}

const JOB_LABELS: Record<string, string> = {
  reconciliation: "Books check",
  reorder: "Low-stock alerts",
  deadStock: "Dead-stock alerts",
  credit: "Credit alerts",
  dailyReport: "Daily report",
  backup: "Backup",
  retention: "Old-data clean-up",
};

const STATUS_TEXT: Record<RunStatus, { label: string; cls: string }> = {
  ok: { label: "Done", cls: "text-good-700" },
  skipped: { label: "Skipped", cls: "text-ink/50" },
  running: { label: "Running", cls: "text-warn-700" },
  error: { label: "Failed", cls: "text-bad-600" },
};

function when(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function fmtSize(bytes?: number | null): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function whereItGoes(d: BackupStatus["destinations"]): string {
  const parts: string[] = [];
  if (d.telegram) parts.push("Telegram every night");
  if (d.email) parts.push(`email every ${d.emailDays.join(" and ")}`);
  return parts.length ? parts.join(", ") : "nowhere yet (set up Telegram, or BACKUP_EMAIL_TO)";
}

// The nightly backup goes to Telegram (and by email once a week). This card shows
// whether that is working, and lets the owner download the same encrypted file by hand.
export function BackupCard() {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [loadError, setLoadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [showJobs, setShowJobs] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s: BackupStatus = await api.backup.status();
        if (!cancelled) setStatus(s);
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || "Couldn't load the backup status.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runDownload = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      await api.backup.download();
    } catch (err: any) {
      setDownloadError(err?.message || "The download failed. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  const good = status?.lastGoodBackup || null;
  const attempt = status?.lastBackupAttempt || null;
  const lastFailed = !!attempt && attempt.status === "error" && (!good || new Date(attempt.startedAt) > new Date(good.at));

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-paper flex items-center justify-center">
          <ShieldCheck size={14} className="text-ink/70" />
        </div>
        <h3 className="text-sm font-bold text-ink">Backups</h3>
      </div>

      {loadError && <p className="rounded-xl bg-bad-50 px-3 py-2 text-xs font-semibold text-bad-600">{loadError}</p>}

      {status && !status.ready && (
        <p className="rounded-xl bg-warn-50 px-3 py-2 text-xs font-semibold text-warn-700">
          Backups are not running yet: {status.problem}. Fix this on Render (Environment tab), redeploy, then come back here.
        </p>
      )}

      {status && status.ready && (
        <div className="space-y-1 text-xs text-ink/60">
          {good ? (
            <p>
              <span className="font-semibold text-ink">Last backup:</span> {when(good.at)}
              {fmtSize(good.sizeBytes) ? `, ${fmtSize(good.sizeBytes)}` : ""}
              {good.totalDocs ? `, ${good.totalDocs.toLocaleString("en-IN")} records` : ""}
              {good.delivered.length ? `, sent by ${good.delivered.join(" and ")}` : ""}
            </p>
          ) : (
            <p>No backup yet. The first one is made tonight with the other nightly jobs.</p>
          )}
          <p>Goes to: {whereItGoes(status.destinations)}.</p>
        </div>
      )}

      {lastFailed && attempt && (
        <p className="rounded-xl bg-bad-50 px-3 py-2 text-xs font-semibold text-bad-600">
          The last backup attempt ({when(attempt.startedAt)}) failed: {attempt.error || "unknown error"}
        </p>
      )}

      <button
        type="button"
        onClick={runDownload}
        disabled={downloading || (!!status && !status.ready)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        Download backup
      </button>
      <p className="text-xs text-ink/40">
        An encrypted file with everything in the app. You need your BACKUP_PASSPHRASE to open it (see BACKUPS.md in the repo).
      </p>
      {downloadError && <p className="text-xs font-medium text-bad-500">{downloadError}</p>}

      {status && status.jobs.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowJobs((v) => !v)} className="text-xs font-semibold text-brand-600">
            {showJobs ? "Hide nightly jobs" : "Show nightly jobs"}
          </button>
          {showJobs && (
            <ul className="mt-2 divide-y divide-line/60 rounded-xl border border-line text-xs">
              {status.jobs.map((j) => {
                const st = STATUS_TEXT[j.status] || STATUS_TEXT.skipped;
                return (
                  <li key={j.job} className="flex items-start justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{JOB_LABELS[j.job] || j.job}</p>
                      <p className="truncate text-ink/50">{j.error || j.summary || "-"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`font-semibold ${st.cls}`}>{st.label}</p>
                      <p className="text-ink/40">{when(j.startedAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
