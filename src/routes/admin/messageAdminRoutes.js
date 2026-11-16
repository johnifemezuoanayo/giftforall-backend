const express = require("express");
const ContactMessage = require("../../models/ContactMessage");

const router = express.Router();

router.get("/", async (req, res) => {
  const messages = await ContactMessage.find().sort({ createdAt: -1 });
  res.json({ messages });
});

router.post("/read-all", async (req, res) => {
  const result = await ContactMessage.updateMany({ read: false }, { read: true });
  res.json({ message: `${result.modifiedCount} ${result.modifiedCount === 1 ? "message" : "messages"} marked as read`, count: result.modifiedCount });
});

router.put("/:id", async (req, res) => {
  const message = await ContactMessage.findByIdAndUpdate(req.params.id, { read: Boolean(req.body.read) }, { returnDocument: "after" });
  if (!message) return res.status(404).json({ message: "Message not found" });
  res.json({ message: "Message updated", contactMessage: message });
});

router.delete("/:id", async (req, res) => {
  const message = await ContactMessage.findByIdAndDelete(req.params.id);
  if (!message) return res.status(404).json({ message: "Message not found" });
  res.json({ message: "Message deleted" });
});

module.exports = router;
