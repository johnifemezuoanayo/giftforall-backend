const express = require("express");
const ReferralLink = require("../../models/ReferralLink");
const ReferralClick = require("../../models/ReferralClick");
const { findFreeCode, referralLinkUrl } = require("../../utils/products");
const { DAY, readTimeZone, lastDays } = require("../../utils/dates");

const router = express.Router();

function withFullUrl(link) {
  const data = link.toObject ? link.toObject() : link;
  return { ...data, url: referralLinkUrl(data.code) };
}

// Every link with its clicks in the last 30 days and a day-by-day count for the last 14 days.
router.get("/", async (req, res) => {
  const filter = {};
  if (req.query.type === "product") filter.product = { $ne: null };
  if (req.query.type === "custom") filter.product = null;
  const timeZone = readTimeZone(req.query.tz);
  const days = lastDays(14, timeZone);

  const [links, recentRows, dailyRows] = await Promise.all([
    ReferralLink.find(filter).populate("product", "name slug image").sort({ clicks: -1, createdAt: -1 }),
    ReferralClick.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 30 * DAY) } } },
      { $group: { _id: "$link", count: { $sum: 1 } } },
    ]),
    ReferralClick.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 15 * DAY) } } },
      {
        $group: {
          _id: { link: "$link", day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: timeZone } } },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const referrals = links.map((link) => {
    const id = String(link._id);
    const recent = recentRows.find((row) => String(row._id) === id);
    const daily = days.map((day) => {
      const row = dailyRows.find((item) => String(item._id.link) === id && item._id.day === day);
      return row ? row.count : 0;
    });
    return { ...withFullUrl(link), clicksLast30Days: recent ? recent.count : 0, dailyClicks: daily };
  });

  res.json({ referrals, days });
});

router.post("/", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const destinationUrl = String(req.body.destinationUrl || "").trim();

  if (!name) return res.status(400).json({ message: "Link name is required" });
  if (!/^https?:\/\//.test(destinationUrl)) {
    return res.status(400).json({ message: "Destination must start with http:// or https://" });
  }

  const wantedCode = String(req.body.code || "").trim() || name;
  const code = await findFreeCode(wantedCode);
  if (req.body.code && code !== req.body.code) {
    return res.status(400).json({ message: `The code "${req.body.code}" is taken or not allowed. Try "${code}".` });
  }

  const link = await ReferralLink.create({
    code,
    name,
    destinationUrl,
    retailer: String(req.body.retailer || ""),
    active: req.body.active === undefined ? true : Boolean(req.body.active),
  });
  res.status(201).json({ message: "Referral link created", referral: withFullUrl(link) });
});

router.put("/:id", async (req, res) => {
  const link = await ReferralLink.findById(req.params.id);
  if (!link) return res.status(404).json({ message: "Referral link not found" });

  if (req.body.active !== undefined) link.active = Boolean(req.body.active);
  if (req.body.resetClicks) {
    link.clicks = 0;
    link.lastClickedAt = null;
    await ReferralClick.deleteMany({ link: link._id });
  }

  // Product links follow the product, so their name and destination are changed on the product page.
  if (!link.product) {
    if (req.body.name !== undefined) link.name = String(req.body.name).trim() || link.name;
    if (req.body.retailer !== undefined) link.retailer = String(req.body.retailer);
    if (req.body.destinationUrl !== undefined) {
      const destinationUrl = String(req.body.destinationUrl).trim();
      if (!/^https?:\/\//.test(destinationUrl)) {
        return res.status(400).json({ message: "Destination must start with http:// or https://" });
      }
      link.destinationUrl = destinationUrl;
    }
    if (req.body.code !== undefined && req.body.code !== link.code) {
      const code = await findFreeCode(req.body.code, link._id);
      if (code !== req.body.code) {
        return res.status(400).json({ message: `The code "${req.body.code}" is taken or not allowed. Try "${code}".` });
      }
      link.code = code;
    }
  }

  await link.save();
  await link.populate("product", "name slug");
  res.json({ message: "Referral link updated", referral: withFullUrl(link) });
});

router.delete("/:id", async (req, res) => {
  const link = await ReferralLink.findById(req.params.id);
  if (!link) return res.status(404).json({ message: "Referral link not found" });
  if (link.product) {
    return res.status(400).json({ message: "This link belongs to a product. Delete or pause the product instead." });
  }

  await link.deleteOne();
  await ReferralClick.deleteMany({ link: link._id });
  res.json({ message: "Referral link deleted" });
});

module.exports = router;
