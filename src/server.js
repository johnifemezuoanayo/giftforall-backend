const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

const express = require("express");
const cors = require("cors");
const connectDatabase = require("./config/db");
const requireAdmin = require("./middleware/requireAdmin");
const refreshSiteAfterChange = require("./middleware/refreshSiteAfterChange");
const limitRequests = require("./middleware/limitRequests");

const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const pageRoutes = require("./routes/pageRoutes");
const contentRoutes = require("./routes/contentRoutes");
const newsletterRoutes = require("./routes/newsletterRoutes");
const contactRoutes = require("./routes/contactRoutes");
const referralRoutes = require("./routes/referralRoutes");
const unsubscribeRoutes = require("./routes/unsubscribeRoutes");

const authRoutes = require("./routes/admin/authRoutes");
const productAdminRoutes = require("./routes/admin/productAdminRoutes");
const categoryAdminRoutes = require("./routes/admin/categoryAdminRoutes");
const referralAdminRoutes = require("./routes/admin/referralAdminRoutes");
const newsletterAdminRoutes = require("./routes/admin/newsletterAdminRoutes");
const messageAdminRoutes = require("./routes/admin/messageAdminRoutes");
const pageAdminRoutes = require("./routes/admin/pageAdminRoutes");
const contentAdminRoutes = require("./routes/admin/contentAdminRoutes");
const statsRoutes = require("./routes/admin/statsRoutes");
const uploadRoutes = require("./routes/admin/uploadRoutes");
const campaignRoutes = require("./routes/admin/campaignRoutes");
const { ensureUnsubscribeTokens, markInterruptedCampaigns } = require("./utils/campaigns");

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is missing. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const app = express();
const port = process.env.PORT || 5000;
const uploadsFolder = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsFolder, { recursive: true });

// Needed behind a hosting proxy, so each visitor is counted by their own address.
if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

const loginLimit = limitRequests(10, 15, "Too many login attempts. Please wait 15 minutes and try again.");
const newsletterLimit = limitRequests(10, 60, "Too many sign-ups from this device. Please try again later.");
const contactLimit = limitRequests(5, 60, "You've sent a few messages already. Please try again in an hour.");

const allowedOrigins = [process.env.SITE_URL, process.env.DASHBOARD_URL].filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static(uploadsFolder));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/pages", pageRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/newsletter", newsletterLimit, newsletterRoutes);
app.use("/api/contact", contactLimit, contactRoutes);
app.use("/go", referralRoutes);
app.use("/unsubscribe", express.urlencoded({ extended: false }), unsubscribeRoutes);

app.use("/api/admin/login", loginLimit);
app.use("/api/admin", authRoutes);
app.use("/api/admin", requireAdmin, refreshSiteAfterChange);
app.use("/api/admin/products", productAdminRoutes);
app.use("/api/admin/categories", categoryAdminRoutes);
app.use("/api/admin/referrals", referralAdminRoutes);
app.use("/api/admin/newsletter", newsletterAdminRoutes);
app.use("/api/admin/messages", messageAdminRoutes);
app.use("/api/admin/pages", pageAdminRoutes);
app.use("/api/admin/content", contentAdminRoutes);
app.use("/api/admin/stats", statsRoutes);
app.use("/api/admin/uploads", uploadRoutes);
app.use("/api/admin/campaigns", campaignRoutes);

app.use((req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ message: error.message });
  }
  if (error.code === 11000) {
    return res.status(400).json({ message: "This already exists" });
  }
  res.status(500).json({ message: "Something went wrong on the server" });
});

connectDatabase()
  .then(async () => {
    await markInterruptedCampaigns();
    await ensureUnsubscribeTokens();
    app.listen(port, () => {
      console.log(`Backend running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Could not connect to MongoDB:", error.message);
    process.exit(1);
  });
