const crypto = require('crypto');
const { Op } = require('sequelize');

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

/**
 * Lazy-load OtpToken model to avoid circular require before sequelize.sync().
 */
let _OtpToken = null;
function getModel() {
  if (!_OtpToken) {
    _OtpToken = require('../models').OtpToken;
  }
  return _OtpToken;
}

class OTPService {
  /**
   * Generate a 6-digit OTP and persist it to the database.
   * Any existing OTP for the same requester+target pair is replaced.
   */
  async generateOTP(requesterEmail, targetEmail, targetRole, purpose = 'super_admin_creation') {
    const OtpToken = getModel();
    const otp = crypto.randomInt(100000, 999999).toString();
    const rEmail = requesterEmail.toLowerCase();
    const tEmail = targetEmail.toLowerCase();

    // Remove any previous OTP for this pair
    await OtpToken.destroy({
      where: { requester_email: rEmail, target_email: tEmail },
    });

    await OtpToken.create({
      requester_email: rEmail,
      target_email: tEmail,
      otp_code: otp,
      target_role: targetRole || null,
      purpose,
      attempts: 0,
      is_verified: false,
      expires_at: new Date(Date.now() + OTP_EXPIRY_MS),
    });

    // Clean up expired tokens in the background
    this._cleanup().catch(() => {});

    return otp;
  }

  /**
   * Verify an OTP.  Marks is_verified = true on success (does NOT delete).
   * Throws on failure.
   */
  async verifyOTP(requesterEmail, targetEmail, providedOTP) {
    const OtpToken = getModel();
    const rEmail = requesterEmail.toLowerCase();
    const tEmail = targetEmail.toLowerCase();

    const token = await OtpToken.findOne({
      where: { requester_email: rEmail, target_email: tEmail },
      order: [['created_at', 'DESC']],
    });

    if (!token) {
      throw new Error('No OTP found. Please request a new OTP.');
    }

    if (new Date() > new Date(token.expires_at)) {
      await token.destroy();
      throw new Error('OTP has expired. Please request a new one.');
    }

    token.attempts += 1;
    if (token.attempts > MAX_ATTEMPTS) {
      await token.destroy();
      throw new Error('Too many failed attempts. Please request a new OTP.');
    }

    if (token.otp_code !== providedOTP) {
      await token.save();
      throw new Error('Invalid OTP. Please try again.');
    }

    // Mark verified — keep record so createSuperAdmin can check it
    token.is_verified = true;
    await token.save();
    return true;
  }

  /**
   * Check if an OTP has been verified for a given requester + target pair.
   * Used by the creation endpoint to ensure OTP was verified before creating.
   * Consumes (deletes) the token on success.
   */
  async checkVerified(requesterEmail, targetEmail) {
    const OtpToken = getModel();
    const rEmail = requesterEmail.toLowerCase();
    const tEmail = targetEmail.toLowerCase();

    const token = await OtpToken.findOne({
      where: {
        requester_email: rEmail,
        target_email: tEmail,
        is_verified: true,
      },
      order: [['created_at', 'DESC']],
    });

    if (!token) {
      throw new Error('OTP not verified. Please verify your OTP first.');
    }

    if (new Date() > new Date(token.expires_at)) {
      await token.destroy();
      throw new Error('OTP has expired. Please request a new one.');
    }

    // Consume the verified token
    await token.destroy();
    return true;
  }

  /**
   * Remove expired OTP tokens from the database.
   */
  async _cleanup() {
    const OtpToken = getModel();
    await OtpToken.destroy({
      where: { expires_at: { [Op.lt]: new Date() } },
    });
  }
}

module.exports = new OTPService();
