const mongoose = require("mongoose");

let isConnected = false;

const connectDB = async () => {
  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://127.0.0.1:27017/civicconnect";

  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    console.log(`MongoDB Connected: ${conn.connection.host} ✅`);
    return conn;
  } catch (error) {
    console.error(`MongoDB Connection Error ❌: ${error.message}`);
    // If Atlas failed, try falling back to local MongoDB if in development
    if (uri.includes("mongodb+srv") && process.env.NODE_ENV !== "production") {
      console.log("Attempting fallback to local MongoDB instance (127.0.0.1:27017)...");
      try {
        const localConn = await mongoose.connect("mongodb://127.0.0.1:27017/civicconnect", {
          serverSelectionTimeoutMS: 3000,
        });
        isConnected = true;
        console.log(`Local MongoDB Connected ✅ (fallback): ${localConn.connection.host}`);
        return localConn;
      } catch (localError) {
        console.error(`Local MongoDB fallback failed: ${localError.message}`);
      }
    }
    throw error;
  }
};

const isDBConnected = () => {
  return mongoose.connection.readyState === 1;
};

module.exports = { connectDB, isDBConnected };
