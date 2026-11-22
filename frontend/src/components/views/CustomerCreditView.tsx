import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyNote } from "../ui/blocks";
import { Group, GroupRow, InsightNote, Segmented, StatusChip, cx, type ChipTone } from "../ui/kit";
import { api } from "../../lib/api";
import { inr } from "../../lib/money";

/* ---- Customer credit: outstanding/overdue + real payment-speed history, suggestions only ---- */

type Filter = "all" | "risk" | "watch" | "good";
const RISK: Record<string, { tone: ChipTone; label: string }> = {
  risk: { tone: "risk", label: "At risk" },
  watch: { tone: "caution", label: "Watch" },
  good: { tone: "gain", label: "Good standing" },
};

export function CustomerCreditView({ currency }: { currency: string }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    api.reports
      .customerCredit()
      .then(setRows)
      .catch((err: any) => setError(err?.message || "Couldn't load this report"))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => (filter === "all" ? rows : rows.filter((c) => c.risk === filter)), [rows, filter]);

  return (
    <div className="px-5 pb-28 md:pb-12">
      <InsightNote className="mt-4">
        Built from real outstanding amounts and actual payment dates, not a guess. A suggested limit is only a suggestion: it never changes a customer's real limit, which stays yours to set on their profile.
      </InsightNote>

      {error && <p className="mt-3 rounded-control bg-bad-50 px-3 py-2.5 text-[14px] font-medium text-bad-600">{error}</p>}

      {!loading && rows.length > 0 && (
        <div className="mt-4">
          <Segmented
            ariaLabel="Filter by standing"
            options={[
              { value: "all", label: "All" },
              { value: "risk", label: "At risk" },
              { value: "watch", label: "Watch" },
              { value: "good", label: "Good" },
            ]}
            value={filter}
            onChange={(v) => setFilter(v as Filter)}
          />
        </div>
      )}

      {loading ? (
        <Group className="mt-4"><p className="px-4 py-10 text-center text-[15px] text-mute">Loading…</p></Group>
      ) : rows.length === 0 ? (
        <Group className="mt-4"><EmptyNote text="Nothing to flag right now: no customer has an outstanding balance or enough payment history yet." /></Group>
      ) : shown.length === 0 ? (
        <Group className="mt-4"><p className="px-4 py-8 text-center text-[15px] text-mute">No customers in this group.</p></Group>
      ) : (
        <Group className="mt-4">
          {shown.map((c) => {
            const r = RISK[c.risk] || { tone: "neutral" as ChipTone, label: String(c.risk || "") };
            const lowered = c.suggestedCreditLimit != null && c.suggestedCreditLimit < (c.creditLimit || 0);
            return (
              <GroupRow key={c.customerId} onClick={() => navigate(`/customers/${c.customerId}`)} chevron ariaLabel={`Open ${c.name}`} className="py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lead font-medium text-ink">{c.name}</p>
                    {c.phone && <p className="truncate text-caption text-mute">{c.phone}</p>}
                  </div>
                  <StatusChip tone={r.tone} className="shrink-0">{r.label}</StatusChip>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <Stat label="Outstanding">{inr(c.outstanding, currency)}</Stat>
                  <Stat label="Overdue" tone={c.overdue > 0 ? "bad" : undefined}>{inr(c.overdue, currency)}</Stat>
                  {c.oldestDaysPastDue > 0 && <Stat label="Oldest bill">{c.oldestDaysPastDue} days past due</Stat>}
                  {c.onTimeRatio != null && <Stat label="On-time payments">{Math.round(c.onTimeRatio * 100)}%</Stat>}
                </dl>

                {c.suggestedCreditLimit != null && (
                  <p className={cx("mt-3 text-[14px] leading-[19px]", lowered ? "text-bad-600" : "text-good-600")}>
                    Suggested credit limit {inr(c.suggestedCreditLimit, currency)}
                    {c.creditLimit != null && <span className="text-mute">, now {inr(c.creditLimit, currency)}</span>}
                  </p>
                )}
              </GroupRow>
            );
          })}
        </Group>
      )}
    </div>
  );
}

function Stat({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "bad" }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro text-mute">{label}</dt>
      <dd className={cx("truncate text-[16px] font-medium tabular-nums", tone === "bad" ? "text-bad-600" : "text-ink")}>{children}</dd>
    </div>
  );
}
