const express = require("express");
const Content = require("../../models/Content");

const router = express.Router();

router.get("/", async (req, res) => {
  const items = await Content.find().sort({ key: 1 });
  res.json({ items });
});

router.put("/:key", async (req, res) => {
  if (req.body.value === undefined) {
    return res.status(400).json({ message: "Content value is required" });
  }

  let item = await Content.findOne({ key: req.params.key });
  if (item) {
    item.value = req.body.value;
    item.markModified("value");
    await item.save();
  } else {
    item = await Content.create({ key: req.params.key, value: req.body.value });
  }
  res.json({ message: "Content saved", item });
});

module.exports = router;
