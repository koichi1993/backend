const mongoose = require("mongoose");

const TwitterTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: false },
  expiresAt: { type: Date, required: true },
  accountId: { type: String, required: false } // Store Twitter Ad Account ID
});

module.exports = mongoose.models.TwitterToken || mongoose.model("TwitterToken", TwitterTokenSchema);

