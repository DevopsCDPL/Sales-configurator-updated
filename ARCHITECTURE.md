# Architecture Standards & Data Flow

> Reference for maintaining consistency across the Forge i-DAS codebase.

---

## 1. Shared Calculation Layer

| Utility | Location | Purpose |
|---------|----------|---------|
| `calculations.js` | `backend/src/utils/calculations.js` | Currency formatting, line-item arithmetic, estimate→line-items extraction |
| `pdfValidation.js` | `backend/src/utils/pdfValidation.js` | Pre-generation validation for all PDF types |
| `pdfHeader.js` | `backend/src/utils/pdfHeader.js` | `drawGlobalHeader`, `drawGlobalFooter` for consistent PDF headers |
| `pdfTemplate.js` | `backend/src/utils/pdfTemplate.js` | Re-exports pdfHeader + shared COLORS/TABLE constants |

### When adding pricing logic

**Always use `calculations.js`** for:
- `fmtCurrency(n)` — format as `$ 1,234.56`
- `buildEstimateLineItems(estimate)` — extract line items from Estimate model
- `pickBestEstimate(estimates, selectedRevision)` — choose approved/selected/latest
- `calculateLineTotal(item, costMode)` — single line total (supports weight mode)
- `calculateSubtotal(items)` — sum of line totals
- `calculateTaxAmount(subtotal, taxType, taxPercent)` — tax calculation
- `calculateGrandTotal({subtotal, taxAmount, shippingCharges})` — grand total
- `normalizeLineItems(items)` — recalculate line_total from qty × price

**Always use `pdfValidation.js`** before generating any PDF:
- `validateInvoiceForPdf(invoice)` — check invoice data completeness
- `validateVendorPOForPdf(po, items)` — check vendor PO data
- `validateQuotationForPdf(estimate, project)` — check quotation data
- `validateWorkOrderForPdf(workOrder, project)` — check work order data

**Do NOT** re-implement price derivation inline. The invoice auto-populate, invoice PDF fallback, and quotation PDF all use the shared extraction.

---

## 2. Authentication & Authorization

### Roles
The `User.role` ENUM has three values: `main_admin`, `admin`, `user`.

### `authorize()` Middleware
```js
authorize('admin', 'production')
```
This means: allow `main_admin` (always), `admin` (real role match), OR any `user` whose `module_permissions.production === true`.

**Module permission names** (non-role strings passed to `authorize`):
- `production` — Work orders, production travellers
- `quality` — Quality records, CoC
- `logistics` — Shipment, packing lists

When `module_permissions` is set on a User, the `authorize()` middleware checks it for any string that isn't a real role name.

### Invoice Routes
All invoice routes now require `authenticate`. Create/Update require `authorize('admin', 'user')`. Delete requires `authorize('admin')`.

---

## 3. PDF Generation

### Pre-Generation Validation
Before generating any PDF, call:
```js
const { validateBeforePdf } = require('../utils/pdfValidation');
const result = validateBeforePdf('invoice', dataObject);
if (!result.valid) {
  return res.status(400).json({ errors: result.errors, warnings: result.warnings });
}
```

Supported types: `invoice`, `quotation`, `work_order`, `vendor_po`, `production_traveller`.

### PDF Service Locations
| PDF Type | Generator Location |
|----------|-------------------|
| Quotation | `documentService.js` → `_buildQuotationPdf` |
| Work Order | `documentService.js` → `generateWorkOrder` |
| Production Traveller | `workOrderService.js` → `generateJobPdf` |
| Invoice (Tax/Proforma/Commercial) | `invoiceController.js` → `generatePdf` |
| Vendor Purchase Order | `vendorProcurementService.js` → `generateVendorPOPdf` |
| RFQ Bundle | `vendorProcurementService.js` → `generateRFQBundlePdf` |
| Certificate of Conformance | `documentService.js` → `generateCoC` |
| Packing List | `documentService.js` → `generatePackingList` |

---

## 4. Estimation Calculations (SYNC WARNING)

The cost calculation formulas exist in **two places** that must stay synchronized:

| Location | Purpose |
|----------|---------|
| `backend/src/services/estimateService.js` → `PROCESS_CALCULATORS` | Server-side calculation (save, approve, PDF) |
| `frontend/src/components/ProjectTabs/EstimationTab.tsx` → `calculateModuleLocally` | Client-side instant preview |

The frontend copy exists for immediate UI feedback while typing. The backend API (`POST /api/estimates/calculate`) is the source of truth used on save/approve.

**Any formula change must be applied to both files.**

---

## 5. Data Flow: Project → Estimate → Invoice

```
Project (root)
  ├── Client (belongsTo)
  ├── Estimate[] (hasMany, revision-based)
  │     ├── custom_parts (JSONB)
  │     └── EstimateItem[] (hasMany)
  ├── SalesOrder (hasOne)
  ├── WorkOrder (hasOne)
  ├── QualityRecord (hasOne)
  ├── Invoice[] (hasMany)
  └── VendorPurchaseOrder[] (hasMany)
```

### Estimate → Invoice line items
Use `resolveEstimateLineItems(estimate)` to derive invoice line items. This is called:
1. On auto-populate (`GET /api/invoices/auto-populate/:project_id`)
2. As fallback in PDF generation when saved items are all zeros

### Active Estimate Selection
Use `pickActiveEstimate(estimates, selectedRevision)`:
1. Approved estimate (preferred)
2. Estimate matching `project.selected_revision`
3. Latest estimate (fallback)
