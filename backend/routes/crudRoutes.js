const express = require("express");

// builds a standard CRUD router from a controller object
// { list, getOne, create, update, remove }
function makeCrudRouter(controller) {
  const router = express.Router();
  router.get("/", controller.list);
  router.get("/:id", controller.getOne);
  router.post("/", controller.create);
  router.put("/:id", controller.update);
  router.delete("/:id", controller.remove);
  return router;
}

module.exports = makeCrudRouter;
