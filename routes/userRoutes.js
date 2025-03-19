const express = require("express");
const { verifyToken } = require("../middlewares/auth");
const User = require("../models/User");

const router = express.Router();

// ✅ Get User Profile
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password -resetPasswordToken -resetPasswordExpires");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to fetch profile" });
  }
});

// ✅ Update User Profile
router.put("/update-profile", verifyToken, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    if (email) user.email = email;
    await user.save();

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update profile" });
  }
});

// ✅ Update Subscription Plan
router.post("/update-subscription", verifyToken, async (req, res) => {
  try {
    const { subscriptionPlan } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    user.subscriptionPlan = subscriptionPlan;
    user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    await user.save();

    res.json({ success: true, message: "Subscription updated", subscriptionPlan });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to update subscription" });
  }
});

router.post("/downgrade", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    // ✅ Cancel PayPal Subscription if Active
    if (user.subscriptionPlan !== "Free" && user.paypalSubscriptionId) {
      const accessToken = await getPayPalAccessToken();
      await axios.post(
        `${process.env.PAYPAL_API_BASE}/v1/billing/subscriptions/${user.paypalSubscriptionId}/cancel`,
        { reason: "User downgraded to Free Plan" },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      user.paypalSubscriptionId = null;
    }

    // ✅ Cancel Stripe Subscription if Active
    if (user.subscriptionPlan !== "Free" && user.stripeSubscriptionId) {
      await stripe.subscriptions.del(user.stripeSubscriptionId);
      user.stripeSubscriptionId = null;
    }

    // ✅ Update User to Free Plan
    user.subscriptionPlan = "Free";
    user.subscriptionExpiresAt = null;
    user.requestCount = 0;
    await user.save();

    res.json({ success: true, message: "Subscription downgraded to Free Plan" });
  } catch (error) {
    console.error("Downgrade Error:", error);
    res.status(500).json({ success: false, error: "Failed to downgrade." });
  }
});


module.exports = router;
