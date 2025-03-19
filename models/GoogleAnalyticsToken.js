const mongoose = require("mongoose");

const GoogleAnalyticsTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  accessToken: {
    type: String,
    required: true
  },
  refreshToken: {
    type: String, // Refresh token for renewing access
    required: true
  },
  expiresAt: {
    type: Date, // Expiry timestamp for access token
    required: true
  },
  propertyId: {
    type: String, // Google Analytics property ID (GA4)
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model("GoogleAnalyticsToken", GoogleAnalyticsTokenSchema);
