const express = require("express");
const rateLimit = require("express-rate-limit");
const controller = require("../controllers/captureController");

const router = express.Router();

// This endpoint is only meant to fire as a fallback when the regex parser
// can't confidently read what was typed, so real usage should be light —
// this cap just protects against a runaway loop or someone hammering the
// input burning through the free-tier quota.
const captureLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { message: "Too many AI parse requests — please wait a few minutes." },
});

router.post("/parse", captureLimiter, controller.parse);

module.exports = router;
