/**
 * Platform Admin Controller
 * Handles all platform-level admin operations.
 */
const fs = require('fs').promises;
const path = require('path');
const platformAdminService = require('../services/platformAdminService');

/** Read an uploaded logo file and return a base64 data-URI string */
async function _logoToBase64(file) {
  try {
    const buf = await fs.readFile(file.path);
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch (err) {
    console.warn('Logo base64 conversion failed:', err.message);
    return null;
  }
}

const platformAdminController = {
  // ── Dashboard ───────────────────────────────────────────────────────────
  getDashboardStats: async (req, res) => {
    try {
      const stats = await platformAdminService.getDashboardStats();
      res.json({ success: true, data: stats });
    } catch (err) {
      console.error('Platform admin dashboard error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ── Company Management ──────────────────────────────────────────────────
  getAllCompanies: async (req, res) => {
    try {
      const companies = await platformAdminService.getAllCompanies(req.query);
      res.json({ success: true, data: companies });
    } catch (err) {
      console.error('Get companies error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getCompanyById: async (req, res) => {
    try {
      const company = await platformAdminService.getCompanyById(req.params.id);
      res.json({ success: true, data: company });
    } catch (err) {
      const status = err.message === 'Company not found' ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  createCompany: async (req, res) => {
    try {
      const data = { ...req.body };
      if (req.file) {
        data.logo_url = `/uploads/logos/${req.file.filename}`;
        data.logo_data = await _logoToBase64(req.file);
      }
      const result = await platformAdminService.createCompany(data);
      // Sync logo to R2 after create (now we have company id)
      if (req.file) {
        const r2 = require('../services/r2StorageService');
        r2.syncFileToR2(req.file.path, { companyId: result.id, section: 'logos' })
          .catch(e => console.error('[R2] Logo sync failed:', e.message));
      }
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('already exists') ? 409 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  updateCompany: async (req, res) => {
    try {
      const data = { ...req.body };
      if (req.file) {
        data.logo_url = `/uploads/logos/${req.file.filename}`;
        data.logo_data = await _logoToBase64(req.file);
        // Sync to R2 cloud storage
        const r2 = require('../services/r2StorageService');
        r2.syncFileToR2(req.file.path, { companyId: req.params.id, section: 'logos' })
          .catch(e => console.error('[R2] Logo sync failed:', e.message));
      }
      const company = await platformAdminService.updateCompany(req.params.id, data);
      res.json({ success: true, data: company });
    } catch (err) {
      const status = err.message === 'Company not found' ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  activateCompany: async (req, res) => {
    try {
      const company = await platformAdminService.activateCompany(req.params.id);
      res.json({ success: true, data: company, message: 'Company activated' });
    } catch (err) {
      const status = err.message === 'Company not found' ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  deactivateCompany: async (req, res) => {
    try {
      const company = await platformAdminService.deactivateCompany(req.params.id);
      res.json({ success: true, data: company, message: 'Company deactivated' });
    } catch (err) {
      const status = err.message === 'Company not found' ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  resetCompanyAdminPassword: async (req, res) => {
    try {
      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      const result = await platformAdminService.resetCompanyAdminPassword(req.params.id, password);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  // ── Company User Management ─────────────────────────────────────────────
  getCompanyUsers: async (req, res) => {
    try {
      const result = await platformAdminService.getCompanyUsers(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message === 'Company not found' ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  addCompanyUser: async (req, res) => {
    try {
      const user = await platformAdminService.addCompanyUser(req.params.id, req.body);
      res.status(201).json({ success: true, data: user });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('already exists') || err.message.includes('limit') ? 409 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  updateCompanyUser: async (req, res) => {
    try {
      const user = await platformAdminService.updateCompanyUser(req.params.id, req.params.userId, req.body);
      res.json({ success: true, data: user });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  deleteCompanyUser: async (req, res) => {
    try {
      const result = await platformAdminService.deleteCompanyUser(req.params.id, req.params.userId);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('last admin') ? 400 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  bulkDeleteCompanyUsers: async (req, res) => {
    try {
      const { userIds } = req.body;
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ success: false, message: 'No user IDs provided' });
      }
      const result = await platformAdminService.bulkDeleteCompanyUsers(req.params.id, userIds);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('last admin') ? 400 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  // Direct bulk delete (any users, regardless of company)
  bulkDeleteUsers: async (req, res) => {
    try {
      const { userIds } = req.body;
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ success: false, message: 'No user IDs provided' });
      }
      const result = await platformAdminService.bulkDeleteUsers(userIds);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('Cannot delete') ? 400 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  getCompanyActivity: async (req, res) => {
    try {
      const activity = await platformAdminService.getCompanyActivity(req.params.id);
      res.json({ success: true, data: activity });
    } catch (err) {
      const status = err.message === 'Company not found' ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  enterCompany: async (req, res) => {
    try {
      const company = await platformAdminService.enterCompany(req.params.id);
      res.json({ success: true, data: company });
    } catch (err) {
      const status = err.message === 'Company not found' ? 404 : err.message === 'Company is inactive' ? 400 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  deleteCompany: async (req, res) => {
    try {
      const result = await platformAdminService.deleteCompany(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message === 'Company not found' ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  // ── Platform Admin Users ────────────────────────────────────────────────
  getPlatformAdmins: async (req, res) => {
    try {
      const admins = await platformAdminService.getPlatformAdmins();
      res.json({ success: true, data: admins });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  createPlatformAdmin: async (req, res) => {
    try {
      const admin = await platformAdminService.createPlatformAdmin(req.body);
      res.status(201).json({ success: true, data: admin });
    } catch (err) {
      const status = err.message.includes('already exists') ? 409 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  deletePlatformAdmin: async (req, res) => {
    try {
      const result = await platformAdminService.deletePlatformAdmin(req.params.id);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('last platform') ? 400 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  updatePlatformAdmin: async (req, res) => {
    try {
      const result = await platformAdminService.updatePlatformAdmin(req.params.id, req.body);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('already exists') ? 409 : 400;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  // ── Subscription ────────────────────────────────────────────────────────
  checkSubscriptions: async (req, res) => {
    try {
      const result = await platformAdminService.checkSubscriptions();
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ── Roles & Permissions Overview ────────────────────────────────────────
  getRolesOverview: async (req, res) => {
    try {
      const data = await platformAdminService.getRolesOverview();
      res.json({ success: true, data });
    } catch (err) {
      console.error('getRolesOverview error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ── Company Owners ──────────────────────────────────────────────────────
  getCompanyOwners: async (req, res) => {
    try {
      const owners = await platformAdminService.getCompanyOwners();
      res.json({ success: true, data: owners });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ── Access Control: All Users with Filters ──────────────────────────────
  getAccessControlUsers: async (req, res) => {
    try {
      const users = await platformAdminService.getAccessControlUsers(req.query);
      res.json({ success: true, data: users });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ── Access Control: Companies with drill-down info ──────────────────────
  getAccessControlCompanies: async (req, res) => {
    try {
      const companies = await platformAdminService.getAccessControlCompanies();
      res.json({ success: true, data: companies });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ── Reset any user's password ───────────────────────────────────────────
  resetUserPassword: async (req, res) => {
    try {
      const { password } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      }
      const result = await platformAdminService.resetUserPassword(req.params.userId, password);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },

  // ── User Activity Search ──────────────────────────────────────────────
  getUserActivity: async (req, res) => {
    try {
      const { user_id } = req.query;
      if (!user_id) {
        return res.status(400).json({ success: false, message: 'user_id query parameter is required' });
      }
      const result = await platformAdminService.getUserActivity(user_id);
      res.json({ success: true, data: result });
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    }
  },
};

module.exports = platformAdminController;
