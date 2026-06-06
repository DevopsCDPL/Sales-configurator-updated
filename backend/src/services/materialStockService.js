const { Op } = require('sequelize');
const {
  MaterialStock,
  MaterialTransaction,
  Material,
  Vendor,
  Project,
  User,
  Company,
  sequelize,
} = require('../models');

class MaterialStockService {
  // ── Stock queries ─────────────────────────────────────────────────────

  async getAllStock(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;

    return MaterialStock.findAll({
      where,
      include: [
        { model: Material, as: 'material', attributes: ['id', 'material_name', 'category', 'unit'] },
      ],
      order: [['last_updated', 'DESC']],
    });
  }

  async getStockByMaterialId(materialId) {
    return MaterialStock.findOne({ where: { material_id: materialId } });
  }

  async upsertStock(data, user) {
    const { material_id, current_quantity, unit } = data;
    if (!material_id) throw new Error('material_id is required');

    const [stock] = await MaterialStock.upsert(
      {
        material_id,
        current_quantity: current_quantity ?? 0,
        unit: unit || 'Kg',
        company_id: user?.company_id || data.company_id || null,
        last_updated: new Date(),
      },
      {
        conflictFields: ['material_id'],
        returning: true,
      }
    );

    return stock;
  }

  // ── Transaction queries ───────────────────────────────────────────────

  async getAllTransactions(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;
    if (query.material_id) where.material_id = query.material_id;
    if (query.type) where.type = query.type;
    if (query.heat_number) where.heat_number = { [Op.iLike]: `%${query.heat_number}%` };

    return MaterialTransaction.findAll({
      where,
      include: [
        { model: Material, as: 'material', attributes: ['id', 'material_name', 'category', 'unit'] },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'] },
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });
  }

  async createTransaction(data, user) {
    const {
      material_id,
      type,
      direction,
      quantity,
      unit,
      heat_number,
      vendor_id,
      project_id,
      reference_type,
      reference_id,
      remarks,
    } = data;

    if (!material_id) throw new Error('material_id is required');
    if (!type || !['IN', 'OUT', 'ADJUSTMENT'].includes(type)) {
      throw new Error('type must be IN, OUT, or ADJUSTMENT');
    }
    if (!quantity || Number(quantity) <= 0) throw new Error('quantity must be greater than 0');

    const tx = await MaterialTransaction.create({
      material_id,
      type,
      direction: direction || null,
      quantity,
      unit: unit || 'Kg',
      heat_number: heat_number || null,
      vendor_id: vendor_id || null,
      project_id: project_id || null,
      reference_type: reference_type || null,
      reference_id: reference_id || null,
      remarks: remarks || null,
      company_id: user?.company_id || data.company_id || null,
      created_by: user?.id || null,
    });

    return tx;
  }
}

module.exports = new MaterialStockService();
