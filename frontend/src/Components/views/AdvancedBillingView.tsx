import { Card, EmptyState } from "../common/UIPrimitives";

/* ---- Advanced Billing ---- */

export function AdvancedBillingView({ autoReminder, setAutoReminder, overdueCount, settings }: any) {
  return (
    <div className="space-y-4 px-5 pb-28">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-ink">WhatsApp payment reminders</h3>
            <p className="mt-1 text-sm text-ink/40">Show a banner for overdue estimates with one-tap WhatsApp messaging.</p>
          </div>
          <button onClick={() => setAutoReminder((v: boolean) => !v)} className={`h-7 w-12 shrink-0 rounded-full p-0.5 transition ${autoReminder ? "bg-good-500" : "bg-paper"}`}>
            <span className={`block h-6 w-6 rounded-full bg-white transition ${autoReminder ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        {autoReminder && <p className="mt-3 rounded-xl bg-good-50 px-3 py-2 text-xs font-semibold text-good-700">Enabled — {overdueCount} overdue estimate{overdueCount !== 1 ? "s" : ""} will be flagged.</p>}
      </Card>
      <Card>
        <h3 className="font-display text-base font-bold text-ink">Recurring estimates</h3>
        <p className="mt-1 text-sm text-ink/40">Set up retainer or subscription billing.</p>
        <EmptyState text="No recurring profiles yet." />
      </Card>
      <Card>
        <h3 className="font-display text-base font-bold text-ink">Business WhatsApp number</h3>
        <p className="mt-1 text-sm text-ink/40">{settings.businessWhatsApp ? `Connected: ${settings.businessWhatsApp}` : "Not set — add one in Settings."}</p>
      </Card>
    </div>
  );
}
