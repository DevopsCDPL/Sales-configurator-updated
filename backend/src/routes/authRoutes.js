const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { passwordStrength } = require('../middleware/passwordPolicy');
const rateLimit = require('express-rate-limit');
const { Session } = require('../models');

// Rate limiter for auth endpoints — 20 attempts per 15 minutes per IP.
// Limits brute-force on login; also protects register from bulk account creation.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later.' },
});

// Register
router.post(
  '/register',
  authLimiter,
  validate([
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    passwordStrength('password'),
    body('role').optional().isIn(['admin', 'user', 'sales_engineer']).withMessage('Invalid role'),
  ]),
  authController.register
);

// Login
router.post(
  '/login',
  authLimiter,
  validate([
    body('email').notEmpty().withMessage('Email or User ID is required'),
    body('password').notEmpty().withMessage('Password is required')
  ]),
  authController.login
);

// Get profile (protected)
router.get('/profile', authenticate, authController.getProfile);

// Change password (protected)
router.post(
  '/change-password',
  authenticate,
  validate([
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    passwordStrength('newPassword'),
  ]),
  authController.changePassword
);

// Verify 2FA OTP — public (no JWT yet); issues JWT on success
router.post(
  '/verify-2fa',
  authLimiter,
  validate([
    body('userId').notEmpty().withMessage('userId is required'),
    body('otp').notEmpty().withMessage('OTP is required'),
  ]),
  authController.verifyOtp
);

// Refresh access token using httpOnly refresh token cookie.
// Rate limited to mitigate brute-forcing refresh token values from stolen/compromised cookies.
router.post('/refresh', authLimiter, authController.refresh);

// Get contact admin email (public --- used on login page before auth).
// Rate limited to prevent user-enumeration abuse.
router.post(
  '/contact-admin',
  authLimiter,
  validate([
    body('email').isEmail().withMessage('Valid email is required')
  ]),
  authController.getContactAdmin
);

// Emergency admin unlock (requires ADMIN_UNLOCK_SECRET as body.secret).
// Rate limited to prevent brute-forcing the secret.
router.post('/unlock-admin', authLimiter, authController.unlockAdmin);

// Logout — invalidates the current session and clears the refresh token cookie
router.post('/logout', authenticate, async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await Session.update(
        { is_active: false, revoked_at: new Date(), revoked_by: req.user.id },
        { where: { token_hash: tokenHash, is_active: true } }
      );
    }
    // Clear the refresh token cookie regardless
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
