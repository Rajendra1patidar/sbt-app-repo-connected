const eventBus = require("../services/eventBus");
const notificationService = require("../services/notificationService");

// Wires business events to their in-app notifications. registerListeners()
// runs once at server startup (see server.js). Keeping every listener in one
// file makes it obvious, at a glance, everything the system currently reacts
// to on its own — as this grows (WhatsApp reminders, the reorder engine,
// reconciliation alerts) each new automation adds its listener here too.
function registerListeners() {
  eventBus.on("estimate.created", async ({ owner, documentId, number, total }) => {
    await notificationService.notify(owner, {
      type: "estimate.created",
      title: `Estimate ${number} created`,
      body: `Total \u20b9${total}`,
      refId: documentId,
    });
  });

  eventBus.on("stock.low", async ({ owner, itemId, name, stock }) => {
    await notificationService.notify(owner, {
      type: "stock.low",
      title: `${name} is low on stock`,
      body: `Only ${stock} left`,
      refId: itemId,
    });
  });

  eventBus.on("payment.received", async ({ owner, paymentId, amount, invoiceNumber }) => {
    await notificationService.notify(owner, {
      type: "payment.received",
      title: `Payment received: \u20b9${amount}`,
      body: invoiceNumber ? `Against ${invoiceNumber}` : "",
      refId: paymentId,
    });
  });

  eventBus.on("payment.refunded", async ({ owner, paymentId, amount, invoiceNumber }) => {
    await notificationService.notify(owner, {
      type: "payment.refunded",
      title: `Refund issued: \u20b9${amount}`,
      body: invoiceNumber ? `Against ${invoiceNumber}` : "",
      refId: paymentId,
    });
  });

  eventBus.on("purchase.received", async ({ owner, purchaseId, itemName, qty }) => {
    await notificationService.notify(owner, {
      type: "purchase.received",
      title: `Stock received: ${itemName}`,
      body: `${qty} units added`,
      refId: purchaseId,
    });
  });

  eventBus.on("reconciliation.failed", async ({ owner, failedCount, detail }) => {
    await notificationService.notify(owner, {
      type: "reconciliation.failed",
      title: `Ledger drift detected (${failedCount} check${failedCount === 1 ? "" : "s"})`,
      body: String(detail || "").slice(0, 500),
    });
  });

  eventBus.on("stock.reorder-suggested", async ({ owner, itemId, name, stock, suggestedQty, daysLeft, vendor }) => {
    const daysPart = daysLeft != null ? ` — about ${daysLeft} day${daysLeft === 1 ? "" : "s"} of stock left` : "";
    const qtyPart = suggestedQty ? `Suggested order: ${suggestedQty} units` : "Review current stock level";
    const vendorPart = vendor?.name ? ` from ${vendor.name}` : "";
    await notificationService.notify(owner, {
      type: "stock.reorder-suggested",
      title: `${name} needs reordering${daysPart}`,
      body: `${qtyPart}${vendorPart}. Currently ${stock} in stock.`,
      refId: itemId,
    });
  });

  eventBus.on("approval.requested", async ({ owner, approvalId, type, amount }) => {
    await notificationService.notify(owner, {
      type: "approval.requested",
      title: `Approval needed: ${type} of ₹${amount}`,
      body: "A staff member submitted this above your approval limit — review it in Approvals.",
      refId: approvalId,
    });
  });

  eventBus.on("customer.credit-risk", async ({ owner, customerId, name, overdue, oldestDaysPastDue }) => {
    await notificationService.notify(owner, {
      type: "customer.credit-risk",
      title: `${name} flagged as credit risk`,
      body: `₹${overdue} overdue, oldest bill ${oldestDaysPastDue} days past due.`,
      refId: customerId,
    });
  });
}

module.exports = { registerListeners };
