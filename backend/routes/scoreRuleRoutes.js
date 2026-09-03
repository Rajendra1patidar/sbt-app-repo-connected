const controller = require("../controllers/scoreRuleController");
const makeCrudRouter = require("./crudRoutes");

module.exports = makeCrudRouter(controller);
