const express = require('express');
const router = express.Router();
const { SquareClient, SquareEnvironment } = require('square');
const SquareToken = require('../models/SquareToken');
const SquareTransaction = require('../models/SquareTransaction');
const { verifyToken } = require('../middlewares/auth');

const squareClient = new SquareClient({
  environment: process.env.SQUARE_ENVIRONMENT === 'production' 
    ? SquareEnvironment.Production 
    : SquareEnvironment.Sandbox,
  token: process.env.SQUARE_ACCESS_TOKEN,
});

// OAuth2 Initiation
router.get('/auth', verifyToken, (req, res) => {

  //the following url base is for sandbox, change back to production squareupsandbox to squareup
  //const authUrl = `https://connect.squareupsandbox.com/oauth2/authorize?client_id=${process.env.SQUARE_APP_ID}&scope=PAYMENTS_READ+CUSTOMERS_READ+MERCHANT_PROFILE_READ&redirect_uri=${process.env.SQUARE_REDIRECT_URI}`;
  const authUrl = `https://connect.squareupsandbox.com/oauth2/authorize?client_id=${process.env.SQUARE_APP_ID}&scope=PAYMENTS_READ%20CUSTOMERS_READ%20MERCHANT_PROFILE_READ&redirect_uri=${process.env.SQUARE_REDIRECT_URI}&session=false`;


  res.redirect(authUrl);

});


// OAuth2 Callback
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { result } = await squareClient.oAuthApi.obtainToken({
      code,
      redirectUri: process.env.SQUARE_REDIRECT_URI
    });

    await SquareToken.findOneAndUpdate(
      { userId: req.user.id },
      {
        merchantId: result.merchantId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: Date.now() + (result.expiresIn * 1000)
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Square connected successfully' });

  } catch (error) {
    console.error('Square Callback Error:', error);
    res.status(500).json({ success: false, error: 'Failed to connect Square account' });
  }
});

// Get Transactions
router.get('/transactions', verifyToken, async (req, res) => {
  try {
    const squareData = await SquareToken.findOne({ userId: req.user.id });
    if (!squareData) return res.status(404).json({ success: false, error: 'No Square data found' });

    const { result } = await squareClient.paymentsApi.listPayments();
    const transactions = (result.payments || []).map(p => ({
      id: p.id,
      amount: p.amountMoney.amount / 100,
      currency: p.amountMoney.currency,
      status: p.status,
      createdAt: new Date(p.createdAt),
      sourceType: p.sourceType
    }));

    await SquareTransaction.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { transactions } },
      { upsert: true }
    );

    res.json({ success: true, transactions });

  } catch (error) {
    console.error('Transaction Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
  }
});

// Revenue Analytics
router.get('/analytics/revenue', verifyToken, async (req, res) => {
  try {
    const squareData = await SquareTransaction.findOne({ userId: req.user.id }).lean();
    if (!squareData) return res.status(404).json({ success: false, error: 'No Square data found' });

    const revenue = squareData.transactions.reduce((sum, t) => sum + t.amount, 0);

    res.json({ success: true, revenue, currency: 'USD' });

  } catch (error) {
    console.error('Revenue Analytics Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch revenue data' });
  }
});

// Webhook Handler
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    const body = JSON.parse(req.body.toString('utf8'));

    switch (body.type) {
      case 'payment.created':
        await handlePayment(body.data);
        break;
      case 'refund.created':
        await handleRefund(body.data);
        break;
      default:
        console.log('Unhandled event:', body.type);
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Helper: Handle Payments
async function handlePayment(event) {
  const payment = event.object.payment;
  await SquareTransaction.findOneAndUpdate(
    { userId: event.merchant_id },
    { $push: { transactions: { id: payment.id, amount: payment.amount_money.amount / 100, currency: payment.amount_money.currency, status: payment.status, createdAt: new Date(payment.created_at) } } },
    { upsert: true }
  );
}


module.exports = router;

