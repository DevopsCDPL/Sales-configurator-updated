'use strict';
/**
 * Document Snapshot Service (Item 1) — aggregates document data through the
 * DocumentDataMapper. NOTE: point-in-time PERSISTENCE (a document_snapshots
 * table) is a deliberate follow-up; today getDocumentSnapshot recomputes a
 * fresh snapshot (correct for live data, not yet frozen-for-reprint).
 */
const { DocumentDataMapper } = require('./documentDataMapper');

const TYPE_TO_FN = {
  rfq: 'getRFQData',
  vendor_po: 'getVendorPOData',
  work_order: 'getWorkOrderData',
  production: 'getProductionData',
  coc: 'getCOCData',
  invoice: 'getInvoiceData',
};

/** @returns {Promise<import('./documentDataTypes').DocumentSnapshot | null>} */
async function createDocumentSnapshot(projectId, documentType) {
  if (!projectId) return null;
  const fn = TYPE_TO_FN[documentType];
  if (!fn || typeof DocumentDataMapper[fn] !== 'function') return null;
  const data = await DocumentDataMapper[fn](projectId);
  if (data == null) return null;
  return { projectId, documentType, data, createdAt: new Date().toISOString() };
}

/** @returns {Promise<import('./documentDataTypes').DocumentSnapshot | null>} */
async function getDocumentSnapshot(projectId, documentType) {
  // No persistence table yet — recompute (idempotent read of current data).
  return createDocumentSnapshot(projectId, documentType);
}

module.exports = { createDocumentSnapshot, getDocumentSnapshot };
