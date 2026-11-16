const express = require("express");
const NewsletterSubscriber = require("../../models/NewsletterSubscriber");

const router = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function listFilter(status) {
  if (status === "subscribed") return { subscribed: true };
  if (status === "unsubscribed") return { subscribed: false };
  return {};
}

// Spreadsheet apps run cells that start with these characters as formulas, so we make them plain text.
function safeCell(value) {
  const text = String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function countText(count) {
  return `${count} ${count === 1 ? "subscriber" : "subscribers"}`;
}

router.get("/", async (req, res) => {
  const subscribers = await NewsletterSubscriber.find(listFilter(req.query.status)).sort({ createdAt: -1 });
  res.json({ subscribers });
});

router.get("/export", async (req, res) => {
  const subscribers = await NewsletterSubscriber.find(listFilter(req.query.status || "subscribed")).sort({ createdAt: -1 });
  const rows = [["email", "source", "subscribed", "joined"]];
  subscribers.forEach((item) => {
    rows.push([item.email, item.source, item.subscribed ? "yes" : "no", item.createdAt.toISOString()]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${safeCell(cell).replace(/"/g, '""')}"`).join(",")).join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=newsletter-subscribers.csv");
  res.send(csv);
});

// Lets the admin add someone by hand, for example after they asked in person.
router.post("/", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!emailPattern.test(email)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  const existing = await NewsletterSubscriber.findOne({ email });
  if (existing && existing.subscribed) {
    return res.status(400).json({ message: `${email} is already subscribed.` });
  }

  if (existing) {
    existing.subscribed = true;
    existing.unsubscribedAt = null;
    await existing.save();
    return res.json({ message: `${email} is subscribed again.`, subscriber: existing });
  }

  const subscriber = await NewsletterSubscriber.create({ email, source: "admin" });
  res.status(201).json({ message: `${email} was added.`, subscriber });
});

router.post("/bulk", async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 5000) : [];
  const action = req.body.action;
  if (ids.length === 0) return res.status(400).json({ message: "No subscribers picked" });

  if (action === "delete") {
    const result = await NewsletterSubscriber.deleteMany({ _id: { $in: ids } });
    return res.json({ message: `${countText(result.deletedCount)} removed`, count: result.deletedCount });
  }
  if (action === "unsubscribe") {
    const result = await NewsletterSubscriber.updateMany(
      { _id: { $in: ids }, subscribed: true },
      { subscribed: false, unsubscribedAt: new Date() }
    );
    return res.json({ message: `${countText(result.modifiedCount)} unsubscribed`, count: result.modifiedCount });
  }
  if (action === "subscribe") {
    const result = await NewsletterSubscriber.updateMany({ _id: { $in: ids }, subscribed: false }, { subscribed: true, unsubscribedAt: null });
    return res.json({ message: `${countText(result.modifiedCount)} subscribed again`, count: result.modifiedCount });
  }
  res.status(400).json({ message: "Unknown action" });
});

router.put("/:id", async (req, res) => {
  const subscriber = await NewsletterSubscriber.findById(req.params.id);
  if (!subscriber) return res.status(404).json({ message: "Subscriber not found" });

  subscriber.subscribed = Boolean(req.body.subscribed);
  subscriber.unsubscribedAt = subscriber.subscribed ? null : new Date();
  await subscriber.save();
  res.json({ message: "Subscriber updated", subscriber });
});

router.delete("/:id", async (req, res) => {
  const subscriber = await NewsletterSubscriber.findByIdAndDelete(req.params.id);
  if (!subscriber) return res.status(404).json({ message: "Subscriber not found" });
  res.json({ message: "Subscriber removed" });
});

module.exports = router;
