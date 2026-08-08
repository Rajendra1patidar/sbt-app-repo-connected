import React, { useState } from "react";
import { Menu, Plus, Receipt, Users, Wallet } from "lucide-react";
import { BOTTOM_NAV_IDS, NAV } from "../../lib/constants";

export function BottomNav({ active, onNav, onMore, onQuickAction }: any) {
  const [fabOpen, setFabOpen] = useState(false);
  const items = NAV.filter((n) => BOTTOM_NAV_IDS.includes(n.id));
  const quickActions = [
    { key: "expense", label: "New expense", icon: Wallet },
    { key: "customer", label: "New customer", icon: Users },
    { key: "estimate", label: "New estimate", icon: Receipt },
  ];
  return (
    <>
      {fabOpen && (
        <div onClick={() => setFabOpen(false)} className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[1px] md:hidden animate-fade-in" />
      )}
      <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
        {fabOpen && (
          <div className="absolute bottom-24 right-4 flex flex-col items-end gap-2">
            {quickActions.map((a, i) => {
              const Icon = a.icon;
              return (
                <button key={a.key} onClick={() => { onQuickAction(a.key); setFabOpen(false); }}
                  style={{ animationDelay: `${i * 30}ms` }}
                  className="animate-pop-in flex items-center gap-2 rounded-pill bg-white border border-line pl-4 pr-3 py-2.5 shadow-card text-sm font-semibold text-ink/80">
                  {a.label} <Icon size={16} className="text-brand-500" />
                </button>
              );
            })}
          </div>
        )}
        <nav className="relative flex items-center justify-around bg-white border-t border-line pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] px-2">
          {items.slice(0, 2).map((n) => {
            const Icon = n.icon; const isActive = active === n.id;
            return (
              <button key={n.id} onClick={() => onNav(n.id)} className="flex flex-col items-center gap-1 px-3 py-1">
                <Icon size={20} className={isActive ? "text-brand-500" : "text-ink/35"} />
                <span className={`text-[10px] font-semibold ${isActive ? "text-brand-500" : "text-ink/35"}`}>{n.label}</span>
              </button>
            );
          })}
          <button onClick={() => setFabOpen((o) => !o)}
            className={`-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-card transition-transform duration-200 active:scale-95 ${fabOpen ? "rotate-45" : ""}`}>
            <Plus size={24} />
          </button>
          {items.slice(2).map((n) => {
            const Icon = n.icon; const isActive = active === n.id;
            return (
              <button key={n.id} onClick={() => onNav(n.id)} className="flex flex-col items-center gap-1 px-3 py-1">
                <Icon size={20} className={isActive ? "text-brand-500" : "text-ink/35"} />
                <span className={`text-[10px] font-semibold ${isActive ? "text-brand-500" : "text-ink/35"}`}>{n.label}</span>
              </button>
            );
          })}
          <button onClick={onMore} className="flex flex-col items-center gap-1 px-3 py-1">
            <Menu size={20} className="text-ink/35" />
            <span className="text-[10px] font-semibold text-ink/35">More</span>
          </button>
        </nav>
      </div>
    </>
  );
}
