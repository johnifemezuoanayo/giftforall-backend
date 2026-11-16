const express = require("express");
const mongoose = require("mongoose");
const Campaign = require("../../models/Campaign");
const NewsletterSubscriber = require("../../models/NewsletterSubscriber");
const Product = require("../../models/Product");
const ReferralClick = require("../../models/ReferralClick");
const { DAY } = require("../../utils/dates");
const { emailSettings, isEmailConfigured } = require("../../utils/mailer");
const { buildEmail, getSiteInfo, loadCampaignProducts, sendCampaign, sendOneEmail } = require("../../utils/campaigns");

const router = express.Router();
const MAX_PRODUCTS = 12;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function productSummary(product, clicks) {
  return {
    _id: product._id,
    name: product.name,
    image: product.image,
    price: product.price,
    retailer: product.retailer,
    badge: product.badge,
    active: product.active,
    clicks,
  };
}

function readCampaignForm(body) {
  const ids = Array.isArray(body.products) ? body.products : [];
  return {
    subject: String(body.subject || "").trim().slice(0, 150),
    previewText: String(body.previewText || "").trim().slice(0, 200),
    heading: String(body.heading || "").trim().slice(0, 150),
    intro: String(body.intro || "").slice(0, 5000),
    products: [...new Set(ids.map(String))].filter((id) => mongoose.isValidObjectId(id)).slice(0, MAX_PRODUCTS),
    buttonText: String(body.buttonText || "").trim().slice(0, 40),
    buttonUrl: String(body.buttonUrl || "").trim(),
  };
}

function checkCampaignForm(data) {
  if (!data.subject) return "Write a subject line.";
  if (data.buttonUrl && !/^https?:\/\/\S+$/.test(data.buttonUrl)) return "The button link must start with https://";
  return null;
}

async function clickCounts(campaignIds) {
  const rows = await ReferralClick.aggregate([
    { $match: { source: { $in: campaignIds.map((id) => `email-${id}`) } } },
    { $group: { _id: "$source", count: { $sum: 1 } } },
  ]);
  const counts = {};
  rows.forEach((row) => {
    counts[row._id.replace("email-", "")] = row.count;
  });
  return counts;
}

router.get("/settings", async (req, res) => {
  const subscribers = await NewsletterSubscriber.countDocuments({ subscribed: true });
  res.json({ ...emailSettings(), subscribers, adminEmail: req.admin.email });
});

// Ready-made product lists for the email: newest, most clicked lately, or marked as trending.
router.get("/picks", async (req, res) => {
  const limit = Math.min(MAX_PRODUCTS, Math.max(1, Number(req.query.limit) || 6));
  const type = req.query.type;

  if (type === "hottest") {
    const days = [7, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
    const rows = await ReferralClick.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - days * DAY) }, product: { $ne: null } } },
      { $group: { _id: "$product", clicks: { $sum: 1 } } },
      { $sort: { clicks: -1 } },
      { $limit: limit * 2 },
    ]);
    const products = await Product.find({ _id: { $in: rows.map((row) => row._id) }, active: true }).lean();
    const picks = rows
      .map((row) => {
        const product = products.find((item) => String(item._id) === String(row._id));
        return product ? productSummary(product, row.clicks) : null;
      })
      .filter(Boolean)
      .slice(0, limit);
    return res.json({ products: picks, days });
  }

  const filter = { active: true };
  if (type === "trending") filter.trending = true;
  const sort = type === "trending" ? { position: 1 } : { position: -1, createdAt: -1 };
  const products = await Product.find(filter).sort(sort).limit(type ? limit : 200).lean();
  res.json({ products: products.map((product) => productSummary(product)) });
});

router.post("/preview", async (req, res) => {
  const data = readCampaignForm(req.body);
  const products = await loadCampaignProducts(data.products);
  const site = await getSiteInfo();
  const { html } = buildEmail({ campaign: { ...data, subject: data.subject || "Your subject line" }, products, site, token: null, tag: "email-preview" });
  res.json({ html });
});

router.get("/", async (req, res) => {
  const campaigns = await Campaign.find().sort({ createdAt: -1 }).lean();
  const counts = await clickCounts(campaigns.map((campaign) => String(campaign._id)));
  res.json({
    campaigns: campaigns.map((campaign) => ({ ...campaign, productCount: campaign.products.length, clicks: counts[String(campaign._id)] || 0 })),
  });
});

router.get("/:id", async (req, res) => {
  const campaign = await Campaign.findById(req.params.id).lean();
  if (!campaign) return res.status(404).json({ message: "Email not found" });

  const products = await Product.find({ _id: { $in: campaign.products } }).lean();
  const counts = await clickCounts([String(campaign._id)]);
  res.json({
    campaign: {
      ...campaign,
      clicks: counts[String(campaign._id)] || 0,
      productDetails: campaign.products
        .map((id) => products.find((product) => String(product._id) === String(id)))
        .filter(Boolean)
        .map((product) => productSummary(product)),
    },
  });
});

router.post("/", async (req, res) => {
  const data = readCampaignForm(req.body);
  const problem = checkCampaignForm(data);
  if (problem) return res.status(400).json({ message: problem });
  const campaign = await Campaign.create(data);
  res.status(201).json({ message: "Draft saved", campaign });
});

router.put("/:id", async (req, res) => {
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) return res.status(404).json({ message: "Email not found" });
  if (campaign.status !== "draft") return res.status(400).json({ message: "This email was already sent, so it can't be changed. Duplicate it instead." });

  const data = readCampaignForm(req.body);
  const problem = checkCampaignForm(data);
  if (problem) return res.status(400).json({ message: problem });
  campaign.set(data);
  await campaign.save();
  res.json({ message: "Draft saved", campaign });
});

router.post("/:id/duplicate", async (req, res) => {
  const original = await Campaign.findById(req.params.id).lean();
  if (!original) return res.status(404).json({ message: "Email not found" });
  const copy = await Campaign.create({
    ...readCampaignForm(original),
    subject: `${original.subject} (copy)`.slice(0, 150),
  });
  res.status(201).json({ message: "Copy made", campaign: copy });
});

router.post("/:id/test", async (req, res) => {
  if (!isEmailConfigured()) return res.status(400).json({ message: "Email sending isn't set up yet. Add RESEND_API_KEY and EMAIL_FROM to backend/.env, then restart the backend." });
  const campaign = await Campaign.findById(req.params.id).lean();
  if (!campaign) return res.status(404).json({ message: "Email not found" });

  const to = String(req.body.email || req.admin.email || "").trim();
  if (!emailPattern.test(to)) return res.status(400).json({ message: "Enter a valid email address for the test." });

  try {
    const products = await loadCampaignProducts(campaign.products);
    const site = await getSiteInfo();
    await sendOneEmail({ to, campaign, products, site, token: null, tag: "email-test", subjectPrefix: "[Test] " });
    res.json({ message: `Test email sent to ${to}.` });
  } catch (error) {
    res.status(502).json({ message: `The email provider refused the test: ${error.message}` });
  }
});

router.post("/:id/send", async (req, res) => {
  if (!isEmailConfigured()) return res.status(400).json({ message: "Email sending isn't set up yet. Add RESEND_API_KEY and EMAIL_FROM to backend/.env, then restart the backend." });

  const draft = await Campaign.findById(req.params.id).lean();
  if (!draft) return res.status(404).json({ message: "Email not found" });
  if (draft.status !== "draft") return res.status(400).json({ message: "This email was already sent." });
  if (draft.products.length === 0 && !draft.intro.trim()) {
    return res.status(400).json({ message: "Add some products or write a message before sending." });
  }
  const subscribers = await NewsletterSubscriber.countDocuments({ subscribed: true });
  if (subscribers === 0) return res.status(400).json({ message: "Nobody is subscribed yet." });

  // Only one request can move it from draft to sending, so it can't be sent twice.
  const campaign = await Campaign.findOneAndUpdate({ _id: draft._id, status: "draft" }, { status: "sending" }, { returnDocument: "after" });
  if (!campaign) return res.status(400).json({ message: "This email is already being sent." });

  sendCampaign(campaign._id).catch(async (error) => {
    console.error("Campaign sending failed:", error);
    await Campaign.updateOne({ _id: campaign._id }, { status: "failed", error: error.message });
  });

  res.status(202).json({ message: `Sending to ${subscribers} ${subscribers === 1 ? "subscriber" : "subscribers"}.`, recipientCount: subscribers });
});

router.delete("/:id", async (req, res) => {
  const campaign = await Campaign.findById(req.params.id);
  if (!campaign) return res.status(404).json({ message: "Email not found" });
  if (campaign.status === "sending") return res.status(400).json({ message: "Wait until sending has finished." });
  await campaign.deleteOne();
  res.json({ message: "Email deleted" });
});

module.exports = router;
