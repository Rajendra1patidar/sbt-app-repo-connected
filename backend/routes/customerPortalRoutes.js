const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const { login, bookings, ledger, requestAccess, statementPdf } = require("../controllers/customerPortalController");
const { catalog, publicCatalog } = require("../controllers/portalCatalogController");
const { protectCustomerPortal } = require("../middleware/customerPortalAuth");

// A 4-digit PIN is guessable fast without a tight limit — tighter than the owner
// authLimiter (server.js) since this endpoint also has no account-level lockout
// bypass path (see Customer.registerPortalFailedAttempt for the per-account lock).
const portalLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many attempts from this device. Please wait a few minutes and try again." },
});

// Anonymous browsing: generous but bounded so the open endpoint can't be hammered.
const publicLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: { message: "Too many requests. Please slow down." } });

// "Request access" is open to anyone, so it gets its own tight limit (and a hidden bot trap field).
const accessRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: { message: "Too many requests from this device. Please try again later, or message the shop on WhatsApp." },
});

router.get("/public-catalog", publicLimiter, publicCatalog);
router.post("/request-access", accessRequestLimiter, requestAccess);
router.post("/login", portalLoginLimiter, login);
router.get("/bookings", protectCustomerPortal, bookings);
router.get("/ledger", protectCustomerPortal, ledger);
router.get("/statement.pdf", protectCustomerPortal, statementPdf);
router.get("/catalog", protectCustomerPortal, catalog);

module.exports = router;
