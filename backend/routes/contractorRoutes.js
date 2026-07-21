const controller = require("../controllers/contractorController");
const makeCrudRouter = require("./crudRoutes");

module.exports = makeCrudRouter(controller);
