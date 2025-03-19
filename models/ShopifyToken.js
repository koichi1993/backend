const mongoose = require('mongoose');

const ShopifyTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  shop: { type: String, required: true },
  accessToken: { type: String, required: true }
});

module.exports = mongoose.model('ShopifyToken', ShopifyTokenSchema);
