const recycleBinService = require('../services/recycleBinService');

class RecycleBinController {
  async list(req, res, next) {
    try {
      const { module, search, page, limit } = req.query;
      const data = await recycleBinService.list({
        module, search, page: parseInt(page) || 1, limit: parseInt(limit) || 50,
        requestingUser: req.user,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async restore(req, res, next) {
    try {
      const { module, id } = req.params;
      const result = await recycleBinService.restore(module, id, req.user);
      res.json({ success: true, data: result });
    } catch (error) {
      const status = error.message.includes('only') || error.message.includes('Only') ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  async permanentDelete(req, res, next) {
    try {
      const { module, id } = req.params;
      const result = await recycleBinService.permanentDelete(module, id, req.user);
      res.json({ success: true, data: result });
    } catch (error) {
      const status = error.message.includes('Only') ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  async bulkRestore(req, res) {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'items array is required' });
      }
      const result = await recycleBinService.bulkRestore(items, req.user);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  async bulkPermanentDelete(req, res) {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'items array is required' });
      }
      const result = await recycleBinService.bulkPermanentDelete(items, req.user);
      res.json({ success: true, data: result });
    } catch (error) {
      const status = error.message.includes('Only') ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
    }
  }
}

module.exports = new RecycleBinController();
