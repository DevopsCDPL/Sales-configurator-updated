const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Base PDF generator class
 */
class PDFGenerator {
  constructor(options = {}) {
    this.options = {
      margin: 50,
      fontSize: 12,
      ...options,
    };
  }

  /**
   * Create a new PDF document
   * @returns {PDFDocument} PDF document instance
   */
  createDocument() {
    return new PDFDocument({
      size: 'A4',
      margin: this.options.margin,
      info: {
        Title: this.options.title || 'Document',
        Author: 'Company',
        Creator: 'Company',
      },
    });
  }

  /**
   * Add company header to document
   * @param {PDFDocument} doc - PDF document
   * @param {Object} company - Company information
   */
  addHeader(doc, company) {
    const margin = this.options.margin;
    const pageW = doc.page.width;
    const cW = pageW - 2 * margin;

    const LOGO_BOX_W = 280;
    const LOGO_BOX_H = 90;
    let y = doc.y || margin;
    const headerStartY = y;

    // Logo area (left) — prefer base64 data, then file path
    let logoRendered = false;
    if (company.logo_data) {
      try {
        const b64Match = company.logo_data.match(/^data:[^;]+;base64,(.+)$/);
        if (b64Match) {
          doc.image(Buffer.from(b64Match[1], 'base64'), margin, y, {
            fit: [LOGO_BOX_W, LOGO_BOX_H], align: 'left', valign: 'center',
          });
          logoRendered = true;
        }
      } catch (e) { /* base64 logo unreadable — try file fallback */ }
    }
    if (!logoRendered && company.logo) {
      const settingsService = require('../services/settingsService');
      const logoAbsPath = settingsService.getLogoAbsolutePath(company.logo);
      if (logoAbsPath) {
        try {
          doc.image(logoAbsPath, margin, y, { fit: [LOGO_BOX_W, LOGO_BOX_H], align: 'left', valign: 'center' });
          logoRendered = true;
        } catch (e) { /* logo file unreadable — skip */ }
      }
    }

    // Company info (right column, right-aligned)
    const infoX = margin + LOGO_BOX_W + 10;
    const infoW = cW - LOGO_BOX_W - 10;
    const infoLineH = 13;
    const addrLines = (company.address || '').split(/\n/).filter(Boolean);
    const telFax = [
      company.phone ? `Tel: ${company.phone}` : null,
      company.fax   ? `Fax: ${company.fax}`   : null,
    ].filter(Boolean).join(' | ');
    const infoLineCount = 1 + addrLines.length + (telFax ? 1 : 0) + (company.website ? 1 : 0);
    const infoBlockH = 20 + (infoLineCount - 1) * infoLineH;
    let iy = headerStartY + Math.max(0, (LOGO_BOX_H - infoBlockH) / 2);

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a1a')
      .text(company.name || '', infoX, iy, { width: infoW, align: 'right', lineBreak: false });
    iy += 20;
    doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a');
    addrLines.forEach(line => {
      doc.text(line.trim(), infoX, iy, { width: infoW, align: 'right', lineBreak: false });
      iy += infoLineH;
    });
    if (telFax) {
      doc.text(telFax, infoX, iy, { width: infoW, align: 'right', lineBreak: false });
      iy += infoLineH;
    }
    if (company.website) {
      doc.text(company.website, infoX, iy, { width: infoW, align: 'right', lineBreak: false });
      iy += infoLineH;
    }

    y = Math.max(headerStartY + LOGO_BOX_H, iy) + 11;
    doc.lineWidth(1.5).moveTo(margin, y).lineTo(margin + cW, y).strokeColor('#000000').stroke();
    y += 17;
    doc.y = y;
  }

  /**
   * Add document title
   * @param {PDFDocument} doc - PDF document
   * @param {string} title - Document title
   */
  addTitle(doc, title) {
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(title, { align: 'center', underline: true })
      .moveDown(1);
  }

  /**
   * Add info section (key-value pairs)
   * @param {PDFDocument} doc - PDF document
   * @param {Array} items - Array of {label, value} objects
   */
  addInfoSection(doc, items) {
    doc.font('Helvetica').fontSize(10);
    
    items.forEach(item => {
      doc
        .font('Helvetica-Bold')
        .text(`${item.label}: `, { continued: true })
        .font('Helvetica')
        .text(item.value || '-');
    });
    
    doc.moveDown(1);
  }

  /**
   * Add a simple table
   * @param {PDFDocument} doc - PDF document
   * @param {Array} headers - Column headers
   * @param {Array} rows - Table rows
   * @param {Object} options - Table options
   */
  addTable(doc, headers, rows, options = {}) {
    const tableTop = doc.y;
    const tableWidth = 500;
    const columnCount = headers.length;
    const columnWidths = options.columnWidths || Array(columnCount).fill(tableWidth / columnCount);
    const rowHeight = 25;
    const C_TABLE_HEAD = '#1F2937';
    
    // Draw header background
    doc.rect(this.options.margin, tableTop, tableWidth, rowHeight).fill(C_TABLE_HEAD);
    doc.lineWidth(0.5).rect(this.options.margin, tableWidth, tableWidth, rowHeight).strokeColor('#000000').stroke();
    
    // Draw header text
    let x = this.options.margin;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF');
    
    headers.forEach((header, i) => {
      doc.text(header, x + 4, tableTop + 7, {
        width: columnWidths[i] - 8,
        align: 'left',
      });
      if (i < headers.length - 1) {
        doc.lineWidth(0.3).moveTo(x + columnWidths[i], tableTop).lineTo(x + columnWidths[i], tableTop + rowHeight).strokeColor('#555555').stroke();
      }
      x += columnWidths[i];
    });
    
    // Draw rows
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    let y = tableTop + rowHeight;
    
    rows.forEach((row, rowIndex) => {
      doc.rect(this.options.margin, y, tableWidth, rowHeight).fill('#FFFFFF');
      doc.lineWidth(0.5).rect(this.options.margin, y, tableWidth, rowHeight).strokeColor('#000000').stroke();
      x = this.options.margin;
      row.forEach((cell, cellIndex) => {
        doc.fontSize(9).font('Helvetica').fillColor('#1a1a1a');
        doc.text(String(cell || ''), x + 4, y + 7, {
          width: columnWidths[cellIndex] - 8,
          align: 'left',
        });
        if (cellIndex < row.length - 1) {
          doc.lineWidth(0.3).moveTo(x + columnWidths[cellIndex], y).lineTo(x + columnWidths[cellIndex], y + rowHeight).strokeColor('#000000').stroke();
        }
        x += columnWidths[cellIndex];
      });
      y += rowHeight;
      
      // Add new page if needed
      if (y > 750) {
        doc.addPage();
        y = this.options.margin;
      }
    });
    
    doc.y = y + 10;
  }

  /**
   * Add footer with page numbers
   * @param {PDFDocument} doc - PDF document
   */
  addFooter(doc) {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .text(
          `Page ${i + 1} of ${pages.count}`,
          this.options.margin,
          doc.page.height - 50,
          { align: 'center' }
        )
        .text(
          `Generated on ${new Date().toLocaleDateString()}`,
          this.options.margin,
          doc.page.height - 40,
          { align: 'center' }
        );
    }
  }

  /**
   * Generate Quotation PDF
   * @param {Object} data - Quotation data
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateQuotation(data) {
    return new Promise((resolve, reject) => {
      const doc = this.createDocument();
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Add content
      this.addHeader(doc, data.company || {});
      this.addTitle(doc, 'Quotation');
      
      // Quotation details
      this.addInfoSection(doc, [
        { label: 'Quotation No', value: data.quotationNumber },
        { label: 'Date', value: new Date().toLocaleDateString() },
        { label: 'Valid Until', value: data.validUntil },
        { label: 'Customer', value: data.client?.company_name },
        { label: 'Project', value: data.project?.title },
      ]);
      
      doc.moveDown(1);
      
      // Items table
      if (data.items && data.items.length > 0) {
        this.addTable(doc, 
          ['#', 'Description', 'Qty', 'Unit Price', 'Total'],
          data.items.map((item, index) => [
            index + 1,
            item.description,
            item.quantity,
            `$${item.unit_price?.toFixed(2) || '0.00'}`,
            `$${item.total?.toFixed(2) || '0.00'}`,
          ]),
          { columnWidths: [30, 200, 60, 100, 100] }
        );
      }
      
      // Totals
      doc.moveDown(2);
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(`Total: $${data.total?.toFixed(2) || '0.00'}`, { align: 'right' });
      
      // Terms
      doc.moveDown(2);
      doc.font('Helvetica-Bold').fontSize(10).text('Terms & Conditions:');
      doc.font('Helvetica').fontSize(9);
      doc.text(`Delivery Terms: ${data.delivery_terms || 'Ex-Works'}`);
      doc.text(`Payment Terms: ${data.payment_terms || 'Net 30'}`);
      if (data.notes) {
        doc.text(`Notes: ${data.notes}`);
      }
      
      this.addFooter(doc);
      doc.end();
    });
  }

  /**
   * Generate Production Traveller PDF
   * @param {Object} data - Work order data
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateTraveller(data) {
    return new Promise((resolve, reject) => {
      const doc = this.createDocument();
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      this.addHeader(doc, data.company || {});
      this.addTitle(doc, 'Production Traveller');
      
      // Work order details
      this.addInfoSection(doc, [
        { label: 'WO Number', value: data.wo_number },
        { label: 'SO Number', value: data.so_number },
        { label: 'Project', value: data.project?.title },
        { label: 'Customer', value: data.client?.company_name },
        { label: 'Product', value: data.product_name },
        { label: 'Quantity', value: data.quantity },
        { label: 'Material', value: data.material },
      ]);
      
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(12).text('Operations');
      doc.moveDown(0.5);
      
      // Operations table
      if (data.operations && data.operations.length > 0) {
        this.addTable(doc,
          ['Op#', 'Operation', 'Status', 'Operator', 'Sign-off'],
          data.operations.map((op, index) => [
            index + 1,
            op.name || op.module_type,
            op.status || 'Pending',
            '____________',
            '____________',
          ]),
          { columnWidths: [40, 150, 80, 100, 100] }
        );
      }
      
      // Sign-off section
      doc.moveDown(2);
      doc.font('Helvetica-Bold').fontSize(10).text('Final Sign-Off');
      doc.moveDown(1);
      doc.font('Helvetica').fontSize(9);
      doc.text('Quality Inspector: ____________________  Date: __________');
      doc.text('Production Manager: __________________  Date: __________');
      
      this.addFooter(doc);
      doc.end();
    });
  }

  /**
   * Generate Certificate of Conformance PDF
   * @param {Object} data - Quality record data
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateCoC(data) {
    return new Promise((resolve, reject) => {
      const doc = this.createDocument();
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      this.addHeader(doc, data.company || {});
      this.addTitle(doc, 'Certificate of Conformance');
      
      // CoC details
      this.addInfoSection(doc, [
        { label: 'Certificate No', value: data.certificate_number },
        { label: 'Date', value: new Date().toLocaleDateString() },
        { label: 'Customer', value: data.client?.company_name },
        { label: 'PO Number', value: data.customer_po },
        { label: 'SO Number', value: data.so_number },
        { label: 'Product', value: data.product_name },
        { label: 'Quantity', value: data.quantity },
      ]);
      
      doc.moveDown(1);
      
      // Certification statement
      doc.font('Helvetica').fontSize(10);
      doc.text(
        'This is to certify that the materials and/or products described above have been manufactured, ' +
        'inspected, and tested in accordance with the applicable specifications and requirements. ' +
        'All items conform to the purchase order requirements.',
        { align: 'justify' }
      );
      
      doc.moveDown(2);
      
      // Inspection summary
      if (data.inspection_checklist && data.inspection_checklist.length > 0) {
        doc.font('Helvetica-Bold').text('Inspection Summary:');
        doc.font('Helvetica');
        data.inspection_checklist.forEach(item => {
          doc.text(`--- ${item.name}: ${item.passed ? 'PASS' : 'FAIL'}`);
        });
      }
      
      // Sign-off
      doc.moveDown(2);
      doc.text('Quality Assurance Representative: ____________________');
      doc.text('Date: ____________________');
      
      this.addFooter(doc);
      doc.end();
    });
  }

  /**
   * Generate Packing List PDF
   * @param {Object} data - Shipment data
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generatePackingList(data) {
    return new Promise((resolve, reject) => {
      const doc = this.createDocument();
      const chunks = [];
      
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      this.addHeader(doc, data.company || {});
      this.addTitle(doc, 'Packing List');
      
      // Shipment details
      this.addInfoSection(doc, [
        { label: 'Packing List No', value: data.packing_list_number },
        { label: 'Date', value: new Date().toLocaleDateString() },
        { label: 'SO Number', value: data.so_number },
        { label: 'Customer', value: data.client?.company_name },
        { label: 'Ship To', value: data.shipping_address },
        { label: 'Carrier', value: data.carrier },
        { label: 'Tracking No', value: data.tracking_number },
      ]);
      
      doc.moveDown(1);
      
      // Items
      doc.font('Helvetica-Bold').text('Contents:');
      this.addTable(doc,
        ['#', 'Description', 'Qty', 'Weight', 'Dimensions'],
        data.items?.map((item, index) => [
          index + 1,
          item.description || data.product_name,
          item.quantity || data.quantity,
          item.weight || data.total_weight || '-',
          item.dimensions || data.dimensions || '-',
        ]) || [[1, data.product_name, data.quantity, data.total_weight, data.dimensions]],
        { columnWidths: [30, 200, 60, 80, 120] }
      );
      
      // Package summary
      doc.moveDown(1);
      doc.font('Helvetica-Bold').text('Package Summary:');
      doc.font('Helvetica');
      doc.text(`Total Packages: ${data.packages_count || 1}`);
      doc.text(`Total Weight: ${data.total_weight || '-'} kg`);
      doc.text(`Packaging Type: ${data.packaging || '-'}`);
      
      if (data.special_instructions) {
        doc.moveDown(1);
        doc.font('Helvetica-Bold').text('Special Instructions:');
        doc.font('Helvetica').text(data.special_instructions);
      }
      
      this.addFooter(doc);
      doc.end();
    });
  }
}

module.exports = PDFGenerator;
