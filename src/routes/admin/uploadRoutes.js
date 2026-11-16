const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");

const router = express.Router();
const allowedTypes = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "video/mp4": ".mp4" };

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, "../../uploads"),
    filename: (req, file, done) => done(null, crypto.randomUUID() + allowedTypes[file.mimetype]),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, done) => done(null, Boolean(allowedTypes[file.mimetype])),
});

router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Please choose a JPG, PNG, WEBP, GIF or MP4 file" });
  }
  const publicUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;
  res.status(201).json({ url: `${publicUrl}/uploads/${req.file.filename}` });
});

module.exports = router;
