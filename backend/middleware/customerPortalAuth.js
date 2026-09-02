const jwt = require("jsonwebtoken");

// Customer Booking Portal tokens are deliberately a different shape than owner/staff
// tokens (middleware/auth.js) — they carry `scope: "customer-portal"` plus both the
// customerId and the ownerId whose data they're scoped to, and this middleware never
// looks anything up in the User collection. That keeps a portal token from ever being
// usable against the owner-side API (protect() there checks req.role/User, which a
// customer token has no matching account for) and vice versa.
function protectCustomerPortal(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Not logged in" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.scope !== "customer-portal" || !decoded.customerId || !decoded.ownerId) {
      return res.status(401).json({ message: "Invalid session, please log in again" });
    }
    req.customerId = decoded.customerId;
    req.ownerId = decoded.ownerId;
    next();
  } catch {
    return res.status(401).json({ message: "Session expired, please log in again" });
  }
}

module.exports = { protectCustomerPortal };
