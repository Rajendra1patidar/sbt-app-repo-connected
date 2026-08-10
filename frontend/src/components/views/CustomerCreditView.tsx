import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { api } from "../../lib/api";
import { Card, EmptyState } from "../common/UIPrimitives";
import { fmtMoney } from "../../lib/format";

/* ---- Customer credit risk: outstanding/overdue + real payment-speed history, suggestions only ---- */

const RISK_STYLES: Record<string, string> = {
  risk: "bg-bad-50 text-bad-700 border-bad-100",
  watch: "bg-warn-50 text-warn-700 border-warn-100",
  good: "bg-good-50 text-good-700 border-good-100",
};
const RISK_LABEL: Record<string, string> = { risk: "At risk", watch: "Watch", good: "Good standing" };

export function CustomerCreditView({ currency }: { currency: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.reports
      .customerCredit()
      .then(setRows)
      .catch((err: any) => setError(err?.message || "Couldn't load this report"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card className="space-y-1">
        <h3 className="text-sm font-bold text-ink">How this works</h3>
        <p className="text-xs text-ink/40">
          Built from real outstanding amounts and actual payment dates — not a guess. A suggested credit limit is
          just that: a suggestion. Nothing here changes a customer's actual limit; that's still yours to set on their
          profile.
        </p>
      </Card>

      {error && <p className="rounded-xl bg-bad-50 px-3 py-2 text-xs font-semibold text-bad-600">{error}</p>}

      {loading ? (
        <p className="py-10 text-center text-sm text-ink/40">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState text="Nothing to flag right now — no customer has an outstanding balance or enough payment history yet." />
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <Card key={c.customerId} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink">{c.name}</p>
                  {c.phone && <p className="text-xs text-ink/40">{c.phone}</p>}
                </div>
                <span className={`shrink-0 rounded-pill border px-2.5 py-1 text-xs font-semibold ${RISK_STYLES[c.risk]}`}>
                  {RISK_LABEL[c.risk] || c.risk}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-ink/40">Outstanding</p>
                  <p className="font-semibold text-ink">{fmtMoney(c.outstanding, currency)}</p>
                </div>
                <div>
                  <p className="text-ink/40">Overdue</p>
                  <p className={`font-semibold ${c.overdue > 0 ? "text-bad-600" : "text-ink"}`}>{fmtMoney(c.overdue, currency)}</p>
                </div>
                {c.oldestDaysPastDue > 0 && (
                  <div>
                    <p className="text-ink/40">Oldest bill</p>
                    <p className="font-semibold text-ink">{c.oldestDaysPastDue} days past due</p>
                  </div>
                )}
                {c.onTimeRatio != null && (
                  <div>
                    <p className="text-ink/40">On-time payments</p>
                    <p className="font-semibold text-ink">{Math.round(c.onTimeRatio * 100)}%</p>
                  </div>
                )}
              </div>

              {c.suggestedCreditLimit != null && (
                <div
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
                    c.suggestedCreditLimit < (c.creditLimit || 0) ? "bg-bad-50 text-bad-700" : "bg-good-50 text-good-700"
                  }`}
                >
                  {c.suggestedCreditLimit < (c.creditLimit || 0) ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                  Suggested credit limit: {fmtMoney(c.suggestedCreditLimit, currency)}
                  {c.creditLimit != null && ` (currently ${fmtMoney(c.creditLimit, currency)})`}
                </div>
              )}

              <button
                onClick={() => navigate(`/customers/${c.customerId}`)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline"
              >
                <Eye size={13} /> View customer
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
