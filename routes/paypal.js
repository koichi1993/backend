const express = require('express');
const router = express.Router();
const axios = require('axios');
const PayPalToken = require('../models/PayPalToken');
const PayPalTransaction = require('../models/PayPalTransaction');
const { verifyToken } = require('../middlewares/auth');
const qs = require("querystring");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === 'live' 
  ? 'https://api.paypal.com' 
  : 'https://api.sandbox.paypal.com';

// -------------------------
// ✅ OAuth Flow
// -------------------------
router.get('/auth', (req, res) => {
  const token = req.query.token; // ✅ Extract token from query params

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
    const authUrl = `https://www.sandbox.paypal.com/signin/authorize?client_id=${process.env.PAYPAL_CLIENT_ID}&response_type=code&scope=openid%20email%20profile%20https://uri.paypal.com/services/paypalattributes%20https://uri.paypal.com/services/subscriptions%20https://uri.paypal.com/services/invoicing%20https://api.paypal.com/v1/vault/credit-card&redirect_uri=${encodeURIComponent(process.env.PAYPAL_REDIRECT_URI)}&state=${state}`;

    console.log("🔹 PayPal OAuth state:", state);
    res.redirect(authUrl);
  } catch (error) {
    console.error("❌ Error in PayPal OAuth Authentication:", error);
    if (!res.headersSent) { // ✅ Prevents sending response twice
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
});


router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    console.error("❌ Missing code or state:", { code, state });
    return res.status(400).json({ error: 'Invalid authorization request' });
  }

  console.log("✅ Received callback request:", { code, state });

  // ✅ Find User in MongoDB
  const user = await User.findById(state);
  if (!user) {
    console.error("❌ User not found for state:", state);
    return res.status(404).json({ error: "User not found" });
  }

  const userId = user._id; // ✅ Get verified MongoDB ID

  try {
    // Exchange the code for tokens
    const { data } = await axios.post(
      `${PAYPAL_API_BASE}/v1/oauth2/token`,
      `grant_type=authorization_code&code=${code}&redirect_uri=${encodeURIComponent(process.env.PAYPAL_REDIRECT_URI)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`
        }
      }
    );

    console.log("✅ PayPal API Response:", JSON.stringify(data, null, 2)); // Debugging log

    if (!data.access_token) {
      console.error("❌ No access token received!");
      return res.status(500).json({ error: "Failed to retrieve PayPal access token" });
    }

    // ✅ Fetch merchant_id
    let merchantId = null;
    try {
      const userInfo = await axios.get(`${PAYPAL_API_BASE}/v1/identity/oauth2/userinfo`, {
        headers: { Authorization: `Bearer ${data.access_token}` }
      });

      console.log("✅ PayPal User Info Response:", JSON.stringify(userInfo.data, null, 2));
      merchantId = userInfo.data.payer_id || null;  

    } catch (error) {
      console.error("❌ Failed to fetch merchant_id:", error.response?.data || error.message);
      merchantId = null;  
    }

    const refreshToken = data.refresh_token || null;

    // ✅ Save token details in MongoDB with `merchant_id`
    const savedToken = await PayPalToken.findOneAndUpdate(
      { userId }, // ✅ Use verified MongoDB ID
      {
        accessToken: data.access_token,
        refreshToken: refreshToken,
        expiresAt: Date.now() + (data.expires_in * 1000),
        merchantId: merchantId 
      },
      { upsert: true, new: true }
    );

    if (!savedToken) {
      console.error("❌ Failed to save token in MongoDB");
      return res.status(500).json({ error: 'Failed to store token' });
    }

    console.log("✅ Token saved successfully in MongoDB:", savedToken);

    // ✅ Mark PayPal as an authenticated platform
    await User.findByIdAndUpdate(userId, {
      $addToSet: { authenticatedPlatforms: "paypal" },
    });

    console.log("✅ PayPal Authentication Complete for User:", user.email);

    // ✅ Redirect user to dashboard
    res.redirect("/dashboard");

  } catch (error) {
    console.error('❌ PayPal OAuth Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to connect PayPal' });
  }
});




// -------------------------
// ✅ Transactions Endpoint
// -------------------------
router.get('/transactions', verifyToken, async (req, res) => {
  try {
    let paypalToken = await PayPalToken.findOne({ userId: req.user.id });

    if (!paypalToken) {
      return res.json({ success: true, transactions: [] });
    }

    // 🔄 Refresh the access token if it's expired
    if (Date.now() >= paypalToken.expiresAt - 60000) {
      console.log("🔄 Access token expired, refreshing...");

      const tokenResponse = await axios.post(
        `${PAYPAL_API_BASE}/v1/oauth2/token`,
        `grant_type=refresh_token&refresh_token=${paypalToken.refreshToken}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64')}`
          }
        }
      );

      console.log("✅ New PayPal Access Token:", tokenResponse.data);

      // 🔹 Update stored token
      paypalToken = await PayPalToken.findOneAndUpdate(
        { userId: req.user.id },
        {
          accessToken: tokenResponse.data.access_token,
          expiresAt: Date.now() + (tokenResponse.data.expires_in * 1000)
        },
        { new: true }
      );
    }

    // 🚀 NEW: Fetch last 90 days in 30-day chunks
    const allTransactions = []; // Store all transactions

    // 📅 Get today's date and 90 days ago
    const now = new Date();
    const endDate = now.toISOString();
    const startDate = new Date(now.setDate(now.getDate() - 90)).toISOString();

    // ✅ Helper function to fetch transactions for a given date range
    const fetchTransactions = async (start, end) => {
      console.log(`📡 Fetching transactions from ${start} to ${end}...`);
      const { data } = await axios.get(
        `${PAYPAL_API_BASE}/v1/reporting/transactions`,
        {
          headers: { Authorization: `Bearer ${paypalToken.accessToken}` },
          params: {
            start_date: start,
            end_date: end,
            fields: 'all'
          }
        }
      );
      return data.transaction_details || [];
    };

    // ✅ NEW LOOP: Fetch transactions in 30-day increments
    let currentStartDate = new Date(startDate);
    while (currentStartDate < new Date(endDate)) {
      let currentEndDate = new Date(currentStartDate);
      currentEndDate.setDate(currentEndDate.getDate() + 30);

      // Ensure we don't go beyond today
      if (currentEndDate > new Date(endDate)) {
        currentEndDate = new Date(endDate);
      }

      // Fetch transactions for this period
      const transactions = await fetchTransactions(
        currentStartDate.toISOString(),
        currentEndDate.toISOString()
      );

      allTransactions.push(...transactions); // Merge results

      // Move to the next period
      currentStartDate = new Date(currentEndDate);
      currentStartDate.setDate(currentStartDate.getDate() + 1);
    }

    console.log(`✅ Total Transactions Fetched: ${allTransactions.length}`);

    // 🔹 Store transactions in the database
    await Promise.all(allTransactions.map(t =>
      PayPalTransaction.findOneAndUpdate(
        { transactionId: t.transaction_info.transaction_id },  // ✅ Use transaction_id as the unique key
        {
          userId: req.user.id,
          merchantId: paypalToken.merchantId,
          transactionData: t // ✅ Store the entire transaction object
        },
        { upsert: true, new: true }
      )
    ));

    res.json({ success: true, transactions: allTransactions });

  } catch (error) {
    console.error('Transaction Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});




// -------------------------
// ✅ Revenue Analytics
// -------------------------
router.get('/analytics/revenue', verifyToken, async (req, res) => {
  try {
    // Fetch only completed transactions
    const transactions = await PayPalTransaction.find({
      userId: req.user.id,
      "transactionData.transaction_info.transaction_status": "S" // ✅ PayPal uses "S" for success
    });

    // ✅ Correct revenue calculation using the right field
    const revenue = transactions.reduce((sum, t) => {
      const amount = parseFloat(t.transactionData.transaction_info.transaction_amount?.value) || 0;  // ✅ Use correct field
      return sum + amount;
    }, 0);

    res.json({
      success: true,
      revenue,
      currency: transactions[0]?.transactionData.transaction_info.transaction_amount?.currency_code || 'USD'
    });

  } catch (error) {
    console.error('PayPal Revenue Analytics Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch revenue data' });
  }
});




module.exports = router;
