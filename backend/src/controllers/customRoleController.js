const customRoleService = require('../services/customRoleService');

const customRoleController = {
  async getAll(req, res) {
    try {
      const roles = await customRoleService.getAll(req.user);
      res.json({ success: true, data: roles });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async getById(req, res) {
    try {
      const role = await customRoleService.getById(req.params.id);
      res.json({ success: true, data: role });
    } catch (err) {
      res.status(404).json({ success: false, message: err.message });
    }
  },

  async create(req, res) {
    try {
      const role = await customRoleService.create(req.body, req.user);
      res.status(201).json({ success: true, data: role });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  async update(req, res) {
    try {
      const role = await customRoleService.update(req.params.id, req.body, req.user);
      res.json({ success: true, data: role });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  async delete(req, res) {
    try {
      await customRoleService.delete(req.params.id, req.user);
      res.json({ success: true, message: 'Custom role deleted' });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  async clone(req, res) {
    try {
      const role = await customRoleService.clone(req.params.id, req.body.name, req.user);
      res.status(201).json({ success: true, data: role });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  async assignToUser(req, res) {
    try {
      const user = await customRoleService.assignToUser(req.params.id, req.body.user_id, req.user);
      res.json({ success: true, data: user, message: 'Role assigned' });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  },

  async getSchema(req, res) {
    const schema = customRoleService.getPermissionSchema();
    res.json({ success: true, data: schema });
  },
};

module.exports = customRoleController;
