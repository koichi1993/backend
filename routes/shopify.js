const express = require('express');
const axios = require('axios');
const { verifyToken } = require('../middlewares/auth');
const ShopifyToken = require('../models/ShopifyToken');
const ShopifyData = require('../models/ShopifyData');
const jwt = require("jsonwebtoken");

const router = express.Router();

const User = require("../models/User");

// Shopify OAuth URL
/*router.get('/auth', verifyToken, async (req, res) => {
  const shop = req.query.shop;
  if (!shop) return res.status(400).json({ error: 'Shop parameter is required' });

  const authUrl = `https://${shop}.myshopify.com/admin/oauth/authorize?client_id=${process.env.SHOPIFY_CLIENT_ID}&scope=read_orders,read_products&redirect_uri=${process.env.SHOPIFY_REDIRECT_URI}`;
  res.json({ authUrl });
});

// Shopify OAuth Callback
router.get('/callback', async (req, res) => {
  try {
    const { shop, code } = req.query;
    if (!shop || !code) return res.status(400).json({ error: 'Missing required parameters' });

    const shopName = shop.replace(/\.myshopify\.com$/, ''); // Ensure correct format

const { data } = await axios.post(`https://${shopName}.myshopify.com/admin/oauth/access_token`, {
  client_id: process.env.SHOPIFY_CLIENT_ID,
  client_secret: process.env.SHOPIFY_CLIENT_SECRET,
  code
});


    await ShopifyToken.findOneAndUpdate(
      { userId: req.user.id },
      { shop, accessToken: data.access_token },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Shopify connected successfully' });

  } catch (error) {
    console.error('Shopify OAuth Error:', error);
    res.status(500).json({ error: 'Failed to authenticate Shopify store' });
  }
});*/

router.get('/auth', async (req, res) => {
  const token = req.query.token; // ✅ Extract token from query params
  const shop = req.query.shop; // ✅ Extract shop from query params

  if (!shop) {
    return res.status(400).json({ error: 'Shop parameter is required' });
  }

  let userId = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.id;  // ✅ Extract user ID if token is valid
    } catch (err) {
      console.error("❌ Invalid token:", err.message);
    }
  }

  const state = userId || Math.random().toString(36).substring(7); // ✅ Use userId if available, else random state

  try {
    const authUrl = `https://${shop}.myshopify.com/admin/oauth/authorize?client_id=${process.env.SHOPIFY_CLIENT_ID}&scope=read_orders,read_products,read_customers,read_checkouts,read_marketing_events,read_discounts,read_analytics,read_price_rules&redirect_uri=${process.env.SHOPIFY_REDIRECT_URI}&state=${state}`;

    console.log("🔹 Shopify OAuth state:", state);
    res.redirect(authUrl);
  } catch (error) {
    console.error("❌ Error in Shopify OAuth Authentication:", error);
    if (!res.headersSent) { // ✅ Prevents sending response twice
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
});


router.get('/callback', async (req, res) => {
  try {
    const { shop, code, state } = req.query;

    if (!shop || !code || !state) {
      console.error("❌ Missing required parameters:", { shop, code, state });
      return res.status(400).json({ error: 'Invalid authorization request' });
    }

    console.log("✅ Shopify Callback Received:", { shop, state });

    // ✅ Validate user before storing Shopify token
    const user = await User.findById(state);
    if (!user) {
      console.error("❌ User not found for state:", state);
      return res.status(404).json({ error: "User not found" });
    }

    const userId = user._id; // ✅ Get verified MongoDB ID

    const shopName = shop.replace(/\.myshopify\.com$/, ''); 

    // ✅ Exchange Authorization Code for Access Token
    const { data } = await axios.post(`https://${shopName}.myshopify.com/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code
    });

    console.log("✅ Shopify Access Token:", data.access_token);

    // ✅ Store the Shopify access token and link it to the correct user
    const savedToken = await ShopifyToken.findOneAndUpdate(
      { userId },  
      { shop, accessToken: data.access_token },
      { upsert: true, new: true }
    );

    if (!savedToken) {
      console.error("❌ Failed to save token in MongoDB");
      return res.status(500).json({ error: 'Failed to store token' });
    }

    console.log("✅ Token saved successfully in MongoDB:", savedToken);

    // ✅ Mark Shopify as an authenticated platform
    await User.findByIdAndUpdate(userId, {
      $addToSet: { authenticatedPlatforms: "shopify" },
    });

    console.log("✅ Shopify Authentication Complete for User:", user.email);

    // ✅ Redirect user to dashboard
    res.redirect("/dashboard");

  } catch (error) {
    console.error('❌ Shopify OAuth Error:', error);
    res.status(500).json({ error: 'Failed to authenticate Shopify store' });
  }
});



// Get Orders & Revenue
router.get('/orders', verifyToken, async (req, res) => {
  try {
    // 🔍 Retrieve Shopify token
    const tokenDoc = await ShopifyToken.findOne({ userId: req.user.id });
    if (!tokenDoc) return res.status(404).json({ error: 'No Shopify account connected' });

    // 📅 Set date range for last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const formattedDate = ninetyDaysAgo.toISOString(); // Convert to Shopify's format

    // 📡 Fetch all orders (full data)
    const { data } = await axios.get(`https://${tokenDoc.shop}/admin/api/2023-07/orders.json?status=any&created_at_min=${formattedDate}`,
      { headers: { 'X-Shopify-Access-Token': tokenDoc.accessToken } }
    );

    // 💾 Store entire response in MongoDB
    await ShopifyData.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { orders: data.orders } },  // ✅ Store all order data
      { upsert: true, new: true }
    );

    //res.json({ success: true, message: "Orders fetched and stored successfully" });
    res.json({ success: true, data });

  } catch (error) {
    console.error('Shopify Orders Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});


// Revenue Analytics
router.get('/analytics/revenue', verifyToken, async (req, res) => {
  try {
    const shopData = await ShopifyData.findOne({ userId: req.user.id }).lean();
    if (!shopData || !shopData.orders || !shopData.orders.length) {
      return res.status(404).json({ error: 'No Shopify order data found' });
    }

    // 🏦 Detect currency dynamically from the first order (assuming all orders use the same currency)
    const detectedCurrency = shopData.orders[0]?.currency || 'USD';

    // 💰 Calculate total revenue from all orders
    const revenue = shopData.orders.reduce((sum, order) => {
      return sum + (order.total_price ? parseFloat(order.total_price) : 0);
    }, 0);

    res.json({ success: true, revenue, currency: detectedCurrency });

  } catch (error) {
    console.error('Shopify Revenue Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});



// Get Customers
router.get('/customers', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await ShopifyToken.findOne({ userId: req.user.id });
    if (!tokenDoc) return res.status(404).json({ error: 'No Shopify account connected' });

    // 📅 Set date range for last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const formattedDate = ninetyDaysAgo.toISOString(); // Convert to Shopify's format

    // 📡 Fetch full customer data
    const { data } = await axios.get(
      `https://${tokenDoc.shop}/admin/api/2023-07/customers.json?created_at_min=${formattedDate}`,
      { headers: { 'X-Shopify-Access-Token': tokenDoc.accessToken } }
    );
    

    // 💾 Store entire response in MongoDB
    await ShopifyData.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { customers: data.customers } },  // ✅ Store all customer data
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Customers fetched and stored successfully" });

  } catch (error) {
    console.error('Shopify Customers Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});



router.get('/products', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await ShopifyToken.findOne({ userId: req.user.id });
    if (!tokenDoc) return res.status(404).json({ error: 'No Shopify account connected' });

    // 📅 Set date range for last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const formattedDate = ninetyDaysAgo.toISOString(); // Convert to Shopify's format

    const { data } = await axios.get(
      `https://${tokenDoc.shop}/admin/api/2023-07/products.json?created_at_min=${formattedDate}`,
      { headers: { 'X-Shopify-Access-Token': tokenDoc.accessToken } }
    );
    

    await ShopifyData.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { products: data.products } },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Products fetched and stored successfully" });

  } catch (error) {
    console.error('Shopify Products Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/abandoned-checkouts', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await ShopifyToken.findOne({ userId: req.user.id });
    if (!tokenDoc) return res.status(404).json({ error: 'No Shopify account connected' });

    // 📅 Set date range for last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const formattedDate = ninetyDaysAgo.toISOString(); // Convert to Shopify's format

    const { data } = await axios.get(`https://${tokenDoc.shop}/admin/api/2023-07/checkouts.json?created_at_min=${formattedDate}`, {
      headers: { 'X-Shopify-Access-Token': tokenDoc.accessToken }
    });

    await ShopifyData.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { abandoned_checkouts: data.checkouts } },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Abandoned checkouts fetched and stored successfully" });

  } catch (error) {
    console.error('Shopify Abandoned Checkouts Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch abandoned checkouts' });
  }
});


router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await ShopifyToken.findOne({ userId: req.user.id });
    if (!tokenDoc) return res.status(404).json({ error: 'No Shopify account connected' });

    const shopUrl = `https://${tokenDoc.shop}/admin/api/2023-07`;
    const headers = { 'X-Shopify-Access-Token': tokenDoc.accessToken };

    // 📅 Set date range for last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const formattedDate = ninetyDaysAgo.toISOString(); // Convert to Shopify's format

    // 1️⃣ Fetch all orders first
    const { data: orderData } = await axios.get(`${shopUrl}/orders.json?created_at_min=${formattedDate}`, { headers });
    const orders = orderData.orders;

    if (!orders.length) {
      console.log("No orders found.");
      return res.status(200).json({ success: true, message: "No orders found, so no transactions available." });
    }

    console.log(`Found ${orders.length} orders. Fetching transactions...`);

    // 2️⃣ Fetch transactions for each order using Promise.all
    const transactionPromises = orders.map((order) =>
      axios
        .get(`${shopUrl}/orders/${order.id}/transactions.json`, { headers })
        .then((res) => ({
          order_id: order.id,
          transactions: res.data.transactions,
        }))
        .catch((error) => {
          console.error(`Error fetching transactions for Order ID ${order.id}:`, error.response?.data || error.message);
          return { order_id: order.id, transactions: [] }; // Return empty transactions if it fails
        })
    );

    // 3️⃣ Wait for all transaction requests to complete
    const transactionsData = await Promise.all(transactionPromises);

    // 4️⃣ Store transactions in MongoDB
    await ShopifyData.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { transactions: transactionsData } }, 
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: "Transactions fetched and stored successfully",
      transactions: transactionsData,
    });

  } catch (error) {
    console.error('Shopify Transactions Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});


router.get('/discounts', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await ShopifyToken.findOne({ userId: req.user.id });
    if (!tokenDoc) return res.status(404).json({ error: 'No Shopify account connected' });

    // 📅 Set date range for last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const formattedDate = ninetyDaysAgo.toISOString(); // Convert to Shopify's format

    const { data } = await axios.get(`https://${tokenDoc.shop}/admin/api/2023-07/price_rules.json?created_at_min=${formattedDate}`, {
      headers: { 'X-Shopify-Access-Token': tokenDoc.accessToken }
    });

    await ShopifyData.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { discounts: data.price_rules } },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Discount codes fetched and stored successfully" });

  } catch (error) {
    console.error('Shopify Discounts Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch discounts' });
  }
});


router.get('/marketing', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await ShopifyToken.findOne({ userId: req.user.id });
    if (!tokenDoc) return res.status(404).json({ error: 'No Shopify account connected' });

    // 📅 Set date range for last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const formattedDate = ninetyDaysAgo.toISOString(); // Convert to Shopify's format

    const { data } = await axios.get(`https://${tokenDoc.shop}/admin/api/2023-07/marketing_events.json?created_at_min=${formattedDate}`, {
      headers: { 'X-Shopify-Access-Token': tokenDoc.accessToken }
    });

    await ShopifyData.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { marketing_events: data.marketing_events } },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: "Marketing events fetched and stored successfully" });

  } catch (error) {
    console.error('Shopify Marketing Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch marketing events' });
  }
});


module.exports = router;
