const { connectDB, isDBConnected } = require("./config/db");

module.exports = connectDB;
module.exports.connectDB = connectDB;
module.exports.isDBConnected = isDBConnected;
