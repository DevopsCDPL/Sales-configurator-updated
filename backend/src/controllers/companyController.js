const fs = require('fs').promises;
const path = require('path');
const companyService = require('../services/companyService');

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

const companyController = {
  getStats: async (req, res) => {
    try {
      const stats = await companyService.getStats(req.user);
      res.json(stats);
    } catch (err) {
      console.error('Error getting company stats:', err);
      res.status(500).json({ error: err.message });
    }
  },

  getAll: async (req, res) => {
    try {
      const companies = await companyService.getAll(req.user);
      res.json(companies);
    } catch (err) {
      console.error('Error getting companies:', err);
      res.status(500).json({ error: err.message });
    }
  },

  getById: async (req, res) => {
    try {
      const company = await companyService.getById(req.params.id, req.user);
      res.json(company);
    } catch (err) {
      console.error('Error getting company:', err);
      res.status(err.message === 'Company not found' ? 404 : 500).json({ error: err.message });
    }
  },

  create: async (req, res) => {
    try {
      const data = { ...req.body };
      if (req.file) {
        data.logo_url = `/uploads/logos/${req.file.filename}`;
        data.logo_data = await _logoToBase64(req.file);
      }
      const company = await companyService.create(data, req.user);
      // Sync logo to R2 after create (now we have company.id)
      if (req.file) {
        const r2 = require('../services/r2StorageService');
        r2.syncFileToR2(req.file.path, { companyId: company.id, section: 'logos' })
          .catch(e => console.error('[R2] Logo sync failed:', e.message));
      }
      res.status(201).json(company);
    } catch (err) {
      console.error('Error creating company:', err);
      const status = err.message.includes('already exists') ? 409 : err.message.includes('Only Main') ? 403 : 500;
      res.status(status).json({ error: err.message });
    }
  },

  update: async (req, res) => {
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
      if (data.remove_logo === 'true') { data.logo_url = null; data.logo_data = null; delete data.remove_logo; }
      const company = await companyService.update(req.params.id, data, req.user);
      res.json(company);
    } catch (err) {
      console.error('Error updating company:', err);
      const status = err.message === 'Company not found' ? 404 : err.message.includes('Only Main') ? 403 : 500;
      res.status(status).json({ error: err.message });
    }
  },

  delete: async (req, res) => {
    try {
      const result = await companyService.delete(req.params.id, req.user);
      res.json(result);
    } catch (err) {
      console.error('Error deleting company:', err);
      const status = err.message === 'Company not found' ? 404 : err.message.includes('Only Main') ? 403 : 500;
      res.status(status).json({ error: err.message });
    }
  },

  suspend: async (req, res) => {
    try {
      const { reason } = req.body;
      const company = await companyService.suspend(req.params.id, reason, req.user);
      res.json(company);
    } catch (err) {
      console.error('Error suspending company:', err);
      const status = err.message === 'Company not found' ? 404 : err.message.includes('Only Main') ? 403 : err.message.includes('already suspended') ? 409 : 500;
      res.status(status).json({ error: err.message });
    }
  },

  reactivate: async (req, res) => {
    try {
      const company = await companyService.reactivate(req.params.id, req.user);
      res.json(company);
    } catch (err) {
      console.error('Error reactivating company:', err);
      const status = err.message === 'Company not found' ? 404 : err.message.includes('Only Main') ? 403 : 500;
      res.status(status).json({ error: err.message });
    }
  },

  changePlan: async (req, res) => {
    try {
      const { plan } = req.body;
      if (!['free', 'starter', 'professional', 'enterprise'].includes(plan)) {
        return res.status(400).json({ error: 'Invalid plan type' });
      }
      const company = await companyService.changePlan(req.params.id, plan, req.user);
      res.json(company);
    } catch (err) {
      console.error('Error changing plan:', err);
      const status = err.message === 'Company not found' ? 404 : err.message.includes('Only Main') ? 403 : 500;
      res.status(status).json({ error: err.message });
    }
  },

  resetUserLimit: async (req, res) => {
    try {
      const { limit } = req.body;
      if (!limit || limit < 1) return res.status(400).json({ error: 'Invalid user limit' });
      const company = await companyService.resetUserLimit(req.params.id, limit, req.user);
      res.json(company);
    } catch (err) {
      console.error('Error resetting user limit:', err);
      const status = err.message === 'Company not found' ? 404 : err.message.includes('Only Main') ? 403 : 500;
      res.status(status).json({ error: err.message });
    }
  },
};

module.exports = companyController;
