const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Complaint = require("../models/Complaint");
const Notification = require("../models/Notification");
const { ADMIN_EMAILS } = require("../middleware/authMiddleware");

const ALLOWED_STATUSES = ["Pending", "Under Process", "Solved", "Resolved"];
const ALLOWED_PRIORITIES = ["Low", "Medium", "High"];

/**
 * Format image URL from filename
 */
const formatImageUrl = (req, filename) => {
  if (!filename) return "";
  if (filename.startsWith("http://") || filename.startsWith("https://")) {
    return filename;
  }
  const protocol = req.protocol;
  const host = req.get("host") || "localhost:5000";
  return `${protocol}://${host}/uploads/${filename}`;
};

/**
 * Attach full imageUrl to complaint object
 */
const enrichComplaint = (req, complaint) => {
  const obj = complaint.toObject ? complaint.toObject() : { ...complaint };
  if (obj.image) {
    obj.imageUrl = formatImageUrl(req, obj.image);
  }
  return obj;
};

/**
 * @desc    Create a new complaint
 * @route   POST /api/complaints
 * @access  Public / Optional Auth
 */
const createComplaint = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      otherCategory,
      location,
      coordinates,
      language,
      voiceTranscript,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Complaint title is required",
      });
    }

    if (!description || !description.trim()) {
      return res.status(400).json({
        success: false,
        message: "Complaint description is required",
      });
    }

    // Parse coordinates if sent as JSON string from FormData
    let parsedCoordinates = { latitude: null, longitude: null, city: "" };
    if (coordinates) {
      if (typeof coordinates === "string") {
        try {
          parsedCoordinates = JSON.parse(coordinates);
        } catch {
          parsedCoordinates = { latitude: null, longitude: null, city: location || "" };
        }
      } else if (typeof coordinates === "object") {
        parsedCoordinates = coordinates;
      }
    }

    const imageFilename = req.file ? req.file.filename : "";

    const user = req.user || {};
    const userId = user.id || req.body.userId || "anonymous";
    const userName = user.name || req.body.userName || "Anonymous Citizen";
    const userEmail = user.email || req.body.userEmail || "";

    const complaint = await Complaint.create({
      title: title.trim(),
      description: description.trim(),
      category: category && category.trim() ? category.trim() : "General",
      otherCategory: otherCategory ? otherCategory.trim() : "",
      location: location ? location.trim() : parsedCoordinates.city || "Not specified",
      coordinates: parsedCoordinates,
      image: imageFilename,
      imageUrl: formatImageUrl(req, imageFilename),
      language: language || "en",
      voiceTranscript: voiceTranscript || "",
      userId,
      userName,
      userEmail,
      status: "Pending",
      priority: req.body.priority || "Medium",
      department: req.body.department || "General Administration",
    });

    // Create confirmation notification for authenticated user
    if (userId && userId !== "anonymous") {
      try {
        await Notification.create({
          recipientUserId: userId,
          recipientEmail: userEmail,
          complaintId: complaint._id,
          title: "Complaint Filed Successfully",
          message: `Your complaint "${complaint.title}" has been registered with ID ${complaint.complaintId}.`,
          type: "status_update",
        });
      } catch (notifyErr) {
        console.warn("Could not create initial notification:", notifyErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: "Complaint submitted successfully",
      data: enrichComplaint(req, complaint),
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get all complaints (with filtering and pagination)
 * @route   GET /api/complaints
 * @access  Public / Authenticated
 */
const getAllComplaints = async (req, res, next) => {
  try {
    const { category, status, priority, department, search, limit = 100, page = 1 } = req.query;

    const filter = {};

    if (category && category !== "All") {
      filter.category = category;
    }

    if (status && status !== "All") {
      if (status === "Resolved" || status === "Solved") {
        filter.status = { $in: ["Solved", "Resolved"] };
      } else {
        filter.status = status;
      }
    }

    if (priority && priority !== "All") {
      filter.priority = priority;
    }

    if (department && department !== "All") {
      filter.department = department;
    }

    if (search && search.trim()) {
      filter.$or = [
        { title: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
        { location: { $regex: search.trim(), $options: "i" } },
        { complaintId: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Complaint.countDocuments(filter),
    ]);

    const enriched = complaints.map((c) => enrichComplaint(req, c));

    return res.status(200).json({
      success: true,
      count: enriched.length,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      data: enriched,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get complaints for logged-in user
 * @route   GET /api/complaints/my
 * @access  Private
 */
const getMyComplaints = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required to view your complaints",
      });
    }

    const filter = {
      $or: [{ userId: req.user.id }],
    };

    if (req.user.email) {
      filter.$or.push({ userEmail: req.user.email });
    }

    const complaints = await Complaint.find(filter).sort({ createdAt: -1 });
    const enriched = complaints.map((c) => enrichComplaint(req, c));

    return res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get single complaint by ID or complaintId
 * @route   GET /api/complaints/:id
 * @access  Public / Authenticated
 */
const getComplaintById = async (req, res, next) => {
  try {
    const { id } = req.params;

    let complaint = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      complaint = await Complaint.findById(id);
    }

    if (!complaint) {
      complaint = await Complaint.findOne({ complaintId: id });
    }

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint not found with ID ${id}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: enrichComplaint(req, complaint),
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Update complaint status, priority, department, and admin remarks
 * @route   PUT /api/complaints/:id or PATCH /api/complaints/:id/status
 * @access  Private (Admin Only)
 */
const updateComplaintStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, priority, department, adminRemarks } = req.body;

    let complaint = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      complaint = await Complaint.findById(id);
    }
    if (!complaint) {
      complaint = await Complaint.findOne({ complaintId: id });
    }

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint not found with ID ${id}`,
      });
    }

    const previousStatus = complaint.status;
    const updates = {};
    let statusChanged = false;

    if (status !== undefined) {
      let normalizedStatus = status;
      if (normalizedStatus === "Resolved") normalizedStatus = "Solved";

      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Allowed values are: ${ALLOWED_STATUSES.join(", ")}`,
        });
      }

      updates.status = normalizedStatus;
      if (previousStatus !== normalizedStatus) {
        statusChanged = true;
      }
    }

    if (priority !== undefined) {
      if (!ALLOWED_PRIORITIES.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: `Invalid priority. Allowed values are: ${ALLOWED_PRIORITIES.join(", ")}`,
        });
      }
      updates.priority = priority;
    }

    if (department !== undefined) {
      updates.department = department.trim();
    }

    if (adminRemarks !== undefined) {
      updates.adminRemarks = adminRemarks.trim();
    }

    // Add remark history entry if remark or status changed
    if (adminRemarks || statusChanged || priority || department) {
      const historyEntry = {
        remark: adminRemarks || updates.adminRemarks || complaint.adminRemarks || "",
        status: updates.status || complaint.status,
        priority: updates.priority || complaint.priority,
        department: updates.department || complaint.department,
        updatedBy: req.user?.email || req.user?.name || "Administrator",
        updatedAt: new Date(),
      };
      updates.$push = { remarksHistory: historyEntry };
    }

    const updatedComplaint = await Complaint.findByIdAndUpdate(complaint._id, updates, {
      returnDocument: "after",
      runValidators: true,
    });

    // If status changed or remarks added, notify the complaint author
    if (statusChanged || adminRemarks) {
      try {
        const notifMessage = statusChanged
          ? `Status of complaint "${complaint.title}" has been updated to "${updatedComplaint.status}".${
              adminRemarks ? ` Remarks: ${adminRemarks}` : ""
            }`
          : `New administrator update on complaint "${complaint.title}": ${adminRemarks}`;

        await Notification.create({
          recipientUserId: complaint.userId || "all",
          recipientEmail: complaint.userEmail || "",
          complaintId: complaint._id,
          title: `Complaint Status Updated: ${updatedComplaint.status}`,
          message: notifMessage,
          type: "status_update",
        });
      } catch (notifErr) {
        console.warn("Could not create status update notification:", notifErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Complaint updated successfully",
      data: enrichComplaint(req, updatedComplaint),
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Delete a complaint
 * @route   DELETE /api/complaints/:id
 * @access  Private (Admin or Complaint Owner)
 */
const deleteComplaint = async (req, res, next) => {
  try {
    const { id } = req.params;

    let complaint = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      complaint = await Complaint.findById(id);
    }
    if (!complaint) {
      complaint = await Complaint.findOne({ complaintId: id });
    }

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint not found with ID ${id}`,
      });
    }

    // Check authorization: only admin or the user who created it can delete
    const userEmail = (req.user?.email || "").toLowerCase();
    const isOwner = req.user && (req.user.id === complaint.userId || (userEmail && userEmail === (complaint.userEmail || "").toLowerCase()));
    const isAdmin =
      req.user &&
      (req.user.role === "admin" ||
        req.user.publicMetadataRole === "admin" ||
        ADMIN_EMAILS.includes(userEmail));

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: You are not authorized to delete this complaint.",
      });
    }

    // Delete image file if stored locally
    if (complaint.image) {
      const filePath = path.join(__dirname, "../uploads", complaint.image);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (unlinkErr) {
          console.warn("Could not remove complaint image file:", unlinkErr.message);
        }
      }
    }

    await Complaint.findByIdAndDelete(complaint._id);

    return res.status(200).json({
      success: true,
      message: "Complaint deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get public complaints for citizen community registry (Strictly sanitized)
 * @route   GET /api/complaints/public
 * @access  Public
 */
const getPublicComplaints = async (req, res, next) => {
  try {
    const { category, status, search, sort = "newest", page = 1, limit = 12 } = req.query;

    const filter = {};

    if (category && category !== "All") {
      filter.category = category;
    }

    if (status && status !== "All") {
      if (status === "Solved" || status === "Resolved") {
        filter.status = { $in: ["Solved", "Resolved"] };
      } else {
        filter.status = status;
      }
    }

    if (search && search.trim()) {
      const trimmed = search.trim();
      filter.$or = [
        { title: { $regex: trimmed, $options: "i" } },
        { complaintId: { $regex: trimmed, $options: "i" } },
        { location: { $regex: trimmed, $options: "i" } },
        { category: { $regex: trimmed, $options: "i" } },
      ];
    }

    const sortOrder = sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    // Exclude private citizen data (userId, userEmail, userName, adminRemarks, voiceTranscript)
    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .sort(sortOrder)
        .skip(skip)
        .limit(limitNum)
        .select("complaintId title description category otherCategory location coordinates status priority department createdAt updatedAt -_id"),
      Complaint.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      count: complaints.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      data: complaints,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * @desc    Get public complaint coordinates for map visualization (Only records with valid coordinates)
 * @route   GET /api/complaints/public/map
 * @access  Public
 */
const getPublicMapComplaints = async (req, res, next) => {
  try {
    const { category, status, priority } = req.query;

    const filter = {
      "coordinates.latitude": { $ne: null, $exists: true },
      "coordinates.longitude": { $ne: null, $exists: true },
    };

    if (category && category !== "All") {
      filter.category = category;
    }

    if (status && status !== "All") {
      if (status === "Solved" || status === "Resolved") {
        filter.status = { $in: ["Solved", "Resolved"] };
      } else {
        filter.status = status;
      }
    }

    if (priority && priority !== "All") {
      filter.priority = priority;
    }

    // Only select public-safe fields needed for map markers and popups
    const complaints = await Complaint.find(filter)
      .sort({ createdAt: -1 })
      .select("complaintId title category location coordinates status priority department createdAt -_id");

    const validMappedComplaints = complaints.filter(
      (c) =>
        c.coordinates &&
        Number.isFinite(Number(c.coordinates.latitude)) &&
        Number.isFinite(Number(c.coordinates.longitude))
    );

    return res.status(200).json({
      success: true,
      count: validMappedComplaints.length,
      data: validMappedComplaints,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createComplaint,
  getAllComplaints,
  getMyComplaints,
  getComplaintById,
  updateComplaintStatus,
  deleteComplaint,
  enrichComplaint,
  getPublicComplaints,
  getPublicMapComplaints,
};
