const mongoose = require("mongoose");

const PayPalTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User" // Reference to the User model
  },
  merchantId: {
    type: String,
    required: false // Some transactions may not have a merchant ID
  },
  transactionData: {
    type: Object,  // ✅ Store the entire PayPal transaction response as JSON
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("PayPalTransaction", PayPalTransactionSchema);
