const express = require('express');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();
const StripeToken = require('../models/StripeToken');
const StripeTransaction = require('../models/StripeTransaction');
const { verifyToken } = require('../middlewares/auth');

const jwt = require("jsonwebtoken");
const User = require("../models/User");

const STRIPE_BASE_URL = 'https://api.stripe.com/v1';

// -------------------------
// ✅ Step 1: Redirect User to Stripe for Authorization
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
    const stripeAuthUrl = `https://connect.stripe.com/oauth/authorize?` +
      `response_type=code&client_id=${process.env.STRIPE_CLIENT_ID}&` +
      `scope=read_write&redirect_uri=${encodeURIComponent(process.env.STRIPE_REDIRECT_URI)}&` +
      `state=${state}`;

    console.log("🔹 Stripe OAuth state:", state);
    res.redirect(stripeAuthUrl);
  } catch (error) {
    console.error("❌ Error in Stripe OAuth Authentication:", error);
    if (!res.headersSent) { // ✅ Prevents sending response twice
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
});


// -------------------------
// ✅ Step 2: Handle OAuth Callback & Store Tokens
// -------------------------
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      console.error("❌ Missing code or state:", { code, state });
      return res.status(400).json({ error: 'Invalid authorization request' });
    }

    console.log("✅ Stripe Callback Received:", { code, state });

    // ✅ Validate user before storing Stripe token
    const user = await User.findById(state);
    if (!user) {
      console.error("❌ User not found for state:", state);
      return res.status(404).json({ error: "User not found" });
    }

    const userId = user._id; // ✅ Get verified MongoDB ID

    // 🔹 Request new access token from Stripe
    const { data } = await axios.post(`${STRIPE_BASE_URL}/oauth/token`, new URLSearchParams({
      code,
      grant_type: 'authorization_code'
    }).toString(), {
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log("✅ Stripe API Response:", data);

    // ✅ Store the Stripe access token and link it to the correct user
    const savedToken = await StripeToken.findOneAndUpdate(
      { userId },
      {
        stripeUserId: data.stripe_user_id,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)) // Store expiry time
      },
      { upsert: true, new: true }
    );

    if (!savedToken) {
      console.error("❌ Failed to save token in MongoDB");
      return res.status(500).json({ error: 'Failed to store token' });
    }

    console.log("✅ Token saved successfully in MongoDB:", savedToken);

    // ✅ Mark Stripe as an authenticated platform
    await User.findByIdAndUpdate(userId, {
      $addToSet: { authenticatedPlatforms: "stripe" },
    });

    console.log("✅ Stripe Authentication Complete for User:", user.email);

    // ✅ Redirect user to dashboard
    res.redirect("/dashboard");

  } catch (error) {
    console.error('❌ Stripe OAuth Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to connect Stripe' });
  }
});


// -------------------------
// ✅ Step 3: Fetch Transactions (Payments & Refunds)
// -------------------------
router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await StripeToken.findOne({ userId: req.user.id });
    if (!tokenDoc) return res.status(404).json({ error: 'No Stripe account connected' });

    // Calculate the timestamp for 90 days ago
    const ninetyDaysAgo = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);

    // Fetch balance transactions from the past 90 days
    const { data } = await axios.get(`${STRIPE_BASE_URL}/balance_transactions`, {
      headers: { Authorization: `Bearer ${tokenDoc.accessToken}` },
      params: {
        created: { gte: ninetyDaysAgo },
        limit: 100 // Adjust the limit as needed, maximum is 100
      }
    });

    // Store the full Stripe transaction JSON in MongoDB
    for (const txn of data.data) {
      await StripeTransaction.findOneAndUpdate(
        { transactionId: txn.id },
        {
          userId: req.user.id,
          stripeUserId: tokenDoc.stripeUserId,
          transactionData: txn, // Store the full Stripe transaction object
        },
        { upsert: true, new: true }
      );
    }

    res.json({ success: true, transactions: data.data });

  } catch (error) {
    console.error('Stripe Transaction Fetch Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// -------------------------
// ✅ Step 4: Fetch Revenue & Refunds for Analysis
// -------------------------
router.get('/analytics/revenue', verifyToken, async (req, res) => {
  try {
    // Fetch transactions from MongoDB instead of calling Stripe API again
    const transactions = await StripeTransaction.find({ userId: req.user.id });

    let totalRevenue = 0;
    let totalRefunds = 0;

    for (const txn of transactions) {
      const amount = txn.transactionData?.amount || 0; // ✅ Ensure correct field access

      if (txn.transactionData?.type.includes("refund")) {
        totalRefunds += amount / 100; // Convert from cents to dollars
      } else {
        totalRevenue += amount / 100; // Convert from cents to dollars
      }
    }

    res.json({ success: true, totalRevenue, totalRefunds });

  } catch (error) {
    console.error('Stripe Revenue Analytics Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});



module.exports = router;

