const Notification = require("../models/Notification");

// Central place every automated event turns into something a person can
// see. Right now this only writes the in-app feed; when a WhatsApp or email
// channel is added, it plugs in here once instead of once per feature.
// Deliberately never throws — a broken notification must not be allowed to
// look like a broken business event to whoever's watching the logs.
async function notify(owner, { type, title, body, refId }) {
  try {
    return await Notification.create({ owner, type, title, body: body || "", refId });
  } catch (err) {
    console.error("notificationService.notify failed:", err.message);
    return null;
  }
}

module.exports = { notify };
