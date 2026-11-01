const mongoose = require("mongoose");

// Remembers "this save request was already handled" so a retry - a double tap,
// a response lost on a bad network, an offline queue replaying hours later, or
// a server restart in between - gets the first answer back instead of creating
// a second estimate (second stock deduction, second ledger post).
//
// Rows expire on their own after 7 days (TTL index on createdAt).
const idempotencyKeySchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, required: true },
  key: { type: String, required: true },
  state: { type: String, enum: ["pending", "done"], default: "pending" },
  response: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 60 * 60 },
});

idempotencyKeySchema.index({ owner: 1, key: 1 }, { unique: true });

module.exports = mongoose.model("IdempotencyKey", idempotencyKeySchema);
