const { Op } = require('sequelize');
const { Stock, User, RawMaterial } = require('../models');
const documentNumberingService = require('./documentNumberingService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Pick & sanitize only the fields the Stock model accepts as user input.
 * Prevents stray req.body keys (id, created_at, etc.) and bad types from
 * poisoning Stock.create / bulkCreate.
 */
function sanitizeStockInput(data = {}) {
  const out = {};
  if (data.part_description != null) out.part_description = String(data.part_description).trim();
  if (data.material_grade != null) out.material_grade = String(data.material_grade).trim();
  if (data.condition != null) out.condition = String(data.condition).trim() || null;
  if (data.shape != null) out.shape = String(data.shape).trim() || null;
  if (data.dimension != null) out.dimension = String(data.dimension).trim() || null;
  if (data.heat_number != null) out.heat_number = String(data.heat_number).trim() || null;
  if (data.quantity != null && data.quantity !== '') {
    const q = Number(data.quantity);
    out.quantity = Number.isFinite(q) ? q : 0;
  }
  // Only accept raw_material_id if it looks like a valid UUID
  if (data.raw_material_id && typeof data.raw_material_id === 'string' && UUID_RE.test(data.raw_material_id.trim())) {
    out.raw_material_id = data.raw_material_id.trim();
  }
  return out;
}

/**
 * Auto-resolve raw_material_id from material_grade if not provided.
 * Matches case-insensitively on material_grade within the same company.
 */
async function resolveRawMaterialId(data, companyId) {
  if (data.raw_material_id) return data.raw_material_id;
  if (!data.material_grade) return null;
  const where = { material_grade: { [Op.iLike]: data.material_grade.trim() } };
  if (companyId) where.company_id = companyId;
  const rm = await RawMaterial.findOne({ where, attributes: ['id'] });
  return rm ? rm.id : null;
}

class StockService {
  async getAllStock(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;
    if (query.search) {
      where[Op.or] = [
        { part_description: { [Op.iLike]: `%${query.search}%` } },
        { material_grade: { [Op.iLike]: `%${query.search}%` } },
        { condition: { [Op.iLike]: `%${query.search}%` } },
        { heat_number: { [Op.iLike]: `%${query.search}%` } },
        { stock_id: { [Op.iLike]: `%${query.search}%` } },
      ];
    }
    const stocks = await Stock.findAll({
      where,
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'] },
        { model: RawMaterial, as: 'rawMaterial', attributes: ['id', 'material_id'], required: false },
      ],
      order: [['created_at', 'DESC']],
    });
    return stocks;
  }

  async getStockById(id) {
    const stock = await Stock.findByPk(id, {
      include: [{ model: User, as: 'creator', attributes: ['id', 'name'] }],
    });
    if (!stock) throw new Error('Stock item not found');
    return stock;
  }

  async createStock(data, user) {
    const clean = sanitizeStockInput(data);
    if (!clean.part_description) {
      throw new Error('part_description is required');
    }
    if (!clean.material_grade) {
      throw new Error('material_grade is required');
    }
    let stockId;
    try {
      stockId = await documentNumberingService.generateNumber('material_stock_entry_id', user.company_id);
    } catch (e) {
      console.warn('Failed to generate stock_id:', e.message);
    }
    // Auto-resolve raw_material_id if not explicitly provided (or invalid)
    const raw_material_id = await resolveRawMaterialId(clean, user.company_id);
    const stock = await Stock.create({
      ...clean,
      raw_material_id: clean.raw_material_id || raw_material_id || null,
      stock_id: stockId || null,
      company_id: user.company_id || null,
      created_by: user.id || null,
    });
    return stock;
  }

  async bulkCreateStock(items, user) {
    const records = [];
    for (const item of items) {
      const clean = sanitizeStockInput(item);
      if (!clean.part_description || !clean.material_grade) {
        throw new Error('Each item requires part_description and material_grade');
      }
      let stockId;
      try {
        stockId = await documentNumberingService.generateNumber('material_stock_entry_id', user.company_id);
      } catch (e) {
        console.warn('Failed to generate stock_id:', e.message);
      }
      const raw_material_id = await resolveRawMaterialId(clean, user.company_id);
      records.push({
        ...clean,
        raw_material_id: clean.raw_material_id || raw_material_id || null,
        stock_id: stockId || null,
        company_id: user.company_id || null,
        created_by: user.id || null,
      });
    }
    const stocks = await Stock.bulkCreate(records);
    return stocks;
  }

  async updateStock(id, data) {
    const stock = await Stock.findByPk(id);
    if (!stock) throw new Error('Stock item not found');
    await stock.update(data);
    return stock;
  }

  async deleteStock(id) {
    const stock = await Stock.findByPk(id);
    if (!stock) throw new Error('Stock item not found');
    await stock.destroy();
    return { message: 'Stock item deleted' };
  }

  /**
   * Add quantity back to stock when materials are unused
   * (called from project analytics commissioning)
   */
  async addUnusedToStock(part_description, material_grade, unusedQty, user) {
    // Try to find an existing stock entry with the same part + grade
    const where = {
      part_description: { [Op.iLike]: part_description },
      material_grade: { [Op.iLike]: material_grade },
    };
    if (user.company_id) where.company_id = user.company_id;

    let stock = await Stock.findOne({ where });
    if (stock) {
      await stock.update({ quantity: stock.quantity + unusedQty });
      return stock;
    }
    // If no matching stock entry, create one
    let stockId;
    try {
      stockId = await documentNumberingService.generateNumber('material_stock_entry_id', user.company_id);
    } catch (e) {
      console.warn('Failed to generate stock_id:', e.message);
    }
    stock = await Stock.create({
      part_description,
      material_grade,
      dimension: '',
      quantity: unusedQty,
      stock_id: stockId || null,
      company_id: user.company_id,
      created_by: user.id,
    });
    return stock;
  }

  /**
   * Add/update Material Stock on commission
   * Matches on material_grade + dimension; creates new entry if not found.
   */
  async updateMaterialStock(material_grade, dimension, quantity, user) {
    const where = {
      material_grade: { [Op.iLike]: material_grade },
    };
    if (dimension) where.dimension = { [Op.iLike]: dimension };
    else where.dimension = { [Op.or]: [null, ''] };
    if (user.company_id) where.company_id = user.company_id;

    let stock = await Stock.findOne({ where });
    if (stock) {
      await stock.update({ quantity: stock.quantity + quantity });
      return stock;
    }
    let stockId;
    try {
      stockId = await documentNumberingService.generateNumber('material_stock_entry_id', user.company_id);
    } catch (e) {
      console.warn('Failed to generate stock_id:', e.message);
    }
    stock = await Stock.create({
      part_description: material_grade,
      material_grade,
      dimension: dimension || '',
      quantity,
      stock_id: stockId || null,
      company_id: user.company_id,
      created_by: user.id,
    });
    return stock;
  }

  /**
   * Get ALL matching heat numbers from stock for a given raw_material_id.
   * STRICT ID-BASED MATCHING ONLY — no attribute/string comparison.
   *
   * Accepts:
   *   - raw_material_id directly, OR
   *   - parts_master_id (looks up Part → raw_material_id)
   *
   * Returns ALL entries with quantity > 0 and a valid heat_number.
   * Deduplicates by heat_number (same heat_number from multiple rows → one entry).
   * Different heat_numbers are ALL preserved — NO LIMIT, NO findOne, NO GROUP BY.
   */
  async getHeatNumbers(query, user) {
    const { Part } = require('../models');
    let raw_material_id = query.raw_material_id || null;

    // If raw_material_id not provided, resolve from parts_master_id
    if (!raw_material_id && query.parts_master_id) {
      const part = await Part.findByPk(query.parts_master_id, { attributes: ['raw_material_id'] });
      if (part) {
        raw_material_id = part.raw_material_id;
      }
      console.log('[getHeatNumbers] Resolved from parts_master_id=%s → raw_material_id=%s', query.parts_master_id, raw_material_id);
    }

    // Build the where clause — if raw_material_id provided, filter by it; otherwise return ALL stock
    const where = { quantity: { [Op.gt]: 0 } };
    if (raw_material_id) {
      where.raw_material_id = raw_material_id;
    }

    // Fetch ALL matching rows — no LIMIT, no findOne
    const stocks = await Stock.findAll({
      where,
      attributes: ['id', 'stock_id', 'heat_number', 'quantity', 'raw_material_id', 'certificate_url'],
    });

    // Deduplicate: keep one entry per unique heat_number, summing quantities
    const heatMap = new Map();
    for (const s of stocks) {
      if (!s.heat_number) continue; // skip entries with no heat number
      const key = s.heat_number;
      if (heatMap.has(key)) {
        heatMap.get(key).quantity += (s.quantity || 0);
        // Prioritize rows that have a certificate
        if (!heatMap.get(key).certificate_url && s.certificate_url) {
            heatMap.get(key).id = s.id;
            heatMap.get(key).stock_id = s.stock_id;
            heatMap.get(key).certificate_url = s.certificate_url;
        }
      } else {
        heatMap.set(key, { 
          id: s.id,
          stock_id: s.stock_id,
          heat_number: s.heat_number, 
          quantity: s.quantity || 0,
          certificate_url: s.certificate_url 
        });
      }
    }
    const result = Array.from(heatMap.values());

    console.log('[getHeatNumbers] raw_material_id=%s → %d stock rows, %d unique heat numbers returned', raw_material_id || 'ALL', stocks.length, result.length);
    return result;
  }
}

module.exports = new StockService();
