const mongoose = require("mongoose");

/**
 * A ScoreRule sets how many contractor-scorecard points a unit of an item
 * earns. Two kinds, using the same shape:
 *
 *  - Category rule  (brand: "")      — the base rate for a whole category,
 *                                       e.g. "Cement" = 1 point per bag.
 *  - Brand rule      (brand: "Ultratech") — an ADDITIONAL bonus/penalty on
 *                                       top of the category's base rate,
 *                                       for one specific brand.
 *
 * Each rule is either:
 *  - Permanent (startDate & endDate both null) — the standing rate, used
 *    whenever no scheme is active.
 *  - A scheme (startDate & endDate both set) — a temporary override for
 *    that date window only, e.g. a low-season boost for October.
 *
 * A scheme rule always wins over the permanent rule for the same
 * category+brand while its date window covers the estimate's date.
 *
 * Rules are deliberately NOT applied retroactively: an estimate's points
 * are computed from whatever rule was active on the estimate's own date at
 * the time of calculation, so creating a new scheme never changes points
 * that were already shown/shared for estimates outside that scheme's
 * window at that point in time. (In practice this means points are always
 * computed live from the current set of rules matched against each
 * estimate's date — there's nothing to "backfill".)
 */
const scoreRuleSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // e.g. "Cement", "Saria" — matched against Item.category
    category: { type: String, required: true, trim: true },

    // Empty string = this rule sets the category's own base rate.
    // Non-empty = this rule is a bonus/penalty for that one brand only,
    // matched against Item.brand (case-insensitive).
    brand: { type: String, trim: true, default: "" },

    // Friendly name, mainly useful for scheme (dated) rules so they're
    // recognizable in the list later, e.g. "October slow-season boost".
    label: { type: String, trim: true, default: "" },

    // The exact points-per-unit value this rule sets (an override, not a
    // multiplier) — e.g. 1.5 means "1.5 points per bag/kg", full stop.
    pointsPerUnit: { type: Number, required: true },

    // Both null = permanent baseline. Both set = a scheme window.
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { timestamps: true }
);

scoreRuleSchema.pre("validate", function (next) {
  if (this.category) this.category = this.category.trim();
  if (this.brand) this.brand = this.brand.trim();
  // A rule must be either fully permanent (no dates) or a fully-dated
  // scheme — never half-specified.
  const hasStart = !!this.startDate;
  const hasEnd = !!this.endDate;
  if (hasStart !== hasEnd) {
    return next(new Error("A scheme needs both a start date and an end date."));
  }
  if (hasStart && hasEnd && new Date(this.startDate) > new Date(this.endDate)) {
    return next(new Error("A scheme's start date must be before its end date."));
  }
  next();
});

scoreRuleSchema.index({ owner: 1, category: 1, brand: 1 });

module.exports = mongoose.model("ScoreRule", scoreRuleSchema);
