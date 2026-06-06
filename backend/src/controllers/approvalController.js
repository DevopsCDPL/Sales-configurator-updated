const approvalService = require('../services/approvalService');

const approvalController = {
  async getAll(req, res) {
    try {
      const { status, type, page = 1, limit = 20 } = req.query;
      const result = await approvalService.getAll(req.user, {
        status, type, page: parseInt(page), limit: parseInt(limit),
      });
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async getById(req, res) {
    try {
      const workflow = await approvalService.getById(req.params.id);
      res.json({ success: true, data: workflow });
    } catch (err) {
      res.status(404).json({ success: false, message: err.message });
    }
  },

  async create(req, res) {
    try {
      const workflow = await approvalService.createRequest(req.body, req.user);
      res.status(201).json({ success: true, data: workflow });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  async approve(req, res) {
    try {
      const workflow = await approvalService.approve(req.params.id, req.user, req.body.comment);
      res.json({ success: true, data: workflow, message: 'Workflow approved' });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  async reject(req, res) {
    try {
      const workflow = await approvalService.reject(req.params.id, req.user, req.body.comment);
      res.json({ success: true, data: workflow, message: 'Workflow rejected' });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  async cancel(req, res) {
    try {
      const workflow = await approvalService.cancel(req.params.id, req.user);
      res.json({ success: true, data: workflow, message: 'Workflow cancelled' });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  async getPendingCount(req, res) {
    try {
      const count = await approvalService.getPendingCount(req.user);
      res.json({ success: true, data: { count } });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async getTypes(req, res) {
    const types = approvalService.getWorkflowTypes();
    res.json({ success: true, data: types });
  },
};

module.exports = approvalController;
