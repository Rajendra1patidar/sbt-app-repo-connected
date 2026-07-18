const express = require("express");
const controller = require("../controllers/itemController");
const makeCrudRouter = require("./crudRoutes");

const router = makeCrudRouter(controller);
router.get("/meta/low-stock", controller.lowStock);
router.get("/meta/find-duplicate", controller.findDuplicate);

module.exports = router;
