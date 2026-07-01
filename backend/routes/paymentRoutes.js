const controller = require("../controllers/paymentController");
const makeCrudRouter = require("./crudRoutes");

module.exports = makeCrudRouter(controller);
