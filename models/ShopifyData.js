const mongoose = require('mongoose');

const ShopifyDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // 🛒 Orders
  orders: [{
    id: String,
    total_price: Number,
    currency: String,
    status: String,
    created_at: Date
  }],

  // 👥 Customers
  customers: [{
    id: String,
    email: String,
    total_spent: Number,
    orders_count: Number,
    created_at: Date
  }],

  // 🛍️ Products
  products: [{
    id: String,
    title: String,
    vendor: String,
    price: Number,
    created_at: Date
  }],

  // 📉 Abandoned Checkouts
  abandoned_checkouts: [{
    id: String,
    total_price: Number,
    currency: String,
    created_at: Date
  }],

  // 💰 Transactions
  transactions: [{
    order_id: String,
    transactions: [{
      id: String,
      amount: Number,
      currency: String,
      status: String,
      created_at: Date
    }]
  }],

  // 🎟️ Discounts
  discounts: [{
    id: String,
    title: String,
    value: String,
    created_at: Date
  }],

  // 📣 Marketing Events
  marketing_events: [{
    id: String,
    name: String,
    event_type: String,
    created_at: Date
  }]
});

module.exports = mongoose.model('ShopifyData', ShopifyDataSchema);
