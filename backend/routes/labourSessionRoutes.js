const express = require("express");
const ctrl = require("../controllers/labourSessionController");

const router = express.Router();

router.get("/meta/workers", ctrl.workers);
router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.delete("/:id", ctrl.remove);

module.exports = router;
