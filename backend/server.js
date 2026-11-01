require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const { protect } = require("./middleware/auth");
const { requireOwner, ownerOnlyDeletes, ownerOnlyWrites, ledgerPolicy, reportsPolicy } = require("./middleware/roles");
const { sendErrorAlert } = require("./utils/alertWebhook");
const { notFound, errorHandler } = require("./middleware/error");
const authRoutes = require("./routes/authRoutes");
const customerRoutes = require("./routes/customerRoutes");
const itemRoutes = require("./routes/itemRoutes");
const orderRoutes = require("./routes/orderRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const portalAdminRoutes = require("./routes/portalAdminRoutes");
const reportRoutes = require("./routes/reportsRoutes");
const makeDocumentRouter = require("./routes/documentRoutes");
const labourSessionRoutes = require("./routes/labourSessionRoutes");
const contractorRoutes = require("./routes/contractorRoutes");
const scoreRuleRoutes = require("./routes/scoreRuleRoutes");
const vendorRoutes = require("./routes/vendorRoutes");
const godownRoutes = require("./routes/godownRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const stockAdjustmentRoutes = require("./routes/stockAdjustmentRoutes");
const ledgerRoutes = require("./routes/ledgerRoutes");
const financialYearRoutes = require("./routes/financialYearRoutes");
const exportRoutes = require("./routes/exportRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const approvalRoutes = require("./routes/approvalRoutes");
const bankStatementRoutes = require("./routes/bankStatementRoutes");
const captureRoutes = require("./routes/captureRoutes");
const auditLogRoutes = require("./routes/auditLogRoutes");
const customerPortalRoutes = require("./routes/customerPortalRoutes");
const { registerListeners } = require("./listeners");
const cronRoutes = require("./routes/cronRoutes");
const scheduler = require("./jobs/scheduler");
const app = express();
// Render (and most PaaS hosts) sit the app behind one reverse proxy that sets
// X-Forwarded-For. Trusting exactly 1 hop lets express-rate-limit/req.ip read
// the real client IP safely — trusting `true` (the whole chain) would let a
// client spoof its own IP via that header instead.
app.set("trust proxy", 1);
connectDB();
// ---- core middleware ----
app.use(helmet());
// gzip JSON responses — the startup lists are large and mobile data is slow.
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
// With no CORS_ORIGIN set every website may call this API from a browser. Tokens
// travel in a header (not a cookie) so that is low risk, but it should be a
// choice, not an accident - say so loudly in the logs of a live server.
if (allowedOrigins.length === 0 && process.env.NODE_ENV === "production") {
  console.warn("WARNING: CORS_ORIGIN is not set, so any website can call this API from a browser. Set it to your app's address (comma-separate more than one, e.g. the customer portal).");
}
app.use(
  cors({
    origin: function (origin, callback) {
      // allow tools like curl/Postman (no origin) and any explicitly whitelisted origin
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const blocked = new Error("Not allowed by CORS");
      blocked.status = 403; // a plain 403, not a 500 that pages the alert channel
      return callback(blocked);
    },
    credentials: true,
    exposedHeaders: ["X-Total-Count"],
  })
);
// 600/15min — comfortably covers a full app reload (~14 requests from fetchAll)
// plus repeated Ledger-view refreshes (5 requests each) in one sitting, including
// two devices sharing an IP/NAT, without opening the door much wider than before.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600 });
app.use("/api", limiter);
// Auth endpoints get a much tighter per-IP limit than the rest of the API —
// a 4-6 digit PIN is guessable quickly at 300 requests/15min, so this closes
// most of that gap. The account lockout in authController is the other half
// (it protects against attempts spread across many IPs at one account).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { message: "Too many attempts from this device. Please wait a few minutes and try again." },
});
app.use("/api/auth", authLimiter);
// ---- health check (used by Railway / uptime monitors) ----
app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));
// ---- cron trigger (own secret-based auth, not JWT) ----
app.use("/api/cron", cronRoutes);
// ---- public routes ----
app.use("/api/auth", authRoutes);
// Customer Booking Portal — entirely separate auth (phone + PIN) from the owner/staff
// login above; /login is public here, /bookings is gated inside the router itself by
// protectCustomerPortal rather than the owner `protect` middleware every route below uses.
app.use("/api/customer-portal", customerPortalRoutes);
// ---- protected routes (require Bearer JWT) ----
//
// Staff rules (see middleware/roles.js). A staff login can create and edit the
// day-to-day records, but:
//   - can't delete anything                                (ownerOnlyDeletes)
//   - can read Settings but never change them              (ownerOnlyWrites)
//   - can't touch the Customer Portal admin                (requireOwner)
//   - can't export data, see the ledger/P&L, close years,
//     or use bank reconciliation                           (requireOwner / policies)
// The estimate-specific limits (no re-pricing a bill that has payments, no item
// price changes) live in documentController and itemController.
app.use("/api/customers", protect, ownerOnlyDeletes, customerRoutes);
app.use("/api/items", protect, ownerOnlyDeletes, itemRoutes);
app.use("/api/orders", protect, ownerOnlyDeletes, orderRoutes);
app.use("/api/expenses", protect, ownerOnlyDeletes, expenseRoutes);
app.use("/api/payments", protect, ownerOnlyDeletes, paymentRoutes);
app.use("/api/settings", protect, ownerOnlyWrites, settingsRoutes);
app.use("/api/portal-admin", protect, requireOwner, portalAdminRoutes);
app.use("/api/reports", protect, reportsPolicy, reportRoutes);
app.use("/api/estimates", protect, ownerOnlyDeletes, makeDocumentRouter("estimate"));
app.use("/api/challans", protect, ownerOnlyDeletes, makeDocumentRouter("challan"));
app.use("/api/labour-sessions", protect, ownerOnlyDeletes, labourSessionRoutes);
app.use("/api/contractors", protect, ownerOnlyDeletes, contractorRoutes);
app.use("/api/score-rules", protect, ownerOnlyDeletes, scoreRuleRoutes);
app.use("/api/vendors", protect, ownerOnlyDeletes, vendorRoutes);
app.use("/api/godowns", protect, ownerOnlyDeletes, godownRoutes);
app.post("/api/inventory/transfer", protect, require("./controllers/godownController").transferStock);
app.use("/api/purchases", protect, ownerOnlyDeletes, purchaseRoutes);
app.use("/api/stock-adjustments", protect, stockAdjustmentRoutes);
app.use("/api/ledger", protect, ledgerPolicy, ledgerRoutes);
app.use("/api/financial-years", protect, requireOwner, financialYearRoutes);
app.use("/api/export", protect, requireOwner, exportRoutes);
app.use("/api/notifications", protect, notificationRoutes);
app.use("/api/approvals", protect, approvalRoutes);
app.use("/api/bank-statement", protect, requireOwner, bankStatementRoutes);
app.use("/api/capture", protect, captureRoutes);
app.use("/api/audit-logs", protect, auditLogRoutes);
app.get("/", (req, res) => res.send("SBT backend API is running."));
app.use(notFound);
app.use(errorHandler);
const PORT = process.env.PORT || 5000;
registerListeners();
scheduler.start();
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

// A promise that fails with nobody listening used to vanish silently (or, on
// newer Node versions, kill the process with no trace). Log it and ping the
// alert channel, but keep serving.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  sendErrorAlert({
    message: String((reason && reason.message) || reason),
    method: "-",
    path: "unhandledRejection",
    status: 500,
  });
});
// After an uncaught exception the process state can't be trusted: report it,
// then exit so the host restarts a clean instance.
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  Promise.resolve(
    sendErrorAlert({ message: String((err && err.message) || err), method: "-", path: "uncaughtException", status: 500 })
  ).finally(() => setTimeout(() => process.exit(1), 1500));
});
