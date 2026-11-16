const express = require("express");
const ListingPage = require("../../models/ListingPage");
const Product = require("../../models/Product");
const slugify = require("../../utils/slugify");
const { productsForRule } = require("../../utils/productRules");

const router = express.Router();
const sections = ["gifts", "occasions", "discover", "unique-finds"];
const audiences = ["men", "women", "kids", "couples", "everyone"];

function textList(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

// Keeps only the rule settings the website understands.
function readRule(rule = {}) {
  const clean = {};
  const ruleAudiences = textList(rule.audiences).filter((item) => audiences.includes(item));
  if (ruleAudiences.length) clean.audiences = ruleAudiences;
  const interests = textList(rule.interests);
  if (interests.length) clean.interests = interests;
  const ids = textList(rule.ids);
  if (ids.length) clean.ids = ids;
  const maxPrice = Number(rule.maxPrice);
  if (rule.maxPrice !== undefined && rule.maxPrice !== null && rule.maxPrice !== "" && Number.isFinite(maxPrice) && maxPrice > 0) {
    clean.maxPrice = maxPrice;
  }
  if (rule.trending) clean.trending = true;
  if (rule.sort === "featured" || rule.sort === "newest") clean.sort = rule.sort;
  return clean;
}

// The header intro is a list of plain text pieces and { label, href } links.
function readIntro(intro) {
  if (!Array.isArray(intro)) return [];
  return intro
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && part.label && part.href) return { label: String(part.label), href: String(part.href) };
      return null;
    })
    .filter((part) => part !== null && part !== "");
}

function readPageForm(body) {
  const feature = body.feature || {};
  const data = {
    section: sections.includes(body.section) ? body.section : "",
    slug: body.slug ? slugify(body.slug) : "",
    label: String(body.label || "").trim(),
    title: String(body.title || "").trim(),
    tagline: String(body.tagline || "").trim(),
    about: String(body.about || "").trim(),
    rule: readRule(body.rule),
    interests: textList(body.interests),
    related: textList(body.related),
    guideId: String(body.guideId || ""),
    feature: {
      headline: String(feature.headline || "").trim(),
      highlight: String(feature.highlight || "").trim(),
      updated: String(feature.updated || "").trim(),
      image: { src: String(feature.image?.src || "").trim(), alt: String(feature.image?.alt || "").trim() },
      intro: readIntro(feature.intro),
    },
  };
  ["metaTitle", "gridTitle", "picksTitle"].forEach((field) => {
    const value = String(body[field] || "").trim();
    data[field] = value || undefined;
  });
  return data;
}

function checkPageForm(data) {
  if (!data.section) return "Pick which part of the site this page belongs to.";
  if (!data.label) return "Give the page a short menu name.";
  if (!data.title) return "Give the page a title.";
  if (!data.feature.headline) return "Write a headline for the top of the page.";
  if (!data.feature.image.src) return "Add a header photo. The page can't show without one.";
  return null;
}

async function activeProducts() {
  return Product.find({ active: true }).sort({ position: 1, createdAt: 1 }).lean();
}

function productSummary(product) {
  return { _id: product._id, slug: product.slug, name: product.name, image: product.image, price: product.price };
}

router.get("/", async (req, res) => {
  const filter = req.query.section ? { section: req.query.section } : {};
  const [pages, products] = await Promise.all([ListingPage.find(filter).sort({ position: 1 }).lean(), activeProducts()]);
  res.json({
    pages: pages.map((page) => ({ ...page, productCount: productsForRule(products, page.rule || {}).length })),
  });
});

// Shows which products a rule would pick, while the rule is still being edited.
router.post("/match", async (req, res) => {
  const products = await activeProducts();
  const matches = productsForRule(products, readRule(req.body.rule));
  res.json({ count: matches.length, sample: matches.slice(0, 8).map(productSummary) });
});

router.get("/:id", async (req, res) => {
  const page = await ListingPage.findById(req.params.id);
  if (!page) return res.status(404).json({ message: "Page not found" });
  res.json({ page });
});

router.post("/", async (req, res) => {
  const data = readPageForm(req.body);
  const problem = checkPageForm(data);
  if (problem) return res.status(400).json({ message: problem });
  if (await ListingPage.exists({ section: data.section, slug: data.slug })) {
    return res.status(400).json({ message: "A page with this web address already exists. Pick another link name." });
  }

  const last = await ListingPage.findOne().sort({ position: -1 });
  data.position = last ? last.position + 1 : 1;

  const page = await ListingPage.create(data);
  res.status(201).json({ message: "Page created", page });
});

router.put("/:id", async (req, res) => {
  const page = await ListingPage.findById(req.params.id);
  if (!page) return res.status(404).json({ message: "Page not found" });

  const data = readPageForm(req.body);
  const problem = checkPageForm(data);
  if (problem) return res.status(400).json({ message: problem });
  if (await ListingPage.exists({ section: data.section, slug: data.slug, _id: { $ne: page._id } })) {
    return res.status(400).json({ message: "A page with this web address already exists. Pick another link name." });
  }

  page.set(data);
  ["metaTitle", "gridTitle", "picksTitle"].forEach((field) => {
    if (data[field] === undefined) page.set(field, undefined);
  });
  page.markModified("rule");
  page.markModified("feature");
  await page.save();
  res.json({ message: "Page updated", page });
});

router.delete("/:id", async (req, res) => {
  const page = await ListingPage.findByIdAndDelete(req.params.id);
  if (!page) return res.status(404).json({ message: "Page not found" });
  res.json({ message: "Page deleted" });
});

module.exports = router;
