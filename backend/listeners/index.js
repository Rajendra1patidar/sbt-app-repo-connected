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
}

module.exports = { registerListeners };
