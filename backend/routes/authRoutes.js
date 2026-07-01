const express = require("express");
const router = express.Router();
const { register, login, changePin, me } = require("../controllers/authController");
const { protect } = require("../middleware/auth");

router.post("/register", register);
router.post("/login", login);
router.post("/change-pin", protect, changePin);
router.get("/me", protect, me);

module.exports = router;
