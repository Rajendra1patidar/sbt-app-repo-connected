import { ChevronDown, Menu, X } from "lucide-react";
import { NAV } from "../../lib/constants";

/* ---- Sidebar + Topbar ---- */

export function Sidebar({ open, onClose, active, onNav, settings, onSignOut }: any) {
  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-[1px] md:hidden animate-fade-in" />}
      <aside className={`fixed z-40 inset-y-0 left-0 w-72 transform bg-white border-r border-line transition-transform duration-300 ease-out md:translate-x-0 md:static md:z-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-full flex-col overflow-y-auto px-5 py-6">
          <div className="flex items-center justify-between md:hidden mb-2">
            <span className="text-sm font-semibold text-ink/40">Menu</span>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper"><X size={18} /></button>
          </div>
          <div className="mb-5 flex flex-col items-center text-center">
            <div className="mb-3 relative w-16 h-16 select-none">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-md">
                <defs>
                  <linearGradient id="sbtGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#1e3a8a"/>
                    <stop offset="100%" stopColor="#2563eb"/>
                  </linearGradient>
                  <linearGradient id="sbtShine" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="white" stopOpacity="0.18"/>
                    <stop offset="100%" stopColor="white" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                {/* Background rounded square */}
                <rect width="64" height="64" rx="16" fill="url(#sbtGrad)"/>
                {/* Gold accent bar */}
                <rect x="6" y="44" width="52" height="3" rx="1.5" fill="#f59e0b" opacity="0.9"/>
                {/* Shine overlay */}
                <rect width="64" height="64" rx="16" fill="url(#sbtShine)"/>
                {/* SBT text */}
                <text x="32" y="36" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="20" letterSpacing="1" fill="white">SBT</text>
              </svg>
            </div>
            <button className="flex items-center gap-1 font-display text-lg font-semibold text-ink">{settings.orgName} <ChevronDown size={16} className="text-ink/30" /></button>
            <p className="text-sm text-ink/40">{settings.email}</p>
          </div>
          <div className="-mx-5 mb-2 border-t border-line" />
          <nav className="flex-1 space-y-1">
            {NAV.map((n) => {
              const Icon = n.icon; const isActive = active === n.id;
              return (
                <button key={n.id} onClick={() => { onNav(n.id); onClose(); }}
                  className={`flex w-full items-center gap-3 rounded-pill px-3 py-3 text-sm font-semibold transition-all duration-150 ${isActive ? "bg-brand-500 text-white shadow-sm" : "text-ink/70 hover:bg-paper"}`}>
                  <Icon size={19} /> {n.label}
                </button>
              );
            })}
          </nav>
          <div className="-mx-5 mt-2 border-t border-line pt-3">
            <button onClick={onSignOut} className="flex w-full items-center gap-3 rounded-pill px-3 py-3 text-sm font-semibold text-ink/50 hover:bg-paper">
              <X size={19} /> Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
