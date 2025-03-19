const mongoose = require("mongoose");

const StripeTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User"
  },
  stripeUserId: {
    type: String,
    required: true
  },
  transactionData: {
    type: Object, // ✅ Store the full transaction object from Stripe
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("StripeTransaction", StripeTransactionSchema);

