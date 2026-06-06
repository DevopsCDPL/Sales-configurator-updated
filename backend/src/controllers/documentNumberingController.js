const documentNumberingService = require('../services/documentNumberingService');

class DocumentNumberingController {
  /**
   * Initialize document numbering system
   */
  async initialize(req, res, next) {
    try {
      await documentNumberingService.initialize();
      res.json({
        success: true,
        message: 'Document numbering system initialized',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error initializing document numbering:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Get all configurations grouped by category
   */
  async getAll(req, res, next) {
    try {
      const companyId = req.user?.company_id || null;
      const configs = await documentNumberingService.getConfigurationsByCategory(companyId);
      res.json({
        success: true,
        data: configs,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching document numbering configurations:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Get configuration for a specific document type
   */
  async getConfiguration(req, res, next) {
    try {
      const { documentType } = req.params;
      const companyId = req.user?.company_id || null;
      const config = await documentNumberingService.getConfiguration(documentType, companyId);
      res.json({
        success: true,
        data: {
          type: documentType,
          config,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching document numbering configuration:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Save configuration for a document type
   */
  async saveConfiguration(req, res, next) {
    try {
      const { documentType } = req.params;
      const { prefix, current_counter, increment_step, suffix, number_length } = req.body;
      const companyId = req.user?.company_id || null;

      const config = await documentNumberingService.saveConfiguration(documentType, {
        prefix,
        current_counter,
        increment_step,
        suffix,
        number_length,
      }, companyId);

      res.json({
        success: true,
        message: 'Configuration saved successfully',
        data: {
          type: documentType,
          config,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error saving document numbering configuration:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Get a preview of the next number (without incrementing)
   */
  async getPreview(req, res, next) {
    try {
      const { documentType } = req.params;
      const companyId = req.user?.company_id || null;
      const preview = await documentNumberingService.generatePreview(documentType, companyId);
      res.json({
        success: true,
        data: preview,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error generating preview:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Generate a number for a document (internal use)
   * SHOULD ONLY BE CALLED by services when document is created
   */
  async generateNumber(req, res, next) {
    try {
      const { documentType } = req.params;
      const companyId = req.user?.company_id || null;
      const number = await documentNumberingService.generateNumber(documentType, companyId);
      res.json({
        success: true,
        data: { number },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error generating number:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Bulk get all configurations
   */
  async getAllConfigurations(req, res, next) {
    try {
      const configs = await documentNumberingService.getAllConfigurations();
      res.json({
        success: true,
        data: configs,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error fetching all configurations:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new DocumentNumberingController();
