const express = require("express");
const router = express.Router();

// GET /api/debug/test-alert  (protected)
//
// Deliberately throws so it lands in the global errorHandler as a 500,
// which should trigger the Discord/Slack/Telegram alert configured in
// utils/alertWebhook.js. Hit this once to confirm your webhook env vars
// are wired up correctly, then DELETE THIS ROUTE (this file, and the
// app.use(...) line for it in server.js) — it has no purpose once you've
// confirmed the alert arrives, and there's no reason to leave a
// self-destructing test endpoint sitting in production.
router.get("/test-alert", (req, res, next) => {
  next(new Error("Test alert — triggered manually from /api/debug/test-alert. Safe to ignore."));
});

module.exports = router;
