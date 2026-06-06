const { WorkOrder, Project, EstimateItem, Estimate, Client, User, SalesOrder, sequelize } = require('../models');
const { Op } = require('sequelize');
const settingsService = require('./settingsService');
const documentNumberingService = require('./documentNumberingService');
const { drawGlobalHeader, drawGlobalFooter, COLORS } = require('../utils/pdfTemplate');
const { pickBestEstimate, buildEstimateLineItems, buildDescription } = require('../utils/calculations');

/**
 * Generate a unique production_traveler_number that does not collide with any
 * existing row globally. Delegates to the centralized collision-safe helper
 * in documentNumberingService.
 */
async function generatePtNumber(companyId) {
  return documentNumberingService.generateUniqueNumber(
    'production_traveler_number', companyId, WorkOrder, 'production_traveler_number'
  );
}

/**
 * Ensure a work order has a production_traveler_number.
 * For existing work orders created before the PT number was introduced,
 * lazily generate and persist one.
 */
async function ensurePtNumber(workOrder) {
  if (workOrder.production_traveler_number) return workOrder.production_traveler_number;
  const ptNum = await generatePtNumber(workOrder.company_id || null);
  await workOrder.update({ production_traveler_number: ptNum });
  return ptNum;
}

class WorkOrderService {
  _normalizeAndValidateInput(data = {}) {
    const normalized = { ...data };

    if ('job_ids' in normalized) {
      normalized.job_ids = Array.isArray(normalized.job_ids)
        ? normalized.job_ids.filter(Number.isInteger)
        : [];
    }

    if ('job_requirements' in normalized) {
      normalized.job_requirements =
        normalized.job_requirements && typeof normalized.job_requirements === 'object' && !Array.isArray(normalized.job_requirements)
          ? normalized.job_requirements
          : {};
    }

    if ('quality_requirements' in normalized) {
      const raw = Array.isArray(normalized.quality_requirements) ? normalized.quality_requirements : [];
      normalized.quality_requirements = raw.map((r) =>
        typeof r === 'string'
          ? { text: r, checked: true }
          : { text: String(r?.text ?? ''), checked: r?.checked !== false }
      );
    }

    const selectedJobs = Array.isArray(normalized.job_ids) ? normalized.job_ids : [];
    if (selectedJobs.length === 0) {
      throw new Error('Select at least one Job before saving the Work Order.');
    }

    const checkedReqs = (normalized.quality_requirements || []).filter((r) => r.checked);
    if (checkedReqs.length === 0) {
      throw new Error('Select at least one Condition / Quality Requirement before saving the Work Order.');
    }

    const emptyChecked = checkedReqs.some((r) => !String(r.text ?? '').trim());
    if (emptyChecked) {
      throw new Error('Conditions / Quality Requirements contains an empty selected line. Fill it or uncheck it.');
    }

    return normalized;
  }

  async getWorkOrderByProjectId(projectId) {
    const workOrder = await WorkOrder.findOne({
      where: { project_id: projectId }
    });
    return workOrder;
  }

  async getWorkOrdersByProjectId(projectId) {
    const workOrders = await WorkOrder.findAll({
      where: { project_id: projectId },
      order: [['created_at', 'ASC']]
    });
    return workOrders;
  }

  /**
   * Generate a unique work_order_number — delegates to centralized
   * collision-safe helper in documentNumberingService.
   */
  async _generateWorkOrderNumber(companyId) {
    return documentNumberingService.generateUniqueNumber(
      'work_order_number', companyId, WorkOrder, 'work_order_number'
    );
  }

  async createWorkOrder(data, userCtx = null) {
    const normalized = this._normalizeAndValidateInput(data);
    const { project_id, target_date, prepared_by, approved_by, special_instructions, quality_requirements, job_ids, job_requirements } = normalized;
    if (!project_id) throw new Error('project_id is required');

    // Fetch parent project to inherit company_id
    const project = await Project.findByPk(project_id);
    if (!project) throw new Error('Project not found');
    const company_id = project.company_id || userCtx?.company_id || null;
    if (!project.company_id && company_id) {
      await project.update({ company_id });
    }
    if (!company_id) {
      throw new Error('Cannot save Work Order: project is not associated with a company.');
    }

    // If a work order already exists for this project (created by salesOrderService),
    // update it with the new fields instead of creating a duplicate (unique constraint on project_id)
    const existing = await WorkOrder.findOne({ where: { project_id } });
    if (existing) {
      const updates = {};
      if (target_date !== undefined)          updates.target_date = target_date || null;
      if (prepared_by !== undefined)           updates.prepared_by = prepared_by || null;
      if (approved_by !== undefined)           updates.approved_by = approved_by || null;
      if (special_instructions !== undefined)  updates.special_instructions = special_instructions || [];
      if (quality_requirements !== undefined)  updates.quality_requirements = quality_requirements || null;
      if (job_ids !== undefined)               updates.job_ids = job_ids || [];
      if (job_requirements !== undefined)       updates.job_requirements = job_requirements || {};
      await existing.update(updates);
      return existing.reload();
    }

    const work_order_number = await this._generateWorkOrderNumber(company_id);
    const production_traveler_number = await generatePtNumber(company_id);

    const workOrderPayload = () => ({
      project_id,
      work_order_number,
      production_traveler_number,
      company_id,
      release_date: new Date(),
      target_date: target_date || null,
      prepared_by: prepared_by || null,
      approved_by: approved_by || null,
      special_instructions: special_instructions || [],
      quality_requirements: quality_requirements || null,
      job_ids: job_ids || [],
      job_requirements: job_requirements || {},
      status: 'pending',
      operations: [],
    });

    try {
      const workOrder = await WorkOrder.create(workOrderPayload());
      return workOrder;
    } catch (createErr) {
      if (createErr.name === 'SequelizeUniqueConstraintError') {
        // Could be project_id conflict (race condition) --- try upsert
        const raceExisting = await WorkOrder.findOne({ where: { project_id } });
        if (raceExisting) {
          const updates = {};
          if (target_date !== undefined)          updates.target_date = target_date || null;
          if (prepared_by !== undefined)           updates.prepared_by = prepared_by || null;
          if (approved_by !== undefined)           updates.approved_by = approved_by || null;
          if (special_instructions !== undefined)  updates.special_instructions = special_instructions || [];
          if (quality_requirements !== undefined)  updates.quality_requirements = quality_requirements || null;
          if (job_ids !== undefined)               updates.job_ids = job_ids || [];
          if (job_requirements !== undefined)       updates.job_requirements = job_requirements || {};
          await raceExisting.update(updates);
          return raceExisting.reload();
        }
        // Conflict on work_order_number or production_traveler_number ---
        // retry up to 10 times with collision-safe numbers for both.
        let retryErr = createErr;
        for (let attempt = 0; attempt < 10; attempt++) {
          try {
            const retryWoNumber = await this._generateWorkOrderNumber(company_id);
            const retryPtNumber = await generatePtNumber(company_id);
            const workOrder = await WorkOrder.create({
              ...workOrderPayload(),
              work_order_number: retryWoNumber,
              production_traveler_number: retryPtNumber,
            });
            return workOrder;
          } catch (err) {
            retryErr = err;
            if (err.name !== 'SequelizeUniqueConstraintError') throw err;
          }
        }
        // Last resort: a concurrent request may have slipped in
        const fallback = await WorkOrder.findOne({ where: { project_id } });
        if (fallback) return fallback;
        throw retryErr;
      }
      throw createErr;
    }
  }

  async getWorkOrderById(id) {
    const workOrder = await WorkOrder.findByPk(id);
    if (!workOrder) {
      throw new Error('Work order not found');
    }
    return workOrder;
  }

  async initializeOperations(workOrderId) {
    const workOrder = await WorkOrder.findByPk(workOrderId);
    if (!workOrder) {
      throw new Error('Work order not found');
    }

    // Get estimate items for this project
    const estimate = await Estimate.findOne({
      where: { project_id: workOrder.project_id },
      include: [{ model: EstimateItem, as: 'items', order: [['sequence_order', 'ASC']] }]
    });

    if (!estimate || !estimate.items.length) {
      throw new Error('No estimate items found to create operations');
    }

    const operations = estimate.items.map((item, index) => ({
      id: index + 1,
      module_type: item.module_type,
      description: this.getModuleDescription(item.module_type),
      inputs: item.input_json,
      is_completed: false,
      completed_at: null,
      operator_initials: '',
      notes: ''
    }));

    await workOrder.update({ operations });
    return workOrder;
  }

  async updateOperation(workOrderId, operationId, updateData) {
    const workOrder = await WorkOrder.findByPk(workOrderId);
    if (!workOrder) {
      throw new Error('Work order not found');
    }

    const operations = [...(workOrder.operations || [])];
    const opIndex = operations.findIndex(op => op.id === operationId);

    if (opIndex === -1) {
      throw new Error('Operation not found');
    }

    const { is_completed, operator_initials, notes } = updateData;

    operations[opIndex] = {
      ...operations[opIndex],
      is_completed: is_completed !== undefined ? is_completed : operations[opIndex].is_completed,
      completed_at: is_completed ? new Date().toISOString() : operations[opIndex].completed_at,
      operator_initials: operator_initials !== undefined ? operator_initials : operations[opIndex].operator_initials,
      notes: notes !== undefined ? notes : operations[opIndex].notes
    };

    // Check if all operations are complete
    const allComplete = operations.every(op => op.is_completed);
    const newStatus = allComplete ? 'completed' : 'in_progress';

    await workOrder.update({ 
      operations,
      status: newStatus
    });

    // Update project status if all operations complete
    if (allComplete) {
      await Project.update(
        { status: 'in_production' },
        { where: { id: workOrder.project_id } }
      );
    }

    return workOrder;
  }

  async startProduction(workOrderId) {
    const workOrder = await WorkOrder.findByPk(workOrderId);
    if (!workOrder) {
      throw new Error('Work order not found');
    }

    if (workOrder.status !== 'pending') {
      throw new Error('Work order is already in progress or completed');
    }

    // Initialize operations if not already
    if (!workOrder.operations || workOrder.operations.length === 0) {
      await this.initializeOperations(workOrderId);
    }

    await workOrder.update({ status: 'in_progress' });

    // Update project status
    await Project.update(
      { status: 'in_production' },
      { where: { id: workOrder.project_id } }
    );

    return WorkOrder.findByPk(workOrderId);
  }

  async updateWorkOrderNotes(id, notes) {
    const workOrder = await WorkOrder.findByPk(id);
    if (!workOrder) {
      throw new Error('Work order not found');
    }

    await workOrder.update({ notes });
    return workOrder;
  }

  async startProductionByProjectId(projectId) {
    let workOrder = await WorkOrder.findOne({
      where: { project_id: projectId }
    });

    if (!workOrder) {
      throw new Error('Work order not found for this project');
    }

    return this.startProduction(workOrder.id);
  }

  async generateTravellerPdf(workOrderId) {
    const PDFDocument = require('pdfkit');
    const dayjs = require('dayjs');

    const workOrder = await WorkOrder.findByPk(workOrderId);
    if (!workOrder) throw new Error('Work order not found');

    const project = await Project.findByPk(workOrder.project_id, {
      include: [
        { model: Client, as: 'client' },
        { model: User, as: 'preparedBy' },
        { model: SalesOrder, as: 'salesOrder' },
      ]
    });
    const companySettings = await settingsService.getCompanySettings(project.company_id);

    // Fetch estimate for custom parts / jobs --- use approved / selected_revision / latest
    const estimates = await Estimate.findAll({
      where: { project_id: workOrder.project_id },
      include: [{ model: EstimateItem, as: 'items' }],
      order: [['revision', 'ASC']],
    });
    const estimate = pickBestEstimate(estimates, project.selected_revision) || estimates[estimates.length - 1] || null;

    // Build all_items using shared helper (custom_parts + process modules)
    const allLineItems = buildEstimateLineItems(estimate);

    // Also build allParts with full detail for the traveler (material, heat#, dimensions)
    const customPartsRaw = Array.isArray(estimate?.custom_parts) ? estimate.custom_parts : [];
    const processModules = Array.isArray(estimate?.items) ? estimate.items : [];
    const mappedModules = processModules.map(item => {
      const inp = item.input_json || {};
      const qty = Number(inp.quantity) || 0;
      const totalCost = Number(item.total_cost) || 0;
      const unitPrice = qty > 0 ? totalCost / qty : totalCost;
      const moduleLabel = (item.module_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      return {
        _source: 'process_module',
        module_type: item.module_type,
        job_description: inp.job_name || moduleLabel,
        drawing_part_no: inp.drawing_part_no || '',
        material: inp.material_type || inp.material_grade || '',
        material_grade: inp.material_grade || inp.material_type || '',
        quantity: qty,
        job_cost_per_unit: unitPrice,
        total_cost: totalCost,
        heat_number: inp.heat_number || '',
        raw_material_dimension: inp.raw_material_dimension || '',
      };
    });
    const allParts = [...customPartsRaw, ...mappedModules];
    const jobIds = Array.isArray(workOrder.job_ids) && workOrder.job_ids.length > 0
      ? workOrder.job_ids
      : null;
    // Attach original index so requirement/quantity lookups stay correct regardless of jobIds order
    const customParts = [];
    allParts.forEach((part, idx) => {
      if (!jobIds || jobIds.includes(idx)) {
        customParts.push({ ...part, _origIdx: idx });
      }
    });

    // Quality requirements – only include checked items; support both legacy string[] and new {text,checked}[]
    const allRequirements = Array.isArray(workOrder.quality_requirements)
      ? workOrder.quality_requirements
          .filter(r => typeof r === 'string' ? r.trim() : (r.checked !== false && (r.text || '').trim()))
          .map(r => typeof r === 'string' ? r : r.text)
      : [];

    const HEADER_GREY = COLORS.TABLE_HEAD; // unified dark gray for table headers

    // Generate standardized filename using naming service
    const { generateDocumentName } = require('./documentNamingService');
    const { fileName: standardizedFilename } = await generateDocumentName({
      documentType: 'work_order',
      projectName: project.project_name,
      reference: workOrder.work_order_number,
      projectId: workOrder.project_id,
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, lineGap: 1, bufferPages: true });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        filename: standardizedFilename,
        projectId: workOrder.project_id,
      }));
      doc.on('error', reject);

      const margin = 30;
      const pageWidth  = doc.page.width;
      const pageHeight = doc.page.height;
      const contentWidth = pageWidth - 2 * margin;
      const logoAbsPath = settingsService.getLogoAbsolutePath(companySettings.logo);

      // ------ HELPER: draw page header --- compact, at very top ---------------------------------------------------
      const drawPageHeader = () => {
        return drawGlobalHeader(doc, companySettings);
      };

      // ------ HELPER: draw a full-border table ---------------------------------------------------------------------------------------------------
      // headers: string[]
      // colWidths: number[]  (must sum to contentWidth)
      // rows: (string|number)[][]
      // headerBg: color string
      // rowH: row height for data rows
      // headerH: header row height
      const drawTable = (startY, headers, colWidths, rows, headerBg = HEADER_GREY, headerH = 22, rowH = 24, colAligns = null, descColIdx = -1) => {
        let y = startY;
        const OUTER_COLOR = COLORS.BORDER;  // distinct outer border
        const INNER_H_CLR = '#000000';  // horizontal inner lines
        const INNER_V_CLR = '#000000';  // vertical inner lines
        const FS = 8.5;                 // font size for all cells

        // ------ header row ------
        let x = margin;
        headers.forEach((h, i) => {
          doc.rect(x, y, colWidths[i], headerH).fill(headerBg);
          // vertically centre text in header
          const textY = y + (headerH - FS) / 2;
          doc.fontSize(FS).font('Helvetica-Bold').fillColor(COLORS.TABLE_HEAD_TEXT)
            .text(String(h), x + 5, textY, { width: colWidths[i] - 10, align: 'center', lineBreak: false });
          x += colWidths[i];
        });
        // inner vertical dividers in header
        doc.lineWidth(0.5).strokeColor(INNER_V_CLR);
        x = margin;
        colWidths.slice(0, -1).forEach(w => {
          x += w;
          doc.moveTo(x, y).lineTo(x, y + headerH).stroke();
        });
        // thick outer border on header
        doc.lineWidth(1.2).strokeColor(OUTER_COLOR).rect(margin, y, contentWidth, headerH).stroke();
        y += headerH;

        // ------ data rows ------
        rows.forEach((row, ri) => {
          // Measure dynamic row height based on text content
          let dynamicH = rowH;
          if (descColIdx >= 0 && row[descColIdx] && String(row[descColIdx]).includes('\n')) {
            const cellVal = String(row[descColIdx]);
            const parts = cellVal.split('\n');
            const descW = colWidths[descColIdx] - 12;
            doc.fontSize(FS).font('Helvetica');
            const descH = doc.heightOfString(parts[0], { width: descW });
            doc.fontSize(7).font('Helvetica');
            const drawH = doc.heightOfString(parts.slice(1).join('\n'), { width: descW });
            dynamicH = Math.max(rowH, descH + drawH + 10);
          } else {
            row.forEach((cell, ci) => {
              const align = colAligns ? colAligns[ci] : (ci === 0 ? 'center' : 'left');
              const pad   = align === 'center' ? 3 : 6;
              const cellH = doc.fontSize(FS).font('Helvetica')
                .heightOfString(String(cell ?? '-'), { width: colWidths[ci] - pad * 2 }) + 8;
              if (cellH > dynamicH) dynamicH = cellH;
            });
          }

          if (y + dynamicH > pageHeight - 45) {
            doc.addPage();
            y = drawPageHeader();
          }
          const bg = ri % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;

          // Step 1: Fill row background AND stroke top+bottom borders together.
          // Using fillAndStroke ensures the horizontal separator at the row
          // boundary is not overpainted by the next row's background fill
          // (which previously caused missing inter-row lines, e.g. between
          // rows 2 and 3 of the Work Order info table).
          doc.lineWidth(0.5).strokeColor(INNER_H_CLR);
          doc.rect(margin, y, contentWidth, dynamicH).fillAndStroke(bg, INNER_H_CLR);
          doc.lineWidth(0.5).strokeColor(INNER_V_CLR);
          x = margin;
          colWidths.slice(0, -1).forEach(w => {
            x += w;
            doc.moveTo(x, y).lineTo(x, y + dynamicH).stroke();
          });

          // Step 3: Render cell text
          x = margin;
          row.forEach((cell, ci) => {
            if (ci === descColIdx && cell && String(cell).includes('\n')) {
              // Two-part description rendering (matches Quotation PDF)
              const cellVal = String(cell);
              const parts = cellVal.split('\n');
              const descW = colWidths[ci] - 12;
              // Line 1: Main description — 8.5pt, black
              doc.fontSize(FS).font('Helvetica').fillColor(COLORS.TEXT_DARK);
              const descH = doc.heightOfString(parts[0], { width: descW });
              doc.text(parts[0], x + 6, y + 4, { width: descW, lineBreak: true });
              // Line 2: Drawing / Part No — 7pt, light gray #6B7280
              doc.fontSize(7).font('Helvetica').fillColor('#6B7280');
              doc.text(parts.slice(1).join('\n'), x + 6, y + 4 + descH + 2, { width: descW, lineBreak: true });
            } else {
              const align = colAligns ? colAligns[ci] : (ci === 0 ? 'center' : 'left');
              const pad   = align === 'center' ? 3 : 6;
              doc.fontSize(FS).font('Helvetica').fillColor(COLORS.TEXT_DARK)
                .text(String(cell ?? '-'), x + pad, y + 4, {
                  width: colWidths[ci] - pad * 2, align, lineBreak: true, height: dynamicH - 6, ellipsis: false,
                });
            }
            x += colWidths[ci];
          });
          y += dynamicH;
        });

        if (rows.length === 0) {
          doc.rect(margin, y, contentWidth, rowH).fill(COLORS.ROW_ALT);
          doc.fontSize(FS).font('Helvetica-Oblique').fillColor('#999')
            .text('No data available', margin, y + (rowH - FS) / 2, { width: contentWidth, align: 'center' });
          y += rowH;
        }

        // thick outer border around entire table
        const tableH = y - startY;
        doc.lineWidth(1.2).strokeColor(OUTER_COLOR).rect(margin, startY, contentWidth, tableH).stroke();

        return y;
      };

      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      // PAGE 1
      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      let currentY = drawPageHeader();

      // ------ Title "Work Order" ------ centered, Times-Bold (no underline)
      const titleText = 'Work Order';
      doc.fontSize(20).font('Times-Bold').fillColor('#000')
        .text(titleText, margin, currentY, { width: contentWidth, align: 'center' });
      currentY += 28;

      // ------ INFO TABLE ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      // 6 columns: S.No | Description | Value | S.No | Description | Value
      const iColW = [36, 100, 131, 36, 100, 132]; // total = 535 (= contentWidth)

      const preparedBy = (workOrder.prepared_by) || project.preparedBy?.name || project.quote_info?.seller_prepared_by || 'Auto Fill';
      const preparedByDisplay = project.preparedBy?.position && !workOrder.prepared_by
        ? `${preparedBy} (${project.preparedBy.position})`
        : preparedBy;
      const approvedBy = workOrder.approved_by || '';
      const dueDate    = workOrder.target_date ? dayjs(workOrder.target_date).format('DD-MMM-YYYY') : 'To be Filled';
      const issueDate  = workOrder.release_date
        ? dayjs(workOrder.release_date).format('DD-MMM-YYYY')
        : dayjs().format('DD-MMM-YYYY');

      const infoHeaders = ['S.No.', 'Description', 'Value', 'S.No.', 'Description', 'Value'];
      const infoRows = [
        ['1', 'Work Order No',      workOrder.work_order_number || '-', '5', 'Prepared By', preparedByDisplay],
        ['2', 'Project Name',       project.project_name || '-',       '6', 'Approved By', approvedBy || '-'],
        ['3', 'Client Name',        project.client?.client_name || '-','7', 'Due Date',    dueDate],
        ['4', 'Purchase Order No',  project.salesOrder?.sales_order_number || '-', '8', 'Issue Date', issueDate],
      ];

      const infoAligns = ['center', 'left', 'left', 'center', 'left', 'left'];
      currentY = drawTable(currentY, infoHeaders, iColW, infoRows, HEADER_GREY, 20, 22, infoAligns);
      currentY += 14;

      // ------ 1. MATERIAL DETAILS ---------------------------------------------------------------------------------------------------------------------------------------------
      doc.fontSize(12).font('Times-Bold').fillColor('#000')
        .text('1. Material Details:', margin, currentY);
      currentY += 16;

      // Columns: S.No | Description | Quantity | Requirements
      const jobReqs = workOrder.job_requirements || {};
      const mColW = [36, 260, 65, 174]; // total 535 (= contentWidth)
      const matHeaders = ['S.No.', 'Description', 'Quantity', 'Requirements'];
      const matRows = customParts.length > 0
        ? customParts.map((part, i) => {
            const origIdx = part._origIdx != null ? part._origIdx : i;
            // Robust requirement lookup: try string key, number key, and original index formats
            const userReq = jobReqs[String(origIdx)] || jobReqs[origIdx] || '';
            const requirement = (typeof userReq === 'string' && userReq.trim())
              ? userReq.trim()
              : 'N/A';
            const { description: stdDesc, drawingDisplay } = buildDescription({
              job_description: part.job_description || '',
              part_name: part.part_name || '',
              material: part.material || part.material_category || '',
              material_grade: part.material_grade || '',
              condition: part.condition || '',
              drawing_part_no: part.drawing_part_no || '',
              drawing_revision: part.drawing_revision || '',
            });
            const desc = drawingDisplay ? `${stdDesc}\n${drawingDisplay}` : stdDesc;
            // Robust quantity resolution: prefer part field, fallback to allLineItems
            const rawQty = part.quantity != null && part.quantity !== ''
              ? part.quantity
              : allLineItems[origIdx]?.quantity;
            const numQty = Number(rawQty);
            const displayQty = !isNaN(numQty) && numQty > 0 ? numQty : 'N/A';
            return [
              i + 1,
              desc,
              displayQty,
              requirement,
            ];
          })
        : [['1', '-', 'N/A', 'N/A']];

      const matAligns = ['center', 'left', 'center', 'left'];
      currentY = drawTable(currentY, matHeaders, mColW, matRows, HEADER_GREY, 20, 26, matAligns, 1);
      currentY += 18;

      // ------ 2. QUALITY REQUIREMENTS ---------------------------------------------------------------------------------------------------------------------------------
      if (allRequirements.length > 0) {
      // Check page break for section heading
      if (currentY + 60 > pageHeight - 45) {
        doc.addPage();
        currentY = drawPageHeader();
      }

      doc.fontSize(12).font('Times-Bold').fillColor('#000')
        .text('2. Quality Requirements:', margin, currentY);
      currentY += 16;

      allRequirements.forEach((item, i) => {
        if (currentY + 14 > pageHeight - 45) {
          doc.addPage();
          currentY = drawPageHeader();
        }
        doc.fontSize(9).font('Helvetica').fillColor('#000')
          .text(`${i + 1}.  ${item}`, margin + 4, currentY, { width: contentWidth - 8 });
        const lineCount = Math.ceil(doc.widthOfString(item, { fontSize: 9 }) / (contentWidth - 30));
        currentY += 13 * Math.max(1, lineCount);
      });

      currentY += 20;
      } // end if allRequirements

      // ------ FOOTER on every page ------------------------------------------------------------------------------------------------------------------------------------------
      drawGlobalFooter(doc, companySettings);

      doc.end();
    });
  }

  getModuleDescription(moduleType) {
    const descriptions = {
      cnc_turning: 'CNC Turning Operation',
      cnc_milling: 'CNC Milling Operation',
      welding: 'Welding Operation',
      heat_treatment: 'Heat Treatment',
      grinding: 'Grinding Operation',
      drilling: 'Drilling Operation',
      boring: 'Boring Operation',
      threading: 'Threading Operation',
      surface_treatment: 'Surface Treatment',
      assembly: 'Assembly Operation',
      testing: 'Testing & Inspection',
      other: 'Other Operation'
    };
    return descriptions[moduleType] || moduleType;
  }

  async updateWorkOrder(id, data) {
    const workOrder = await WorkOrder.findByPk(id);
    if (!workOrder) throw new Error('Work order not found');
    const normalized = this._normalizeAndValidateInput(data);
    const allowed = ['target_date', 'approved_by', 'prepared_by', 'notes', 'quality_requirements', 'special_instructions', 'job_ids', 'job_requirements'];
    const updates = {};
    for (const key of allowed) {
      if (key in normalized) updates[key] = normalized[key];
    }
    await workOrder.update(updates);
    return workOrder;
  }

  async saveProductionForms(workOrderId, production_forms) {
    const workOrder = await WorkOrder.findByPk(workOrderId);
    if (!workOrder) throw new Error('Work order not found');
    await workOrder.update({ production_forms: production_forms || [] });
    return workOrder;
  }

  async generateJobPdf(workOrderId, jobIndex = 0, formData = {}, partData = {}, explicitTravelerType = null) {
    const PDFDocument = require('pdfkit');
    const dayjs = require('dayjs');

    const workOrder = await WorkOrder.findByPk(workOrderId);
    if (!workOrder) throw new Error('Work order not found');

    const project = await Project.findByPk(workOrder.project_id, {
      include: [
        { model: Client, as: 'client' },
        { model: SalesOrder, as: 'salesOrder', required: false },
      ]
    });
    const companySettings = await settingsService.getCompanySettings(project.company_id);
    const logoAbsPath = settingsService.getLogoAbsolutePath(companySettings.logo);

    // Determine traveler type. Priority:
    //   1. Explicit type from caller (frontend tells us what UI it's showing) — most reliable.
    //   2. Project's stored production_traveler_type.
    //   3. Current system_module_config (company-scoped, fallback to global).
    //   4. Default 'machining_industry'.
    let travelerType = explicitTravelerType || project?.production_traveler_type || null;
    if (!travelerType) {
      try {
        const { QueryTypes } = require('sequelize');
        const configRows = await sequelize.query(
          `SELECT DISTINCT ON (section_name) module_key
           FROM system_module_config
           WHERE section_name = 'production_traveler'
             AND (company_id = :company_id OR company_id IS NULL)
           ORDER BY section_name, (company_id IS NOT NULL) DESC, id`,
          { type: QueryTypes.SELECT, replacements: { company_id: project.company_id } }
        );
        if (configRows.length > 0 && configRows[0].module_key) {
          travelerType = configRows[0].module_key;
        }
      } catch (cfgErr) {
        console.warn('Could not fetch system-config traveler type:', cfgErr.message);
      }
    }
    if (!travelerType) travelerType = 'machining_industry';

    if (travelerType === 'anodizing_industry') {
      return this.generateAnodizingJobPdf(workOrderId, jobIndex, formData, partData, {
        workOrder, project, companySettings, logoAbsPath
      });
    }

    const estimate = await Estimate.findOne({ where: { project_id: workOrder.project_id } });
    const customParts = estimate?.custom_parts || [];
    const part = (partData && Object.keys(partData).length) ? partData : (customParts[jobIndex] || {});

    const procedureId   = formData.procedureId   || 'QF-05';
    const effectiveDate = formData.effectiveDate  ? dayjs(formData.effectiveDate).format('MMMM YYYY') : dayjs().format('MMMM YYYY');
    const dimReport     = formData.dimensionReport || 'YES';
    const heatNumber    = formData.heatNumber      || part.heat_number || '';
    const sizeVal       = formData.size            || part.raw_material_dimension || '';
    const typeVal       = formData.materialType   || formData.type || part.material_grade || part.material || '';
    const cutLength     = formData.cutLength       || '';
    const quantityVal   = formData.quantity         || part.quantity || '';
    const sawCutOrBarFeed = formData.sawCutOrBarFeed || '';
    const generalNotes  = formData.generalNotes    || '';
    const revision      = workOrder.revision       || 1;
    const sectionBOps   = Array.isArray(formData.sectionB) && formData.sectionB.length
      ? formData.sectionB
      : [
          { sNo: 1, operation: 'Lathe Op(s)',           description: 'Machine as per drawing. Perform dimensional inspection.',                         required_operation: 'Yes',                   initials: '', opDate: '' },
          { sNo: 2, operation: 'Mill Op(s)',            description: 'Mill as per drawing. Perform dimensional inspection.',                            required_operation: 'Yes',                   initials: '', opDate: '' },
          { sNo: 3, operation: 'Deburr',               description: 'Deburr parts',                                                                    required_operation: 'Yes - Tumble',          initials: '', opDate: '' },
          { sNo: 4, operation: 'Heat Treat',           description: 'Heat treat part per drawing',                                                     required_operation: 'No',                    initials: '', opDate: '' },
          { sNo: 5, operation: 'Marking',              description: 'As per Drawing',                                                                  required_operation: 'No',                    initials: '', opDate: '' },
          { sNo: 6, operation: 'Final QC/Inspection',  description: 'WO entries complete, marking correct, visual inspection of part',                  required_operation: 'Yes',                   initials: '', opDate: '' },
          { sNo: 7, operation: 'Final Acceptance',     description: 'Purchase Order Review, Packing Slip Review, Material Review, ID & Traceability, Calibration, NCR, Packaging', required_operation: 'Confirm --- As Required', initials: '', opDate: '' },
        ];

    const sectionCOps = Array.isArray(formData.sectionC) && formData.sectionC.length
      ? formData.sectionC
      : [
          { process: '', selection: '', po: '', operator_vendor: '', inspector: '', completed: false },
          { process: '', selection: '', po: '', operator_vendor: '', inspector: '', completed: false },
          { process: '', selection: '', po: '', operator_vendor: '', inspector: '', completed: false },
        ];

    const sectionDNotes = Array.isArray(formData.sectionDNotes) && formData.sectionDNotes.length >= 4
      ? formData.sectionDNotes
      : ['', '', '', ''];

    const sectionEChecklist = (formData.sectionEChecklist && typeof formData.sectionEChecklist === 'object')
      ? formData.sectionEChecklist
      : { po: '', drawing: '', materialCert: '', inspecReport: '', delivery: '' };

    // Compute total pages (single page most of the time)
    const totalJobs = customParts.length || 1;

    // Ensure production traveler number exists (lazy-generate for older work orders)
    const ptNumber = await ensurePtNumber(workOrder);

    // Generate standardized filename using naming service
    const { generateDocumentName: genDocName } = require('./documentNamingService');
    const { fileName: jobFilename } = await genDocName({
      documentType: 'production_traveller',
      projectName: project.project_name,
      reference: ptNumber,
      projectId: workOrder.project_id,
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, lineGap: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        filename: jobFilename,
        projectId: workOrder.project_id,
      }));
      doc.on('error', reject);

      const M      = 28;
      const PW     = doc.page.width;   // 595
      const PH     = doc.page.height;  // 842
      const CW     = PW - 2 * M;      // 539
      const DARK   = COLORS.TEXT_DARK;
      const HDR_BG = COLORS.TABLE_HEAD;
      const LIGHT_BG = COLORS.ROW_ALT;
      const BORDER = COLORS.BORDER;
      const THIN   = '#000000';
      const ALT_BG = '#f0fbfa';

      const cell = (x, y, w, h, bg) => {
        doc.rect(x, y, w, h).fill(bg || '#ffffff');
        doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(BORDER).stroke();
      };

      // Draw a tick/checkmark using lines (Helvetica doesn't support Unicode tick chars)
      const drawTick = (cx, cy, size) => {
        const s = size || 8;
        doc.save()
           .lineWidth(1.8)
           .strokeColor(DARK)
           .moveTo(cx - s * 0.35, cy)
           .lineTo(cx - s * 0.05, cy + s * 0.35)
           .lineTo(cx + s * 0.45, cy - s * 0.35)
           .stroke()
           .restore();
      };

      /** Measure how tall wrapped text will be inside a column of width w */
      const measureH = (text, w, fs = 8, pad = 3) => {
        const inner = w - pad * 2;
        if (inner <= 0) return fs * 1.4;
        const h = doc.fontSize(fs).font('Helvetica').heightOfString(String(text ?? ''), { width: inner, lineGap: 0 });
        return Math.max(h + pad * 2 + 6, fs * 1.4 + pad * 2);
      };

      const txt = (text, x, y, w, h, opts = {}) => {
        const fs    = opts.fs    || 8;
        const font  = opts.bold  ? 'Helvetica-Bold' : 'Helvetica';
        const clr   = opts.clr   || DARK;
        const align = opts.align || 'left';
        const pad   = opts.pad   !== undefined ? opts.pad : 3;
        const noWrap = opts.nowrap === true;
        const innerW = Math.max(1, w - pad * 2);
        const str = String(text ?? '');
        doc.fontSize(fs).font(font);
        const actualH = noWrap ? fs * 1.2 : doc.heightOfString(str, { width: innerW });
        let ty;
        if (opts.top) {
          ty = y + pad;
        } else {
          ty = y + Math.max(pad, (h - actualH) / 2);
        }
        const maxTextH = Math.max(1, h - (ty - y) - 1);
        doc.fontSize(fs).font(font).fillColor(clr)
           .text(str, x + pad, ty, { width: innerW, height: maxTextH, align, lineBreak: !noWrap, ellipsis: false });
      };

      const darkHdr = (text, x, y, w, h, fs = 7.5) => {
        doc.rect(x, y, w, h).fill(HDR_BG);
        doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(BORDER).stroke();
        const innerW = Math.max(1, w - 6);
        doc.fontSize(fs).font('Helvetica-Bold');
        const textH = doc.heightOfString(String(text ?? ''), { width: innerW });
        const ty = y + Math.max(2, (h - textH) / 2);
        doc.fontSize(fs).font('Helvetica-Bold').fillColor('#ffffff')
           .text(String(text ?? ''), x + 3, ty, { width: innerW, align: 'center', lineBreak: true });
      };

      /** Draw a section heading as bold text (no background bar) */
      const sectionBanner = (label, y) => {
        if (y + 20 > PH - 40) { doc.addPage(); y = M; }
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a1a')
           .text(label, M, y, { width: CW, lineBreak: false });
        return doc.y + 4;
      };

      /** Draw the top header block and return the Y after it */
      const drawTopHeader = (pageNum) => {
        let curY = M;
        const HDR_H   = 60;
        const LOGO_W  = Math.floor(CW * 0.38);
        const META_W  = CW - LOGO_W;
        const META_X  = M + LOGO_W;
        const TITLE_W = Math.floor(META_W * 0.45);
        const INFO_W  = META_W - TITLE_W;

        cell(M, curY, LOGO_W, HDR_H, '#ffffff');
        // Priority: base64 logo_data > file path — ensures company-specific logo
        let logoDrawn = false;
        if (companySettings.logo_data) {
          try {
            const b64Match = companySettings.logo_data.match(/^data:[^;]+;base64,(.+)$/);
            if (b64Match) {
              doc.image(Buffer.from(b64Match[1], 'base64'), M + 4, curY + 4, { fit: [LOGO_W - 8, HDR_H - 8], align: 'left', valign: 'center' });
              logoDrawn = true;
            }
          } catch (_) {}
        }
        if (!logoDrawn && logoAbsPath) {
          try { doc.image(logoAbsPath, M + 4, curY + 4, { fit: [LOGO_W - 8, HDR_H - 8], align: 'left', valign: 'center' }); } catch (_) {}
        }

        cell(META_X, curY, TITLE_W, HDR_H, '#ffffff');
        doc.fontSize(13).font('Helvetica-Bold').fillColor(DARK)
           .text('Production Traveler', META_X + 3, curY + (HDR_H - 16) / 2, { width: TITLE_W - 6, align: 'center', lineBreak: false });

        const infoRowH = Math.floor(HDR_H / 4);
        const lW = Math.floor(INFO_W * 0.47);
        const vW = INFO_W - lW;
        const ix = META_X + TITLE_W;
        [
          ['Effective Date', effectiveDate],
          ['Procedure ID',   procedureId],
          ['Page',           `${pageNum} of ${totalJobs}`],
          ['Revision',       String(revision)],
        ].forEach(([label, value], ri) => {
          const ry = curY + ri * infoRowH;
          cell(ix,      ry, lW, infoRowH, LIGHT_BG);
          cell(ix + lW, ry, vW, infoRowH, '#ffffff');
          txt(label, ix,      ry, lW, infoRowH, { fs: 7, bold: true });
          txt(value, ix + lW, ry, vW, infoRowH, { fs: 7 });
        });
        return curY + HDR_H;
      };

      let curY = drawTopHeader(jobIndex + 1);

      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      // WO INFO TABLE
      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      const WO_HDR_H = 20;
      const WO_VAL_H = 22;
      const poNumber = project?.po_number || project?.salesOrder?.customer_po_number || '';
      const poDate   = project?.salesOrder?.created_at
        ? dayjs(project.salesOrder.created_at).format('M/D/YYYY')
        : dayjs().format('M/D/YYYY');

      const woColW = [60, 60, 80, 130, 42, 38, 72, 57]; // total = 539
      const woHdrs = ['PT #', 'PO #', 'Part Number', 'Product Description', 'Rev. #', 'Qty', 'PO Date', 'Dim. Report'];
      const woVals = [
        ptNumber || '',
        poNumber,
        part.drawing_part_no || '',
        part.job_description || project?.project_name || '',
        String(revision),
        String(part.quantity != null && part.quantity !== '' ? part.quantity : quantityVal),
        poDate,
        dimReport,
      ];

      let xo = M;
      woHdrs.forEach((h, i) => { darkHdr(h, xo, curY, woColW[i], WO_HDR_H, 7); xo += woColW[i]; });
      curY += WO_HDR_H;

      let woValH = WO_VAL_H;
      woVals.forEach((v, i) => {
        const needed = measureH(v, woColW[i], 7, 2);
        if (needed > woValH) woValH = needed;
      });
      woValH = Math.ceil(woValH);

      xo = M;
      woVals.forEach((v, i) => {
        cell(xo, curY, woColW[i], woValH, '#ffffff');
        txt(String(v ?? ''), xo, curY, woColW[i], woValH, { fs: 7, align: 'center', pad: 2 });
        xo += woColW[i];
      });
      curY += woValH + 8;

      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      // SECTION A: MATERIAL
      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      curY = sectionBanner('Section A: Material', curY);

      // Columns: Line | Operation | Description (wide, with sub-columns) | Check off once complete
      const saColW = [30, 75, 334, 100]; // total = 539
      let xs = M;
      darkHdr('Line',      xs, curY, saColW[0], 28); xs += saColW[0];
      darkHdr('Operation', xs, curY, saColW[1], 28); xs += saColW[1];
      darkHdr('Description', xs, curY, saColW[2], 28); xs += saColW[2];
      darkHdr('Check off once\ncomplete', xs, curY, saColW[3], 28);
      curY += 28;

      // Row 1: Material Specs --- two sub-rows: labels then values
      const descX = M + saColW[0] + saColW[1];
      const descW = saColW[2];
      const matSubW = Math.floor(descW / 3);
      const matLastW = descW - matSubW * 2;

      // Row 1 has label sub-row + value sub-row
      const matLabelH = 16;
      const matValueH = 18;
      const matH = matLabelH + matValueH;

      // Draw outer cells for Row 1
      xs = M;
      cell(xs, curY, saColW[0], matH, '#fff'); xs += saColW[0];
      cell(xs, curY, saColW[1], matH, '#fff'); xs += saColW[1];
      cell(xs, curY, saColW[2], matH, '#fff'); xs += saColW[2];
      cell(xs, curY, saColW[3], matH, '#fff');

      txt('1', M, curY, saColW[0], matH, { align: 'center', fs: 7.5 });
      txt('Material Specs', M + saColW[0], curY, saColW[1], matH, { fs: 7.5, align: 'center' });

      // Description sub-column labels
      const lblY = curY;
      doc.lineWidth(0.5).strokeColor(THIN);
      // Vertical dividers in description
      doc.moveTo(descX + matSubW, curY).lineTo(descX + matSubW, curY + matH).stroke();
      doc.moveTo(descX + matSubW * 2, curY).lineTo(descX + matSubW * 2, curY + matH).stroke();
      // Horizontal divider between label and value
      doc.moveTo(descX, curY + matLabelH).lineTo(descX + descW, curY + matLabelH).stroke();

      // Sub-column header labels (bold)
      txt('Size', descX, lblY, matSubW, matLabelH, { fs: 7, bold: true, align: 'center' });
      txt('Type', descX + matSubW, lblY, matSubW, matLabelH, { fs: 7, bold: true, align: 'center' });
      txt('Heat', descX + matSubW * 2, lblY, matLastW, matLabelH, { fs: 7, bold: true, align: 'center' });

      // Sub-column values
      const valY = curY + matLabelH;
      txt(sizeVal || '', descX, valY, matSubW, matValueH, { fs: 7, align: 'center' });
      txt(typeVal || '', descX + matSubW, valY, matSubW, matValueH, { fs: 7, align: 'center' });
      txt(heatNumber || '', descX + matSubW * 2, valY, matLastW, matValueH, { fs: 7, align: 'center' });

      // Check off column --- show tick if material completed
      const sectionACompleted = formData.sectionACompleted || {};
      if (sectionACompleted.material) {
        const tickCx = M + saColW[0] + saColW[1] + saColW[2] + saColW[3] / 2;
        const tickCy = curY + matH / 2;
        drawTick(tickCx, tickCy, 8);
      }
      curY += matH;

      // Row 2: Saw --- two sub-rows: labels then values
      const sawLabelH = 16;
      const sawValueH = 18;
      const sawH = sawLabelH + sawValueH;

      xs = M;
      cell(xs, curY, saColW[0], sawH, ALT_BG); xs += saColW[0];
      cell(xs, curY, saColW[1], sawH, ALT_BG); xs += saColW[1];
      cell(xs, curY, saColW[2], sawH, ALT_BG); xs += saColW[2];
      cell(xs, curY, saColW[3], sawH, ALT_BG);

      txt('2', M, curY, saColW[0], sawH, { align: 'center', fs: 7.5 });
      txt('Saw', M + saColW[0], curY, saColW[1], sawH, { fs: 7.5, align: 'center' });

      // Saw description sub-columns
      const sawDescX = descX;
      doc.lineWidth(0.5).strokeColor(THIN);
      doc.moveTo(sawDescX + matSubW, curY).lineTo(sawDescX + matSubW, curY + sawH).stroke();
      doc.moveTo(sawDescX + matSubW * 2, curY).lineTo(sawDescX + matSubW * 2, curY + sawH).stroke();
      doc.moveTo(sawDescX, curY + sawLabelH).lineTo(sawDescX + descW, curY + sawLabelH).stroke();

      // Sub-column header labels
      txt('Saw Cut or Bar Feed?', sawDescX, curY, matSubW, sawLabelH, { fs: 6.5, bold: true, align: 'center' });
      txt('Qty', sawDescX + matSubW, curY, matSubW, sawLabelH, { fs: 7, bold: true, align: 'center' });
      txt('Cut Length', sawDescX + matSubW * 2, curY, matLastW, sawLabelH, { fs: 7, bold: true, align: 'center' });

      // Sub-column values
      const sawValY = curY + sawLabelH;
      txt(sawCutOrBarFeed || '', sawDescX, sawValY, matSubW, sawValueH, { fs: 7, align: 'center' });
      txt(quantityVal || String(part.quantity ?? ''), sawDescX + matSubW, sawValY, matSubW, sawValueH, { fs: 7, align: 'center' });
      txt(cutLength || '', sawDescX + matSubW * 2, sawValY, matLastW, sawValueH, { fs: 7, align: 'center' });

      // Check off column for Saw --- draw tick if saw completed
      if (sectionACompleted.saw) {
        const tickCx = M + saColW[0] + saColW[1] + saColW[2] + saColW[3] / 2;
        const tickCy = curY + sawH / 2;
        drawTick(tickCx, tickCy, 8);
      }

      curY += sawH + 8;

      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      // SECTION B: MACHINING & MILLING OPERATIONS
      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      curY = sectionBanner('Section B: Machining & Milling Operations', curY);

      // Columns: Line | Operation | Description | Required Operation(s)? | Operator | Date | Check off once complete
      const sbColW = [28, 80, 175, 80, 60, 56, 60]; // total = 539
      xs = M;
      ['Line', 'Operation', 'Description', 'Required\nOperation(s)?', 'Operator', 'Date', 'Check off once\ncomplete'].forEach((h, i) => {
        darkHdr(h, xs, curY, sbColW[i], 28); xs += sbColW[i];
      });
      curY += 28;

      sectionBOps.forEach((op, idx) => {
        const descH  = measureH(op.description, sbColW[2], 7.5, 3);
        const opH    = measureH(op.operation,   sbColW[1], 7.5, 3);
        const reqH   = measureH(op.required_operation || '', sbColW[3], 7, 3);
        const rH     = Math.max(20, Math.ceil(Math.max(descH, opH, reqH)));
        if (curY + rH > PH - 40) { doc.addPage(); curY = M; }
        const bg = idx % 2 === 0 ? '#ffffff' : ALT_BG;
        xs = M;
        sbColW.forEach(w => { cell(xs, curY, w, rH, bg); xs += w; });
        let cx = M;
        txt(String(op.sNo), cx, curY, sbColW[0], rH, { align: 'center', fs: 7.5 }); cx += sbColW[0];
        txt(op.operation,   cx, curY, sbColW[1], rH, { fs: 7.5, bold: true }); cx += sbColW[1];
        txt(op.description, cx, curY, sbColW[2], rH, { fs: 7.5, top: true }); cx += sbColW[2];
        txt(op.required_operation || '', cx, curY, sbColW[3], rH, { fs: 7, align: 'center' }); cx += sbColW[3];
        txt(op.initials || '', cx, curY, sbColW[4], rH, { fs: 7, align: 'center' }); cx += sbColW[4];
        txt(op.opDate || '', cx, curY, sbColW[5], rH, { fs: 7, align: 'center' }); cx += sbColW[5];
        // Check off once complete column --- draw tick if completed
        if (op.completed) {
          const tickCx = cx + sbColW[6] / 2;
          const tickCy = curY + rH / 2;
          drawTick(tickCx, tickCy, 7);
        }
        curY += rH;
      });
      curY += 8;

      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      // SECTION C: EXTERNAL PROCESSES
      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      if (curY + 100 > PH - 40) { doc.addPage(); curY = M; }
      curY = sectionBanner('Section C: External Processes', curY);

      // Columns: Line | Process | Selection | PO | Operator/Vendor | Inspector | Check off once complete
      const scColW = [30, 80, 80, 70, 100, 80, 99]; // total = 539
      xs = M;
      ['Line', 'Process', 'Selection', 'PO', 'Operator/Vendor', 'Inspector', 'Check off once\ncomplete'].forEach((h, i) => {
        darkHdr(h, xs, curY, scColW[i], 24); xs += scColW[i];
      });
      curY += 24;

      for (let r = 0; r < 3; r++) {
        const rH = 20;
        if (curY + rH > PH - 40) { doc.addPage(); curY = M; }
        const rowData = sectionCOps[r] || {};
        const bg = r % 2 === 0 ? '#ffffff' : ALT_BG;
        xs = M;
        scColW.forEach(w => { cell(xs, curY, w, rH, bg); xs += w; });
        txt(String(r + 1), M, curY, scColW[0], rH, { align: 'center', fs: 7.5 });
        let cx = M + scColW[0];
        txt(rowData.process || '', cx, curY, scColW[1], rH, { fs: 7.5 }); cx += scColW[1];
        txt(rowData.selection || '', cx, curY, scColW[2], rH, { fs: 7.5 }); cx += scColW[2];
        txt(rowData.po || '', cx, curY, scColW[3], rH, { fs: 7.5 }); cx += scColW[3];
        txt(rowData.operator_vendor || '', cx, curY, scColW[4], rH, { fs: 7.5 }); cx += scColW[4];
        txt(rowData.inspector || '', cx, curY, scColW[5], rH, { fs: 7.5 }); cx += scColW[5];
        // Draw tick in "Check off once complete" column if completed
        if (rowData.completed) {
          const tickCx = cx + scColW[6] / 2;
          const tickCy = curY + rH / 2;
          drawTick(tickCx, tickCy, 7);
        }
        curY += rH;
      }
      curY += 8;

      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      // SECTION D: GENERAL NOTES
      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      if (curY + 100 > PH - 40) { doc.addPage(); curY = M; }
      curY = sectionBanner('Section D: General Notes', curY);

      const noteRowH = 20;
      for (let r = 0; r < 4; r++) {
        if (curY + noteRowH > PH - 40) { doc.addPage(); curY = M; }
        cell(M, curY, CW, noteRowH, '#ffffff');
        const noteText = (sectionDNotes[r] || '').trim();
        if (noteText) {
          doc.fontSize(8).font('Helvetica').fillColor(DARK)
             .text(noteText, M + 5, curY + 4, { width: CW - 10, height: noteRowH - 8, lineBreak: true });
        }
        curY += noteRowH;
      }
      curY += 8;

      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      // SECTION E: CHECK LIST
      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      if (curY + 60 > PH - 40) { doc.addPage(); curY = M; }
      curY = sectionBanner('Section E: Check List', curY);

      const clItems = [
        { label: 'PO:', key: 'po' },
        { label: 'Drawing:', key: 'drawing' },
        { label: 'Material Cert:', key: 'materialCert' },
        { label: 'Inspec. Report:', key: 'inspecReport' },
        { label: 'Delivery:', key: 'delivery' },
      ];
      const clColW  = [108, 108, 108, 108, 107]; // total = 539
      const clHdrH  = 20;
      const clValH  = 22;

      xs = M;
      clItems.forEach((item, i) => { darkHdr(item.label, xs, curY, clColW[i], clHdrH, 7.5); xs += clColW[i]; });
      curY += clHdrH;

      xs = M;
      clItems.forEach((item, i) => {
        cell(xs, curY, clColW[i], clValH, '#ffffff');
        const val = sectionEChecklist[item.key];
        if (val && typeof val === 'string' && val.trim()) {
          doc.fontSize(7.5).font('Helvetica').fillColor(DARK)
             .text(val.trim(), xs + 4, curY + (clValH - 7.5) / 2, { width: clColW[i] - 8, align: 'center', lineBreak: false });
        }
        xs += clColW[i];
      });
      curY += clValH;

      // ------ FOOTER ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      doc.fontSize(7).font('Helvetica').fillColor('#999')
         .text(`${workOrder.work_order_number}  \u00b7  Job #${jobIndex + 1}  \u00b7  Generated ${dayjs().format('DD/MM/YYYY HH:mm')}`,
               M, PH - 22, { width: CW, align: 'center', lineBreak: false });

      doc.end();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // ANODIZING INDUSTRY: Production Traveller PDF Generation
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
  async generateAnodizingJobPdf(workOrderId, jobIndex, formData, partData, context) {
    const PDFDocument = require('pdfkit');
    const dayjs = require('dayjs');
    const { workOrder, project, companySettings, logoAbsPath } = context;

    const estimate = await Estimate.findOne({ where: { project_id: workOrder.project_id } });
    const customParts = estimate?.custom_parts || [];
    const part = (partData && Object.keys(partData).length) ? partData : (customParts[jobIndex] || {});
    const totalJobs = customParts.length || 1;

    // Extract form data with anodizing-specific fields
    const procedureId   = formData.procedureId   || 'QF-07';
    const effectiveDate = formData.effectiveDate  ? dayjs(formData.effectiveDate).format('MMMM YYYY') : dayjs().format('MMMM YYYY');
    const revision      = workOrder.revision       || 0;
    const generalNotes  = formData.generalNotes    || '';

    // Ensure production traveler number exists (lazy-generate for older work orders)
    const ptNumber = await ensurePtNumber(workOrder);

    // Section A: WO Information.
    // Two possible shapes from the frontend:
    //   1. AnodizingTraveler.tsx — nested under formData.sectionA + formData.anodizingSpecs absent;
    //      spec fields live in sectionA (anodizeType, anodizeClass, etc.)
    //   2. ProductionTab.tsx (anodizing variant) — flat top-level fields (material1, hamfWoNumber,
    //      customerPoNumber, hamfWoDate, shipDate) + nested formData.anodizingSpecs.{type,
    //      thicknessSpec, anodizingClass, dyeColor, seal, maskThreads, tumbled, scotchBrite}
    const sa   = formData.sectionA       || {};
    const aSpec = formData.anodizingSpecs || {};
    const hamfWoNumber       = sa.hamfWoNumber       || formData.hamfWoNumber       || ptNumber || '';
    const productDescription = sa.productDescription || formData.productDescription || part.job_description || project?.project_name || '';
    const specDrawingRevision = sa.specDrawingRevision || formData.specDrawingRevision || part.drawing_part_no || '';
    const material1          = sa.material1          || formData.material1          || '';
    const material2          = sa.material2          || formData.material2          || '';
    const material3          = sa.material3          || formData.material3          || '';
    const quantityVal        = sa.quantity           || formData.quantity           || part.quantity || '';
    const customer           = sa.customer           || formData.customer           || project?.client?.company_name || '';
    const customerPoNumber   = sa.customerPo         || formData.customerPo         || formData.customerPoNumber   || project?.po_number || project?.salesOrder?.customer_po_number || '';
    const hamfWoDateRaw      = sa.woDate             || formData.woDate             || formData.hamfWoDate         || '';
    const hamfWoDate         = hamfWoDateRaw ? dayjs(hamfWoDateRaw).format('DD MMM YYYY') : dayjs().format('DD MMM YYYY');
    const shipDateRaw        = sa.shipDate           || formData.shipDate           || '';
    const shipDate           = shipDateRaw ? dayjs(shipDateRaw).format('DD MMM YYYY') : '';

    // Anodizing Specifications — accept both shapes
    const anodizingType       = sa.anodizeType       || aSpec.type           || aSpec.anodizeType  || '';
    const thicknessSpec       = sa.thicknessSpec     || aSpec.thicknessSpec  || '';
    const anodizingClass      = sa.anodizeClass      || aSpec.anodizingClass || aSpec.anodizeClass || aSpec.class || '';
    const dyeColor            = sa.dyeColor          || aSpec.dyeColor       || '';
    const seal                = sa.seal        !== undefined ? sa.seal        : aSpec.seal;
    const maskThreads         = sa.maskThreads !== undefined ? sa.maskThreads : aSpec.maskThreads;
    const tumbled             = sa.tumbled     !== undefined ? sa.tumbled     : aSpec.tumbled;
    const scotchBrite         = sa.scotchBrite !== undefined ? sa.scotchBrite : aSpec.scotchBrite;

    // Default anodizing operations (19 steps)
    const defaultAnodizingOps = [
      { sNo: 1,  operation: 'Visual Inspection',                     description: 'Inspect all parts for damage, surface finish concerns and part quality',                             required_operation: '' },
      { sNo: 2,  operation: 'Initial Cleaning Alkaline Wash',        description: 'Manually clean excessive soil prior to racking (when necessary)',                                    required_operation: '' },
      { sNo: 3,  operation: 'Masking',                               description: 'Mask threaded holes as noted on the specification',                                                 required_operation: '' },
      { sNo: 4,  operation: 'Racking',                               description: 'Ensure solid contact and minimize rack marks – rack on I.D. where possible',                        required_operation: '' },
      { sNo: 5,  operation: 'Secondary Cleaning Alkaline Immersion', description: 'Immersion in cleaning tank on racking – 5-30 minutes depending on cleanliness',                     required_operation: '' },
      { sNo: 6,  operation: 'Caustic Etch Rinse',                    description: 'Immersion in 115-120 deg F tank for 30 Secs-5 minutes depending on existing oxidation',              required_operation: '' },
      { sNo: 7,  operation: 'Acid Etch Rinse',                       description: 'Immersion in 120 deg F tank for 4-6 mins',                                                          required_operation: '' },
      { sNo: 8,  operation: 'DeOx Rinse',                            description: 'Immersion in ambient tank for 5-10 minutes and verify parts free of smut',                           required_operation: '' },
      { sNo: 9,  operation: 'Anodize Rinse',                         description: 'Parts to be ran at correct tank temperature and current density/voltage',                             required_operation: '' },
      { sNo: 10, operation: 'Neutralize Rinse',                      description: 'Immersion in nitric acid on racking for 5-10 minutes followed by thorough rinsing',                  required_operation: '' },
      { sNo: 11, operation: 'Dye Rinse',                             description: 'Immersion of parts racked or unracked in correct dye and temperature until saturated',               required_operation: '' },
      { sNo: 12, operation: 'Seal Rinse',                            description: 'Immersion in nickel acetate seat at 165-185 deg F for 5-20 minutes',                                 required_operation: '' },
      { sNo: 13, operation: 'Dry',                                   description: 'Dry water from parts with compressed air and allow to hang dry for 15 minutes',                      required_operation: '' },
      { sNo: 14, operation: 'Un-Rack',                               description: 'Un-rack parts careful not to scratch or damage surfaces and remove masking',                         required_operation: '' },
      { sNo: 15, operation: 'Technical Inspect',                     description: 'Inspect parts for even coating, note acceptable rack marks, verify colors',                          required_operation: '' },
      { sNo: 16, operation: 'Commercial Inspection',                 description: 'WO entries complete, marking correct, visual inspection of part',                                    required_operation: '' },
      { sNo: 17, operation: 'Package',                               description: 'Securely and professionally package parts for shipment',                                             required_operation: '' },
      { sNo: 18, operation: 'Final Acceptance',                      description: 'Supervisor acceptance of packaging quality and documentation',                                        required_operation: '' },
      { sNo: 19, operation: 'Product Release',                       description: 'Release of product by HAMF and acceptance by customer',                                              required_operation: '' },
    ];

    const sectionBOps = Array.isArray(formData.sectionB) && formData.sectionB.length
      ? formData.sectionB
      : defaultAnodizingOps;

    // Generate standardized filename
    const { generateDocumentName: genDocName } = require('./documentNamingService');
    const { fileName: jobFilename } = await genDocName({
      documentType: 'production_traveller',
      projectName: project.project_name,
      reference: ptNumber,
      projectId: workOrder.project_id,
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, lineGap: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        filename: jobFilename,
        projectId: workOrder.project_id,
      }));
      doc.on('error', reject);

      // Page dimensions
      const M      = 28;
      const PW     = doc.page.width;   // 595
      const PH     = doc.page.height;  // 842
      const CW     = PW - 2 * M;       // 539
      const DARK   = '#1a1a1a';
      const HDR_BG = '#2c3e50';        // Dark header (black/dark gray)
      const BORDER = '#000000';
      const ALT_BG = '#ffffff';        // White background (no color)

      // Helper: draw a cell with border
      const cell = (x, y, w, h, bg) => {
        doc.rect(x, y, w, h).fill(bg || '#ffffff');
        doc.rect(x, y, w, h).lineWidth(LW).strokeColor(BORDER).stroke();
      };

      // Helper: draw dark header cell
      const darkHdr = (text, x, y, w, h, fs = 7.5, textColor = '#ffffff') => {
        doc.rect(x, y, w, h).fill(HDR_BG);
        doc.rect(x, y, w, h).lineWidth(LW).strokeColor(BORDER).stroke();
        const innerW = Math.max(1, w - 4);
        doc.fontSize(fs).font('Helvetica-Bold');
        const textH = doc.heightOfString(String(text ?? ''), { width: innerW });
        const ty = y + Math.max(2, (h - textH) / 2);
        doc.fontSize(fs).font('Helvetica-Bold').fillColor(textColor)
           .text(String(text ?? ''), x + 2, ty, { width: innerW, align: 'center', lineBreak: true });
      };

      // Helper: draw text in a cell
      const txt = (text, x, y, w, h, opts = {}) => {
        const fs    = opts.fs    || 7.5;
        const font  = opts.bold  ? 'Helvetica-Bold' : 'Helvetica';
        const clr   = opts.clr   || DARK;
        const align = opts.align || 'left';
        const pad   = opts.pad   !== undefined ? opts.pad : 2;
        const innerW = Math.max(1, w - pad * 2);
        const str = String(text ?? '');
        doc.fontSize(fs).font(font);
        const actualH = doc.heightOfString(str, { width: innerW });
        let ty = opts.top ? y + pad : y + Math.max(pad, (h - actualH) / 2);
        doc.fontSize(fs).font(font).fillColor(clr)
           .text(str, x + pad, ty, { width: innerW, height: h - pad, align, lineBreak: true });
      };

      // Helper: measure text height
      const measureH = (text, w, fs = 7.5, pad = 2) => {
        const inner = w - pad * 2;
        if (inner <= 0) return fs * 1.4;
        const h = doc.fontSize(fs).font('Helvetica').heightOfString(String(text ?? ''), { width: inner, lineGap: 0 });
        return Math.max(h + pad * 2 + 4, fs * 1.4 + pad * 2);
      };

      // Helper: section banner
      const sectionBanner = (label, y) => {
        if (y + 20 > PH - 40) { doc.addPage(); y = M; }
        doc.fontSize(9).font('Helvetica-Bold').fillColor(DARK)
           .text(label, M, y, { width: CW, lineBreak: false });
        return doc.y + 4;
      };

      // Consistent line weight for all borders
      const LW = 0.75;

      let curY = M;

      // ═══════════════════════════════════════════════════════════════════════════
      // HEADER SECTION — Logo | Title (3 rows) | Info (4 rows), all same height
      // ═══════════════════════════════════════════════════════════════════════════
      const HDR_H   = 64;
      const LOGO_W  = 170;            // ~32 % of CW
      const TITLE_W = 178;            // ~33 %
      const INFO_W  = CW - LOGO_W - TITLE_W; // ~35 %

      // Outer border for entire header block
      doc.rect(M, curY, CW, HDR_H).lineWidth(LW).strokeColor(BORDER).stroke();

      // Logo cell
      doc.rect(M, curY, LOGO_W, HDR_H).lineWidth(LW).strokeColor(BORDER).stroke();
      // Priority: base64 logo_data > file path — ensures company-specific logo
      let anodLogoDrawn = false;
      if (companySettings.logo_data) {
        try {
          const b64Match = companySettings.logo_data.match(/^data:[^;]+;base64,(.+)$/);
          if (b64Match) {
            doc.image(Buffer.from(b64Match[1], 'base64'), M + 6, curY + 6, { fit: [LOGO_W - 12, HDR_H - 12], align: 'center', valign: 'center' });
            anodLogoDrawn = true;
          }
        } catch (_) {}
      }
      if (!anodLogoDrawn && logoAbsPath) {
        try { doc.image(logoAbsPath, M + 6, curY + 6, { fit: [LOGO_W - 12, HDR_H - 12], align: 'center', valign: 'center' }); } catch (_) {}
      }

      // Title cells — 3 equal rows inside the title column
      const titleX    = M + LOGO_W;
      const titleRowH = HDR_H / 3;
      ['Production', 'Traveler', 'Anodizing'].forEach((title, i) => {
        const ry = curY + i * titleRowH;
        doc.rect(titleX, ry, TITLE_W, titleRowH).lineWidth(LW).strokeColor(BORDER).stroke();
        doc.fontSize(12).font('Helvetica-Bold').fillColor(DARK)
           .text(title, titleX, ry + (titleRowH - 12) / 2, { width: TITLE_W, align: 'center' });
      });

      // Info cells — 4 equal rows (label | value) inside the info column
      const infoX    = titleX + TITLE_W;
      const infoRowH = HDR_H / 4;
      const lblW     = Math.round(INFO_W * 0.55);
      const valW     = INFO_W - lblW;
      [
        ['Effective Date', effectiveDate],
        ['Procedure ID',   procedureId],
        ['Page',           `${jobIndex + 1} of ${totalJobs}`],
        ['Revision',       String(revision)],
      ].forEach(([label, value], i) => {
        const ry = curY + i * infoRowH;
        // Label half
        doc.rect(infoX, ry, lblW, infoRowH).fill('#f5f5f5');
        doc.rect(infoX, ry, lblW, infoRowH).lineWidth(LW).strokeColor(BORDER).stroke();
        doc.fontSize(7).font('Helvetica-Bold').fillColor(DARK)
           .text(label, infoX, ry + (infoRowH - 7) / 2, { width: lblW, align: 'center' });
        // Value half
        doc.rect(infoX + lblW, ry, valW, infoRowH).lineWidth(LW).strokeColor(BORDER).stroke();
        doc.fontSize(7.5).font('Helvetica').fillColor(DARK)
           .text(value, infoX + lblW, ry + (infoRowH - 7.5) / 2, { width: valW, align: 'center' });
      });
      curY += HDR_H + 6;

      // ═══════════════════════════════════════════════════════════════════════════
      // SECTION A: WO INFORMATION
      // ═══════════════════════════════════════════════════════════════════════════
      curY = sectionBanner('Section A: WO Information', curY);

      const woHdrH = 20;
      const woValH = 22;

      // --- Row 1: HAMF PT # | Product Description / Part Number | Spec. / Drawing # Revision | Material ---
      const woCol1 = [100, 160, 130, 149]; // total = 539
      let xo = M;
      ['HAMF PT #', 'Product Description\nPart Number', 'Spec. / Drawing #\nRevision', 'Material'].forEach((h, i) => {
        darkHdr(h, xo, curY, woCol1[i], woHdrH, 7);
        xo += woCol1[i];
      });
      curY += woHdrH;

      // Row 1 values
      xo = M;
      [hamfWoNumber, productDescription, specDrawingRevision].forEach((v, i) => {
        cell(xo, curY, woCol1[i], woValH, '#ffffff');
        txt(v, xo, curY, woCol1[i], woValH, { fs: 8, align: 'center' });
        xo += woCol1[i];
      });
      // Material: split into Material 1 | Material 2 | Material 3
      const matW = woCol1[3];
      const matThirdW = Math.floor(matW / 3);
      const matLabels = ['Mat 1', 'Mat 2', 'Mat 3'];
      const matVals   = [material1, material2, material3];
      for (let mi = 0; mi < 3; mi++) {
        const mw = mi < 2 ? matThirdW : matW - matThirdW * 2;
        const mx = xo + matThirdW * mi;
        cell(mx, curY, mw, woValH, '#fafafa');
        doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#666')
           .text(matLabels[mi], mx + 1, curY + 2, { width: mw - 2, align: 'center' });
        doc.fontSize(7).font('Helvetica').fillColor(DARK)
           .text(String(matVals[mi] || ''), mx + 1, curY + 11, { width: mw - 2, align: 'center' });
      }
      curY += woValH;

      // --- Row 2: Quantity | Customer | Customer PO # | HAMF PT # Date | Ship Date ---
      const woCol2 = [80, 130, 100, 115, 114]; // total = 539
      xo = M;
      ['Quantity', 'Customer', 'Customer PO #', 'HAMF PT # Date\n(D/M/Y)', 'Ship Date'].forEach((h, i) => {
        darkHdr(h, xo, curY, woCol2[i], woHdrH, 7);
        xo += woCol2[i];
      });
      curY += woHdrH;

      // Row 2 values
      xo = M;
      [quantityVal, customer, customerPoNumber, hamfWoDate, shipDate].forEach((v, i) => {
        cell(xo, curY, woCol2[i], woValH, '#ffffff');
        txt(v, xo, curY, woCol2[i], woValH, { fs: 8, align: 'center' });
        xo += woCol2[i];
      });
      curY += woValH + 6;

      // ═══════════════════════════════════════════════════════════════════════════
      // ANODIZING SPECIFICATIONS ROW
      // ═══════════════════════════════════════════════════════════════════════════
      const specHdrH = 18;
      const specValH = 22;
      // 4 text columns  +  4 yes/no columns  = 8 cols
      const specCols = [60, 72, 52, 72, 72, 72, 72, 67]; // total = 539
      xo = M;
      ['Type', 'Thickness\nSpec', 'Class', 'Dye Color', 'Seal', 'Mask\nThreads', 'Tumbled', 'Scotch\nBrite'].forEach((h, i) => {
        darkHdr(h, xo, curY, specCols[i], specHdrH, 6.5);
        xo += specCols[i];
      });
      curY += specHdrH;

      // Spec values
      xo = M;
      const yesNo = (val) => val === true ? 'Yes' : (val === false ? 'No' : '');
      const specVals = [anodizingType, thicknessSpec, anodizingClass, dyeColor, yesNo(seal), yesNo(maskThreads), yesNo(tumbled), yesNo(scotchBrite)];
      specVals.forEach((v, i) => {
        const colW = specCols[i];
        cell(xo, curY, colW, specValH, '#ffffff');
        if (i >= 4) {
          // Yes / No toggle boxes — evenly split
          const boxW = Math.floor((colW - 6) / 2);
          const boxH = specValH - 6;
          const boxY = curY + 3;
          const isYes = v === 'Yes';
          const isNo  = v === 'No';
          // Yes box
          const yesX = xo + 2;
          doc.rect(yesX, boxY, boxW, boxH).fill(isYes ? '#2c3e50' : '#ffffff');
          doc.rect(yesX, boxY, boxW, boxH).lineWidth(LW).strokeColor(BORDER).stroke();
          doc.fontSize(7).font('Helvetica-Bold').fillColor(isYes ? '#ffffff' : DARK)
             .text('Yes', yesX, boxY + (boxH - 7) / 2, { width: boxW, align: 'center' });
          // No box
          const noX = xo + 2 + boxW + 2;
          doc.rect(noX, boxY, boxW, boxH).fill(isNo ? '#2c3e50' : '#ffffff');
          doc.rect(noX, boxY, boxW, boxH).lineWidth(LW).strokeColor(BORDER).stroke();
          doc.fontSize(7).font('Helvetica-Bold').fillColor(isNo ? '#ffffff' : DARK)
             .text('No', noX, boxY + (boxH - 7) / 2, { width: boxW, align: 'center' });
        } else {
          txt(v, xo, curY, colW, specValH, { fs: 8, align: 'center' });
        }
        xo += colW;
      });
      curY += specValH + 8;

      // ═══════════════════════════════════════════════════════════════════════════
      // SECTION B: TRAVELER (Operations Table)
      // ═══════════════════════════════════════════════════════════════════════════
      curY = sectionBanner('Section B: Traveler', curY);

      // Columns: Line | Operation | Description | Required | Operator | Date (D/M/Y)
      const sbColW = [35, 100, 210, 54, 70, 70]; // total = 539
      const sbHdrH = 22;
      xo = M;
      ['Line', 'Operation', 'Description', 'Required', 'Operator', 'Date\n(D/M/Y)'].forEach((h, i) => {
        darkHdr(h, xo, curY, sbColW[i], sbHdrH, 7);
        xo += sbColW[i];
      });
      curY += sbHdrH;

      // Operation rows
      sectionBOps.forEach((op, idx) => {
        const descH  = measureH(op.description, sbColW[2], 7, 3);
        const opH    = measureH(op.operation,   sbColW[1], 7, 3);
        const rH     = Math.max(20, Math.ceil(Math.max(descH, opH)));
        if (curY + rH > PH - 40) { doc.addPage(); curY = M; }
        const bg = idx % 2 === 0 ? '#ffffff' : '#f7f7f7';
        xo = M;
        sbColW.forEach(w => { cell(xo, curY, w, rH, bg); xo += w; });
        let cx = M;
        txt(String(op.sNo ?? op.line ?? (idx + 1)), cx, curY, sbColW[0], rH, { align: 'center', fs: 7.5 }); cx += sbColW[0];
        txt(op.operation,   cx, curY, sbColW[1], rH, { fs: 7, bold: true, top: true, pad: 3 }); cx += sbColW[1];
        txt(op.description, cx, curY, sbColW[2], rH, { fs: 7, top: true, pad: 3 }); cx += sbColW[2];
        txt(op.required_operation || '', cx, curY, sbColW[3], rH, { fs: 7.5, align: 'center' }); cx += sbColW[3];
        txt(op.operator || op.initials || '', cx, curY, sbColW[4], rH, { fs: 7.5, align: 'center' }); cx += sbColW[4];
        txt(op.opDate || '', cx, curY, sbColW[5], rH, { fs: 7.5, align: 'center' });
        curY += rH;
      });
      curY += 8;

      // ═══════════════════════════════════════════════════════════════════════════
      // SECTION C: GENERAL NOTES
      // ═══════════════════════════════════════════════════════════════════════════
      if (curY + 60 > PH - 40) { doc.addPage(); curY = M; }
      curY = sectionBanner('Section C: General Notes', curY);

      const noteH = 50;
      cell(M, curY, CW, noteH, '#ffffff');
      if (generalNotes) {
        doc.fontSize(8).font('Helvetica').fillColor(DARK)
           .text(generalNotes, M + 6, curY + 6, { width: CW - 12, height: noteH - 12, lineBreak: true });
      }
      curY += noteH;

      // ═══════════════════════════════════════════════════════════════════════════
      // FOOTER
      // ═══════════════════════════════════════════════════════════════════════════
      doc.fontSize(7).font('Helvetica').fillColor('#999')
         .text(`${workOrder.work_order_number}  \u00b7  Job #${jobIndex + 1}  \u00b7  Generated ${dayjs().format('DD/MM/YYYY HH:mm')}`,
               M, PH - 22, { width: CW, align: 'center', lineBreak: false });

      doc.end();
    });
  }

  async generateProductionPdf(workOrderId) {
    const PDFDocument = require('pdfkit');
    const dayjs = require('dayjs');

    const workOrder = await WorkOrder.findByPk(workOrderId);
    if (!workOrder) throw new Error('Work order not found');

    const project = await Project.findByPk(workOrder.project_id, {
      include: [
        { model: Client, as: 'client' },
        { model: User, as: 'preparedBy' }
      ]
    });
    const companySettings = await settingsService.getCompanySettings(project.company_id);

    // Fetch estimate with custom parts
    const estimate = await Estimate.findOne({ where: { project_id: workOrder.project_id } });
    const customParts = estimate?.custom_parts || [];
    const operations = workOrder.operations || [];
    const completedOps = operations.filter(op => op.is_completed).length;
    const progressPct = operations.length > 0 ? Math.round((completedOps / operations.length) * 100) : 0;

    // Generate standardized filename using naming service
    const { generateDocumentName: genProdName } = require('./documentNamingService');
    const { fileName: prodFilename } = await genProdName({
      documentType: 'production_traveller',
      projectName: project.project_name,
      reference: workOrder.work_order_number,
      projectId: workOrder.project_id,
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 30, lineGap: 1, bufferPages: true });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), filename: prodFilename, projectId: workOrder.project_id }));
      doc.on('error', reject);

      const margin = 30;
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const contentWidth = pageWidth - 2 * margin;
      const TEAL = COLORS.TABLE_HEAD;
      const TEAL_LIGHT = COLORS.GT_BG;
      const DARK_HEAD = COLORS.TABLE_HEAD;

      // ------ HELPER: standard page header ------
      const addPageHeader = () => {
        return drawGlobalHeader(doc, companySettings, 'Production Traveller');
      };

      // ------ HELPER: draw a table ------
      const drawTable = (startY, headers, rows, colWidths, opts = {}) => {
        const headerH = opts.headerHeight || 22;
        const rowH = opts.rowHeight || 24;
        const headerBg = opts.headerBg || DARK_HEAD;
        const fontSize = opts.fontSize || 8;
        let y = startY;

        // Check page break before header
        if (y + headerH + rowH > pageHeight - 50) {
          doc.addPage();
          y = addPageHeader();
        }

        // Header row
        doc.rect(margin, y, contentWidth, headerH).fill(headerBg);
        doc.fontSize(fontSize).font('Helvetica-Bold').fillColor('#FFF');
        let x = margin;
        headers.forEach((h, i) => {
          doc.text(h, x + 4, y + (headerH - fontSize) / 2, { width: colWidths[i] - 8, align: 'center' });
          x += colWidths[i];
        });
        // Header grid lines
        doc.lineWidth(0.5).strokeColor('#000');
        x = margin;
        colWidths.slice(0, -1).forEach(w => { x += w; doc.moveTo(x, y).lineTo(x, y + headerH).stroke(); });
        doc.rect(margin, y, contentWidth, headerH).stroke();
        y += headerH;

        // Data rows
        rows.forEach((row, rowIdx) => {
          if (y + rowH > pageHeight - 50) {
            doc.addPage();
            y = addPageHeader();
          }
          const bg = rowIdx % 2 === 0 ? COLORS.ROW_WHITE : COLORS.ROW_ALT;
          doc.rect(margin, y, contentWidth, rowH).fill(bg);
          doc.fontSize(fontSize).font('Helvetica').fillColor('#000');
          x = margin;
          row.forEach((cell, ci) => {
            const align = ci === 0 ? 'center' : (opts.alignRight?.includes(ci) ? 'right' : 'left');
            doc.text(String(cell ?? '-'), x + 4, y + 4, { width: colWidths[ci] - 8, align, lineBreak: true, height: rowH - 6, ellipsis: false });
            x += colWidths[ci];
          });
          // Grid lines
          doc.lineWidth(0.5).strokeColor('#000');
          x = margin;
          colWidths.slice(0, -1).forEach(w => { x += w; doc.moveTo(x, y).lineTo(x, y + rowH).stroke(); });
          doc.rect(margin, y, contentWidth, rowH).stroke();
          y += rowH;
        });

        // If no rows, add empty placeholder
        if (rows.length === 0) {
          doc.rect(margin, y, contentWidth, rowH).fill('#FFF').stroke('#000');
          doc.fontSize(fontSize).font('Helvetica-Oblique').fillColor('#999')
            .text('No data available', margin, y + (rowH - fontSize) / 2, { width: contentWidth, align: 'center' });
          y += rowH;
        }

        return y;
      };

      // ------ HELPER: section title ------
      const sectionTitle = (title, y) => {
        if (y + 30 > pageHeight - 50) { doc.addPage(); y = addPageHeader(); }
        doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE).text(title, margin, y);
        y += 4;
        doc.lineWidth(0.75).moveTo(margin, y + 12).lineTo(margin + contentWidth, y + 12).strokeColor(COLORS.SECTION_TITLE).stroke();
        return y + 18;
      };

      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      // START BUILDING PDF
      // ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

      let currentY = addPageHeader();

      // ------ TITLE ------
      doc.fontSize(18).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE).text('PRODUCTION TRAVELLER', margin, currentY, { align: 'center', width: contentWidth });
      currentY += 28;

      // ------ PROGRESS BAR ------
      const barW = contentWidth * 0.6;
      const barX = margin + (contentWidth - barW) / 2;
      const barH = 14;
      doc.roundedRect(barX, currentY, barW, barH, 4).fill('#e0e0e0');
      if (progressPct > 0) {
        doc.roundedRect(barX, currentY, barW * (progressPct / 100), barH, 4).fill(TEAL);
      }
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#FFF')
        .text(`${completedOps}/${operations.length} ops (${progressPct}%)`, barX, currentY + 3, { width: barW, align: 'center' });
      currentY += barH + 16;

      // ------ 1. WORK ORDER SUMMARY ------
      currentY = sectionTitle('1. Work Order Summary', currentY);
      const infoColW = contentWidth / 2;
      const infoRowH = 20;
      const woInfo = [
        ['WO Number', workOrder.work_order_number || '-', 'Status', (workOrder.status || 'pending').replace(/_/g, ' ').toUpperCase()],
        ['Project', project.project_name || '-', 'Client', project.client?.client_name || '-'],
        ['Release Date', workOrder.release_date ? dayjs(workOrder.release_date).format('DD/MM/YYYY') : '-', 'Target Date', workOrder.target_date ? dayjs(workOrder.target_date).format('DD/MM/YYYY') : '-'],
        ['Prepared By', project.preparedBy?.position ? `${project.preparedBy.name} (${project.preparedBy.position})` : (project.preparedBy?.name || '-'), 'Revision', String(workOrder.revision || 1)],
      ];
      woInfo.forEach((row, ri) => {
        if (currentY + infoRowH > pageHeight - 50) { doc.addPage(); currentY = addPageHeader(); }
        const bg = ri % 2 === 0 ? TEAL_LIGHT : '#FFF';
        doc.rect(margin, currentY, contentWidth, infoRowH).fill(bg).stroke('#000');
        doc.moveTo(margin + infoColW, currentY).lineTo(margin + infoColW, currentY + infoRowH).strokeColor('#000').stroke();
        // Left pair
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#333').text(row[0] + ':', margin + 6, currentY + 5, { width: 90 });
        doc.font('Helvetica').text(row[1], margin + 96, currentY + 5, { width: infoColW - 102 });
        // Right pair
        doc.font('Helvetica-Bold').text(row[2] + ':', margin + infoColW + 6, currentY + 5, { width: 90 });
        doc.font('Helvetica').text(row[3], margin + infoColW + 96, currentY + 5, { width: infoColW - 102 });
        currentY += infoRowH;
      });
      currentY += 14;

      // ------ 2. CUSTOM PARTS / JOB DETAILS ------
      if (customParts.length > 0) {
        currentY = sectionTitle('2. Job Parts Details', currentY);
        const partCols = [28, 120, 70, 65, 45, 80, 60, 67];
        const partHeaders = ['#', 'Job Description', 'Material', 'Grade', 'Qty', 'Drg Part No', 'Heat #', 'RM Dimension'];
        const partRows = customParts.map((p, i) => [
          i + 1, p.job_description || '-', p.material || '-', p.material_grade || '-',
          p.quantity ?? '-', p.drawing_part_no || '-', p.heat_number || '-', p.raw_material_dimension || '-'
        ]);
        currentY = drawTable(currentY, partHeaders, partRows, partCols, { rowHeight: 22, fontSize: 7 });
        currentY += 14;
      }

      // ------ 3. PRODUCTION OPERATIONS ------
      currentY = sectionTitle(customParts.length > 0 ? '3. Production Operations' : '2. Production Operations', currentY);
      const opCols = [28, 110, 140, 55, 72, 130];
      const opHeaders = ['#', 'Process', 'Description', 'Status', 'Completed', 'Notes'];
      const opRows = operations.map((op, i) => [
        i + 1,
        this.getModuleDescription(op.module_type),
        op.description || '-',
        op.is_completed ? 'DONE' : 'PENDING',
        op.completed_at ? dayjs(op.completed_at).format('DD/MM/YY HH:mm') : '-',
        op.notes || '-'
      ]);
      currentY = drawTable(currentY, opHeaders, opRows, opCols, { rowHeight: 26, fontSize: 7 });
      currentY += 14;

      // ------ 4. MATERIALS ------
      const secNum = customParts.length > 0 ? 4 : 3;
      const materials = workOrder.materials || [];
      if (materials.length > 0) {
        currentY = sectionTitle(`${secNum}. Material Details`, currentY);
        const matCols = [110, 110, 100, 110, 105];
        const matHeaders = ['Material Specs', 'Size', 'Type', 'Heat #', 'Initials/Date'];
        const matRows = materials.map(m => [
          m.specs || '-', m.size || '-', m.type || '-', m.heat_number || '-', m.initials_date || '-'
        ]);
        currentY = drawTable(currentY, matHeaders, matRows, matCols, { rowHeight: 24 });
        currentY += 14;
      }

      // ------ 5. EXTERNAL PROCESSES ------
      const extProcesses = workOrder.external_processes || [];
      if (extProcesses.length > 0) {
        const extSecNum = secNum + (materials.length > 0 ? 1 : 0);
        currentY = sectionTitle(`${extSecNum}. External Processes`, currentY);
        const extCols = [130, 140, 120, 145];
        const extHeaders = ['Process', 'Vendor/PO', 'Operator', 'Inspector/Date'];
        const extRows = extProcesses.map(p => [
          p.name || '-', p.vendor_po || '-', p.operator || '-', p.inspector_date || '-'
        ]);
        currentY = drawTable(currentY, extHeaders, extRows, extCols, { rowHeight: 24 });
        currentY += 14;
      }

      // ------ GENERAL NOTES ------
      if (workOrder.notes) {
        if (currentY + 60 > pageHeight - 50) { doc.addPage(); currentY = addPageHeader(); }
        currentY = sectionTitle('Notes', currentY);
        doc.rect(margin, currentY, contentWidth, 60).fill('#fafafa').stroke('#000');
        doc.fontSize(8).font('Helvetica').fillColor('#333')
          .text(workOrder.notes, margin + 6, currentY + 6, { width: contentWidth - 12, height: 48 });
        currentY += 68;
      }

      // ------ SIGNATURE BLOCK ------
      if (currentY + 80 > pageHeight - 50) { doc.addPage(); currentY = addPageHeader(); }
      currentY += 10;
      const halfW = contentWidth / 2;
      doc.lineWidth(0.5).strokeColor('#000');
      // Left: Production Manager
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#333').text('Production Manager:', margin, currentY);
      doc.moveTo(margin, currentY + 30).lineTo(margin + halfW - 20, currentY + 30).stroke();
      doc.fontSize(7).font('Helvetica').fillColor('#999').text('Signature / Date', margin, currentY + 33);
      // Right: Quality Inspector
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#333').text('Quality Inspector:', margin + halfW, currentY);
      doc.moveTo(margin + halfW, currentY + 30).lineTo(margin + contentWidth, currentY + 30).stroke();
      doc.fontSize(7).font('Helvetica').fillColor('#999').text('Signature / Date', margin + halfW, currentY + 33);

      // ------ FOOTER ------
      drawGlobalFooter(doc, companySettings);

      doc.end();
    });
  }
}

module.exports = new WorkOrderService();
module.exports.generatePtNumber = generatePtNumber;
module.exports.ensurePtNumber = ensurePtNumber;

