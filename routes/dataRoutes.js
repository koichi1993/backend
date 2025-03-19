const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middlewares/auth");
const OpenAI = require("openai");
require("dotenv").config();

// ✅ Import database models
const FacebookAdData = require("../models/FacebookAdData");
const GoogleAdsData = require("../models/GoogleAdsData");
const GoogleAnalyticsData = require("../models/GoogleAnalyticsData");
const LinkedInAdData = require("../models/LinkedInAdData");
const ShopifyData = require("../models/ShopifyData");
const TikTokAdData = require("../models/TikTokAdData");
const PayPalTransaction = require("../models/PayPalTransaction");
const StripeTransaction = require("../models/StripeTransaction");
const checkLimit = require("../middlewares/checkLimit"); // ✅ Import the middleware

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });



router.get("/data/:platform/:functionName", verifyToken, async (req, res) => {
  try {
    const { platform, functionName } = req.params;
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;

    // ✅ Calculate start date for filtering
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let data = [];

    switch (platform) {
      case "facebook":
        data = await FacebookAdData.find({ userId, createdAt: { $gte: startDate } });
        break;
      case "googleAds":
        data = await GoogleAdsData.find({ userId, createdAt: { $gte: startDate } });
        break;
      case "linkedin":
        data = await LinkedInAdData.find({ userId, createdAt: { $gte: startDate } });
        break;
      case "tiktok":
        data = await TikTokAdData.find({ userId, createdAt: { $gte: startDate } });
        break;
        case "analytics":
          const analyticsData = await GoogleAnalyticsData.find({ userId, date: { $gte: startDate } });
        
          if (!analyticsData.length) {
            data = [];
            break;
          }
        
          switch (functionName) {
            case "Website Traffic & Conversions":
              data = analyticsData.map(entry => ({
                date: entry.date,
                activeUsers: entry.activeUsers,
                newUsers: entry.newUsers,
                sessions: entry.sessions,
                bounceRate: entry.bounceRate,
                engagementRate: entry.engagementRate,
                sessionDuration: entry.sessionDuration
              }));
              break;
        
            case "User Behavior & Session Analysis":
              data = analyticsData.map(entry => ({
                date: entry.date,
                sessionSource: entry.sessionSource,
                deviceCategory: entry.deviceCategory,
                browser: entry.browser,
                sessionDuration: entry.sessionDuration,
                bounceRate: entry.bounceRate
              }));
              break;
        
            case "SEO & Content Strategy":
              data = analyticsData.map(entry => ({
                date: entry.date,
                firstUserSource: entry.firstUserSource,
                manualSource: entry.manualSource,
                medium: entry.medium,
                activeUsers: entry.activeUsers,
                newUsers: entry.newUsers,
                engagementRate: entry.engagementRate
              }));
              break;
        
            case "Funnel & Drop-Off Analysis":
              data = analyticsData.map(entry => ({
                date: entry.date,
                sessions: entry.sessions,
                bounceRate: entry.bounceRate,
                sessionDuration: entry.sessionDuration,
                transactions: entry.transactions,
                purchaseRevenue: entry.purchaseRevenue
              }));
              break;
        
            case "Mobile vs. Desktop Performance":
              data = analyticsData.map(entry => ({
                date: entry.date,
                deviceCategory: entry.deviceCategory,
                activeUsers: entry.activeUsers,
                newUsers: entry.newUsers,
                sessions: entry.sessions,
                engagementRate: entry.engagementRate,
                bounceRate: entry.bounceRate
              }));
              break;
        
            default:
              data = [];
          }
          break;
        
      case "paypal":
        data = await PayPalTransaction.find({ userId, createdAt: { $gte: startDate } });
        break;
      case "stripe":
        data = await StripeTransaction.find({ userId, createdAt: { $gte: startDate } });
        break;
        case "shopify":
          const shopifyData = await ShopifyData.findOne({ userId });
          if (!shopifyData) {
            data = [];
            break;
          }
        
          switch (functionName) {
            case "Revenue & Order Analysis":
              data = shopifyData.orders.filter(entry => new Date(entry.created_at) >= startDate);
              break;
        
            case "Customer Segmentation & Retention":
              data = shopifyData.customers.filter(entry => new Date(entry.created_at) >= startDate);
              break;
        
            case "Product Performance & Inventory":
              data = shopifyData.products.filter(entry => new Date(entry.created_at) >= startDate);
              break;
        
            case "Promotion & Discount Performance":
              data = shopifyData.discounts.filter(entry => new Date(entry.created_at) >= startDate);
              break;
        
            case "Marketing Performance & Traffic":
              data = shopifyData.marketing_events.filter(entry => new Date(entry.created_at) >= startDate);
              break;
        
            case "Customer Acquisition Cost & LTV":
              data = shopifyData.customers.map(customer => ({
                totalSpent: customer.total_spent,
                ordersCount: customer.orders_count,
              }));
              break;
        
            case "Subscription & Recurring Revenue":
              data = shopifyData.transactions.map(t => ({
                orderId: t.order_id,
                amount: t.transactions.map(trx => trx.amount),
                status: t.transactions.map(trx => trx.status),
                created_at: t.transactions.map(trx => trx.created_at),
              }));
              break;
        
              case "Refunds & Chargebacks":
                data = shopifyData.transactions
                  .map(t => ({
                    orderId: t.order_id,
                    refunds: t.transactions
                      .filter(trx => trx.status === "refunded")
                      .map(trx => ({
                        amount: trx.amount,
                        created_at: trx.created_at,
                      })),
                  }))
                  .filter(t => t.refunds.length > 0); // Remove transactions with no refunds
                break;
              
        
            default:
              data = [];
          }
          break;
        
      default:
        return res.status(400).json({ success: false, error: "Unknown platform" });
    }

    console.log(`✅ Data Sent for ${platform} - ${functionName}:`, data);
    res.json({ success: true, data });

  } catch (error) {
    console.error(`❌ Error fetching data for ${platform} - ${functionName}:`, error);
    res.status(500).json({ success: false, error: "Failed to fetch data" });
  }
});




router.post("/analyze", verifyToken, checkLimit, async (req, res) => {

  try {
    const { selectedPlatforms, selectedFunctions, customAnalysis, analysisDepth, industry, product } = req.body;

    const userId = req.user.id;

    if (!selectedPlatforms || selectedPlatforms.length === 0) {
      return res.status(400).json({ success: false, error: "No platforms selected for analysis." });
    }

    let combinedData = [];
    let individualAnalysisPrompts = [];

    function getAnalysisGoal(platform, analysisType) {

      if (customAnalysis && customAnalysis.trim().length > 0) {
        return `User-Specified Analysis Goal: ${customAnalysis}`;
    }
    
      switch (platform) {
        // ---------------------------------
        // 📊 SHOPIFY (E-commerce Analytics)
        // ---------------------------------
        case "shopify":
          switch (analysisType) {
            case "Revenue & Order Analysis":
              return "Analyze revenue trends, average order values, and peak sales periods. Identify pricing optimizations and sales growth strategies.";
            case "Customer Segmentation & Retention":
              return "Segment customers by behavior, LTV, and retention trends. Recommend engagement strategies to boost repeat purchases.";
            case "Product Performance & Inventory":
              return "Identify best-sellers, slow-moving products, and inventory trends. Suggest pricing and restocking optimizations.";
            case "Promotion & Discount Performance":
              return "Analyze the effectiveness of discounts, bundles, and sales promotions. Recommend strategies to maximize profits.";
            case "Marketing Performance & Traffic":
              return "Evaluate Shopify traffic sources, ad spend efficiency, and conversion funnels. Identify the best-performing acquisition channels.";
            case "Customer Acquisition Cost & LTV":
              return "Compare acquisition costs vs. customer lifetime value. Suggest strategies to improve ROI on customer acquisition.";
            case "Subscription & Recurring Revenue":
              return "Analyze active subscribers, churn rates, and recurring revenue growth. Provide retention and pricing recommendations.";
            case "Refunds & Chargebacks":
              return "Detect refund and chargeback patterns. Identify risks, fraud, and suggest dispute mitigation strategies.";
          }
          break;
    
        // ---------------------------------
        // 📊 GOOGLE ADS, FACEBOOK ADS, LINKEDIN ADS, TIKTOK ADS (Paid Ad Performance)
        // ---------------------------------
        case "googleAds":
        case "facebook":
        case "linkedin":
        case "tiktok":
          switch (analysisType) {
            case "Ad Performance & ROI":
              return "Evaluate ad engagement, CTR, CPC, and ROAS. Identify high-performing campaigns and ad fatigue issues.";
            case "Budget Optimization":
              return "Analyze ad spend efficiency. Identify wasted budget and suggest reallocations for better performance.";
            case "Audience Targeting & Engagement":
              return "Evaluate audience demographics and engagement trends. Suggest refinements for better targeting and conversions.";
            case "Ad Creative Effectiveness":
              return "Identify high-performing ad creatives, messaging, and visuals. Recommend improvements for better engagement.";
            case "Competitor Benchmarking":
              return "Compare ad performance against competitors in the same industry. Identify opportunities for better positioning.";
            case "Cross-Channel Ad Performance":
              return "Analyze ad performance across multiple platforms. Identify which channels deliver the highest ROI and optimize the marketing mix.";
          }
          break;
    
        // ---------------------------------
        // 📊 GOOGLE ANALYTICS (Website & Traffic Insights)
        // ---------------------------------
        case "analytics":
          switch (analysisType) {
            case "Website Traffic & Conversions":
              return "Analyze website traffic sources, user behavior, and conversion rates. Identify the best acquisition channels.";
            case "User Behavior & Session Analysis":
              return "Evaluate user behavior, session duration, and navigation flow. Suggest optimizations to improve engagement.";
            case "SEO & Content Strategy":
              return "Analyze organic traffic, keyword performance, and page rankings. Recommend SEO optimizations.";
            case "Funnel & Drop-Off Analysis":
              return "Identify where users drop off in the conversion funnel. Provide solutions to improve user retention and sales.";
            case "Mobile vs. Desktop Performance":
              return "Compare mobile vs. desktop engagement and conversion rates. Suggest UI/UX improvements for better mobile performance.";
          }
          break;
    
        // ---------------------------------
        // 📊 STRIPE / PAYPAL (Payment & Financial Data)
        // ---------------------------------
        case "paypal":
        case "stripe":
          switch (analysisType) {
            case "Revenue & Transactions":
              return "Analyze revenue growth, payment trends, and high-value transaction periods.";
            case "Customer Payment Behavior":
              return "Evaluate preferred payment methods and customer transaction patterns.";
            case "Churn & Subscription Tracking":
              return "Identify customer churn patterns and suggest retention strategies for subscription-based businesses.";
            case "Fraud & Chargeback Prevention":
              return "Detect fraudulent transactions, chargebacks, and high-risk customers. Provide fraud prevention recommendations.";
          }
          break;
      }
    
      return "Analyze this dataset and provide actionable insights.";
    }
    

    for (const { platform, functionName } of selectedPlatforms) {
      let data;
      switch (platform) {
        case "facebook":
          data = await FacebookAdData.find({ userId });
          break;
        case "googleAds":
          data = await GoogleAdsData.find({ userId });
          break;
        case "analytics":
          data = await GoogleAnalyticsData.find({ userId });
          break;
        case "linkedin":
          data = await LinkedInAdData.find({ userId });
          break;
        case "shopify":
          const shopifyData = await ShopifyData.findOne({ userId });
          if (shopifyData) data = shopifyData[functionName];
          break;
        case "tiktok":
          data = await TikTokAdData.find({ userId });
          break;
        case "paypal":
          data = await PayPalTransaction.find({ userId });
          break;
        case "stripe":
          data = await StripeTransaction.find({ userId });
          break;
        default:
          continue;
      }

      if (data && data.length > 0) {
        combinedData.push({ platform, functionName, data });

        // 🔥 Individual Platform Analysis Prompt Based on Analysis Type
        const individualPrompt = ` 
        **Platform:** ${platform.toUpperCase()}  
        **Analysis Type:** ${analysisType.toUpperCase()}  
        **Industry:** ${industry.toUpperCase()}  
        **Product / Business Type:** ${product.toUpperCase()}  
        _(This could be a single product or an entire business category, such as an eCommerce store.)_

        **Depth Level:** ${analysisDepth.toUpperCase()}  

        📌 **User-Defined Analysis Goal**  
        ${customAnalysis && customAnalysis.trim().length > 0 
          ? `User-Specified Analysis Goal: ${customAnalysis}`
          : `Default Goal: ${getAnalysisGoal(platform, analysisType)}`}

        🔹 **Key Performance Insights** (Trends, Strengths, Weaknesses)  
        🔹 **Optimization Suggestions**  
        🔹 **Recommended Strategy for Growth**  
        🔹 **Industry-Specific Recommendations**  
        🔹 **Graphable Metrics** (for AI-generated visuals)  

        **📊 Data for Analysis:**  
        ${JSON.stringify(data, null, 2)}
      `;




        individualAnalysisPrompts.push(individualPrompt);
      }
    }

    if (combinedData.length === 0) {
      return res.status(404).json({ success: false, error: "No data found for selected platforms." });
    }

    let allPrompts;
    if (selectedPlatforms.length === 1) {
      allPrompts = individualAnalysisPrompts.join("\n\n");
    } else {
      // 🔥 **Cross-Platform AI Analysis**
      const combinedPrompt = `
  You are an elite **Fortune 500-level marketing strategist and industry expert.**  
  Analyze these datasets **together** and provide deep insights.

📌 **User-Defined Analysis Goal**  
${customAnalysis && customAnalysis.trim().length > 0 ? `User-Specified Analysis Goal: ${customAnalysis}` : "The user did not specify a custom goal. Focus on the selected analysis types."}  

📌 **Industry:** ${industry.toUpperCase()}  
📌 **Product / Business Type:** ${product.toUpperCase()}  

📌 **Selected Platforms & Analysis Types:**  
${selectedPlatforms.map(platform => 
  `- **${platform.toUpperCase()}**:\n  ${selectedFunctions[platform]?.map(func => `  • ${func}`).join("\n  ") || "  No specific analysis type selected."}`
).join("\n")}

📌 **Depth Level:** ${analysisDepth.toUpperCase()}  

---

🔍 **Analysis Goals (Based on Selection):**  
${selectedPlatforms.map(platform =>
  selectedFunctions[platform]?.map(func => `- ${platform.toUpperCase()} - ${func}: ${getAnalysisGoal(platform, func)}`).join("\n")
).join("\n")}

---

**Cross-Platform Insights:**  
1️⃣ **How do these platforms compare in performance for this industry?**  
2️⃣ **Which platform has the highest engagement, ROI, or conversion rate?**  
3️⃣ **How does this product perform across different channels?**  
4️⃣ **What are the most effective strategies for this industry?**  
5️⃣ **Are there patterns in customer retention, transactions, or payments specific to this industry?**  
6️⃣ **What is the best strategic move RIGHT NOW?**  

📊 **Combined Data Across Platforms:**  
${JSON.stringify(combinedData, null, 2)}
`;

allPrompts = [...individualAnalysisPrompts, combinedPrompt].join("\n\n");

    }

    // 🔥 Send Data to AI
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: `
          You are an elite marketing strategist and industry analyst.
          Your task is to analyze the provided data and return actionable insights **specific to the user's industry and product**.
          Make sure to include:
          - Performance insights
          - Optimization suggestions
          - Industry-specific recommendations
          - Visualizable metrics for graphs
          - Competitive benchmarking
    
          **Return JSON in the following format:**
          {
            "summary": "[Brief summary of findings]",
            "recommendations": ["Actionable insights for business improvement"],
            "industrySpecificInsights": ["Key trends specific to the industry and product"],
            "metrics": {
              "CTR": { "Google Ads": value, "Facebook Ads": value, "TikTok Ads": value },
              "ROAS": { "Google Ads": value, "Facebook Ads": value, "TikTok Ads": value },
              "ConversionRate": { "Google Ads": value, "Facebook Ads": value, "TikTok Ads": value },
              "RevenueVsAdSpend": { "Google Ads": value, "Facebook Ads": value, "Shopify": value },
              "CustomerRetentionRate": { "Shopify": value, "Stripe": value, "PayPal": value }
            }
          }
          If a metric is not applicable for the selected platforms, omit it from the response.
        `},
        { role: "user", content: allPrompts },
      ],
      temperature: analysisDepth === "Basic" ? 0.3 : analysisDepth === "Advanced" ? 0.6 : 0.9,
      response_format: "json",
    });
    

    res.json({ success: true, insights: response.choices[0].message.content });
  } catch (error) {
    console.error("AI Analysis Error:", error);
    res.status(500).json({ success: false, error: "AI analysis failed" });
  }
});

module.exports = router;


