const clientService = require('../services/clientService');

class ClientController {
  async getAll(req, res, next) {
    try {
      const clients = await clientService.getAllClients(req.query, req.user);
      res.json({
        success: true,
        data: clients
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const client = await clientService.getClientById(req.params.id, req.user);
      res.json({
        success: true,
        data: client
      });
    } catch (error) {
      const status = error.message.includes('access') ? 403 : 404;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async create(req, res, next) {
    try {
      // Inject active tenant company_id (e.g. when platform_admin uses x-active-company-id header)
      const body = { ...req.body };
      if (!body.company_id && req.tenantScope?.company_id) {
        body.company_id = req.tenantScope.company_id;
      }
      const client = await clientService.createClient(body, req.user);
      res.status(201).json({
        success: true,
        data: client
      });
    } catch (error) {
      console.error('Client create error:', error.name, error.message);
      // Handle Sequelize validation errors with detailed messages
      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        const messages = error.errors?.map(e => e.message) || [error.message];
        return res.status(400).json({
          success: false,
          message: messages.join(', '),
          errors: error.errors
        });
      }
      const status = error.message.includes('permission') ? 403 : 400;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async update(req, res, next) {
    try {
      const client = await clientService.updateClient(req.params.id, req.body, req.user);
      res.json({
        success: true,
        data: client
      });
    } catch (error) {
      console.error('Client update error:', error.name, error.message);
      // Handle Sequelize validation errors
      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        const messages = error.errors?.map(e => e.message) || [error.message];
        return res.status(400).json({
          success: false,
          message: messages.join(', '),
          errors: error.errors
        });
      }
      const status = error.message.includes('permission') || error.message.includes('only') ? 403 : 400;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async delete(req, res, next) {
    try {
      const result = await clientService.deleteClient(req.params.id, req.user);
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      const status = error.message.includes('permission') || error.message.includes('only') ? 403 : 400;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new ClientController();
