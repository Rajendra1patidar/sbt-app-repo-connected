import { ArrowDownToLine, Award, BarChart3, ClipboardList, Globe2, HardHat, Home, Receipt, Send, ShoppingBag, ShoppingCart, Truck, Users, Wallet, Settings as SettingsIcon } from "lucide-react";

export const WHATSAPP_GREEN = "#25D366";

export const LOW_STOCK_DEFAULT = 5;

export const ITEM_CATEGORIES = ["Saria", "Cement", "CPVC", "UPVC", "Kasta", "Others"];

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
  { id: "dashboard",  label: "Home",                icon: Home },
  { id: "customers",  label: "Customers",            icon: Users },
  { id: "items",      label: "Items",                icon: ShoppingBag },
  { id: "orders",     label: "Orders",               icon: ShoppingCart },
  { id: "estimates",  label: "Estimates",            icon: Receipt },
  { id: "challans",   label: "Delivery Challans",    icon: Truck },
  { id: "payments",   label: "Payments Received",    icon: ArrowDownToLine },
  { id: "expenses",   label: "Expenses",             icon: Wallet },
  { id: "todo",       label: "Inventory",            icon: ClipboardList },
  { id: "labour",     label: "Labour Tracking",      icon: HardHat },
  { id: "contractors", label: "Contractor Scorecard", icon: Award },
  { id: "reports",       label: "Reports",              icon: BarChart3 },
  { id: "sharereport",   label: "Share Report",         icon: Send },
  { id: "billing",       label: "Advanced Billing",     icon: Globe2 },
  { id: "settings",   label: "Settings",             icon: SettingsIcon },
];

/* ---- Bottom nav (mobile) + radial quick-add FAB ---- */

export const BOTTOM_NAV_IDS = ["dashboard", "estimates", "customers"];

/* ---- ChallanModal ---- */

export const MAX_ENTRY_ROWS = 10;

export const LABOUR_RATES = { cement: 4, saria: 20, balu: 5 };
