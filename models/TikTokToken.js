const mongoose = require("mongoose");

const TwitterTokenSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // Changed from `ObjectId` to `String`
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: false },
  expiresAt: { type: Date, required: true },
  accountId: { type: String, required: false } // Store Twitter Ad Account ID
});

module.exports = mongoose.model("TwitterToken", TwitterTokenSchema);
