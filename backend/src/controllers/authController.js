const authService = require('../services/authService');
const logger = require('../utils/logger');

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  path: '/',
};

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, REFRESH_COOKIE_OPTIONS);
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { ...REFRESH_COOKIE_OPTIONS, maxAge: 0 });
}

class AuthController {
  async register(req, res, next) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const reqInfo = {
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'] || null,
        device: req.headers['user-agent'] ? (req.headers['user-agent'].includes('Mobile') ? 'mobile' : 'desktop') : null,
      };
      const result = await authService.login(email, password, reqInfo);
      // 2FA pending — no tokens yet
      if (result.requires2FA) {
        return res.json({ success: true, data: result });
      }
      const { refreshToken, ...responseData } = result;
      setRefreshCookie(res, refreshToken);
      res.json({ success: true, data: responseData });
    } catch (error) {
      const msg = error?.message || 'Login failed';
      logger.error({ msg, name: error?.name, original: error?.original?.message || '' }, 'Login error');
      const isInternalError = msg.includes('column') || msg.includes('relation') || msg.includes('connect') || msg.includes('authentication failed') || msg.includes('ECONNREFUSED') || msg.includes('does not exist') || msg.includes('timeout');
      res.status(401).json({
        success: false,
        message: isInternalError ? 'Login temporarily unavailable. Please try again shortly.' : msg
      });
    }
  }

  async getProfile(req, res, next) {
    try {
      const user = await authService.getProfile(req.user.id);
      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      const result = await authService.changePassword(req.user.id, currentPassword, newPassword);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getContactAdmin(req, res, next) {
    try {
      const { email } = req.body;
      const result = await authService.getContactAdmin(email);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async verifyOtp(req, res, next) {
    try {
      const { userId, otp } = req.body;
      const reqInfo = {
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'] || null,
        device: req.headers['user-agent'] ? (req.headers['user-agent'].includes('Mobile') ? 'mobile' : 'desktop') : null,
      };
      const result = await authService.verifyOtp(userId, otp, reqInfo);
      const { refreshToken, ...responseData } = result;
      setRefreshCookie(res, refreshToken);
      res.json({ success: true, data: responseData });
    } catch (error) {
      res.status(401).json({ success: false, message: error.message });
    }
  }

  async refresh(req, res, next) {
    try {
      const refreshToken = req.cookies?.[REFRESH_COOKIE];
      const result = await authService.verifyRefreshToken(refreshToken);
      res.json({ success: true, data: result });
    } catch (error) {
      clearRefreshCookie(res);
      res.status(401).json({ success: false, message: error.message });
    }
  }

  async unlockAdmin(req, res, next) {
    try {
      // Simple secret check to prevent abuse
      const { secret } = req.body;
      const expectedSecret = process.env.ADMIN_UNLOCK_SECRET;
      if (!expectedSecret) {
        logger.error('[SECURITY] unlock-admin called but ADMIN_UNLOCK_SECRET env var is not set — refusing');
        return res.status(503).json({ success: false, message: 'Admin unlock is not configured on this server' });
      }

      if (!secret || secret !== expectedSecret) {
        return res.status(403).json({
          success: false,
          message: 'Invalid unlock secret'
        });
      }
      
      const result = await authService.unlockAdmin();
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new AuthController();
