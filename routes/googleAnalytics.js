const express = require('express');
const { google } = require('googleapis');
const { verifyToken } = require('../middlewares/auth');
require('dotenv').config();

const router = express.Router();
const GoogleAnalyticsToken = require('../models/GoogleAnalyticsToken');
const GoogleAnalyticsData = require('../models/GoogleAnalyticsData');
const jwt = require("jsonwebtoken");

const User = require("../models/User");

// ✅ OAuth2 Client Setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_ANALYTICS_CLIENT_ID,
  process.env.GOOGLE_ANALYTICS_CLIENT_SECRET,
  process.env.GOOGLE_ANALYTICS_REDIRECT_URI
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

  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/analytics.readonly'],
      redirect_uri: process.env.GOOGLE_ANALYTICS_REDIRECT_URI,
      state: state,  // ✅ Track user if possible
    });

    console.log("🔹 Google Analytics OAuth state:", state);
    res.redirect(authUrl);
  } catch (error) {
    console.error("❌ Google Analytics Auth Error:", error);
    res.status(500).json({ error: "Failed to generate authentication URL" });
  }
});



// ✅ 2️⃣ OAuth2 Callback (Handle Token Exchange)
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

    // ✅ Log Before Saving to MongoDB
    console.log("🔹 Saving Token for User ID:", userId);

    const updatedToken = await GoogleAnalyticsToken.findOneAndUpdate(
      { userId },
      { 
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt
      },
      { upsert: true, new: true }
    );

    console.log("✅ Token Saved:", updatedToken);

    // ✅ Update authenticated platforms
    await User.findByIdAndUpdate(user._id, {
      $addToSet: { authenticatedPlatforms: "googleAnalytics" },
    });

    console.log("✅ Google Analytics Authentication Complete for User:", user.email);

    // ✅ Redirect User Back to Dashboard
    res.redirect("/dashboard");

  } catch (error) {
    console.error('🚨 Google Analytics OAuth Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Authentication failed' });
  }
});



router.get('/data', verifyToken, async (req, res) => {
  try {

    // ✅ Ensure Property ID is loaded
    const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
    if (!propertyId) {
      return res.status(400).json({ error: "Google Analytics Property ID is missing from the environment variables." });
    }

    // ✅ Retrieve stored access token
    const tokenDoc = await GoogleAnalyticsToken.findOne({ userId: req.user.id });
    if (!tokenDoc) return res.status(401).json({ error: 'Not authenticated with Google Analytics' });

    // ✅ Set OAuth2 credentials
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: tokenDoc.accessToken });

    // ✅ Initialize Google Analytics API
    const analyticsData = google.analyticsdata({
      version: 'v1beta',
      auth: oauth2Client,
    });

    // ✅ Fetch report data
    const response = await analyticsData.properties.runReport({
      property: `properties/${process.env.GOOGLE_ANALYTICS_PROPERTY_ID}`,
      requestBody: {
        dateRanges: [{ startDate: '90daysAgo', endDate: 'today' }],
        dimensions: [
          { name: 'date' },
          { name: 'firstUserSource' },
          { name: 'sessionSource' },  // ✅ Replaces `source`
          { name: 'country' },
          { name: 'city' },
          { name: 'deviceCategory' },
          { name: 'browser' },
          { name: 'sessionDefaultChannelGroup' } // ✅ Alternative
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'transactions' },
          { name: 'purchaseRevenue' },
          { name: 'engagementRate' },
          { name: 'ecommercePurchases' },
          { name: 'averageRevenuePerUser' }
        ],
      },
    });

    if (!response.data.rows || response.data.rows.length === 0) {
      return res.status(200).json({ success: true, message: 'No data available.', data: [] });
    }

    // ✅ Process API response and store in MongoDB
    const processedData = response.data.rows.map(row => ({
      userId: req.user.id,
      date: new Date(row.dimensionValues[0]?.value),
      firstUserSource: row.dimensionValues[1]?.value || null,
      sessionSource: row.dimensionValues[2]?.value || null,
      country: row.dimensionValues[3]?.value || null,
      city: row.dimensionValues[4]?.value || null,
      deviceCategory: row.dimensionValues[5]?.value || null,
      browser: row.dimensionValues[6]?.value || null,
      manualSource: row.dimensionValues[7]?.value || null,
      medium: row.dimensionValues[8]?.value || null,
      activeUsers: parseInt(row.metricValues[0]?.value) || 0,
      newUsers: parseInt(row.metricValues[1]?.value) || 0,
      sessions: parseInt(row.metricValues[2]?.value) || 0,
      bounceRate: parseFloat(row.metricValues[3]?.value) || 0,
      sessionDuration: parseFloat(row.metricValues[4]?.value) || 0,
      transactions: parseInt(row.metricValues[5]?.value) || 0,
      purchaseRevenue: parseFloat(row.metricValues[6]?.value) || 0,
      engagementRate: parseFloat(row.metricValues[8]?.value) || 0,
      ecommercePurchases: parseInt(row.metricValues[9]?.value) || 0,
      averageRevenuePerUser: parseFloat(row.metricValues[10]?.value) || 0
    }));

    // ✅ Store processed data in MongoDB
    await GoogleAnalyticsData.insertMany(processedData);

    res.json({ success: true, data: processedData });

  } catch (error) {
    console.error('Google Analytics Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

module.exports = router;


