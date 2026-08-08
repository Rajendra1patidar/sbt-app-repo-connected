import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../common/UIPrimitives";
import { fmtDate, fmtMoney } from "../../lib/format";

/* ---- Approvals: staff-submitted purchases above the settings threshold, waiting on the owner ---- */

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-warn-50 text-warn-700",
    approved: "bg-good-50 text-good-700",
    rejected: "bg-bad-50 text-bad-700",
  };
  return <span className={`rounded-pill px-2.5 py-1 text-xs font-semibold capitalize ${styles[status] || "bg-ink/5 text-ink/60"}`}>{status}</span>;
}

export function ApprovalsView({ currency }: { currency: string }) {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "all">("pending");

  useEffect(() => {
    setLoading(true);
    setError("");
    api.approvals
      .list(tab === "pending" ? "pending" : undefined)
      .then(setApprovals)
      // The backend 403s a staff account here — surface that plainly rather
      // than a raw error string, since this screen is owner-only by design.
      .catch((err: any) =>
        setError(err?.status === 403 ? "Only the business owner can review approvals." : err?.message || "Couldn't load approvals")
      )
      .finally(() => setLoading(false));
  }, [tab]);

  const act = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    setError("");
    try {
      if (action === "approve") await api.approvals.approve(id);
      else await api.approvals.reject(id);
      setApprovals((list) => list.filter((a) => a.id !== id));
    } catch (err: any) {
      setError(err?.message || "That didn't go through — try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 px-5 pb-28">
      <div className="flex gap-2">
        {(["pending", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-pill px-4 py-2 text-xs font-semibold transition-colors ${
              tab === t ? "bg-brand-500 text-white" : "bg-white border border-line text-ink/60"
            }`}
          >
            {t === "pending" ? "Pending" : "All"}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-bad-50 px-3 py-2 text-xs font-semibold text-bad-600">{error}</p>}

      {loading ? (
        <p className="py-10 text-center text-sm text-ink/40">Loading…</p>
      ) : approvals.length === 0 ? (
        <EmptyState text={tab === "pending" ? "Nothing waiting for approval right now." : "No approval requests yet."} />
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <Card key={a.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink capitalize">
                    {a.type} — {fmtMoney(a.amount, currency)}
                  </p>
                  <p className="text-xs text-ink/40">Requested {fmtDate(a.createdAt)}</p>
                </div>
                <StatusPill status={a.status} />
              </div>

              {a.payload?.notes && <p className="text-xs text-ink/50 italic">"{a.payload.notes}"</p>}

              {a.status === "pending" ? (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => act(a.id, "reject")}
                    disabled={busyId === a.id}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-line py-2 text-xs font-semibold text-ink/70 disabled:opacity-40"
                  >
                    <XCircle size={14} /> Reject
                  </button>
                  <button
                    onClick={() => act(a.id, "approve")}
                    disabled={busyId === a.id}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    {busyId === a.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Approve
                  </button>
                </div>
              ) : (
                <p className="text-xs text-ink/40">
                  {a.status === "approved" ? "Approved" : "Rejected"}
                  {a.resolvedAt ? ` on ${fmtDate(a.resolvedAt)}` : ""}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
