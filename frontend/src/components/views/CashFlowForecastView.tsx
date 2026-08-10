import { useEffect, useState } from "react";
import { AlertCircle, TrendingUp } from "lucide-react";
import { api } from "../../lib/api";
import { Card } from "../common/UIPrimitives";
import { fmtMoney } from "../../lib/format";

/* ---- Cash-flow forecast: current cash + real due-dated inflows − real expense average, honest about what's unknown ---- */

function ProjectionCard({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <Card className="text-center">
      <p className="text-xs font-semibold text-ink/40">{label}</p>
      <p className={`mt-1 font-display text-xl font-bold ${value < 0 ? "text-bad-600" : "text-ink"}`}>{fmtMoney(value, currency)}</p>
    </Card>
  );
}

export function CashFlowForecastView({ currency }: { currency: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.reports
      .cashFlowForecast()
      .then(setData)
      .catch((err: any) => setError(err?.message || "Couldn't load this report"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="px-5 pb-28"><p className="py-10 text-center text-sm text-ink/40">Loading…</p></div>;
  if (error || !data) return <div className="px-5 pb-28"><p className="rounded-xl bg-bad-50 px-3 py-2 text-xs font-semibold text-bad-600">{error || "No data"}</p></div>;

  const buckets = [
    { key: "overdue", label: "Overdue (due now)" },
    { key: "next30", label: "Due in 30 days" },
    { key: "next60", label: "Due in 31-60 days" },
    { key: "next90", label: "Due in 61-90 days" },
    { key: "beyond90", label: "Beyond 90 days" },
  ];

  return (
    <div className="space-y-4 px-5 pb-28">
      <Card className="space-y-1">
        <div className="flex items-center gap-2"><TrendingUp size={16} className="text-brand-500" /><h3 className="text-sm font-bold text-ink">How this works</h3></div>
        <p className="text-xs text-ink/40">
          Current cash is your real Funds balance. Inflows are unpaid estimates bucketed by their actual due date —
          overdue ones count as due now, not spread optimistically forward. The only projection here is a real
          trailing-90-day average of your expenses, carried forward at that same rate. Vendor payables have no due
          date on record, so they're shown separately rather than guessed into a bucket.
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <ProjectionCard label="In 30 days" value={data.projected.in30Days} currency={currency} />
        <ProjectionCard label="In 60 days" value={data.projected.in60Days} currency={currency} />
        <ProjectionCard label="In 90 days" value={data.projected.in90Days} currency={currency} />
      </div>

      <Card className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-ink/40">Current cash</p>
          <p className="mt-1 text-lg font-bold text-ink">{fmtMoney(data.currentCash, currency)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-ink/40">Avg. monthly expense</p>
          <p className="mt-1 text-lg font-bold text-ink">{fmtMoney(data.avgMonthlyExpense, currency)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-ink/40">Outstanding receivable</p>
          <p className="mt-1 text-lg font-bold text-good-600">{fmtMoney(data.outstandingReceivable, currency)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-ink/40">Outstanding payable</p>
          <p className="mt-1 text-lg font-bold text-bad-600">{fmtMoney(data.outstandingPayable, currency)}</p>
          <p className="text-[11px] text-ink/30">Timing unknown</p>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 font-display text-base font-bold text-ink">Expected inflows by due date</h3>
        <div className="space-y-2">
          {buckets.map((b) => (
            <div key={b.key} className="flex items-center justify-between text-sm">
              <span className="text-ink/60">{b.label}</span>
              <span className="font-semibold text-ink">{fmtMoney(data.expectedInflows[b.key], currency)}</span>
            </div>
          ))}
          {data.expectedInflows.noDueDate > 0 && (
            <div className="flex items-center gap-1.5 rounded-xl bg-warn-50 px-3 py-2 text-xs text-warn-700">
              <AlertCircle size={13} />
              {fmtMoney(data.expectedInflows.noDueDate, currency)} in unpaid estimates has no due date set and isn't included above.
            </div>
          )}
        </div>
      </Card>

      {data.notes?.length > 0 && (
        <Card className="space-y-1">
          {data.notes.map((n: string, i: number) => (
            <p key={i} className="text-xs text-ink/40">• {n}</p>
          ))}
        </Card>
      )}
    </div>
  );
}
