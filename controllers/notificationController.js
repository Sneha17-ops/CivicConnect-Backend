const Notification = require("../models/Notification");

/**
 * @desc    Get notifications for user (or public notifications if unauthenticated)
 * @route   GET /api/notifications
 * @access  Public / Authenticated
 */
const getNotifications = async (req, res, next) => {
  try {
    const user = req.user;
    let query = {};

    if (user && user.id) {
      // User is logged in: show notifications sent to "all", user's ID, or user's email
      const conditions = [{ recipientUserId: "all" }, { recipientUserId: user.id }];
      if (user.email) {
        conditions.push({ recipientEmail: user.email.toLowerCase() });
      }
      query = { $or: conditions };
    } else {
      // Unauthenticated: return public/broadcast notifications
      query = { recipientUserId: "all" };
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = notifications.filter((n) => !n.read).length;

    return res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      data: notifications,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Mark a notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Public / Authenticated
 */
const markNotificationAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      id,
      { read: true, readAt: new Date() },
      { returnDocument: "after" }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Create a new notification (broadcast or direct to user)
 * @route   POST /api/notifications
 * @access  Private (Admin Only)
 */
const createNotification = async (req, res, next) => {
  try {
    const { message, recipientEmail, recipientUserId, title, type } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Notification message is required",
      });
    }

    const notification = await Notification.create({
      message: message.trim(),
      recipientEmail: (recipientEmail || "").trim().toLowerCase(),
      recipientUserId: recipientUserId || (recipientEmail ? "" : "all"),
      title: title || "CivicConnect Update",
      type: type || "announcement",
    });

    return res.status(201).json({
      success: true,
      message: "Notification sent successfully",
      data: notification,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getNotifications,
  markNotificationAsRead,
  createNotification,
};
