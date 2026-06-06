const permissionTemplateService = require('../services/permissionTemplateService');

const permissionTemplateController = {
  getAll: async (req, res) => {
    try {
      const templates = await permissionTemplateService.getAll(req.user);
      res.json(templates);
    } catch (err) {
      console.error('Error getting permission templates:', err);
      res.status(500).json({ error: err.message });
    }
  },

  getById: async (req, res) => {
    try {
      const template = await permissionTemplateService.getById(req.params.id, req.user);
      res.json(template);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
    }
  },

  create: async (req, res) => {
    try {
      const template = await permissionTemplateService.create(req.body, req.user);
      res.status(201).json(template);
    } catch (err) {
      const status = err.message.includes('Insufficient') ? 403 : 500;
      res.status(status).json({ error: err.message });
    }
  },

  update: async (req, res) => {
    try {
      const template = await permissionTemplateService.update(req.params.id, req.body, req.user);
      res.json(template);
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('Only Main') || err.message.includes('Cannot edit') ? 403 : 500;
      res.status(status).json({ error: err.message });
    }
  },

  clone: async (req, res) => {
    try {
      const { name } = req.body;
      const template = await permissionTemplateService.clone(req.params.id, name, req.user);
      res.status(201).json(template);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
    }
  },

  applyToUser: async (req, res) => {
    try {
      const { userId } = req.body;
      const user = await permissionTemplateService.applyToUser(req.params.id, userId, req.user);
      res.json(user);
    } catch (err) {
      res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
    }
  },

  delete: async (req, res) => {
    try {
      const result = await permissionTemplateService.delete(req.params.id, req.user);
      res.json(result);
    } catch (err) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('Only Main') || err.message.includes('Cannot delete') ? 403 : 500;
      res.status(status).json({ error: err.message });
    }
  },
};

module.exports = permissionTemplateController;
