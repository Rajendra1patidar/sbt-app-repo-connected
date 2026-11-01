// Gates a route to the business owner only - blocks staff logins. Must run
// after protect() (see middleware/auth.js), since it reads req.role, which
// protect() sets after resolving the JWT.
function requireOwner(req, res, next) {
  if (req.role !== "owner") {
    return res.status(403).json({ message: "Only the business owner can do this" });
  }
  next();
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Staff may read and create/edit, but never delete. Mount after protect(). */
function ownerOnlyDeletes(req, res, next) {
  if (req.method === "DELETE") return requireOwner(req, res, next);
  next();
}

/** Staff may read but not change anything (used for Settings). Mount after protect(). */
function ownerOnlyWrites(req, res, next) {
  if (!SAFE_METHODS.has(req.method)) return requireOwner(req, res, next);
  next();
}

// A customer's own statement is how staff chase a payment, so it stays open to
// them. Everything else in the ledger (P&L, balance sheet, trial balance, day
// book, stock valuation, integrity check) is owner-only.
const STAFF_LEDGER_PATHS = [/^\/customers\/[^/]+\/statement\/?$/];

function ledgerPolicy(req, res, next) {
  if (req.role === "owner") return next();
  if (req.method === "GET" && STAFF_LEDGER_PATHS.some((re) => re.test(req.path))) return next();
  return res.status(403).json({ message: "Only the business owner can do this" });
}

// Stock and collection reports stay open to staff (the Home screen needs
// reorder + dead stock; collections need ageing and credit). Sales summary,
// vendor scorecard and the cash-flow forecast are owner-only.
const STAFF_REPORT_PATHS = new Set(["/reorder-suggestions", "/dead-stock", "/ar-aging", "/customer-credit"]);

function reportsPolicy(req, res, next) {
  if (req.role === "owner") return next();
  const path = req.path.replace(/\/$/, "");
  if (req.method === "GET" && STAFF_REPORT_PATHS.has(path)) return next();
  return res.status(403).json({ message: "Only the business owner can do this" });
}

module.exports = { requireOwner, ownerOnlyDeletes, ownerOnlyWrites, ledgerPolicy, reportsPolicy };
