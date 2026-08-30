import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, LogOut, Search, X } from "lucide-react";
import { NAV } from "../../lib/constants";
import { LOW_STOCK_DEFAULT } from "../../lib/constants";

/* ---- Sidebar: a permanent dark nav rail (independent of the light/dark app theme) ---- */

// The 4 screens covering the bulk of a normal day — surfaced above the
// section list so the common case never requires scrolling or remembering
// which section something lives under.
const PINNED_IDS = ["dashboard", "estimates", "customers", "items"];

// Insights/Finance are real workflows but get opened far less often day to
// day than Trading/Documents — collapsed by default so the rail opens onto
// what's actually used daily, without hiding anything permanently.
const DEFAULT_OPEN_SECTIONS: Record<string, boolean> = {
  Overview: true, Trading: true, Documents: true, Insights: false, Finance: false,
};

const SECTION_COLLAPSE_KEY = "sbt_sidebar_collapsed_sections";

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

  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(SECTION_COLLAPSE_KEY);
      return raw ? { ...DEFAULT_OPEN_SECTIONS, ...JSON.parse(raw) } : DEFAULT_OPEN_SECTIONS;
    } catch {
      return DEFAULT_OPEN_SECTIONS;
    }
  });

  // Whichever section the current screen lives in should never be hidden —
  // otherwise navigating here from elsewhere (a shortcut, a deep link) would
  // leave the highlighted item tucked inside a collapsed section.
  useEffect(() => {
    const activeSection = NAV.find((n: any) => n.id === active)?.section;
    if (activeSection && !openSections[activeSection]) {
      setOpenSections((prev) => ({ ...prev, [activeSection]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const toggleSection = (name: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      try { localStorage.setItem(SECTION_COLLAPSE_KEY, JSON.stringify(next)); } catch { /* storage unavailable, ignore */ }
      return next;
    });
  };

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const visibleSections = useMemo(() => {
    if (!isSearching) return sections;
    return sections
      .map((sec) => ({ ...sec, items: sec.items.filter((n: any) => n.label.toLowerCase().includes(q)) }))
      .filter((sec) => sec.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, isSearching]);

  const pinned = PINNED_IDS.map((id) => NAV.find((n: any) => n.id === id)).filter(Boolean) as typeof NAV;
  const attentionCount = overdueCount + lowStockCount;

  const initials = (settings.ownerName || "SB").trim().split(/\s+/).map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  const navTo = (id: string) => { onNav(id); onClose(); setSearch(""); };

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

          {attentionCount > 0 && !isSearching && (
            <div className="mx-2.5 mt-3 flex gap-1.5">
              {overdueCount > 0 && (
                <button onClick={() => navTo("estimates")} className="flex flex-1 items-center gap-1.5 rounded-lg bg-bad-500/15 px-2.5 py-1.5 text-left">
                  <AlertTriangle size={12} className="shrink-0 text-bad-400" />
                  <span className="truncate text-[10.5px] font-medium text-bad-300">{overdueCount} overdue</span>
                </button>
              )}
              {lowStockCount > 0 && (
                <button onClick={() => navTo("todo")} className="flex flex-1 items-center gap-1.5 rounded-lg bg-warn-500/15 px-2.5 py-1.5 text-left">
                  <AlertTriangle size={12} className="shrink-0 text-warn-400" />
                  <span className="truncate text-[10.5px] font-medium text-warn-300">{lowStockCount} low stock</span>
                </button>
              )}
            </div>
          )}

          {!isSearching && (
            <div className="mx-2.5 mt-3 grid grid-cols-4 gap-1.5">
              {pinned.map((n: any) => {
                const Icon = n.icon; const isActive = active === n.id;
                return (
                  <button
                    key={n.id} onClick={() => navTo(n.id)} title={n.label}
                    className={`flex flex-col items-center gap-1 rounded-lg py-2 ${isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"}`}
                  >
                    <Icon size={16} className={isActive ? "text-orange-500" : "text-sidebarText"} strokeWidth={1.8} />
                    <span className={`truncate text-[9px] font-medium ${isActive ? "text-white" : "text-sidebarHeading"}`}>{n.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="relative mx-2.5 mt-3">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sidebarHeading" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu"
              className="w-full rounded-lg border border-sidebarLine bg-white/[0.04] py-1.5 pl-7 pr-6 text-[11.5px] text-white placeholder:text-sidebarHeading focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {isSearching && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebarHeading hover:text-white">
                <X size={13} />
              </button>
            )}
          </div>

          <nav className="mt-1 flex-1 px-2.5">
            {visibleSections.length === 0 && (
              <p className="px-2.5 pt-4 text-[11.5px] text-sidebarHeading">No menu items match "{search}".</p>
            )}
            {visibleSections.map((sec) => {
              const isOpen = isSearching || openSections[sec.name];
              return (
                <div key={sec.name} className="mb-0.5">
                  <button
                    onClick={() => toggleSection(sec.name)}
                    disabled={isSearching}
                    className="flex w-full items-center justify-between px-2.5 pb-1.5 pt-3 text-left"
                  >
                    <span className="text-[9.5px] font-semibold uppercase tracking-wide text-sidebarHeading">{sec.name}</span>
                    {!isSearching && (
                      <ChevronDown size={12} className={`text-sidebarHeading transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    )}
                  </button>
                  {isOpen && sec.items.map((n: any) => {
                    const Icon = n.icon; const isActive = active === n.id; const badge = badgeFor[n.id];
                    return (
                      <button key={n.id} onClick={() => navTo(n.id)}
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
              );
            })}
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
