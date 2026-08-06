// Gates a route to the business owner only — blocks staff logins. Must run
// after protect() (see middleware/auth.js), since it reads req.role, which
// protect() sets after resolving the JWT.
function requireOwner(req, res, next) {
  if (req.role !== "owner") {
    return res.status(403).json({ message: "Only the business owner can do this" });
  }
  next();
}

module.exports = { requireOwner };
