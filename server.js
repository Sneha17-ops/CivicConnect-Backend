const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const { connectDB, isDBConnected } = require("./config/db");
const complaintRoutes = require("./routes/complaintRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { notFoundHandler, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

// CORS configuration
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return callback(null, true);
      }
      return callback(null, true); // Dev-friendly: allow origin for testing
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-user-email", "x-user-id", "x-user-name", "x-user-role", "x-test-user-id", "x-test-user-email", "x-test-user-role"],
  })
);

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Static uploads directory
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Root and Health Check endpoints
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "CivicConnect API Server running",
    version: "1.0.0",
    database: isDBConnected() ? "connected" : "disconnected",
  });
});

const healthCheckHandler = (req, res) => {
  const dbStatus = isDBConnected();
  res.status(dbStatus ? 200 : 503).json({
    status: dbStatus ? "healthy" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      api: { status: "healthy" },
      mongodb: { status: dbStatus ? "connected" : "disconnected" },
    },
  });
};

app.get("/health", healthCheckHandler);
app.get("/api/health", healthCheckHandler);

// API Routes
app.use("/api/complaints", complaintRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);

// Centralized error handling
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Start server function
const startServer = async () => {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log(`===============================================`);
      console.log(`CivicConnect Backend running on port ${PORT} 🚀`);
      console.log(`Health Check: http://localhost:${PORT}/health`);
      console.log(`API Base: http://localhost:${PORT}/api/complaints`);
      console.log(`===============================================`);
    });
    return server;
  } catch (error) {
    console.error(`Failed to start server due to DB connection failure: ${error.message}`);
    // Start server anyway with disconnected state so healthcheck and diagnostic messages are visible
    const server = app.listen(PORT, () => {
      console.warn(`Server listening on port ${PORT} with DB DISCONNECTED ⚠️`);
    });
    return server;
  }
};

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
