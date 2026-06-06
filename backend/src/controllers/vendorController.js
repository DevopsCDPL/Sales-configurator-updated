const vendorService = require('../services/vendorService');

class VendorController {
  async getAll(req, res, next) {
    try {
      const vendors = await vendorService.getAllVendors(req.query, req.user);
      res.json({
        success: true,
        data: vendors
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const vendor = await vendorService.getVendorById(req.params.id, req.user);
      res.json({
        success: true,
        data: vendor
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
      const vendor = await vendorService.createVendor(req.body, req.user);
      res.status(201).json({
        success: true,
        data: vendor
      });
    } catch (error) {
      const status = error.message.includes('permission') ? 403 : 400;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async update(req, res, next) {
    try {
      const vendor = await vendorService.updateVendor(req.params.id, req.body, req.user);
      res.json({
        success: true,
        data: vendor
      });
    } catch (error) {
      const status = error.message.includes('permission') || error.message.includes('only') ? 403 : 400;
      res.status(status).json({
        success: false,
        message: error.message
      });
    }
  }

  async delete(req, res, next) {
    try {
      const result = await vendorService.deleteVendor(req.params.id, req.user);
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

  /**
   * GET /vendors/materials/all
   * Returns all vendor materials (for Estimation dropdown).
   */
  async getAllMaterials(req, res, next) {
    try {
      const materials = await vendorService.getAllVendorMaterials(req.user);
      res.json({
        success: true,
        data: materials
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new VendorController();
