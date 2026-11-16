const express = require("express");
const Category = require("../models/Category");

const router = express.Router();

router.get("/", async (req, res) => {
  const categories = await Category.find({ active: true }).sort({ position: 1, label: 1 });
  res.json({
    categories: categories.map((category) => ({
      id: category.slug,
      label: category.label,
      image: { src: category.image.src, alt: category.image.alt || "" },
    })),
  });
});

module.exports = router;
