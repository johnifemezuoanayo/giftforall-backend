const express = require("express");
const Product = require("../../models/Product");
const Category = require("../../models/Category");
const ReferralLink = require("../../models/ReferralLink");
const ReferralClick = require("../../models/ReferralClick");
const NewsletterSubscriber = require("../../models/NewsletterSubscriber");
const ContactMessage = require("../../models/ContactMessage");
const ListingPage = require("../../models/ListingPage");

const { DAY, readTimeZone, lastDays } = require("../../utils/dates");

const router = express.Router();
const allowedRanges = [7, 30, 90];

// One entry per day, oldest first, with 0 for days that had nothing.
async function countPerDay(Model, filter, start, days, timeZone) {
  const rows = await Model.aggregate([
    { $match: { ...filter, createdAt: { $gte: start } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: timeZone } }, count: { $sum: 1 } } },
  ]);

  return lastDays(days, timeZone).map((date) => {
    const row = rows.find((item) => item._id === date);
    return { date, count: row ? row.count : 0 };
  });
}

// Small counts for the side menu.
router.get("/badges", async (req, res) => {
  const unreadMessages = await ContactMessage.countDocuments({ read: false });
  res.json({ unreadMessages });
});

router.get("/", async (req, res) => {
  const days =allowedRanges.includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const timeZone = readTimeZone(req.query.tz);
  const now = Date.now();
  const start = new Date(now - days * DAY);
  const previousStart = new Date(now - 2 * days * DAY);
  const inRange = { createdAt: { $gte: start } };
  const inPreviousRange = { createdAt: { $gte: previousStart, $lt: start } };

  const [
    products,
    activeProducts,
    productsWithoutCategories,
    samplePriceProducts,
    categories,
    usedCategories,
    pages,
    subscribers,
    unreadMessages,
    pausedLinks,
    clicks,
    previousClicks,
    newSubscribers,
    previousNewSubscribers,
    dailyClicks,
    dailySubscribers,
    clicksByShop,
    topLinkRows,
    latestSubscribers,
    latestMessages,
  ] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ active: true }),
    Product.countDocuments({ active: true, categories: { $size: 0 } }),
    Product.countDocuments({ active: true, isSampleData: true }),
    Category.find({ active: true }).select("slug label"),
    Product.distinct("categories", { active: true }),
    ListingPage.countDocuments(),
    NewsletterSubscriber.countDocuments({ subscribed: true }),
    ContactMessage.countDocuments({ read: false }),
    ReferralLink.countDocuments({ active: false }),
    ReferralClick.countDocuments(inRange),
    ReferralClick.countDocuments(inPreviousRange),
    NewsletterSubscriber.countDocuments({ ...inRange, subscribed: true }),
    NewsletterSubscriber.countDocuments({ ...inPreviousRange, subscribed: true }),
    countPerDay(ReferralClick, {}, start, days, timeZone),
    countPerDay(NewsletterSubscriber, { subscribed: true }, start, days, timeZone),
    ReferralClick.aggregate([
      { $match: inRange },
      { $group: { _id: { $cond: [{ $eq: ["$product", null] }, "own", "$retailer"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ReferralClick.aggregate([
      { $match: inRange },
      { $group: { _id: "$link", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 6 },
    ]),
    NewsletterSubscriber.find({ subscribed: true }).sort({ createdAt: -1 }).limit(5).select("email source createdAt"),
    ContactMessage.find().sort({ read: 1, createdAt: -1 }).limit(4).select("name email reason message read createdAt"),
  ]);

  const links = await ReferralLink.find({ _id: { $in: topLinkRows.map((row) => row._id) } }).populate("product", "name image");
  const topLinks = topLinkRows
    .map((row) => {
      const link = links.find((item) => String(item._id) === String(row._id));
      if (!link) return null;
      return {
        id: link._id,
        name: link.product ? link.product.name : link.name,
        code: link.code,
        productId: link.product ? link.product._id : null,
        image: link.product ? link.product.image.src : "",
        clicks: row.count,
      };
    })
    .filter(Boolean);

  const emptyCategories = categories.filter((category) => !usedCategories.includes(category.slug));

  res.json({
    range: { days, from: start, to: new Date(now), timeZone },
    totals: {
      products,
      activeProducts,
      hiddenProducts: products - activeProducts,
      categories: categories.length,
      pages,
      subscribers,
      unreadMessages,
    },
    clicks: { total: clicks, previous: previousClicks, daily: dailyClicks },
    subscribers: { total: newSubscribers, previous: previousNewSubscribers, daily: dailySubscribers },
    clicksByShop: clicksByShop.map((row) => ({ shop: row._id || "other", clicks: row.count })),
    topLinks,
    attention: {
      unreadMessages,
      hiddenProducts: products - activeProducts,
      productsWithoutCategories,
      samplePriceProducts,
      emptyCategories: emptyCategories.map((category) => category.label),
      pausedLinks,
    },
    latestSubscribers,
    latestMessages,
  });
});

module.exports = router;
