const mongoose = require('mongoose');

const TwitterAdDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountId: { type: String, required: true }, // Twitter Ads account ID
  campaignId: { type: String, required: true }, // Campaign ID
  adId: { type: String, unique: true, required: true }, // Unique Ad ID
  adData: { type: Object, required: true }, // Store full Twitter API response
}, { timestamps: true });

const TwitterAdData = mongoose.model('TwitterAdData', TwitterAdDataSchema);

module.exports = TwitterAdData;
