const { sendErrorAlert } = require("../utils/alertWebhook");

function notFound(req, res, next) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error(err.stack || err);

  // Honour a status the error carries (validation errors thrown with .status,
  // body-parser's 400 on bad JSON, the CORS 403) before falling back to
  // whatever the response already had, then to 500.
  const carried = Number(err.status || err.statusCode);
  const status =
    carried >= 400 && carried < 600
      ? carried
      : res.statusCode && res.statusCode !== 200
        ? res.statusCode
        : 500;

  // Only unexpected, server-side failures get pushed to the webhook - routine
  // 4xx validation responses are handled inline in controllers with
  // res.status(400)/(404).json(...) and never reach this handler at all, so
  // anything landing here is genuinely "something broke", not "bad input".
  if (status >= 500) {
    sendErrorAlert({
      message: err.message || "Unknown error",
      method: req.method,
      path: req.originalUrl,
      status,
      userId: req.userId,
    });
  }

  // In production a 500 never shows internal wording (database errors, file
  // paths) to the client - the real message is in the server log and the alert.
  const isProd = process.env.NODE_ENV === "production";
  const message =
    status >= 500 && isProd ? "Something went wrong on the server. Please try again." : err.message || "Server error";

  res.status(status).json({
    message,
    ...(!isProd && { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
