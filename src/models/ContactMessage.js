const mongoose = require("mongoose");

const contactMessageSchema = new mongoose.Schema(
  {
    reason: { type: String, default: "question" },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContactMessage", contactMessageSchema);
