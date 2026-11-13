import { ArrowDownToLine, Award, BarChart3, Building2, CalendarClock, ClipboardList, Globe2, HardHat, History, Home, Landmark, PackagePlus, Receipt, Send, ShieldCheck, ShoppingBag, ShoppingCart, TrendingDown, TrendingUp, Truck, Users, Wallet, Warehouse, Store, Settings as SettingsIcon } from "lucide-react";

export const WHATSAPP_GREEN = "#25D366";

export const LOW_STOCK_DEFAULT = 5;
export const PAGE_SIZE = 20;

export const ITEM_CATEGORIES = ["Saria", "Cement", "CPVC", "UPVC", "Kasta", "Wall fit", "Roof fit", "Power Tool", "IOCL", "Sand", "Sanitary", "Others"];

// Brands he stocks — editable in Settings (settings.itemBrands), same pattern as ITEM_CATEGORIES.
export const ITEM_BRANDS = ["Anant", "Shivangi", "Kamdhenu"];

// Suggested units — shown as a type-ahead (datalist) on the item form, not a hard
// restriction, so existing free-text units on old items keep working.
export const ITEM_UNITS = ["kg", "pc", "bundle", "bag", "box", "ft", "ton"];

export const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-chip text-chipText",
  Sent: "bg-brand-100 text-brand-600",
  Accepted: "bg-brand-100 text-brand-600",
  Due: "bg-brand-100 text-brand-600",
  "Partially Paid": "bg-warn-50 text-warn-700",
  Paid: "bg-good-50 text-good-600",
  Overdue: "bg-bad-100 text-bad-600",
  Pending: "bg-warn-50 text-warn-700",
  Delivered: "bg-good-50 text-good-600",
  Received: "bg-good-50 text-good-600",
};

export const CATEGORY_COLORS = ["bg-brand-400","bg-brand-300","bg-warn-500","bg-advance-500","bg-good-500","bg-bad-500"];

/* ---- nav ---- */

export const NAV = [
  { id: "dashboard",  label: "Home",                icon: Home, section: "Overview" },

  { id: "customers",  label: "Customers",            icon: Users, section: "Trading" },
  { id: "items",      label: "Items",                icon: ShoppingBag, section: "Trading" },
  { id: "godowns",    label: "Godowns",              icon: Warehouse, section: "Trading" },
  { id: "orders",     label: "Orders",               icon: ShoppingCart, section: "Trading" },
  { id: "vendors",    label: "Vendors",              icon: Building2, section: "Trading" },
  { id: "purchases",  label: "Purchases",            icon: PackagePlus, section: "Trading" },
  { id: "approvals",  label: "Approvals",            icon: ShieldCheck, section: "Trading" },

  { id: "estimates",  label: "Estimates",            icon: Receipt, section: "Documents" },
  { id: "challans",   label: "Delivery challans",    icon: Truck, section: "Documents" },
  { id: "payments",   label: "Payments received",    icon: ArrowDownToLine, section: "Documents" },
  { id: "expenses",   label: "Expenses",             icon: Wallet, section: "Documents" },

  { id: "todo",       label: "Inventory",            icon: ClipboardList, section: "Insights" },
  { id: "stockAdjustments", label: "Stock adjustments", icon: ClipboardList, section: "Insights" },
  { id: "labour",     label: "Labour tracking",      icon: HardHat, section: "Insights" },
  { id: "contractors", label: "Contractor scorecard", icon: Award, section: "Insights" },
  { id: "vendorScorecard", label: "Vendor scorecard", icon: Building2, section: "Insights" },
  { id: "customerCredit", label: "Customer credit", icon: TrendingDown, section: "Insights" },
  { id: "cashFlowForecast", label: "Cash flow forecast", icon: TrendingUp, section: "Insights" },
  { id: "reports",       label: "Reports",              icon: BarChart3, section: "Insights" },

  { id: "ledger",        label: "Ledger and accounts",    icon: Landmark, section: "Finance" },
  { id: "bankReconciliation", label: "Bank reconciliation", icon: Landmark, section: "Finance" },
  { id: "financialYears", label: "Financial years",      icon: CalendarClock, section: "Finance" },
  { id: "sharereport",   label: "Share report",         icon: Send, section: "Finance" },
  { id: "billing",       label: "Advanced billing",     icon: Globe2, section: "Finance" },

  { id: "settings",   label: "Settings",             icon: SettingsIcon, section: "Finance" },
  { id: "auditLog",   label: "Audit log",            icon: History, section: "Finance" },

  { id: "portalAdmin", label: "Customer portal",     icon: Store, section: "Customer Portal" },
];

/* ---- Bottom nav (mobile) + radial quick-add FAB ---- */

export const BOTTOM_NAV_IDS = ["dashboard", "estimates", "customers"];

// Screens a staff login can't open. The server enforces this too (see
// backend/middleware/roles.js); hiding them here just keeps the menu honest.
// Staff still get Settings, but only their own PIN change (see SettingsView).
export const OWNER_ONLY_NAV_IDS = new Set([
  "approvals", "ledger", "bankReconciliation", "financialYears", "cashFlowForecast",
  "reports", "vendorScorecard", "sharereport", "billing", "auditLog", "portalAdmin",
]);

/* ---- ChallanModal ---- */

export const MAX_ENTRY_ROWS = 10;

export const LABOUR_RATES = { cement: 4, saria: 20, balu: 5 };

// saria is entered in kg on estimates, but Labour Tracking pays per bundle —
// this is the approximate kg-to-bundle conversion used when pulling estimate
// data into a labour session.
export const SARIA_KG_PER_BUNDLE = 81;

/* ---- Five tabs and a profile menu: 28 destinations, one obvious home each ---- */

export type TabId = "home" | "sell" | "stock" | "money" | "team";

export interface TabDef {
  id: TabId;
  label: string;
  /** The view id this tab opens (a hub page, or the dashboard for Home). */
  view: string;
  blurb: string;
  /** Destination view ids that live under this tab. Nothing is removed. */
  members: string[];
}

export const TABS: TabDef[] = [
  { id: "home",  label: "Home",  view: "dashboard", blurb: "Today, the Brief and the capture bar", members: ["dashboard"] },
  { id: "sell",  label: "Sell",  view: "sell",  blurb: "Customers, estimates, challans, payments and credit", members: ["customers", "estimates", "challans", "payments", "orders", "customerCredit"] },
  { id: "stock", label: "Stock", view: "stock", blurb: "What you hold, what's running out, what you buy", members: ["items", "godowns", "todo", "stockAdjustments", "purchases", "vendors", "vendorScorecard"] },
  { id: "money", label: "Money", view: "money", blurb: "Spending, accounts, reports and the books", members: ["expenses", "ledger", "bankReconciliation", "cashFlowForecast", "reports", "sharereport", "financialYears", "billing"] },
  { id: "team",  label: "Team",  view: "team",  blurb: "Labour, contractors and approvals", members: ["labour", "contractors", "approvals"] },
];

/** Reached from the profile menu rather than a tab. */
export const PROFILE_MEMBERS = ["settings", "auditLog", "portalAdmin"];

/** One line under each destination on its hub page. */
export const NAV_BLURB: Record<string, string> = {
  customers: "Profiles, history and what each one owes",
  estimates: "Create, send and track bills",
  challans: "Delivery slips for goods going out",
  payments: "Money received, matched to bills",
  orders: "Stock ordered from vendors, waiting to arrive",
  customerCredit: "Who owes you, and how late they pay",
  items: "Prices, units and stock levels",
  godowns: "Where your stock is kept",
  todo: "Count stock and settle the difference",
  stockAdjustments: "Every correction, with the reason",
  purchases: "Stock bought from vendors",
  vendors: "Who you buy from, and what you owe",
  vendorScorecard: "How reliably each vendor delivers",
  expenses: "Money going out of the business",
  ledger: "Accounts, balances and entries",
  bankReconciliation: "Match your bank statement to the books",
  cashFlowForecast: "What's coming in and going out",
  reports: "Sales, profit and stock reports",
  sharereport: "Send a summary on WhatsApp",
  financialYears: "Open, close and switch years",
  billing: "Invoices, terms and extras",
  labour: "Loading and unloading, session by session",
  contractors: "Who brings in the most business",
  approvals: "Requests waiting for your decision",
  settings: "Business details, staff and preferences",
  auditLog: "Who changed what, and when",
  portalAdmin: "What your customers can see online",
};

export function tabForView(view: string): TabId | null {
  if (view === "customerDetail") return "sell";
  for (const t of TABS) {
    if (t.view === view || t.members.includes(view)) return t.id;
  }
  return null;
}
