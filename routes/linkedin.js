const express = require('express');
const axios = require('axios');
require('dotenv').config();

const router = express.Router();
const LinkedInToken = require('../models/LinkedInToken');
const LinkedInAdData = require('../models/LinkedInAdData');
const { verifyToken } = require('../middlewares/auth');

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI;
const LINKEDIN_API_BASE = 'https://api.linkedin.com/v2';
const LINKEDIN_API_BASE_REST = 'https://api.linkedin.com/rest';

const jwt = require("jsonwebtoken");

const User = require("../models/User");

// ✅ 1️⃣ OAuth Authentication (Redirect User to LinkedIn)
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
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&scope=${encodeURIComponent("r_ads,r_ads_reporting")}&state=${state}`;

    console.log("🔹 LinkedIn OAuth state:", state);
    res.redirect(authUrl);
  } catch (error) {
    console.error("❌ Error in LinkedIn OAuth Authentication:", error);
    if (!res.headersSent) { // ✅ Prevents sending response twice
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
});

router.get('/callback', async (req, res) => {
  console.log("🔍 LinkedIn Callback Hit!");
  console.log("🔍 Query Params:", req.query);

  const { code, state } = req.query;  

  if (!code) {
    return res.status(400).json({ error: 'Authorization code not provided' });
  }

  if (!state) {
    return res.status(400).json({ error: 'State parameter missing (User ID not found)' });
  }

  console.log("✅ Received Code:", code);
  console.log("✅ Received State (User ID):", state);

  try {
    // ✅ Validate user from state
    const user = await User.findById(state);
    if (!user) {
      console.error("❌ User not found for state:", state);
      return res.status(404).json({ error: "User not found" });
    }

    // ✅ Exchange authorization code for access token
    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
      params: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      },
    });

    const { access_token, refresh_token, expires_in } = tokenResponse.data;
    const expiresAt = Date.now() + (expires_in * 1000);

    console.log("✅ Received Access Token:", access_token);
    
    // ✅ Store access token in database
    await LinkedInToken.findOneAndUpdate(
      { userId: user._id },  // ✅ Store token with MongoDB ID
      { accessToken: access_token, refreshToken: refresh_token, expiresAt },
      { upsert: true, new: true }
    );

    // ✅ Mark LinkedIn as authenticated for the user
    await User.findByIdAndUpdate(user._id, {
      $addToSet: { authenticatedPlatforms: "linkedin" },
    });

    console.log("✅ LinkedIn Authentication Complete for User:", user.email);

    // ✅ Redirect User to Dashboard
    res.redirect("/dashboard");

  } catch (error) {
    console.error('🚨 LinkedIn Callback Error:', error.response?.data || error.message);

    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to get access token' });
    }
  }
});



// ✅ 3️⃣ Get Ad Accounts (If User Has Multiple Accounts)
router.get('/adaccounts', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await LinkedInToken.findOne({ userId: req.user.id });

    console.log("🔍 Using Token:", tokenDoc.accessToken);  // 🔴 Debugging

    if (!tokenDoc || tokenDoc.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { data } = await axios.get(`${LINKEDIN_API_BASE_REST}/adAccounts?q=search`, {
      headers: { 
        Authorization: `Bearer ${tokenDoc.accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',  // ✅ REQUIRED FOR LINKEDIN API
        'LinkedIn-Version': '202501'  // ✅ USE LATEST VERSION
      }
    });

    console.log("✅ API Response:", JSON.stringify(data, null, 2));  // 🔴 Debugging

    if (data.elements.length === 1) {
      return res.json({ success: true, accountId: data.elements[0].id });
    }

    res.json({
      success: true,
      accounts: data.elements.map(acc => ({
        accountId: acc.id,
        name: acc.name
      }))
    });

  } catch (error) {
    console.error('🚨 LinkedIn API Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch LinkedIn ad accounts' });
  }
});


// ✅ 4️⃣ Fetch & Store LinkedIn Ads Performance Data
router.get('/ads/performance', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await LinkedInToken.findOne({ userId: req.user.id });

    if (!tokenDoc || tokenDoc.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

      // 📅 Calculate date range for the last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const startDate = {
        day: ninetyDaysAgo.getDate(),
        month: ninetyDaysAgo.getMonth() + 1, // JS months are zero-based
        year: ninetyDaysAgo.getFullYear(),
      };

      const endDate = {
        day: new Date().getDate(),
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      };

    // ✅ Step 1: Fetch Campaigns First
    const { data: campaigns } = await axios.get(`${LINKEDIN_API_BASE}/adCampaignsV2?q=search`, {
      headers: { 
        Authorization: `Bearer ${tokenDoc.accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202501'
      }
    });

    console.log("🔍 Campaigns Response:", campaigns); // Debugging

    // ✅ If no campaigns exist, return a friendly message
    if (!campaigns.elements || campaigns.elements.length === 0) {
      return res.json({ success: false, message: "No campaigns found. Make sure you have at least one active campaign." });
    }

    // ✅ Step 2: Extract ALL campaign IDs (Multiple campaigns support)
    const campaignIds = campaigns.elements.map(c => c.id).join(',');

    // ✅ Step 2: Fetch Analytics using the campaignId
    const { data } = await axios.get(`${LINKEDIN_API_BASE}/adAnalyticsV2?q=analytics`, {
      headers: { 
        Authorization: `Bearer ${tokenDoc.accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202501'
      },
      params: { 
        dateRange:`(start:(day:${startDate.day},month:${startDate.month},year:${startDate.year}),end:(day:${endDate.day},month:${endDate.month},year:${endDate.year}))`,
        timeGranularity: "DAILY",  // ✅ Required
        campaigns: campaignIds,  // ✅ Ensure this is correct
        account: tokenDoc.accountId,
        fields: "impressions,clicks,ctr,conversions,conversionRate,costPerClick,costPerImpression,costPerConversion,totalSpend,videoViews,videoCompletions,engagements,leadFormOpens,leads,follows,shares,reactions,comments,fullScreenPlays,cardClicks,cardImpressions"
      }
    });

    console.log("✅ Analytics Data:", data); // Debugging

    if (!data.elements || data.elements.length === 0) {
      return res.json({ success: false, message: "No analytics data available yet. Try again later." });
    }

    await Promise.all(data.elements.map(ad => 
      LinkedInAdData.findOneAndUpdate(
        { adId: ad.adUnitId },
        {
          userId: req.user.id,
          accountId: tokenDoc.accountId,
          campaignId: ad.campaignId,
          adId: ad.adUnitId,
          adData: ad // ✅ Store full LinkedIn Ads API response
        },
        { upsert: true, new: true }
      )
    ));

    res.json({ success: true, data: data.elements });

  } catch (error) {
    console.error('🚨 LinkedIn Ad Data Fetch Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch LinkedIn ad performance data' });
  }
});



module.exports = router;
