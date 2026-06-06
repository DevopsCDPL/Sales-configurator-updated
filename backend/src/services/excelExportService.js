const ExcelJS = require('exceljs');
const { Op } = require('sequelize');
const {
  Project, Estimate, Client, Invoice, VendorPurchaseOrder, VendorPOItem,
  Vendor, RFQBundle, Document, ProjectAnalytics, WorkOrder,
} = require('../models');

// ─── Formatting constants ────────────────────────────────────────────────
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const HEADER_ALIGNMENT = { horizontal: 'center', vertical: 'middle', wrapText: true };
const CURRENCY_FMT = '₹#,##0.00';
const PERCENT_FMT = '0.00"%"';
const DATE_FMT = 'DD-MMM-YYYY';

class ExcelExportService {

  /**
   * Generate the full business report workbook and return it as a Buffer.
   * @param {string} fromDate - ISO date string YYYY-MM-DD
   * @param {string} toDate   - ISO date string YYYY-MM-DD
   * @returns {Promise<Buffer>}
   */
  async generateReport(fromDate, toDate, companyId = null) {
    const dateWhere = {
      [Op.between]: [new Date(fromDate), new Date(toDate + 'T23:59:59.999Z')],
    };

    // ── Fetch all data in parallel ───────────────────────────────────────
    const [invoices, vendorPOs, projects, documents] = await Promise.all([
      this._fetchInvoices(dateWhere, companyId),
      this._fetchVendorPOs(dateWhere, companyId),
      this._fetchProjects(dateWhere, companyId),
      this._fetchDocuments(dateWhere, companyId),
    ]);

    if (invoices.length === 0 && vendorPOs.length === 0 && projects.length === 0) {
      return null; // No data
    }

    // ── Build workbook ──────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Forge i-DAS';
    wb.created = new Date();

    this._buildSalesSheet(wb, invoices, projects);
    this._buildPurchaseSheet(wb, vendorPOs, projects);
    this._buildProfitLossSheet(wb, projects);
    this._buildDocumentSheet(wb, documents, projects);
    this._buildSummarySheet(wb, invoices, vendorPOs, projects);

    return wb.xlsx.writeBuffer();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  DATA FETCHERS
  // ═══════════════════════════════════════════════════════════════════════

  async _fetchInvoices(dateWhere, companyId) {
    const where = { invoice_date: dateWhere, status: { [Op.ne]: 'Draft' } };
    if (companyId) where.company_id = companyId;
    return Invoice.findAll({
      where,
      include: [{ model: Project, as: 'project', attributes: ['id', 'project_name', 'quotation_number', 'status', 'created_at'], paranoid: false }],
      order: [['invoice_date', 'ASC']],
      raw: false,
    });
  }

  async _fetchVendorPOs(dateWhere, companyId) {
    const where = { po_date: dateWhere, status: { [Op.notIn]: ['draft', 'cancelled'] } };
    if (companyId) where.company_id = companyId;
    return VendorPurchaseOrder.findAll({
      where,
      include: [
        { model: Project, as: 'project', attributes: ['id', 'project_name'], paranoid: false },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] },
        { model: VendorPOItem, as: 'items' },
        { model: RFQBundle, as: 'rfqBundle', attributes: ['id', 'rfq_number'] },
      ],
      order: [['po_date', 'ASC']],
    });
  }

  async _fetchProjects(dateWhere, companyId) {
    const where = { created_at: dateWhere };
    if (companyId) where.company_id = companyId;
    return Project.findAll({
      where,
      include: [
        { model: Client, as: 'client', attributes: ['id', 'client_name'] },
        { model: Estimate, as: 'estimate', attributes: ['id', 'final_price', 'total_cost', 'raw_material_cost', 'process_cost', 'overhead_cost', 'margin_percent', 'revision'] },
        { model: ProjectAnalytics, as: 'analytics', attributes: ['mfg_cost', 'total'] },
        { model: Invoice, as: 'invoices', attributes: ['id', 'invoice_number', 'invoice_date', 'final_total'] },
        { model: VendorPurchaseOrder, as: 'vendorPurchaseOrders', attributes: ['id', 'grand_total'] },
        { model: WorkOrder, as: 'workOrder', attributes: ['id', 'status', 'release_date', 'target_date'] },
      ],
      order: [['created_at', 'ASC']],
      paranoid: false,
    });
  }

  async _fetchDocuments(dateWhere, companyId) {
    const where = { created_at: dateWhere };
    if (companyId) where.company_id = companyId;
    return Document.findAll({
      where,
      include: [{ model: Project, as: 'project', attributes: ['id', 'project_name'], paranoid: false }],
      order: [['created_at', 'ASC']],
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHEET 1: SALES
  // ═══════════════════════════════════════════════════════════════════════

  _buildSalesSheet(wb, invoices, projects) {
    const ws = wb.addWorksheet('Sales');
    const cols = [
      { header: 'Project ID', key: 'project_id', width: 16 },
      { header: 'Project Name', key: 'project_name', width: 24 },
      { header: 'Client Name', key: 'client_name', width: 22 },
      { header: 'Quotation No', key: 'quotation_no', width: 16 },
      { header: 'Invoice No', key: 'invoice_no', width: 16 },
      { header: 'Invoice Date', key: 'invoice_date', width: 14 },
      { header: 'Client PO No', key: 'client_po_no', width: 16 },
      { header: 'Part Description', key: 'part_description', width: 28 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Unit Price', key: 'unit_price', width: 14 },
      { header: 'Total Revenue', key: 'total_revenue', width: 16 },
      { header: 'Tax', key: 'tax', width: 12 },
      { header: 'Shipping Charges', key: 'shipping_charges', width: 16 },
      { header: 'Grand Total', key: 'grand_total', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Created Date', key: 'created_date', width: 14 },
    ];
    ws.columns = cols;

    // Build project lookup for quotation numbers
    const projMap = {};
    projects.forEach(p => { projMap[p.id] = p; });

    const rows = [];
    invoices.forEach(inv => {
      const proj = inv.project || projMap[inv.project_id];
      const lineItems = Array.isArray(inv.line_items) ? inv.line_items : [];

      if (lineItems.length === 0) {
        rows.push({
          project_id: this._short(inv.project_id),
          project_name: inv.project_name || proj?.project_name || '-',
          client_name: inv.customer_name || '-',
          quotation_no: proj?.quotation_number || '-',
          invoice_no: inv.invoice_number || '-',
          invoice_date: inv.invoice_date ? new Date(inv.invoice_date) : '-',
          client_po_no: inv.client_po_number || '-',
          part_description: '-',
          quantity: '-',
          unit_price: '-',
          total_revenue: parseFloat(inv.subtotal) || 0,
          tax: parseFloat(inv.tax_amount) || 0,
          shipping_charges: parseFloat(inv.shipping_charges) || 0,
          grand_total: parseFloat(inv.final_total) || 0,
          status: inv.status || '-',
          created_date: inv.created_at ? new Date(inv.created_at) : '-',
        });
      } else {
        lineItems.forEach((li, idx) => {
          rows.push({
            project_id: this._short(inv.project_id),
            project_name: inv.project_name || proj?.project_name || '-',
            client_name: inv.customer_name || '-',
            quotation_no: proj?.quotation_number || '-',
            invoice_no: inv.invoice_number || '-',
            invoice_date: inv.invoice_date ? new Date(inv.invoice_date) : '-',
            client_po_no: inv.client_po_number || '-',
            part_description: li.description || li.partDescription || '-',
            quantity: parseFloat(li.quantity) || 0,
            unit_price: parseFloat(li.unitPrice || li.unit_price) || 0,
            total_revenue: parseFloat(li.total || li.lineTotal) || 0,
            tax: idx === 0 ? (parseFloat(inv.tax_amount) || 0) : 0,
            shipping_charges: idx === 0 ? (parseFloat(inv.shipping_charges) || 0) : 0,
            grand_total: idx === 0 ? (parseFloat(inv.final_total) || 0) : 0,
            status: inv.status || '-',
            created_date: inv.created_at ? new Date(inv.created_at) : '-',
          });
        });
      }
    });

    rows.forEach(r => ws.addRow(r));
    this._applyFormatting(ws, cols.length, rows.length);

    // Currency columns: K(11), L(12), M(13), N(14)  — Unit Price(J=10), Total Revenue(K=11)
    [10, 11, 12, 13, 14].forEach(c => {
      ws.getColumn(c).numFmt = CURRENCY_FMT;
    });
    // Date columns
    [6, 16].forEach(c => { ws.getColumn(c).numFmt = DATE_FMT; });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHEET 2: PURCHASE
  // ═══════════════════════════════════════════════════════════════════════

  _buildPurchaseSheet(wb, vendorPOs, projects) {
    const ws = wb.addWorksheet('Purchase');
    const cols = [
      { header: 'Project ID', key: 'project_id', width: 16 },
      { header: 'Vendor Name', key: 'vendor_name', width: 22 },
      { header: 'RFQ No', key: 'rfq_no', width: 16 },
      { header: 'Vendor PO No', key: 'vendor_po_no', width: 16 },
      { header: 'PO Date', key: 'po_date', width: 14 },
      { header: 'Material Description', key: 'material_description', width: 28 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Unit Cost', key: 'unit_cost', width: 14 },
      { header: 'Total Cost', key: 'total_cost', width: 14 },
      { header: 'Tax', key: 'tax', width: 12 },
      { header: 'Shipping', key: 'shipping', width: 12 },
      { header: 'Final Vendor Cost', key: 'final_vendor_cost', width: 16 },
    ];
    ws.columns = cols;

    const rows = [];
    vendorPOs.forEach(po => {
      const items = po.items || [];
      if (items.length === 0) {
        rows.push({
          project_id: this._short(po.project_id),
          vendor_name: po.vendor?.vendor_name || '-',
          rfq_no: po.rfqBundle?.rfq_number || '-',
          vendor_po_no: po.po_number || '-',
          po_date: po.po_date ? new Date(po.po_date) : '-',
          material_description: '-',
          quantity: '-',
          unit_cost: '-',
          total_cost: parseFloat(po.subtotal) || 0,
          tax: parseFloat(po.tax_amount) || 0,
          shipping: 0,
          final_vendor_cost: parseFloat(po.grand_total) || 0,
        });
      } else {
        items.forEach((item, idx) => {
          rows.push({
            project_id: this._short(po.project_id),
            vendor_name: po.vendor?.vendor_name || '-',
            rfq_no: po.rfqBundle?.rfq_number || '-',
            vendor_po_no: po.po_number || '-',
            po_date: po.po_date ? new Date(po.po_date) : '-',
            material_description: item.part_description || '-',
            quantity: parseFloat(item.quantity) || 0,
            unit_cost: parseFloat(item.unit_cost) || 0,
            total_cost: parseFloat(item.line_total) || 0,
            tax: idx === 0 ? (parseFloat(po.tax_amount) || 0) : 0,
            shipping: 0,
            final_vendor_cost: idx === 0 ? (parseFloat(po.grand_total) || 0) : 0,
          });
        });
      }
    });

    rows.forEach(r => ws.addRow(r));
    this._applyFormatting(ws, cols.length, rows.length);
    [8, 9, 10, 11, 12].forEach(c => { ws.getColumn(c).numFmt = CURRENCY_FMT; });
    ws.getColumn(5).numFmt = DATE_FMT;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHEET 3: PROJECT P&L
  // ═══════════════════════════════════════════════════════════════════════

  _buildProfitLossSheet(wb, projects) {
    const ws = wb.addWorksheet('Project P&L');
    const cols = [
      { header: 'Project ID', key: 'project_id', width: 16 },
      { header: 'Project Name', key: 'project_name', width: 24 },
      { header: 'Revenue', key: 'revenue', width: 16 },
      { header: 'Material Cost', key: 'material_cost', width: 16 },
      { header: 'Manufacturing Cost', key: 'manufacturing_cost', width: 18 },
      { header: 'Logistics Cost', key: 'logistics_cost', width: 16 },
      { header: 'Total Cost', key: 'total_cost', width: 16 },
      { header: 'Profit', key: 'profit', width: 16 },
      { header: 'Profit %', key: 'profit_pct', width: 12 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Start Date', key: 'start_date', width: 14 },
      { header: 'Completion Date', key: 'completion_date', width: 16 },
    ];
    ws.columns = cols;

    const rows = [];
    projects.forEach(p => {
      const latest = this._latestEstimate(p);
      const revenue = latest ? (parseFloat(latest.final_price) || 0) : 0;
      const rawMat = latest ? (parseFloat(latest.raw_material_cost) || 0) : 0;
      const process = latest ? (parseFloat(latest.process_cost) || 0) : 0;
      const overhead = latest ? (parseFloat(latest.overhead_cost) || 0) : 0;

      // Actual manufacturing cost from analytics
      const mfgCost = (p.analytics || []).reduce((sum, a) => sum + (parseFloat(a.mfg_cost) || 0), 0);

      // Vendor cost as logistics/procurement cost
      const vendorCost = (p.vendorPurchaseOrders || []).reduce((sum, vpo) => sum + (parseFloat(vpo.grand_total) || 0), 0);

      const totalCost = mfgCost + vendorCost;
      const profit = revenue - totalCost;
      const profitPct = revenue > 0 ? (profit / revenue) * 100 : 0;

      const isComplete = ['shipped', 'closed'].includes(p.status);

      rows.push({
        project_id: this._short(p.id),
        project_name: p.project_name || '-',
        revenue,
        material_cost: rawMat,
        manufacturing_cost: mfgCost,
        logistics_cost: vendorCost,
        total_cost: totalCost,
        profit,
        profit_pct: Math.round(profitPct * 100) / 100,
        status: this._statusLabel(p.status),
        start_date: p.created_at ? new Date(p.created_at) : '-',
        completion_date: isComplete && p.updated_at ? new Date(p.updated_at) : '-',
      });
    });

    rows.forEach(r => ws.addRow(r));
    this._applyFormatting(ws, cols.length, rows.length);
    [3, 4, 5, 6, 7, 8].forEach(c => { ws.getColumn(c).numFmt = CURRENCY_FMT; });
    ws.getColumn(9).numFmt = PERCENT_FMT;
    [11, 12].forEach(c => { ws.getColumn(c).numFmt = DATE_FMT; });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHEET 4: DOCUMENT TRACEABILITY
  // ═══════════════════════════════════════════════════════════════════════

  _buildDocumentSheet(wb, documents, projects) {
    const ws = wb.addWorksheet('Document Traceability');
    const cols = [
      { header: 'Project ID', key: 'project_id', width: 16 },
      { header: 'Document Type', key: 'document_type', width: 20 },
      { header: 'Document Number', key: 'document_number', width: 20 },
      { header: 'Generated Date', key: 'generated_date', width: 16 },
      { header: 'Source', key: 'source', width: 16 },
      { header: 'File Name', key: 'file_name', width: 32 },
    ];
    ws.columns = cols;

    const rows = [];
    documents.forEach(doc => {
      rows.push({
        project_id: this._short(doc.project_id),
        document_type: doc.document_type || '-',
        document_number: this._extractDocNumber(doc) || '-',
        generated_date: doc.generated_at ? new Date(doc.generated_at) : (doc.created_at ? new Date(doc.created_at) : '-'),
        source: doc.generated_by ? 'Generated' : 'Uploaded',
        file_name: doc.file_name || '-',
      });
    });

    rows.forEach(r => ws.addRow(r));
    this._applyFormatting(ws, cols.length, rows.length);
    ws.getColumn(4).numFmt = DATE_FMT;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  SHEET 5: SUMMARY DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════

  _buildSummarySheet(wb, invoices, vendorPOs, projects) {
    const ws = wb.addWorksheet('Summary Dashboard');

    // Calculate summary values
    let totalRevenue = 0, totalVendorCost = 0, totalMfgCost = 0;
    let completedProjects = 0, inProgressProjects = 0;

    projects.forEach(p => {
      const latest = this._latestEstimate(p);
      totalRevenue += latest ? (parseFloat(latest.final_price) || 0) : 0;

      const mfgCost = (p.analytics || []).reduce((sum, a) => sum + (parseFloat(a.mfg_cost) || 0), 0);
      totalMfgCost += mfgCost;

      const vCost = (p.vendorPurchaseOrders || []).reduce((sum, vpo) => sum + (parseFloat(vpo.grand_total) || 0), 0);
      totalVendorCost += vCost;

      if (['shipped', 'closed'].includes(p.status)) completedProjects++;
      if (['order_confirmed', 'in_production', 'inspected'].includes(p.status)) inProgressProjects++;
    });

    const totalCost = totalMfgCost + totalVendorCost;
    const totalProfit = totalRevenue - totalCost;
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // ── Summary KPIs ─────────────────────────────────────────────────
    ws.columns = [
      { header: '', key: 'metric', width: 28 },
      { header: '', key: 'value', width: 22 },
    ];

    const summaryRows = [
      ['BUSINESS SUMMARY', ''],
      ['', ''],
      ['Total Revenue', totalRevenue],
      ['Total Cost', totalCost],
      ['Total Profit', totalProfit],
      ['Average Margin %', Math.round(avgMargin * 100) / 100],
      ['', ''],
      ['Total Projects', projects.length],
      ['Completed Projects', completedProjects],
      ['In Progress Projects', inProgressProjects],
      ['', ''],
    ];

    summaryRows.forEach(([metric, value]) => {
      ws.addRow({ metric, value });
    });

    // ── Top 5 Clients by Revenue ─────────────────────────────────────
    const clientMap = {};
    projects.forEach(p => {
      const name = p.client?.client_name || 'Unknown';
      const latest = this._latestEstimate(p);
      const rev = latest ? (parseFloat(latest.final_price) || 0) : 0;
      if (!clientMap[name]) clientMap[name] = 0;
      clientMap[name] += rev;
    });
    const topClients = Object.entries(clientMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    ws.addRow({ metric: 'TOP 5 CLIENTS BY REVENUE', value: '' });
    ws.addRow({ metric: 'Client', value: 'Revenue' });
    topClients.forEach(([name, rev]) => {
      ws.addRow({ metric: name, value: rev });
    });

    ws.addRow({ metric: '', value: '' });

    // ── Top 5 Vendors by Spend ───────────────────────────────────────
    const vendorMap = {};
    vendorPOs.forEach(po => {
      const name = po.vendor?.vendor_name || 'Unknown';
      if (!vendorMap[name]) vendorMap[name] = 0;
      vendorMap[name] += parseFloat(po.grand_total) || 0;
    });
    const topVendors = Object.entries(vendorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    ws.addRow({ metric: 'TOP 5 VENDORS BY SPEND', value: '' });
    ws.addRow({ metric: 'Vendor', value: 'Spend' });
    topVendors.forEach(([name, spend]) => {
      ws.addRow({ metric: name, value: spend });
    });

    // ── Format the Summary sheet ─────────────────────────────────────
    // Title rows styling
    [1, 12, 18].forEach(rowNum => {
      const r = ws.getRow(rowNum);
      if (r) {
        r.font = { bold: true, size: 13, color: { argb: 'FF1F4E79' } };
      }
    });
    // Sub-header rows
    [13, 19].forEach(rowNum => {
      const r = ws.getRow(rowNum);
      if (r) {
        r.font = { bold: true, size: 11 };
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
      }
    });

    // Currency formatting for value column in KPI rows
    [3, 4, 5].forEach(rowNum => {
      const cell = ws.getCell(`B${rowNum}`);
      cell.numFmt = CURRENCY_FMT;
    });
    // Percent
    ws.getCell('B6').numFmt = PERCENT_FMT;

    // Currency for client revenue and vendor spend rows
    for (let i = 14; i <= 18; i++) {
      const cell = ws.getCell(`B${i}`);
      if (cell.value && typeof cell.value === 'number') cell.numFmt = CURRENCY_FMT;
    }
    for (let i = 20; i <= 24; i++) {
      const cell = ws.getCell(`B${i}`);
      if (cell.value && typeof cell.value === 'number') cell.numFmt = CURRENCY_FMT;
    }

    // Freeze first column
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 0 }];
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  FORMATTING HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _applyFormatting(ws, colCount, rowCount) {
    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font = HEADER_FONT;
    headerRow.fill = HEADER_FILL;
    headerRow.alignment = HEADER_ALIGNMENT;
    headerRow.height = 28;

    // Freeze header row
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    // Add auto-filter
    if (rowCount > 0) {
      const lastCol = String.fromCharCode(64 + Math.min(colCount, 26));
      ws.autoFilter = { from: 'A1', to: `${lastCol}${rowCount + 1}` };
    }

    // Add as Excel Table
    if (rowCount > 0) {
      const lastColLetter = this._colLetter(colCount);
      const tableRef = `A1:${lastColLetter}${rowCount + 1}`;
      const tableName = ws.name.replace(/[^a-zA-Z0-9]/g, '_');
      ws.addTable({
        name: tableName,
        ref: 'A1',
        headerRow: true,
        totalsRow: false,
        style: {
          theme: 'TableStyleMedium2',
          showRowStripes: true,
        },
        columns: ws.columns.map(c => ({ name: c.header, filterButton: true })),
        rows: [],
      });
      // Re-populate table rows (addTable clears them)
      // Actually, since we already added rows, let's not use addTable 
      // and instead rely on autoFilter + row striping
      // Remove the table we just added and use manual striping
      try { ws.removeTable(tableName); } catch { /* ok */ }
    }

    // Alternating row colors
    for (let i = 2; i <= rowCount + 1; i++) {
      const row = ws.getRow(i);
      if (i % 2 === 0) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
        });
      }
      row.alignment = { vertical: 'middle' };
    }

    // Replace null/undefined/empty values with "-"
    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.value === null || cell.value === undefined || cell.value === '') {
          cell.value = '-';
        }
      });
    });
  }

  _colLetter(n) {
    let s = '';
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  UTILITY HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _latestEstimate(p) {
    const estimates = Array.isArray(p.estimate) ? p.estimate : (p.estimate ? [p.estimate] : []);
    return estimates.length > 0
      ? estimates.reduce((a, b) => ((a.revision ?? 0) > (b.revision ?? 0) ? a : b))
      : null;
  }

  _short(uuid) {
    if (!uuid) return '-';
    return uuid.substring(0, 8).toUpperCase();
  }

  _statusLabel(status) {
    const labels = {
      draft: 'Draft', estimated: 'Estimated', quoted: 'Quoted',
      order_confirmed: 'Order Confirmed', in_production: 'In Production',
      inspected: 'Inspected', shipped: 'Shipped', closed: 'Closed',
    };
    return labels[status] || status || '-';
  }

  _extractDocNumber(doc) {
    // Try to extract a document number from file_name
    const name = doc.file_name || '';
    const match = name.match(/(QT|INV|PO|WO|RFQ|COC|PL|SO)[-\s]?[\d-]+/i);
    return match ? match[0] : doc.document_type || '-';
  }
}

module.exports = new ExcelExportService();
