const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const TikTokToken = require('../models/TikTokToken');
const TikTokAdData = require('../models/TikTokAdData');
const { verifyToken } = require('../middlewares/auth');
const jwt = require("jsonwebtoken"); 

const User = require("../models/User");

const TIKTOK_AUTH_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/authorize' //'https://ads.tiktok.com/marketing_api/auth';
const TIKTOK_API_URL = 'https://business-api.tiktok.com/open_api/v1.3';

// ✅ 1️⃣ OAuth Flow (User Authentication)
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

  const state = userId || Math.random().toString(36).substring(7); // ✅ Use userId if available, else generate random state

  try {
    const authUrl = new URL(TIKTOK_AUTH_URL);

    authUrl.searchParams.append('client_key', process.env.TIKTOK_CLIENT_KEY);
    authUrl.searchParams.append('app_id', process.env.TIKTOK_APP_ID);
    authUrl.searchParams.append('redirect_uri', process.env.TIKTOK_REDIRECT_URI);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', 'ads.audience,ads.report,ads.management');

    console.log("🔹 Generated TikTok OAuth URL:", authUrl.toString());
    console.log("🔹 TikTok OAuth state:", state);

    res.cookie('tt_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      maxAge: 60000 // 1 minute
    });

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error("❌ Error generating TikTok OAuth URL:", error);
    res.status(500).json({ error: "Failed to generate TikTok OAuth URL" });
  }
});


// ✅ 2️⃣ OAuth Callback (Store Tokens)
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      console.error("❌ Missing code or state:", { code, state });
      return res.status(400).json({ error: 'Invalid authorization request' });
    }

    console.log("✅ TikTok Callback Received:", { code, state });

    // ✅ Validate user before storing TikTok token
    const user = await User.findById(state);
    if (!user) {
      console.error("❌ User not found for state:", state);
      return res.status(404).json({ error: "User not found" });
    }

    const userId = user._id; // ✅ Get verified MongoDB ID

    // 🔹 Request new access token from TikTok
    const { data } = await axios.post(`${TIKTOK_API_URL}/oauth2/access_token/`, {
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.TIKTOK_REDIRECT_URI
    });

    console.log("✅ TikTok API Response:", data);

    // ✅ Get the first advertiser ID automatically
    const advertiserId = data.advertiser_ids?.[0] || null;

    // ✅ Store the TikTok access token and link it to the correct user
    const savedToken = await TikTokToken.findOneAndUpdate(
      { userId },
      {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        advertiserId
      },
      { upsert: true, new: true }
    );

    if (!savedToken) {
      console.error("❌ Failed to save token in MongoDB");
      return res.status(500).json({ error: 'Failed to store token' });
    }

    console.log("✅ Token saved successfully in MongoDB:", savedToken);

    // ✅ Mark TikTok as an authenticated platform
    await User.findByIdAndUpdate(userId, {
      $addToSet: { authenticatedPlatforms: "tiktok" },
    });

    console.log("✅ TikTok Authentication Complete for User:", user.email);

    // ✅ Redirect user to dashboard
    res.redirect("/dashboard");

  } catch (error) {
    console.error('❌ TikTok OAuth Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to connect TikTok' });
  }
});


// ✅ 3️⃣ Fetch & Store Ad Accounts (If User Has Multiple)
router.get('/adaccounts', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await TikTokToken.findOne({ userId: req.user.id });

    if (!tokenDoc || tokenDoc.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { data } = await axios.get(`${TIKTOK_API_URL}/advertiser/info/`, {
      headers: { 'Access-Token': tokenDoc.accessToken }
    });

    if (!data.data.list || data.data.list.length === 0) {
      return res.status(404).json({ error: 'No advertiser accounts found' });
    }

    if (data.data.list.length === 1) {
      return res.json({ success: true, advertiserId: data.data.list[0].advertiser_id });
    }

    res.json({
      success: true,
      accounts: data.data.list.map(acc => ({
        advertiserId: acc.advertiser_id,
        name: acc.name
      }))
    });

  } catch (error) {
    console.error('TikTok API Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch ad accounts' });
  }
});

// ✅ 4️⃣ Fetch & Store Ad Performance Data
router.get('/ads/performance', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await TikTokToken.findOne({ userId: req.user.id });

    if (!tokenDoc || tokenDoc.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Calculate the date 90 days ago
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 90);

    // Format dates as 'YYYY-MM-DD'
    const formatDate = (date) => date.toISOString().split('T')[0];
    const formattedStartDate = formatDate(startDate);
    const formattedEndDate = formatDate(endDate);

    const { data } = await axios.get(`${TIKTOK_API_URL}/report/ad/`, {
      headers: { 'Access-Token': tokenDoc.accessToken },
      params: {
        advertiser_id: tokenDoc.advertiserId,
        report_type: "BASIC",
        data_level: "AD",
        date_range: {
          start_date: formattedStartDate,
          end_date: formattedEndDate
        },
        time_granularity: "DAILY", // Adjust as needed: "DAILY", "WEEKLY", "MONTHLY"
        // Include other necessary parameters as required
      }
    });

    // Handle empty response
    if (!data.data || !data.data.list || data.data.list.length === 0) {
      console.log("🔹 No ad performance data found.");
      return res.json({ success: true, data: [] });
    }

    // Store FULL API response in MongoDB
    await Promise.all(data.data.list.map(ad =>
      TikTokAdData.findOneAndUpdate(
        { adId: ad.ad_id }, // Unique identifier for each ad
        {
          userId: req.user.id,
          advertiserId: tokenDoc.advertiserId,
          campaignId: ad.campaign_id,
          adGroupId: ad.adgroup_id,
          adId: ad.ad_id,
          adData: ad // Store the full TikTok Ads API response
        },
        { upsert: true, new: true }
      )
    ));

    res.json({ success: true, data: data.data.list });

  } catch (error) {
    console.error('TikTok Ad Data Fetch Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch ad performance data' });
  }
});


module.exports = router;




