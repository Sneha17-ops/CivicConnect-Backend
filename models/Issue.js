const mongoose = require("mongoose");

const issueSchema = new mongoose.Schema({
  title: String,
  description: String,
  location: String,
  category: String,
  image: String,

  status: {
    type: String,
    default: "reported"
  },

  votes: {
    type: Number,
    default: 0
  },

  comments: [
    {
      text: String,
      date: {
        type: Date,
        default: Date.now
      }
    }
  ]

}, { timestamps: true });

module.exports = mongoose.model("Issue", issueSchema);