const express = require("express");
const Product = require("../../models/Product");
const ReferralLink = require("../../models/ReferralLink");
const ReferralClick = require("../../models/ReferralClick");
const slugify = require("../../utils/slugify");
const { syncProductReferral, referralLinkUrl } = require("../../utils/products");

const router = express.Router();

// Only take the fields the dashboard is allowed to change.
function readProductForm(body) {
  const data = {
    name: String(body.name || "").trim(),
    slug: slugify(body.slug || body.name),
    description: String(body.description || "").trim(),
    details: String(body.details || "").trim(),
    price: { amount: Number(body.price?.amount ?? body.price), currency: "USD" },
    retailer: body.retailer === "temu" ? "temu" : "amazon",
    affiliateUrl: String(body.affiliateUrl || "").trim(),
    badge: String(body.badge || "").trim(),
    audiences: Array.isArray(body.audiences) ? body.audiences : [],
    categories: Array.isArray(body.categories) ? body.categories : [],
    image: { src: String(body.image?.src || "").trim(), alt: String(body.image?.alt || "").trim() },
    altImage: { src: String(body.altImage?.src || "").trim(), alt: String(body.altImage?.alt || "").trim() },
    video: { src: String(body.video?.src || "").trim() },
    trending: Boolean(body.trending),
    active: body.active === undefined ? true : Boolean(body.active),
    isSampleData: Boolean(body.isSampleData),
  };
  return data;
}

function checkProductForm(data) {
  if (!data.name) return "Product name is required";
  if (!data.slug) return "Product link name (slug) is required";
  if (!data.description) return "Short description is required";
  if (!Number.isFinite(data.price.amount) || data.price.amount < 0) return "Price must be a number, 0 or more";
  if (!data.image.src) return "Main image is required";
  if (!/^https?:\/\//.test(data.affiliateUrl)) return "Shop link must start with http:// or https://";
  return null;
}

async function withClicks(products) {
  const links = await ReferralLink.find({ product: { $in: products.map((product) => product._id) } });
  return products.map((product) => {
    const link = links.find((item) => String(item.product) === String(product._id));
    return {
      ...product.toObject(),
      clicks: link ? link.clicks : 0,
      referralUrl: link ? referralLinkUrl(link.code) : "",
    };
  });
}

router.get("/", async (req, res) => {
  const filter = {};
  if (req.query.search) {
    const pattern = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: pattern }, { slug: pattern }];
  }
  if (req.query.category) filter.categories = req.query.category;

  const products = await Product.find(filter).sort({ position: 1, createdAt: 1 });
  res.json({ products: await withClicks(products) });
});

router.get("/:id", async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });
  const [result] = await withClicks([product]);
  res.json({ product: result });
});

router.post("/", async (req, res) => {
  const data = readProductForm(req.body);
  const problem = checkProductForm(data);
  if (problem) return res.status(400).json({ message: problem });

  if (await Product.exists({ slug: data.slug })) {
    return res.status(400).json({ message: "Another product already uses this link name (slug)" });
  }

  // New products go to the end of the list, which also makes them show first under "newest".
  const last = await Product.findOne().sort({ position: -1 });
  data.position = last ? last.position + 1 : 1;

  const product = await Product.create(data);
  await syncProductReferral(product);
  res.status(201).json({ message: "Product created", product });
});

router.put("/:id", async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });

  const data = readProductForm(req.body);
  const problem = checkProductForm(data);
  if (problem) return res.status(400).json({ message: problem });

  if (await Product.exists({ slug: data.slug, _id: { $ne: product._id } })) {
    return res.status(400).json({ message: "Another product already uses this link name (slug)" });
  }

  product.set(data);
  await product.save();
  await syncProductReferral(product);
  res.json({ message: "Product updated", product });
});

// Quick on/off changes from the products list.
router.patch("/:id", async (req, res) => {
  const changes = {};
  if (req.body.active !== undefined) changes.active = Boolean(req.body.active);
  if (req.body.trending !== undefined) changes.trending = Boolean(req.body.trending);
  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ message: "Nothing to change" });
  }

  const product = await Product.findByIdAndUpdate(req.params.id, changes, { returnDocument: "after" });
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json({ message: "Product updated", product });
});

function countText(count) {
  return `${count} ${count === 1 ? "product" : "products"}`;
}

const bulkActions = {
  show: { active: true },
  hide: { active: false },
  trend: { trending: true },
  untrend: { trending: false },
};

router.post("/bulk", async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 500) : [];
  const action = req.body.action;
  if (ids.length === 0) return res.status(400).json({ message: "No products picked" });

  if (action === "delete") {
    const result = await Product.deleteMany({ _id: { $in: ids } });
    await ReferralLink.deleteMany({ product: { $in: ids } });
    await ReferralClick.deleteMany({ product: { $in: ids } });
    return res.json({ message: `${countText(result.deletedCount)} deleted`, count: result.deletedCount });
  }

  if (!bulkActions[action]) return res.status(400).json({ message: "Unknown action" });
  const result = await Product.updateMany({ _id: { $in: ids } }, bulkActions[action]);
  res.json({ message: `${countText(result.modifiedCount)} updated`, count: result.modifiedCount });
});

router.delete("/:id", async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });

  await ReferralLink.deleteMany({ product: product._id });
  await ReferralClick.deleteMany({ product: product._id });
  res.json({ message: "Product deleted" });
});

module.exports = router;
