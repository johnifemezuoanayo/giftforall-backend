const express = require("express");
const ContactMessage = require("../models/ContactMessage");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const reasons = ["question", "problem", "suggestion", "partnership"];

router.post("/", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim();
  const message = String(req.body.message || "").trim();
  const reason = reasons.includes(req.body.reason) ? req.body.reason : "question";

  if (!name) return res.status(400).json({ message: "Please tell us your name." });
  if (!emailPattern.test(email)) return res.status(400).json({ message: "Please enter a valid email address." });
  if (message.length < 10) return res.status(400).json({ message: "Please write a little more (at least 10 characters)." });
  if (message.length > 5000) return res.status(400).json({ message: "Your message is too long." });

  await ContactMessage.create({ reason, name: name.slice(0, 120), email, message });
  res.status(201).json({ message: "Message sent" });
});

module.exports = router;
