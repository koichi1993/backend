const mongoose = require('mongoose');

const LinkedInAdDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountId: { type: String, required: true }, // LinkedIn Ad Account ID
  campaignId: { type: String, required: true }, // Campaign ID
  adId: { type: String, required: true, unique: true }, // Unique Ad ID
  adData: { type: Object, required: true }, // Store full LinkedIn Ads API response
}, { timestamps: true }); // ✅ Adds createdAt & updatedAt automatically

const LinkedInAdData = mongoose.model('LinkedInAdData', LinkedInAdDataSchema);
module.exports = LinkedInAdData;
