const { QualityRecord, Project, WorkOrder, Client, User, SalesOrder, Estimate, EstimateItem, Document, Setting } = require('../models');
const path = require('path');
const settingsService = require('./settingsService');
const { drawGlobalHeader, drawGlobalFooter, COLORS } = require('../utils/pdfTemplate');
const { pickBestEstimate, buildEstimateLineItems } = require('../utils/calculations');

class QualityService {
  async getQualityRecordByProjectId(projectId) {
    const qualityRecord = await QualityRecord.findOne({
      where: { project_id: projectId }
    });
    return qualityRecord;
  }

  async createOrUpdateQualityRecord(projectId, recordData, userId) {
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Validate project is in production or later
    const validStatuses = ['in_production', 'inspected', 'shipped'];
    if (!validStatuses.includes(project.status)) {
      throw new Error('Quality records can only be created for projects in production');
    }

    const {
      dimensional_verification,
      visual_inspection,
      hardness_testing,
      ndt_testing,
      pressure_testing,
      mtr_verification,
      inspection_data_json,
      inspection_checklist,
      inspector_name,
      inspector_notes,
      notes
    } = recordData;

    const data = {
      dimensional_verification: dimensional_verification || false,
      visual_inspection: visual_inspection || false,
      hardness_testing: hardness_testing || false,
      ndt_testing: ndt_testing || false,
      pressure_testing: pressure_testing || false,
      mtr_verification: mtr_verification || false,
      inspection_data_json: inspection_data_json || {},
      inspection_checklist: inspection_checklist || [],
      inspector_name,
      inspector_notes,
      notes
    };

    const [qualityRecord, created] = await QualityRecord.findOrCreate({
      where: { project_id: projectId },
      defaults: {
        company_id: project.company_id || null,
        ...data,
        inspection_date: new Date()
      }
    });
    if (!created) {
      await qualityRecord.update(data);
    }

    return qualityRecord;
  }

  async uploadReport(projectId, filePath, fileName, userId) {
    const project = await Project.findByPk(projectId);
    const [qualityRecord] = await QualityRecord.findOrCreate({
      where: { project_id: projectId },
      defaults: {
        company_id: project?.company_id || null,
        report_files: [],
        inspection_date: new Date()
      }
    });

    const report_files = [...(qualityRecord.report_files || [])];
    report_files.push({
      path: filePath,
      name: fileName,
      uploaded_at: new Date().toISOString()
    });

    await qualityRecord.update({ report_files });

    // Document record is already created by processUpload() in the controller
    // via unifiedFileService.processFile — no duplicate needed here.

    return qualityRecord;
  }

  async removeReport(projectId, fileIndex) {
    const qualityRecord = await QualityRecord.findOne({ where: { project_id: projectId } });
    if (!qualityRecord) {
      throw new Error('Quality record not found');
    }

    const report_files = [...(qualityRecord.report_files || [])];
    if (fileIndex >= 0 && fileIndex < report_files.length) {
      report_files.splice(fileIndex, 1);
      await qualityRecord.update({ report_files });
    }

    return qualityRecord;
  }

  async markInspectionComplete(projectId, data = {}) {
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // First create or update the quality record with the inspection data
    let qualityRecord = await QualityRecord.findOne({ where: { project_id: projectId } });
    
    const recordData = {
      inspection_checklist: data.inspection_checklist || [],
      inspector_notes: data.inspector_notes || '',
      overall_result: data.overall_result || 'pending',
      is_finalized: true,
      inspection_date: new Date()
    };

    if (qualityRecord) {
      await qualityRecord.update(recordData);
    } else {
      qualityRecord = await QualityRecord.create({
        project_id: projectId,
        company_id: project.company_id || null,
        ...recordData
      });
    }

    // Update project status to inspected
    await Project.update(
      { status: 'inspected' },
      { where: { id: projectId } }
    );

    return qualityRecord;
  }

  async generateCoC(projectId) {
    const qualityRecord = await QualityRecord.findOne({ where: { project_id: projectId } });
    if (!qualityRecord) {
      throw new Error('Quality record not found');
    }

    const project = await Project.findByPk(projectId);
    if (project.status !== 'inspected') {
      throw new Error('Certificate of Conformance can only be generated for inspected projects');
    }

    await qualityRecord.update({ coc_generated: true });

    return qualityRecord;
  }

  async generateCoCPdf(projectId) {
    const PDFDocument = require('pdfkit');
    const dayjs = require('dayjs');
    
    const qualityRecord = await QualityRecord.findOne({ where: { project_id: projectId } });
    if (!qualityRecord) {
      throw new Error('Quality record not found');
    }

    const project = await Project.findByPk(projectId, {
      include: [
        { model: Client, as: 'client' },
        { model: User, as: 'preparedBy' },
        { model: Estimate, as: 'estimate' },
        { model: SalesOrder, as: 'salesOrder' },
        { model: WorkOrder, as: 'workOrder' }
      ]
    });
    const companySettings = await settingsService.getCompanySettings(project.company_id);

    if (project.status !== 'inspected' && project.status !== 'shipped' && project.status !== 'closed') {
      throw new Error('Certificate of Conformance can only be generated for inspected projects');
    }

    await qualityRecord.update({ coc_generated: true });

    // Date formatter
    const fmtDate = (date) => {
      if (!date) return 'N/A';
      return dayjs(date).format('MM/DD/YYYY');
    };

    // Generate standardized filename using naming service.
    // Reference must be a CoC-specific identifier so the filename clearly
    // belongs to the Quality module and does not look like a WO document.
    const { generateDocumentName } = require('./documentNamingService');
    const projectCoCRecord = await QualityRecord.findOne({ where: { project_id: projectId } });
    const existingProjectForm = (projectCoCRecord?.job_quality_forms || []).find(f => f.jobIndex === -1) || null;
    const projectCoCSerial = await this._getCoCSerialNumber(projectId, -1, existingProjectForm, projectCoCRecord, project.company_id);
    const { fileName: cocFilename } = await generateDocumentName({
      documentType: 'coc',
      projectName: project.project_name,
      reference: projectCoCSerial,
      projectId,
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const finalBuffer = await this._appendUploadedDocsToCoCPdf(buffer, projectCoCRecord, companySettings.company_id || project.company_id, null);
          resolve({ buffer: finalBuffer, filename: cocFilename, projectId });
        } catch (err) {
          reject(err);
        }
      });
      doc.on('error', reject);

      const margin = 50;
      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 2 * margin;
      const colWidth = (contentWidth - 20) / 2;
      const leftX = margin;
      const rightX = margin + colWidth + 20;
      const headerH = 24;
      const rowH = 22;
      let y = margin;
      let x;

      const GREEN = COLORS.TABLE_HEAD;
      const BORDER = COLORS.TEXT_MED;

      // --------- Helper: draw a single cell (rect + text) ------------------------------------------------------------------------------------
      const cellRect = (cx, cy, w, h, opts = {}) => {
        doc.rect(cx, cy, w, h).strokeColor(opts.stroke || BORDER).lineWidth(0.5).stroke();
      };
      const cellText = (text, cx, cy, w, h, opts = {}) => {
        const pad = opts.pad || 4;
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(opts.size || 8)
           .fillColor(opts.color || '#000')
           .text(String(text), cx + pad, cy + pad, { width: w - pad * 2, height: h - pad * 2, align: opts.align || 'left', lineBreak: true, ellipsis: false });
      };

      y = drawGlobalHeader(doc, companySettings, 'Certificate of Conformance');

      // ===== TO / FROM =====
      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE);
      doc.text('To:', leftX, y);
      doc.text('From:', rightX, y);
      y += 18;

      doc.fontSize(9).font('Helvetica').fillColor('#333');
      const toLines = [
        `Company: ${project.client?.client_name || 'N/A'}`,
        `POC: ${project.client?.poc_name || 'N/A'}`,
        `Email: ${project.client?.poc_email || 'N/A'}`,
        `Phone: ${project.client?.poc_phone || 'N/A'}`
      ];

      const fromLines = [
        companySettings.name || '',
        `POC: ${project.preparedBy?.name || 'N/A'}${project.preparedBy?.position ? ' | ' + project.preparedBy.position : ''}`,
        `Email: ${project.preparedBy?.email || 'N/A'}`,
        `Phone: ${project.preparedBy?.phone || companySettings.phone || 'N/A'}`
      ].filter(line => line);

      toLines.forEach((line, i) => {
        doc.text(line, leftX, y + i * 14, { width: colWidth });
      });
      fromLines.forEach((line, i) => {
        doc.text(line, rightX, y + i * 14, { width: colWidth });
      });
      y += 14 * Math.max(toLines.length, fromLines.length) + 10;

      // Separator
      doc.lineWidth(0.5).moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor('#ccc').stroke();
      y += 15;

      // ===== PROJECT DETAILS =====
      doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
        .text('Project Details', margin, y);
      y += 18;

      const detailColW = [contentWidth / 2, contentWidth / 2];
      // Derive quantity from custom_parts if project.quantity is not set
      const _estArr = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
      const _selEst = project.selected_revision != null
        ? _estArr.find(e => e.revision === project.selected_revision) || _estArr[_estArr.length - 1]
        : _estArr[_estArr.length - 1];
      const customParts = _selEst?.custom_parts || [];
      const _rawQty = (project.quantity != null && project.quantity !== '') ? project.quantity : customParts.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
      const totalQty = (_rawQty != null && _rawQty !== '' && _rawQty !== 0) ? _rawQty : 'N/A';

      const details = [
        ['Project Name', project.project_name || 'N/A'],
        ['PO Number', project.salesOrder?.customer_po_number || 'N/A'],
        ['Quantity', String(totalQty)],
        ['Inspection Date', fmtDate(qualityRecord.inspection_date)]
      ];

      doc.fontSize(9).fillColor('#333');
      details.forEach((pair, idx) => {
        const rowY = y + idx * 16;
        doc.font('Helvetica-Bold').text(`${pair[0]}:`, leftX, rowY, { continued: true, width: detailColW[0] });
        doc.font('Helvetica').text(`  ${pair[1]}`);
      });
      y += details.length * 16 + 10;

      // ===== MATERIAL SPECIFICATION =====
      doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
        .text('Material Specification', margin, y);
      y += 18;

      const matHeaders = ['Parameter', 'Value'];
      const matColW = [contentWidth / 2, contentWidth / 2];

      doc.rect(margin, y, contentWidth, headerH).fill(GREEN);
      x = margin;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
      matHeaders.forEach((h, i) => {
        doc.text(h, x + 4, y + 7, { width: matColW[i] - 8 });
        x += matColW[i];
      });
      y += headerH;

      // Fallback to estimate custom_parts if project-level fields are blank
      const firstPart = customParts[0] || {};
      const matRows = [
        ['Material Type', project.material_type || firstPart.material || 'N/A'],
        ['Material Grade', project.material_grade || firstPart.material_grade || 'N/A'],
        ['Heat Number', project.heat_number || firstPart.heat_number || 'N/A'],
        ['Material Supplied By', project.material_supplied_by || firstPart.raw_material_supplied_by || 'N/A']
      ];

      doc.font('Helvetica').fontSize(8).fillColor('#333');
      matRows.forEach((row, idx) => {
        if (idx % 2 === 0) {
          doc.rect(margin, y, contentWidth, rowH).fill(COLORS.ROW_ALT);
        }
        doc.lineWidth(0.5).rect(margin, y, contentWidth, rowH).strokeColor(COLORS.BORDER_LIGHT).stroke();
        x = margin;
        doc.fillColor('#333').fontSize(8).font('Helvetica');
        doc.font('Helvetica-Bold').text(row[0], x + 4, y + 6, { width: matColW[0] - 8 });
        x += matColW[0];
        doc.font('Helvetica').text(row[1], x + 4, y + 6, { width: matColW[1] - 8 });
        y += rowH;
      });
      y += 15;

      // ===== INSPECTION RESULTS =====
      doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE)
        .text('Inspection Results', margin, y);
      y += 18;

      const inspHeaders = ['#', 'Inspection Item', 'Result', 'Notes'];
      const inspColW = [30, contentWidth - 30 - 80 - 150, 80, 150];

      doc.rect(margin, y, contentWidth, headerH).fill(GREEN);
      x = margin;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
      inspHeaders.forEach((h, i) => {
        doc.text(h, x + 4, y + 7, { width: inspColW[i] - 8 });
        x += inspColW[i];
      });
      y += headerH;

      const inspectionChecklist = qualityRecord.inspection_checklist || [];

      // Fallback to boolean fields if no checklist
      const inspRows = inspectionChecklist.length > 0
        ? inspectionChecklist.map((item, idx) => [
            String(idx + 1),
            item.name || item.description || `Item ${idx + 1}`,
            item.passed === true ? 'PASS' : item.passed === false ? 'FAIL' : 'N/A',
            item.notes || ''
          ])
        : [
            ['1', 'Dimensional Verification', qualityRecord.dimensional_verification ? 'PASS' : 'N/A', ''],
            ['2', 'Visual Inspection', qualityRecord.visual_inspection ? 'PASS' : 'N/A', ''],
            ['3', 'Hardness Testing', qualityRecord.hardness_testing ? 'PASS' : 'N/A', ''],
            ['4', 'NDT Testing', qualityRecord.ndt_testing ? 'PASS' : 'N/A', ''],
            ['5', 'Pressure Testing', qualityRecord.pressure_testing ? 'PASS' : 'N/A', ''],
            ['6', 'MTR Verification', qualityRecord.mtr_verification ? 'PASS' : 'N/A', '']
          ];

      doc.font('Helvetica').fontSize(8).fillColor('#333');
      inspRows.forEach((row, idx) => {
        if (idx % 2 === 0) {
          doc.rect(margin, y, contentWidth, rowH).fill(COLORS.ROW_ALT);
        }
        doc.lineWidth(0.5).rect(margin, y, contentWidth, rowH).strokeColor(COLORS.BORDER_LIGHT).stroke();

        x = margin;
        doc.fillColor('#333').fontSize(8).font('Helvetica');
        row.forEach((val, i) => {
          // Color the result column
          if (i === 2) {
            doc.fillColor(val === 'PASS' ? '#2e7d32' : val === 'FAIL' ? '#c62828' : '#666');
            doc.font('Helvetica-Bold');
          }
          doc.text(val, x + 4, y + 6, { width: inspColW[i] - 8 });
          if (i === 2) {
            doc.fillColor('#333').font('Helvetica');
          }
          x += inspColW[i];
        });
        y += rowH;

        // Add new page if needed
        if (y > doc.page.height - margin - 120) {
          doc.addPage();
          y = margin;
        }
      });
      y += 15;

      // Overall result
      const overallResult = qualityRecord.overall_result || 'pending';
      const resultColor = overallResult === 'pass' ? '#2e7d32' : overallResult === 'fail' ? '#c62828' : '#666';
      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE).text('Overall Result: ', margin, y, { continued: true });
      doc.fillColor(resultColor).text(overallResult.toUpperCase());
      y += 22;

      // ===== CERTIFICATION STATEMENT =====
      doc.lineWidth(0.5).moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor('#ccc').stroke();
      y += 15;

      doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE).text('Certification', margin, y);
      y += 18;

      doc.fontSize(9).font('Helvetica').fillColor('#333');
      const certText = 'This is to certify that the above material/product has been manufactured, inspected, and tested ' +
        'in accordance with the applicable specifications and requirements. All items conform to the purchase order ' +
        'requirements and applicable industry standards. The products have been found to be in full conformance ' +
        'with all specified requirements.';
      doc.text(certText, margin, y, { width: contentWidth, align: 'justify' });
      y += doc.heightOfString(certText, { width: contentWidth }) + 20;

      // Inspector notes
      if (qualityRecord.inspector_notes) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.ACCENT).text('Inspector Notes:', margin, y);
        y += 14;
        doc.fontSize(9).font('Helvetica').fillColor('#555');
        doc.text(qualityRecord.inspector_notes, margin, y, { width: contentWidth });
        y += doc.heightOfString(qualityRecord.inspector_notes, { width: contentWidth }) + 15;
      }

      // ===== SIGNATURE BLOCK =====
      y += 10;
      doc.lineWidth(0.5).moveTo(margin, y).lineTo(margin + contentWidth, y).strokeColor('#ccc').stroke();
      y += 20;

      const _approvedName = companySettings.poc_name || companySettings.contact_person || project.preparedBy?.name || '';
      const _approvedDate = dayjs().format('DD-MMM-YYYY');

      doc.fontSize(9).font('Helvetica').fillColor('#333');
      doc.text(`Quality Inspector: ${qualityRecord.inspector_name || 'N/A'}`, leftX, y, { width: colWidth });
      doc.text(`Date: ${fmtDate(qualityRecord.inspection_date)}`, rightX, y, { width: colWidth });
      y += 20;

      doc.font('Helvetica-Bold');
      doc.text(`Approved By: ${_approvedName || 'N/A'}`, leftX, y, { width: colWidth });
      doc.text(`Date: ${_approvedDate}`, rightX, y, { width: colWidth });

      drawGlobalFooter(doc, companySettings);
      doc.end();
    });
  }

  // ------ Per-job quality forms ---------------------------------------------------------------------------------------------------------------------------------------------------------

  async saveJobQualityForms(projectId, jobForms) {
    const project = await Project.findByPk(projectId);
    if (!project) throw new Error('Project not found');

    const [record, created] = await QualityRecord.findOrCreate({
      where: { project_id: projectId },
      defaults: {
        company_id: project.company_id || null,
        job_quality_forms: jobForms,
        inspection_date: new Date()
      }
    });
    if (!created) {
      await record.update({ job_quality_forms: jobForms });
    }
    return record;
  }

  async completeJobInspection(projectId, jobIndex) {
    const project = await Project.findByPk(projectId);
    if (!project) throw new Error('Project not found');

    let record = await QualityRecord.findOne({ where: { project_id: projectId } });
    if (!record) throw new Error('Quality record not found. Save draft first.');

    const jobForms = [...(record.job_quality_forms || [])];
    const idx = jobForms.findIndex(f => f.jobIndex === jobIndex);
    if (idx === -1) throw new Error(`Job form ${jobIndex} not found`);

    jobForms[idx] = { ...jobForms[idx], isFinalized: true, completeDate: new Date().toISOString() };
    await record.update({ job_quality_forms: jobForms });

    // If all jobs are complete, update project status to inspected
    const projectFull = await Project.findByPk(projectId, { include: [{ model: Estimate, as: 'estimate' }] });
    const estArr = Array.isArray(projectFull?.estimate) ? projectFull.estimate : (projectFull?.estimate ? [projectFull.estimate] : []);
    const selEst = projectFull?.selected_revision != null
      ? estArr.find(e => e.revision === projectFull.selected_revision) || estArr[estArr.length - 1]
      : estArr[estArr.length - 1];
    const customParts = selEst?.custom_parts || [];
    // Also check production_forms count so copied jobs are included
    const workOrder = await WorkOrder.findOne({ where: { project_id: projectId } });
    const productionFormsCount = ((workOrder?.production_forms) || []).length;
    const totalJobs = Math.max(customParts.length, productionFormsCount, 1);
    const allDone = jobForms.filter(f => f.isFinalized).length >= totalJobs;
    if (allDone) {
      await project.update({ status: 'inspected' });
      // Mark coc_generated so logistics shipping check passes
      await record.update({ coc_generated: true });
    }
    return record;
  }

  // Default checklist for auto-creating job forms when uploading
  _makeDefaultChecklist() {
    return [
      { name: 'Dimensional Accuracy', description: 'Verify all dimensions per drawing specifications', included: false, notes: '' },
      { name: 'Surface Finish', description: 'Check surface roughness requirements', included: false, notes: '' },
      { name: 'Material Certificate', description: 'Verify material test certificate matches specs', included: false, notes: '' },
      { name: 'Heat Treatment', description: 'Verify heat treatment certificate if applicable', included: false, notes: '' },
      { name: 'Visual Inspection', description: 'Check for cracks, porosity, surface defects', included: false, notes: '' },
      { name: 'Thread Gauging', description: 'Verify thread specifications if applicable', included: false, notes: '' },
      { name: 'Hardness Test', description: 'Verify hardness requirements if specified', included: false, notes: '' },
      { name: 'NDT/NDE', description: 'Non-destructive testing if required', included: false, notes: '' },
    ];
  }

  async uploadJobItemDoc(projectId, jobIndex, itemIndex, filePath, fileName, userId, fileSize) {
    const project = await Project.findByPk(projectId);
    if (!project) throw new Error('Project not found');

    // Auto-create quality record if it doesn't exist (no save required before upload)
    const [record] = await QualityRecord.findOrCreate({
      where: { project_id: projectId },
      defaults: {
        company_id: project.company_id || null,
        job_quality_forms: [],
        inspection_date: new Date()
      }
    });

    const jobForms = [...(record.job_quality_forms || [])];
    let idx = jobForms.findIndex(f => f.jobIndex === jobIndex);
    
    // Auto-create job form entry if it doesn't exist (no save required before upload)
    if (idx === -1) {
      const defaultNotes = `This report is to certify that the above parts have been:\n` +
        `  •  Manufactured in accordance with all in-house policies and procedures.\n` +
        `  •  Inspected in accordance with our Inspection and Test procedure.\n\n` +
        `The following indicated procedures have been performed on the above-mentioned parts.`;
      
      jobForms.push({
        jobIndex,
        checklist: this._makeDefaultChecklist(),
        inspectorNotes: defaultNotes,
        isFinalized: false,
      });
      idx = jobForms.length - 1;
    }

    const checklist = [...(jobForms[idx].checklist || [])];
    if (itemIndex < 0 || itemIndex >= checklist.length) throw new Error('Invalid item index');
    
    // Convert absolute path to URL-friendly relative path for frontend access
    const uploadsRoot = process.env.UPLOAD_PATH ? path.resolve(process.env.UPLOAD_PATH) : path.join(__dirname, '..', '..', 'uploads');
    const relativePath = '/uploads/' + path.relative(uploadsRoot, filePath).replace(/\\/g, '/');
    
    checklist[itemIndex] = { ...checklist[itemIndex], documentPath: relativePath, documentName: fileName };
    jobForms[idx] = { ...jobForms[idx], checklist };
    record.job_quality_forms = jobForms;
    record.changed('job_quality_forms', true);
    await record.save();
    await record.reload();

    // Document record is already created by processUpload() in the controller
    // via unifiedFileService.processFile — no duplicate needed here.

    return record;
  }

  async generateJobCoCPdf(projectId, jobIndex) {
    const PDFDocument = require('pdfkit');
    const dayjs = require('dayjs');
    const path = require('path');

    const project = await Project.findByPk(projectId, {
      include: [
        { model: Client, as: 'client' },
        { model: User, as: 'preparedBy' },
        { model: SalesOrder, as: 'salesOrder' },
        { model: Estimate, as: 'estimate', include: [{ model: EstimateItem, as: 'items' }] }
      ]
    });
    if (!project) throw new Error('Project not found');
    const companySettings = await settingsService.getCompanySettings(project.company_id);

    const workOrder = await WorkOrder.findOne({ where: { project_id: projectId } });
    const record = await QualityRecord.findOne({ where: { project_id: projectId } });

    const jobForms = record?.job_quality_forms || [];
    const jobForm = jobForms.find(f => f.jobIndex === jobIndex);

    // Resolve estimate array (hasMany) to get the approved / selected / latest revision
    const estimates = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
    const selectedEst = pickBestEstimate(estimates, project.selected_revision) || estimates[estimates.length - 1];
    const customParts = selectedEst?.custom_parts || [];
    const part = customParts[jobIndex] || {};

    // Build unified line items from approved estimation for reliable quantity
    const allLineItems = buildEstimateLineItems(selectedEst);
    const lineItem = allLineItems[jobIndex] || {};

    const woNumber = workOrder ? workOrder.work_order_number : (project.project_name || '');
    const partDesc = part.job_description || project.project_name || '';
    const partNumber = part.drawing_part_no || project.project_name || '';
    const material = [part.material, part.material_grade].filter(Boolean).join(' ')
      || [project.material_type, project.material_grade].filter(Boolean).join(' ') || '';
    // Quantity from approved estimation line item (primary), fallback to raw custom_parts
    const estQty = lineItem.quantity || 0;
    const rawQty = Number(part.quantity) || 0;
    const resolvedQty = estQty > 0 ? estQty : rawQty;
    const qty = resolvedQty > 0 ? String(resolvedQty) : '-';
    // Auto-generate serial number if not already set
    const serialNumbers = await this._getCoCSerialNumber(projectId, jobIndex, jobForm, record, project.company_id);
    const customerPO = project.salesOrder?.customer_po_number || project.salesOrder?.po_number || '';
    // Source heat number from Production Traveller form first, fallback to estimation part
    const prodForms = workOrder?.production_forms || [];
    const prodForm = prodForms.find(f => f.jobIndex === jobIndex) || prodForms[jobIndex];
    const heatNumber = prodForm?.heatNumber || part.heat_number || project.heat_number || 'N/A';
    const revNum = part.revision != null && part.revision !== '' ? part.revision : (selectedEst?.revision != null ? selectedEst.revision : (project.revision != null ? project.revision : ''));
    const revision = revNum !== '' ? `R${revNum}` : '';
    const checklist = jobForm?.checklist || [];
    // Auto-generate Production ID (QF-xx) if not already set
    const procedureId = await this._getCoCProcedureId(projectId, jobIndex, jobForm, record, project.company_id);

    const fmtDate = (d) => d ? dayjs(d).format('DD-MMM-YY') : dayjs().format('DD-MMM-YY');

    // Procedure rows: name --- PDF label
    const procedureRows = [
      { label: 'Dimensional Verification', checkName: 'Dimensional Accuracy' },
      { label: 'Visual Inspection',        checkName: 'Visual Inspection' },
      { label: 'Hardness Testing',         checkName: 'Hardness Test' },
      { label: 'Non-destructive Examination', checkName: 'NDT/NDE' },
      { label: 'Pressure Testing',         checkName: 'Pressure Testing' },
      { label: 'MTR',                      checkName: 'Material Certificate' },
      { label: 'Dimension Inspection Report', checkName: 'Thread Gauging' },
      { label: 'Surface Finish',           checkName: 'Surface Finish' },
      { label: 'Heat Treatment',           checkName: 'Heat Treatment' },
    ];

    const getCheckValue = (name) => {
      const item = checklist.find(c => c.name === name);
      return item?.included ? 'X' : 'NA';
    };

    // Generate standardized filename using naming service.
    // The CoC must be named with its OWN reference (COC serial), not the WO/heat
    // number, otherwise the filename collides with WO documents and looks like a
    // Work Order doc in the Documents tab.
    const { generateDocumentName: genJobCoCName } = require('./documentNamingService');
    const { fileName: jobCocFilename } = await genJobCoCName({
      documentType: 'coc',
      projectName: project.project_name,
      reference: serialNumbers, // e.g. COC-2026-0001 (stable, persisted on job_quality_forms)
      projectId,
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const finalBuffer = await this._appendUploadedDocsToCoCPdf(buffer, record, companySettings.company_id || project.company_id, jobIndex);
          resolve({ buffer: finalBuffer, filename: jobCocFilename, projectId });
        } catch (err) {
          reject(err);
        }
      });
      doc.on('error', reject);

      const margin = 40;
      const pageWidth = doc.page.width;
      const cw = pageWidth - 2 * margin; // content width
      let y = margin;

      // --------- Helper: draw a single cell (rect + text) ------------------------------------------------------------------------------------
      const cellRect = (cx, cy, w, h, opts = {}) => {
        doc.rect(cx, cy, w, h).strokeColor(opts.stroke || '#333').lineWidth(0.5).stroke();
      };
      const cellText = (text, cx, cy, w, h, opts = {}) => {
        const pad = opts.pad || 4;
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(opts.size || 8)
           .fillColor(opts.color || '#000')
           .text(String(text), cx + pad, cy + pad, { width: w - pad * 2, height: h - pad * 2, align: opts.align || 'left', lineBreak: true, ellipsis: false });
      };

      const GREEN = COLORS.TABLE_HEAD;
      y = drawGlobalHeader(doc, companySettings, 'Certificate of Conformance');

      // --------- JOB INFO TABLE (row 1) ---------------------------------------------------------------------------------------------------------------------------------------------
      const jobRowH = 32;
      const cols1 = [
        { label: 'WO',                  value: woNumber,   w: cw * 0.13 },
        { label: 'Product Description', value: partDesc,   w: cw * 0.25 },
        { label: 'Procedure ID',        value: procedureId, w: cw * 0.12 },
        { label: 'Part Number',         value: partNumber, w: cw * 0.12 },
        { label: 'Revision',            value: String(revision),  w: cw * 0.08 },
        { label: 'Material',            value: material,   w: cw * 0.13 },
        { label: 'Qty',                 value: qty,        w: cw * 0.08 },
        { label: 'Date',                value: fmtDate(new Date()), w: cw * 0.09 },
      ];
      // Normalise widths
      const totalW1 = cols1.reduce((s, c) => s + c.w, 0);
      let cx1 = margin;
      cols1.forEach(col => {
        col.w = (col.w / totalW1) * cw;
        const cellH = jobRowH / 2;
        // Header sub-row (label) --- green background
        doc.rect(cx1, y, col.w, cellH).fillAndStroke(GREEN, '#333').lineWidth(0.5);
        cellText(col.label, cx1, y, col.w, cellH, { bold: true, size: 6.5, color: '#ffffff' });
        // Value sub-row
        cellRect(cx1, y + cellH, col.w, cellH);
        cellText(col.value, cx1, y + cellH, col.w, cellH, { size: 7 });
        cx1 += col.w;
      });
      y += jobRowH;

      // --------- JOB INFO TABLE (row 2) ---------------------------------------------------------------------------------------------------------------------------------------------
      const cols2 = [
        { label: 'Customer PO Number', value: customerPO, w: cw * 0.30 },
        { label: 'Serial Numbers',       value: serialNumbers, w: cw * 0.40 },
        { label: 'Material Heat Number', value: heatNumber, w: cw * 0.30 },
      ];
      const totalW2 = cols2.reduce((s, c) => s + c.w, 0);
      let cx2 = margin;
      cols2.forEach(col => {
        col.w = (col.w / totalW2) * cw;
        const cellH = jobRowH / 2;
        // Label sub-row --- green background
        doc.rect(cx2, y, col.w, cellH).fillAndStroke(GREEN, '#333').lineWidth(0.5);
        cellText(col.label, cx2, y, col.w, cellH, { bold: true, size: 6.5, color: '#ffffff' });
        // Value sub-row
        cellRect(cx2, y + cellH, col.w, cellH);
        cellText(col.value, cx2, y + cellH, col.w, cellH, { size: 7 });
        cx2 += col.w;
      });
      y += jobRowH + 14;

      // --------- PROCEDURE TABLE ---------------------------------------------------------------------------------------------------------------------------------------------------------------
      const snW        = cw * 0.08;
      const procLabelW = cw * 0.34;
      const descW      = cw * 0.40;
      const procValW   = cw - snW - procLabelW - descW;
      const procRowH   = 18;

      // Header row: S.No. | Procedure | Description | Report
      doc.rect(margin, y, cw, procRowH).fill(GREEN);
      cellRect(margin, y, snW, procRowH);
      cellText('S.No.', margin, y, snW, procRowH, { bold: true, size: 7, align: 'center', color: '#ffffff' });
      cellRect(margin + snW, y, procLabelW, procRowH);
      cellText('Procedure', margin + snW, y, procLabelW, procRowH, { bold: true, size: 8, color: '#ffffff' });
      cellRect(margin + snW + procLabelW, y, descW, procRowH);
      cellText('Description', margin + snW + procLabelW, y, descW, procRowH, { bold: true, size: 8, color: '#ffffff' });
      cellRect(margin + snW + procLabelW + descW, y, procValW, procRowH);
      cellText('Report', margin + snW + procLabelW + descW, y, procValW, procRowH, { bold: true, size: 8, align: 'center', color: '#ffffff' });
      y += procRowH;

      // Use actual checklist from UI so selections are reflected exactly
      const tableChecklist = checklist.length > 0
        ? checklist
        : procedureRows.map(r => ({ name: r.label, included: false, description: '' }));

      tableChecklist.forEach((item, sn) => {
        const val = item.included ? 'Yes' : 'No';
        cellRect(margin, y, snW, procRowH);
        cellText(String(sn + 1), margin, y, snW, procRowH, { size: 8, align: 'center' });
        cellRect(margin + snW, y, procLabelW, procRowH);
        cellText(item.name || '', margin + snW, y, procLabelW, procRowH, { size: 8 });
        cellRect(margin + snW + procLabelW, y, descW, procRowH);
        cellText(item.description || '', margin + snW + procLabelW, y, descW, procRowH, { size: 7 });
        cellRect(margin + snW + procLabelW + descW, y, procValW, procRowH);
        cellText(val, margin + snW + procLabelW + descW, y, procValW, procRowH, { size: 8, align: 'center' });
        y += procRowH;
      });

      y += 18;

      // --------- COMMENTS ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('Inspector Notes / Comments:', margin, y);
      y += 14;
      const commentText = jobForm?.inspectorNotes || '';
      if (commentText) {
        doc.font('Helvetica').fontSize(8).fillColor('#000')
           .text(commentText, margin, y, { width: cw });
        y = doc.y + 12;
      } else {
        y += 20;
      }

      // --------- SIGNATURE LINE ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
      if (y + 40 < doc.page.height - margin) {
        const approvedByName = companySettings.poc_name || companySettings.contact_person || project?.preparedBy?.name || '';
        const approvedDate = dayjs().format('DD-MMM-YYYY');
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#000')
           .text('Approved By: ', margin, y, { continued: true, width: cw });
        doc.font('Helvetica').text(approvedByName || '_____________________________', { continued: false });
        y += 14;
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#000')
           .text('Date: ', margin, y, { continued: true, width: cw });
        doc.font('Helvetica').text(approvedDate, { continued: false });
      }

      drawGlobalFooter(doc, companySettings);
      doc.end();
    });
  }

  getInspectionTypes() {
    return [
      { key: 'dimensional_verification', label: 'Dimensional Verification' },
      { key: 'visual_inspection', label: 'Visual Inspection' },
      { key: 'hardness_testing', label: 'Hardness Testing' },
      { key: 'ndt_testing', label: 'NDT (Non-Destructive Testing)' },
      { key: 'pressure_testing', label: 'Pressure Testing' },
      { key: 'mtr_verification', label: 'MTR (Mill Test Report) Verification' }
    ];
  }

  /**
   * Get or generate an auto-incrementing Production ID for a COC.
   * Format: QF-XX (e.g. QF-12, QF-13, ...) starting from 12.
   * Stores the ID in job_quality_forms so it persists across re-downloads.
   */
  async _getCoCProcedureId(projectId, jobIndex, jobForm, record, companyId) {
    const existing = jobForm?.cocProcedureId;
    if (existing) return String(existing);

    const counterKey = 'coc_procedure_id_counter';
    let counter = 12; // start from 12
    const whereClause = companyId ? { key: counterKey, company_id: companyId } : { key: counterKey };
    const row = await Setting.findOne({ where: whereClause });
    if (row && row.value?.counter) {
      counter = row.value.counter + 1;
      await row.update({ value: { counter } });
    } else if (row) {
      await row.update({ value: { counter } });
    } else {
      await Setting.create({ key: counterKey, company_id: companyId || null, value: { counter } });
    }

    const procId = `QF-${counter}`;

    if (record) {
      try {
        const forms = record.job_quality_forms || [];
        const idx = forms.findIndex(f => f.jobIndex === jobIndex);
        if (idx >= 0) {
          forms[idx].cocProcedureId = procId;
        } else {
          forms.push({ jobIndex, cocProcedureId: procId });
        }
        await record.update({ job_quality_forms: forms });
      } catch (err) {
        console.error('Failed to persist COC procedure ID:', err.message);
      }
    }

    return procId;
  }

  /**
   * Get or generate a unique COC serial number for a project/job.
   * Format: COC-YYYY-NNNN (e.g. COC-2026-0001)
   * Stores the serial in the job_quality_forms so it persists.
   */
  async _getCoCSerialNumber(projectId, jobIndex, jobForm, record, companyId) {
    // Return existing serial if already assigned
    const existing = jobForm?.cocSerialNumber || jobForm?.serialNumbers || jobForm?.serial_numbers;
    if (existing) return String(existing);

    const documentNumberingService = require('./documentNumberingService');
    const { DOCUMENT_TYPES } = documentNumberingService;
    
    let serial;
    try {
      serial = await documentNumberingService.generateNumber(DOCUMENT_TYPES.COC_NUMBER, companyId);
    } catch (err) {
      console.error('Failed to generate COC number via service, falling back:', err.message);
      serial = `COC-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    }

    // Persist the serial number back into job_quality_forms
    if (record) {
      try {
        const forms = record.job_quality_forms || [];
        const idx = forms.findIndex(f => f.jobIndex === jobIndex);
        if (idx >= 0) {
          forms[idx].cocSerialNumber = serial;
        } else {
          forms.push({ jobIndex, cocSerialNumber: serial });
        }
        await record.update({ job_quality_forms: forms });
      } catch (err) {
        console.error('Failed to persist COC serial:', err.message);
      }
    }

    return serial;
  }
  async _appendUploadedDocsToCoCPdf(cocBuffer, qualityRecord, companyId, jobIndexFilter = null) {
    if (!qualityRecord) return cocBuffer;
    let pdfDoc;
    try {
      const { PDFDocument } = require('pdf-lib');
      pdfDoc = await PDFDocument.load(cocBuffer);
      const documentService = require('./documentService');
      const fsSync = require('fs');
      const pathModule = require('path');

      const filesToMerge = [];

      // Collect job quality forms documents
      const jobForms = qualityRecord.job_quality_forms || [];
      for (const form of jobForms) {
        if (jobIndexFilter !== null && form.jobIndex !== jobIndexFilter) {
          continue;
        }
        if (Array.isArray(form.checklist)) {
          for (const item of form.checklist) {
            if (item.documentPath) {
              filesToMerge.push({ path: item.documentPath, name: item.documentName });
            }
          }
        }
      }

      // Collect report files
      if (jobIndexFilter === null) {
        const reportFiles = qualityRecord.report_files || [];
        for (const report of reportFiles) {
          if (report.path) {
            filesToMerge.push({ path: report.path, name: report.name });
          }
        }
      }

      if (filesToMerge.length === 0) {
        return cocBuffer;
      }

      for (const file of filesToMerge) {
        try {
          const dummyDoc = {
            file_name: file.name,
            file_path: file.path,
            company_id: companyId,
            project_id: qualityRecord.project_id
          };
          const localPath = await documentService.findDocFile(file.path, file.name, dummyDoc);
          
          if (localPath && fsSync.existsSync(localPath)) {
            const fileBuffer = fsSync.readFileSync(localPath);
            const ext = file.name ? pathModule.extname(file.name).toLowerCase().replace('.', '') : '';

            if (ext === 'pdf') {
              const attachedPdf = await PDFDocument.load(fileBuffer);
              const copiedPages = await pdfDoc.copyPages(attachedPdf, attachedPdf.getPageIndices());
              copiedPages.forEach((page) => pdfDoc.addPage(page));
            } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
              let image;
              if (ext === 'png') {
                image = await pdfDoc.embedPng(fileBuffer);
              } else {
                image = await pdfDoc.embedJpg(fileBuffer);
              }
              const dims = image.scaleToFit(550, 800);
              const page = pdfDoc.addPage();
              page.drawImage(image, {
                x: (page.getWidth() - dims.width) / 2,
                y: (page.getHeight() - dims.height) / 2,
                width: dims.width,
                height: dims.height,
              });
            }
          }
        } catch (err) {
          console.warn('[qualityService] Could not append file ' + file.name + ' to CoC:', err.message);
        }
      }

      const mergedBytes = await pdfDoc.save();
      return Buffer.from(mergedBytes);
    } catch (err) {
      console.warn('[qualityService] Failed to merge PDFs for CoC:', err.message);
      return cocBuffer;
    }
  }

}

module.exports = new QualityService();
