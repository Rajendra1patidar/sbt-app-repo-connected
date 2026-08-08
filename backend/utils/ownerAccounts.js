const User = require("../models/User");

/**
 * Returns every business-owner account — never staff. Used by the nightly
 * jobs (reconciliation/reorder/credit checks), which loop over "every
 * business" and scope their queries by each user's own id; a staff
 * account's own id isn't a real data scope (see middleware/auth.js — a
 * staff login's data is scoped to their *owner's* id, not their own), so
 * including staff here would just waste a query per staff account for
 * nothing.
 *
 * role is read explicitly rather than excluded from the projection, and
 * checked with `|| "owner"` rather than `{ role: "owner" }` in the query
 * itself — a legacy account predating the role field has it genuinely
 * absent from storage (Mongoose's schema default only applies to documents
 * hydrated with the field present-but-undefined, not to a field left out of
 * a projection), so filtering in the query would silently drop pre-existing
 * owner accounts from every nightly check instead of treating them as owners.
 */
async function findOwnerUsers() {
  const users = await User.find({}, { _id: 1, role: 1 });
  return users.filter((u) => (u.role || "owner") === "owner");
}

module.exports = { findOwnerUsers };
