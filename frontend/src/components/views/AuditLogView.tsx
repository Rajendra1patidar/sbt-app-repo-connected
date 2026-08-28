import React, { useEffect, useMemo, useState } from "react";
import { History, Loader2, Search } from "lucide-react";
import { Card, EmptyState } from "../common/UIPrimitives";
import { api } from "../../lib/api";

/* ---- Audit Log ----
 * Read-only view over AuditLog (see backend/models/AuditLog.js) — every
 * create/edit/delete recorded across the app, with who did it and when.
 * Owner-only: the API returns 403 for a staff login, surfaced below as a
 * plain message rather than a crash. Fetches on its own, same pattern as
 * StockAdjustmentHistoryView — this is looked at occasionally, not on
 * every screen load.
 */

const ACTION_STYLES: Record<string, string> = {
  create: "bg-good-50 text-good-700",
  update: "bg-advance-50 text-advance-700",
  delete: "bg-bad-50 text-bad-700",
};

function formatWhen(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function AuditLogView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.auditLogs
      .list()
      .then((docs: any[]) => { if (!cancelled) setRows(docs); })
      .catch((err: any) => { if (!cancelled) setError(err.message || "Failed to load the audit log"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let out = rows;
    if (actionFilter) out = out.filter((r) => r.action === actionFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        (r.model || "").toLowerCase().includes(q) ||
        (r.label || "").toLowerCase().includes(q) ||
        (r.actorId?.name || "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, search, actionFilter]);

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card className="space-y-1">
        <div className="flex items-center gap-2">
          <History size={17} className="text-ink/50" />
          <h3 className="font-display text-base font-bold text-ink">Audit Log</h3>
        </div>
        <p className="text-xs text-ink/40">
          Every record created, edited, or deleted across the app, with who did it and when.
        </p>
      </Card>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by record, item, or who..."
          className="w-full rounded-xl border border-line bg-card py-2.5 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="flex gap-2">
        {["", "create", "update", "delete"].map((a) => (
          <button
            key={a || "all"}
            onClick={() => setActionFilter(a)}
            className={`rounded-pill px-3 py-1.5 text-xs font-semibold capitalize ${
              actionFilter === a ? "bg-brand-500 text-white" : "bg-card border border-line text-ink/50"
            }`}
          >
            {a || "All"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-ink/40"><Loader2 size={20} className="animate-spin" /></div>
      ) : error ? (
        <Card><p className="text-center text-sm text-bad-600">{error}</p></Card>
      ) : filtered.length === 0 ? (
        <Card><EmptyState text="No activity recorded yet." /></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink truncate">
                  {r.model}{r.label ? ` · ${r.label}` : ""}
                </p>
                <p className="text-xs text-ink/40">
                  {r.actorId?.name || "Unknown user"}{r.actorId?.role ? ` (${r.actorId.role})` : ""} · {formatWhen(r.createdAt)}
                </p>
                {r.changedFields?.length > 0 && (
                  <p className="text-xs text-ink/40 italic truncate">Changed: {r.changedFields.join(", ")}</p>
                )}
              </div>
              <span className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-bold capitalize ${ACTION_STYLES[r.action] || "bg-line text-ink/50"}`}>
                {r.action}
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
