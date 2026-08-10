import { LogOut } from "lucide-react";
import { NAV } from "../../lib/constants";
import { LOW_STOCK_DEFAULT } from "../../lib/constants";

/* ---- Sidebar: a permanent dark nav rail (independent of the light/dark app theme) ---- */

function compactINR(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
}

function SalesSpark({ estimates }: { estimates: any[] }) {
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - i)); d.setHours(0, 0, 0, 0);
    return dayKey(d);
  });
  const totals = days.map((key) =>
    (estimates || []).filter((e: any) => String(e.date || "").slice(0, 10) === key).reduce((s: number, e: any) => s + Number(e.total || 0), 0)
  );
  const total7 = totals.reduce((s, v) => s + v, 0);

  const prevStart = new Date(now); prevStart.setDate(prevStart.getDate() - 13); prevStart.setHours(0, 0, 0, 0);
  const prevEnd = new Date(now); prevEnd.setDate(prevEnd.getDate() - 7); prevEnd.setHours(0, 0, 0, 0);
  const prevTotal7 = (estimates || [])
    .filter((e: any) => { const t = new Date(e.date).getTime(); return t >= prevStart.getTime() && t < prevEnd.getTime(); })
    .reduce((s: number, e: any) => s + Number(e.total || 0), 0);
  const change = prevTotal7 > 0 ? Math.round(((total7 - prevTotal7) / prevTotal7) * 100) : null;

  const max = Math.max(1, ...totals);
  const w = 100, h = 26, step = w / (totals.length - 1 || 1);
  const points = totals.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 3) - 1).toFixed(1)}`).join(" ");

  return (
    <div className="mx-2.5 mt-4 mb-1 rounded-xl bg-white/[0.04] px-2.5 pt-2.5 pb-2">
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] uppercase tracking-wide text-sidebarHeading">7-day sales</span>
        {change != null && (
          <span className={`font-mono text-[10px] font-semibold ${change >= 0 ? "text-good-400" : "text-bad-400"}`}>{change >= 0 ? "↑" : "↓"} {Math.abs(change)}%</span>
        )}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold text-white">{compactINR(total7)}</span>
        <svg viewBox={`0 0 ${w} ${h}`} className="h-[22px] w-[64px]" preserveAspectRatio="none">
          <polyline points={points} fill="none" stroke="#EA6B2E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose, active, onNav, settings, onSignOut, estimates = [], items = [], overdueCount = 0 }: any) {
  const lowStockCount = items.filter((it: any) => !it.deleted && (it.stock ?? 0) <= (it.lowStock ?? LOW_STOCK_DEFAULT)).length;
  const badgeFor: Record<string, number> = { estimates: overdueCount, items: lowStockCount };

  const sections: { name: string; items: typeof NAV }[] = [];
  NAV.forEach((n: any) => {
    const sec = n.section || "Other";
    let group = sections.find((s) => s.name === sec);
    if (!group) { group = { name: sec, items: [] }; sections.push(group); }
    group.items.push(n);
  });

  const initials = (settings.ownerName || "SB").trim().split(/\s+/).map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-[1px] md:hidden animate-fade-in" />}
      <aside className={`fixed z-40 inset-y-0 left-0 w-[248px] transform bg-sidebar border-r border-sidebarLine transition-transform duration-300 ease-out md:translate-x-0 md:static md:z-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col overflow-y-auto py-4">
          <div className="flex items-center gap-2.5 px-4 pb-1">
            <div className="relative h-9 w-9 shrink-0 select-none">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full">
                <defs>
                  <linearGradient id="sbtGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1e3a8a"/><stop offset="100%" stopColor="#2563eb"/>
                  </linearGradient>
                </defs>
                <rect width="64" height="64" rx="16" fill="url(#sbtGrad)"/>
                <rect x="6" y="44" width="52" height="3" rx="1.5" fill="#f59e0b" opacity="0.9"/>
                <text x="32" y="36" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="20" letterSpacing="1" fill="white">SBT</text>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-display text-[13.5px] font-medium leading-tight text-white truncate">{settings.orgName}</p>
              {settings.email && <p className="truncate text-[10.5px] leading-tight text-sidebarHeading">{settings.email}</p>}
            </div>
            <button onClick={onClose} className="ml-auto rounded-full p-1.5 text-sidebarText hover:bg-white/5 md:hidden">✕</button>
          </div>

          <nav className="mt-2 flex-1 px-2.5">
            {sections.map((sec) => (
              <div key={sec.name} className="mb-0.5">
                <div className="px-2.5 pb-1.5 pt-3 text-[9.5px] font-semibold uppercase tracking-wide text-sidebarHeading">{sec.name}</div>
                {sec.items.map((n: any) => {
                  const Icon = n.icon; const isActive = active === n.id; const badge = badgeFor[n.id];
                  return (
                    <button key={n.id} onClick={() => { onNav(n.id); onClose(); }}
                      className={`mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors duration-100 ${isActive ? "bg-white/[0.08] text-white" : "text-sidebarText hover:bg-white/[0.05]"}`}>
                      <Icon size={15} className={isActive ? "text-orange-500" : "opacity-70"} strokeWidth={1.8} />
                      <span className="truncate">{n.label}</span>
                      {!!badge && (
                        <span className="ml-auto rounded-pill bg-bad-500 px-1.5 py-[1px] font-mono text-[9px] font-semibold text-white">{badge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <SalesSpark estimates={estimates} />

          <div className="mx-2.5 mt-3 flex items-center gap-2.5 border-t border-sidebarLine pt-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 font-mono text-[10px] font-semibold text-white">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11.5px] font-medium text-white">{settings.ownerName || "Owner"}</p>
              <p className="text-[9.5px] text-sidebarHeading">Owner</p>
            </div>
            <button onClick={onSignOut} title="Sign out" className="rounded-full p-1.5 text-sidebarText hover:bg-white/5 hover:text-white">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
