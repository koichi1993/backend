const mongoose = require('mongoose');

const GoogleAnalyticsDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  firstUserSource: { type: String },
  sessionSource: { type: String },
  country: { type: String },
  city: { type: String },
  deviceCategory: { type: String },
  browser: { type: String },
  manualSource: { type: String },
  medium: { type: String },
  activeUsers: { type: Number, default: 0 },
  newUsers: { type: Number, default: 0 },
  sessions: { type: Number, default: 0 },
  bounceRate: { type: Number, default: 0 },
  sessionDuration: { type: Number, default: 0 },
  transactions: { type: Number, default: 0 },
  purchaseRevenue: { type: Number, default: 0 },
  engagementRate: { type: Number, default: 0 },
  ecommercePurchases: { type: Number, default: 0 },
  averageRevenuePerUser: { type: Number, default: 0 }
},{ timestamps: true });

// ✅ Ensure `updatedAt` is refreshed on updates
GoogleAnalyticsDataSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('GoogleAnalyticsData', GoogleAnalyticsDataSchema);
