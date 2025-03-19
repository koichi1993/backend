const express = require('express');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();
const FacebookToken = require('../models/FacebookToken');
const FacebookAdData = require('../models/FacebookAdData');
const { verifyToken } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");

const FB_API_VERSION = 'v17.0';
const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;

const User = require("../models/User");


// ✅ 1️⃣ OAuth Flow - Redirect User to Facebook Login
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

  const authUrl = `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth?client_id=${process.env.FB_APP_ID}&redirect_uri=${encodeURIComponent(process.env.FB_REDIRECT_URI)}&scope=ads_read,public_profile&state=${state}`;

  console.log("🔹 Facebook OAuth state:", state);
  res.redirect(authUrl);
});


// ✅ 2️⃣ OAuth Callback - Store Tokens & Ad Account ID
router.get('/callback', async (req, res) => {

  const { code, state } = req.query;
  if (!code || !state) {
    console.error("🚨 Missing authorization code or state in callback");
    return res.status(400).json({ error: 'Authorization code or state not provided' });
  }

  try {
    // ✅ Find the user based on `state` (which holds user ID)
    const user = await User.findById(state);
    if (!user) {
      console.error("❌ User not found for state:", state);
      return res.status(404).json({ error: "User not found" });
    }

    // ✅ Exchange code for access token
    const { data: tokenData } = await axios.get(`${FB_BASE_URL}/oauth/access_token`, {
      params: {
        client_id: process.env.FB_APP_ID,
        client_secret: process.env.FB_APP_SECRET,
        redirect_uri: process.env.FB_REDIRECT_URI,
        code
      }
    });

    console.log("✅ Facebook Access Token:", tokenData);

    // ✅ Fetch Facebook Ad Accounts
    const { data: adAccounts } = await axios.get(`${FB_BASE_URL}/me/adaccounts`, {
      params: { access_token: tokenData.access_token }
    });

    console.log("✅ Facebook Ad Accounts:", adAccounts);

    // ✅ Get first Ad Account ID (if available)
    let accountId = null;
    if (adAccounts.data && adAccounts.data.length > 0) {
      accountId = adAccounts.data[0].id;
    } else {
      console.warn("🚨 No Facebook Ad accounts found for this user.");
    }

    // ✅ Store or update the Facebook token & account ID in database
    await FacebookToken.findOneAndUpdate(
      { userId: user._id },
      {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        accountId
      },
      { upsert: true, new: true }
    );

    // ✅ Update user's `authenticatedPlatforms` list
    await User.findByIdAndUpdate(user._id, {
      $addToSet: { authenticatedPlatforms: "facebook" },
    });

    console.log("✅ Facebook Authentication Complete for User:", user.email);

    // ✅ Redirect user to dashboard after successful authentication
    res.redirect("/dashboard");
  } catch (error) {
    console.error("🚨 Facebook OAuth Error:", error.response?.data || error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});




// ✅ 3️⃣ Get Ad Accounts (If User Has Multiple Accounts)
router.get('/adaccounts', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await FacebookToken.findOne({ userId: req.user.id });

    if (!tokenDoc || tokenDoc.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { data } = await axios.get(`${FB_BASE_URL}/me/adaccounts`, {

      params: { access_token: tokenDoc.accessToken }
    });

    if (data.data.length === 1) {
      return res.json({ success: true, accountId: data.data[0].id });
    }

    res.json({ success: true, accounts: data.data.map(acc => ({ accountId: acc.id, name: acc.name })) });

  } catch (error) {
    console.error('Facebook API Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch Facebook ad accounts' });
  }
});

// ✅ 4️⃣ Fetch & Store Facebook Ads Performance Data
// Import your individual payment models

router.get('/ads/performance', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await FacebookToken.findOne({ userId: req.user.id });
    if (!tokenDoc || tokenDoc.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Request insights data using a date preset and including the "reach" field.
    const { data } = await axios.get(`${FB_BASE_URL}/${tokenDoc.accountId}/insights`, {
      params: { 
        access_token: tokenDoc.accessToken,
        level: "ad",
        fields: "ad_id,ad_name,campaign_id,adset_id,account_id,clicks,unique_clicks,impressions,reach,ctr,unique_ctr,spend,cpc,cpm,cpp,cost_per_inline_link_click,cost_per_inline_post_engagement,actions,action_values,conversions,cost_per_action_type,app_installs,video_views,video_30_sec_watched_actions,mobile_app_purchase_roas,website_purchase_roas,age,gender,country,region,dma,placement,impression_device,publisher_platform",
        date_preset: "last_90d"  // Change this as needed, e.g., "last_7d" or "last_30d"
      }
    });

    if (!data.data || data.data.length === 0) {
      console.log("🔹 No ad performance data found.");
      return res.json({ success: true, data: [] });
    }

    // ✅ Store FULL API response in MongoDB
    await Promise.all(data.data.map(ad => 
      FacebookAdData.findOneAndUpdate(
        { adId: ad.ad_id },  // ✅ Unique identifier for each ad
        {
          userId: req.user.id,
          accountId: tokenDoc.accountId,
          campaignId: ad.campaign_id,
          adSetId: ad.adset_id,
          adId: ad.ad_id,
          adName: ad.ad_name,
          adData: ad // ✅ Store the full Facebook Ads API response
        },
        { upsert: true, new: true }
      )
    ));

    res.json({ success: true, data: data.data });
  } catch (error) {
    console.error('Facebook Ad Data Fetch Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch Facebook ad performance data' });
  }
});





module.exports = router;