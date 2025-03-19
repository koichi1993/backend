const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ✅ Verify JWT Token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1] || req.cookies.jwt;
    if (!token) return res.status(401).json({ success: false, error: "Access denied. No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) return res.status(401).json({ success: false, error: "User no longer exists" });

    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication Error:", error);
    res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
};

// ✅ Login Handler
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { email: user.email, subscriptionPlan: user.subscriptionPlan } });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
};

module.exports = { verifyToken, loginUser };


