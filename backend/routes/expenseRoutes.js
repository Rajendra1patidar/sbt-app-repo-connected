const controller = require("../controllers/expenseController");
const makeCrudRouter = require("./crudRoutes");

module.exports = makeCrudRouter(controller);
