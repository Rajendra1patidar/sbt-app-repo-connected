import { ArrowDownToLine, Award, BarChart3, Building2, CalendarClock, ClipboardList, Globe2, HardHat, Home, Landmark, PackagePlus, Receipt, Send, ShieldCheck, ShoppingBag, ShoppingCart, TrendingDown, TrendingUp, Truck, Users, Wallet, Settings as SettingsIcon } from "lucide-react";

export const WHATSAPP_GREEN = "#25D366";

export const LOW_STOCK_DEFAULT = 5;
export const PAGE_SIZE = 20;

export const ITEM_CATEGORIES = ["Saria", "Cement", "CPVC", "UPVC", "Kasta", "Wall fit", "Roof fit", "Power Tool", "IOCL", "Sand", "Sanitary", "Others"];

export const STATUS_STYLES: Record<string, string> = {
  Accepted: "bg-advance-50 text-advance-700",
  Due: "bg-warn-50 text-warn-700",
  "Partially Paid": "bg-advance-50 text-advance-700",
  Paid: "bg-good-50 text-good-700",
  Overdue: "bg-bad-50 text-bad-700",
  Pending: "bg-warn-50 text-warn-700",
  Delivered: "bg-good-50 text-good-700",
  Received: "bg-good-50 text-good-700",
};

export const CATEGORY_COLORS = ["bg-brand-400","bg-brand-300","bg-warn-500","bg-advance-500","bg-good-500","bg-bad-500"];

/* ---- nav ---- */

export const NAV = [
  { id: "dashboard",  label: "Home",                icon: Home, section: "Overview" },

  { id: "customers",  label: "Customers",            icon: Users, section: "Trading" },
  { id: "items",      label: "Items",                icon: ShoppingBag, section: "Trading" },
  { id: "orders",     label: "Orders",               icon: ShoppingCart, section: "Trading" },
  { id: "vendors",    label: "Vendors",              icon: Building2, section: "Trading" },
  { id: "purchases",  label: "Purchases",            icon: PackagePlus, section: "Trading" },
  { id: "approvals",  label: "Approvals",            icon: ShieldCheck, section: "Trading" },

  { id: "estimates",  label: "Estimates",            icon: Receipt, section: "Documents" },
  { id: "challans",   label: "Delivery Challans",    icon: Truck, section: "Documents" },
  { id: "payments",   label: "Payments Received",    icon: ArrowDownToLine, section: "Documents" },
  { id: "expenses",   label: "Expenses",             icon: Wallet, section: "Documents" },

  { id: "todo",       label: "Inventory",            icon: ClipboardList, section: "Insights" },
  { id: "labour",     label: "Labour Tracking",      icon: HardHat, section: "Insights" },
  { id: "contractors", label: "Contractor Scorecard", icon: Award, section: "Insights" },
  { id: "vendorScorecard", label: "Vendor Scorecard", icon: Building2, section: "Insights" },
  { id: "customerCredit", label: "Customer Credit", icon: TrendingDown, section: "Insights" },
  { id: "cashFlowForecast", label: "Cash Flow Forecast", icon: TrendingUp, section: "Insights" },
  { id: "reports",       label: "Reports",              icon: BarChart3, section: "Insights" },

  { id: "ledger",        label: "Ledger & Accounts",    icon: Landmark, section: "Finance" },
  { id: "bankReconciliation", label: "Bank Reconciliation", icon: Landmark, section: "Finance" },
  { id: "financialYears", label: "Financial Years",      icon: CalendarClock, section: "Finance" },
  { id: "sharereport",   label: "Share Report",         icon: Send, section: "Finance" },
  { id: "billing",       label: "Advanced Billing",     icon: Globe2, section: "Finance" },

  { id: "settings",   label: "Settings",             icon: SettingsIcon, section: "Finance" },
];

/* ---- Bottom nav (mobile) + radial quick-add FAB ---- */

export const BOTTOM_NAV_IDS = ["dashboard", "estimates", "customers"];

/* ---- ChallanModal ---- */

export const MAX_ENTRY_ROWS = 10;

export const LABOUR_RATES = { cement: 4, saria: 20, balu: 5 };

// saria is entered in kg on estimates, but Labour Tracking pays per bundle —
// this is the approximate kg-to-bundle conversion used when pulling estimate
// data into a labour session.
export const SARIA_KG_PER_BUNDLE = 81;
