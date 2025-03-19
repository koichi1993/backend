const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail", // Change this if you're using another provider
  auth: {
    user: process.env.EMAIL_USER, // Your email
    pass: process.env.EMAIL_PASS, // App password or real password (Use environment variables)
  },
});

const sendResetEmail = async (email, resetToken) => {
  try {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request",
      html: `
        <h3>Reset Your Password</h3>
        <p>You requested to reset your password. Click the link below to reset it:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>If you didn't request this, please ignore this email.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Password reset email sent to ${email}`);
  } catch (error) {
    console.error("❌ Error sending reset email:", error);
  }
};

module.exports = { sendResetEmail };
