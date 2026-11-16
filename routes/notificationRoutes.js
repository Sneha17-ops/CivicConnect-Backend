const express = require("express");
const router = express.Router();

const {
  getNotifications,
  markNotificationAsRead,
  createNotification,
} = require("../controllers/notificationController");
const { optionalAuth, requireAdmin } = require("../middleware/authMiddleware");

router.get("/", optionalAuth, getNotifications);
router.patch("/:id/read", markNotificationAsRead);
router.post("/", requireAdmin, createNotification);

module.exports = router;
