const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const {
  register, login, changePin, me, forgotPin, resetPin,
  createStaff, listStaff, removeStaff,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { requireOwner } = require("../middleware/roles");

// Tighter than the general /api/auth limiter (server.js) — forgot-pin sends
// an email and reset-pin is a second guessable-token check, so both deserve
// their own low ceiling on top of the shared one, independent of how much of
// the shared budget login/register attempts have already used up.
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many reset attempts. Please wait a few minutes and try again." },
});

router.post("/register", register);
router.post("/login", login);
router.post("/change-pin", protect, changePin);
router.post("/forgot-pin", resetLimiter, forgotPin);
router.post("/reset-pin", resetLimiter, resetPin);
router.get("/me", protect, me);

// Staff accounts — owner only.
router.post("/staff", protect, requireOwner, createStaff);
router.get("/staff", protect, requireOwner, listStaff);
router.delete("/staff/:id", protect, requireOwner, removeStaff);

module.exports = router;
