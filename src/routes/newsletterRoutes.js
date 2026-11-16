const express = require("express");
const NewsletterSubscriber = require("../models/NewsletterSubscriber");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.post("/subscribe", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const source = String(req.body.source || "website").slice(0, 50);

  if (!emailPattern.test(email)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  let subscriber = await NewsletterSubscriber.findOne({ email });
  if (subscriber && subscriber.subscribed) {
    return res.json({ message: "You're already on the list." });
  }

  if (subscriber) {
    subscriber.subscribed = true;
    subscriber.unsubscribedAt = null;
    subscriber.source = source;
    await subscriber.save();
  } else {
    subscriber = await NewsletterSubscriber.create({ email, source });
  }

  res.status(201).json({ message: "Subscribed successfully" });
});

router.post("/unsubscribe", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const subscriber = await NewsletterSubscriber.findOne({ email });

  if (subscriber && subscriber.subscribed) {
    subscriber.subscribed = false;
    subscriber.unsubscribedAt = new Date();
    await subscriber.save();
  }

  // Same answer either way, so nobody can check which emails are on the list.
  res.json({ message: "You have been unsubscribed." });
});

module.exports = router;
