const { Estimate, EstimateItem, Project, ActivityTimeline, sequelize } = require('../models');
const { Sequelize, Transaction } = require('sequelize');
const settingsService = require('./settingsService');
const { drawGlobalHeader, drawGlobalFooter, COLORS } = require('../utils/pdfTemplate');
const calc = require('../utils/calculations');
const { sendEmail, isValidEmail } = require('../utils/emailService');
const auditLogService = require('./auditLogService');

/**
 * SYNC WARNING: This object is mirrored in the frontend at
 * frontend/src/components/ProjectTabs/EstimationTab.tsx (calculateModuleLocally).
 * Any formula change must be applied to BOTH files.
 */
const PROCESS_CALCULATORS = {
  cnc_turning: (inputs) => {
    const {
      operator_rate = 0,
      setup_time = 0,
      cycle_time_per_operation = 0,
      quantity = 0,
      tool_change_count = 0,
      raw_material_cost = 0,
      overall_margin_percent = 0,
    } = inputs;
    const machining_time_hrs  = (setup_time + quantity * cycle_time_per_operation) / 60;
    const setup_cost          = parseFloat((setup_time * operator_rate / 60).toFixed(2));
    const machining_cost      = parseFloat((machining_time_hrs * operator_rate * 1.5).toFixed(2));
    const tool_wear_cost      = parseFloat((tool_change_count * 50).toFixed(2));
    const turning_process_cost = parseFloat((setup_cost + machining_cost + tool_wear_cost).toFixed(2));
    const total_job_cost      = parseFloat((turning_process_cost + parseFloat(raw_material_cost)).toFixed(2));
    const profit              = parseFloat((total_job_cost * overall_margin_percent / 100).toFixed(2));
    return {
      machining_time_hrs: parseFloat(machining_time_hrs.toFixed(3)),
      setup_cost,
      machining_cost,
      tool_wear_cost,
      turning_process_cost,
      raw_material_cost: parseFloat(raw_material_cost),
      total_job_cost,
      profit,
      total_cost: total_job_cost,
    };
  },

  cnc_milling: (inputs) => {
    const {
      operator_rate = 0,
      setup_time = 0,
      no_of_setups = 1,
      cycle_time_per_operation = 0,
      quantity = 0,
      tool_change_count = 0,
      raw_material_cost = 0,
      overall_margin_percent = 0,
    } = inputs;
    const machining_time_hrs = (no_of_setups * setup_time + quantity * cycle_time_per_operation) / 60;
    const labor_cost        = parseFloat((machining_time_hrs * operator_rate).toFixed(2));
    const machine_cost      = parseFloat((machining_time_hrs * operator_rate * 1.5).toFixed(2));
    const tool_wear_cost    = parseFloat((tool_change_count * 50).toFixed(2));
    const total_job_cost    = parseFloat((labor_cost + machine_cost + tool_wear_cost + parseFloat(raw_material_cost)).toFixed(2));
    const profit            = parseFloat((total_job_cost * overall_margin_percent / 100).toFixed(2));
    return {
      machining_time_hrs: parseFloat(machining_time_hrs.toFixed(3)),
      labor_cost,
      raw_material_cost: parseFloat(raw_material_cost),
      machine_cost,
      tool_wear_cost,
      total_job_cost,
      profit,
      total_cost: total_job_cost,
    };
  },

  laser_cutting: (inputs) => {
    const {
      total_cut_length = 0,
      cutting_speed = 1,
      operator_rate = 0,
      quantity = 1,
      thickness = 1,
      raw_material_cost = 0,
      overall_margin_percent = 0,
    } = inputs;
    const cutting_time_hrs  = parseFloat(((total_cut_length / cutting_speed) / 60).toFixed(3));
    const labor_cost        = parseFloat((cutting_time_hrs * operator_rate * quantity).toFixed(2));
    const laser_cost        = parseFloat((cutting_time_hrs * 500 * quantity).toFixed(2));
    const scrap_percent     = thickness > 10 ? 8 : thickness > 5 ? 5 : 3;
    const total_job_cost    = parseFloat((labor_cost + laser_cost + parseFloat(raw_material_cost)).toFixed(2));
    const profit            = parseFloat((total_job_cost * overall_margin_percent / 100).toFixed(2));
    return {
      cutting_time_hrs,
      labor_cost,
      raw_material_cost: parseFloat(raw_material_cost),
      laser_cost,
      scrap_percent,
      total_job_cost,
      profit,
      total_cost: total_job_cost,
    };
  },

  fabrication_welding: (inputs) => {
    const {
      total_cut_length = 0,
      cutting_speed = 1,
      operator_rate = 0,
      quantity = 1,
      thickness = 1,
      raw_material_cost = 0,
      overall_margin_percent = 0,
    } = inputs;
    const cutting_time_hrs  = parseFloat(((total_cut_length / cutting_speed) / 60).toFixed(3));
    const labor_cost        = parseFloat((cutting_time_hrs * operator_rate * quantity).toFixed(2));
    const laser_cost        = parseFloat((cutting_time_hrs * 500 * quantity).toFixed(2));
    const scrap_percent     = thickness > 10 ? 8 : thickness > 5 ? 5 : 3;
    const total_job_cost    = parseFloat((labor_cost + laser_cost + parseFloat(raw_material_cost)).toFixed(2));
    const profit            = parseFloat((total_job_cost * overall_margin_percent / 100).toFixed(2));
    return {
      cutting_time_hrs,
      labor_cost,
      raw_material_cost: parseFloat(raw_material_cost),
      laser_cost,
      scrap_percent,
      total_job_cost,
      profit,
      total_cost: total_job_cost,
    };
  },
};

// Generic calculator reused for welding, grinding, drilling, boring, etc.
const _genericCalculator = (inputs) => {
  const {
    operator_rate = 0,
    cycle_time_per_operation = 0,
    quantity = 1,
    no_of_operations = 1,
    setup_time = 0,
    raw_material_cost = 0,
    overall_margin_percent = 0,
  } = inputs;
  const process_time_hrs = (setup_time + quantity * no_of_operations * cycle_time_per_operation) / 60;
  const labor_cost       = parseFloat((process_time_hrs * operator_rate).toFixed(2));
  const process_cost     = parseFloat((process_time_hrs * operator_rate * 1.5).toFixed(2));
  const total_job_cost   = parseFloat((labor_cost + process_cost + parseFloat(raw_material_cost)).toFixed(2));
  const profit           = parseFloat((total_job_cost * overall_margin_percent / 100).toFixed(2));
  return {
    process_time_hrs: parseFloat(process_time_hrs.toFixed(3)),
    labor_cost,
    raw_material_cost: parseFloat(raw_material_cost),
    process_cost,
    total_job_cost,
    profit,
    total_cost: total_job_cost,
  };
};

['welding', 'heat_treatment', 'grinding', 'drilling', 'boring', 'threading', 'surface_treatment', 'assembly', 'testing', 'other'].forEach(
  (type) => { PROCESS_CALCULATORS[type] = _genericCalculator; }
);
class EstimateService {
  async getEstimateByProjectId(projectId, revision) {
    const where = { project_id: projectId };
    if (revision !== undefined && revision !== null) {
      where.revision = revision;
    }
    const estimate = await Estimate.findOne({
      where,
      include: [{ model: EstimateItem, as: 'items', order: [['sequence_order', 'ASC']] }],
      order: [['revision', 'DESC']],
    });
    return estimate;
  }

  async getAllEstimatesByProjectId(projectId) {
    const estimates = await Estimate.findAll({
      where: { project_id: projectId },
      include: [{ model: EstimateItem, as: 'items', order: [['sequence_order', 'ASC']] }],
      order: [['revision', 'ASC']],
    });

    // Self-healing: ensure only one revision is approved (the most recently approved one)
    const approved = estimates.filter(e => e.is_approved);
    if (approved.length > 1) {
      // Keep the one approved most recently (by approved_at); fall back to highest revision
      const keep = approved.reduce((a, b) => {
        const aTime = a.approved_at ? new Date(a.approved_at).getTime() : 0;
        const bTime = b.approved_at ? new Date(b.approved_at).getTime() : 0;
        if (aTime !== bTime) return aTime > bTime ? a : b;
        return a.revision > b.revision ? a : b;
      });
      const staleIds = approved.filter(e => e.id !== keep.id).map(e => e.id);
      await Estimate.update(
        { is_approved: false, approved_by: null, approved_at: null },
        { where: { id: staleIds } }
      );
      // Reflect fix in the returned data
      for (const est of estimates) {
        if (staleIds.includes(est.id)) {
          est.is_approved = false;
          est.approved_by = null;
          est.approved_at = null;
        }
      }
    }

    return estimates;
  }

  async copyEstimateToNewRevision(projectId, sourceRevision) {
    // Validate sourceRevision - default to 0 if not provided or invalid
    const validSourceRevision = typeof sourceRevision === 'number' && !isNaN(sourceRevision) ? sourceRevision : 0;
    
    const source = await Estimate.findOne({
      where: { project_id: projectId, revision: validSourceRevision },
      include: [{ model: EstimateItem, as: 'items' }],
    });
    if (!source) throw new Error(`Source estimate revision R${validSourceRevision} not found. Please save the estimate first.`);

    // Helper to safely parse decimal values - prevent NaN and null
    const safeDecimal = (val) => {
      const parsed = parseFloat(val);
      return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
    };

    // Helper to safely clone custom_parts - ensure it's always an array
    const safeCloneCustomParts = (parts) => {
      if (!parts) return [];
      try {
        const cloned = JSON.parse(JSON.stringify(parts));
        return Array.isArray(cloned) ? cloned : [];
      } catch (e) {
        console.error('Error cloning custom_parts:', e);
        return [];
      }
    };

    // -- Bulletproof approach ----------------------------------------------
    // Uses PostgreSQL advisory lock to serialize copy operations per project.
    // This prevents race conditions: if two requests try to copy at the same
    // time, the second one waits for the first to finish (instead of failing).
    // Then uses raw SQL MAX() inside the same transaction for the next number.
    // Falls back to a retry loop in case of any unexpected constraint error.
    const MAX_ATTEMPTS = 5;
    let lastError;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const result = await sequelize.transaction({
          isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED,
        }, async (t) => {
          // Advisory lock keyed on project_id - serializes copy operations
          // for the same project. Uses hashtext() to convert UUID to int.
          await sequelize.query(
            `SELECT pg_advisory_xact_lock(hashtext(:projectId))`,
            { replacements: { projectId }, transaction: t }
          );

          // Now we hold the lock - no other copy for this project can proceed.
          // Safely compute the next revision number.
          const [[{ next_revision }]] = await sequelize.query(
            `SELECT COALESCE(MAX(revision), -1) + 1 AS next_revision
             FROM estimates
             WHERE project_id = :projectId`,
            { replacements: { projectId }, transaction: t }
          );
          const nextRevision = parseInt(next_revision, 10);

          console.log(`[copyRevision] attempt=${attempt}, project=${projectId}, source=R${validSourceRevision}, next=R${nextRevision}`);

          // Double-check: verify this revision doesn't already exist
          const [[{ exists_count }]] = await sequelize.query(
            `SELECT COUNT(*)::int AS exists_count FROM estimates
             WHERE project_id = :projectId AND revision = :rev`,
            { replacements: { projectId, rev: nextRevision }, transaction: t }
          );
          if (exists_count > 0) {
            throw new Error(`UNEXPECTED: revision ${nextRevision} already exists despite advisory lock. Retrying...`);
          }

          // Create the new estimate revision with all data copied
          const newEstimate = await Estimate.create({
            project_id: projectId,
            revision: nextRevision,
            raw_material_cost: safeDecimal(source.raw_material_cost),
            process_cost: safeDecimal(source.process_cost),
            overhead_cost: safeDecimal(source.overhead_cost),
            total_cost: safeDecimal(source.total_cost),
            margin_percent: safeDecimal(source.margin_percent),
            final_price: safeDecimal(source.final_price),
            is_approved: false,
            custom_parts: safeCloneCustomParts(source.custom_parts),
            quotation: {},
            is_locked: false,
            company_id: source.company_id || null,
          }, { transaction: t });

          // Copy all estimate items (parts, modules, materials, pricing, etc.)
          const sourceItems = source.items || [];
          for (const item of sourceItems) {
            await EstimateItem.create({
              estimate_id: newEstimate.id,
              module_type: item.module_type,
              input_json: item.input_json ? JSON.parse(JSON.stringify(item.input_json)) : {},
              calculated_json: item.calculated_json ? JSON.parse(JSON.stringify(item.calculated_json)) : {},
              total_cost: safeDecimal(item.total_cost),
              sequence_order: item.sequence_order || 0,
            }, { transaction: t });
          }

          return nextRevision;
        });

        // Transaction committed successfully - return the new revision data
        return this.getEstimateByProjectId(projectId, result);

      } catch (error) {
        lastError = error;
        const isRetryable =
          error.name === 'SequelizeUniqueConstraintError' ||
          (error.parent && error.parent.code === '40001') || // serialization failure
          (error.message && error.message.includes('UNEXPECTED'));
        console.warn(`[copyRevision] attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error.name || 'Error'} - ${error.message}`);
        if (!isRetryable || attempt === MAX_ATTEMPTS) throw error;
        // Exponential back-off before retry
        await new Promise(resolve => setTimeout(resolve, 150 * attempt));
      }
    }

    throw lastError;
  }

  async createOrUpdateEstimate(projectId, estimateData, userId) {
    const project = await Project.findByPk(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Status no longer blocks estimation editing - users can edit at any status

    const revision = estimateData.revision !== undefined ? estimateData.revision : 0;
    let estimate = await Estimate.findOne({ where: { project_id: projectId, revision } });

    // Locked flag is informational only - editing is always allowed
    // If locked, unlock it so changes can be saved
    if (estimate && estimate.is_locked) {
      await estimate.update({ is_locked: false });
    }

    // If estimate was approved, clear approval so it requires re-approval after changes
    const wasApproved = estimate && estimate.is_approved;

    const {
      overhead_cost = 0,
      margin_percent = 0,
      custom_parts = []
    } = estimateData;

    if (estimate) {
      await estimate.update({
        overhead_cost,
        margin_percent,
        custom_parts,
        ...(wasApproved ? { is_approved: false, approved_by: null, approved_at: null } : {})
      });
      // Reset project status to draft if approval was cleared
      if (wasApproved) {
        await Project.update({ status: 'draft' }, { where: { id: projectId } });
      }
    } else {
      estimate = await Estimate.create({
        project_id: projectId,
        revision,
        overhead_cost,
        margin_percent,
        custom_parts,
        company_id: (await Project.findByPk(projectId, { attributes: ['company_id'] }))?.company_id || null
      });
    }

    // Recalculate totals
    await this.recalculateEstimateTotals(estimate.id);

    // Sync drawing files from custom_parts to Documents table.
    // Also auto-attaches any Parts Master drawings (by parts_master_id) and
    // mutates custom_parts in-place — persist back to estimate when changed.
    try {
      const mutated = await this._syncDrawingsToDocuments(projectId, custom_parts);
      if (mutated) {
        await estimate.update({ custom_parts });
      }
    } catch (_) { /* non-critical — backfill in documentService handles fallback */ }

    try {
      const proj = await Project.findByPk(projectId, { attributes: ['project_name', 'company_id'] });
      await ActivityTimeline.create({
        company_id: proj?.company_id || null,
        user_id: userId,
        action: 'estimate_updated',
        description: `Estimate for "${proj?.project_name || projectId}" updated (Rev ${revision})`,
        severity: 'info',
        metadata: { project_id: projectId, revision },
      });
    } catch (e) { /* ignore timeline errors */ }

    return this.getEstimateByProjectId(projectId, revision);
  }

  async addEstimateItem(estimateId, itemData) {
    const estimate = await Estimate.findByPk(estimateId);
    if (!estimate) {
      throw new Error('Estimate not found');
    }

    // If estimate was approved, clear approval so it requires re-approval after changes
    if (estimate.is_approved) {
      await estimate.update({ is_approved: false, approved_by: null, approved_at: null });
      await Project.update({ status: 'draft' }, { where: { id: estimate.project_id } });
    }

    const { module_type, input_json, sequence_order } = itemData;

    // Calculate costs based on module type
    const calculator = PROCESS_CALCULATORS[module_type];
    if (!calculator) {
      throw new Error(`Unknown process module type: ${module_type}`);
    }

    const calculated_json = calculator(input_json || {});

    const item = await EstimateItem.create({
      estimate_id: estimateId,
      module_type,
      input_json: input_json || {},
      calculated_json,
      total_cost: calculated_json.total_cost || 0,
      sequence_order: sequence_order || 0
    });

    // Recalculate estimate totals
    await this.recalculateEstimateTotals(estimateId);

    return item;
  }

  async updateEstimateItem(itemId, itemData) {
    const item = await EstimateItem.findByPk(itemId, {
      include: [{ model: Estimate, as: 'estimate' }]
    });

    if (!item) {
      throw new Error('Estimate item not found');
    }

    // If estimate was approved, clear approval so it requires re-approval after changes
    if (item.estimate.is_approved) {
      await item.estimate.update({ is_approved: false, approved_by: null, approved_at: null });
      await Project.update({ status: 'draft' }, { where: { id: item.estimate.project_id } });
    }

    const { input_json, sequence_order } = itemData;

    // Recalculate if inputs changed
    if (input_json) {
      const calculator = PROCESS_CALCULATORS[item.module_type];
      const calculated_json = calculator(input_json);

      await item.update({
        input_json,
        calculated_json,
        total_cost: calculated_json.total_cost || 0,
        sequence_order: sequence_order !== undefined ? sequence_order : item.sequence_order
      });
    } else if (sequence_order !== undefined) {
      await item.update({ sequence_order });
    }

    // Recalculate estimate totals
    await this.recalculateEstimateTotals(item.estimate_id);

    return EstimateItem.findByPk(itemId);
  }

  async deleteRevision(projectId, revision) {
    const estimate = await Estimate.findOne({
      where: { project_id: projectId, revision },
    });

    if (!estimate) {
      throw new Error(`Revision R${revision} not found`);
    }

    // Delete all items belonging to this estimate
    await EstimateItem.destroy({ where: { estimate_id: estimate.id } });

    // Delete the estimate itself
    await estimate.destroy();

    return { message: `Revision R${revision} deleted successfully` };
  }

  async deleteEstimateItem(itemId) {
    const item = await EstimateItem.findByPk(itemId, {
      include: [{ model: Estimate, as: 'estimate' }]
    });

    if (!item) {
      throw new Error('Estimate item not found');
    }

    // If estimate was approved, clear approval so it requires re-approval after changes
    if (item.estimate.is_approved) {
      await item.estimate.update({ is_approved: false, approved_by: null, approved_at: null });
      await Project.update({ status: 'draft' }, { where: { id: item.estimate.project_id } });
    }

    const estimateId = item.estimate_id;
    await item.destroy();

    // Recalculate estimate totals
    await this.recalculateEstimateTotals(estimateId);

    return { message: 'Estimate item deleted successfully' };
  }

  async recalculateEstimateTotals(estimateId) {
    const estimate = await Estimate.findByPk(estimateId, {
      include: [{ model: EstimateItem, as: 'items' }]
    });

    if (!estimate) return;

    // raw_material_cost is the sum of all custom parts
    const parts = estimate.custom_parts || [];
    const raw_material_cost = parts.reduce((sum, part) => {
      if (part.bulk_order_variable_price && Array.isArray(part.pricing_tiers) && part.pricing_tiers.length > 0) {
        // Bulk pricing: use first tier as the default cost
        const tier = part.pricing_tiers[0];
        const qty = parseFloat(tier.quantity || 0);
        const unitPrice = parseFloat(tier.unit_price || 0);
        return sum + qty * unitPrice;
      }
      const qty = parseFloat(part.quantity || 0);
      const unitCost = parseFloat(part.job_cost_per_unit || 0);
      return sum + qty * unitCost;
    }, 0);

    const process_cost = estimate.items.reduce((sum, item) => {
      return sum + parseFloat(item.total_cost || 0);
    }, 0);

    const total_cost = raw_material_cost +
                       process_cost +
                       parseFloat(estimate.overhead_cost || 0);

    const margin_amount = total_cost * (parseFloat(estimate.margin_percent || 0) / 100);
    const final_price = total_cost + margin_amount;

    await estimate.update({
      raw_material_cost: parseFloat(raw_material_cost.toFixed(2)),
      process_cost: parseFloat(process_cost.toFixed(2)),
      total_cost: parseFloat(total_cost.toFixed(2)),
      final_price: parseFloat(final_price.toFixed(2))
    });
  }

  async approveEstimate(estimateId, userId) {
    const estimate = await Estimate.findByPk(estimateId, {
      include: [{ model: EstimateItem, as: 'items' }]
    });

    if (!estimate) {
      throw new Error('Estimate not found');
    }

    // Unlock if locked, so approval can proceed
    if (estimate.is_locked) {
      await estimate.update({ is_locked: false });
    }

    // Un-approve all other revisions for this project (only one can be approved)
    await Estimate.update(
      { is_approved: false, approved_by: null, approved_at: null },
      { where: { project_id: estimate.project_id, id: { [require('sequelize').Op.ne]: estimate.id } } }
    );

    await estimate.update({
      is_approved: true,
      approved_by: userId,
      approved_at: new Date()
    });

    // Lock all other revisions for this project
    await Estimate.update(
      { is_locked: true },
      { where: { project_id: estimate.project_id, id: { [require('sequelize').Op.ne]: estimate.id } } }
    );

    // Update project status and select the approved revision
    await Project.update(
      { status: 'estimated', selected_revision: estimate.revision },
      { where: { id: estimate.project_id } }
    );

    return this.getEstimateByProjectId(estimate.project_id, estimate.revision);
  }

  getProcessModuleTypes() {
    return Object.keys(PROCESS_CALCULATORS);
  }

  calculateProcessCost(moduleType, inputs) {
    const calculator = PROCESS_CALCULATORS[moduleType];
    if (!calculator) {
      throw new Error(`Unknown process module type: ${moduleType}`);
    }
    return calculator(inputs);
  }

  async updateQuotation(estimateId, data) {
    const estimate = await Estimate.findByPk(estimateId);
    if (!estimate) {
      throw new Error('Estimate not found');
    }

    const quotation = {
      ...(estimate.quotation || {}),
      validity_days: data.validity_days || 30,
      delivery_terms: data.delivery_terms || 'Ex-Works',
      payment_terms: data.payment_terms || 'Net 30',
      notes: data.notes !== undefined ? data.notes : (estimate.quotation?.notes || ''),
      terms_conditions: data.terms_conditions !== undefined ? data.terms_conditions : (estimate.quotation?.terms_conditions || ''),
      include_terms: data.include_terms !== undefined ? data.include_terms : (estimate.quotation?.include_terms || false),
      line_items: data.line_items || [],
      schedule_items: data.schedule_items || [],
      bom_items: data.bom_items || [],
      updated_at: new Date()
    };

    // Force Sequelize to detect JSONB mutation so notes/schedule always persist
    estimate.set('quotation', quotation);
    estimate.changed('quotation', true);
    await estimate.save();
    return this.getEstimateByProjectId(estimate.project_id, estimate.revision);
  }

  async generateQuotationPdf(estimateId) {
    const PDFDocument = require('pdfkit');
    const estimate = await Estimate.findByPk(estimateId, {
      include: [{ model: EstimateItem, as: 'items' }]
    });
    if (!estimate) throw new Error('Estimate not found');

    const project = await Project.findByPk(estimate.project_id, {
      include: ['client', 'preparedBy']
    });

    const quotation  = estimate.quotation  || {};
    let lineItems    = quotation.line_items || [];
    
    // FORCE FRESH LINE ITEMS: Rebuild from current estimate data instead of using cached/pre-saved data
    // This ensures PDF always reflects latest changes to custom_parts and estimate items
    const freshLineItems = calc.buildEstimateLineItems(estimate);
    if (freshLineItems && freshLineItems.length > 0) {
      lineItems = freshLineItems;
    }
    
    const bomItems   = quotation.bom_items  || [];
    const customParts = estimate.custom_parts || [];
    const estimateItems = (estimate.items || []).sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));

    // --- TERMS & CONDITIONS DATA -------------------------------------
    const termsAndConditions = [
      { title: 'ACCEPTANCE OF DOCUMENT.', body: "The terms of the \"Contract\" between the Seller and the purchaser of the goods (\"Buyer\") is composed of a signed quote or purchase order, these Terms and Conditions of Sale, and any expressly incorporated documents. This Contract between Buyer and Seller is expressly subject to these Terms and Conditions of Sale. Buyer (i) acknowledges that it has received Seller's Terms and Conditions of Sale, (ii) consents and agrees to be bound by these Seller's Terms and Conditions of Sale, and (iii) acknowledges that any and all terms and conditions of Buyer NOT incorporated into this Contract as an exhibit are hereby expressly rejected by Seller." },
      { title: 'DELIVERY/RISK OF LOSS', body: "Title to and risk of loss of all goods sold hereunder by Seller shall pass to Buyer upon their delivery F.O.B. Seller's factory to a representative of Buyer, including a common carrier. Any claim by Buyer of loss or damage to the goods in transit shall be the responsibility of the carrier and not of Seller. The dispatch or carriage of the goods shall be affected in all cases at the risk and costs of the Buyer. Buyer shall observe the requirement to give notice of defects in respect of the carrier for damage in transit." },
      { title: 'INSPECTION', body: "Buyer must inspect all goods upon receipt at Seller's factory (if Buyer takes immediate receipt) or upon delivery by a carrier. Buyer must notify the Seller within three (3) days of receipt if there are any defects or shortages in the goods. Notice that goods are not in conformance with these Terms and Conditions of Sale must set forth in reasonable detail the manner of nonconformance. If Buyer retains the goods after their delivery without giving such timely notice, such failure shall constitute an irrevocable acceptance of the goods by Buyer, except for defects not reasonably discoverable by a full visual inspection." },
      { title: 'PRODUCTS RETURNS', body: "Buyer may not return goods to obtain credit or replacement without written approval by an officer of Seller. Custom goods may not be returned. For goods accepted for return, Buyer must pre-pay return shipping costs and a minimum restocking charge of 65% of the invoice price, plus any charges necessary to rework goods into a re-saleable condition." },
      { title: 'CUSTOM PRODUCTS', body: "Prices for custom goods will be adjusted due to additional information Seller receives after providing its quote. Buyer shall pay for field modifications or factory reworking of custom goods, unless resulting from a deficiency in manufacturing. Custom goods require a deposit of twenty-five percent (25%) of the purchase price due at signing of a purchase order or quote. The remainder of the purchase price will be invoiced upon shipment of the goods." },
      { title: 'SERVICES', body: "Any advice, guidance, or instruction on the use of Seller's products is gratuitous and is not part of the Contract, and Buyer expressly acknowledges that Seller has no duty to provide such services. Seller can provide Buyer with technical support and/or can arrange for installation of goods, upon request, and such services shall be confirmed in a separate written agreement with Seller." },
      { title: 'WARRANTY', bullets: ["Subject to the terms, conditions, and limitations herein, Seller warrants, to the original Buyer only, that the goods will be free from defects in material and workmanship. Seller's exclusive obligation and liability under the contract is limited to repairing or replacing (at Seller's sole option), the goods at no cost to Buyer. The duration of this express warranty is (A) 12 months after startup/first use, or (B) 18 months after date of shipment from Seller's factory, whichever occurs first.", "Any repairs or alterations to the goods without the express, written consent of Seller voids the above warranty. Any excessive use or improper installation, operation, use, or maintenance (or failure to follow applicable instruction, product manuals and/or guidelines) voids the above warranty."] },
      { title: 'CONSEQUENTIAL DAMAGES', body: "Buyer and seller mutually waive all claims against each other for loss of use, loss of profits or any other direct or indirect incidental or consequential damages caused by the goods, any defect in the goods, or any claims for breach of contract, tort, or other legal claim relating to or arising from the parties' contract." },
      { title: 'LIMITATION OF LIABILITY', body: "In the event of any dispute between parties about the goods or the performance of seller, seller's maximum monetary liability to buyer, regardless of the legal theory claimed or the damage or loss asserted or incurred by buyer, shall be a refund of the amounts paid by buyer under the parties' contract." },
      { title: 'DELAYS, DAMAGE OR LOSS', body: "Seller is not responsible for and shall not be liable for delays in shipment of delivery of goods, detention thereof, loss or damage thereto, regardless of the cause (including, but not limited to, work stoppages, riots, terrorism or force majeure). Factory shipping dates given in advance of actual shipment are estimates and are not guarantees of such dates." },
      { title: 'INDEMNITY', body: "Seller does not represent that goods conform to any particular laws or standards, unless specifically acknowledged in writing by an officer of Seller. Buyer will indemnify, defend, and hold seller harmless from any claims by third parties arising from injury, property damages, economic loss, or other claims, that arise as a result of the manner of use or misapplication of the goods." },
      { title: 'SALES AND TAXES', body: "Unless otherwise indicated, prices are F.O.B. Seller's factory and do not include Federal, state or municipal sales, use, excise or similar taxes. Buyer bears all transportation risk, costs and insurance. If any such tax is stated on the invoice, Buyer will promptly remit same to Seller." },
      { title: 'PAYMENT', bullets: ['Orders between $0-$5,000: 0% with purchase order, 0% upon production start, 100% upon shipment F.O.B. Payment terms net 30 days from date of invoice.', 'Orders between $5,000-$500,000: 30% with purchase order, 40% upon production start, 30% upon shipment F.O.B. Payment terms net 30 days from date of invoice.', 'Orders >$500,000: 10% with purchase order, 60% upon production start, 30% upon shipment F.O.B. Payment terms net 30 days from date of invoice.', 'Also, the 1st and 2nd payments are required paid in full before shipment.'] },
      { title: 'CREDIT HOLD / F.O.B. PAYMENTS', body: "Seller may place Buyer on credit hold when any invoice has not been paid in full within 45 days after the invoice date. Seller may require payments in advance of delivery or C.O.D. All contracts are subject to approval of Seller's credit department." },
      { title: 'DELINQUENT PAYMENTS', body: "A service charge of one and one-half percent (1.5%) per month, simple interest, will be imposed on any unpaid balance of any invoice." },
      { title: 'LIEN', body: "Title shall remain the property of Seller until the entire purchase price is paid. Buyer agrees to permit Seller or its agents, during reasonable hours, to view and inspect all goods supplied pursuant to this Contract." },
      { title: 'SECURITY INTEREST', body: "Buyer hereby grants Seller a security interest in the goods until all of the payments are made and all of the conditions herein contained are fully satisfied." },
      { title: 'DEFAULT', body: "Buyer shall be in default if it fails to perform any of its obligations under this contract, or (i) if bankruptcy or insolvency proceedings are instituted by or against Buyer, (ii) if Buyer makes any assignment for the benefit of creditors, or (iii) if Buyer shall grant or permit any other lien or security interest on the goods." },
      { title: 'PATENT OR COPYRIGHT INFRINGEMENT', body: "If any goods are fabricated from patterns, plans, drawings, or specifications furnished by Buyer, Buyer shall indemnify and hold harmless Seller against all claims, losses, damages, and expenses (including legal fees) arising out of any suit or claim against Seller for infringement of any patent or copyright." },
    ];

    const companySettings = await settingsService.getCompanySettings(project.company_id);
    const logoAbsPath = settingsService.getLogoAbsolutePath(companySettings.logo);

    // --- FORMATTERS --------------------------------------------------
    const fmtCurrency = calc.fmtCurrency;
    const fmtDate = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    };
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const fmtDateLong = (date) => {
      if (!date) return '';
      const d = new Date(date);
      return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    };
    const todayStr  = fmtDate(new Date());
    const proposalDate  = new Date();
    const validThruDate = new Date();
    validThruDate.setDate(proposalDate.getDate() + (quotation.validity_days || 15));
    const proposalNo = project.quotation_number || `TPS-${new Date().getFullYear()}-${String(estimateId).padStart(4,'0')}`;
    const dateForFile = new Date().toISOString().slice(0,10);
    const safeProjectName = (project.project_name || 'Project').replace(/[^a-zA-Z0-9_\-]/g, '_');
    const safeProposalNo  = proposalNo.replace(/[^a-zA-Z0-9_\-]/g, '-');

    // Generate standardized filename using naming service
    const { generateDocumentName } = require('./documentNamingService');
    const { fileName: standardizedFilename } = await generateDocumentName({
      documentType: 'quotation',
      projectName: project.project_name,
      reference: proposalNo,
      projectId: estimate.project_id,
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve({
        buffer: Buffer.concat(chunks),
        filename: standardizedFilename,
        projectId: estimate.project_id
      }));
      doc.on('error', reject);

      const margin = 30;
      const pageW  = doc.page.width;   // 595.28
      const pageH  = doc.page.height;  // 841.89
      const cW     = pageW - 2 * margin;
      let y = margin;

      // -- colour & style constants (unified corporate palette) ------
      const C_TABLE_HEAD = COLORS.TABLE_HEAD;
      const C_GRAND_TOTAL= '#ffffff';  // white - grand total row
      const C_BORDER     = COLORS.BORDER;
      const C_TEXT_DARK  = COLORS.TEXT_DARK;
      const C_TEXT_MED   = COLORS.TEXT_MED;
      const C_TEXT_LIGHT = COLORS.TEXT_LIGHT;
      const C_SECTION_HDR= COLORS.SECTION_TITLE;
      const FOOTER_H     = 30;

      // -- drawCompanyHeader - delegates to global header utility ----
      const drawCompanyHeader = (title) => {
        y = drawGlobalHeader(doc, companySettings, title || null);
      };

      // -- drawSectionTitle -----------------------------------------
      const drawSectionTitle = (num, title) => {
        if (y + 26 > pageH - FOOTER_H - margin) { doc.addPage(); drawCompanyHeader(); }
        y += 12;   // gap above title
        doc.fontSize(11).font('Helvetica-Bold').fillColor(C_TEXT_DARK);
        doc.text(`${num}. ${title}`, margin, y);
        y += 18;   // gap below title
      };

      // -- drawTableRow ---------------------------------------------
      const drawTableRow = (cells, colWidths, rowH, opts = {}) => {
        const isHeader  = opts.isHeader  || false;
        const isBold    = opts.isBold    || false;
        const bgColor   = opts.bgColor   || null;
        const textColor = opts.textColor || C_TEXT_DARK;
        const fontSize  = opts.fontSize  || 8;

        if (bgColor) doc.rect(margin, y, cW, rowH).fill(bgColor);
        doc.lineWidth(0.5).rect(margin, y, cW, rowH).strokeColor(C_BORDER).stroke();

        let cx = margin;
        cells.forEach((cell, i) => {
          const align  = (Array.isArray(opts.align) ? opts.align[i] : opts.align) || 'left';
          const font   = (isHeader || isBold) ? 'Helvetica-Bold' : 'Helvetica';
          doc.fontSize(fontSize).font(font).fillColor(textColor);
          // Main text
          const mainText = cell.text !== undefined ? cell.text : String(cell);
          if (cell.sub) {
            doc.text(mainText, cx + 4, y + 4, { width: colWidths[i] - 8, align, lineBreak: true, height: rowH / 2 - 2 });
            // Sub-text (e.g. Drawing No) – smaller, grey
            doc.fontSize(fontSize - 1).font('Helvetica').fillColor('#6B7280');
            doc.text(cell.sub, cx + 4, y + rowH / 2 + 2, { width: colWidths[i] - 8, align: 'left', lineBreak: true, height: rowH / 2 - 4 });
            doc.fontSize(fontSize).fillColor(textColor);
          } else {
            doc.text(mainText, cx + 4, y + 4, { width: colWidths[i] - 8, align, lineBreak: true, height: rowH - 8 });
          }
          // Vertical divider
          if (i < cells.length - 1) {
            doc.lineWidth(0.3).moveTo(cx + colWidths[i], y).lineTo(cx + colWidths[i], y + rowH).strokeColor(C_BORDER).stroke();
          }
          cx += colWidths[i];
        });
        y += rowH;
      };

      // ---------------------------------------------------------------
      //  PAGE 1
      // ---------------------------------------------------------------
      drawCompanyHeader('Quotation');

      // -- PROPOSAL HEADER BOXES ------------------------------------
      const halfW   = cW / 2;
      const qi2     = project.quote_info || {};
      const clientName  = qi2.client_name || project.client?.client_name || '(Client Name)';
      const clientAddr  = project.client?.address || '';
      const pocName     = qi2.client_poc  || project.client?.poc_name    || '(Contact Person)';
      const pocEmail    = project.client?.poc_email    || `(client@email.com)`;
      const pocPhone    = qi2.client_poc_phone || project.client?.poc_phone || '(Phone)';
      const prepName    = qi2.seller_prepared_by || project.preparedBy?.name  || '(Preparer Name)';
      const prepPosition = project.preparedBy?.position || '';
      const prepEmail   = qi2.seller_email || project.preparedBy?.email || '(seller@email.com)';
      const prepPhone   = project.preparedBy?.phone || companySettings.phone || '(Phone)';
      const companyAddr = companySettings.address || '';

      // Box tops
      const boxY    = y;
      const hdrH    = 25;        // header label row height
      const bodyPad = 10;        // vertical padding
      const lineH   = 14;        // line height inside body
      const textW   = halfW - 26; // usable text width per column

      // Measure wrapped height of address fields to compute dynamic box height
      const measureTextH = (text, fontSize) => {
        if (!text) return 0;
        doc.fontSize(fontSize).font('Helvetica');
        return doc.heightOfString(text, { width: textW, lineBreak: true });
      };
      const leftAddrH  = clientAddr ? Math.max(measureTextH(clientAddr, 8) + 2, lineH) : lineH;
      const rightAddrH = companyAddr ? Math.max(measureTextH(companyAddr, 8) + 2, lineH) : lineH;
      const addrH = Math.max(leftAddrH, rightAddrH);
      const boxBodyH = bodyPad + 15 + addrH + lineH * 3 + bodyPad;  // name(15) + addr(dynamic) + poc + email + phone
      const boxH    = hdrH + boxBodyH;

      // Draw header row with dark navy fill
      doc.rect(margin, boxY, cW, hdrH).fill(COLORS.TABLE_HEAD);
      // Vertical divider and horizontal separator
      doc.lineWidth(0.75).moveTo(margin + halfW, boxY).lineTo(margin + halfW, boxY + boxH).strokeColor('#000000').stroke();
      doc.lineWidth(0.5).moveTo(margin, boxY + hdrH).lineTo(margin + cW, boxY + hdrH).strokeColor('#000000').stroke();

      // Header labels (white text on dark navy)
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('To',          margin + 13,         boxY + (hdrH - 9) / 2, { width: textW, lineBreak: false });
      doc.text('Prepared By', margin + halfW + 13, boxY + (hdrH - 9) / 2, { width: textW, lineBreak: false });

      // Left body - client info
      let lY = boxY + hdrH + bodyPad;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(C_TEXT_DARK);
      doc.text(clientName, margin + 13, lY, { width: textW, lineBreak: true }); lY += 15;
      doc.fontSize(8).font('Helvetica').fillColor(C_TEXT_DARK);
      if (clientAddr) { doc.text(clientAddr, margin + 13, lY, { width: textW, lineBreak: true }); } lY += addrH;
      doc.text(`POC:   ${pocName}${project.client?.position ? ' | ' + project.client.position : ''}`, margin + 13, lY, { width: textW, lineBreak: true }); lY += lineH;
      doc.text(`Email: ${pocEmail}`, margin + 13, lY, { width: textW, lineBreak: true }); lY += lineH;
      doc.text(`Phone: ${pocPhone}`, margin + 13, lY, { width: textW, lineBreak: false });

      // Right body - company info
      let rY = boxY + hdrH + bodyPad;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(C_TEXT_DARK);
      doc.text(companySettings.name || '', margin + halfW + 13, rY, { width: textW, lineBreak: true }); rY += 15;
      doc.fontSize(8).font('Helvetica').fillColor(C_TEXT_DARK);
      if (companyAddr) { doc.text(companyAddr, margin + halfW + 13, rY, { width: textW, lineBreak: true }); } rY += addrH;
      doc.text(`POC:   ${prepName}${prepPosition ? ' | ' + prepPosition : ''}`, margin + halfW + 13, rY, { width: textW, lineBreak: true }); rY += lineH;
      doc.text(`Email: ${prepEmail}`, margin + halfW + 13, rY, { width: textW, lineBreak: false }); rY += lineH;
      doc.text(`Phone: ${prepPhone}`, margin + halfW + 13, rY, { width: textW, lineBreak: false });

      y = boxY + boxH;  // no gap - proposal strip is part of the same table

      // -- PROPOSAL INFO STRIP --------------------------------------
      const infoStripH = 28;  // 10mm per row
      const qW = cW / 2;
      const infoRows = [
        [{ label: 'Proposal No : ', value: proposalNo }, { label: 'Proposal Date: ', value: todayStr }],
        [{ label: 'Revision: ', value: `R${estimate.revision ?? 0}` }, { label: 'Valid Thru : ', value: `${fmtDateLong(validThruDate)} (${quotation.validity_days || 15} days from abv. date)` }],
        [{ label: 'Project : ',     value: project.project_name || '' }, { label: 'Project ID : ', value: project.project_number}],
      ];
      // Fill strip with white
      doc.rect(margin, y, cW, infoStripH * infoRows.length).fill('#FFFFFF');
      // Separator line between To/Prepared By and Proposal Info sections
      doc.lineWidth(0.5).moveTo(margin, y).lineTo(margin + cW, y).strokeColor('#000000').stroke();
      for (let ri = 1; ri < infoRows.length; ri++) {
        doc.lineWidth(0.5).moveTo(margin, y + infoStripH * ri).lineTo(margin + cW, y + infoStripH * ri).strokeColor('#000000').stroke();
      }
      doc.lineWidth(0.5).moveTo(margin + qW, y).lineTo(margin + qW, y + infoStripH * infoRows.length).strokeColor('#000000').stroke();
      infoRows.forEach((row, ri) => {
        row.forEach((f, ci) => {
          if (!f.label && !f.value) return;
          const fx = margin + ci * qW + 13;
          const fy = y + ri * infoStripH + (infoStripH - 10) / 2;
          doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.ACCENT);
          doc.text(f.label, fx, fy, { continued: true, width: qW - 16, lineBreak: false });
          doc.font('Helvetica').fillColor(C_TEXT_DARK).text(f.value, { continued: false, lineBreak: false });
        });
      });
      // Single outer border covering both To/Prepared By and Proposal Info sections
      doc.lineWidth(0.75).rect(margin, boxY, cW, boxH + infoStripH * infoRows.length).strokeColor('#000000').stroke();
      y += infoStripH * infoRows.length + 5;  // compact gap to Summary title

      // ---------------------------------------------------------------
      //  SECTION 1: SUMMARY
      // ---------------------------------------------------------------
      // Section title
      if (y + 30 > pageH - FOOTER_H - margin) { doc.addPage(); drawCompanyHeader(); }
      y += 12;   // gap above title
      doc.fontSize(11).font('Helvetica-Bold').fillColor(C_TEXT_DARK);
      doc.text('1. Summary', margin, y);
      y += 18;   // gap below title

      // Check if any custom part has bulk variable pricing enabled
      const hasBulkPricing = customParts.some(p => p.bulk_order_variable_price && Array.isArray(p.pricing_tiers) && p.pricing_tiers.length > 0);

      // =====================================================================
      //  BULK MODE — grouped single-row per part
      //  Columns: S.No | Description | Quantity | Price/EA | Total Price
      //  Each part = ONE row. Tiers stacked inside the numeric cells with
      //  horizontal dividers between them (mini-table inside each cell).
      //  No Grand Total, no subtotal, no tax summary.
      // =====================================================================
      if (hasBulkPricing) {
        const B_COL = [40, 0, 65, 82, 105];
        B_COL[1] = cW - B_COL[0] - B_COL[2] - B_COL[3] - B_COL[4];
        const B_HDR   = ['S.No', 'Description', 'Quantity', 'Price/EA', 'Total Price'];
        const B_ALIGN = ['center', 'left', 'right', 'right', 'right'];
        const B_HDR_H = 28;
        const TIER_LINE_H = 22;  // height of each stacked tier line inside a cell

        // Draw bulk header row
        const drawBulkHeader = () => {
          doc.rect(margin, y, cW, B_HDR_H).fill(COLORS.TABLE_HEAD);
          doc.lineWidth(0.75).rect(margin, y, cW, B_HDR_H).strokeColor('#000000').stroke();
          let hx = margin;
          B_HDR.forEach((h, i) => {
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#ffffff');
            doc.text(h, hx + 4, y + (B_HDR_H - 8.5) / 2, { width: B_COL[i] - 8, align: B_ALIGN[i], lineBreak: false });
            if (i < B_HDR.length - 1)
              doc.lineWidth(0.4).moveTo(hx + B_COL[i], y).lineTo(hx + B_COL[i], y + B_HDR_H).strokeColor(COLORS.BORDER_MED).stroke();
            hx += B_COL[i];
          });
          y += B_HDR_H;
        };
        drawBulkHeader();

        // Page break helper
        const ensureBulkRowSpace = (rowH) => {
          if (y + rowH > pageH - FOOTER_H - margin - 20) {
            doc.addPage(); drawCompanyHeader();
            doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE);
            doc.text('1.  Summary (continued)', margin, y);
            y += 20;
            drawBulkHeader();
          }
        };

        // Build part description helper
        const buildBulkPartDesc = (part) => {
          const { description } = calc.buildDescription({
            job_description: part.job_description || '',
            part_name: part.part_name || '',
            material: part.material || part.material_category || '',
            material_grade: part.material_grade || '',
            condition: part.condition || '',
            drawing_part_no: part.drawing_part_no || '',
            drawing_revision: part.drawing_revision || '',
          });
          return description;
        };

        // Draw a grouped part row: one row with stacked tier lines inside numeric cells
        const drawGroupedPartRow = (sno, descText, drawNo, tiers, rowIdx) => {
          const tierCount = tiers.length;
          const descW = B_COL[1] - 16;

          // Calculate description height
          let descH = 0;
          doc.fontSize(8.5).font('Helvetica');
          if (descText) descH = doc.heightOfString(descText, { width: descW });
          let drawNoH = 0;
          if (drawNo) {
            doc.fontSize(7).font('Helvetica');
            drawNoH = doc.heightOfString(`Drawing No: ${drawNo}`, { width: descW });
          }
          const descTotalH = descH + (drawNo ? drawNoH + 2 : 0) + 8;

          // Row height = max of (description height, stacked tiers height)
          const tiersH = tierCount * TIER_LINE_H;
          const rowH = Math.max(descTotalH, tiersH);

          ensureBulkRowSpace(rowH);

          const rowY = y;
          // Row background
          const rowBg = rowIdx % 2 === 0 ? '#ffffff' : COLORS.ROW_ALT;
          doc.rect(margin, rowY, cW, rowH).fill(rowBg);

          // Outer row border
          doc.lineWidth(0.5).rect(margin, rowY, cW, rowH).strokeColor(C_BORDER).stroke();

          // Vertical column dividers (full height of row)
          let dx = margin;
          for (let ci = 0; ci < B_COL.length - 1; ci++) {
            dx += B_COL[ci];
            doc.lineWidth(0.3).moveTo(dx, rowY).lineTo(dx, rowY + rowH).strokeColor(COLORS.BORDER_LIGHT).stroke();
          }

          // S.No — vertically centered in full row
          const snoMidY = rowY + (rowH - 9) / 2;
          doc.fontSize(8.5).font('Helvetica').fillColor(C_TEXT_DARK);
          doc.text(String(sno), margin + 2, snoMidY, { width: B_COL[0] - 4, align: 'center', lineBreak: false });

          // Description — vertically centered in full row
          const descX = margin + B_COL[0];
          const descStartY = rowY + Math.max(4, (rowH - descTotalH + 8) / 2);
          if (descText) {
            doc.fontSize(8.5).font('Helvetica').fillColor(C_TEXT_DARK);
            doc.text(descText, descX + 8, descStartY, { width: descW, lineBreak: true });
          }
          if (drawNo) {
            doc.fontSize(7).font('Helvetica').fillColor('#6B7280');
            doc.text(`Drawing No: ${drawNo}`, descX + 8, descStartY + descH + 2, { width: descW, lineBreak: true });
          }

          // Stacked tier lines inside Quantity, Price/EA, Total Price cells
          // Center the tier block vertically in the row
          const tierBlockStartY = rowY + (rowH - tiersH) / 2;

          tiers.forEach((tier, tIdx) => {
            const lineY = tierBlockStartY + tIdx * TIER_LINE_H;
            const lineMidY = lineY + (TIER_LINE_H - 8.5) / 2;
            let cx = margin + B_COL[0] + B_COL[1];

            doc.fontSize(8.5).font('Helvetica').fillColor(C_TEXT_DARK);
            // Quantity
            doc.text(String(tier.qty), cx + 4, lineMidY, { width: B_COL[2] - 8, align: 'right', lineBreak: false });
            cx += B_COL[2];
            // Price/EA
            doc.text(fmtCurrency(tier.unitPrice), cx + 6, lineMidY, { width: B_COL[3] - 12, align: 'right', lineBreak: false });
            cx += B_COL[3];
            // Total Price
            doc.text(fmtCurrency(tier.total), cx + 6, lineMidY, { width: B_COL[4] - 12, align: 'right', lineBreak: false });

            // Horizontal divider between tier lines (not after last one)
            if (tIdx < tierCount - 1) {
              const divY = lineY + TIER_LINE_H;
              const numStartX = margin + B_COL[0] + B_COL[1];
              const numEndX = margin + cW;
              doc.lineWidth(0.4).moveTo(numStartX, divY).lineTo(numEndX, divY).strokeColor(COLORS.BORDER_LIGHT).stroke();
            }
          });

          y = rowY + rowH;
        };

        let bRowNum = 0;
        let bGlobalIdx = 0;

        // Render custom parts — each part = ONE grouped row
        customParts.forEach((part) => {
          const partDesc = buildBulkPartDesc(part);
          const drawNo = (part.drawing_part_no || '') + (part.drawing_revision ? ' - ' + part.drawing_revision : '');
          bRowNum++;

          if (part.bulk_order_variable_price && Array.isArray(part.pricing_tiers) && part.pricing_tiers.length > 0) {
            const tiers = part.pricing_tiers.map(t => ({
              qty: Number(t.quantity || 1),
              unitPrice: Number(t.unit_price || 0),
              total: Number(t.quantity || 1) * Number(t.unit_price || 0),
            }));
            drawGroupedPartRow(bRowNum, partDesc, drawNo, tiers, bGlobalIdx);
          } else {
            // Non-bulk part — single tier line
            const qty = Number(part.quantity || 1);
            const rawUP = Number(part.job_cost_per_unit || 0);
            const totalCost = Number(part.total_cost) || (qty * rawUP);
            const unitPrice = rawUP || (qty > 0 ? totalCost / qty : totalCost);
            drawGroupedPartRow(bRowNum, partDesc, drawNo, [{ qty, unitPrice, total: qty * unitPrice }], bGlobalIdx);
          }
          bGlobalIdx++;
        });

        // Process modules — each = one grouped row with single tier line
        const bulkModuleLabelSummary = (t) => ({
          cnc_turning: 'CNC Turning', cnc_milling: 'CNC Milling', welding: 'Welding',
          heat_treatment: 'Heat Treatment', grinding: 'Grinding', drilling: 'Drilling',
          boring: 'Boring', threading: 'Threading', surface_treatment: 'Surface Treatment',
          assembly: 'Assembly', testing: 'Testing & Inspection', other: 'Other',
        }[t] || t || '-');

        estimateItems.forEach((item) => {
          bRowNum++;
          const cost = Number(item.total_cost || 0);
          const inputs = item.input_json || {};
          const calcJson = item.calculated_json || {};
          const desc = inputs.job_name || inputs.description || calcJson.description || '';
          const processName = bulkModuleLabelSummary(item.module_type);
          const descText = desc ? processName + ' - ' + desc : processName;
          const qty = Number(inputs.quantity || 1);
          const unitPrice = qty > 0 ? cost / qty : cost;
          drawGroupedPartRow(bRowNum, descText, '', [{ qty, unitPrice, total: cost }], bGlobalIdx);
          bGlobalIdx++;
        });

        // NO Grand Total, NO subtotal, NO tax summary in bulk mode

      // =====================================================================
      //  NORMAL MODE — original structure preserved exactly
      //  Columns: # | Description | Unit Price | Quantity | Total Price
      // =====================================================================
      } else {

        const S_COL = [30, 0, 82, 65, 105];
        S_COL[1] = cW - S_COL[0] - S_COL[2] - S_COL[3] - S_COL[4];
        const S_HDR   = ['#', 'Description', 'Unit Price', 'Quantity', 'Total Price'];
        const S_ALIGN = ['center', 'left', 'right', 'center', 'right'];
        const S_HDR_H = 28;
        const DATA_ROW_H = 25;

        const drawHeaderCell = (text, x, width, align) => {
          let fontSize = 8.5;
          while (fontSize > 7 && doc.widthOfString(text, { font: 'Helvetica-Bold', size: fontSize }) > width) fontSize -= 0.5;
          doc.fontSize(fontSize).font('Helvetica-Bold').fillColor('#ffffff');
          doc.text(text, x, y + (S_HDR_H - fontSize) / 2, { width, align, lineBreak: false });
        };
        const drawSummaryHeader = () => {
          doc.rect(margin, y, cW, S_HDR_H).fill(COLORS.TABLE_HEAD);
          doc.lineWidth(0.75).rect(margin, y, cW, S_HDR_H).strokeColor('#000000').stroke();
          let hx = margin;
          S_HDR.forEach((h, i) => {
            drawHeaderCell(h, hx + 11, S_COL[i] - 22, S_ALIGN[i]);
            if (i < S_HDR.length - 1)
              doc.lineWidth(0.4).moveTo(hx + S_COL[i], y).lineTo(hx + S_COL[i], y + S_HDR_H).strokeColor(COLORS.BORDER_MED).stroke();
            hx += S_COL[i];
          });
          y += S_HDR_H;
        };
        drawSummaryHeader();

        // Build part description helper
        const buildPartDesc = (part) => {
          const { description, drawingDisplay } = calc.buildDescription({
            job_description: part.job_description || '',
            part_name: part.part_name || '',
            material: part.material || part.material_category || '',
            material_grade: part.material_grade || '',
            condition: part.condition || '',
            drawing_part_no: part.drawing_part_no || '',
            drawing_revision: part.drawing_revision || '',
          });
          return { description, drawingDisplay };
        };

        let summaryGroups = [];
        if (customParts.length > 0) {
          customParts.forEach(part => {
            const { description: desc } = buildPartDesc(part);
            const drawNo = (part.drawing_part_no || '') + (part.drawing_revision ? ' - ' + part.drawing_revision : '');
            summaryGroups.push({
              description: desc,
              drawing_no: drawNo,
              singleUnitPrice: Number(part.job_cost_per_unit || 0),
              singleQty: Number(part.quantity || 1),
            });
          });
        } else if (lineItems.length > 0) {
          lineItems.forEach(li => {
            summaryGroups.push({
              description: li.description || '',
              drawing_no: li.drawing_no || '',
              singleUnitPrice: Number(li.unit_price || 0),
              singleQty: Number(li.quantity || 1),
            });
          });
        } else {
          summaryGroups.push({
            description: project.project_name,
            drawing_no: '',
            singleUnitPrice: Number(estimate.final_price || 0),
            singleQty: Number(project.quantity || 1),
          });
        }

        let grandTotal = 0;
        let rowNum = 0;
        let globalRowIdx = 0;

        const ensureRowSpace = (rowH) => {
          if (y + rowH > pageH - FOOTER_H - margin - 20) {
            doc.addPage(); drawCompanyHeader();
            doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.SECTION_TITLE);
            doc.text('1.  Summary (continued)', margin, y);
            y += 20;
            drawSummaryHeader();
          }
        };

        const drawColDividers = (rowY, rowH) => {
          let dx = margin;
          for (let i = 0; i < S_COL.length - 1; i++) {
            dx += S_COL[i];
            doc.lineWidth(0.3).moveTo(dx, rowY).lineTo(dx, rowY + rowH).strokeColor(COLORS.BORDER_LIGHT).stroke();
          }
        };

        summaryGroups.forEach((group) => {
          rowNum++;
          const priceEA = group.singleUnitPrice * group.singleQty;
          grandTotal += priceEA;

          const descLine = group.description || '';
          const drawNo = group.drawing_no ? String(group.drawing_no).trim() : '';
          const descW = S_COL[1] - 22;
          let rowH = DATA_ROW_H;

          if (drawNo && descLine) {
            doc.fontSize(8.5).font('Helvetica');
            const descH = doc.heightOfString(descLine, { width: descW });
            doc.fontSize(7).font('Helvetica');
            const drawNoH = doc.heightOfString(`Drawing No: ${drawNo}`, { width: descW });
            rowH = Math.max(DATA_ROW_H, descH + drawNoH + 10);
          } else if (descLine) {
            doc.fontSize(8.5).font('Helvetica');
            const descH = doc.heightOfString(descLine, { width: descW });
            rowH = Math.max(DATA_ROW_H, descH + 8);
          }

          ensureRowSpace(rowH);
          const rowBg = globalRowIdx % 2 === 0 ? '#ffffff' : COLORS.ROW_ALT;
          doc.rect(margin, y, cW, rowH).fill(rowBg);
          doc.lineWidth(0.5).rect(margin, y, cW, rowH).strokeColor(C_BORDER).stroke();
          drawColDividers(y, rowH);
          const rowMid = y + (rowH - 9) / 2;
          let cxd = margin;

          doc.fontSize(8.5).font('Helvetica').fillColor(C_TEXT_DARK);
          doc.text(String(rowNum), cxd + 4, rowMid, { width: S_COL[0] - 8, align: 'center', lineBreak: false });
          cxd += S_COL[0];

          if (drawNo && descLine) {
            doc.fontSize(8.5).font('Helvetica').fillColor(C_TEXT_DARK);
            const descH = doc.heightOfString(descLine, { width: descW });
            doc.text(descLine, cxd + 11, y + 4, { width: descW, lineBreak: true });
            doc.fontSize(7).font('Helvetica').fillColor('#6B7280');
            doc.text(`Drawing No: ${drawNo}`, cxd + 11, y + 4 + descH + 2, { width: descW, lineBreak: true });
          } else if (descLine) {
            doc.fontSize(8.5).font('Helvetica').fillColor(C_TEXT_DARK);
            doc.text(descLine, cxd + 11, y + 4, { width: descW, lineBreak: true, height: rowH - 8 });
          }
          cxd += S_COL[1];

          doc.fontSize(8.5).font('Helvetica').fillColor(C_TEXT_DARK);
          doc.text(fmtCurrency(group.singleUnitPrice), cxd + 6, rowMid, { width: S_COL[2] - 12, align: 'right', lineBreak: false });
          cxd += S_COL[2];
          doc.text(String(group.singleQty), cxd + 4, rowMid, { width: S_COL[3] - 8, align: 'center', lineBreak: false });
          cxd += S_COL[3];
          doc.text(fmtCurrency(priceEA), cxd + 6, rowMid, { width: S_COL[4] - 12, align: 'right', lineBreak: false });

          y += rowH;
          globalRowIdx++;
        });

        // Process Jobs rows
        const moduleLabelSummary = (t) => ({
          cnc_turning: 'CNC Turning', cnc_milling: 'CNC Milling', welding: 'Welding',
          heat_treatment: 'Heat Treatment', grinding: 'Grinding', drilling: 'Drilling',
          boring: 'Boring', threading: 'Threading', surface_treatment: 'Surface Treatment',
          assembly: 'Assembly', testing: 'Testing & Inspection', other: 'Other',
        }[t] || t || '-');

        const PJ_ROW_H = 25;
        estimateItems.forEach((item) => {
          ensureRowSpace(PJ_ROW_H);

          const cost = Number(item.total_cost || 0);
          grandTotal += cost;
          const inputs = item.input_json || {};
          const calcJson = item.calculated_json || {};
          const desc = inputs.job_name || inputs.description || calcJson.description || '';
          const processName = moduleLabelSummary(item.module_type);
          const descText = desc ? processName + ' - ' + desc : processName;
          const qty = Number(inputs.quantity || 1);
          const unitPrice = qty > 0 ? cost / qty : cost;
          rowNum++;

          const rowBg = globalRowIdx % 2 === 0 ? '#ffffff' : COLORS.ROW_ALT;
          doc.rect(margin, y, cW, PJ_ROW_H).fill(rowBg);
          doc.lineWidth(0.5).rect(margin, y, cW, PJ_ROW_H).strokeColor(C_BORDER).stroke();
          drawColDividers(y, PJ_ROW_H);
          const pjMid = y + (PJ_ROW_H - 8) / 2;
          let cxp = margin;

          doc.fontSize(8.5).font('Helvetica').fillColor(C_TEXT_DARK);
          doc.text(String(rowNum), cxp + 4, pjMid, { width: S_COL[0] - 8, align: 'center', lineBreak: true, height: PJ_ROW_H - 8, ellipsis: false });
          cxp += S_COL[0];

          const rawDrawNo = inputs.drawing_part_no ? String(inputs.drawing_part_no).trim() : '';
          const drawNo = rawDrawNo + (inputs.drawing_revision ? ' - ' + inputs.drawing_revision : '');
          if (drawNo && descText) {
            doc.fontSize(8.5).font('Helvetica').fillColor(C_TEXT_DARK).text(descText, cxp + 11, y + 4, { width: S_COL[1] - 22, lineBreak: true, height: PJ_ROW_H / 2 - 2, ellipsis: false });
            doc.fontSize(7).font('Helvetica').fillColor('#6B7280').text(`Drawing No: ${drawNo}`, cxp + 11, y + PJ_ROW_H / 2 + 2, { width: S_COL[1] - 22, lineBreak: true, height: PJ_ROW_H / 2 - 4, ellipsis: false });
          } else {
            doc.text(descText, cxp + 11, y + 4, { width: S_COL[1] - 22, align: 'left', lineBreak: true, height: PJ_ROW_H - 8, ellipsis: false });
          }
          cxp += S_COL[1];

          doc.fontSize(8.5).font('Helvetica').fillColor(C_TEXT_DARK);
          doc.text(fmtCurrency(unitPrice), cxp + 6, pjMid, { width: S_COL[2] - 12, align: 'right', lineBreak: true, height: PJ_ROW_H - 8, ellipsis: false });
          cxp += S_COL[2];
          doc.text(String(qty), cxp + 4, pjMid, { width: S_COL[3] - 8, align: 'center', lineBreak: true, height: PJ_ROW_H - 8, ellipsis: false });
          cxp += S_COL[3];
          doc.text(fmtCurrency(cost), cxp + 6, pjMid, { width: S_COL[4] - 12, align: 'right', lineBreak: true, height: PJ_ROW_H - 8, ellipsis: false });

          y += PJ_ROW_H;
          globalRowIdx++;
        });

        // Grand Total row (normal mode only)
        const lastColIdx = S_COL.length - 1;
        const GT_H = 28;
        if (y + GT_H > pageH - FOOTER_H - margin - 20) { doc.addPage(); drawCompanyHeader(); }
        doc.rect(margin, y, cW, GT_H).fill(COLORS.GT_BG);
        doc.lineWidth(1).rect(margin, y, cW, GT_H).strokeColor(COLORS.GT_BORDER).stroke();
        doc.lineWidth(1.2).moveTo(margin, y).lineTo(margin + cW, y).strokeColor(COLORS.GT_BORDER).stroke();
        const gtLabelW = cW - S_COL[lastColIdx];
        doc.lineWidth(0.4).moveTo(margin + gtLabelW, y).lineTo(margin + gtLabelW, y + GT_H).strokeColor(COLORS.GT_BORDER).stroke();
        const gtMid = y + (GT_H - 9) / 2;
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(COLORS.TEXT_DARK);
        doc.text('Grand Total', margin + 11, gtMid, { width: gtLabelW - 22, align: 'right', lineBreak: false });
        doc.text(fmtCurrency(grandTotal), margin + gtLabelW + 6, gtMid, { width: S_COL[lastColIdx] - 12, align: 'right', lineBreak: false });
        y += GT_H;
      }

      let sectionNum = 2;

      // ---------------------------------------------------------------
      //  SECTION 2: BILL OF MATERIALS
      // ---------------------------------------------------------------
      if (bomItems.length > 0) {
        if (y + 60 > pageH - FOOTER_H - margin) { doc.addPage(); drawCompanyHeader(); }
        drawSectionTitle(String(sectionNum), 'Bill of Materials');
        const bomSectionNum = sectionNum;
        sectionNum++;

        doc.fontSize(8).font('Helvetica').fillColor(C_TEXT_LIGHT);
        doc.text('Consider this Bill of Materials to give input:', margin, y);
        y += 12;

        // How many items are there? We want one value column per line_item
        const numItems = Math.max(lineItems.length, 1);
        const fixedCols  = 3;            // Section, #, Parameter
        const secW  = 100;
        const numW  = 24;
        const itemW = Math.min(130, (cW - secW - numW) / numItems);
        const paramW = cW - secW - numW - itemW * numItems;
        const BOM_COLS  = [secW, numW, paramW > 40 ? paramW : cW - secW - numW - (itemW * numItems)];
        for (let n = 0; n < numItems; n++) BOM_COLS.push(itemW);

        const BOM_HDR = ['Section', '#', 'Parameter'];
        if (numItems === 1) {
          BOM_HDR.push('Value');
        } else {
          lineItems.forEach((li, n) => BOM_HDR.push(`Item ${n + 1}`));
        }

        const HDR_H = 24;

        // Header
        doc.rect(margin, y, cW, HDR_H).fill(C_TABLE_HEAD);
        doc.lineWidth(0.5).rect(margin, y, cW, HDR_H).strokeColor(C_BORDER).stroke();
        let bx = margin;
        BOM_HDR.forEach((h, i) => {
          doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
          doc.text(h, bx + 3, y + 6, { width: BOM_COLS[i] - 6, lineBreak: false });
          if (i < BOM_HDR.length - 1) doc.lineWidth(0.3).moveTo(bx + BOM_COLS[i], y).lineTo(bx + BOM_COLS[i], y + HDR_H).strokeColor(C_BORDER).stroke();
          bx += BOM_COLS[i];
        });
        y += HDR_H;

        const BOM_ROW_H = 20;
        let currentSection = '';
        let globalNum = 0;

        bomItems.forEach((item, idx) => {
          const isNewSection = item.section !== currentSection;
          if (isNewSection) currentSection = item.section;
          globalNum++;

          if (y + BOM_ROW_H > pageH - FOOTER_H - margin) {
            doc.addPage(); drawCompanyHeader();
            drawSectionTitle(String(bomSectionNum), 'Bill of Materials (continued)');
            doc.rect(margin, y, cW, HDR_H).fill(C_TABLE_HEAD);
            doc.lineWidth(0.5).rect(margin, y, cW, HDR_H).strokeColor(C_BORDER).stroke();
            let bxr = margin;
            BOM_HDR.forEach((h, i) => {
              doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
              doc.text(h, bxr + 3, y + 6, { width: BOM_COLS[i] - 6, lineBreak: false });
              if (i < BOM_HDR.length - 1) doc.lineWidth(0.3).moveTo(bxr + BOM_COLS[i], y).lineTo(bxr + BOM_COLS[i], y + HDR_H).strokeColor(C_BORDER).stroke();
              bxr += BOM_COLS[i];
            });
            y += HDR_H;
          }

          const bgFill = idx % 2 === 0 ? '#ffffff' : COLORS.ROW_ALT;
          doc.rect(margin, y, cW, BOM_ROW_H).fill(bgFill);
          doc.lineWidth(0.5).rect(margin, y, cW, BOM_ROW_H).strokeColor(C_BORDER).stroke();
          let brx = margin;

          // Section cell (show only on first row of section, bold)
          doc.fontSize(8).font(isNewSection ? 'Helvetica-Bold' : 'Helvetica').fillColor(C_TEXT_DARK);
          doc.text(isNewSection ? (item.section || '') : '', brx + 3, y + 4, { width: BOM_COLS[0] - 6, lineBreak: true, height: BOM_ROW_H - 8, ellipsis: false });
          doc.lineWidth(0.3).moveTo(brx + BOM_COLS[0], y).lineTo(brx + BOM_COLS[0], y + BOM_ROW_H).strokeColor(C_BORDER).stroke();
          brx += BOM_COLS[0];

          // Row number
          doc.font('Helvetica').text(String(globalNum), brx + 3, y + 6, { width: BOM_COLS[1] - 6, align: 'center', lineBreak: true, height: BOM_ROW_H - 10, ellipsis: false });
          doc.lineWidth(0.3).moveTo(brx + BOM_COLS[1], y).lineTo(brx + BOM_COLS[1], y + BOM_ROW_H).strokeColor(C_BORDER).stroke();
          brx += BOM_COLS[1];

          // Parameter
          doc.text(item.parameter || '', brx + 3, y + 4, { width: BOM_COLS[2] - 6, lineBreak: true, height: BOM_ROW_H - 8, ellipsis: false });
          doc.lineWidth(0.3).moveTo(brx + BOM_COLS[2], y).lineTo(brx + BOM_COLS[2], y + BOM_ROW_H).strokeColor(C_BORDER).stroke();
          brx += BOM_COLS[2];

          // Item value columns
          for (let n = 0; n < numItems; n++) {
            const val = n === 0 ? (item.item || item.value || '') : '';
            doc.text(val, brx + 3, y + 4, { width: BOM_COLS[3 + n] - 6, lineBreak: true, height: BOM_ROW_H - 8, ellipsis: false });
            if (n < numItems - 1) doc.lineWidth(0.3).moveTo(brx + BOM_COLS[3 + n], y).lineTo(brx + BOM_COLS[3 + n], y + BOM_ROW_H).strokeColor(C_BORDER).stroke();
            brx += BOM_COLS[3 + n];
          }
          y += BOM_ROW_H;
        });
        y += 8;
      }

      // ---------------------------------------------------------------
      //  PROJECT SCHEDULE & COMMERCIAL NOTES (only if user entered content)
      // ---------------------------------------------------------------
      const quotationNotes = (quotation.notes || '').trim();
      if (quotationNotes) {
        if (y + 60 > pageH - FOOTER_H - margin) { doc.addPage(); drawCompanyHeader(); }
        drawSectionTitle(String(sectionNum), 'Project Schedule & Commercial Notes');
        sectionNum++;

        const commercialNotes = quotationNotes.split('\n').filter(l => l.trim()).map(l => ({ text: l.trim() }));

        doc.fontSize(9).fillColor(C_TEXT_DARK);
        commercialNotes.forEach(note => {
          const textW = cW - 32;
          const fullText = note.text || '';
          const noteH = doc.heightOfString(fullText, { width: textW, fontSize: 9, lineGap: 1 }) + 2;
          if (y + noteH > pageH - FOOTER_H - margin) { doc.addPage(); drawCompanyHeader(); }

          // Render "Purchase Orders to be sent to:" line without bullet and with bold email
          const poMatch = fullText.match(/^Purchase Orders to be sent to:\s*(.*)$/i);
          if (poMatch) {
            doc.font('Helvetica').fontSize(9).fillColor(C_TEXT_DARK)
              .text('Purchase Orders to be sent to:  ', margin, y, { continued: true });
            doc.font('Helvetica-Bold').fillColor(C_TEXT_DARK).text(poMatch[1] || '', { continued: false });
          } else {
            doc.font('Helvetica').fontSize(9).fillColor(C_TEXT_DARK).text('\u2022', margin + 17, y + 2, { width: 8, lineBreak: false });
            doc.font('Helvetica').fontSize(9).fillColor(C_TEXT_DARK).text(note.text || '', margin + 32, y, { width: textW, lineGap: 1 });
          }
          y += noteH;
        });

        y += 2;
      }

      // ---------------------------------------------------------------
      //  TERMS AND CONDITIONS (only if include_terms is enabled)
      // ---------------------------------------------------------------
      const includeTerms = quotation.include_terms === true;
      const savedTermsText = (quotation.terms_conditions || '').trim();

      if (includeTerms) {
        doc.addPage(); drawCompanyHeader();
        drawSectionTitle(String(sectionNum), 'Terms And Conditions of Sale');
        sectionNum++;
        y += 22; // increased space before first clause heading

        const tcToRender = savedTermsText ? null : termsAndConditions;

        if (savedTermsText) {
          // Render saved free-text T&C
          const sectionHeaderRe = /^\d+\.\s+[A-Z]/;
          const tcLines = savedTermsText.split('\n');
          tcLines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) { y += 5; return; }
            const isHdr = sectionHeaderRe.test(trimmed);
            const lh = doc.heightOfString(trimmed, { width: cW - (isHdr ? 0 : 12), fontSize: isHdr ? 9 : 8 });
            if (y + lh > pageH - FOOTER_H - margin) { doc.addPage(); drawCompanyHeader(); }
            doc.fontSize(isHdr ? 9 : 8)
               .font(isHdr ? 'Helvetica-Bold' : 'Helvetica')
               .fillColor(isHdr ? C_TEXT_DARK : C_TEXT_MED);
            doc.text(trimmed, margin + (isHdr ? 0 : 12), y, { width: cW - (isHdr ? 0 : 12), align: isHdr ? 'left' : 'justify' });
            y += lh + (isHdr ? 5 : 3);
          });
        } else {
          // Render built-in T&C
          termsAndConditions.forEach((tc, tcIdx) => {
            if (y + 40 > pageH - FOOTER_H - margin) { doc.addPage(); drawCompanyHeader(); }

            // Clause title
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor(C_TEXT_DARK);
            const titleText = `${tcIdx + 1}. ${tc.title}`;
            const titleH = doc.heightOfString(titleText, { width: cW });
            doc.text(titleText, margin, y, { width: cW });
            y += titleH + 3;

            // Clause body
            if (tc.body) {
              const bodyH = doc.heightOfString(tc.body, { width: cW - 14, fontSize: 8 });
              if (y + bodyH > pageH - FOOTER_H - margin) { doc.addPage(); drawCompanyHeader(); }
              doc.fontSize(8).font('Helvetica').fillColor(C_TEXT_MED);
              doc.text(tc.body, margin + 14, y, { width: cW - 14, align: 'justify' });
              y += bodyH + 5;
            }

            if (tc.bullets) {
              tc.bullets.forEach(bullet => {
                const bH = doc.heightOfString(bullet, { width: cW - 26, fontSize: 8 });
                if (y + bH > pageH - FOOTER_H - margin) { doc.addPage(); drawCompanyHeader(); }
                doc.fontSize(8).font('Helvetica').fillColor(C_SECTION_HDR).text('\u25B8', margin + 14, y + 1, { width: 10, lineBreak: false });
                doc.fillColor(C_TEXT_MED).text(bullet, margin + 26, y, { width: cW - 26, align: 'justify' });
                y += bH + 4;
              });
            }

            y += 3; // spacing between clauses
          });
        }
      }

      // ---------------------------------------------------------------
      //  FOOTER: Page X of Y on every page
      // ---------------------------------------------------------------
      drawGlobalFooter(doc, companySettings);

      doc.end();
    });
  }

  async sendQuotationToClient(estimateId, requestingUser = null) {
    const estimate = await Estimate.findByPk(estimateId);
    if (!estimate) {
      throw new Error('Estimate not found');
    }

    if (!estimate.is_approved) {
      throw new Error('Estimate must be approved before sending quotation');
    }

    const project = await Project.findByPk(estimate.project_id, {
      include: ['client', 'preparedBy']
    });
    if (!project) {
      throw new Error('Project not found');
    }

    const clientEmail = (project.client?.poc_email || '').trim();
    if (!clientEmail) {
      throw new Error('Email ID not available');
    }
    if (!isValidEmail(clientEmail)) {
      throw new Error('Invalid email format');
    }

    const { buffer, filename } = await this.generateQuotationPdf(estimateId);
    const quotationNumber = project.quotation_number || `Quotation-${project.id}`;
    const clientName = project.client?.poc_name || project.client?.client_name || 'Client';
    const senderName = project.preparedBy?.name || requestingUser?.name || 'Forge i-DAS';
    const projectName = project.project_name || '';

    const emailResult = await sendEmail({
      to: clientEmail,
      subject: `Quotation ${quotationNumber}${projectName ? ` | ${projectName}` : ''}`,
      text: [
        `Dear ${clientName},`,
        '',
        `Please find attached Quotation ${quotationNumber}${projectName ? ` for project ${projectName}` : ''}.`,
        '',
        'Please review the attached quotation and let us know if you need any clarification.',
        '',
        'Regards,',
        senderName,
      ].join('\n'),
      attachments: [{ filename, content: buffer }],
    });

    if (!emailResult.success) {
      auditLogService.log({
        action: 'quotation_email_failed',
        entity_type: 'estimate',
        entity_id: estimate.id,
        entity_name: quotationNumber,
        performed_by: requestingUser?.id,
        performer_name: requestingUser?.name,
        performer_role: requestingUser?.role,
        details: { recipient: clientEmail, reason: emailResult.error || 'UNKNOWN_ERROR', project_id: project.id },
        company_id: requestingUser?.company_id
      });

      if (emailResult.error === 'SMTP_NOT_CONFIGURED') {
        throw new Error('Email service is not configured');
      }
      throw new Error('Failed to send quotation email');
    }

    await Project.update(
      { status: 'quoted' },
      { where: { id: estimate.project_id } }
    );

    const quotation = {
      ...(estimate.quotation || {}),
      sent_at: new Date(),
      sent_to_client: true,
      last_email_status: 'success',
      last_email_to: clientEmail,
      last_email_message_id: emailResult.messageId || null,
    };

    await estimate.update({ quotation });

    auditLogService.log({
      action: 'quotation_email_sent',
      entity_type: 'estimate',
      entity_id: estimate.id,
      entity_name: quotationNumber,
      performed_by: requestingUser?.id,
      performer_name: requestingUser?.name,
      performer_role: requestingUser?.role,
      details: { recipient: clientEmail, project_id: project.id, messageId: emailResult.messageId || null },
      company_id: requestingUser?.company_id
    });

    return { message: 'Quotation sent to client', status: 'quoted', emailSent: true };
  }

  /**
   * Sync drawing files from custom_parts to the Documents table.
   *
   * Two responsibilities:
   *  1. Auto-attach Part Master drawings into project Documents whenever a
   *     custom_part references a Parts Master record (parts_master_id). This
   *     creates a Document row pointing to the Part Master's existing R2 key
   *     (no file copy / no re-upload) so the Documents tab can display it.
   *  2. Backfill Document rows for legacy drawing_file_name values that point
   *     at locally-stored files (dev fallback).
   *
   * Mutates customParts: when a Part Master drawing is auto-attached, the
   * matching part's drawing_file_name is updated to "fileName|docId" so the
   * UI shows the correct file and a download link. The caller MUST persist
   * the updated array back to the estimate.
   */
  async _syncDrawingsToDocuments(projectId, customParts) {
    if (!Array.isArray(customParts) || customParts.length === 0) return false;

    const { Document, Part } = require('../models');
    const path = require('path');
    const fsSync = require('fs');

    const UPLOADS_ROOT = process.env.UPLOAD_PATH
      ? path.resolve(process.env.UPLOAD_PATH)
      : path.join(__dirname, '..', '..', 'uploads');

    const project = await Project.findByPk(projectId, { attributes: ['company_id'] });
    const companyId = project?.company_id || null;

    // Existing drawing documents for this project
    const existingDocs = await Document.findAll({
      where: { project_id: projectId, document_type: 'drawing' },
      attributes: ['id', 'file_name', 'r2_url', 'file_path', 'part_id'],
    });
    const existingDocIds = new Set(existingDocs.map(d => d.id));
    const existingDocNames = new Set(existingDocs.map(d => d.file_name));
    // r2_url -> doc lookup so we can dedupe by R2 key (most reliable)
    const docByR2 = new Map();
    for (const d of existingDocs) {
      if (d.r2_url) docByR2.set(d.r2_url, d);
    }

    let mutated = false;

    for (const part of customParts) {
      // ── (1) Auto-attach Part Master drawing ──────────────────────
      // Triggers whenever the custom_part references a Parts Master record,
      // regardless of whether drawing_file_name is set on the custom_part.
      if (part.parts_master_id) {
        try {
          const pm = await Part.findByPk(part.parts_master_id, {
            attributes: ['id', 'drawing_url'],
          });
          if (pm && pm.drawing_url) {
            const r2Key = pm.drawing_url;
            const fileName = (r2Key.split('/').pop() || 'drawing.pdf');

            let doc = docByR2.get(r2Key);
            if (!doc) {
              try {
                doc = await Document.create({
                  project_id: projectId,
                  module_type: 'project',
                  reference_id: projectId,
                  part_id: pm.id,
                  document_type: 'drawing',
                  workflow_stage: 'estimation/drawings',
                  version: 1,
                  // Store the R2 key in file_path too — fileManagerService falls back
                  // to file_path when r2_url is not set, and the downloader checks
                  // r2_url first so this is fully R2-native.
                  file_path: r2Key,
                  file_name: fileName,
                  size: 0,
                  description: `Drawing: ${fileName}`,
                  status: 'final',
                  file_type: 'uploaded',
                  generated_by: null,
                  generated_at: new Date(),
                  company_id: companyId,
                  r2_url: r2Key,
                });
                docByR2.set(r2Key, doc);
                existingDocIds.add(doc.id);
                existingDocNames.add(fileName);
              } catch (createErr) {
                console.warn('[EstimateService] Auto-attach Part Master drawing Document.create failed:', createErr.message);
              }
            }

            if (doc) {
              const desiredEntry = `${fileName}|${doc.id}`;
              const currentEntries = (part.drawing_file_name || '')
                .split(',').map(s => s.trim()).filter(Boolean);
              const alreadyHas = currentEntries.some((e) => {
                const pipeIdx = e.indexOf('|');
                const eDocId = pipeIdx >= 0 ? e.substring(pipeIdx + 1) : null;
                return eDocId === doc.id;
              });
              if (!alreadyHas) {
                // Replace any stale legacy entry for the same filename, otherwise append
                const filtered = currentEntries.filter((e) => {
                  const pipeIdx = e.indexOf('|');
                  const ePure = pipeIdx >= 0 ? e.substring(0, pipeIdx) : e;
                  return ePure !== fileName;
                });
                filtered.push(desiredEntry);
                part.drawing_file_name = filtered.join(',');
                mutated = true;
              }
            }
          }
        } catch (pmErr) {
          console.warn('[EstimateService] Part Master drawing lookup failed:', pmErr.message);
        }
      }

      // ── (2) Legacy local-disk backfill for drawing_file_name entries
      if (!part.drawing_file_name) continue;

      const entries = part.drawing_file_name.split(',').map(s => s.trim()).filter(Boolean);
      for (const entry of entries) {
        const pipeIdx = entry.indexOf('|');
        const pureName = pipeIdx >= 0 ? entry.substring(0, pipeIdx) : entry;
        const docId = pipeIdx >= 0 ? entry.substring(pipeIdx + 1) : null;

        if (docId && existingDocIds.has(docId)) continue;
        if (existingDocNames.has(pureName)) continue;

        // Try local disk only (R2-stored part drawings are handled in step 1)
        let filePath = null;
        const searchDirs = [
          path.join(UPLOADS_ROOT, 'documents'),
          path.join(UPLOADS_ROOT, 'documents', projectId),
        ];
        for (const dir of searchDirs) {
          try {
            const files = fsSync.readdirSync(dir);
            const match = files.find(f => f.endsWith('-' + pureName) || f === pureName);
            if (match) {
              filePath = path.relative(UPLOADS_ROOT, path.join(dir, match)).replace(/\\/g, '/');
              break;
            }
          } catch (_) { /* dir doesn't exist */ }
        }

        if (filePath) {
          let fileSize = 0;
          try {
            fileSize = fsSync.statSync(path.join(UPLOADS_ROOT, filePath)).size || 0;
          } catch (_) { /* ignore */ }

          try {
            await Document.create({
              project_id: projectId,
              module_type: 'project',
              reference_id: projectId,
              document_type: 'drawing',
              workflow_stage: 'estimation/drawings',
              version: 1,
              file_path: filePath,
              file_name: pureName,
              size: fileSize,
              description: `Drawing: ${pureName}`,
              status: 'final',
              file_type: 'uploaded',
              generated_by: null,
              generated_at: new Date(),
              company_id: companyId,
            });
            existingDocNames.add(pureName);
          } catch (_) { /* skip duplicates */ }
        }
      }
    }

    return mutated;
  }
}

module.exports = new EstimateService();
