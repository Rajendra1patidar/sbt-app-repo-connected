const EventEmitter = require("events");

// Internal event bus for business events (estimate.created, stock.low,
// payment.received, purchase.received, ...). Controllers emit an event right
// AFTER their transaction has committed — never from inside withTransaction —
// so a listener throwing can never roll back or delay the response that
// triggered it. That's why emit() schedules every listener on the next tick
// instead of running it inline, and swallows listener errors itself.
//
// This is the plumbing every later automation (notifications, WhatsApp
// reminders, the reorder engine, reconciliation alerts, approval routing)
// should plug into, instead of each feature calling its own side effects
// directly from a controller.
class EventBus extends EventEmitter {
  emit(eventName, payload) {
    const listeners = this.listeners(eventName);
    if (listeners.length === 0) return false;
    for (const listener of listeners) {
      setImmediate(async () => {
        try {
          await listener(payload);
        } catch (err) {
          console.error(`eventBus: listener for "${eventName}" failed:`, err.message);
        }
      });
    }
    return true;
  }
}

const bus = new EventBus();
// Automation will keep adding listeners to the same event names over time
// (e.g. multiple things reacting to "stock.low") — raise the default cap of
// 10 so that's never mistaken for a leak.
bus.setMaxListeners(50);

module.exports = bus;
