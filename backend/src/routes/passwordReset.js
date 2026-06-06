const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const { User } = require("../models");
const { validate } = require("../middleware/validate");
const { passwordStrength } = require("../middleware/passwordPolicy");
const { sendEmail } = require("../utils/emailService");
const logger = require("../utils/logger");

const router = express.Router();

// Rate limiter for password reset endpoints — 5 attempts per 15 minutes per IP.
// Blocks brute-force token guessing and abuse of the email-token generator.
const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many password reset attempts, please try again later." },
});

// FORGOT PASSWORD — generates a reset token and emails it.
// CRITICAL: never return the raw reset token in the HTTP response body —
// that would let any attacker who can POST to /forgot-password take over
// an account without access to the victim's inbox.
router.post("/forgot-password", passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    // Always respond with the same generic message regardless of whether the
    // email exists, to prevent user enumeration.
    const genericResponse = { success: true, message: "If an account exists for this email, a reset link has been sent." };

    if (!email || typeof email !== "string") {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.json(genericResponse);
    }

    const token = crypto.randomBytes(32).toString("hex");

    user.reset_token = token;
    user.reset_token_expiry = new Date(Date.now() + 3600000); // 1 hour

    await user.save();

    // Fire-and-forget email delivery — do not block the response or
    // expose delivery failures (which could leak whether the user exists).
    sendEmail({
      to: user.email,
      subject: "Forged — Password Reset",
      text:
        `A password reset was requested for your Forged account.\n\n` +
        `Your reset token is: ${token}\n\n` +
        `This token expires in 1 hour. If you did not request this, ignore this email.`,
      html:
        `<p>A password reset was requested for your Forged account.</p>` +
        `<p>Your reset token is:</p>` +
        `<p style="font-family:monospace;font-size:1.1em;word-break:break-all">${token}</p>` +
        `<p>This token expires in <strong>1 hour</strong>. If you did not request this, ignore this email.</p>`,
    }).catch((err) => logger.error({ err: err.message }, "forgot-password: email delivery failed"));

    return res.json(genericResponse);
  } catch (err) {
    logger.error({ err: err.message }, "forgot-password error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// RESET PASSWORD
router.post("/reset-password/:token", passwordResetLimiter, validate([passwordStrength('password')]), async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      where: { reset_token: token }
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid token" });
    }

    // Enforce reset token expiry — critical to prevent indefinite token reuse.
    if (!user.reset_token_expiry || new Date() > new Date(user.reset_token_expiry)) {
      return res.status(400).json({ success: false, message: "Reset token has expired. Please request a new one." });
    }

    const hash = await bcrypt.hash(password, 10);

    user.password_hash = hash;
    user.reset_token = null;
    user.reset_token_expiry = null;

    await user.save();

    return res.json({
      success: true,
      message: "Password reset successful"
    });

  } catch (err) {
    logger.error({ err: err.message }, "reset-password error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
