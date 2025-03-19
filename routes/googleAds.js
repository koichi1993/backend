const express = require('express');
const { google } = require('googleapis');
const { GoogleAdsApi } = require('google-ads-api');
require('dotenv').config();

const router = express.Router();
const GoogleAdsToken = require('../models/GoogleAdsToken');
const GoogleAdsData = require('../models/GoogleAdsData');
const { verifyToken } = require('../middlewares/auth');
const jwt = require("jsonwebtoken");

const User = require("../models/User");

// ✅ 1️⃣ OAuth2 Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_ADS_CLIENT_ID,
  process.env.GOOGLE_ADS_CLIENT_SECRET,
  process.env.GOOGLE_ADS_REDIRECT_URI
);


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

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/adwords'],
    redirect_uri: process.env.GOOGLE_ADS_REDIRECT_URI,
    state: state,  // ✅ Track user if possible
  });

  console.log("🔹 Google Ads OAuth state:", state);
  res.redirect(authUrl);
});





router.get('/oauth2callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).json({ error: 'Missing authorization code or user ID' });

  try {
    const user = await User.findById(state);
    if (!user) {
      console.error("❌ User not found for state:", state);
      return res.status(404).json({ error: "User not found" });
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    console.log("✅ OAuth Tokens Received:", tokens);
    const userId = user._id;

    const expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : Date.now() + 3600 * 1000;

    const googleAdsClient = new GoogleAdsApi({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    });

    const customers = await googleAdsClient.listAccessibleCustomers(tokens.access_token);
    
    let customerId = null;
    if (customers?.resource_names?.length > 0) {
      customerId = customers.resource_names[0].replace('customers/', '');
    }

    console.log("✅ Google Ads Customer ID:", customerId);

    await GoogleAdsToken.findOneAndUpdate(
      { userId },
      { 
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        customerId,
      },
      { upsert: true, new: true }
    );

    // ✅ Update authenticated platforms
    await User.findByIdAndUpdate(user._id, {
      $addToSet: { authenticatedPlatforms: "googleAds" },
    });

    console.log("✅ Google Ads Authentication Complete for User:", user.email);

    // ✅ Redirect User Back to Dashboard
    res.redirect("/dashboard");

  } catch (error) {
    console.error('🚨 Google Ads OAuth Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});



// ✅ 4️⃣ Get Ad Accounts
router.get('/adaccounts', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await GoogleAdsToken.findOne({ userId: req.user.id });

    if (!tokenDoc || tokenDoc.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const googleAdsClient = new GoogleAdsApi({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    });

    const customers = await googleAdsClient.listAccessibleCustomers(tokenDoc.accessToken);
    if (!customers || !customers.resource_names || !Array.isArray(customers.resource_names)) {
      return res.status(500).json({ error: "Google Ads API did not return a valid response." });
    }

    const customerIds = customers.resource_names.map(name => name.replace('customers/', ''));
    console.log("Extracted Customer IDs:", customerIds);

    res.json({ success: true, accounts: customerIds.map(id => ({ customerId: id })) });
  } catch (error) {
    console.error('Google Ads API Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch Google Ads accounts' });
  }
});

// ✅ 5️⃣ Fetch & Store Google Ads Performance Data
router.get('/ads/performance', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await GoogleAdsToken.findOne({ userId: req.user.id });

    if (!tokenDoc || tokenDoc.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const googleAdsClient = new GoogleAdsApi({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    });

    const customer = googleAdsClient.Customer({
      customer_id: tokenDoc.customerId,
      access_token: tokenDoc.accessToken,
      refresh_token: tokenDoc.refreshToken,
    });

    // Calculate the date 90 days ago
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const formattedDate = ninetyDaysAgo.toISOString().split('T')[0]; // Format as 'YYYY-MM-DD'

    // ✅ Fetch all Google Ads data (removing specific metrics)
    const adsData = await customer.query(`
      SELECT 
        campaign.id, 
        campaign.name, 
        ad_group.id, 
        ad_group.name, 
        ad.id, 
        ad.name, 
        metrics.all_conversions, 
        metrics.clicks, 
        metrics.impressions, 
        metrics.ctr, 
        metrics.conversion_value, 
        metrics.cost_micros, 
        metrics.average_cpc, 
        metrics.cost_per_conversion, 
        segments.device, 
        segments.date, 
        segments.ad_network_type 
      FROM ad
      WHERE segments.date >= '${formattedDate}'  -- Filter data from the last 90 days 
      LIMIT 100
    `);

    // ✅ Store the entire Google Ads API response in `adData`
    await Promise.all(adsData.map(ad =>
      GoogleAdsData.findOneAndUpdate(
        { adId: ad.ad.id },  // ✅ Unique identifier
        {
          userId: req.user.id,
          customerId: tokenDoc.customerId,
          campaignId: ad.campaign.id,
          adGroupId: ad.ad_group.id,
          adId: ad.ad.id,
          adData: ad // ✅ Store full API response
        },
        { upsert: true, new: true }
      )
    ));

    res.json({ success: true, data: adsData });

  } catch (error) {
    console.error('Google Ads Performance Fetch Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch Google Ads performance data' });
  }
});

module.exports = router;
