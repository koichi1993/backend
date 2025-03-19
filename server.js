require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

// ✅ Import platform routes
const facebookRoutes = require('./routes/facebook');
const googleAnalyticsRoutes = require('./routes/googleAnalytics');
const googleAdsRoutes = require('./routes/googleAds');
const linkedinRoutes = require('./routes/linkedin');
const tiktokRoutes = require('./routes/tiktok');
const stripeRoutes = require('./routes/stripe');
const paypalRoutes = require('./routes/paypal');
const dashboardRoutes = require('./routes/dashboard');
const squareRoutes = require('./routes/square');
const twitterRoutes = require('./routes/twitter');
const shopifyRoutes = require('./routes/shopify');
const dataRoutes = require("./routes/dataRoutes"); // ✅ Import the new data routes

const { verifyToken } = require('./middlewares/auth'); 
const authRoutes = require("./routes/authRoutes");

const paymentRoutes = require("./routes/paymentRoutes");
const paymentPayPalRoutes = require("./routes/paymentpaypal");

const userRoutes = require('./routes/userRoutes');

const User = require("./models/User"); // ✅ Import the User model





// Initialize Express
const app = express();

// Security Middleware
app.use(helmet());
/*app.use(cors({
  origin: process.env.ALLOWED_ORIGINS.split(','),
  credentials: true
}));*/

const allowedOrigins = [
  "http://localhost:3001", // ✅ Still allow local frontend (for testing)
  "https://kaelma.com",    // ✅ Allow deployed frontend (for production)
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: "GET,POST,PUT,DELETE",
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '10kb' }));


// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Database Connection
connectDB();

// ✅ Webhook Requires Raw Body
app.use("/api/paypal/webhook", express.raw({ type: "application/json" })); // 🔥 Required for PayPal

// ✅ Register platform routes
app.use('/api/facebook', facebookRoutes);
app.use('/api/analytics', googleAnalyticsRoutes);
app.use('/api/google-ads', googleAdsRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/tiktok', tiktokRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/paypal', paypalRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/square', squareRoutes);
app.use('/api/twitter', twitterRoutes);
app.use('/api/shopify', shopifyRoutes);

app.use("/api/auth", authRoutes);
// ✅ Use the new data routes
app.use("/api", dataRoutes);
// ✅ Map platform names to token models for removal
const ShopifyToken = require('./models/ShopifyToken');
const GoogleAdsToken = require('./models/GoogleAdsToken');
const FacebookToken = require('./models/FacebookToken');
const StripeToken = require('./models/StripeToken');
const PayPalToken = require('./models/PayPalToken');
const GoogleAnalyticsToken = require('./models/GoogleAnalyticsToken');
const TikTokToken = require('./models/TikTokToken');
const LinkedInToken = require('./models/LinkedInToken');

app.use("/api/payments", paymentRoutes);
app.use("/api/paymentpaypal", paymentPayPalRoutes);

app.use("/api/user",userRoutes);


const platformModels = {
  shopify: ShopifyToken,
  google_ads: GoogleAdsToken,
  facebook_ads: FacebookToken,
  stripe: StripeToken,
  paypal: PayPalToken,
  google_analytics: GoogleAnalyticsToken,
  tiktok: TikTokToken,
  linkedin: LinkedInToken,
};

// ✅ Route to Remove Authentication
app.delete('/api/:platform/remove-auth',verifyToken, async (req, res) => {
  try {
    const { platform } = req.params;
    const userId = req.user.id;

    const TokenModel = platformModels[platform];
    if (!TokenModel) return res.status(400).json({ error: 'Invalid platform name' });

    // ❌ Delete authentication record from DB
    await TokenModel.deleteOne({ userId });

    res.json({ success: true, message: `${platform} disconnected successfully` });
  } catch (error) {
    console.error("Remove Auth Error:", error);
    res.status(500).json({ error: "Failed to disconnect platform" });
  }
});


app.get("/api/authenticated-platforms", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({ success: true, platforms: user.authenticatedPlatforms });
  } catch (error) {
    console.error("❌ Error fetching authenticated platforms:", error);
    res.status(500).json({ success: false, error: "Failed to fetch authenticated platforms" });
  }
});


// Add other routes here...

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Global Error Handler:', err);
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});


// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});