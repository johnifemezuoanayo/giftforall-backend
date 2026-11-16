const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });

const mongoose = require("mongoose");
const connectDatabase = require("../config/db");
const Product = require("../models/Product");
const Category = require("../models/Category");
const ListingPage = require("../models/ListingPage");
const Content = require("../models/Content");
const ReferralLink = require("../models/ReferralLink");
const ReferralClick = require("../models/ReferralClick");
const { syncProductReferral } = require("../utils/products");
const seedData = require("./seed-data.json");

// Fills the database with the starter products, categories, pages and site content.
// Newsletter subscribers, contact messages and custom referral links are kept.
async function seed() {
  await connectDatabase();

  await Product.deleteMany({});
  await ReferralLink.deleteMany({ product: { $ne: null } });
  await ReferralClick.deleteMany({ product: { $ne: null } });
  await Category.deleteMany({});
  await ListingPage.deleteMany({});
  await Content.deleteMany({});

  await Category.create(seedData.categories);
  await ListingPage.create(seedData.pages);
  await Content.create(Object.entries(seedData.content).map(([key, value]) => ({ key, value })));

  const products = await Product.create(seedData.products);
  for (const product of products) {
    await syncProductReferral(product);
  }

  console.log(
    `Added ${products.length} products, ${seedData.categories.length} categories, ` +
      `${seedData.pages.length} pages and ${Object.keys(seedData.content).length} content items.`
  );
  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error("Seeding failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
