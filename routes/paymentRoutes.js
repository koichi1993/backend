const express = require("express");
const Stripe = require("stripe");
const { verifyToken } = require("../middlewares/auth");
const User = require("../models/User");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ Create a Checkout Session (Handles Subscription Payments)
router.post("/create-checkout-session",verifyToken, async (req, res) => {
    try {
        const { plan } = req.body; // Example: "Basic", "Pro", "Premium"

        const prices = {
            Starter: "price_XXXXXXX",   // Replace with actual Stripe price IDs
            Growth: "price_YYYYYYY"
        };

        if (!prices[plan]) {
            return res.status(400).json({ error: "Invalid plan selected." });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "subscription",
            customer_email: req.user.email,
            line_items: [
                {
                    price: prices[plan],
                    quantity: 1,
                },
            ],
            metadata: { plan }, // ✅ Store the selected plan
            success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/cancel`,
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        res.status(500).json({ error: "Failed to create checkout session." });
    }
});

// ✅ Stripe Webhook (Handle Subscription Events)
router.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error("Webhook Signature Error:", err.message);
        return res.status(400).send(`Webhook error: ${err.message}`);
    }

    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object;
            const user = await User.findOne({ email: session.customer_email });

            if (user) {
                user.subscriptionPlan = session.metadata.plan || "Starter";
                user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                user.requestCount = 0; // ✅ Reset request count when subscription starts
                await user.save();
            }
            break;
        }

        case "invoice.payment_succeeded": {
            const invoice = event.data.object;
            const user = await User.findOne({ email: invoice.customer_email });

            if (user) {
                user.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Extend by 30 days
                await user.save();
            }
            break;
        }

        case "customer.subscription.deleted": {
            const subscription = event.data.object;
            const user = await User.findOne({ email: subscription.customer_email });

            if (user) {
                user.subscriptionPlan = "Free"; // Downgrade to Free Plan
                user.subscriptionExpiresAt = null;
                await user.save();
            }
            break;
        }

        default:
            console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
});

module.exports = router;
