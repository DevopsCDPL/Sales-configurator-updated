const { Op } = require('sequelize');
const { sequelize, User, Client, Vendor, Project, Company, MgmtProcurementRFQ, MgmtProcurementPO, ConfiguratorComponent } = require('../models');
const auditLogService = require('./auditLogService');

const MODEL_MAP = {
  users: { model: User, nameField: 'name', label: 'Users' },
  clients: { model: Client, nameField: 'client_name', label: 'Clients' },
  vendors: { model: Vendor, nameField: 'vendor_name', label: 'Vendors' },
  projects: { model: Project, nameField: 'project_name', label: 'Projects' },
  companies: { model: Company, nameField: 'name', label: 'Companies' },
  procurement_rfqs: { model: MgmtProcurementRFQ, nameField: 'rfq_number', label: 'RFQs', group: 'procurement' },
  procurement_pos: { model: MgmtProcurementPO, nameField: 'po_number', label: 'Purchase Orders', group: 'procurement' },
  configurator_components: { model: ConfiguratorComponent, nameField: 'name', label: 'Components' },
};

class RecycleBinService {
  /**
   * List all soft-deleted records, optionally filtered by module and search.
   */
  async list({ module, search, page = 1, limit = 50, requestingUser }) {
    const results = {};
    let modules;
    if (!module) {
      modules = Object.keys(MODEL_MAP);
    } else if (module === 'procurement') {
      modules = Object.keys(MODEL_MAP).filter(k => MODEL_MAP[k].group === 'procurement');
    } else {
      modules = [module];
    }

    for (const mod of modules) {
      const cfg = MODEL_MAP[mod];
      if (!cfg) continue;

      const where = { deleted_at: { [Op.ne]: null } };

      // Company scoping for admins
      if (requestingUser.role === 'admin' && cfg.model.rawAttributes.company_id) {
        where.company_id = requestingUser.company_id;
      }

      if (search) {
        where[cfg.nameField] = { [Op.iLike]: `%${search}%` };
      }

      const { count, rows } = await cfg.model.findAndCountAll({
        where,
        order: [['deleted_at', 'DESC']],
        limit,
        offset: (page - 1) * limit,
        paranoid: false,
      });

      // Enrich with deleter info
      const items = await Promise.all(rows.map(async (row) => {
        const plain = row.toJSON();
        let deletedByName = null;
        if (plain.deleted_by) {
          const deleter = await User.findByPk(plain.deleted_by, { attributes: ['name', 'email'] });
          deletedByName = deleter ? deleter.name : 'Unknown';
        }
        return {
          ...plain,
          _module: mod,
          _label: cfg.label,
          _displayName: plain[cfg.nameField] || plain.email || plain.id,
          _deletedByName: deletedByName,
        };
      }));

      results[mod] = { items, total: count };
    }

    return results;
  }

  /**
   * Restore a soft-deleted record.
   */
  async restore(module, id, requestingUser) {
    const cfg = MODEL_MAP[module];
    if (!cfg) throw new Error(`Unknown module: ${module}`);

    const record = await cfg.model.findOne({
      where: { id, deleted_at: { [Op.ne]: null } },
      paranoid: false,
    });
    if (!record) throw new Error('Deleted record not found');

    // Company scoping
    if (requestingUser.role === 'admin' && record.company_id && record.company_id !== requestingUser.company_id) {
      throw new Error('You can only restore records in your own company');
    }

    const updateFields = { deleted_at: null, deleted_by: null };
    // Only set is_active for models that have it
    if (cfg.model.rawAttributes.is_active) {
      updateFields.is_active = true;
    }
    await record.update(updateFields);

    auditLogService.log({
      action: 'record_restored',
      entity_type: module,
      entity_id: id,
      entity_name: record[cfg.nameField] || record.email || id,
      performed_by: requestingUser.id,
      performer_name: requestingUser.name,
      performer_role: requestingUser.role,
      details: { module },
      company_id: record.company_id || requestingUser.company_id,
    });

    return { message: `${cfg.label.slice(0, -1)} restored successfully` };
  }

  /**
   * Permanently delete a record from the recycle bin.
   */
  async permanentDelete(module, id, requestingUser) {
    const cfg = MODEL_MAP[module];
    if (!cfg) throw new Error(`Unknown module: ${module}`);

    const record = await cfg.model.findOne({
      where: { id, deleted_at: { [Op.ne]: null } },
      paranoid: false,
    });
    if (!record) throw new Error('Deleted record not found');

    // Only main_admin can permanently delete
    if (requestingUser.role !== 'main_admin') {
      throw new Error('Only Super Admin can permanently delete records');
    }

    const entityName = record[cfg.nameField] || record.email || id;

    const t = await sequelize.transaction();
    try {
      // For modules with cascading children, clean them up
      if (module === 'projects') {
        await this._cascadeDeleteProject(id, t);
      } else if (module === 'clients') {
        await this._cascadeDeleteClient(id, t);
      } else if (module === 'vendors') {
        await this._cascadeDeleteVendor(id, t);
      } else if (module === 'procurement_rfqs') {
        await this._cascadeDeleteProcurementRFQ(id, t);
      }

      await record.destroy({ force: true, transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw new Error('Failed to permanently delete: ' + err.message);
    }

    auditLogService.log({
      action: 'record_permanently_deleted',
      entity_type: module,
      entity_id: id,
      entity_name: entityName,
      performed_by: requestingUser.id,
      performer_name: requestingUser.name,
      performer_role: requestingUser.role,
      details: { module },
      company_id: record.company_id || requestingUser.company_id,
    });

    return { message: `${cfg.label.slice(0, -1)} permanently deleted` };
  }

  async _cascadeDeleteProject(id, t) {
    const { VendorPurchaseOrder, VendorPOItem, RFQBundle, RFQBundleItem,
            VendorPO, VendorRFQ, Invoice, ProjectAnalytics,
            Estimate, EstimateItem, Document, QualityRecord,
            WorkOrder, SalesOrder } = require('../models');

    const vpos = await VendorPurchaseOrder.findAll({ where: { project_id: id }, attributes: ['id'], transaction: t });
    if (vpos.length) await VendorPOItem.destroy({ where: { vendor_po_id: vpos.map(v => v.id) }, transaction: t });
    await VendorPurchaseOrder.destroy({ where: { project_id: id }, transaction: t });

    const bundles = await RFQBundle.findAll({ where: { project_id: id }, attributes: ['id'], transaction: t });
    if (bundles.length) await RFQBundleItem.destroy({ where: { rfq_bundle_id: bundles.map(b => b.id) }, transaction: t });
    await RFQBundle.destroy({ where: { project_id: id }, transaction: t });

    await VendorPO.destroy({ where: { project_id: id }, transaction: t });
    await VendorRFQ.destroy({ where: { project_id: id }, transaction: t });
    await Invoice.destroy({ where: { project_id: id }, transaction: t });
    await ProjectAnalytics.destroy({ where: { project_id: id }, transaction: t });

    const estimates = await Estimate.findAll({ where: { project_id: id }, attributes: ['id'], transaction: t });
    if (estimates.length) await EstimateItem.destroy({ where: { estimate_id: estimates.map(e => e.id) }, transaction: t });
    await Estimate.destroy({ where: { project_id: id }, transaction: t });

    await Document.destroy({ where: { project_id: id }, transaction: t });
    await QualityRecord.destroy({ where: { project_id: id }, transaction: t });
    await WorkOrder.destroy({ where: { project_id: id }, transaction: t });
    await SalesOrder.destroy({ where: { project_id: id }, transaction: t });
  }

  async _cascadeDeleteClient(id, t) {
    const { Project } = require('../models');
    const projects = await Project.findAll({ where: { client_id: id }, attributes: ['id'], transaction: t });
    for (const p of projects) {
      await this._cascadeDeleteProject(p.id, t);
    }
    await Project.destroy({ where: { client_id: id }, transaction: t });
  }

  async _cascadeDeleteVendor(id, t) {
    const { VendorPurchaseOrder, VendorPOItem, RFQBundle, RFQBundleItem,
            VendorPO, VendorRFQ, VendorMaterial } = require('../models');

    const vpos = await VendorPurchaseOrder.findAll({ where: { vendor_id: id }, attributes: ['id'], transaction: t });
    if (vpos.length) await VendorPOItem.destroy({ where: { vendor_po_id: vpos.map(v => v.id) }, transaction: t });
    await VendorPurchaseOrder.destroy({ where: { vendor_id: id }, transaction: t });

    const bundles = await RFQBundle.findAll({ where: { vendor_id: id }, attributes: ['id'], transaction: t });
    if (bundles.length) await RFQBundleItem.destroy({ where: { rfq_bundle_id: bundles.map(b => b.id) }, transaction: t });
    await RFQBundle.destroy({ where: { vendor_id: id }, transaction: t });

    await VendorPO.destroy({ where: { vendor_id: id }, transaction: t });
    await VendorRFQ.destroy({ where: { vendor_id: id }, transaction: t });
    await VendorMaterial.destroy({ where: { vendor_id: id }, transaction: t });
  }

  async _cascadeDeleteProcurementRFQ(id, t) {
    await MgmtProcurementPO.destroy({ where: { rfq_id: id }, force: true, transaction: t });
  }

  /**
   * Bulk restore soft-deleted records.
   */
  async bulkRestore(items, requestingUser) {
    const results = { restored: 0, failed: 0 };
    for (const { module, id } of items) {
      try {
        await this.restore(module, id, requestingUser);
        results.restored++;
      } catch {
        results.failed++;
      }
    }
    return { message: `${results.restored} item(s) restored`, ...results };
  }

  /**
   * Bulk permanently delete records from recycle bin.
   */
  async bulkPermanentDelete(items, requestingUser) {
    if (requestingUser.role !== 'main_admin') {
      throw new Error('Only Super Admin can permanently delete records');
    }
    const results = { deleted: 0, failed: 0 };
    for (const { module, id } of items) {
      try {
        await this.permanentDelete(module, id, requestingUser);
        results.deleted++;
      } catch {
        results.failed++;
      }
    }
    return { message: `${results.deleted} item(s) permanently deleted`, ...results };
  }
}

module.exports = new RecycleBinService();
