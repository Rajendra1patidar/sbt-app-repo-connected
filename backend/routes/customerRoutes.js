const Customer = require("../models/Customer");
const crudController = require("../controllers/crudController");
const makeCrudRouter = require("./crudRoutes");

module.exports = makeCrudRouter(crudController(Customer));
