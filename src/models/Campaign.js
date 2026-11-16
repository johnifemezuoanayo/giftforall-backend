const mongoose = require("mongoose");

// One newsletter email, from draft to sent.
const campaignSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true },
    previewText: { type: String, default: "" },
    heading: { type: String, default: "" },
    intro: { type: String, default: "" },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    buttonText: { type: String, default: "See all gifts" },
    buttonUrl: { type: String, default: "" },
    status: { type: String, enum: ["draft", "sending", "sent", "failed"], default: "draft" },
    recipientCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    failedEmails: [{ type: String }],
    error: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Campaign", campaignSchema);
