const express = require("express");
const jwt = require("jsonwebtoken");
const requireAdmin = require("../../middleware/requireAdmin");

const router = express.Router();

router.post("/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const rightEmail = String(process.env.ADMIN_EMAIL || "").toLowerCase();
  const rightPassword = String(process.env.ADMIN_PASSWORD || "");

  if (!rightEmail || !rightPassword || email !== rightEmail || password !== rightPassword) {
    return res.status(401).json({ message: "Wrong email or password" });
  }

  const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, admin: { email } });
});

router.get("/me", requireAdmin, (req, res) => {
  res.json({ admin: { email: req.admin.email } });
});

module.exports = router;
