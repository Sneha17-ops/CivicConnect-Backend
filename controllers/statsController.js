const Complaint = require("../models/Complaint");
const Notification = require("../models/Notification");

/**
 * @desc    Get dashboard statistics dynamically from MongoDB (Admin / Internal)
 * @route   GET /api/complaints/stats or GET /api/admin/stats
 * @access  Public / Admin
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const [
      total,
      pending,
      underProcess,
      solved,
      categoryStats,
      departmentStats,
      priorityStats,
      recentComplaints,
      notificationCount,
    ] = await Promise.all([
      Complaint.countDocuments(),
      Complaint.countDocuments({ status: "Pending" }),
      Complaint.countDocuments({ status: "Under Process" }),
      Complaint.countDocuments({ status: { $in: ["Solved", "Resolved"] } }),
      // Category aggregation
      Complaint.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Department aggregation
      Complaint.aggregate([
        { $group: { _id: "$department", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Priority aggregation
      Complaint.aggregate([
        { $group: { _id: "$priority", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // 5 most recent complaints (sanitized)
      Complaint.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("complaintId title category status priority location createdAt"),
      // Total notifications sent
      Notification.countDocuments(),
    ]);

    // Format category stats into clean map
    const byCategory = {};
    categoryStats.forEach((item) => {
      byCategory[item._id || "Uncategorized"] = item.count;
    });

    // Format department stats into clean map
    const byDepartment = {};
    departmentStats.forEach((item) => {
      byDepartment[item._id || "General Administration"] = item.count;
    });

    // Format priority stats
    const byPriority = {
      Low: 0,
      Medium: 0,
      High: 0,
    };
    priorityStats.forEach((item) => {
      if (item._id) byPriority[item._id] = item.count;
    });

    return res.status(200).json({
      success: true,
      data: {
        total,
        pending,
        underProcess,
        solved,
        resolved: solved,
        byCategory,
        byDepartment,
        byPriority,
        notificationsCount: notificationCount,
        recent: recentComplaints,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get public complaint statistics for citizens (100% sanitized, dynamic from MongoDB)
 * @route   GET /api/complaints/public/stats
 * @access  Public
 */
const getPublicStats = async (req, res, next) => {
  try {
    const [
      total,
      pending,
      underProcess,
      solved,
      categoryStats,
      priorityStats,
      mappedCount,
      recentComplaints,
    ] = await Promise.all([
      Complaint.countDocuments(),
      Complaint.countDocuments({ status: "Pending" }),
      Complaint.countDocuments({ status: "Under Process" }),
      Complaint.countDocuments({ status: { $in: ["Solved", "Resolved"] } }),
      // Category aggregation
      Complaint.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Priority aggregation
      Complaint.aggregate([
        { $group: { _id: "$priority", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Mapped complaints (valid lat & lng)
      Complaint.countDocuments({
        "coordinates.latitude": { $ne: null, $exists: true },
        "coordinates.longitude": { $ne: null, $exists: true },
      }),
      // Recent public complaints (strictly sanitized - no emails, names, or remarks)
      Complaint.find()
        .sort({ createdAt: -1 })
        .limit(6)
        .select("complaintId title category status priority location coordinates createdAt -_id"),
    ]);

    const byCategory = {};
    categoryStats.forEach((item) => {
      byCategory[item._id || "General"] = item.count;
    });

    const byPriority = {
      Low: 0,
      Medium: 0,
      High: 0,
    };
    priorityStats.forEach((item) => {
      if (item._id) byPriority[item._id] = item.count;
    });

    const unmappedCount = Math.max(0, total - mappedCount);

    return res.status(200).json({
      success: true,
      data: {
        total,
        pending,
        underProcess,
        solved,
        resolved: solved,
        mappedCount,
        unmappedCount,
        byCategory,
        byPriority,
        recent: recentComplaints,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getDashboardStats,
  getPublicStats,
};
