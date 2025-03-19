const mongoose = require("mongoose");

const LinkedInTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: false },
  expiresAt: { type: Date, required: true },
  accountId: { type: String, required: false } // Store LinkedIn Ad Account ID
});

module.exports = mongoose.model("LinkedInToken", LinkedInTokenSchema);
