const { Project, Client, User, Estimate, EstimateItem, SalesOrder, WorkOrder, QualityRecord, Document, RFQBundle, RFQBundleItem, VendorPurchaseOrder, VendorPOItem, VendorRFQ, VendorPO, ProjectAnalytics, Invoice, ActivityTimeline, Part, sequelize } = require('../models');
const { Op, fn, col, QueryTypes, where } = require('sequelize');
const auditLogService = require('./auditLogService');
const DocumentNumberGenerator = require('../utils/documentNumberGenerator');
const { saveFileToFileManager } = require('./fileManagerService');
const fs = require('fs').promises;
const path = require('path');

// Resolve uploads root directory (same logic as documentService)
const UPLOADS_ROOT = process.env.UPLOAD_PATH
  ? path.resolve(process.env.UPLOAD_PATH)
  : path.join(__dirname, '..', '..', 'uploads');

// Project status workflow
const STATUS_WORKFLOW = {
  draft: ['estimated'],
  estimated: ['quoted', 'draft'],
  quoted: ['order_confirmed', 'estimated'],
  order_confirmed: ['in_production'],
  in_production: ['inspected'],
  inspected: ['shipped'],
  shipped: ['closed'],
  closed: []
};

// Map workflow tab step index --- project status
// 0=Info, 1=Estimation, 2=Quotation, 3=PO-Client, 4=PO-Vendor,
// 5=WorkOrder, 6=Production, 7=Quality, 8=Logistics, 9=Invoice
const STEP_TO_STATUS = {
  1: 'estimated',
  2: 'quoted',
  3: 'order_confirmed',
  5: 'in_production',
  7: 'inspected',
  8: 'shipped',
  9: 'closed',
};

// Ordered status levels for forward-only advancement
const STATUS_LEVEL = {
  draft: 0,
  estimated: 1,
  quoted: 2,
  order_confirmed: 3,
  in_production: 4,
  inspected: 5,
  shipped: 6,
  closed: 7,
};

class ProjectService {
  async getAllProjects(filters = {}) {
    const where = { deleted_at: null };
    
    // Tenant isolation: filter by company_id if provided
    if (filters.company_id) {
      where.company_id = filters.company_id;
    }

    if (filters.status) {
      where.status = filters.status;
    }
    
    if (filters.client_id) {
      where.client_id = filters.client_id;
    }
    
    if (filters.prepared_by) {
      where.prepared_by = filters.prepared_by;
    }
    
    if (filters.search) {
      where.project_name = { [Op.iLike]: `%${filters.search}%` };
    }

    const projects = await Project.findAll({
      where,
      include: [
        { model: Client, as: 'client', attributes: ['id', 'client_name'] },
        { model: User, as: 'preparedBy', attributes: ['id', 'name'] },
        { model: Estimate, as: 'estimate', attributes: ['id', 'revision', 'is_approved', 'final_price', 'is_locked'] }
      ],
      order: [['updated_at', 'DESC']]
    });

    return projects;
  }

  async getProjectById(id) {
    const project = await Project.findByPk(id, {
      include: [
        { model: Client, as: 'client' },
        { model: User, as: 'preparedBy', attributes: ['id', 'name', 'email', 'phone', 'position', 'role'] },
        { model: Estimate, as: 'estimate', include: [{ model: EstimateItem, as: 'items' }] },
        { model: SalesOrder, as: 'salesOrder' },
        { model: WorkOrder, as: 'workOrder' },
        { model: QualityRecord, as: 'qualityRecord' },
        { model: Document, as: 'documents' },
        { model: VendorPurchaseOrder, as: 'vendorPurchaseOrders', include: [{ model: VendorPOItem, as: 'items' }] },
      ]
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Auto-assign quotation number for projects that pre-date the feature
    if (!project.quotation_number) {
      const qn = await this.generateQuotationNumber(project.company_id || null);
      await project.update({ quotation_number: qn });
      project.quotation_number = qn;
    }

    // Normalize: Estimate association is hasMany so project.estimate is an array.
    // Consumers expect a single estimate object with custom_parts.
    // Pick the approved estimate, or selected_revision, or the latest.
    const result = project.toJSON();
    const estimates = result.estimate;
    if (Array.isArray(estimates)) {
      result.estimates = estimates; // keep full list available
      const approved = estimates.find(e => e.is_approved);
      const selected = estimates.find(e => e.revision === result.selected_revision);
      result.estimate = approved || selected || estimates[estimates.length - 1] || null;
    }

    // Build unified all_items: custom_parts + process modules (estimate_items)
    if (result.estimate) {
      const customParts = Array.isArray(result.estimate.custom_parts) ? result.estimate.custom_parts : [];

      // Enrich custom_parts: resolve missing raw_material_id from Part Master.
      // Old estimation JSONB may not carry raw_material_id; the Part may have it now.
      const partsNeedingRmId = customParts.filter(cp => !cp.raw_material_id && cp.parts_master_id);
      if (partsNeedingRmId.length > 0) {
        const partIds = partsNeedingRmId.map(cp => cp.parts_master_id);
        const partRows = await Part.findAll({
          where: { id: { [Op.in]: partIds } },
          attributes: ['id', 'raw_material_id'],
        });
        const partRmMap = new Map(partRows.map(p => [p.id, p.raw_material_id]));
        for (const cp of partsNeedingRmId) {
          const rmId = partRmMap.get(cp.parts_master_id);
          if (rmId) cp.raw_material_id = rmId;
        }
      }
      const processModules = Array.isArray(result.estimate.items) ? result.estimate.items : [];
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
      result.estimate.all_items = [...customParts, ...mappedModules];
    }

    return result;
  }

  async generateQuotationNumber(companyId) {
    try {
      // Use centralized document numbering system
      return await DocumentNumberGenerator.generateNumber('quotation_number', companyId);
    } catch (error) {
      console.error('Error generating quotation number from centralized system:', error);
      // Fallback to legacy system in case centralized system fails
      console.warn('Falling back to legacy quotation number generation');
      const year = new Date().getFullYear();
      const prefix = `QT-${year}-`;

      const where = { quotation_number: { [Op.like]: `${prefix}%` } };
      if (companyId) where.company_id = companyId;

      const lastProject = await Project.findOne({
        where,
        order: [['quotation_number', 'DESC']],
        attributes: ['quotation_number']
      });

      if (lastProject && lastProject.quotation_number) {
        const lastNum = parseInt(lastProject.quotation_number.replace(prefix, ''), 10);
        if (!isNaN(lastNum)) {
          return `${prefix}${lastNum + 1}`;
        }
      }

      return `${prefix}1001`;
    }
  }

  async getNextQuotationNumber(companyId) {
    try {
      return await DocumentNumberGenerator.getPreview('quotation_number', companyId);
    } catch (error) {
      // Fallback
      const year = new Date().getFullYear();
      const prefix = `QT-${year}-`;

      const where = { quotation_number: { [Op.like]: `${prefix}%` } };
      if (companyId) where.company_id = companyId;

      const lastProject = await Project.findOne({
        where,
        order: [['quotation_number', 'DESC']],
        attributes: ['quotation_number']
      });

      if (lastProject && lastProject.quotation_number) {
        const lastNum = parseInt(lastProject.quotation_number.replace(prefix, ''), 10);
        if (!isNaN(lastNum)) {
          return `${prefix}${lastNum + 1}`;
        }
      }

      return `${prefix}1001`;
    }
  }

  async getNextProjectNumber(companyId) {
    try {
      return await DocumentNumberGenerator.getPreview('project_number', companyId);
    } catch (error) {
      console.error('Error getting project number preview:', error);
      return null;
    }
  }

  async getNextRevision() {
    const result = await Project.findOne({
      attributes: [[fn('MAX', col('revision')), 'maxRev']],
      raw: true
    });
    return (result?.maxRev || 0) + 1;
  }

  async createProject(projectData, userOrId) {
    const requestingUser = typeof userOrId === 'object' ? userOrId : null;
    const userId = requestingUser ? requestingUser.id : userOrId;
    const {
      project_name: rawProjectName,
      client_id
    } = projectData;
    const project_name = typeof rawProjectName === 'string' ? rawProjectName.trim() : rawProjectName;

    // Ensure project name already exists
    const nameWhere = { project_name, deleted_at: null };
    if (requestingUser?.company_id) {
      nameWhere.company_id = requestingUser.company_id;
    }
    const existing = await Project.findOne({ where: nameWhere, attributes: ['id'] });
    if (existing) {
      throw new Error('Project name already exists');
    }

    // Note: project name uniqueness is intentionally NOT enforced.
    // Projects are uniquely identified by their ID and revision. Multiple
    // projects within the same company may legitimately share a name
    // (e.g., recurring orders, templates, or draft duplicates).

    // Verify client exists
    const client = await Client.findByPk(client_id);
    if (!client) {
      throw new Error('Client not found');
    }

    // Fetch current production traveler type from system config
    // This captures the setting at project creation time
    let production_traveler_type = 'machining_industry'; // default
    try {
      const [ptConfig] = await sequelize.query(
        `SELECT module_key FROM system_module_config WHERE section_name = 'production_traveler' LIMIT 1`,
        { type: QueryTypes.SELECT }
      );
      if (ptConfig?.module_key) {
        production_traveler_type = ptConfig.module_key;
      }
    } catch (err) {
      console.warn('Could not fetch production traveler type, using default:', err.message);
    }

    const quotation_number = await this.generateQuotationNumber(requestingUser?.company_id || client?.company_id || null);
    const revision = await this.getNextRevision();

    // Generate project number from Document Numbering settings
    let project_number = null;
    try {
      const documentNumberingService = require('./documentNumberingService');
      project_number = await documentNumberingService.generateNumber('project_number', requestingUser?.company_id || client?.company_id || null);
    } catch (err) {
      console.warn('Could not generate project number:', err.message);
    }

    const project = await Project.create({
      project_name,
      client_id,
      prepared_by: userId,
      company_id: requestingUser?.company_id || client?.company_id || null,
      quotation_number,
      project_number,
      status: 'draft',
      revision,
      production_traveler_type
    });

    // Create file manager folders for this project
    try {
      const fileManagerService = require('./fileManagerService');
      await fileManagerService.createProjectFolders(project.id, project.project_name, project.company_id);
    } catch (e) {
      console.warn('File manager folder creation skipped:', e.message);
    }

    // ── Cloudflare R2: create the project folder in cloud storage ────────────
    // Requirement: every project create MUST provision its R2 folder.
    // If R2 is configured and the call fails, surface the error (do not silently
    // swallow). If R2 is not configured at all (dev/local), log a warning and
    // continue — but make it loud.
    const r2 = require('./r2StorageService');
    if (r2.isConfigured) {
      if (!project.company_id) {
        const err = new Error(`R2 folder not created: project ${project.id} has no company_id`);
        console.error('[R2] ' + err.message);
        throw err;
      }
      try {
        await r2.ensureProjectFolder({
          companyId: project.company_id,
          projectId: project.id,
          projectName: project.project_name,
          projectNumber: project.project_number,
        });
      } catch (r2Err) {
        console.error(`[R2] Failed to create folder for project ${project.id} (${project.project_name}):`, r2Err);
        // Re-throw so the API caller knows the cloud sync failed. This satisfies
        // the "no silent failure" requirement. The DB row stays so a backfill
        // script (scripts/backfill-r2-project-folders.js) can fix it later.
        const wrapped = new Error(`Project created but R2 folder provisioning failed: ${r2Err.message}`);
        wrapped.status = 502;
        wrapped.cause = r2Err;
        wrapped.projectId = project.id;
        throw wrapped;
      }
    } else {
      console.warn(`[R2] Skipped folder creation for project ${project.id} — R2 not configured. Set CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.`);
    }

    // STEP 2 — Prepare user object safely
    const userData = requestingUser
      ? {
          id: requestingUser.id,
          company_id: requestingUser.company_id
        }
      : {
          id: project.prepared_by || 1,
          company_id: project.company_id || 1
        };

    // STEP 3 — Trigger project folder creation in File Manager
    try {
      console.log('Trigger: Project Folder Creation');

      await saveFileToFileManager({
        module_type: 'project',
        section: 'project_root',
        reference_id: project.id,
        file: null,
        isGenerated: false,
        user: userData
      });

    } catch (error) {
      console.error('Project File Manager Error:', error);
    }

    // Audit log
    auditLogService.log({
      action: 'project_created',
      entity_type: 'project',
      entity_id: project.id,
      entity_name: project_name,
      performed_by: userId,
      performer_name: requestingUser?.name,
      performer_role: requestingUser?.role,
      details: { client: client.client_name, quotation_number },
      company_id: requestingUser?.company_id
    });

    try {
      await ActivityTimeline.create({
        company_id: requestingUser?.company_id || null,
        user_id: userId,
        action: 'project_created',
        description: `Project "${project_name}" created`,
        severity: 'info',
        metadata: { project_id: project.id, quotation_number },
      });
    } catch (e) { /* ignore timeline errors */ }

    return this.getProjectById(project.id);
  }

  async updateProject(id, updateData, userId) {
    const project = await Project.findByPk(id);
    if (!project) {
      throw new Error('Project not found');
    }

    // Prevent updates to certain fields if project is beyond draft status
    if (project.status !== 'draft') {
      const restrictedFields = ['client_id', 'project_name'];
      const actuallyChanged = restrictedFields.some(
        field => updateData[field] !== undefined && String(updateData[field]) !== String(project[field])
      );
      if (actuallyChanged) {
        throw new Error('Cannot modify project name or client after draft status');
      }
      // Strip unchanged restricted fields so they don't reach the update
      restrictedFields.forEach(field => { delete updateData[field]; });
    }

    const allowedFields = [
      'project_name', 'client_id', 'ship_to_address',
      'material_type', 'material_grade', 'heat_number',
      'material_supplied_by', 'quantity', 'quote_info'
    ];

    const updates = {};
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updates[field] = updateData[field];
      }
    });

    await project.update(updates);

    try {
      await ActivityTimeline.create({
        company_id: project.company_id || null,
        user_id: userId,
        action: 'project_updated',
        description: `Project "${project.project_name}" updated`,
        severity: 'info',
        metadata: { project_id: id, updated_fields: Object.keys(updates) },
      });
    } catch (e) { /* ignore timeline errors */ }

    return this.getProjectById(id);
  }

  /**
   * Advance project status based on the workflow step the user just completed.
   * Only moves forward --- never regresses status.
   */
  async advanceWorkflow(id, completedStep) {
    const project = await Project.findByPk(id);
    if (!project) throw new Error('Project not found');

    const targetStatus = STEP_TO_STATUS[completedStep];
    if (!targetStatus) {
      // Step doesn't map to a status change (e.g. PO-Vendor, Production, Documents)
      return this.getProjectById(id);
    }

    const currentLevel = STATUS_LEVEL[project.status] ?? 0;
    const targetLevel = STATUS_LEVEL[targetStatus] ?? 0;

    // Only advance forward
    if (targetLevel <= currentLevel) {
      return this.getProjectById(id);
    }

    await project.update({ status: targetStatus });
    return this.getProjectById(id);
  }

  async updateProjectStatus(id, newStatus) {
    const project = await Project.findByPk(id);
    if (!project) {
      throw new Error('Project not found');
    }

    const allowedTransitions = STATUS_WORKFLOW[project.status];
    if (!allowedTransitions || !allowedTransitions.includes(newStatus)) {
      throw new Error(`Cannot transition from ${project.status} to ${newStatus}`);
    }

    // Validate business rules for status transitions
    await this.validateStatusTransition(project, newStatus);

    await project.update({ status: newStatus });

    return this.getProjectById(id);
  }

  async validateStatusTransition(project, newStatus) {
    switch (newStatus) {
      case 'estimated':
        // Must have estimate with items
        const estimate = await Estimate.findOne({ where: { project_id: project.id } });
        if (!estimate) {
          throw new Error('Cannot mark as estimated without creating an estimate');
        }
        break;

      case 'quoted':
        // Estimate must be approved
        const approvedEstimate = await Estimate.findOne({
          where: { project_id: project.id, is_approved: true }
        });
        if (!approvedEstimate) {
          throw new Error('Cannot generate quotation without approved estimate');
        }
        break;

      case 'order_confirmed':
        // Must have sales order
        const salesOrder = await SalesOrder.findOne({ where: { project_id: project.id } });
        if (!salesOrder) {
          throw new Error('Cannot confirm order without sales order');
        }
        break;

      case 'in_production':
        // Must have work order
        const workOrder = await WorkOrder.findOne({ where: { project_id: project.id } });
        if (!workOrder) {
          throw new Error('Cannot start production without work order');
        }
        break;

      case 'inspected':
        // Quality record must exist with required checks
        const qualityRecord = await QualityRecord.findOne({ where: { project_id: project.id } });
        if (!qualityRecord) {
          throw new Error('Cannot mark as inspected without quality record');
        }
        break;

      case 'shipped':
        // CoC check removed — shipping allowed without Certificate of Conformance
        break;
    }
  }

  async incrementRevision(id) {
    const project = await Project.findByPk(id);
    if (!project) {
      throw new Error('Project not found');
    }

    await project.update({ revision: project.revision + 1 });
    return this.getProjectById(id);
  }

  async copyProject(id, userId) {
    const project = await Project.findByPk(id, {
      include: [
        { model: Client, as: 'client' },
        { model: Estimate, as: 'estimate', include: [{ model: EstimateItem, as: 'items' }] },
      ]
    });
    if (!project) {
      throw new Error('Project not found');
    }

    // Strip any existing _NN suffix to find the root name
    const rootName = project.project_name.replace(/_\d+$/, '');

    // Find all copies that match rootName_NN pattern
    const likePattern = `${rootName}_%`;
    const copyWhere = { project_name: { [Op.like]: likePattern } };
    if (project.company_id) copyWhere.company_id = project.company_id;
    const existingCopies = await Project.findAll({
      where: copyWhere,
      attributes: ['project_name']
    });

    let maxNum = 0;
    const escapedRoot = rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escapedRoot}_(\\d+)$`);
    existingCopies.forEach(p => {
      const match = p.project_name.match(regex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });

    const newName = `${rootName}_${String(maxNum + 1).padStart(2, '0')}`;
    const quotation_number = await this.generateQuotationNumber(project.company_id || null);

    // Create the new project --- revision resets to 0, status is draft
    const newProject = await Project.create({
      project_name: newName,
      client_id: project.client_id,
      prepared_by: userId,
      quotation_number,
      status: 'draft',
      revision: 0,
      company_id: project.company_id || null
    });

    // Copy all estimate revisions (project.estimate is an array via hasMany)
    const estimates = project.estimate || [];
    for (const est of estimates) {
      const newEstimate = await Estimate.create({
        project_id: newProject.id,
        revision: est.revision,
        is_locked: false,
        raw_material_cost: est.raw_material_cost || 0,
        process_cost: est.process_cost || 0,
        overhead_cost: est.overhead_cost || 0,
        total_cost: est.total_cost || 0,
        margin_percent: est.margin_percent || 0,
        final_price: est.final_price || 0,
        is_approved: false,
        approved_by: null,
        approved_at: null,
        quotation: {},
        custom_parts: est.custom_parts || [],
        company_id: project.company_id || null,
      });

      // Copy estimate items (modules) for this revision
      const items = est.items || [];
      for (const item of items) {
        await EstimateItem.create({
          estimate_id: newEstimate.id,
          module_type: item.module_type,
          input_json: item.input_json || {},
          calculated_json: item.calculated_json || {},
          total_cost: item.total_cost || 0,
          sequence_order: item.sequence_order || 0,
        });
      }
    }

    // Copy selected_revision from source project
    if (project.selected_revision != null) {
      await newProject.update({ selected_revision: project.selected_revision });
    }

    return this.getProjectById(newProject.id);
  }

  async deleteProject(id) {
    const project = await Project.findByPk(id);
    if (!project) {
      throw new Error('Project not found');
    }

    // Soft delete - move to recycle bin
    await project.update({ deleted_at: new Date() });

    try {
      await ActivityTimeline.create({
        company_id: project.company_id || null,
        user_id: null,
        action: 'project_deleted',
        description: `Project "${project.project_name}" moved to recycle bin`,
        severity: 'warning',
        metadata: { project_id: id },
      });
    } catch (e) { /* ignore timeline errors */ }

    return { message: 'Project moved to recycle bin' };
  }

  async selectRevision(projectId, revision) {
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Verify the revision exists
    const { Estimate } = require('../models');
    const estimate = await Estimate.findOne({
      where: { project_id: projectId, revision }
    });
    if (!estimate) {
      throw new Error(`Revision R${revision} does not exist`);
    }

    // Update the selected revision
    await project.update({ selected_revision: revision });

    return this.getProjectById(projectId);
  }

  getStatusWorkflow() {
    return STATUS_WORKFLOW;
  }
}

module.exports = new ProjectService();
