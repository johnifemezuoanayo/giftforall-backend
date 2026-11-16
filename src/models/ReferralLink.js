const mongoose = require("mongoose");

const referralLinkSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    destinationUrl: { type: String, required: true },
    retailer: { type: String, default: "" },
    // Set when the link belongs to a product. Its destination then follows the product's shop link.
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    clicks: { type: Number, default: 0 },
    lastClickedAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ReferralLink", referralLinkSchema);
