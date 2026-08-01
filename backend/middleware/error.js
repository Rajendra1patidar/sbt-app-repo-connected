const { sendErrorAlert } = require("../utils/alertWebhook");

function notFound(req, res, next) {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error(err.stack || err);
  const status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  // Only unexpected, server-side failures get pushed to the webhook — routine
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

  res.status(status).json({
    message: err.message || "Server error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
