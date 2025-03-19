const mongoose = require("mongoose");

const FacebookTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: false },
  expiresAt: { type: Date, required: true },
  accountId: { type: String, required: false } // Store Facebook Ad Account ID
});

module.exports = mongoose.model("FacebookToken", FacebookTokenSchema);
