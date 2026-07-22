import { Bell, LifeBuoy, Menu, Search } from "lucide-react";
import { NAV } from "../../lib/constants";

export function Topbar({ onMenu, settings, view, onOpenSearch }: any) {
  const titleMap: any = Object.fromEntries(NAV.map((n) => [n.id, n.label]));
  titleMap.customerDetail = "Customer";
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between bg-paper/90 backdrop-blur px-5 py-4 border-b border-line/60">
      <div className="flex items-center gap-3">
        <button onClick={onMenu} className="rounded-full p-2 hover:bg-white md:hidden"><Menu size={22} /></button>
        <span className="font-display text-lg font-semibold text-ink">{view === "dashboard" ? settings.orgName : titleMap[view]}</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onOpenSearch} className="rounded-full border border-line bg-white p-2 hover:border-brand-200 transition-colors"><Search size={18} className="text-ink/50" /></button>
        <button className="rounded-full border border-line bg-white p-2 hover:border-brand-200 transition-colors hidden sm:inline-flex"><LifeBuoy size={18} className="text-ink/50" /></button>
        <button className="relative rounded-full border border-line bg-white p-2 hover:border-brand-200 transition-colors"><Bell size={18} className="text-ink/50" /></button>
      </div>
    </div>
  );
}
