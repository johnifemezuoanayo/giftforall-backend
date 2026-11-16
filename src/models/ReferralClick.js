const mongoose = require("mongoose");

// One row per visit through a referral link, so the dashboard can show clicks over time.
const referralClickSchema = new mongoose.Schema({
  link: { type: mongoose.Schema.Types.ObjectId, ref: "ReferralLink", required: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
  retailer: { type: String, default: "" },
  // Where the click came from, like "email-<campaign id>". Empty for clicks on the website.
  source: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

referralClickSchema.index({ createdAt: -1 });
referralClickSchema.index({ link: 1, createdAt: -1 });

module.exports = mongoose.model("ReferralClick", referralClickSchema);
