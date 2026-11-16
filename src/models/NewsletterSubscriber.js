const crypto = require("crypto");
const mongoose = require("mongoose");

const newsletterSubscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    source: { type: String, default: "website" },
    subscribed: { type: Boolean, default: true },
    unsubscribedAt: { type: Date, default: null },
    // Secret code in the unsubscribe link of every email, so only this person can unsubscribe themselves.
    unsubscribeToken: { type: String, default: () => crypto.randomBytes(24).toString("hex"), index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("NewsletterSubscriber", newsletterSubscriberSchema);
