import { NAV, TABS, tabForView } from "../../lib/constants";
import { ChevronLeftIcon, PlusIcon, SearchIcon } from "../ui/icons";
import { LargeTitle, RoundButton } from "../ui/kit";

// A few menu names are too long for a 34px title beside the buttons ("Payments received" would be cut off).
// The title says the short form; the menu and search keep the full name.
const SHORT_TITLE: Record<string, string> = { payments: "Payments", challans: "Challans" };

/**
 * Every destination without a title of its own gets the same one: a large title, a quiet
 * "‹ Sell" back link to the tab it lives in, and search. One language for every screen.
 *
 * `action` is the screen's one main task (a new customer, record a payment): the solid "+" that
 * Estimates and the hub pages already carry in the same place.
 */
export function ScreenTitle({ view, onNav, onSearch, action }: { view: string; onNav: (view: string) => void; onSearch: () => void; action?: { label: string; onClick: () => void } }) {
  const tab = TABS.find((t) => t.id === tabForView(view));
  const isDetail = view === "customerDetail";
  const label = SHORT_TITLE[view] || NAV.find((n) => n.id === view)?.label || "";
  const back = isDetail ? { label: "Customers", view: "customers" } : tab && tab.view !== view ? { label: tab.label, view: tab.view } : !tab ? { label: "Home", view: "dashboard" } : null;

  return (
    <div className="px-5">
      {back && (
        <button type="button" onClick={() => onNav(back.view)} className="-ml-1.5 mt-6 inline-flex h-9 items-center gap-0.5 pr-2 text-[15px] font-medium text-brand-600 active:opacity-60">
          <ChevronLeftIcon size={18} />{back.label}
        </button>
      )}
      {!isDetail && (
        <LargeTitle className={back ? "!pt-0.5" : ""} title={label} right={
          <>
            {action && <RoundButton variant="solid" label={action.label} onClick={action.onClick}><PlusIcon size={24} /></RoundButton>}
            <RoundButton label="Search" onClick={onSearch}><SearchIcon size={22} /></RoundButton>
          </>
        } />
      )}
    </div>
  );
}
