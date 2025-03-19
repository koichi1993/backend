const checkoutNodeJssdk = require("@paypal/checkout-server-sdk");

// ✅ Configure PayPal Client
const environment = new checkoutNodeJssdk.core.SandboxEnvironment(
  process.env.PAYPAL_CLIENT_ID,
  process.env.PAYPAL_SECRET
);
const paypalClient = new checkoutNodeJssdk.core.PayPalHttpClient(environment);

module.exports = paypalClient;
