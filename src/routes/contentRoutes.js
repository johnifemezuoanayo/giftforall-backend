const express = require("express");
const Content = require("../models/Content");

const router = express.Router();

router.get("/", async (req, res) => {
  const items = await Content.find().lean();
  const content = {};
  items.forEach((item) => {
    content[item.key] = item.value;
  });
  res.json({ content });
});

module.exports = router;
