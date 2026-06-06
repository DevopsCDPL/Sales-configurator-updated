/**
 * Document Data Mapper — Main Entry Point
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  FUTURE DESIGN NOTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  This mapper layer will become the SINGLE SOURCE OF TRUTH for all
 *  document data in Forge i-DAS.
 *
 *  Currently, documents may directly read data from multiple modules
 *  (Estimation, Quotation, Vendor PO, Work Order, Production, Quality,
 *  Logistics, Invoice). This can cause data inconsistencies when the
 *  same field is derived differently in different places.
 *
 *  In the future, every document generation function should call the
 *  appropriate DocumentDataMapper method instead of querying modules
 *  directly:
 *
 *    RFQ PDF           →  DocumentDataMapper.getRFQData(projectId)
 *    Vendor PO PDF     →  DocumentDataMapper.getVendorPOData(projectId)
 *    Work Order PDF    →  DocumentDataMapper.getWorkOrderData(projectId)
 *    Production Doc    →  DocumentDataMapper.getProductionData(projectId)
 *    COC PDF           →  DocumentDataMapper.getCOCData(projectId)
 *    Invoice PDF       →  DocumentDataMapper.getInvoiceData(projectId)
 *
 *  This ensures a single, consistent data pipeline for every document
 *  type. Combined with the DocumentSnapshotService, it also allows
 *  point-in-time snapshots so reprints always match the original.
 *
 *  IMPORTANT: These functions are NOT used anywhere in the system yet.
 *  They exist solely as architecture preparation for future integration.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { getRFQData } = require('./rfqDataMapper');
const { getVendorPOData } = require('./vendorPODataMapper');
const { getWorkOrderData } = require('./workOrderDataMapper');
const { getProductionData } = require('./productionDataMapper');
const { getCOCData } = require('./cocDataMapper');
const { getInvoiceData } = require('./invoiceDataMapper');

const DocumentDataMapper = {
  getRFQData,
  getVendorPOData,
  getWorkOrderData,
  getProductionData,
  getCOCData,
  getInvoiceData,
};

module.exports = { DocumentDataMapper };
