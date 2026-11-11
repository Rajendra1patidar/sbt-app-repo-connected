const { runAllJobs, JOB_NAMES } = require("../jobs/runAllJobs");

const YES = ["1", "true", "yes"];
const isYes = (v) => YES.includes(String(v || "").toLowerCase());

// POST /api/cron/run (behind the CRON_SECRET check, see routes/cronRoutes.js)
//
// Optional switches, for testing by hand (all still need the secret):
//   ?force=1      run the jobs even if they already ran today
//   ?only=backup  run just these jobs (comma-separated names)
//   ?async=1      answer right away and keep working in the background,
//                 for schedulers that give up after 30 seconds
exports.run = async (req, res) => {
  const force = isYes(req.query.force);
  const asyncMode = isYes(req.query.async);
  const only = req.query.only
    ? String(req.query.only).split(",").map((n) => n.trim()).filter(Boolean)
    : null;

  if (only) {
    const unknown = only.filter((n) => !JOB_NAMES.includes(n));
    if (unknown.length) {
      return res.status(400).json({
        status: "error",
        message: `Unknown job(s): ${unknown.join(", ")}. Known: ${JOB_NAMES.join(", ")}.`,
      });
    }
  }

  if (asyncMode) {
    res.status(202).json({
      status: "accepted",
      message: "Run started. The result is in the app (Settings > Backups) and any problem is sent to Telegram.",
    });
    runAllJobs({ force, only }).catch((err) => console.error("cronController: background run crashed:", err.message));
    return;
  }

  try {
    const outcome = await runAllJobs({ force, only });
    const payload = JSON.stringify({ status: "ok", ...outcome });
    console.log(`cronController: /run responding with ${Buffer.byteLength(payload)} bytes`);
    res.type("application/json").send(payload);
  } catch (err) {
    console.error("cronController: /run crashed unexpectedly:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
};
