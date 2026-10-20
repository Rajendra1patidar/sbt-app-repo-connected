const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/portalAdminController");

router.get("/", ctrl.getAll);
router.put("/content", ctrl.saveContent);
router.post("/items", ctrl.saveItem);
router.delete("/items/:id", ctrl.removeItem);

module.exports = router;
