const mongoose = require('mongoose');

const SquareTransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  transactions: [
    {
      id: { type: String, required: true },
      amount: { type: Number, required: true },
      currency: { type: String, required: true },
      status: { type: String, required: true },
      createdAt: { type: Date, required: true },
      sourceType: { type: String }
    }
  ]
});

module.exports = mongoose.model('SquareTransaction', SquareTransactionSchema);
