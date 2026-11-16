const mongoose = require("mongoose");

const photoSchema = new mongoose.Schema(
  {
    src: { type: String, default: "" },
    alt: { type: String, default: "" },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, required: true },
    details: { type: String, default: "" },
    price: {
      amount: { type: Number, required: true, min: 0 },
      currency: { type: String, default: "USD" },
    },
    retailer: { type: String, enum: ["amazon", "temu"], default: "amazon" },
    // The real shop link. Visitors go through the product's referral link so clicks are counted.
    affiliateUrl: { type: String, required: true },
    referralCode: { type: String, default: "" },
    isSampleData: { type: Boolean, default: false },
    badge: { type: String, default: "" },
    audiences: [{ type: String, enum: ["men", "women", "kids", "couples", "everyone"] }],
    categories: [{ type: String }],
    image: { type: photoSchema, required: true },
    altImage: { type: photoSchema, default: () => ({}) },
    video: {
      src: { type: String, default: "" },
    },
    trending: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    position: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
