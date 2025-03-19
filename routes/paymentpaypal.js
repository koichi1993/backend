const express = require("express");
const axios = require("axios");
const { verifyToken } = require("../middlewares/auth");
const User = require("../models/User");

const router = express.Router();

// ✅ PayPal Plans - Replace with actual PayPal Plan IDs
const PAYPAL_PLANS = {
    Starter: "P-XXXXXXXXXXXX",   // Replace with actual PayPal Plan IDs
    Growth: "P-YYYYYYYYYYYY"
};

// ✅ Function to Get PayPal Access Token
const getPayPalAccessToken = async () => {
    const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64");
    const response = await axios.post(`${process.env.PAYPAL_API_BASE}/v1/oauth2/token`, "grant_type=client_credentials", {
        headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
    });
    return response.data.access_token;
};

// ✅ Create PayPal Subscription
router.post("/create-subscription",verifyToken, async (req, res) => {
    try {
        const { plan } = req.body;

        if (!PAYPAL_PLANS[plan]) {
            return res.status(400).json({ error: "Invalid plan selected." });
        }

        const accessToken = await getPayPalAccessToken();

        // ✅ Create PayPal Subscription
        const response = await axios.post(
            `${process.env.PAYPAL_API_BASE}/v1/billing/subscriptions`,
            {
                plan_id: PAYPAL_PLANS[plan],
                subscriber: {
                    email_address: req.user.email,
                },
                application_context: {
                    return_url: `${process.env.FRONTEND_URL}/success`,
                    cancel_url: `${process.env.FRONTEND_URL}/cancel`,
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            }
        );

        res.json({ subscriptionId: response.data.id, approvalUrl: response.data.links.find(link => link.rel === "approve").href });
    } catch (error) {
        console.error("PayPal Subscription Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Failed to create PayPal subscription." });
    }
});

// ✅ Handle PayPal Webhooks
router.post("/paypal/webhook", express.json(), async (req, res) => {
    try {
        const event = req.body;

        switch (event.event_type) {
            case "BILLING.SUBSCRIPTION.ACTIVATED": {
                const { id, plan_id, subscriber } = event.resource; ;
                const user = await User.findOne({ email: subscriber.email_address });

                if (user) {
                    const plan = Object.keys(PAYPAL_PLANS).find(key => PAYPAL_PLANS[key] === plan_id) || "Starter";
                    user.subscriptionPlan = plan; // ✅ Update user subscription
                    user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                    user.requestCount = 0; // ✅ Reset request count when subscription starts
                    await user.save();
                }
                break;
            }

            case "BILLING.SUBSCRIPTION.CANCELLED": {
                const { subscriber } = event.resource;
                const user = await User.findOne({ email: subscriber.email_address });

                if (user) {
                    user.subscriptionPlan = "Free"; // ✅ Downgrade user
                    user.subscriptionExpiresAt = null;
                    await user.save();
                }
                break;
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error("PayPal Webhook Error:", error);
        res.status(500).json({ error: "Webhook handling failed" });
    }
});

module.exports = router;
