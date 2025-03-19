const User = require("../models/User");

// ✅ Define request limits per plan
const PLAN_LIMITS = {
  Free: 25,       // Free plan → 25 requests
  Starter: 200,   // Starter plan → 200 requests
  Growth: 400,    // Growth plan → 400 requests
  Enterprise: Infinity // Enterprise → Unlimited requests
};

// ✅ Middleware to check request limits
const checkLimit = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(401).json({ error: "Unauthorized. User not found." });
    }

    // ✅ Reset request count if the billing cycle has expired
    if (user.subscriptionExpiresAt && new Date() > user.subscriptionExpiresAt) {
      user.requestCount = 0; // Reset requests
      user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Extend for another month
      await user.save();
    }

    // ✅ Check if the user has exceeded their request limit
    const requestLimit = PLAN_LIMITS[user.subscriptionPlan] || 0;
    if (user.requestCount >= requestLimit) {
      return res.status(403).json({ error: "Request limit exceeded. Upgrade your plan to continue." });
    }

    // ✅ Increment the request count before proceeding
    user.requestCount += 1;
    await user.save();

    next(); // Continue to the AI processing route
  } catch (error) {
    console.error("Middleware Error: ", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

module.exports = checkLimit;
