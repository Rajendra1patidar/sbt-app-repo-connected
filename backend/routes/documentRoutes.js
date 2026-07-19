const express = require("express");
const ctrl = require("../controllers/documentController");

// builds a router for one document type: "estimate" | "challan"
function makeDocumentRouter(type) {
  const router = express.Router();

  router.get("/", ctrl.list(type));
  router.get("/:id", ctrl.getOne(type));
  router.post("/", ctrl.create(type));
  router.put("/:id", ctrl.update(type));
  router.patch("/:id/status", ctrl.updateStatus(type));
  router.post("/:id/returns", ctrl.addReturn(type));
  router.post("/:id/deliveries", ctrl.addDelivery(type));
  router.delete("/:id", ctrl.remove(type));

  return router;
}

module.exports = makeDocumentRouter;
