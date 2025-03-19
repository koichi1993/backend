const express = require('express');
const router = express.Router();
const StripeData = require('../models/StripeTransaction');
const PayPalData = require('../models/PayPalTransaction');
const SquareData = require('../models/SquareTransaction');
const { verifyToken } = require('../middlewares/auth');

router.get('/', verifyToken, async (req, res) => {
  try {
    const [stripeData, paypalData,squareData] = await Promise.all([
      StripeData.findOne({ userId: req.user.id }),
      PayPalData.findOne({ userId: req.user.id }),
      SquareData.findOne({ userId: req.user.id })
    ]);

    // Combine transactions from both Stripe and PayPal
    const combinedTransactions = [
      ...(stripeData?.transactions || []),
      ...(paypalData?.transactions || []),
      ...(squareData?.transactions || [])
    ];

    // Sum up the revenue from all transactions
    const combinedRevenue = combinedTransactions.reduce((sum, t) => sum + t.amount, 0);

    res.json({
      success: true,
      data: {
        totalRevenue: combinedRevenue,
        stripeTransactions: stripeData?.transactions?.length || 0,
        paypalTransactions: paypalData?.transactions?.length || 0,
        squareTransactions: squareData?.transactions?.length || 0
      }
    });
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;
