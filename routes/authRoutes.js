const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const { verifyToken } = require("../middlewares/auth");
const { sendResetEmail } = require("../middlewares/email");

const router = express.Router();

// ✅ Signup Route (With Strong Password Enforcement)
router.post("/signup", async (req, res) => {
    try {
      const { email, password } = req.body;
  
      // 🔹 Check if Password Meets Security Requirements
      const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          error: "Password must be at least 8 characters long, include a number, and have one uppercase letter.",
        });
      }
  
      const existingUser = await User.findOne({ email });
      if (existingUser) return res.status(400).json({ error: "Email already in use" });
      
      const hashedPassword = await bcrypt.hash(password, 10);
      
      const user = new User({ email, password: hashedPassword, subscriptionPlan: "Free" });
      await user.save();
  
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
  
      res.json({ success: true, token, user: { email: user.email, subscriptionPlan: user.subscriptionPlan } });
    } catch (error) {
      res.status(500).json({ error: "Signup failed" });
    }
  });
  

// ✅ Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    console.log("🎫 Token Generated:", token);
    res.json({ success: true, token, user: { email: user.email, subscriptionPlan: user.subscriptionPlan } });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

// ✅ Forgot Password
router.post("/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ error: "User not found" });
  
      // ✅ Generate Secure Reset Token (Valid for 1 hour)
      const resetToken = crypto.randomBytes(32).toString("hex");
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = Date.now() + 3600000; // 1 hour from now
      await user.save();
  
      // ✅ Send Email
      await sendResetEmail(email, resetToken);
  
      res.json({ success: true, message: "Password reset email sent" });
    } catch (error) {
      console.error("❌ Forgot Password Error:", error);
      res.status(500).json({ error: "Failed to send reset link" });
    }
  });
  
  // ✅ Reset Password (When User Clicks Link)
  router.post("/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
  
      if (!user) return res.status(400).json({ error: "Invalid or expired token" });
  
      // ✅ Hash & Update Password
      user.password = await bcrypt.hash(newPassword, 10);
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();
  
      res.json({ success: true, message: "Password reset successful" });
    } catch (error) {
      console.error("❌ Reset Password Error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

module.exports = router;
