const express = require('express');
const axios = require('axios');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const TwitterToken = require('../models/TwitterToken');
const TwitterAdData = require('../models/TwitterAdData');
const { verifyToken } = require('../middlewares/auth');

const TWITTER_API_BASE = 'https://ads-api.twitter.com/11';

// ✅ 1️⃣ OAuth Setup for Twitter
const oauth = OAuth({
  consumer: {
    key: process.env.TWITTER_API_KEY,
    secret: process.env.TWITTER_API_SECRET
  },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }
});


// ✅ 2️⃣ Redirect User to Twitter for Authentication
// Add this at the top of your file
const tempTokenStore = new Map(); // Simple in-memory storage

// ✅ 2️⃣ Modified /auth Endpoint
router.get('/auth', verifyToken, async (req, res) => {
  try {
    const requestTokenUrl = 'https://api.twitter.com/oauth/request_token';

    console.log("🔹 API URL:", requestTokenUrl);
    console.log("🔹 Callback URL:", process.env.TWITTER_CALLBACK_URI);

    // ✅ Generate Fresh OAuth Parameters
    const oauth_nonce = crypto.randomBytes(16).toString("hex");
    const oauth_timestamp = Math.floor(Date.now() / 1000);  // Get current UNIX timestamp

    console.log("🔹 OAuth Nonce:", oauth_nonce);
    console.log("🔹 OAuth Timestamp:", oauth_timestamp);

    // ✅ Prepare OAuth Header
    const request_data = {
      url: requestTokenUrl,
      method: 'POST',
      data: { oauth_callback: process.env.TWITTER_CALLBACK_URI }
    };

    const authHeader = oauth.toHeader(oauth.authorize(request_data, {}, {
      oauth_nonce,
      oauth_timestamp
    }));

    console.log("🔹 OAuth Headers:", authHeader);

    // ✅ Send Request to Twitter API
    const { data } = await axios.post(requestTokenUrl, new URLSearchParams({
      oauth_callback: process.env.TWITTER_CALLBACK_URI
    }), {
      headers: {
        ...authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log("✅ Twitter Response:", data);

    // ✅ Extract OAuth Token and Secret
    const params = new URLSearchParams(data);
    const oauthToken = params.get('oauth_token');
    const oauthTokenSecret = params.get('oauth_token_secret');

    console.log("🔹 OAuth Token:", oauthToken);
    console.log("🔹 OAuth Token Secret:", oauthTokenSecret);

    if (!oauthToken || !oauthTokenSecret) {
      throw new Error("Missing OAuth token or secret from Twitter.");
    }

    // ✅ Store Tokens for Debugging
    tempTokenStore.set(oauthToken, {
      tokenSecret: oauthTokenSecret,
      userId: req.user.id
    });

    // ✅ Return Twitter Authorization URL
    res.json({ 
      authUrl: `https://api.twitter.com/oauth/authenticate?oauth_token=${oauthToken}`,
      manualTestingNote: "Open this URL in a browser to continue OAuth flow"
    });

  } catch (error) {
    console.error("❌ Twitter API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Authentication failed" });
  }
});

// ✅ 3️⃣ Modified /callback Endpoint
router.get('/callback', async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;

  console.log("🔹 Received OAuth Token:", oauth_token);
  console.log("🔹 Received OAuth Verifier:", oauth_verifier);

  // Get stored credentials from memory
  const storedData = tempTokenStore.get(oauth_token);
  if (!storedData) {
    return res.status(400).json({ error: 'Expired or invalid token' });
  }

  try {
    const accessTokenUrl = 'https://api.twitter.com/oauth/access_token';

    console.log("🔹 Requesting Access Token from Twitter...");

    // ✅ Include `oauth_verifier` in request body
    const requestBody = new URLSearchParams({
      oauth_token,
      oauth_verifier
    }).toString();

    const requestData = {
      url: accessTokenUrl,
      method: 'POST'
    };

    // ✅ Generate OAuth header
    const authHeader = oauth.toHeader(oauth.authorize(requestData, {
      key: oauth_token,
      secret: storedData.tokenSecret
    }));

    console.log("🔹 OAuth Headers:", authHeader);

    // ✅ Send request to Twitter with correct form-data
    const { data } = await axios.post(accessTokenUrl, requestBody, {
      headers: {
        ...authHeader,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log("✅ Twitter Response:", data);

    // ✅ Parse & store final access tokens
    const params = new URLSearchParams(data);
    const accessToken = params.get('oauth_token');
    const accessTokenSecret = params.get('oauth_token_secret');
    const userId = params.get('user_id');
    const screenName = params.get('screen_name');

    console.log("🔹 Access Token:", accessToken);
    console.log("🔹 Access Token Secret:", accessTokenSecret);
    console.log("🔹 Twitter User ID:", userId);
    console.log("🔹 Twitter Username:", screenName);

    // ✅ Calculate token expiration (let's assume 30 days for security)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // ✅ Store the access token in MongoDB
    const tokenDoc = await TwitterToken.findOneAndUpdate(
      { userId: storedData.userId }, // Update existing user token
      {
        accessToken,
        refreshToken: accessTokenSecret, // Twitter does not provide refresh tokens, so we store secret
        expiresAt,
        accountId: userId, // Save Twitter User ID (useful for API calls)
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      accessToken,
      accessTokenSecret,
      userId,
      screenName
    });

  } catch (error) {
    console.error("❌ Callback error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to authenticate" });
  }
});


// ✅ 4️⃣ Get Ad Accounts
// ✅ 3️⃣ Get Ad Accounts (If User Has Multiple Accounts)

router.get('/adaccounts', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await TwitterToken.findOne({ userId: req.user.id });

    if (!tokenDoc) {
      return res.status(404).json({ error: 'No Twitter Ads token found' });
    }

    console.log("🔹 Twitter API URL:", `${TWITTER_API_BASE}/accounts`);
    console.log("🔹 OAuth Token:", tokenDoc.accessToken);
    console.log("🔹 OAuth Secret:", tokenDoc.refreshToken);

    const requestData = {
      url: `${TWITTER_API_BASE}/accounts`,
      method: 'GET'
    };

    // ✅ Declare `token` before using it
    const token = {
      key: tokenDoc.accessToken,  // ✅ User Access Token
      secret: tokenDoc.refreshToken  // ✅ User Access Token Secret
    };

    // ✅ Generate OAuth header (DO NOT manually add `oauth_token`)
    const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

    console.log("🔹 OAuth Headers:", authHeader);

    // ✅ Send request to Twitter Ads API
    const { data } = await axios.get(`${TWITTER_API_BASE}/accounts`, {
      headers: { Authorization: authHeader.Authorization }
    });

    // ✅ Handle empty response case
    if (!data.data || data.data.length === 0) {
      console.log("🔹 No ad accounts found.");
      return res.json({ success: true, accounts: [] });
    }

    res.json({ success: true, accounts: data.data.map(acc => ({
      accountId: acc.id,
      name: acc.name
    })) });

  } catch (error) {
    console.error('❌ Twitter API Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch Twitter ad accounts' });
  }
});




// ✅ Fetch & Store Twitter Ads Performance Data (Now Includes Cart Abandonment)
// ✅ 5️⃣ Fetch & Store Twitter Ads Performance Data
router.get('/ads/performance', verifyToken, async (req, res) => {
  try {
    const tokenDoc = await TwitterToken.findOne({ userId: req.user.id });

    if (!tokenDoc) {
      return res.status(401).json({ error: 'Invalid or expired Twitter token' });
    }

    console.log("🔹 Fetching Twitter Ads Performance Data...");
    console.log("🔹 API URL:", `${TWITTER_API_BASE}/accounts/${tokenDoc.accountId}/stats`);
    console.log("🔹 OAuth Token:", tokenDoc.accessToken);
    console.log("🔹 OAuth Secret:", tokenDoc.refreshToken);

    const requestData = {
      url: `${TWITTER_API_BASE}/accounts/${tokenDoc.accountId}/stats`,
      method: 'GET'
    };

    // ✅ Declare `token` before using it
    const token = {
      key: tokenDoc.accessToken,  // ✅ User Access Token
      secret: tokenDoc.refreshToken  // ✅ User Access Token Secret
    };

    // ✅ Generate OAuth header
    const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

    console.log("🔹 OAuth Headers:", authHeader);

    // ✅ Send request to Twitter Ads API
    const { data } = await axios.get(`${TWITTER_API_BASE}/accounts/${tokenDoc.accountId}/stats`, {
      headers: { Authorization: authHeader.Authorization }
    });

    // ✅ Handle empty response case
    if (!data.data || data.data.length === 0) {
      console.log("🔹 No ad performance data found.");
      return res.json({ success: true, data: [] });
    }

    await Promise.all(data.data.map(ad => 
      TwitterAdData.findOneAndUpdate(
        { adId: ad.id },  // ✅ Twitter Ads use `id`, not `ad_id`
        {
          userId: req.user.id,
          accountId: tokenDoc.accountId,
          campaignId: ad.id,  // ✅ If you're storing campaign-level data
          adId: ad.id,  // ✅ Ad ID
          adData: ad // ✅ Store the entire Twitter Ads API response
        },
        { upsert: true, new: true }
      )
    ));
    

    res.json({ success: true, data: data.data });

  } catch (error) {
    console.error('❌ Twitter Ad Data Fetch Error:', error.response?.data || error);
    res.status(500).json({ error: 'Failed to fetch Twitter ad performance data' });
  }
});




module.exports = router;
