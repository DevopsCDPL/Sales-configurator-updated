const { Op } = require('sequelize');
const { RawMaterial, User, Company, sequelize } = require('../models');

// ═══════════════════════════════════════════════════════════════════════════
// RAW MATERIAL MASTER — STRICT CONTROLLED DATA
// ═══════════════════════════════════════════════════════════════════════════

// Category → Grade → Conditions (STRICT — use EXACT values)
const RAW_MATERIAL_CATALOG = {
  'Stainless Steel': {
    '17-4':        ['Annealed', 'H900', 'H1025'],
    '316L':        ['Annealed'],
    '304L':        ['Annealed'],
    '303':         ['Annealed'],
    '410':         ['Annealed'],
    '420':         ['Annealed'],
    '430':         ['Annealed'],
    'Nitronic 50': ['Annealed'],
    'Nitronic 60': ['Annealed'],
  },
  'Carbon Steel': {
    '1018': ['Cold Drawn', 'Annealed'],
    '1020': ['Hot Rolled'],
    '1045': ['Normalized'],
    'A36':  ['Hot Rolled'],
  },
  'Alloy Steel': {
    '4140': ['Annealed', 'Pre-Hardened', 'Q&T'],
    '4340': ['Annealed', 'Q&T'],
    '8620': ['Carburized'],
  },
  'Tool Steel': {
    'D2':  ['Annealed', 'Hardened'],
    'A2':  ['Annealed', 'Hardened'],
    'H13': ['Annealed', 'Hardened'],
  },
  'Aluminum': {
    '6061': ['T6', 'T651'],
    '7075': ['T6', 'T651'],
    '2024': ['T4'],
    '5052': ['H32'],
  },
  'Copper': {
    'C110':             ['Annealed'],
    'C101':             ['Annealed'],
    'C360':             ['Free Machining'],
    'Beryllium Copper': ['Age Hardened'],
  },
  'Nickel Alloy': {
    'Inconel 718':   ['Annealed', 'Age Hardened'],
    'Inconel 625':   ['Annealed'],
    'Monel 400':     ['Annealed'],
    'Hastelloy C276': ['Annealed'],
  },
  'Titanium': {
    'Grade 2': ['Annealed'],
    'Grade 5': ['Annealed'],
  },
  'Brass': {
    'C360': ['Free Machining'],
    'C260': ['Annealed'],
  },
  'Plastics': {
    'Delrin':  ['Natural'],
    'Nylon 6': ['General'],
    'PTFE':    ['General'],
    'PEEK':    ['General'],
  },
};

// Fixed density per category/grade (g/cm³)
const DENSITY_MAP = {
  'Carbon Steel':    7.85,
  'Alloy Steel':     7.85,
  'Tool Steel':      7.85,
  'Stainless Steel': 7.9,
  'Aluminum':        2.7,
  'Copper':          8.96,
  'Brass':           8.5,
  'Titanium':        4.5,
  'Nickel Alloy':    8.4,
  // Plastics — per grade
  'Plastics': {
    'Delrin':  1.41,
    'Nylon 6': 1.15,
    'PTFE':    2.2,
    'PEEK':    1.32,
  },
};

// Form → Shape (auto-derived, 1:1)
const FORM_SHAPE_MAP = {
  'Rod':              'Round',
  'Sheet':            'Flat',
  'Plate':            'Flat',
  'Pipe':             'Hollow Round',
  'Hex Bar':          'Hex',
  'Flat Bar':         'Flat',
  'Square Tube':      'Hollow Square',
  'Rectangular Tube': 'Hollow Rectangle',
};

const FORM_OPTIONS = ['Rod', 'Plate', 'Sheet', 'Pipe', 'Square Tube', 'Rectangular Tube', 'Flat Bar', 'Hex Bar'];

function getDensityForMaterial(category, grade) {
  const d = DENSITY_MAP[category];
  if (typeof d === 'object') return d[grade] || null;
  return d || null;
}

function deriveShape(form) {
  return FORM_SHAPE_MAP[form] || null;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class RawMaterialService {

  // ── Lookup endpoints (static) ─────────────────────────────────
  getCategories() {
    return Object.keys(RAW_MATERIAL_CATALOG);
  }

  getGradesForCategory(category) {
    const grades = RAW_MATERIAL_CATALOG[category];
    if (!grades) return [];
    return Object.keys(grades);
  }

  getConditionsForGrade(category, grade) {
    return RAW_MATERIAL_CATALOG[category]?.[grade] || [];
  }

  getDensity(category, grade) {
    return getDensityForMaterial(category, grade);
  }

  getFormOptions() {
    return FORM_OPTIONS;
  }

  getShapeForForm(form) {
    return deriveShape(form);
  }

  getCatalog() {
    return RAW_MATERIAL_CATALOG;
  }

  getDensityMap() {
    return DENSITY_MAP;
  }

  // ── CRUD ──────────────────────────────────────────────────────
  async getAll(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;
    if (query.search) {
      where[Op.or] = [
        { material_id: { [Op.iLike]: `%${query.search}%` } },
        { material_category: { [Op.iLike]: `%${query.search}%` } },
        { material_grade: { [Op.iLike]: `%${query.search}%` } },
        { condition: { [Op.iLike]: `%${query.search}%` } },
      ];
    }
    if (query.category && query.category !== 'all') where.material_category = query.category;
    if (query.status === 'active') where.is_active = true;
    else if (query.status === 'inactive') where.is_active = false;

    return RawMaterial.findAll({
      where,
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'], required: false },
      ],
      order: [['material_id', 'ASC']],
    });
  }

  async getById(id) {
    const rm = await RawMaterial.findByPk(id, {
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'], required: false },
      ],
    });
    if (!rm) throw new Error('Raw material not found');
    return rm;
  }

  async create(data, user) {
    // Validate category/grade/condition from catalog
    const validCats = Object.keys(RAW_MATERIAL_CATALOG);
    if (!validCats.includes(data.material_category)) {
      throw new Error(`Invalid material category: ${data.material_category}`);
    }
    const validGrades = Object.keys(RAW_MATERIAL_CATALOG[data.material_category]);
    if (!validGrades.includes(data.material_grade)) {
      throw new Error(`Invalid grade "${data.material_grade}" for category "${data.material_category}"`);
    }
    const validConditions = RAW_MATERIAL_CATALOG[data.material_category][data.material_grade];
    if (!validConditions.includes(data.condition)) {
      throw new Error(`Invalid condition "${data.condition}" for grade "${data.material_grade}"`);
    }

    // Auto-derive density
    const density = getDensityForMaterial(data.material_category, data.material_grade);
    if (!density) throw new Error('Could not determine density for this material');

    // Auto-derive shape from form (if form provided)
    const shape = data.form ? deriveShape(data.form) : null;

    // Generate unique Material ID
    const materialId = await this.generateMaterialId(user.company_id);

    return RawMaterial.create({
      material_id: materialId,
      material_category: data.material_category,
      material_grade: data.material_grade,
      condition: data.condition,
      density,
      form: data.form || null,
      shape,
      dimensions: data.dimensions || null,
      unit_system: data.unit_system || 'imperial',
      cost_per_unit: parseFloat(data.cost_per_unit) || 0,
      cost_unit: data.cost_unit || '$/lb',
      notes: data.notes || null,
      is_active: true,
      company_id: user.company_id,
      created_by: user.id,
    });
  }

  async update(id, data, user) {
    const rm = await RawMaterial.findByPk(id);
    if (!rm) throw new Error('Raw material not found');

    const category = data.material_category !== undefined ? data.material_category : rm.material_category;
    const grade = data.material_grade !== undefined ? data.material_grade : rm.material_grade;
    const condition = data.condition !== undefined ? data.condition : rm.condition;

    // Validate if changed
    if (data.material_category !== undefined || data.material_grade !== undefined || data.condition !== undefined) {
      const validCats = Object.keys(RAW_MATERIAL_CATALOG);
      if (!validCats.includes(category)) throw new Error(`Invalid material category: ${category}`);
      const validGrades = Object.keys(RAW_MATERIAL_CATALOG[category]);
      if (!validGrades.includes(grade)) throw new Error(`Invalid grade "${grade}" for category "${category}"`);
      const validConditions = RAW_MATERIAL_CATALOG[category][grade];
      if (!validConditions.includes(condition)) throw new Error(`Invalid condition "${condition}" for grade "${grade}"`);
    }

    const density = getDensityForMaterial(category, grade);
    const form = data.form !== undefined ? data.form : rm.form;
    const shape = form ? deriveShape(form) : null;

    await rm.update({
      material_category: category,
      material_grade: grade,
      condition,
      density: density || rm.density,
      form,
      shape,
      dimensions: data.dimensions !== undefined ? data.dimensions : rm.dimensions,
      unit_system: data.unit_system !== undefined ? data.unit_system : rm.unit_system,
      cost_per_unit: data.cost_per_unit !== undefined ? parseFloat(data.cost_per_unit) || 0 : rm.cost_per_unit,
      cost_unit: data.cost_unit !== undefined ? data.cost_unit : rm.cost_unit,
      notes: data.notes !== undefined ? data.notes : rm.notes,
    });

    return this.getById(id);
  }

  async delete(id) {
    const rm = await RawMaterial.findByPk(id);
    if (!rm) throw new Error('Raw material not found');
    await rm.destroy();
    return { message: 'Raw material deleted' };
  }

  async toggleStatus(id) {
    const rm = await RawMaterial.findByPk(id);
    if (!rm) throw new Error('Raw material not found');
    await rm.update({ is_active: !rm.is_active });
    return this.getById(id);
  }

  // Generate next Material ID using centralized numbering service
  async generateMaterialId(companyId) {
    const documentNumberingService = require('./documentNumberingService');
    return await documentNumberingService.generateUniqueNumber('raw_material_id', companyId, RawMaterial, 'material_id');
  }

  // Bulk delete materials
  async bulkDelete(ids) {
    const deleted = await RawMaterial.destroy({
      where: { id: { [Op.in]: ids } },
    });
    return { message: `Deleted ${deleted} raw material(s)`, count: deleted };
  }

  // Duplicate a material with new Material ID
  async duplicate(id, user) {
    const original = await RawMaterial.findByPk(id);
    if (!original) throw new Error('Raw material not found');

    const materialId = await this.generateMaterialId(user.company_id);

    return RawMaterial.create({
      material_id: materialId,
      material_category: original.material_category,
      material_grade: original.material_grade,
      condition: original.condition,
      density: original.density,
      form: original.form,
      shape: original.shape,
      dimensions: original.dimensions,
      unit_system: original.unit_system,
      cost_per_unit: original.cost_per_unit,
      cost_unit: original.cost_unit,
      notes: original.notes ? `(Copy) ${original.notes}` : '(Copy)',
      is_active: true,
      company_id: user.company_id,
      created_by: user.id,
    });
  }
}

module.exports = new RawMaterialService();
