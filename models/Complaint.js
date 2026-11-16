const mongoose = require("mongoose");

const complaintSchema = new mongoose.Schema(
  {
    complaintId: {
      type: String,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Complaint title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Detailed description is required"],
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      default: "General",
    },
    otherCategory: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "Unknown location",
    },
    coordinates: {
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
      city: {
        type: String,
        default: "",
      },
    },
    image: {
      type: String,
      default: "",
    },
    imageUrl: {
      type: String,
      default: "",
    },
    language: {
      type: String,
      default: "en",
    },
    voiceTranscript: {
      type: String,
      default: "",
    },
    userId: {
      type: String,
      index: true,
      default: "anonymous",
    },
    userName: {
      type: String,
      default: "Anonymous Citizen",
    },
    userEmail: {
      type: String,
      index: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["Pending", "Under Process", "Solved", "Resolved"],
      default: "Pending",
      index: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
      index: true,
    },
    department: {
      type: String,
      default: "General Administration",
      trim: true,
    },
    adminRemarks: {
      type: String,
      default: "",
      trim: true,
    },
    remarksHistory: [
      {
        remark: String,
        status: String,
        priority: String,
        department: String,
        updatedBy: String,
        updatedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Auto-generate human-friendly unique complaint ID if not provided
complaintSchema.pre("validate", function () {
  if (!this.complaintId) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.floor(1000 + Math.random() * 9000);
    this.complaintId = `CC-${timestamp}-${random}`;
  }
});

// Normalize status values: treat "Resolved" and "Solved" interchangeably
complaintSchema.pre("save", function () {
  if (this.status === "Resolved") {
    this.status = "Solved";
  }
});

module.exports = mongoose.model("Complaint", complaintSchema);
