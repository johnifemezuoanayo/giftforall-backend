const express = require("express");
const Product = require("../models/Product");
const Category = require("../models/Category");
const searchProducts = require("../utils/search");
const { toPublicProduct } = require("../utils/products");

const router = express.Router();

router.get("/", async (req, res) => {
  const { search, category, trending, limit } = req.query;
  const filter = { active: true };

  if (category) filter.categories = category;
  if (trending !== undefined) filter.trending = trending === "true";

  let products = await Product.find(filter).sort({ position: 1, createdAt: 1 });
  let understood = null;

  if (search && search.trim()) {
    const categories = await Category.find({ active: true });
    const result = searchProducts(search.slice(0, 200), products, categories);
    products = result.products;
    understood = result.understood;
  }

  const maxResults = Number(limit);
  if (maxResults > 0) products = products.slice(0, maxResults);

  const answer = { products: products.map(toPublicProduct) };
  if (understood) answer.understood = understood;
  res.json(answer);
});

router.get("/:slug", async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, active: true });
  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }
  res.json({ product: toPublicProduct(product) });
});

module.exports = router;
