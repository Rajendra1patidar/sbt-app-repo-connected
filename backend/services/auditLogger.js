const AuditLog = require("../models/AuditLog");

/**
 * Records one audit entry. Fire-and-forget, same philosophy as eventBus:
 * a logging failure must never break the request that triggered it, so
 * this always resolves and just console.errors on failure.
 *
 * Call this AFTER the real write has committed (same rule as eventBus:
 * never from inside a withTransaction callback), so the log only records
 * things that actually happened.
 */
async function logAudit({ owner, actorId, action, model, docId, label, changedFields }) {
  try {
    await AuditLog.create({
      owner,
      actorId,
      action,
      model,
      docId,
      label: label || "",
      changedFields: changedFields && changedFields.length ? changedFields : undefined,
    });
  } catch (err) {
    console.error(`auditLogger: failed to record ${action} on ${model}:`, err.message);
  }
}

/**
 * Compares an update payload against the document's previous values and
 * returns the list of field names that actually changed. `before` is a
 * plain object (e.g. doc.toObject() taken before the update was applied);
 * `updates` is the raw req.body passed to the update.
 */
function diffFields(before, updates) {
  const changed = [];
  for (const key of Object.keys(updates || {})) {
    if (key === "_id" || key === "owner" || key === "updatedAt") continue;
    const prev = before ? before[key] : undefined;
    const next = updates[key];
    // Cheap deep-enough comparison: works for primitives, dates-as-strings,
    // and arrays/objects of primitives, which covers every field these
    // forms actually submit.
    if (JSON.stringify(prev) !== JSON.stringify(next)) changed.push(key);
  }
  return changed;
}

module.exports = { logAudit, diffFields };
