require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const { protect } = require("./middleware/auth");
const { notFound, errorHandler } = require("./middleware/error");
const authRoutes = require("./routes/authRoutes");
const customerRoutes = require("./routes/customerRoutes");
const itemRoutes = require("./routes/itemRoutes");
const orderRoutes = require("./routes/orderRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const reportRoutes = require("./routes/reportRoutes");
const makeDocumentRouter = require("./routes/documentRoutes");
const labourSessionRoutes = require("./routes/labourSessionRoutes");
const contractorRoutes = require("./routes/contractorRoutes");
const app = express();
connectDB();
// ---- core middleware ----
app.use(helmet());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: "2mb" }));
const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: function (origin, callback) {
      // allow tools like curl/Postman (no origin) and any explicitly whitelisted origin
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
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
// ---- public routes ----
app.use("/api/auth", authRoutes);
// ---- protected routes (require Bearer JWT) ----
app.use("/api/customers", protect, customerRoutes);
app.use("/api/items", protect, itemRoutes);
app.use("/api/orders", protect, orderRoutes);
app.use("/api/expenses", protect, expenseRoutes);
app.use("/api/payments", protect, paymentRoutes);
app.use("/api/settings", protect, settingsRoutes);
app.use("/api/reports", protect, reportRoutes);
app.use("/api/estimates", protect, makeDocumentRouter("estimate"));
app.use("/api/challans", protect, makeDocumentRouter("challan"));
app.use("/api/labour-sessions", protect, labourSessionRoutes);
app.use("/api/contractors", protect, contractorRoutes);
app.get("/", (req, res) => res.send("SBT backend API is running."));
app.use(notFound);
app.use(errorHandler);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));