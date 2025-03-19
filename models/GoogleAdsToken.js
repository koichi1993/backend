const mongoose = require("mongoose");

const GoogleAdsTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  customerId: { type: String, required: false } // Store Google Ads Customer ID
});

module.exports = mongoose.model("GoogleAdsToken", GoogleAdsTokenSchema);
