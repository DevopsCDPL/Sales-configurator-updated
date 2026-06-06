const { Op } = require('sequelize');
const { Part, RawMaterial, Vendor, Client, User, Document, sequelize } = require('../models');

// ═══════════════════════════════════════════════════════════════════════════
// MATERIAL CATEGORY → GRADE → DENSITY MAPPING (Single Source of Truth)
// ═══════════════════════════════════════════════════════════════════════════

const MATERIAL_DATA = {
  'Stainless Steel': {
    '17-4': 7.9, '316L': 7.9, '304L': 7.9, '303': 7.9,
    '410': 7.9, '420': 7.9, '430': 7.9,
    'Nitronic 50': 7.9, 'Nitronic 60': 7.9,
    // Legacy grades (backward compat)
    'SS202': 7.93, 'SS304': 7.93, 'SS304L': 7.90, 'SS316': 7.98,
    'SS316L': 7.95, 'SS410': 7.75, 'SS420': 7.74, 'SS17-4PH': 7.75,
  },
  'Carbon Steel': {
    '1018': 7.85, '1020': 7.85, '1045': 7.85, 'A36': 7.85,
    // Legacy grades
    'Mild Steel (MS)': 7.85, 'EN8': 7.85, 'EN9': 7.85, 'EN1A': 7.87,
    'A106': 7.85, 'C45': 7.85,
  },
  'Alloy Steel': {
    '4140': 7.85, '4340': 7.85, '8620': 7.85,
    // Legacy grades
    'EN19': 7.85, 'EN24': 7.85, '52100': 7.81,
  },
  'Tool Steel': {
    'D2': 7.70, 'A2': 7.86, 'H13': 7.80,
    // Legacy
    'O1': 7.85,
  },
  'Aluminum': {
    '6061': 2.70, '7075': 2.70, '2024': 2.70, '5052': 2.70,
    // Legacy grades with original densities
    '6063': 2.69, '5083': 2.66,
  },
  'Copper': {
    'C110': 8.96, 'C101': 8.96, 'C360': 8.96, 'Beryllium Copper': 8.96,
    // Legacy
    'C122': 8.89,
  },
  'Nickel Alloy': {
    'Inconel 718': 8.4, 'Inconel 625': 8.4, 'Monel 400': 8.4, 'Hastelloy C276': 8.4,
  },
  'Titanium': {
    'Grade 2': 4.5, 'Grade 5 (Ti-6Al-4V)': 4.5,
  },
  'Brass': {
    'C360': 8.5, 'C260': 8.5,
    // Legacy
    'C377': 8.40,
  },
  'Plastics': {
    'Delrin (POM)': 1.41, 'Nylon 6': 1.15, 'PTFE (Teflon)': 2.2, 'PEEK': 1.32,
    // Legacy
    'Nylon': 1.15, 'PTFE': 2.20, 'HDPE': 0.95, 'PVC': 1.38,
  },
  // Legacy categories kept for backward compat
  'Aluminium': {
    '6061': 2.70, '6063': 2.69, '7075': 2.81, '5052': 2.68, '5083': 2.66,
  },
  'Plastic / Polymer': {
    'Nylon': 1.15, 'PTFE': 2.20, 'PEEK': 1.32, 'HDPE': 0.95, 'PVC': 1.38,
  },
  'Cast Iron': {
    'Grey Cast Iron': 7.20, 'Ductile Iron': 7.30, 'SG Iron': 7.30,
  },
  'Custom': {},
};

const MATERIAL_CATEGORIES = Object.keys(MATERIAL_DATA);

// ═══════════════════════════════════════════════════════════════════════════
// FORM → SHAPE MAPPING
// ═══════════════════════════════════════════════════════════════════════════

const FORM_SHAPES = {
  'Rod':              ['Round'],
  'Sheet':            ['Flat'],
  'Plate':            ['Flat'],
  'Pipe':             ['Hollow Round'],
  'Hex Bar':          ['Hex'],
  'Flat':             ['Flat'],
  'Square Tube':      ['Hollow Square'],
  'Rectangular Tube': ['Hollow Rectangle'],
  // Legacy (backward compat)
  'Square Bar':       ['Square'],
};

const FORMS = Object.keys(FORM_SHAPES);

// ═══════════════════════════════════════════════════════════════════════════
// DIMENSION FIELD DEFINITIONS PER FORM+SHAPE
// ═══════════════════════════════════════════════════════════════════════════

function getDimFields(form, shape) {
  switch (form) {
    case 'Rod':
      return ['diameter', 'length'];
    case 'Sheet':
    case 'Plate':
      return ['length', 'width', 'thickness'];
    case 'Flat':
      return ['width', 'thickness', 'length'];
    case 'Pipe':
      return ['outer_diameter', 'inner_diameter', 'length'];
    case 'Hex Bar':
      return ['across_flats', 'length'];
    case 'Square Tube':
      return ['width', 'thickness', 'length'];
    case 'Rectangular Tube':
      return ['width', 'height', 'thickness', 'length'];
    // Legacy
    case 'Square Bar':
      return ['side', 'length'];
    default:
      return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VOLUME CALCULATION (all dimensions in mm → convert to meters internally)
// ═══════════════════════════════════════════════════════════════════════════

function calcVolume(form, shape, dims) {
  const n = (k) => parseFloat(dims[k]) || 0;
  const toM = (mm) => mm / 1000; // mm → meters

  switch (form) {
    case 'Rod': {
      const r = toM(n('diameter')) / 2;
      return Math.PI * r * r * toM(n('length'));
    }
    case 'Sheet':
    case 'Plate':
      return toM(n('length')) * toM(n('width')) * toM(n('thickness'));
    case 'Flat': {
      return toM(n('width')) * toM(n('thickness')) * toM(n('length'));
    }
    case 'Pipe': {
      const od = toM(n('outer_diameter'));
      const id = toM(n('inner_diameter'));
      return Math.PI * (od * od - id * id) / 4 * toM(n('length'));
    }
    case 'Hex Bar': {
      const af = toM(n('across_flats'));
      const area = (3 * Math.sqrt(3) / 2) * Math.pow(af / 2, 2);
      return area * toM(n('length'));
    }
    case 'Square Tube': {
      const w = toM(n('width'));
      const t = toM(n('thickness'));
      const inner = w - 2 * t;
      const area = w * w - (inner > 0 ? inner * inner : 0);
      return area * toM(n('length'));
    }
    case 'Rectangular Tube': {
      const w = toM(n('width'));
      const h = toM(n('height'));
      const t = toM(n('thickness'));
      const innerW = w - 2 * t;
      const innerH = h - 2 * t;
      const area = w * h - (innerW > 0 && innerH > 0 ? innerW * innerH : 0);
      return area * toM(n('length'));
    }
    case 'Square Bar': {
      const side = toM(n('side'));
      return side * side * toM(n('length'));
    }
    default:
      return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WEIGHT CALCULATION
// density in g/cm³ → kg/m³ (×1000), volume in m³ → weight in kg
// ═══════════════════════════════════════════════════════════════════════════

function calcWeight(volumeM3, densityGCm3) {
  return volumeM3 * (densityGCm3 * 1000);
}

const KG_TO_LBS = 2.20462;

// ═══════════════════════════════════════════════════════════════════════════
// PART ID GENERATION (PRT-00001 format per spec)
// ═══════════════════════════════════════════════════════════════════════════

const documentNumberingService = require('./documentNumberingService');

async function generatePartId(companyId) {
  return await documentNumberingService.generateUniqueNumber('part_id', companyId, Part, 'part_id_seq');
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION (Parts Master spec requires raw_material_id)
// ═══════════════════════════════════════════════════════════════════════════

function getDefaultShape(form) {
  const shapes = FORM_SHAPES[form];
  return shapes ? shapes[0] : null;
}

function validatePart(data, isRawMaterialBased = true) {
  const errors = [];
  if (!data.part_name || !data.part_name.trim()) errors.push('Part name is required');
  if (!data.part_number || !data.part_number.trim()) errors.push('Part number is required');
  if (isRawMaterialBased && !data.raw_material_id) errors.push('Raw Material must be selected');
  if (!data.client_id) errors.push('Client is required');
  
  // Material validation (should come from raw material)
  if (!data.material_category) errors.push('Material category is required');
  if (!data.density || parseFloat(data.density) <= 0) errors.push('Density must be > 0');
  if (!data.form) errors.push('Form is required');

  // Dimensions validation
  if (data.dimensions && data.form) {
    const shape = data.shape || getDefaultShape(data.form);
    const requiredDims = getDimFields(data.form, shape);
    for (const dim of requiredDims) {
      const val = parseFloat(data.dimensions[dim]);
      if (!val || val <= 0) errors.push(`Dimension "${dim}" must be > 0`);
    }
  }

  return errors;
}

// Check for duplicate part number
async function checkDuplicatePartNumber(partNumber, excludeId = null) {
  const where = { part_number: partNumber };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const existing = await Part.findOne({ where });
  return !!existing;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPUTE ALL DERIVED FIELDS
// ═══════════════════════════════════════════════════════════════════════════

function computeDerivedFields(data) {
  const form = data.form;
  const shape = data.shape || getDefaultShape(form);
  const dims = data.dimensions || {};
  const density = parseFloat(data.density) || 0;
  const quantity = parseInt(data.quantity, 10) || 1;
  const costType = data.cost_type || 'Per Kg';
  const costRate = parseFloat(data.cost_rate) || 0;
  const weightUnit = data.weight_unit || 'Kg';

  const volume = calcVolume(form, shape, dims);
  const weightPerPieceKg = calcWeight(volume, density);
  const totalWeightKg = weightPerPieceKg * quantity;

  const weightPerPiece = weightUnit === 'Lbs' ? weightPerPieceKg * KG_TO_LBS : weightPerPieceKg;
  const totalWeight = weightUnit === 'Lbs' ? totalWeightKg * KG_TO_LBS : totalWeightKg;

  let costPerPiece = 0;
  let totalCost = 0;
  if (costType === 'Per Kg') {
    costPerPiece = weightPerPieceKg * costRate;
    totalCost = totalWeightKg * costRate;
  } else {
    // Per Piece
    costPerPiece = costRate;
    totalCost = quantity * costRate;
  }

  return {
    shape,
    volume: parseFloat(volume.toFixed(8)),
    weight_per_piece: parseFloat(weightPerPiece.toFixed(4)),
    total_weight: parseFloat(totalWeight.toFixed(4)),
    cost_per_piece: parseFloat(costPerPiece.toFixed(2)),
    total_cost: parseFloat(totalCost.toFixed(2)),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class PartService {

  getMaterialCategories() { return MATERIAL_CATEGORIES; }

  getGradesForCategory(category) {
    const grades = MATERIAL_DATA[category];
    if (!grades) return [];
    return Object.entries(grades).map(([name, density]) => ({ name, density }));
  }

  getDensityForGrade(category, grade) {
    return MATERIAL_DATA[category]?.[grade] || null;
  }

  getForms() { return FORMS; }
  getShapesForForm(form) { return FORM_SHAPES[form] || []; }
  getDimensionFields(form, shape) { return getDimFields(form, shape); }

  async getAll(query, user) {
    const where = {};
    if (user.company_id) where.company_id = user.company_id;
    if (query.search) {
      where[Op.or] = [
        { part_name: { [Op.iLike]: `%${query.search}%` } },
        { part_number: { [Op.iLike]: `%${query.search}%` } },
        { material_grade: { [Op.iLike]: `%${query.search}%` } },
        { part_id_seq: { [Op.iLike]: `%${query.search}%` } },
      ];
    }
    if (query.form && query.form !== 'all') where.form = query.form;
    if (query.material_category && query.material_category !== 'all') where.material_category = query.material_category;
    if (query.status === 'active') where.is_active = true;
    else if (query.status === 'inactive') where.is_active = false;
    if (query.vendor_id) where.vendor_id = query.vendor_id;
    if (query.client_id) where.client_id = query.client_id;

    const parts = await Part.findAll({
      where,
      include: [
        { model: RawMaterial, as: 'rawMaterial', attributes: ['id', 'material_id', 'material_category', 'material_grade', 'condition', 'density', 'form', 'shape'], required: false },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'], required: false },
        { model: Client, as: 'client', attributes: ['id', 'client_name'], required: false },
        { model: User, as: 'creator', attributes: ['id', 'name'], required: false },
      ],
      order: [['created_at', 'DESC']],
    });
    return parts;
  }

  async getById(id) {
    const part = await Part.findByPk(id, {
      include: [
        { model: RawMaterial, as: 'rawMaterial', attributes: ['id', 'material_id', 'material_category', 'material_grade', 'condition', 'density', 'form', 'shape'], required: false },
        { model: Vendor, as: 'vendor', attributes: ['id', 'vendor_name'], required: false },
        { model: Client, as: 'client', attributes: ['id', 'client_name'], required: false },
        { model: User, as: 'creator', attributes: ['id', 'name'], required: false },
      ],
    });
    if (!part) throw new Error('Part not found');
    return part;
  }

  async create(data, user) {
    // Raw Material is MANDATORY - fetch and populate all material fields
    if (!data.raw_material_id) {
      throw new Error('Raw Material must be selected');
    }

    const rawMaterial = await RawMaterial.findByPk(data.raw_material_id);
    if (!rawMaterial) {
      throw new Error('Selected Raw Material not found');
    }

    // Populate material fields from Raw Material (READ-ONLY in UI)
    data.material_category = rawMaterial.material_category;
    data.material_grade = rawMaterial.material_grade;
    data.condition = rawMaterial.condition;
    data.density = rawMaterial.density;
    data.form = rawMaterial.form;
    data.shape = rawMaterial.shape;
    data.dimensions = rawMaterial.dimensions || {};

    // Check for duplicate part number
    if (data.part_number) {
      const isDuplicate = await checkDuplicatePartNumber(data.part_number);
      if (isDuplicate) {
        throw new Error('Part Number already exists. Duplicate not allowed.');
      }
    }

    const errors = validatePart(data, true);
    if (errors.length) throw new Error(errors.join('; '));

    const computed = computeDerivedFields(data);
    const partIdSeq = await generatePartId(user.company_id);

    const part = await Part.create({
      part_id_seq: partIdSeq,
      part_name: data.part_name.trim(),
      part_number: data.part_number || null,
      heat_number: data.heat_number || null,
      revision: data.revision || 'R0',
      drawing_given_by_client: data.drawing_given_by_client || false,
      drawing_url: data.drawing_url || null,
      description: data.description || null,
      raw_material_id: data.raw_material_id,
      material_category: data.material_category,
      material_grade: data.material_grade || null,
      condition: data.condition || null,
      density: parseFloat(data.density),
      form: data.form,
      shape: computed.shape || data.shape,
      dimensions: data.dimensions || {},
      volume: computed.volume,
      weight_per_piece: computed.weight_per_piece,
      total_weight: computed.total_weight,
      weight_unit: data.weight_unit || 'Kg',
      quantity: parseInt(data.quantity, 10) || 1,
      cost_type: data.cost_type || 'Per Kg',
      cost_rate: parseFloat(data.cost_rate) || 0,
      cost_per_unit: data.cost_per_unit !== undefined ? parseFloat(data.cost_per_unit) || null : null,
      cost_per_piece: computed.cost_per_piece,
      total_cost: computed.total_cost,
      manufacturing_type: data.manufacturing_type || 'Machining',
      operator_initials: data.operator_initials || null,
      cut_method: data.cut_method || null,
      cut_length: data.cut_length || null,
      lathe_ops_required: data.lathe_ops_required || 'Yes',
      mill_ops_required: data.mill_ops_required || 'Yes',
      deburr_required: data.deburr_required || 'Yes',
      heat_treat_required: data.heat_treat_required || 'Yes',
      marking_required: data.marking_required || 'Yes',
      final_qc_inspection_required: data.final_qc_inspection_required || 'Yes',
      final_acceptance_required: data.final_acceptance_required || 'Yes',
      anodize_type: data.anodize_type || null,
      anodize_thickness_spec: data.anodize_thickness_spec || null,
      anodize_class: data.anodize_class || null,
      anodize_dye_color: data.anodize_dye_color || null,
      anodize_seal: data.anodize_seal || false,
      anodize_mask_threads: data.anodize_mask_threads || false,
      anodize_tumbled: data.anodize_tumbled || false,
      anodize_scotch_brite: data.anodize_scotch_brite || false,
      anodize_visual_inspection: data.anodize_visual_inspection || 'Yes',
      anodize_alkaline_wash: data.anodize_alkaline_wash || 'Yes',
      anodize_masking: data.anodize_masking || 'Yes',
      anodize_racking: data.anodize_racking || 'Yes',
      anodize_secondary_cleaning: data.anodize_secondary_cleaning || 'Yes',
      anodize_caustic_etch: data.anodize_caustic_etch || 'Yes',
      anodize_acid_etch: data.anodize_acid_etch || 'Yes',
      anodize_deox_rinse: data.anodize_deox_rinse || 'Yes',
      anodize_anodize_rinse: data.anodize_anodize_rinse || 'Yes',
      anodize_neutralize: data.anodize_neutralize || 'Yes',
      anodize_dye: data.anodize_dye || 'Yes',
      anodize_seal_rinse: data.anodize_seal_rinse || 'Yes',
      anodize_dry: data.anodize_dry || 'Yes',
      anodize_un_rack: data.anodize_un_rack || 'Yes',
      anodize_technical_inspect: data.anodize_technical_inspect || 'Yes',
      anodize_commercial_inspection: data.anodize_commercial_inspection || 'Yes',
      anodize_package: data.anodize_package || 'Yes',
      anodize_final_acceptance: data.anodize_final_acceptance || 'Yes',
      anodize_product_release: data.anodize_product_release || 'Yes',
      vendor_id: data.vendor_id || null,
      client_id: data.client_id || null,
      notes: data.notes || null,
      is_active: true,
      company_id: user.company_id,
      created_by: user.id,
    });

    // Link any drawing Document(s) that were uploaded before the part was created
    if (part.drawing_url) {
      try {
        const drawingFilename = part.drawing_url.split('/').pop();
        await Document.update(
          { reference_id: part.id },
          { where: { module_type: 'part_master', document_type: 'drawing', reference_id: null, file_path: { [Op.like]: `%${drawingFilename}%` } } }
        );
      } catch (_) {}
    }

    return this.getById(part.id);
  }

  async update(id, data, user) {
    const part = await Part.findByPk(id);
    if (!part) throw new Error('Part not found');

    // If raw_material_id is being changed, re-fetch material data
    let materialData = {};
    if (data.raw_material_id && data.raw_material_id !== part.raw_material_id) {
      const rawMaterial = await RawMaterial.findByPk(data.raw_material_id);
      if (!rawMaterial) throw new Error('Selected Raw Material not found');
      materialData = {
        material_category: rawMaterial.material_category,
        material_grade: rawMaterial.material_grade,
        condition: rawMaterial.condition,
        density: rawMaterial.density,
        form: rawMaterial.form,
        shape: rawMaterial.shape,
        dimensions: rawMaterial.dimensions || {},
      };
    }

    // Check for duplicate part number (excluding current)
    if (data.part_number && data.part_number !== part.part_number) {
      const isDuplicate = await checkDuplicatePartNumber(data.part_number, id);
      if (isDuplicate) {
        throw new Error('Part Number already exists. Duplicate not allowed.');
      }
    }

    const merged = {
      part_name: data.part_name !== undefined ? data.part_name : part.part_name,
      part_number: data.part_number !== undefined ? data.part_number : part.part_number,
      heat_number: data.heat_number !== undefined ? data.heat_number : part.heat_number,
      revision: data.revision !== undefined ? data.revision : part.revision,
      drawing_given_by_client: data.drawing_given_by_client !== undefined ? data.drawing_given_by_client : part.drawing_given_by_client,
      drawing_url: data.drawing_url !== undefined ? data.drawing_url : part.drawing_url,
      description: data.description !== undefined ? data.description : part.description,
      raw_material_id: data.raw_material_id !== undefined ? data.raw_material_id : part.raw_material_id,
      material_category: materialData.material_category || part.material_category,
      material_grade: materialData.material_grade || part.material_grade,
      condition: materialData.condition || part.condition,
      density: materialData.density || part.density,
      form: materialData.form || part.form,
      shape: materialData.shape || part.shape,
      dimensions: materialData.dimensions || (data.dimensions !== undefined ? data.dimensions : part.dimensions),
      weight_unit: data.weight_unit !== undefined ? data.weight_unit : part.weight_unit,
      quantity: data.quantity !== undefined ? data.quantity : part.quantity,
      cost_type: data.cost_type !== undefined ? data.cost_type : part.cost_type,
      cost_rate: data.cost_rate !== undefined ? data.cost_rate : part.cost_rate,
      cost_per_unit: data.cost_per_unit !== undefined ? data.cost_per_unit : part.cost_per_unit,
      manufacturing_type: data.manufacturing_type !== undefined ? data.manufacturing_type : part.manufacturing_type,
      operator_initials: data.operator_initials !== undefined ? data.operator_initials : part.operator_initials,
      cut_method: data.cut_method !== undefined ? data.cut_method : part.cut_method,
      cut_length: data.cut_length !== undefined ? data.cut_length : part.cut_length,
      lathe_ops_required: data.lathe_ops_required !== undefined ? data.lathe_ops_required : part.lathe_ops_required,
      mill_ops_required: data.mill_ops_required !== undefined ? data.mill_ops_required : part.mill_ops_required,
      deburr_required: data.deburr_required !== undefined ? data.deburr_required : part.deburr_required,
      heat_treat_required: data.heat_treat_required !== undefined ? data.heat_treat_required : part.heat_treat_required,
      marking_required: data.marking_required !== undefined ? data.marking_required : part.marking_required,
      final_qc_inspection_required: data.final_qc_inspection_required !== undefined ? data.final_qc_inspection_required : part.final_qc_inspection_required,
      final_acceptance_required: data.final_acceptance_required !== undefined ? data.final_acceptance_required : part.final_acceptance_required,
      anodize_type: data.anodize_type !== undefined ? data.anodize_type : part.anodize_type,
      anodize_thickness_spec: data.anodize_thickness_spec !== undefined ? data.anodize_thickness_spec : part.anodize_thickness_spec,
      anodize_class: data.anodize_class !== undefined ? data.anodize_class : part.anodize_class,
      anodize_dye_color: data.anodize_dye_color !== undefined ? data.anodize_dye_color : part.anodize_dye_color,
      anodize_seal: data.anodize_seal !== undefined ? data.anodize_seal : part.anodize_seal,
      anodize_mask_threads: data.anodize_mask_threads !== undefined ? data.anodize_mask_threads : part.anodize_mask_threads,
      anodize_tumbled: data.anodize_tumbled !== undefined ? data.anodize_tumbled : part.anodize_tumbled,
      anodize_scotch_brite: data.anodize_scotch_brite !== undefined ? data.anodize_scotch_brite : part.anodize_scotch_brite,
      anodize_visual_inspection: data.anodize_visual_inspection !== undefined ? data.anodize_visual_inspection : part.anodize_visual_inspection,
      anodize_alkaline_wash: data.anodize_alkaline_wash !== undefined ? data.anodize_alkaline_wash : part.anodize_alkaline_wash,
      anodize_masking: data.anodize_masking !== undefined ? data.anodize_masking : part.anodize_masking,
      anodize_racking: data.anodize_racking !== undefined ? data.anodize_racking : part.anodize_racking,
      anodize_secondary_cleaning: data.anodize_secondary_cleaning !== undefined ? data.anodize_secondary_cleaning : part.anodize_secondary_cleaning,
      anodize_caustic_etch: data.anodize_caustic_etch !== undefined ? data.anodize_caustic_etch : part.anodize_caustic_etch,
      anodize_acid_etch: data.anodize_acid_etch !== undefined ? data.anodize_acid_etch : part.anodize_acid_etch,
      anodize_deox_rinse: data.anodize_deox_rinse !== undefined ? data.anodize_deox_rinse : part.anodize_deox_rinse,
      anodize_anodize_rinse: data.anodize_anodize_rinse !== undefined ? data.anodize_anodize_rinse : part.anodize_anodize_rinse,
      anodize_neutralize: data.anodize_neutralize !== undefined ? data.anodize_neutralize : part.anodize_neutralize,
      anodize_dye: data.anodize_dye !== undefined ? data.anodize_dye : part.anodize_dye,
      anodize_seal_rinse: data.anodize_seal_rinse !== undefined ? data.anodize_seal_rinse : part.anodize_seal_rinse,
      anodize_dry: data.anodize_dry !== undefined ? data.anodize_dry : part.anodize_dry,
      anodize_un_rack: data.anodize_un_rack !== undefined ? data.anodize_un_rack : part.anodize_un_rack,
      anodize_technical_inspect: data.anodize_technical_inspect !== undefined ? data.anodize_technical_inspect : part.anodize_technical_inspect,
      anodize_commercial_inspection: data.anodize_commercial_inspection !== undefined ? data.anodize_commercial_inspection : part.anodize_commercial_inspection,
      anodize_package: data.anodize_package !== undefined ? data.anodize_package : part.anodize_package,
      anodize_final_acceptance: data.anodize_final_acceptance !== undefined ? data.anodize_final_acceptance : part.anodize_final_acceptance,
      anodize_product_release: data.anodize_product_release !== undefined ? data.anodize_product_release : part.anodize_product_release,
      vendor_id: data.vendor_id !== undefined ? data.vendor_id : part.vendor_id,
      client_id: data.client_id !== undefined ? data.client_id : part.client_id,
      notes: data.notes !== undefined ? data.notes : part.notes,
    };

    const errors = validatePart(merged, true);
    if (errors.length) throw new Error(errors.join('; '));

    const computed = computeDerivedFields(merged);

    await part.update({
      ...merged,
      density: parseFloat(merged.density),
      shape: computed.shape || merged.shape,
      quantity: parseInt(merged.quantity, 10) || 1,
      cost_rate: parseFloat(merged.cost_rate) || 0,
      cost_per_unit: merged.cost_per_unit !== undefined && merged.cost_per_unit !== null && merged.cost_per_unit !== '' ? parseFloat(merged.cost_per_unit) : null,
      volume: computed.volume,
      weight_per_piece: computed.weight_per_piece,
      total_weight: computed.total_weight,
      cost_per_piece: computed.cost_per_piece,
      total_cost: computed.total_cost,
    });

    return this.getById(id);
  }

  async delete(id) {
    const part = await Part.findByPk(id);
    if (!part) throw new Error('Part not found');
    await part.destroy();
    return { message: 'Part deleted' };
  }

  async toggleStatus(id) {
    const part = await Part.findByPk(id);
    if (!part) throw new Error('Part not found');
    await part.update({ is_active: !part.is_active });
    return this.getById(id);
  }

  async duplicate(id, user) {
    const source = await Part.findByPk(id);
    if (!source) throw new Error('Part not found');
    const data = source.toJSON();
    delete data.id;
    delete data.created_at;
    delete data.updated_at;
    data.part_name = `${data.part_name} (Copy)`;
    // Generate unique part number for duplicate
    data.part_number = data.part_number ? `${data.part_number}-COPY-${Date.now().toString(36)}` : null;
    data.part_id_seq = await generatePartId(user.company_id);
    data.created_by = user.id;
    const newPart = await Part.create(data);
    return this.getById(newPart.id);
  }

  async recalculate(id) {
    const part = await Part.findByPk(id);
    if (!part) throw new Error('Part not found');
    const d = part.toJSON();
    const computed = computeDerivedFields(d);
    await part.update({
      volume: computed.volume,
      weight_per_piece: computed.weight_per_piece,
      total_weight: computed.total_weight,
      cost_per_piece: computed.cost_per_piece,
      total_cost: computed.total_cost,
    });
    return this.getById(id);
  }
}

module.exports = new PartService();
