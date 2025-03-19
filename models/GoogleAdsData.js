const mongoose = require('mongoose');

const GoogleAdsDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerId: { type: String, required: true }, // Google Ads Customer ID
  campaignId: { type: String, required: true }, // Campaign ID
  adGroupId: { type: String, required: true }, // Ad Group ID
  adId: { type: String, unique: true, required: true }, // Unique Ad ID

  // ✅ Store Full API Response (for AI Analysis)
  adData: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });  // ✅ Automatically adds `createdAt` & `updatedAt`

// ✅ Ensure `updatedAt` is refreshed on updates
GoogleAdsDataSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('GoogleAdsData', GoogleAdsDataSchema);
