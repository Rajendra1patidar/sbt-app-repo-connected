import type { ReactNode } from "react";
import { tabsForRole, type TabId } from "../../lib/constants";
import { HomeIcon, MoneyIcon, SellIcon, StockIcon, TeamIcon, ChevronRightIcon } from "../ui/icons";
import { Avatar, GlassBar, cx } from "../ui/kit";

/* ---- Five tabs: Home, Sell, Stock, Money, Team. Profile lives in a menu. ---- */

const TAB_ICONS: Record<TabId, (p: { size?: number; className?: string }) => ReactNode> = {
  home: HomeIcon, sell: SellIcon, stock: StockIcon, money: MoneyIcon, team: TeamIcon,
};

/** Phone: a translucent bar pinned to the bottom, 5 tabs, label under each icon. */
export function TabBar({ active, onNav, role }: { active: TabId | null; onNav: (view: string) => void; role?: string }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 md:hidden">
      <GlassBar className="px-2 pt-2" >
        <div className="flex justify-around" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 14px)" }}>
          {tabsForRole(role).map((t) => {
            const Icon = TAB_ICONS[t.id];
            const isActive = active === t.id;
            return (
              <button key={t.id} type="button" onClick={() => onNav(t.view)} aria-current={isActive ? "page" : undefined}
                className={cx("flex h-12 w-16 flex-col items-center justify-center gap-[3px] text-[10.5px] font-medium transition-colors active:opacity-60", isActive ? "text-brand-500" : "text-mute")}>
                <Icon size={22} />
                {t.label}
              </button>
            );
          })}
        </div>
      </GlassBar>
    </nav>
  );
}

/** Desktop and tablet: the same five destinations as a calm left rail. */
export function NavRail({ active, onNav, orgName, ownerName, roleLabel, onProfile, role }: {
  active: TabId | null; onNav: (view: string) => void; orgName: string; ownerName: string; roleLabel: string; onProfile: () => void; role?: string;
}) {
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-line bg-card px-3 py-5 md:flex">
      <div className="mb-5 px-3">
        <p className="truncate text-[17px] font-semibold leading-6 text-ink">{orgName || "Shree Balaji Traders"}</p>
        <p className="text-caption text-mute">Business, one place</p>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {tabsForRole(role).map((t) => {
          const Icon = TAB_ICONS[t.id];
          const isActive = active === t.id;
          return (
            <button key={t.id} type="button" onClick={() => onNav(t.view)} aria-current={isActive ? "page" : undefined}
              className={cx("flex h-11 items-center gap-3 rounded-control px-3 text-[15px] transition-colors", isActive ? "bg-brand-50 font-semibold text-brand-600" : "font-medium text-mute hover:bg-paper")}>
              <Icon size={22} />
              {t.label}
            </button>
          );
        })}
      </nav>
      <button type="button" onClick={onProfile} className="mt-auto flex items-center gap-3 rounded-control border border-line px-3 py-2.5 text-left transition-colors hover:bg-paper">
        <Avatar name={ownerName || "Owner"} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium text-ink">{ownerName || "Owner"}</span>
          <span className="block text-micro text-mute">{roleLabel}</span>
        </span>
        <ChevronRightIcon size={16} className="text-faint" />
      </button>
    </aside>
  );
}
