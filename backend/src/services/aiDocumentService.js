/**
 * AI Document Intelligence Service
 * ------------------------------------------------------------------------------------------------------
 * Classifies uploaded documents, extracts structured data,
 * and links documents to the correct project/module.
 */

const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  DOCUMENT CLASSIFICATION
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const DOC_TYPES = {
  CLIENT_PO: { label: 'Client Purchase Order', icon: '----', keywords: ['purchase order', 'po number', 'buyer', 'order confirmation', 'order no', 'p.o.'] },
  VENDOR_QUOTE: { label: 'Vendor Quotation', icon: '----', keywords: ['quotation', 'quote', 'price list', 'proforma', 'vendor quote', 'supplier quote'] },
  INSPECTION_REPORT: { label: 'Inspection Report', icon: '----', keywords: ['inspection', 'quality report', 'test report', 'dimensional report', 'inspection certificate'] },
  QUALITY_CERT: { label: 'Quality Certificate', icon: '---', keywords: ['certificate', 'conformance', 'compliance', 'coc', 'mill cert', 'material cert', 'test certificate'] },
  SHIPPING_DOC: { label: 'Shipping Document', icon: '----', keywords: ['shipping', 'delivery', 'packing list', 'bill of lading', 'consignment', 'dispatch', 'tracking'] },
  DRAWING: { label: 'Engineering Drawing', icon: '----', keywords: ['drawing', 'blueprint', 'cad', 'engineering drawing', 'shop drawing', 'technical drawing', 'ga drawing'] },
  INVOICE: { label: 'Invoice', icon: '----', keywords: ['invoice', 'bill', 'tax invoice', 'proforma invoice', 'debit note', 'credit note'] },
  GENERAL: { label: 'General Document', icon: '----', keywords: [] },
};

/**
 * Classify document by filename and optional text content
 */
function classifyDocument(filename, textContent = '') {
  const name = (filename || '').toLowerCase();
  const text = (textContent || '').toLowerCase();
  const combined = name + ' ' + text;

  let bestType = 'GENERAL';
  let bestScore = 0;

  for (const [type, config] of Object.entries(DOC_TYPES)) {
    if (type === 'GENERAL') continue;
    let score = 0;
    for (const kw of config.keywords) {
      if (combined.includes(kw)) score += kw.split(' ').length; // multi-word keywords score higher
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  return {
    type: bestType,
    label: DOC_TYPES[bestType].label,
    icon: DOC_TYPES[bestType].icon,
    confidence: bestScore > 0 ? Math.min(bestScore / 3, 1) : 0,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  DATA EXTRACTION (pattern-based)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * Extract structured fields from text content using regex patterns.
 * Returns best-effort extracted data --- all fields are optional.
 */
function extractDataFromText(text, docType) {
  if (!text) return {};

  const data = {};

  // Common date patterns
  const dateMatch = text.match(/(?:date|dated|dt)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
  if (dateMatch) data.date = dateMatch[1];

  // PO number
  const poMatch = text.match(/(?:p\.?o\.?\s*(?:no|number|#)?|purchase\s+order\s*(?:no|number|#)?)[:\s]*([A-Z0-9\-\/]+)/i);
  if (poMatch) data.po_number = poMatch[1].trim();

  // Invoice number
  const invMatch = text.match(/(?:invoice\s*(?:no|number|#)?|inv\s*(?:no|#)?)[:\s]*([A-Z0-9\-\/]+)/i);
  if (invMatch) data.invoice_number = invMatch[1].trim();

  // Company/Customer name (near "to:", "customer:", "buyer:", "bill to:")
  const custMatch = text.match(/(?:to|customer|buyer|bill\s+to|ship\s+to|client)[:\s]+([A-Za-z0-9\s&.,'-]+?)(?:\n|address|phone|tel|email|gst|pin)/i);
  if (custMatch) data.customer_name = custMatch[1].trim().substring(0, 100);

  // Vendor/Supplier name
  const vendorMatch = text.match(/(?:from|vendor|supplier|seller)[:\s]+([A-Za-z0-9\s&.,'-]+?)(?:\n|address|phone|tel|email|gst|pin)/i);
  if (vendorMatch) data.vendor_name = vendorMatch[1].trim().substring(0, 100);

  // Quantity
  const qtyMatch = text.match(/(?:qty|quantity|nos|pcs|pieces|numbers)[:\s]*(\d+)/i);
  if (qtyMatch) data.quantity = parseInt(qtyMatch[1]);

  // Amount/Total
  const amountMatch = text.match(/(?:total|amount|grand\s+total|net\s+amount)[:\s]*[---$]?\s*([\d,]+\.?\d*)/i);
  if (amountMatch) data.total_amount = parseFloat(amountMatch[1].replace(/,/g, ''));

  // Part/item description
  const partMatch = text.match(/(?:part|item|description|material|component)[:\s]+([A-Za-z0-9\s\-\/.,]+)/i);
  if (partMatch) data.part_description = partMatch[1].trim().substring(0, 200);

  // Delivery date
  const delMatch = text.match(/(?:delivery|deliver|ship\s+by|due\s+date|required\s+by)[:\s]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
  if (delMatch) data.delivery_date = delMatch[1];

  // Material specification
  const matMatch = text.match(/(?:material|spec|specification|grade)[:\s]+([A-Za-z0-9\s\-\/.,]+)/i);
  if (matMatch) data.material_spec = matMatch[1].trim().substring(0, 100);

  // GST Number
  const gstMatch = text.match(/(?:gstin|gst\s*(?:no|number)?)[:\s]*([0-9A-Z]{15})/i);
  if (gstMatch) data.gst_number = gstMatch[1];

  return data;
}

/**
 * Format extracted data as a confirmation message
 */
function formatExtractedData(classification, extractedData) {
  const type = classification.label;
  const icon = classification.icon;
  const fields = Object.entries(extractedData).filter(([, v]) => v);

  if (fields.length === 0) {
    return {
      message: `${icon} I detected this as a **${type}**.\n\nI couldn't extract specific data --- the document may need manual review.`,
      hasData: false,
    };
  }

  const fieldLabels = {
    date: 'Date',
    po_number: 'PO Number',
    invoice_number: 'Invoice Number',
    customer_name: 'Customer',
    vendor_name: 'Vendor',
    quantity: 'Quantity',
    total_amount: 'Total Amount',
    part_description: 'Part/Item',
    delivery_date: 'Delivery Date',
    material_spec: 'Material',
    gst_number: 'GST Number',
  };

  const formatted = fields
    .map(([key, val]) => `--- **${fieldLabels[key] || key}**: ${typeof val === 'number' ? val.toLocaleString() : val}`)
    .join('\n');

  let suggestion = '';
  if (classification.type === 'CLIENT_PO') {
    suggestion = '\n\nWould you like me to create a project from this PO?';
  } else if (classification.type === 'VENDOR_QUOTE') {
    suggestion = '\n\nWould you like to link this to an existing RFQ?';
  } else if (classification.type === 'INVOICE') {
    suggestion = '\n\nWould you like to match this to a project?';
  }

  return {
    message: `${icon} I detected this as a **${type}**.\n\n**Extracted Data:**\n${formatted}${suggestion}`,
    hasData: true,
    suggestedAction: classification.type === 'CLIENT_PO' ? 'create_project_from_po' : null,
  };
}

module.exports = {
  DOC_TYPES,
  classifyDocument,
  extractDataFromText,
  formatExtractedData,
};
