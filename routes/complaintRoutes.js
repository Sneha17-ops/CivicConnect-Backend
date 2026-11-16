const express = require("express");
const router = express.Router();

const {
  createComplaint,
  getAllComplaints,
  getMyComplaints,
  getComplaintById,
  updateComplaintStatus,
  deleteComplaint,
  getPublicComplaints,
  getPublicMapComplaints,
} = require("../controllers/complaintController");
const { getDashboardStats, getPublicStats } = require("../controllers/statsController");
const { uploadComplaintImage } = require("../middleware/uploadMiddleware");
const { optionalAuth, requireAuth, requireAdmin } = require("../middleware/authMiddleware");

// Public endpoints for citizen community dashboard and heatmap (Sanitized)
router.get("/public", getPublicComplaints);
router.get("/public/stats", getPublicStats);
router.get("/public/map", getPublicMapComplaints);

// Legacy / authenticated stats endpoint
router.get("/stats", getDashboardStats);

// Citizen & complaints management
router.post("/", uploadComplaintImage, optionalAuth, createComplaint);
router.get("/", getAllComplaints);
router.get("/my", requireAuth, getMyComplaints);
router.get("/:id", getComplaintById);

// Admin status & details update
router.put("/:id", requireAdmin, updateComplaintStatus);
router.patch("/:id/status", requireAdmin, updateComplaintStatus);

// Delete complaint (Admin or Complaint Owner)
router.delete("/:id", requireAuth, deleteComplaint);

module.exports = router;
