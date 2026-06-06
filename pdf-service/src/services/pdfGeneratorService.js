'use strict';
/**
 * Routes PDF generation requests to the appropriate generator.
 */

const { generateQuotationPdf }              = require('../generators/quotation');
const { generateWorkOrderPdf }              = require('../generators/workOrder');
const { generateProductionTravellerPdf }    = require('../generators/productionTraveller');
const { generateCoCPdf }                    = require('../generators/coc');
const { generatePackingListPdf }            = require('../generators/packingList');
const { generateRFQPdf }                    = require('../generators/rfq');
const { generateVendorPOPdf }               = require('../generators/vendorPo');
const { generateInvoicePdf }               = require('../generators/invoice');
const { generateConfiguratorQuotationPdf }  = require('../generators/configuratorQuotation');

const generators = {
  quotation:                generateQuotationPdf,
  work_order:               generateWorkOrderPdf,
  production_traveller:     generateProductionTravellerPdf,
  coc:                      generateCoCPdf,
  job_coc:                  generateCoCPdf,
  packing_list:             generatePackingListPdf,
  rfq:                      generateRFQPdf,
  vendor_po:                generateVendorPOPdf,
  invoice:                  generateInvoicePdf,
  configurator_quotation:   generateConfiguratorQuotationPdf,
};

/**
 * Generate a PDF buffer for the given type.
 * @param {string} type
 * @param {object} payload
 * @returns {Promise<Buffer>}
 */
async function generatePdf(type, payload) {
  const gen = generators[type];
  if (!gen) {
    const err = new Error(`Unknown PDF type: "${type}". Supported: ${Object.keys(generators).join(', ')}`);
    err.status = 400;
    throw err;
  }
  const buffer = await gen(payload);
  return buffer;
}

module.exports = { generatePdf };

