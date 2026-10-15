import React, { useEffect, useState } from "react";
import { Package, ShieldCheck, Receipt } from "lucide-react";
import { customerPortalApi } from "../lib/customerPortalApi";
import { fmtDate, fmtMoney } from "../lib/format";

const CURRENCY = "₹";

const NAME_KEY = "sbt_customer_portal_name";
const ORG_KEY = "sbt_customer_portal_org";

type BookingItem = { itemId: string; name: string; unit: string; booked: number; delivered: number; returned: number; remaining: number };
type CollectionItem = { itemId: string; name: string; unit: string; qty: number };
type Collection = { date: string; items: CollectionItem[] };
type LedgerRow = { date: string; narration: string; type: "debit" | "credit"; amount: number; balance: number };
type Statement = { rows: LedgerRow[]; closingBalance: number; totalDebit: number; totalCredit: number };
type Booking = { number: string; date: string; fullyCollected: boolean; items: BookingItem[]; collections: Collection[] };

function ProgressBar({ booked, remaining }: { booked: number; remaining: number }) {
  const takenPct = booked > 0 ? Math.min(100, Math.round(((booked - remaining) / booked) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-line/60">
      <div className="h-full rounded-pill bg-brand-500 transition-all" style={{ width: `${takenPct}%` }} />
    </div>
  );
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: (name: string, orgName: string) => void }) {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!phone.trim() || pin.trim().length < 4) {
      setError("Enter your phone number and 4-digit PIN.");
      return;
    }
    setLoading(true);
    try {
      const res = await customerPortalApi.login(phone.trim(), pin.trim());
      customerPortalApi.setToken(res.token);
      window.localStorage.setItem(NAME_KEY, res.name || "");
      window.localStorage.setItem(ORG_KEY, res.orgName || "");
      onLoggedIn(res.name || "", res.orgName || "");
    } catch (err: any) {
      setError(err?.message || "Couldn't log in. Please check your phone number and PIN.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100">
            <Package size={26} className="text-brand-600" />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">My Account</h1>
          <p className="mt-1 text-sm text-ink/50">See your ledger, what you owe or have paid, and your bookings.</p>
        </div>
        <form onSubmit={submit} className="rounded-card border border-line/70 bg-card p-6 shadow-card">
          <label className="mb-1.5 block text-xs font-semibold text-ink/60">Phone number</label>
          <input
            type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210" autoFocus
            className="mb-4 w-full rounded-xl border border-line bg-paper px-4 py-3 text-base text-ink outline-none focus:border-brand-400"
          />
          <label className="mb-1.5 block text-xs font-semibold text-ink/60">PIN</label>
          <input
            type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className="mb-1 w-full rounded-xl border border-line bg-paper px-4 py-3 text-lg tracking-[0.5em] text-ink outline-none focus:border-brand-400"
          />
          <p className="mb-4 text-xs text-ink/40">Given to you by the shop.</p>
          {error && <p className="mb-4 text-sm font-semibold text-bad-500">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50">
            {loading ? "Checking…" : "View my account"}
          </button>
        </form>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-ink/35">
          <ShieldCheck size={13} /> Only you can see this — ask the shop if you've lost your PIN.
        </p>
      </div>
    </div>
  );
}

function CollectionHistory({ collections }: { collections: Collection[] }) {
  const [open, setOpen] = useState(false);
  if (!collections || collections.length === 0) return null;

  return (
    <div className="mt-4 border-t border-line/60 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left text-xs font-semibold text-ink/60"
      >
        <span>Collection history ({collections.length} {collections.length === 1 ? "date" : "dates"})</span>
        <span className="text-ink/40">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <ul className="mt-3 space-y-3">
          {collections.map((c) => (
            <li key={c.date} className="flex gap-3 text-sm">
              <div className="mt-0.5 h-2 w-2 flex-none rounded-full bg-brand-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink/50">{c.date}</p>
                <p className="text-ink">
                  {c.items.map((it) => `${it.qty} ${it.unit} ${it.name}`.trim()).join(", ")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingCard({ booking }: { booking: Booking }) {
  return (
    <div className="rounded-card border border-line/70 bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="font-semibold text-ink">{booking.number}</p>
          <p className="text-xs text-ink/40">{booking.date}</p>
        </div>
        <span className={`rounded-pill px-2.5 py-1 text-[11px] font-bold ${booking.fullyCollected ? "bg-good-100 text-good-700" : "bg-brand-100 text-brand-700"}`}>
          {booking.fullyCollected ? "Fully collected" : "Pickup pending"}
        </span>
      </div>
      <div className="space-y-4">
        {booking.items.map((it) => (
          <div key={it.itemId}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-medium text-ink">{it.name}</span>
              <span className="text-ink/50">
                {it.booked - it.remaining} of {it.booked} {it.unit} taken
              </span>
            </div>
            <ProgressBar booked={it.booked} remaining={it.remaining} />
            {it.remaining > 0 ? (
              <p className="mt-1 text-xs font-semibold text-brand-600">{it.remaining} {it.unit} left to collect</p>
            ) : (
              <p className="mt-1 text-xs font-semibold text-good-600">All collected</p>
            )}
          </div>
        ))}
      </div>
      <CollectionHistory collections={booking.collections} />
    </div>
  );
}

function LedgerTab() {
  const [statement, setStatement] = useState<Statement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    customerPortalApi.ledger()
      .then((res: any) => { if (!cancelled) setStatement(res); })
      .catch((err: any) => { if (!cancelled) setError(err?.message || "Couldn't load your ledger."); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="rounded-card border border-bad-200 bg-bad-50 p-4 text-sm font-semibold text-bad-600">{error}</div>;
  if (!statement) return <p className="py-10 text-center text-sm text-ink/40">Loading your ledger…</p>;

  // Closing balance > 0 means the customer owes the shop; < 0 means they're in credit
  // (e.g. an advance payment that hasn't been billed against yet).
  const bal = statement.closingBalance;
  const label = bal > 0 ? "You owe" : bal < 0 ? "Advance with us" : "All settled";
  const tone = bal > 0 ? "text-bad-600" : "text-good-600";
  const newestFirst = [...statement.rows].reverse();

  return (
    <>
      <div className="rounded-card border border-line/70 bg-card p-5 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">{label}</p>
        <p className={`mt-1 text-3xl font-bold ${tone}`}>{fmtMoney(Math.abs(bal), CURRENCY)}</p>
        <div className="mt-4 flex gap-6 border-t border-line/60 pt-3 text-xs">
          <div><p className="text-ink/40">Total billed</p><p className="font-semibold text-ink">{fmtMoney(statement.totalDebit, CURRENCY)}</p></div>
          <div><p className="text-ink/40">Total paid</p><p className="font-semibold text-good-700">{fmtMoney(statement.totalCredit, CURRENCY)}</p></div>
        </div>
      </div>

      {newestFirst.length === 0 ? (
        <div className="rounded-card border border-line/70 bg-card p-8 text-center">
          <Receipt size={28} className="mx-auto mb-3 text-ink/25" />
          <p className="font-semibold text-ink">No transactions yet</p>
          <p className="mt-1 text-sm text-ink/45">Your purchases and payments will show up here.</p>
        </div>
      ) : (
        <div className="rounded-card border border-line/70 bg-card px-5 py-2 shadow-card">
          {newestFirst.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-line/60 py-3 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{r.narration || (r.type === "debit" ? "Purchase" : "Payment")}</p>
                <p className="text-xs text-ink/40">{fmtDate(r.date)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-sm font-bold ${r.type === "debit" ? "text-ink" : "text-good-700"}`}>
                  {r.type === "debit" ? "+" : "−"} {fmtMoney(r.amount, CURRENCY)}
                </p>
                <p className="text-xs text-ink/40">Balance {fmtMoney(r.balance, CURRENCY)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function BookingsTab() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    customerPortalApi.bookings()
      .then((res: any) => { if (!cancelled) setBookings(res.bookings || []); })
      .catch((err: any) => { if (!cancelled) setError(err?.message || "Couldn't load your bookings."); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {error && (
        <div className="rounded-card border border-bad-200 bg-bad-50 p-4 text-sm font-semibold text-bad-600">{error}</div>
      )}
      {!error && bookings === null && (
        <p className="py-10 text-center text-sm text-ink/40">Loading your bookings…</p>
      )}
      {!error && bookings && bookings.length === 0 && (
        <div className="rounded-card border border-line/70 bg-card p-8 text-center">
          <Package size={28} className="mx-auto mb-3 text-ink/25" />
          <p className="font-semibold text-ink">No active bookings right now</p>
          <p className="mt-1 text-sm text-ink/45">Once you book items with an advance payment, they'll show up here.</p>
        </div>
      )}
      {bookings?.map((b) => <BookingCard key={b.number} booking={b} />)}
    </>
  );
}

function Dashboard({ name, orgName, onLogout }: { name: string; orgName: string; onLogout: () => void }) {
  const [tab, setTab] = useState<"ledger" | "bookings">("ledger");

  return (
    <div className="min-h-screen bg-paper pb-10">
      <div className="border-b border-line/70 bg-card px-5 py-4">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">{orgName || "My Account"}</p>
            <p className="font-display text-lg font-bold text-ink">Hi, {name || "there"}</p>
          </div>
          <button onClick={onLogout} className="rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-ink/60 hover:bg-paper">
            Log out
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-lg px-5 pt-4">
        <div className="mb-4 flex gap-1 rounded-pill bg-line/50 p-1">
          {([["ledger", "My Ledger"], ["bookings", "Bookings"]] as const).map(([key, label]) => (
            <button
              key={key} type="button" onClick={() => setTab(key)}
              className={`flex-1 rounded-pill py-2 text-sm font-semibold transition ${tab === key ? "bg-card text-ink shadow-sm" : "text-ink/50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="space-y-4">{tab === "ledger" ? <LedgerTab /> : <BookingsTab />}</div>
      </div>
    </div>
  );
}

export function CustomerPortal() {
  const [loggedIn, setLoggedIn] = useState(customerPortalApi.isLoggedIn());
  const [name, setName] = useState(() => window.localStorage.getItem(NAME_KEY) || "");
  const [orgName, setOrgName] = useState(() => window.localStorage.getItem(ORG_KEY) || "");

  const handleLoggedIn = (n: string, o: string) => {
    setName(n);
    setOrgName(o);
    setLoggedIn(true);
  };

  const handleLogout = () => {
    customerPortalApi.setToken(null);
    window.localStorage.removeItem(NAME_KEY);
    window.localStorage.removeItem(ORG_KEY);
    setLoggedIn(false);
  };

  if (!loggedIn) return <LoginScreen onLoggedIn={handleLoggedIn} />;
  return <Dashboard name={name} orgName={orgName} onLogout={handleLogout} />;
}
