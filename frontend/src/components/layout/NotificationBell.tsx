import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CreditCard, FileText, Package, ShieldAlert, TrendingDown, Users, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

/* ---- Notification bell: badge + dropdown inbox, backed by useAppStore ---- */

const ICONS: Record<string, any> = {
  "stock.low": Package,
  "stock.reorder-suggested": Package,
  "payment.received": CreditCard,
  "payment.refunded": CreditCard,
  "purchase.received": Package,
  "reconciliation.failed": ShieldAlert,
  "approval.requested": Users,
  "customer.credit-risk": TrendingDown,
  "estimate.created": FileText,
};

// Where tapping a notification takes you — only views that already exist.
// Notifications for the approval queue have nowhere to go yet, so those
// just mark themselves read without navigating.
function targetPath(n: any): string | null {
  switch (n.type) {
    case "stock.low":
    case "stock.reorder-suggested":
    case "purchase.received":
      return "/inventory";
    case "payment.received":
    case "payment.refunded":
      return "/payments";
    case "reconciliation.failed":
      return "/ledger";
    case "customer.credit-risk":
      return n.refId ? `/customers/${n.refId}` : "/customers";
    case "estimate.created":
      return "/estimates";
    default:
      return null;
  }
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, fetchNotifications, markNotificationRead, markAllNotificationsRead, clearNotification, clearAllNotifications } = useAppStore();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Refresh whenever the panel opens, so anything the nightly jobs or
  // another session created since the last full page load shows up —
  // fetchAll only ran once, on login.
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function handleSelect(n: any) {
    markNotificationRead(n.id);
    const path = targetPath(n);
    if (path) navigate(path);
    setOpen(false);
  }

  function handleClear(e: React.MouseEvent, id: string) {
    e.stopPropagation(); // don't trigger the row's own onClick (mark-read + navigate)
    clearNotification(id);
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full border border-line bg-card p-2 hover:border-brand-200 transition-colors"
      >
        <Bell size={18} className="text-ink/50" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-80 max-w-[90vw] rounded-2xl border border-line bg-card shadow-xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button onClick={markAllNotificationsRead} className="text-xs font-medium text-brand-600 hover:underline">
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAllNotifications} className="text-xs font-medium text-ink/40 hover:text-bad-600 hover:underline">
                  Clear all
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink/40">Nothing here yet.</p>
            )}
            {notifications.map((n) => {
              const Icon = ICONS[n.type] || Bell;
              return (
                <div
                  key={n.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(n)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(n); } }}
                  className={`group flex w-full cursor-pointer items-start gap-3 border-b border-line/60 px-4 py-3 text-left transition-colors hover:bg-paper ${n.read ? "" : "bg-brand-50/40"}`}
                >
                  <div className={`mt-0.5 rounded-full p-1.5 ${n.read ? "bg-ink/5 text-ink/40" : "bg-brand-100 text-brand-600"}`}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.read ? "text-ink/70" : "font-semibold text-ink"}`}>{n.title}</p>
                    {n.body && <p className="mt-0.5 text-xs text-ink/50 line-clamp-2">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-ink/30">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
                  <button
                    type="button"
                    aria-label="Clear notification"
                    onClick={(e) => handleClear(e, n.id)}
                    className="mt-0.5 shrink-0 rounded-full p-1 text-ink/20 opacity-0 transition-opacity hover:bg-bad-50 hover:text-bad-600 group-hover:opacity-100"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
