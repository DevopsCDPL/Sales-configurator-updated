/**
 * Tenant Isolation Middleware
 * 
 * Enforces company-based data segregation by injecting company_id
 * filters into every request. This ensures strict multi-tenant separation.
 */

/**
 * Enforces tenant context on requests.
 * - main_admin: bypass (can see all tenants)
 * - admin / user: restricted to their own company_id
 */
const enforceTenant = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  // Super Admin and Platform Admin can access all tenants --- optionally filter by ?company_id=
  if (req.user.role === 'main_admin' || req.user.role === 'platform_admin') {
    req.tenantId = req.query.tenant_id || req.body?.tenant_id || null;
    return next();
  }

  // For admin and user, enforce their company
  if (!req.user.company_id) {
    return res.status(403).json({
      success: false,
      message: 'No company association found. Contact your administrator.',
    });
  }

  req.tenantId = req.user.company_id;

  // Prevent tenant spoofing: if body or query has company_id, it MUST match
  if (req.body?.company_id && req.body.company_id !== req.user.company_id) {
    return res.status(403).json({
      success: false,
      message: 'Tenant access violation: cannot access another company\'s data.',
    });
  }

  if (req.query?.company_id && req.query.company_id !== req.user.company_id) {
    return res.status(403).json({
      success: false,
      message: 'Tenant access violation: cannot query another company\'s data.',
    });
  }

  next();
};

/**
 * IP Whitelist middleware for companies with ip_whitelist set
 */
const enforceIpWhitelist = async (req, res, next) => {
  if (!req.user || req.user.role === 'main_admin' || req.user.role === 'platform_admin') return next();

  try {
    const { Company } = require('../models');
    if (!req.user.company_id) return next();

    const company = await Company.findByPk(req.user.company_id, {
      attributes: ['ip_whitelist'],
    });

    if (company?.ip_whitelist?.length > 0) {
      const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
      if (!company.ip_whitelist.includes(clientIp)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: IP not whitelisted for this company.',
        });
      }
    }

    next();
  } catch (err) {
    next(); // Don't block on whitelist check errors
  }
};

module.exports = { enforceTenant, enforceIpWhitelist };
