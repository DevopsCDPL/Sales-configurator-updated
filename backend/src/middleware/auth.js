const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User, Setting, Session } = require('../models');
const { CO_ADMIN_SLOTS, SUPER_ADMIN_ENTERPRISE_ALLOWED } = require('../config/rolePermissions');

/**
 * Check if a user is an assigned co-admin (Owner/Co-Owner/Backup).
 * If no assignments exist yet (initial setup), any main_admin is co-admin.
 */
async function checkIsCoAdmin(user) {
  if (!user || user.role !== 'main_admin') return false;
  try {
    const companyId = user.company_id;
    // Try company-scoped key first, then fall back to global
    const scopedKey = companyId ? `co_admin_assignments:${companyId}` : 'co_admin_assignments';
    let setting = await Setting.findByPk(scopedKey);
    if (!setting && companyId) {
      setting = await Setting.findByPk('co_admin_assignments');
    }
    const assignments = setting?.value;
    if (!assignments || !assignments.owner?.email) {
      return true; // setup mode: any main_admin is co-admin
    }
    const lower = user.email.toLowerCase();
    return CO_ADMIN_SLOTS.some(s => {
      const assigned = assignments[s.key]?.email;
      return assigned && assigned.toLowerCase() === lower;
    });
  } catch {
    return user.role === 'main_admin'; // fallback
  }
}

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid token.'
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Session revocation check — reject tokens whose session was invalidated server-side
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = await Session.findOne({
      where: { token_hash: tokenHash, is_active: true },
      attributes: ['id'],
    });
    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session expired or revoked. Please login again.',
      });
    }
    // Update last activity timestamp without blocking the request
    Session.update({ last_activity_at: new Date() }, { where: { id: session.id } }).catch(() => {});

    // Use explicit attributes to avoid columns that may not exist yet
    // (e.g. custom_role_id added by a pending migration/sync).
    const user = await User.findByPk(decoded.userId, {
      attributes: [
        'id', 'name', 'email', 'role', 'is_active',
        'company_name', 'company_id', 'created_by', 'modules', 'module_permissions', 'position',
      ],
    });
    
    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive.'
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      position: user.position || '',
      company_name: user.company_name,
      company_id: user.company_id,
      created_by: user.created_by,
      module_permissions: user.module_permissions || {},
    };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired. Please login again.'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Authentication error.'
    });
  }
};

// Valid User.role ENUM values
const REAL_ROLES = new Set(['platform_admin', 'main_admin', 'admin', 'user', 'sales_engineer']);

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    // platform_admin and main_admin have access to everything
    if (req.user.role === 'platform_admin' || req.user.role === 'main_admin') {
      return next();
    }

    // Separate real roles from module permission names
    const roles = allowedRoles.filter((r) => REAL_ROLES.has(r));
    const modules = allowedRoles.filter((r) => !REAL_ROLES.has(r));

    // Check real role match first
    if (roles.includes(req.user.role)) {
      return next();
    }

    // For 'user' / 'sales_engineer' role: check module_permissions for module-based access
    // e.g. authorize('admin', 'production') allows admin role OR any user/sales_engineer
    // whose module_permissions includes { production: true }
    if ((req.user.role === 'user' || req.user.role === 'sales_engineer') && modules.length > 0) {
      const perms = req.user.module_permissions || {};
      const hasModuleAccess = modules.some((m) => perms[m] === true);
      if (hasModuleAccess) {
        return next();
      }
    }

    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action.'
    });
  };
};

/**
 * Middleware: Owner/Co-Owner/Super Admin (all main_admins) can proceed.
 * Used to protect Administration module routes.
 */
const requireCoAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  // All main_admin and platform_admin users have full access
  if (req.user.role === 'main_admin' || req.user.role === 'platform_admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Only Owner, Co-Owner, or Super Admin can access this resource.' });
};

/**
 * Middleware: Platform Admin only.
 * Only platform_admin role can proceed.
 */
const requirePlatformAdmin = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  if (req.user.role === 'platform_admin') {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Platform admin access required.' });
};

/**
 * Middleware: Protects Enterprise module routes.
 * - Owner/Co-Owner/Super Admin (all main_admin) → full enterprise access
 * - Admin / User / Sales Engineer → no enterprise access
 *
 * @param {string} feature - The enterprise sub-feature name (e.g. 'risk', 'sessions', 'custom-roles', 'approvals')
 */
const requireEnterprise = (feature) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    // All main_admin and platform_admin users get full enterprise access
    if (req.user.role === 'main_admin' || req.user.role === 'platform_admin') {
      return next();
    }

    return res.status(403).json({ success: false, message: 'You do not have permission to access this resource.' });
  };
};

module.exports = { authenticate, authorize, checkIsCoAdmin, requireCoAdmin, requireEnterprise, requirePlatformAdmin };
