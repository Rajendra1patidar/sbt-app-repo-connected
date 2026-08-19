/**
 * Maps the app's nav-item ids (used by Sidebar/BottomNav/constants.NAV) to
 * real URL paths, and back again. This lets Sidebar/BottomNav/Topbar keep
 * their existing `active`/`onNav` prop contract completely unchanged — they
 * don't know or care that navigation is now backed by react-router.
 */
export const VIEW_PATHS: Record<string, string> = {
  dashboard: "/",
  customers: "/customers",
  items: "/items",
  orders: "/orders",
  vendors: "/vendors",
  purchases: "/purchases",
  approvals: "/approvals",
  ledger: "/ledger",
  bankReconciliation: "/bank-reconciliation",
  financialYears: "/financial-years",
  challans: "/challans",
  estimates: "/estimates",
  payments: "/payments",
  expenses: "/expenses",
  todo: "/inventory",
  stockAdjustments: "/stock-adjustments",
  labour: "/labour",
  contractors: "/contractors",
  vendorScorecard: "/vendor-scorecard",
  customerCredit: "/customer-credit",
  cashFlowForecast: "/cash-flow-forecast",
  reports: "/reports",
  sharereport: "/share-report",
  billing: "/billing",
  settings: "/settings",
};

const PATH_TO_VIEW: Record<string, string> = Object.fromEntries(
  Object.entries(VIEW_PATHS).map(([view, path]) => [path, view])
);

export function pathForView(view: string): string {
  return VIEW_PATHS[view] || "/";
}

/** Reverse lookup used to compute the `active` nav id from the current URL. */
export function viewForPath(pathname: string): string {
  if (PATH_TO_VIEW[pathname]) return PATH_TO_VIEW[pathname];
  if (pathname.startsWith("/customers/")) return "customerDetail";
  return "dashboard";
}
