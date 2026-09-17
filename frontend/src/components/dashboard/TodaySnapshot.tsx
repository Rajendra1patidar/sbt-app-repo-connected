import React, { useEffect, useMemo, useRef, useState } from "react";
import { fmtMoney, round2 } from "../../lib/format";

/* ---- Today snapshot ----
 * The one number worth seeing before anything else: net position today
 * (sales minus outflow — same definition ActivityRiver's "Net" already
 * uses, just surfaced here instead of buried inside the running-total
 * chart), plus a same-time-yesterday comparison so the number means
 * something on its own, and a flat Sales/Received/Outflow breakdown.
 *
 * All of this reuses data Dashboard.tsx already has (estimates, payments,
 * expenses, purchases) — no new business logic, just a different read of
 * the same event sources ActivityRiver builds its chart from. */

function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

interface Totals { sales: number; received: number; outflow: number; net: number }

function totalsInWindow(start: number, end: number, { estimates, payments, expenses, purchases }: any): Totals {
  let sales = 0, received = 0, outflow = 0;
  (estimates || []).forEach((e: any) => {
    const t = new Date(e.createdAt || e.date).getTime();
    if (t >= start && t < end) sales += Number(e.total || 0);
  });
  (payments || []).forEach((p: any) => {
    const t = new Date(p.createdAt || p.date).getTime();
    if (t < start || t >= end) return;
    const amt = Number(p.amount || 0);
    if (amt >= 0) received += amt; else outflow += Math.abs(amt); // refunds are an outflow
  });
  (expenses || []).forEach((e: any) => {
    const t = new Date(e.createdAt || e.date).getTime();
    if (t >= start && t < end) outflow += Number(e.amount || 0);
  });
  (purchases || []).forEach((p: any) => {
    const t = new Date(p.createdAt || p.date).getTime();
    if (t >= start && t < end) outflow += Number(p.amount || 0);
  });
  return { sales: round2(sales), received: round2(received), outflow: round2(outflow), net: round2(sales - outflow) };
}

// Animates a number from 0 to its target once, on mount — Carbon's cubic
// ease-out, 700ms (their guidance: duration scales with the size of the
// change, and larger hero numbers get the longer end of their 100–300ms
// range doubled for a headline figure).
function useCountUp(target: number, formatter: (n: number) => string, durationMs = 700) {
  const [display, setDisplay] = useState(formatter(0));
  const reduced = useRef(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    if (reduced.current) { setDisplay(formatter(target)); return; }
    let raf: number;
    const startT = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - startT) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(formatter(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return display;
}

export function TodaySnapshot({ estimates, payments, expenses, purchases, currency }: any) {
  const { today, comparison } = useMemo(() => {
    const now = new Date();
    const todayStart = dayStart(now);
    const elapsed = now.getTime() - todayStart;
    const yestStart = todayStart - 24 * 60 * 60 * 1000;
    const data = { estimates, payments, expenses, purchases };
    return {
      today: totalsInWindow(todayStart, now.getTime(), data),
      // Same-time-yesterday, not the full previous day, so the comparison
      // is honest about the point we're at in today.
      comparison: totalsInWindow(yestStart, yestStart + elapsed, data),
    };
  }, [estimates, payments, expenses, purchases]);

  const delta = round2(today.net - comparison.net);
  const heroDisplay = useCountUp(today.net, (n) => fmtMoney(n, currency));
  const salesDisplay = useCountUp(today.sales, (n) => fmtMoney(n, currency));
  const receivedDisplay = useCountUp(today.received, (n) => fmtMoney(n, currency));
  const outflowDisplay = useCountUp(today.outflow, (n) => fmtMoney(n, currency));

  return (
    <div>
      <p className="font-display text-[52px] font-bold leading-none tracking-tight text-ink">{heroDisplay}</p>
      <p className="mt-2 text-[13.5px] text-ink/45">
        net today — {delta >= 0 ? "up" : "down"} {fmtMoney(Math.abs(delta), currency)} from this time yesterday
      </p>

      <div className="mt-6 flex gap-8 border-t border-line pt-5">
        <div>
          <p className="font-mono text-[19px] font-semibold text-ink">{salesDisplay}</p>
          <p className="mt-1 text-[10.5px] text-ink/40">Sales</p>
        </div>
        <div>
          <p className="font-mono text-[19px] font-semibold text-ink">{receivedDisplay}</p>
          <p className="mt-1 text-[10.5px] text-ink/40">Received</p>
        </div>
        <div>
          <p className="font-mono text-[19px] font-semibold text-ink">{outflowDisplay}</p>
          <p className="mt-1 text-[10.5px] text-ink/40">Outflow</p>
        </div>
      </div>
    </div>
  );
}
