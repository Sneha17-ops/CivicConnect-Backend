const express = require("express");
const router = express.Router();

const { getDashboardStats } = require("../controllers/statsController");
const { requireAdmin } = require("../middleware/authMiddleware");
const User = require("../models/User");
const Complaint = require("../models/Complaint");

router.get("/stats", requireAdmin, getDashboardStats);

router.get("/users", requireAdmin, async (req, res, next) => {
  try {
    // Get unique citizens who submitted complaints
    const citizens = await Complaint.aggregate([
      {
        $match: { userId: { $ne: "anonymous" } },
      },
      {
        $group: {
          _id: "$userId",
          userName: { $first: "$userName" },
          userEmail: { $first: "$userEmail" },
          complaintCount: { $sum: 1 },
          lastActive: { $max: "$createdAt" },
        },
      },
      { $sort: { complaintCount: -1 } },
    ]);

    return res.status(200).json({
      success: true,
      count: citizens.length,
      data: citizens,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
