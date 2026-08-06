const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Settings = require("../models/Settings");
const { sendMail } = require("../utils/mailer");

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

// POST /api/auth/register  { email, pin, name }
// Creates the owner account. Intended to be called once during setup.
exports.register = async (req, res, next) => {
  try {
    const { email, pin, name } = req.body;
    if (!email || !pin) {
      return res.status(400).json({ message: "Email and PIN are required" });
    }
    if (String(pin).length < 4) {
      return res.status(400).json({ message: "PIN must be at least 4 digits" });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }
    const pinHash = await User.hashPin(String(pin));
    const user = await User.create({ email: email.toLowerCase(), pinHash, name: name || "Owner" });
    await Settings.create({ owner: user._id });

    res.status(201).json({ token: signToken(user._id), user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login  { email, pin }
exports.login = async (req, res, next) => {
  try {
    const { email, pin } = req.body;
    if (!email || !pin) {
      return res.status(400).json({ message: "Email and PIN are required" });
    }
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid email or PIN" });

    if (user.isLocked()) {
      const minutesLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.` });
    }

    const match = await user.comparePin(String(pin));
    if (!match) {
      await user.registerFailedAttempt();
      return res.status(401).json({ message: "Invalid email or PIN" });
    }

    await user.registerSuccessfulLogin();
    res.json({ token: signToken(user._id), user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-pin  { currentPin, newPin }  (protected)
exports.changePin = async (req, res, next) => {
  try {
    const { currentPin, newPin } = req.body;
    if (!newPin || String(newPin).length < 4) {
      return res.status(400).json({ message: "New PIN must be at least 4 digits" });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.isLocked()) {
      const minutesLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(429).json({ message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.` });
    }

    const match = await user.comparePin(String(currentPin));
    if (!match) {
      await user.registerFailedAttempt();
      return res.status(401).json({ message: "Current PIN is incorrect" });
    }

    await user.registerSuccessfulLogin();
    user.pinHash = await User.hashPin(String(newPin));
    await user.save();
    res.json({ message: "PIN updated" });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/forgot-pin  { email }
// Always responds the same way whether or not the email exists, so this
// endpoint can't be used to probe which emails have an account.
exports.forgotPin = async (req, res, next) => {
  try {
    const { email } = req.body;
    const genericResponse = { message: "If that email has an account, we've sent a reset link." };
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) return res.json(genericResponse); // don't leak whether the account exists

    const rawToken = await user.issueResetToken();
    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    const resetLink = appUrl ? `${appUrl}/reset-pin?token=${rawToken}&email=${encodeURIComponent(user.email)}` : null;

    await sendMail({
      to: user.email,
      subject: "Reset your Shree Balaji Traders PIN",
      text: [
        `We received a request to reset your PIN.`,
        resetLink ? `Reset it here: ${resetLink}` : `Your reset code: ${rawToken}`,
        `This code expires in 30 minutes. If you didn't request this, you can ignore this email.`,
      ].join("\n\n"),
    });

    res.json(genericResponse);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/reset-pin  { email, token, newPin }
exports.resetPin = async (req, res, next) => {
  try {
    const { email, token, newPin } = req.body;
    if (!email || !token || !newPin) {
      return res.status(400).json({ message: "Email, reset code, and new PIN are all required" });
    }
    if (String(newPin).length < 4) {
      return res.status(400).json({ message: "New PIN must be at least 4 digits" });
    }

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user || !user.hasValidResetToken(token)) {
      return res.status(400).json({ message: "That reset code is invalid or has expired" });
    }

    user.pinHash = await User.hashPin(String(newPin));
    user.failedAttempts = 0;
    user.lockUntil = null;
    await user.clearResetToken(); // also saves the PIN change above

    res.json({ message: "PIN reset. You can now sign in with your new PIN." });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me  (protected)
exports.me = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("-pinHash");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/staff  { email, pin, name }  (owner only)
// Creates a second login that shares the owner's business data — see
// middleware/auth.js for how a staff login's requests get scoped to the
// owner's data instead of a separate empty account.
exports.createStaff = async (req, res, next) => {
  try {
    const { email, pin, name } = req.body;
    if (!email || !pin) {
      return res.status(400).json({ message: "Email and PIN are required" });
    }
    if (String(pin).length < 4) {
      return res.status(400).json({ message: "PIN must be at least 4 digits" });
    }
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
      name: name || "Staff",
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
    const staff = await User.find({ ownerId: req.userId, role: "staff" }).select("-pinHash");
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
    res.json({ message: "Staff account removed", id: req.params.id });
  } catch (err) {
    next(err);
  }
};
