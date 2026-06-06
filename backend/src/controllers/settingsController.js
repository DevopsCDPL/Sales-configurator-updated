const settingsService = require('../services/settingsService');

class SettingsController {
  async getCompany(req, res, next) {
    try {
      const companyId = req.activeCompanyId || req.user?.company_id;
      const company = await settingsService.getCompanySettings(companyId);
      res.json({
        success: true,
        data: company,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching company settings:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateCompany(req, res, next) {
    try {
      const companyId = req.activeCompanyId || req.user?.company_id;
      const company = await settingsService.updateCompanySettings(req.body, companyId);
      // Verify the save by reading it back
      const verified = await settingsService.getCompanySettings(companyId);
      res.json({
        success: true,
        data: verified,
        message: 'Company settings updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating company settings:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getSystem(req, res, next) {
    try {
      const companyId = req.activeCompanyId || req.user?.company_id;
      const system = await settingsService.getSystemSettings(companyId);
      res.json({
        success: true,
        data: system,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching system settings:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateSystem(req, res, next) {
    try {
      const companyId = req.activeCompanyId || req.user?.company_id;
      const system = await settingsService.updateSystemSettings(req.body, companyId);
      // Verify the save by reading it back
      const verified = await settingsService.getSystemSettings(companyId);
      res.json({
        success: true,
        data: verified,
        message: 'System settings updated successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error updating system settings:', error);
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getAll(req, res, next) {
    try {
      const companyId = req.activeCompanyId || req.user?.company_id;
      const settings = await settingsService.getAllSettings(companyId);
      res.json({
        success: true,
        data: settings,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error fetching all settings:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async uploadLogo(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false, 
          message: 'No file uploaded' 
        });
      }
      const companyId = req.activeCompanyId || req.user?.company_id;
      const result = await settingsService.uploadLogo(req.file, companyId);
      // Verify the upload by reading back the settings
      const verified = await settingsService.getCompanySettings(companyId);
      res.json({ 
        success: true, 
        data: verified,
        message: 'Logo uploaded successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }
}

module.exports = new SettingsController();
