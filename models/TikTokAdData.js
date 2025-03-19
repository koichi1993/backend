const mongoose = require('mongoose');

const TikTokAdDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  advertiserId: { type: String, required: true },
  campaignId: { type: String, required: true },
  adGroupId: { type: String, required: true },
  adId: { type: String, unique: true, required: true },

  // ✅ Store Full API Response (for AI Analysis)
  adData: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });  // ✅ Automatically adds `createdAt` & `updatedAt`

module.exports = mongoose.model('TikTokAdData', TikTokAdDataSchema);
