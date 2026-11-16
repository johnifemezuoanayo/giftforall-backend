const express = require("express");
const Category = require("../../models/Category");
const Product = require("../../models/Product");
const ListingPage = require("../../models/ListingPage");
const slugify = require("../../utils/slugify");

const router = express.Router();

function readCategoryForm(body) {
  return {
    label: String(body.label || "").trim(),
    slug: slugify(body.slug || body.label),
    image: { src: String(body.image?.src || "").trim(), alt: String(body.image?.alt || "").trim() },
    active: body.active === undefined ? true : Boolean(body.active),
  };
}

router.get("/", async (req, res) => {
  const categories = await Category.find().sort({ position: 1, label: 1 }).lean();
  const counts = await Product.aggregate([{ $unwind: "$categories" }, { $group: { _id: "$categories", count: { $sum: 1 } } }]);

  res.json({
    categories: categories.map((category) => {
      const found = counts.find((item) => item._id === category.slug);
      return { ...category, productCount: found ? found.count : 0 };
    }),
  });
});

router.post("/", async (req, res) => {
  const data = readCategoryForm(req.body);
  if (!data.label) return res.status(400).json({ message: "Category name is required" });
  if (!data.slug) return res.status(400).json({ message: "Category link name (slug) is required" });
  if (await Category.exists({ slug: data.slug })) {
    return res.status(400).json({ message: "A category with this link name already exists" });
  }

  const last = await Category.findOne().sort({ position: -1 });
  data.position = last ? last.position + 1 : 1;

  const category = await Category.create(data);
  res.status(201).json({ message: "Category created", category });
});

router.put("/:id", async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) return res.status(404).json({ message: "Category not found" });

  const data = readCategoryForm(req.body);
  if (!data.label) return res.status(400).json({ message: "Category name is required" });
  if (await Category.exists({ slug: data.slug, _id: { $ne: category._id } })) {
    return res.status(400).json({ message: "A category with this link name already exists" });
  }

  const oldSlug = category.slug;
  category.set(data);
  await category.save();

  // Keep products and pages pointing at the renamed category.
  if (oldSlug !== category.slug) {
    await Product.updateMany({ categories: oldSlug }, { $set: { "categories.$": category.slug } });
    await ListingPage.updateMany({ interests: oldSlug }, { $set: { "interests.$": category.slug } });
  }

  res.json({ message: "Category updated", category });
});

router.delete("/:id", async (req, res) => {
  const category = await Category.findByIdAndDelete(req.params.id);
  if (!category) return res.status(404).json({ message: "Category not found" });

  await Product.updateMany({}, { $pull: { categories: category.slug } });
  await ListingPage.updateMany({}, { $pull: { interests: category.slug } });
  res.json({ message: "Category deleted" });
});

module.exports = router;
