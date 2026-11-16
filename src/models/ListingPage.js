const mongoose = require("mongoose");

// One gift page on the site, for example /gifts/for-dad or /occasions/christmas.
const listingPageSchema = new mongoose.Schema(
  {
    section: { type: String, enum: ["gifts", "occasions", "discover", "unique-finds"], required: true },
    // Empty slug is the main page of a section, for example /discover.
    slug: { type: String, default: "", trim: true },
    label: { type: String, required: true },
    title: { type: String, required: true },
    tagline: { type: String, default: "" },
    about: { type: String, default: "" },
    rule: { type: mongoose.Schema.Types.Mixed, default: {} },
    interests: [{ type: String }],
    related: [{ type: String }],
    guideId: { type: String, default: "" },
    feature: { type: mongoose.Schema.Types.Mixed, required: true },
    metaTitle: { type: String },
    gridTitle: { type: String },
    picksTitle: { type: String },
    position: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false }
);

listingPageSchema.index({ section: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model("ListingPage", listingPageSchema);
