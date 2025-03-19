const mongoose = require('mongoose');

const SquareTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  merchantId: { type: String, required: true },
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresAt: { type: Date, required: true }
});

module.exports = mongoose.model('SquareToken', SquareTokenSchema);
