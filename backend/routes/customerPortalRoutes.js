const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const { login, bookings } = require("../controllers/customerPortalController");
const { protectCustomerPortal } = require("../middleware/customerPortalAuth");

// A 4-digit PIN is guessable fast without a tight limit — tighter than the owner
// authLimiter (server.js) since this endpoint also has no account-level lockout
// bypass path (see Customer.registerPortalFailedAttempt for the per-account lock).
const portalLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many attempts from this device. Please wait a few minutes and try again." },
});

router.post("/login", portalLoginLimiter, login);
router.get("/bookings", protectCustomerPortal, bookings);

module.exports = router;
