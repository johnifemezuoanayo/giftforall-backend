const express = require("express");
const ReferralLink = require("../models/ReferralLink");
const ReferralClick = require("../models/ReferralClick");

const router = express.Router();

// Adds our Amazon Associates tag when the link doesn't already have one.
function addAffiliateTag(destinationUrl) {
  const tag = process.env.AMAZON_TAG;
  if (!tag) return destinationUrl;

  try {
    const url = new URL(destinationUrl);
    if (url.hostname.endsWith("amazon.com") && !url.searchParams.get("tag")) {
      url.searchParams.set("tag", tag);
    }
    return url.toString();
  } catch (error) {
    return destinationUrl;
  }
}

router.get("/:code", async (req, res) => {
  const link = await ReferralLink.findOneAndUpdate(
    { code: req.params.code, active: true },
    { $inc: { clicks: 1 }, $set: { lastClickedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!link) {
    return res.redirect(302, process.env.SITE_URL || "/");
  }

  try {
    // Links in newsletter emails carry ?from=email-<id>, so each email's clicks can be counted.
    const from = String(req.query.from || "");
    const source = /^[a-z0-9-]{1,60}$/.test(from) ? from : "";
    await ReferralClick.create({ link: link._id, product: link.product, retailer: link.retailer, source });
  } catch (error) {
    // Never stop the visitor from reaching the shop just because the click log failed.
    console.error("Could not save referral click:", error.message);
  }

  res.redirect(302, addAffiliateTag(link.destinationUrl));
});

module.exports = router;
