const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/portalAdminController");

router.get("/", ctrl.getAll);
router.put("/content", ctrl.saveContent);
router.post("/items", ctrl.saveItem);
router.delete("/items/:id", ctrl.removeItem);
// Browser asks for a signed Cloudinary upload, then sends the file straight to Cloudinary.
router.post("/upload-url", ctrl.uploadUrl);

module.exports = router;
