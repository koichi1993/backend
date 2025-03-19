const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Hashed Password
  role: { type: String, enum: ["user", "admin"], default: "user" },
  subscriptionPlan: { type: String, default: "Free" },

  // 🔥 New Fields for Subscription Management
  requestCount: { type: Number, default: 0 }, // Tracks API requests
  subscriptionExpiresAt: { type: Date, default: null }, // Billing cycle reset

  // 🔹 Password Reset Token & Expiry Time
  resetPasswordToken: { type: String, default: null },
  resetPasswordExpires: { type: Date, default: null },

  authenticatedPlatforms: { type: [String], default: [] },

  createdAt: { type: Date, default: Date.now },
});

// ✅ Hash Password Before Saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  next();
});

// ✅ Compare Password (For Login)
userSchema.methods.comparePassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
