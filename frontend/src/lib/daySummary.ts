/**
 * Net today = sold − spent, the same definition the dashboard has always used
 * (spent = refunds + expenses + purchases), plus the same moment yesterday so the
 * comparison is honest about how far into today we are.
 */
export interface DayTotals { sold: number; received: number; spent: number; net: number }

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function totalsInWindow(start: number, end: number, { estimates, payments, expenses, purchases }: any): DayTotals {
  let sold = 0, received = 0, spent = 0;
  for (const e of estimates || []) {
    const t = new Date(e.createdAt || e.date).getTime();
    if (t >= start && t < end) sold += Number(e.total || 0);
  }
  for (const p of payments || []) {
    const t = new Date(p.createdAt || p.date).getTime();
    if (t < start || t >= end) continue;
    const amt = Number(p.amount || 0);
    if (amt >= 0) received += amt; else spent += Math.abs(amt); // refunds go out
  }
  for (const e of expenses || []) {
    const t = new Date(e.createdAt || e.date).getTime();
    if (t >= start && t < end) spent += Number(e.amount || 0);
  }
  for (const p of purchases || []) {
    const t = new Date(p.createdAt || p.date).getTime();
    if (t >= start && t < end) spent += Number(p.amount || 0);
  }
  return { sold: r2(sold), received: r2(received), spent: r2(spent), net: r2(sold - spent) };
}

export function daySummary(data: { estimates: any[]; payments: any[]; expenses: any[]; purchases: any[] }, now: Date = new Date()) {
  const todayStart = dayStart(now);
  const elapsed = now.getTime() - todayStart;
  const yestStart = todayStart - 24 * 60 * 60 * 1000;
  const today = totalsInWindow(todayStart, now.getTime() + 1, data);
  const sameTimeYesterday = totalsInWindow(yestStart, yestStart + elapsed, data);
  return { today, sameTimeYesterday, delta: r2(today.net - sameTimeYesterday.net) };
}
