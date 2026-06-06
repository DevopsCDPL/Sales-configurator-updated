# Document Numbering System - Service Integration Guide

## Overview
This guide explains how to integrate the centralized document numbering system into existing services.

## Core Principle
**Numbers are generated ONLY when a document is successfully created**, not when a project is created or when a preview is needed.

## How to Integrate

### Step 1: Import the utility
```javascript
const DocumentNumberGenerator = require('../utils/documentNumberGenerator');
```

### Step 2: Generate number on document creation
```javascript
// When creating a document, generate the number BEFORE saving
const quotationNumber = await DocumentNumberGenerator.generateNumber('quotation_number');

// Then save the document with the generated number
await Project.create({
  // ... other fields
  quotation_number: quotationNumber,
});
```

### Step 3: Handle preview requests (optional)
```javascript
// For UI that wants to see what the next number will be
const preview = await DocumentNumberGenerator.getPreview('quotation_number');
```

## Document Type Constants

Use these constants (from documentNumberingService.DOCUMENT_TYPES):

### Project Flow
- `PROJECT_NUMBER` - Project Number
- `QUOTATION_NUMBER` - Quotation Number
- `CLIENT_PO_NUMBER` - Client PO Number
- `VENDOR_PO_NUMBER` - Vendor PO Number
- `WORK_ORDER_NUMBER` - Work Order Number
- `PRODUCTION_TRAVELER_NUMBER` - Production Traveler Number
- `COC_NUMBER` - COC Number
- `PACKING_LIST_NUMBER` - Packing List Number
- `COMMERCIAL_INVOICE_NUMBER` - Commercial Invoice Number
- `TAX_INVOICE_NUMBER` - Tax Invoice Number
- `PROFORMA_INVOICE_NUMBER` - Proforma Invoice Number

### Material System
- `RAW_MATERIAL_ID` - Raw Material ID
- `PART_ID` - Part ID
- `MATERIAL_STOCK_ENTRY_ID` - Material Stock Entry ID

## Services to Update

### 1. projectService.js
- Replace `generateQuotationNumber()` with centralized call
- Add `PROJECT_NUMBER` generation when project created
- Generate `QUOTATION_NUMBER` when quotation created (not when project created)

**Current Issue:** Quotation number is generated in `generateQuotationNumber()` which uses year-based prefix. Update to use centralized system.

### 2. invoiceService.js
- Generate `COMMERCIAL_INVOICE_NUMBER` when commercial invoice created
- Generate `TAX_INVOICE_NUMBER` when tax invoice created
- Generate `PROFORMA_INVOICE_NUMBER` when proforma invoice created

### 3. workOrderService.js
- Generate `WORK_ORDER_NUMBER` when work order created

### 4. materialService.js / rawMaterialService.js
- Generate `RAW_MATERIAL_ID` when raw material created
- Generate `PART_ID` when part created
- Generate `MATERIAL_STOCK_ENTRY_ID` when stock entry created

### 5. Other services
As needed for:
- Production Traveler creation
- COC generation
- Packing List creation

## Linked References (Auto-Fill)

### Client PO & Vendor PO
**These are GENERATED in Project module and AUTO-FILLED elsewhere**

When generating:
```javascript
// In projectService when creating project
const clientPoNumber = await DocumentNumberGenerator.generateNumber('client_po_number');
const vendorPoNumber = await DocumentNumberGenerator.generateNumber('vendor_po_number');

await Project.create({
  // ...
  client_po_number: clientPoNumber,
  vendor_po_number: vendorPoNumber,
});
```

When auto-filling:
```javascript
// In other services, read from Project record
const project = await Project.findByPk(projectId);
return {
  // ...
  client_po_number: project.client_po_number, // Read-only, from project
  vendor_po_number: project.vendor_po_number, // Read-only, from project
};
```

## Concurrency & Atomicity

The `DocumentNumberGenerator.generateNumber()` uses:
1. In-memory locking per document type
2. Database-level atomic updates
3. No duplicate checks needed (by design - numbers are never reused)

**Important:** Call generateNumber() BEFORE creating the document. If document creation fails, the counter still increments (this is acceptable per design).

### Alternative (if rollback needed):
```javascript
// Generate number
const number = await DocumentNumberGenerator.generateNumber('quotation_number');

try {
  // Create document with number
  await Quotation.create({ quotation_number: number, ... });
} catch (error) {
  // Document creation failed, but counter already incremented
  // This is acceptable - numbers are never reused even if document fails
  throw error;
}
```

## Testing

### 1. Verify configuration loaded
```bash
GET /api/document-numbering
# Should return all document types with their configs
```

### 2. Preview next number
```bash
GET /api/document-numbering/quotation_number/preview
# Should return { preview: "QT0001" }
```

### 3. Generate number
```bash
POST /api/document-numbering/quotation_number/generate
# Should return { number: "QT0001" }
# Second call should return { number: "QT0002" }
```

### 4. Update configuration
```bash
PUT /api/document-numbering/quotation_number
{
  "prefix": "QUOTE",
  "current_counter": 2000,
  "increment_step": 1,
  "suffix": "-2026",
  "number_length": 5
}
# Configuration saved
```

## Migration from Old System

### Current System (projectService)
```javascript
async generateQuotationNumber() {
  const year = new Date().getFullYear();
  const prefix = `QT-${year}-`;
  // ... finds last number and increments
}
```

### New System
```javascript
const DocumentNumberGenerator = require('../utils/documentNumberGenerator');

async generateQuotationNumber() {
  return await DocumentNumberGenerator.generateNumber('quotation_number');
}
```

## Data Preservation

- Existing quotation numbers (like `QT-2026-1001`) continue to work
- New documents use centralized system numbers
- No migration of old numbers required
- Old data remains unchanged

## Configuration Structure

Stored in Setting.JSONB as:
```json
{
  "document_numbering": {
    "quotation_number": {
      "prefix": "QT",
      "current_counter": 1000,
      "increment_step": 1,
      "suffix": "",
      "number_length": 4
    },
    // ... other document types
  }
}
```

## Troubleshooting

### Duplicate Numbers Generated
- Check that generation happens in transaction or before creation
- Verify in-memory locks are working (check logs for "lock" messages)

### Numbers Not Incrementing
- Verify documentNumberingService is initialized (check backend startup logs)
- Check that generateNumber() is being called (not just getPreview())

### Configuration Not Saving
- Verify Setting model is created and initialized
- Check database connection
- Verify user has admin role

## Next Steps

1. Update projectService.generateQuotationNumber()
2. Update invoiceService to generate invoice numbers
3. Update other document services (workorder, etc)
4. Test end-to-end document creation flows
5. Verify no duplicate numbers in production data
6. Test concurrent creation to verify locking works
