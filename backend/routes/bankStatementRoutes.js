const express = require("express");
const router = express.Router();
const controller = require("../controllers/bankStatementController");

router.post("/import", controller.import);
router.get("/", controller.list);
router.get("/candidates", controller.candidates);
router.post("/:id/match", controller.match);
router.post("/:id/unmatch", controller.unmatch);

module.exports = router;
