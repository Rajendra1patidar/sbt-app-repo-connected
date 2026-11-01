const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Settings = require("../models/Settings");
const { sendMail } = require("../utils/mailer");
const { findOwnerUsers } = require("../utils/ownerAccounts");
const { invalidateAuthCache } = require("../middleware/auth");
const { sendAlert } = require("../utils/alertWebhook");
const { pinProblem, isText, formatWait } = require("../utils/pin");

// Fields that must never be sent back to the browser.
const PRIVATE_USER_FIELDS = "-pinHash -resetTokenHash -resetTokenExpires -failedAttempts -lockUntil -lockoutCount -lastLockoutAt -tokenVersion";

// tokenVersion rides inside the token (claim "tv"). When a PIN is changed or
// reset the account's version goes up and every older token stops working -
// see middleware/auth.js. Tokens issued before this existed have no "tv" and
// count as version 0, so nobody is signed out when this ships.
function signToken(id, tokenVersion = 0) {
  return jwt.sign({ id, tv: tokenVersion }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

// Where the reset link in the email should point: the app (frontend), not the
// API. FRONTEND_URL wins; otherwise the first allowed CORS origin, which is the
// frontend in a normal setup; APP_URL is the last resort. The email always also
// contains the raw code, so a wrong link is never a dead end.
function frontendBaseUrl() {
  const explicit = (process.env.FRONTEND_URL || "").trim();
  const firstOrigin = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean)[0] || "";
  return (explicit || firstOrigin || process.env.APP_URL || "").replace(/\/$/, "");
}

function lockedMessage(user) {
  return `Too many failed attempts. Try again in ${formatWait(user.lockUntil.getTime() - Date.now())}.`;
}

// A second (or later) lockout in a day looks like someone guessing the PIN.
// Tell the owner on the alert channel, and the account's own inbox for owner
// logins. Fire-and-forget: this must never change the login response.
async function notifyRepeatedLockout(user, lockoutCount) {
  try {
    const who = user.role === "staff" ? `staff login ${user.email}` : `owner login ${user.email}`;
    await sendAlert(`🔐 SBT: the ${who} was locked out again after wrong PINs (lockout number ${lockoutCount} today). If that was not you or your team, someone may be guessing the PIN.`);
    if (user.role !== "staff") {
      await sendMail({
        to: user.email,
        subject: "Someone keeps entering the wrong PIN on your account",
        text: "Your Shree Balaji Traders login was locked after repeated wrong PINs. If that was not you, change your PIN once you are back in.",
      });
    }
  } catch (err) {
    console.error("notifyRepeatedLockout failed:", err && err.message);
  }
}

async function handleWrongPin(user) {
  const result = await user.registerFailedAttempt();
  if (result && result.lockedNow && result.lockoutCount >= 2) notifyRepeatedLockout(user, result.lockoutCount);
}

// POST /api/auth/register  { email, pin, name }
// Creates the owner account. Intended to be called once during setup.
exports.register = async (req, res, next) => {
  try {
    const existingOwners = await findOwnerUsers();
    if (existingOwners.length > 0) {
      return res.status(403).json({
        message: "Registration is closed. Contact the business owner for access.",
      });
    }

    const { email, pin, name } = req.body || {};
    if (!isText(email) || !email.trim() || pin === undefined || pin === null || pin === "") {
      return res.status(400).json({ message: "Email and PIN are required" });
    }
    const problem = pinProblem(pin);
    if (problem) return res.status(400).json({ message: problem });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    const pinHash = await User.hashPin(String(pin));
    const user = await User.create({ email: email.toLowerCase(), pinHash, name: isText(name) && name ? name : "Owner" });
    await Settings.create({ owner: user._id });

    res.status(201).json({ token: signToken(user._id, 0), user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login  { email, pin }
// Existing PINs are NOT re-checked against the 4-6 digit rule here - that rule
// only applies when a PIN is created or changed.
exports.login = async (req, res, next) => {
  try {
    const { email, pin } = req.body || {};
    const pinOk = (typeof pin === "string" || typeof pin === "number") && String(pin) !== "";
    if (!isText(email) || !email.trim() || !pinOk) {
      return res.status(400).json({ message: "Email and PIN are required" });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid email or PIN" });

    if (user.isLocked()) {
      return res.status(429).json({ message: lockedMessage(user) });
    }

    const match = await user.comparePin(String(pin));
    if (!match) {
      await handleWrongPin(user);
      return res.status(401).json({ message: "Invalid email or PIN" });
    }

    await user.registerSuccessfulLogin();
    res.json({ token: signToken(user._id, user.tokenVersion || 0), user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-pin  { currentPin, newPin }  (protected)
// Uses req.actorId, not req.userId. For a staff login, req.userId resolves to
// the *owner's* account, so comparing/overwriting pinHash against req.userId
// would check the owner's PIN and could silently change the owner's login
// credential instead of the staff member's own.
//
// Changing the PIN signs out every other device (tokenVersion goes up) and
// hands this device a fresh token so the person changing it stays signed in.
exports.changePin = async (req, res, next) => {
  try {
    const { currentPin, newPin } = req.body || {};
    const problem = pinProblem(newPin, "New PIN");
    if (problem) return res.status(400).json({ message: problem });

    const user = await User.findById(req.actorId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isLocked()) {
      return res.status(429).json({ message: lockedMessage(user) });
    }

    const match = await user.comparePin(String(currentPin));
    if (!match) {
      await handleWrongPin(user);
      return res.status(401).json({ message: "Current PIN is incorrect" });
    }

    await user.registerSuccessfulLogin();
    user.pinHash = await User.hashPin(String(newPin));
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    invalidateAuthCache(user._id);

    let token;
    try {
      token = signToken(user._id, user.tokenVersion);
    } catch (e) {
      token = undefined; // PIN is already changed; worst case this device signs in again
    }
    res.json({ message: "PIN updated", ...(token ? { token } : {}) });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/forgot-pin  { email }
// Always responds the same way whether or not the email exists, so this
// endpoint can't be used to probe which emails have an account.
exports.forgotPin = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const genericResponse = { message: "If that email has an account, we've sent a reset link." };
    if (!isText(email) || !email.trim()) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json(genericResponse); // don't leak whether the account exists

    const rawToken = await user.issueResetToken();
    const base = frontendBaseUrl();
    const resetLink = base ? `${base}/reset-pin?token=${rawToken}&email=${encodeURIComponent(user.email)}` : null;

    await sendMail({
      to: user.email,
      subject: "Reset your Shree Balaji Traders PIN",
      text: [
        `We received a request to reset your PIN.`,
        resetLink ? `Open this link to reset it: ${resetLink}` : null,
        `${resetLink ? "If the link does not open, enter" : "Enter"} this reset code in the app: ${rawToken}`,
        `This code expires in 30 minutes. If you didn't request this, you can ignore this email.`,
      ].filter(Boolean).join("\n\n"),
    });

    res.json(genericResponse);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/reset-pin  { email, token, newPin }
exports.resetPin = async (req, res, next) => {
  try {
    const { email, token, newPin } = req.body || {};
    if (!isText(email) || !email.trim() || !isText(token) || !token.trim() || newPin === undefined || newPin === null || newPin === "") {
      return res.status(400).json({ message: "Email, reset code, and new PIN are all required" });
    }
    const problem = pinProblem(newPin, "New PIN");
    if (problem) return res.status(400).json({ message: problem });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.hasValidResetToken(token)) {
      return res.status(400).json({ message: "That reset code is invalid or has expired" });
    }

    user.pinHash = await User.hashPin(String(newPin));
    user.failedAttempts = 0;
    user.lockUntil = null;
    user.lockoutCount = 0;
    user.tokenVersion = (user.tokenVersion || 0) + 1; // signs out every device, including a thief's
    await user.clearResetToken(); // also saves the changes above
    invalidateAuthCache(user._id);

    res.json({ message: "PIN reset. You can now sign in with your new PIN." });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me  (protected)
// Uses req.actorId - the account that actually logged in - not req.userId,
// which for a staff login is deliberately resolved to the *owner's* id
// everywhere else (see middleware/auth.js) so data queries stay scoped
// correctly. "Who am I" needs the real logged-in identity, not that scope.
exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.actorId).select(PRIVATE_USER_FIELDS);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/staff  { email, pin, name }  (owner only)
// Creates a second login that shares the owner's business data - see
// middleware/auth.js for how a staff login's requests get scoped to the
// owner's data instead of a separate empty account.
exports.createStaff = async (req, res, next) => {
  try {
    const { email, pin, name } = req.body || {};
    if (!isText(email) || !email.trim() || pin === undefined || pin === null || pin === "") {
      return res.status(400).json({ message: "Email and PIN are required" });
    }
    const problem = pinProblem(pin);
    if (problem) return res.status(400).json({ message: problem });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    const pinHash = await User.hashPin(String(pin));
    // req.userId is already resolved to the owner's own id here (an owner
    // logging in has req.userId === their own account), so this correctly
    // scopes the new staff account to this business either way.
    const staff = await User.create({
      email: email.toLowerCase(),
      pinHash,
      name: isText(name) && name ? name : "Staff",
      role: "staff",
      ownerId: req.userId,
    });
    res.status(201).json({ id: staff._id, email: staff.email, name: staff.name, role: staff.role });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/staff  (owner only)
exports.listStaff = async (req, res, next) => {
  try {
    const staff = await User.find({ ownerId: req.userId, role: "staff" }).select(PRIVATE_USER_FIELDS);
    res.json(staff);
  } catch (err) {
    next(err);
  }
};

// DELETE /api/auth/staff/:id  (owner only)
exports.removeStaff = async (req, res, next) => {
  try {
    const staff = await User.findOneAndDelete({ _id: req.params.id, ownerId: req.userId, role: "staff" });
    if (!staff) return res.status(404).json({ message: "Not found" });
    invalidateAuthCache(staff._id);
    res.json({ message: "Staff account removed", id: req.params.id });
  } catch (err) {
    next(err);
  }
};
