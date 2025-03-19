const mongoose = require('mongoose');

const FacebookAdDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accountId: { type: String, required: true },
  campaignId: { type: String, required: true },
  adSetId: { type: String, required: true },
  adId: { type: String, unique: true, required: true },
  adName: { type: String, default: 'Unknown' },

  // ✅ Store Full API Response (for AI Analysis)
  adData: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });  // ✅ Automatically adds `createdAt` & `updatedAt`

module.exports = mongoose.model('FacebookAdData', FacebookAdDataSchema);
