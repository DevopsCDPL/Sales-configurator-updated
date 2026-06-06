/**
 * Document Number Generator Utility
 * 
 * This utility provides a convenient interface for other services to generate
 * document numbers using the centralized numbering system.
 */

const documentNumberingService = require('../services/documentNumberingService');

class DocumentNumberGeneratorUtil {
  /**
   * Generate a number for the given document type
   * Returns the formatted number string
   */
  static async generateNumber(documentType, companyId) {
    try {
      return await documentNumberingService.generateNumber(documentType, companyId);
    } catch (error) {
      console.error(`Failed to generate ${documentType}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate numbers for multiple document types in a single call
   * Returns an object with documentType: number mapping
   */
  static async generateMultiple(documentTypes, companyId) {
    try {
      const results = {};
      for (const docType of documentTypes) {
        results[docType] = await documentNumberingService.generateNumber(docType, companyId);
      }
      return results;
    } catch (error) {
      console.error('Failed to generate multiple numbers:', error.message);
      throw error;
    }
  }

  /**
   * Get a preview of the next number without incrementing
   */
  static async getPreview(documentType, companyId) {
    try {
      const previewData = await documentNumberingService.generatePreview(documentType, companyId);
      return previewData.preview;
    } catch (error) {
      console.error(`Failed to get preview for ${documentType}:`, error.message);
      throw error;
    }
  }

  /**
   * Get configuration for a document type
   */
  static async getConfig(documentType) {
    try {
      return await documentNumberingService.getConfiguration(documentType);
    } catch (error) {
      console.error(`Failed to get config for ${documentType}:`, error.message);
      throw error;
    }
  }
}

module.exports = DocumentNumberGeneratorUtil;
