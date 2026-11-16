const express = require("express");
const ListingPage = require("../models/ListingPage");

const router = express.Router();

function toPublicPage(page) {
  const { _id, __v, createdAt, updatedAt, position, ...rest } = page;
  return rest;
}

router.get("/", async (req, res) => {
  const filter = {};
  if (req.query.section) filter.section = req.query.section;

  const pages = await ListingPage.find(filter).sort({ position: 1 }).lean();
  res.json({ pages: pages.map(toPublicPage) });
});

module.exports = router;
