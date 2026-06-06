/**
 * Document Data Types
 *
 * JSDoc type definitions for all document data structures used by the
 * Document Data Mapper layer.
 *
 * FUTURE DESIGN NOTE:
 * This mapper layer will become the single source of truth for all document
 * data in Forge i-DAS. Documents should not directly read data from modules
 * like estimation, quotation, or production. Instead they should call
 * DocumentDataMapper functions which return these typed structures.
 */

/**
 * @typedef {Object} RFQItem
 * @property {string} description
 * @property {number} quantity
 */

/**
 * @typedef {Object} RFQData
 * @property {string} rfqNumber
 * @property {string} projectName
 * @property {string} vendor
 * @property {string} rfqDate
 * @property {RFQItem[]} items
 * @property {string} instructions
 */

/**
 * @typedef {Object} VendorPOItem
 * @property {string} description
 * @property {number} quantity
 * @property {number} weight
 * @property {number} costPerWeight
 * @property {number} lineTotal
 */

/**
 * @typedef {Object} VendorPOData
 * @property {string} poNumber
 * @property {string} vendor
 * @property {string} poDate
 * @property {VendorPOItem[]} items
 * @property {number} subtotal
 * @property {number} tax
 * @property {number} total
 */

/**
 * @typedef {Object} WorkOrderItem
 * @property {string} description
 * @property {number} quantity
 * @property {string} requirements
 */

/**
 * @typedef {Object} WorkOrderData
 * @property {string} workOrderNumber
 * @property {string} projectName
 * @property {string} clientName
 * @property {string} preparedBy
 * @property {string} approvedBy
 * @property {string} issueDate
 * @property {WorkOrderItem[]} items
 * @property {string} qualityRequirements
 */

/**
 * @typedef {Object} ProductionData
 * @property {string} productionTravellerId
 * @property {string} machine
 * @property {string} operator
 * @property {string} sawCutOrBarFeed
 * @property {Array} items
 */

/**
 * @typedef {Object} COCData
 * @property {string} cocNumber
 * @property {string} productionId
 * @property {string} productDescription
 * @property {string} revision
 * @property {number} quantity
 * @property {string[]} serialNumbers
 * @property {string} materialHeatNumber
 */

/**
 * @typedef {Object} InvoiceItem
 * @property {string} description
 * @property {number} unitPrice
 * @property {number} quantity
 * @property {number} total
 */

/**
 * @typedef {Object} InvoiceData
 * @property {string} invoiceNumber
 * @property {string} invoiceDate
 * @property {string} client
 * @property {string} poNumber
 * @property {string} project
 * @property {InvoiceItem[]} items
 * @property {number} subtotal
 * @property {number} tax
 * @property {number} shipping
 * @property {number} grandTotal
 */

/**
 * @typedef {Object} DocumentSnapshot
 * @property {string} projectId
 * @property {string} documentType
 * @property {Object} data
 * @property {string} createdAt
 */

module.exports = {};
