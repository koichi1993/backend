const mongoose = require("mongoose");

const PayPalTokenSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, default: null }, // Can be null if not issued
  expiresAt: { type: Number, required: true }, // Expiry time in milliseconds
  merchantId: { type: String, default: null }
});

module.exports = mongoose.model("PayPalToken", PayPalTokenSchema);
