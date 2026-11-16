const mongoose = require("mongoose");

// Site wide content saved by name, like "heroSlides" or "mainMenus".
const contentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false }
);

module.exports = mongoose.model("Content", contentSchema);
