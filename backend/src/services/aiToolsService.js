/**
 * AI Tools Service --- Action Tool Layer
 * ------------------------------------------------------------------------------------------------------------------
 * Predefined tools that the AI Copilot can invoke.
 * Each tool calls existing Forge APIs/services internally.
 * The AI NEVER accesses the database directly --- only through these tools.
 */

const { Op, fn, col, literal } = require('sequelize');
const {
  Project, Client, Vendor, Estimate, EstimateItem,
  SalesOrder, WorkOrder, QualityRecord, Document,
  VendorPurchaseOrder, VendorPOItem, Material, Stock,
  Invoice, User, AuditLog, RawMaterial, Part,
  VendorRFQ, MaterialStock,
} = require('../models');

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  TOOL DEFINITIONS --- metadata for the AI to understand what each tool does
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const TOOL_DEFINITIONS = {
  // ------ Project Tools ------
  create_project: {
    name: 'create_project',
    description: 'Create a new project',
    required: ['project_name', 'client_id'],
    optional: ['description', 'deadline', 'priority'],
    category: 'project',
  },
  list_projects: {
    name: 'list_projects',
    description: 'List projects, optionally filtered by status',
    required: [],
    optional: ['status', 'limit', 'search'],
    category: 'project',
  },
  get_project: {
    name: 'get_project',
    description: 'Get project details by ID or name',
    required: ['identifier'],
    optional: [],
    category: 'project',
  },
  update_project_status: {
    name: 'update_project_status',
    description: 'Update a project status',
    required: ['project_id', 'status'],
    optional: [],
    category: 'project',
  },
  edit_project: {
    name: 'edit_project',
    description: 'Edit project details',
    required: ['project_id'],
    optional: ['project_name', 'description', 'deadline', 'priority'],
    category: 'project',
  },
  approve_project: {
    name: 'approve_project',
    description: 'Approve a project or move it to the next stage',
    required: ['project_id'],
    optional: ['stage'],
    category: 'project',
  },

  // ------ Client Tools ------
  create_client: {
    name: 'create_client',
    description: 'Create a new client',
    required: ['client_name'],
    optional: ['contact_person', 'email', 'phone', 'address', 'tax_id', 'payment_terms'],
    category: 'client',
  },
  edit_client: {
    name: 'edit_client',
    description: 'Edit an existing client',
    required: ['client_id'],
    optional: ['client_name', 'contact_person', 'email', 'phone', 'address'],
    category: 'client',
  },
  list_clients: {
    name: 'list_clients',
    description: 'List all clients',
    required: [],
    optional: ['search', 'limit'],
    category: 'client',
  },

  // ------ Vendor Tools ------
  create_vendor: {
    name: 'create_vendor',
    description: 'Create a new vendor / supplier',
    required: ['vendor_name'],
    optional: ['contact_person', 'email', 'phone', 'address', 'tax_id', 'category'],
    category: 'vendor',
  },
  edit_vendor: {
    name: 'edit_vendor',
    description: 'Edit an existing vendor',
    required: ['vendor_id'],
    optional: ['vendor_name', 'contact_person', 'email', 'phone', 'address'],
    category: 'vendor',
  },
  list_vendors: {
    name: 'list_vendors',
    description: 'List all vendors',
    required: [],
    optional: ['search', 'limit'],
    category: 'vendor',
  },

  // ------ Master Data: Raw Material ------
  create_material: {
    name: 'create_material',
    description: 'Create a new raw material entry in the Raw Material Master',
    required: ['material_category', 'material_grade'],
    optional: ['condition', 'density', 'form', 'shape', 'cost_per_unit', 'notes'],
    category: 'master_data',
  },

  // ------ Master Data: Part / Job ------
  create_part: {
    name: 'create_part',
    description: 'Create a new part / job in the Parts Master',
    required: ['part_name'],
    optional: ['part_number', 'description', 'revision', 'material_grade'],
    category: 'master_data',
  },

  // ------ Procurement: RFQ ------
  create_rfq: {
    name: 'create_rfq',
    description: 'Create a Request For Quotation (RFQ) in Procurement',
    required: ['vendor_name', 'material_name', 'required_quantity'],
    optional: ['project_name', 'required_date', 'notes', 'unit'],
    category: 'procurement',
  },

  // ------ Procurement: Vendor Purchase Order ------
  create_purchase_order: {
    name: 'create_purchase_order',
    description: 'Create a Vendor Purchase Order (PO) in Procurement',
    required: ['vendor_name', 'project_name', 'item_description', 'quantity', 'unit_cost'],
    optional: ['notes', 'tax_type'],
    category: 'procurement',
  },

  // ------ Inventory: Item ------
  create_inventory_item: {
    name: 'create_inventory_item',
    description: 'Add a new item to the Inventory module',
    required: ['item_name', 'category', 'unit', 'quantity'],
    optional: ['description', 'grade', 'default_cost'],
    category: 'inventory',
  },

  // ------ Inventory: List ------
  list_materials: {
    name: 'list_materials',
    description: 'List materials from the Inventory / Material library',
    required: [],
    optional: ['search', 'category', 'limit'],
    category: 'inventory',
  },

  // ------ Estimation Tools ------
  create_estimation: {
    name: 'create_estimation',
    description: 'Create or update an estimate for a project',
    required: ['project_id'],
    optional: ['materials', 'labor_cost', 'overhead', 'profit_margin'],
    category: 'estimation',
    workflow_requires: ['project'],
  },
  view_estimation: {
    name: 'view_estimation',
    description: 'View estimation for a project',
    required: ['project_id'],
    optional: ['revision'],
    category: 'estimation',
  },
  update_estimation: {
    name: 'update_estimation',
    description: 'Update an existing estimation',
    required: ['project_id'],
    optional: ['materials', 'labor_cost', 'overhead', 'profit_margin'],
    category: 'estimation',
    workflow_requires: ['project'],
  },
  add_estimation_material: {
    name: 'add_estimation_material',
    description: 'Add a material line-item to an estimation',
    required: ['project_id', 'material_id', 'quantity'],
    optional: ['unit_cost', 'description'],
    category: 'estimation',
    workflow_requires: ['project'],
  },

  // ------ Quotation Tools ------
  generate_quotation: {
    name: 'generate_quotation',
    description: 'Generate quotation PDF for a project',
    required: ['project_id'],
    optional: ['revision'],
    category: 'quotation',
    workflow_requires: ['project', 'estimation'],
  },
  generate_quotation_pdf: {
    name: 'generate_quotation_pdf',
    description: 'Download quotation as PDF',
    required: ['project_id'],
    optional: [],
    category: 'quotation',
    workflow_requires: ['project', 'estimation'],
  },
  send_quotation: {
    name: 'send_quotation',
    description: 'Send quotation email to client',
    required: ['project_id'],
    optional: ['email', 'message'],
    category: 'quotation',
    workflow_requires: ['project', 'estimation'],
  },

  // ------ RFQ Tools ------
  create_rfq: {
    name: 'create_rfq',
    description: 'Create a Request for Quotation to a vendor',
    required: ['project_id', 'vendor_id'],
    optional: ['materials', 'notes'],
    category: 'rfq',
  },
  send_rfq: {
    name: 'send_rfq',
    description: 'Send RFQ to a vendor',
    required: ['rfq_id'],
    optional: [],
    category: 'rfq',
  },

  // ------ Vendor PO Tools ------
  create_vendor_po: {
    name: 'create_vendor_po',
    description: 'Create a Vendor Purchase Order',
    required: ['project_id', 'vendor_id'],
    optional: ['items', 'delivery_date', 'notes'],
    category: 'vendor_po',
    workflow_requires: ['project', 'estimation'],
  },
  send_vendor_po: {
    name: 'send_vendor_po',
    description: 'Send Vendor Purchase Order to vendor',
    required: ['vendor_po_id'],
    optional: [],
    category: 'vendor_po',
  },
  upload_vendor_quote: {
    name: 'upload_vendor_quote',
    description: 'Upload a vendor quote for comparison',
    required: ['vendor_id', 'file'],
    optional: ['project_id', 'notes'],
    category: 'vendor_po',
  },

  // ------ Work Order Tools ------
  create_work_order: {
    name: 'create_work_order',
    description: 'Create a manufacturing work order',
    required: ['project_id'],
    optional: ['notes', 'target_date'],
    category: 'work_order',
    workflow_requires: ['project', 'estimation', 'sales_order'],
  },

  // ------ Invoice Tools ------
  generate_invoice: {
    name: 'generate_invoice',
    description: 'Generate an invoice for a project',
    required: ['project_id'],
    optional: ['invoice_type', 'tax_type', 'tax_percent', 'notes'],
    category: 'invoice',
  },
  send_invoice: {
    name: 'send_invoice',
    description: 'Send invoice to client via email',
    required: ['invoice_id'],
    optional: ['email', 'message'],
    category: 'invoice',
  },
  download_invoice: {
    name: 'download_invoice',
    description: 'Download invoice as PDF',
    required: ['invoice_id'],
    optional: [],
    category: 'invoice',
  },

  // ------ Document Tools ------
  upload_document: {
    name: 'upload_document',
    description: 'Upload a document to a project',
    required: ['project_id', 'file'],
    optional: ['description', 'category'],
    category: 'document',
  },
  download_document: {
    name: 'download_document',
    description: 'Download a project document',
    required: ['document_id'],
    optional: [],
    category: 'document',
  },
  list_documents: {
    name: 'list_documents',
    description: 'List documents for a project',
    required: ['project_id'],
    optional: [],
    category: 'document',
  },

  // ------ Inventory/Stock Tools ------
  view_stock: {
    name: 'view_stock',
    description: 'View stock/inventory levels',
    required: [],
    optional: ['material_name', 'search'],
    category: 'inventory',
  },
  add_stock: {
    name: 'add_stock',
    description: 'Add stock entry',
    required: ['material_id', 'quantity'],
    optional: ['unit_cost', 'supplier', 'notes'],
    category: 'inventory',
  },
  update_stock: {
    name: 'update_stock',
    description: 'Update stock quantity for a material',
    required: ['material_id', 'quantity'],
    optional: ['notes'],
    category: 'inventory',
  },

  // ------ Analytics Tools ------
  get_revenue_report: {
    name: 'get_revenue_report',
    description: 'Get revenue analytics and KPIs',
    required: [],
    optional: ['period'],
    category: 'analytics',
  },
  get_profit_report: {
    name: 'get_profit_report',
    description: 'Get profit and cost analysis',
    required: [],
    optional: ['period'],
    category: 'analytics',
  },
  get_project_performance: {
    name: 'get_project_performance',
    description: 'Get performance analysis for a project',
    required: ['project_id'],
    optional: [],
    category: 'analytics',
  },
  get_material_usage: {
    name: 'get_material_usage',
    description: 'Get material usage and inventory report',
    required: [],
    optional: ['material_name'],
    category: 'analytics',
  },
  get_active_orders: {
    name: 'get_active_orders',
    description: 'Get count and list of active orders',
    required: [],
    optional: [],
    category: 'analytics',
  },
  get_daily_summary: {
    name: 'get_daily_summary',
    description: 'Get daily business summary',
    required: [],
    optional: [],
    category: 'analytics',
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  WORKFLOW DEPENDENCY CHECKER
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const WORKFLOW_ORDER = [
  'project', 'estimation', 'quotation', 'sales_order',
  'vendor_po', 'work_order', 'production', 'quality',
  'logistics', 'invoice', 'analytics',
];

async function checkWorkflowDependency(toolName, params) {
  const tool = TOOL_DEFINITIONS[toolName];
  if (!tool?.workflow_requires) return { ok: true };

  const projectId = params.project_id;
  if (!projectId) return { ok: false, reason: 'Project ID is required for this action.' };

  const project = await Project.findByPk(projectId, {
    include: [
      { model: Estimate, as: 'estimates', required: false },
      { model: SalesOrder, as: 'salesOrders', required: false },
      { model: WorkOrder, as: 'workOrders', required: false },
    ],
  });

  if (!project) return { ok: false, reason: `Project not found.` };

  for (const req of tool.workflow_requires) {
    if (req === 'project') continue; // project exists
    if (req === 'estimation' && (!project.estimates || project.estimates.length === 0)) {
      return {
        ok: false,
        reason: `An estimation is required before you can ${tool.description.toLowerCase()}. Would you like me to create an estimation first?`,
        missing_step: 'estimation',
        project_id: projectId,
      };
    }
    if (req === 'sales_order' && (!project.salesOrders || project.salesOrders.length === 0)) {
      return {
        ok: false,
        reason: `A sales order/client PO is required before you can ${tool.description.toLowerCase()}. The client needs to confirm the order first.`,
        missing_step: 'sales_order',
        project_id: projectId,
      };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  TOOL EXECUTORS
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const toolExecutors = {
  // ------ Projects ------
  async list_projects(params, companyId) {
    const where = {};
    if (params.status) where.status = params.status;
    if (params.search) where.project_name = { [Op.iLike]: `%${params.search}%` };
    if (companyId) where.company_id = companyId;

    const projects = await Project.findAll({
      where,
      limit: params.limit || 10,
      order: [['updated_at', 'DESC']],
      attributes: ['id', 'project_name', 'status', 'deadline', 'created_at', 'updated_at'],
      include: [{ model: Client, as: 'client', attributes: ['client_name'], required: false }],
    });

    return {
      success: true,
      data: projects.map(p => ({
        id: p.id,
        name: p.project_name,
        status: p.status,
        client: p.client?.client_name || 'Unassigned',
        deadline: p.deadline,
        updated: p.updated_at,
      })),
      count: projects.length,
      message: projects.length ? `Found ${projects.length} project(s).` : 'No projects found.',
    };
  },

  async get_project(params, companyId) {
    let project;
    // Try by UUID first, then by name search
    if (params.identifier?.match(/^[0-9a-f-]{36}$/i)) {
      project = await Project.findOne({
        where: { id: params.identifier, ...(companyId ? { company_id: companyId } : {}) },
        include: [
          { model: Client, as: 'client', required: false },
          { model: Estimate, as: 'estimates', required: false },
          { model: SalesOrder, as: 'salesOrders', required: false },
        ],
      });
    }
    if (!project) {
      project = await Project.findOne({
        where: { project_name: { [Op.iLike]: `%${params.identifier}%` }, ...(companyId ? { company_id: companyId } : {}) },
        include: [
          { model: Client, as: 'client', required: false },
          { model: Estimate, as: 'estimates', required: false },
          { model: SalesOrder, as: 'salesOrders', required: false },
        ],
      });
    }
    if (!project) return { success: false, message: `Could not find a project matching "${params.identifier}".` };

    return {
      success: true,
      data: {
        id: project.id,
        name: project.project_name,
        status: project.status,
        client: project.client?.client_name || 'Unassigned',
        deadline: project.deadline,
        has_estimation: project.estimates?.length > 0,
        has_sales_order: project.salesOrders?.length > 0,
        created: project.created_at,
      },
      message: `Found project: ${project.project_name}`,
    };
  },

  async create_project(params, companyId) {
    // Validate client exists
    if (params.client_id) {
      const clientWhere = companyId ? { company_id: companyId } : {};
      const client = await Client.findOne({ where: { id: params.client_id, ...clientWhere } });
      if (!client) {
        // Try fuzzy matching by name
        const found = await Client.findOne({ where: { client_name: { [Op.iLike]: `%${params.client_id}%` }, ...clientWhere } });
        if (found) params.client_id = found.id;
        else return { success: false, message: `Client "${params.client_id}" not found.`, needsInput: 'client_id' };
      }
    }

    return {
      success: true,
      action: 'create_project',
      navigate: '/projects',
      params: {
        project_name: params.project_name,
        client_id: params.client_id,
        description: params.description || '',
        deadline: params.deadline || null,
      },
    

  async edit_project(params, companyId) {
    let project = await Project.findOne({ where: { id: params.project_id, ...(companyId ? { company_id: companyId } : {}) } });
    if (!project) {
      project = await Project.findOne({ where: { project_name: { [Op.iLike]: `%${params.project_id}%` }, ...(companyId ? { company_id: companyId } : {}) } });
      if (!project) return { success: false, message: `Project "${params.project_id}" not found.` };
    }
    return {
      success: true,
      action: 'navigate',
      navigate: `/projects/${project.id}`,
      message: `Opening project "${project.project_name}" for editing.`,
    };
  },

  async approve_project(params, companyId) {
    let project = await Project.findOne({ where: { id: params.project_id, ...(companyId ? { company_id: companyId } : {}) } });
    if (!project) {
      project = await Project.findOne({ where: { project_name: { [Op.iLike]: `%${params.project_id}%` }, ...(companyId ? { company_id: companyId } : {}) } });
      if (!project) return { success: false, message: `Project "${params.project_id}" not found.` };
    }

    const NEXT_STAGE = {
      'Draft': 'Pending Estimation',
      'Pending Estimation': 'Estimated',
      'Estimated': 'Quote Sent',
      'Quote Sent': 'Order Confirmed',
      'Order Confirmed': 'In Production',
      'In Production': 'Inspected',
      'Inspected': 'Shipped',
      'Shipped': 'Completed',
    };

    const nextStatus = params.stage || NEXT_STAGE[project.status] || null;
    if (!nextStatus) {
      return { success: false, message: `Project "${project.project_name}" is already "${project.status}" --- no further stage to advance to.` };
    }

    return {
      success: true,
      action: 'update_status',
      params: { project_id: project.id, status: nextStatus },
      message: `Ready to move "${project.project_name}" from ${project.status} --- ${nextStatus}.`,
    };
  },  message: `Ready to create project "${params.project_name}".`,
    };
  },

  async update_project_status(params, companyId) {
    const project = await Project.findOne({ where: { id: params.project_id, ...(companyId ? { company_id: companyId } : {}) } });
    if (!project) return { success: false, message: 'Project not found.' };

    return {
      success: true,
      action: 'update_status',
      params: { project_id: params.project_id, status: params.status },
      message: `Ready to update "${project.project_name}" status to ${params.status}.`,
    };
  },

  // ------ Clients ------
  async list_clients(params, companyId) {
    const where = {};
    if (params.search) where.client_name = { [Op.iLike]: `%${params.search}%` };
    if (companyId) where.company_id = companyId;

    const clients = await Client.findAll({
      where,
      limit: params.limit || 10,
      order: [['created_at', 'DESC']],
      attributes: ['id', 'client_name', 'contact_person', 'email', 'phone'],
    });

    return {
      success: true,
      data: clients.map(c => ({
        id: c.id,
        name: c.client_name,
        contact: c.contact_person,
        email: c.email,
    

  async edit_client(params, companyId) {
    const client = await Client.findOne({ where: { id: params.client_id, ...(companyId ? { company_id: companyId } : {}) } });
    if (!client) {
      const found = await Client.findOne({ where: { client_name: { [Op.iLike]: `%${params.client_id}%` }, ...(companyId ? { company_id: companyId } : {}) } });
      if (!found) return { success: false, message: `Client "${params.client_id}" not found.` };
      params.client_id = found.id;
    }
    return {
      success: true,
      action: 'navigate',
      navigate: `/clients/${params.client_id}`,
      message: `Opening client details to edit.`,
    };
  },    phone: c.phone,
      })),
      count: clients.length,
      message: clients.length ? `Found ${clients.length} client(s).` : 'No clients found.',
    };
  },

  async create_client(params, companyId, user) {
    if (!companyId) {
      return { success: false, message: 'No company context. Please log in again.' };
    }
    if (!params.client_name) {
      return { success: false, message: 'Client name is required.' };
    }
    try {
      const client = await Client.create({
        client_name: params.client_name,
        poc_name: params.contact_person || null,
        poc_email: params.email || null,
        poc_phone: params.phone || null,
        address: params.address || null,
        tax_id: params.tax_id || null,
        payment_terms: params.payment_terms || 'Net 30',
        company_id: companyId,
        created_by: user?.id || null,
      });
      return {
        success: true,
        data: { id: client.id, name: client.client_name },
        message: `Client "${client.client_name}" has been created successfully. Your data has been updated. Please check it in the Clients module.`,
      };
    } catch (err) {
      return { success: false, message: `Failed to create client: ${err.message}` };
    }
  },

  // ------ Vendors ------
  async list_vendors(params, companyId) {
    const where = {};
    if (params.search) where.vendor_name = { [Op.iLike]: `%${params.search}%` };
    if (companyId) where.company_id = companyId;

    const vendors = await Vendor.findAll({
      where,
      limit: params.limit || 10,
      order: [['created_at', 'DESC']],
      attributes: ['id', 'vendor_name', 'contact_person', 'contact_email'],
    });

    return {
      success: true,
      data: vendors.map(v => ({
        id: v.id,
        name: v.vendor_name,
        contact: v.contact_person,
        email: v.contact_email,
      })),
      count: vendors.length,
      message: vendors.length ? `Found ${vendors.length} vendor(s).` : 'No vendors found.',
    };
  },

  async edit_vendor(params, companyId) {
    const vendor = await Vendor.findOne({ where: { id: params.vendor_id, ...(companyId ? { company_id: companyId } : {}) } });
    if (!vendor) {
      const found = await Vendor.findOne({ where: { vendor_name: { [Op.iLike]: `%${params.vendor_id}%` }, ...(companyId ? { company_id: companyId } : {}) } });
      if (!found) return { success: false, message: `Vendor "${params.vendor_id}" not found.` };
      params.vendor_id = found.id;
    }
    return {
      success: true,
      action: 'navigate',
      navigate: `/vendors/${params.vendor_id}`,
      message: `Opening vendor details to edit.`,
    };
  },

  async create_vendor(params, companyId, user) {
    if (!companyId) {
      return { success: false, message: 'No company context. Please log in again.' };
    }
    if (!params.vendor_name) {
      return { success: false, message: 'Vendor name is required.' };
    }
    try {
      const vendor = await Vendor.create({
        vendor_name: params.vendor_name,
        contact_person: params.contact_person || null,
        contact_email: params.email || null,
        contact_phone: params.phone || null,
        address: params.address || null,
        tax_id: params.tax_id || null,
        service_categories: params.category ? [params.category] : [],
        company_id: companyId,
        created_by: user?.id || null,
      });
      return {
        success: true,
        data: { id: vendor.id, name: vendor.vendor_name },
        message: `Vendor "${vendor.vendor_name}" has been created successfully. Your data has been updated. Please check it in the Vendors module.`,
      };
    } catch (err) {
      return { success: false, message: `Failed to create vendor: ${err.message}` };
    }
  },

  // ------ Master Data: Raw Material ------
  async create_material(params, companyId, user) {
    if (!companyId) {
      return { success: false, message: 'No company context. Please log in again.' };
    }
    if (!params.material_category || !params.material_grade) {
      return { success: false, message: 'Material category and grade are required.' };
    }
    const density = parseFloat(params.density);
    if (Number.isNaN(density) || density <= 0) {
      return { success: false, message: 'Density must be a positive number (e.g. 7.85).' };
    }
    try {
      const material = await RawMaterial.create({
        material_category: params.material_category,
        material_grade: params.material_grade,
        condition: params.condition || 'New',
        density,
        form: params.form || null,
        shape: params.shape || null,
        cost_per_unit: params.cost_per_unit ? parseFloat(params.cost_per_unit) : null,
        notes: params.notes || null,
        company_id: companyId,
        created_by: user?.id || null,
      });
      return {
        success: true,
        data: { id: material.id, grade: material.material_grade },
        message: `Raw material "${material.material_grade}" has been created successfully. Your data has been updated. Please check it in the Raw Material Master.`,
      };
    } catch (err) {
      return { success: false, message: `Failed to create raw material: ${err.message}` };
    }
  },

  // ------ Master Data: Part / Job ------
  async create_part(params, companyId, user) {
    if (!companyId) {
      return { success: false, message: 'No company context. Please log in again.' };
    }
    if (!params.part_name) {
      return { success: false, message: 'Part name is required.' };
    }
    try {
      const part = await Part.create({
        part_name: params.part_name,
        part_number: params.part_number || null,
        description: params.description || null,
        revision: params.revision || 'R0',
        company_id: companyId,
        created_by: user?.id || null,
      });
      return {
        success: true,
        data: { id: part.id, name: part.part_name },
        message: `Part "${part.part_name}" has been created successfully. Your data has been updated. Please check it in the Parts Master.`,
      };
    } catch (err) {
      return { success: false, message: `Failed to create part: ${err.message}` };
    }
  },

  // ============================================================================
  // ------ Procurement: Create RFQ ------
  // ============================================================================
  async create_rfq(params, companyId, user) {
    if (!companyId) return { success: false, message: 'No company context. Please log in again.' };
    if (!params.vendor_name || !params.material_name || !params.required_quantity) {
      return { success: false, message: 'Vendor, material/item and required quantity are required.' };
    }

    try {
      // Look up vendor by name within company
      const vendor = await Vendor.findOne({
        where: { vendor_name: { [Op.iLike]: `%${params.vendor_name}%` }, company_id: companyId },
      });
      if (!vendor) {
        return {
          success: false,
          message: `Vendor "${params.vendor_name}" not found in your Vendors database. Please create the vendor first or check the name.`,
        };
      }

      // Look up material by name within company
      const material = await Material.findOne({
        where: { material_name: { [Op.iLike]: `%${params.material_name}%` }, company_id: companyId },
      });
      if (!material) {
        return {
          success: false,
          message: `Material "${params.material_name}" not found in the Inventory. Please add the material first or check the name.`,
        };
      }

      // Look up project (optional — use most recent if not provided)
      let project = null;
      if (params.project_name) {
        project = await Project.findOne({
          where: { project_name: { [Op.iLike]: `%${params.project_name}%` }, company_id: companyId },
          order: [['created_at', 'DESC']],
        });
        if (!project) {
          return {
            success: false,
            message: `Project "${params.project_name}" not found. Please check the project name.`,
          };
        }
      } else {
        project = await Project.findOne({
          where: { company_id: companyId },
          order: [['created_at', 'DESC']],
        });
        if (!project) {
          return {
            success: false,
            message: `No projects found. Please create a project first before raising an RFQ.`,
          };
        }
      }

      const qty = parseFloat(params.required_quantity);
      if (Number.isNaN(qty) || qty <= 0) {
        return { success: false, message: 'Required quantity must be a positive number.' };
      }

      const rfq = await VendorRFQ.create({
        project_id: project.id,
        material_id: material.id,
        vendor_id: vendor.id,
        required_quantity: qty,
        unit: params.unit || material.unit || null,
        status: 'pending',
        company_id: companyId,
        created_by: user?.id || null,
      });

      return {
        success: true,
        data: { id: rfq.id, vendor: vendor.vendor_name, material: material.material_name, project: project.project_name },
        message: `RFQ has been created successfully for vendor "${vendor.vendor_name}" (material: ${material.material_name}, qty: ${qty}). Your data has been updated. Please check it in the Procurement → RFQ section.`,
      };
    } catch (err) {
      return { success: false, message: `Failed to create RFQ: ${err.message}` };
    }
  },

  // ============================================================================
  // ------ Procurement: Create Purchase Order ------
  // ============================================================================
  async create_purchase_order(params, companyId, user) {
    if (!companyId) return { success: false, message: 'No company context. Please log in again.' };
    if (!params.vendor_name || !params.project_name || !params.item_description
        || !params.quantity || !params.unit_cost) {
      return { success: false, message: 'Vendor, project, item description, quantity and unit cost are all required.' };
    }

    try {
      const vendor = await Vendor.findOne({
        where: { vendor_name: { [Op.iLike]: `%${params.vendor_name}%` }, company_id: companyId },
      });
      if (!vendor) {
        return { success: false, message: `Vendor "${params.vendor_name}" not found.` };
      }

      const project = await Project.findOne({
        where: { project_name: { [Op.iLike]: `%${params.project_name}%` }, company_id: companyId },
        order: [['created_at', 'DESC']],
      });
      if (!project) {
        return { success: false, message: `Project "${params.project_name}" not found.` };
      }

      const qty = parseFloat(params.quantity);
      const unitCost = parseFloat(params.unit_cost);
      if (Number.isNaN(qty) || qty <= 0) return { success: false, message: 'Quantity must be a positive number.' };
      if (Number.isNaN(unitCost) || unitCost < 0) return { success: false, message: 'Unit cost must be a non-negative number.' };

      const lineTotal = qty * unitCost;
      const subtotal = lineTotal;
      const taxAmount = 0; // tax_type defaults to 'exempt'
      const grandTotal = subtotal + taxAmount;

      // Auto-generate PO number per-company
      const lastPO = await VendorPurchaseOrder.findOne({
        where: { company_id: project.company_id || null },
        order: [['po_number', 'DESC']],
      });
      const lastNum = lastPO?.po_number ? parseInt(String(lastPO.po_number).replace(/\D/g, ''), 10) || 0 : 0;
      const poNumber = `PO-${String(lastNum + 1).padStart(5, '0')}`;

      const po = await VendorPurchaseOrder.create({
        po_number: poNumber,
        project_id: project.id,
        vendor_id: vendor.id,
        po_date: new Date(),
        tax_type: params.tax_type || 'exempt',
        subtotal,
        tax_amount: taxAmount,
        grand_total: grandTotal,
        notes: params.notes || null,
        cost_mode: 'unit',
        status: 'draft',
        company_id: companyId,
        created_by: user?.id || null,
      });

      await VendorPOItem.create({
        vendor_po_id: po.id,
        part_description: params.item_description,
        quantity: qty,
        unit_cost: unitCost,
        line_total: lineTotal,
        selected: true,
      });

      return {
        success: true,
        data: { id: po.id, po_number: poNumber, vendor: vendor.vendor_name, project: project.project_name, grand_total: grandTotal },
        message: `Purchase Order ${poNumber} has been created successfully for vendor "${vendor.vendor_name}" (total: ${grandTotal.toLocaleString()}). Your data has been updated. Please check it in the Procurement → Purchase Orders section.`,
      };
    } catch (err) {
      return { success: false, message: `Failed to create Purchase Order: ${err.message}` };
    }
  },

  // ============================================================================
  // ------ Inventory: Add Item ------
  // ============================================================================
  async create_inventory_item(params, companyId, user) {
    if (!companyId) return { success: false, message: 'No company context. Please log in again.' };
    if (!params.item_name || !params.category || !params.unit || params.quantity === undefined) {
      return { success: false, message: 'Item name, category, unit and quantity are all required.' };
    }

    const validCategories = ['raw_material', 'consumable', 'safety_equipment', 'tools'];
    const category = String(params.category).toLowerCase().replace(/\s+/g, '_');
    if (!validCategories.includes(category)) {
      return {
        success: false,
        message: `Category must be one of: ${validCategories.join(', ')}.`,
      };
    }

    const qty = parseFloat(params.quantity);
    if (Number.isNaN(qty) || qty < 0) {
      return { success: false, message: 'Quantity must be a non-negative number.' };
    }

    try {
      // Create or reuse Material with same name
      let material = await Material.findOne({
        where: { material_name: { [Op.iLike]: params.item_name }, company_id: companyId },
      });
      if (!material) {
        material = await Material.create({
          material_name: params.item_name,
          category,
          unit: params.unit,
          grade: params.grade || null,
          description: params.description || null,
          default_cost: params.default_cost ? parseFloat(params.default_cost) : 0,
          company_id: companyId,
          created_by: user?.id || null,
        });
      }

      // Create or update stock entry
      const [stock, created] = await MaterialStock.findOrCreate({
        where: { material_id: material.id },
        defaults: {
          material_id: material.id,
          current_quantity: qty,
          unit: params.unit,
          company_id: companyId,
        },
      });
      if (!created) {
        stock.current_quantity = parseFloat(stock.current_quantity || 0) + qty;
        stock.last_updated = new Date();
        await stock.save();
      }

      return {
        success: true,
        data: { id: material.id, name: material.material_name, quantity: stock.current_quantity },
        message: `Inventory item "${material.material_name}" has been added successfully (${qty} ${params.unit}). Your data has been updated. Please check it in the Inventory module.`,
      };
    } catch (err) {
      return { success: false, message: `Failed to add inventory item: ${err.message}` };
    }
  },

  // ------ Inventory / Material library listing ------
  async list_materials(params, companyId) {
    if (!companyId) return { success: false, message: 'No company context.' };
    const where = { company_id: companyId, is_active: true };
    if (params.search) where.material_name = { [Op.iLike]: `%${params.search}%` };
    if (params.category) where.category = params.category;
    const materials = await Material.findAll({
      where,
      limit: params.limit || 20,
      order: [['material_name', 'ASC']],
      include: [{ model: MaterialStock, as: 'stock', required: false, attributes: ['current_quantity', 'unit'] }],
      attributes: ['id', 'material_name', 'category', 'grade', 'unit', 'default_cost'],
    });
    if (!materials.length) {
      return { success: true, data: [], count: 0, message: 'No materials found in your inventory yet.' };
    }
    const lines = materials.map((mat, i) => {
      const stock = mat.stock?.current_quantity ?? 0;
      const stockUnit = mat.stock?.unit || mat.unit || '';
      const grade = mat.grade ? ` (${mat.grade})` : '';
      return `${i + 1}. **${mat.material_name}**${grade} --- ${stock} ${stockUnit} --- ${mat.category}`;
    }).join('\n');
    return {
      success: true,
      data: materials,
      count: materials.length,
      message: `**Material Library (${materials.length})**\n\n${lines}`,
    };
  },

  // ------ Estimation ------
  async view_estimation(params) {
    const estimate = await Estimate.findOne({
      where: { project_id: params.project_id },
      order: [['revision', 'DESC']],
      include: [{ model: EstimateItem, as: 'items', required: false }],
    });

    if (!estimate) return { success: false, message: 'No estimation found for this project.' };

    return {
      success: true,
      data: {
        id: estimate.id,
        revision: estimate.revision,
        total_cost: estimate.total_cost,
        final_price: estimate.final_price,
        status: estimate.status,
        items_count: estimate.items?.length || 0,
      },
      message: `Estimation R${estimate.revision}: Total cost ---${Number(estimate.total_cost || 0).toLocaleString()}, Final price ---${Number(estimate.final_price || 0).toLocaleString()}`,
    };
  },

  async create_estimation(params) {
    const dep = await checkWorkflowDependency('create_estimation', params);
    if (!dep.ok) return { success: false, message: dep.reason, workflow_block: dep.missing_step };

    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 2, // Estimation tab index
      message: 'Opening the Estimation tab for this project. Add materials, labor, and overhead costs there.',
    };
  },

  // ------ Quotation ------
  async generate_quotation(params) {
    const dep = await checkWorkflowDependency('generate_quotation', params);
    if (!dep.ok) return { success: false, message: dep.reason, workflow_block: dep.missing_step };

    const estimate = await Estimate.findOne({
      where: { project_id: params.project_id, status: 'approved' },
      order: [['revision', 'DESC']],
    });

    if (!estimate) {
      return {
        success: false,
        message: 'No approved estimation found. The estimation must be approved before generating a quotation.',
      };
    }

    return {
      success: true,
      action: 'generate_quotation',
      navigate: `/projects/${params.project_id}`,
      tab: 1, // Quotation tab
      params: { estimate_id: estimate.id, project_id: params.project_id },
      message: `Ready to generate quotation from Estimation R${estimate.revision}.`,
    };
  },

  async send_quotation(params) {
    const dep = await checkWorkflowDependency('send_quotation', params);
    if (!dep.ok) return { success: false, message: dep.reason, workflow_block: dep.missing_step };

    return {
      success: true,
      action: 'send_quotation',
      navigate: `/projects/${params.project_id}`,
      tab: 1,
      message: 'Opening quotation tab to send the quotation email.',
    };
  },

  // ------ Vendor PO ------
  async create_vendor_po(params) {
    const dep = await checkWorkflowDependency('create_vendor_po', params);
    if (!dep.ok) return { success: false, message: dep.reason, workflow_block: dep.missing_step };

    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 4, // Vendor PO tab
      message: 'Opening the Vendor PO tab to create a purchase order.',
    };
  },

  // ------ Work Order ------
  async create_work_order(params) {
    const dep = await checkWorkflowDependency('create_work_order', params);
    if (!dep.ok) return { success: false, message: dep.reason, workflow_block: dep.missing_step };

    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 5, // Work Order tab
      message: 'Opening the Work Order tab to create a manufacturing work order.',
    };
  },

  // ------ Invoice ------
  async generate_invoice(params) {
    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 9, // Invoice tab
      message: 'Opening the Invoice tab to generate an invoice.',
    };
  },

  async download_invoice(params) {
    return {
      success: true,
      action: 'download_invoice',
      params: { invoice_id: params.invoice_id },
      message: 'Preparing invoice PDF for download.',
    };
  },

  // ------ Documents ------
  async list_documents(params) {
    const docs = await Document.findAll({
      where: { project_id: params.project_id },
      order: [['created_at', 'DESC']],
      attributes: ['id', 'doc_type', 'version', 'description', 'created_at'],
      limit: 20,
    });

    return {
      success: true,
      data: docs.map(d => ({
        id: d.id,
        type: d.doc_type,
        version: d.version,
        description: d.description,
        created: d.created_at,
      })),
      count: docs.length,
      message: docs.length ? `Found ${docs.length} document(s).` : 'No documents found for this project.',
    };
  },

  async upload_document(params) {
    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 10, // Documents tab
      message: 'Opening the Documents tab to upload your file.',
    };
  },

  // ------ Stock/Inventory ------
  async view_stock(params, companyId) {
    const where = {};
    if (params.material_name) where.material_name = { [Op.iLike]: `%${params.material_name}%` };
    if (params.search) where.material_name = { [Op.iLike]: `%${params.search}%` };
    if (companyId) where.company_id = companyId;

    const stocks = await Stock.findAll({
      where,
      limit: 15,
      order: [['created_at', 'DESC']],
    });

    if (stocks.length === 0 && (params.material_name || params.search)) {
      // Try materials table
      const mats = await Material.findAll({
        where: { name: { [Op.iLike]: `%${params.material_name || params.search}%` } },
        limit: 5,
      });
      if (mats.length) {
        return {
          success: true,
          data: mats.map(m => ({ name: m.name, grade: m.grade, specification: m.specification })),
          message: `Found ${mats.length} material(s) in the master database but no stock entries. Materials need to be added to stock.`,
        };
      }
      return { success: true, data: [], message: `No stock found for "${params.material_name || params.search}".` };
    }

    return {
      success: true,
      data: stocks.map(s => ({
        id: s.id,
        material: s.material_name,
        quantity: s.quantity,
        unit: s.unit,
        location: s.location,
      })),
      count: stocks.length,
      message: stocks.length ? `Found ${stocks.length} stock entries.` : 'No stock entries found.',
    };
  },

  async add_stock(params) {
    return {
      success: true,
      action: 'navigate',
      navigate: '/materials',
      message: 'Opening the Materials page to add stock entry.',
    };
  },

  // ------ Analytics ------
  async get_revenue_report(params) {
    try {
      // Revenue from invoices
      const invoiceRevenue = await Invoice.sum('final_total', {
        where: { status: { [Op.ne]: 'Cancelled' } },
      }) || 0;

      // Revenue from estimates (final_price of approved)
      const estimateRevenue = await Estimate.sum('final_price', {
        where: { status: 'approved' },
      }) || 0;

      // Count data
      const totalProjects = await Project.count();
      const activeProjects = await Project.count({
        where: { status: { [Op.notIn]: ['Completed', 'Cancelled'] } },
      });
      const completedProjects = await Project.count({
        where: { status: 'Completed' },
      });

      return {
        success: true,
        data: {
          invoice_revenue: invoiceRevenue,
          estimated_revenue: estimateRevenue,
          total_projects: totalProjects,
          active_projects: activeProjects,
          completed_projects: completedProjects,
        },
        message: `**Revenue Report**\n--- Invoice Revenue: ---${Number(invoiceRevenue).toLocaleString()}\n--- Estimated Revenue: ---${Number(estimateRevenue).toLocaleString()}\n--- Total Projects: ${totalProjects}\n--- Active: ${activeProjects} | Completed: ${completedProjects}`,
      };
    } catch (err) {
      return { success: false, message: 'Could not generate revenue report.' };
    }
  },

  async get_profit_report(params) {
    try {
      const revenue = await Invoice.sum('final_total', {
        where: { status: { [Op.ne]: 'Cancelled' } },
      }) || 0;

      const materialCost = await VendorPurchaseOrder.sum('grand_total') || 0;
      const processCost = await Estimate.sum('total_cost', {
        where: { status: 'approved' },
      }) || 0;

      const totalCost = materialCost + processCost;
      const profit = revenue - totalCost;
      const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';

      return {
        success: true,
        data: { revenue, material_cost: materialCost, process_cost: processCost, total_cost: totalCost, profit, margin },
        message: `**Profit Report**\n--- Revenue: ---${Number(revenue).toLocaleString()}\n--- Manufacturing Cost: ---${Number(totalCost).toLocaleString()}\n  - Raw Material: ---${Number(materialCost).toLocaleString()}\n  - Processing: ---${Number(processCost).toLocaleString()}\n--- Profit: ---${Number(profit).toLocaleString()}\n--- Margin: ${margin}%`,
      };
    } catch (err) {
      return { success: false, message: 'Could not generate profit report.' };
    }
  },

  async get_project_performance(params) {
    try {
      const project = await Project.findByPk(params.project_id, {
        include: [
          { model: Client, as: 'client', required: false },
          { model: Estimate, as: 'estimates', required: false },
          { model: Invoice, as: 'invoices', required: false },
        ],
      });
      if (!project) return { success: false, message: 'Project not found.' };

      const vendorCost = await VendorPurchaseOrder.sum('grand_total', {
        where: { project_id: params.project_id },
      }) || 0;

      const estimate = project.estimates?.find(e => e.status === 'approved') || project.estimates?.[0];
      const invoiceTotal = project.invoices?.reduce((sum, inv) => sum + Number(inv.final_total || 0), 0) || 0;
      const estCost = Number(estimate?.total_cost || 0);
      const estPrice = Number(estimate?.final_price || 0);
      const profit = invoiceTotal > 0 ? invoiceTotal - vendorCost - estCost : estPrice - vendorCost - estCost;
      const revenue = invoiceTotal > 0 ? invoiceTotal : estPrice;
      const margin = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0.0';

      return {
        success: true,
        data: {
          project: project.project_name,
          status: project.status,
          client: project.client?.client_name,
          revenue,
          manufacturing_cost: vendorCost + estCost,
          profit,
          margin,
        },
        message: `**${project.project_name}** Performance\n--- Status: ${project.status}\n--- Client: ${project.client?.client_name || 'N/A'}\n--- Revenue: ---${Number(revenue).toLocaleString()}\n--- Mfg Cost: ---${Number(vendorCost + estCost).toLocaleString()}\n--- Profit: ---${Number(profit).toLocaleString()}\n--- Margin: ${margin}%`,
      };
    } catch (err) {
      return { success: false, message: 'Could not generate project performance report.' };
    }
  },

  async get_material_usage(params) {
    try {
      const where = {};
      if (params.material_name) {
        where.part_description = { [Op.iLike]: `%${params.material_name}%` };
      }

      const items = await VendorPOItem.findAll({
        where,
        attributes: [
          'part_description',
          [fn('SUM', col('quantity')), 'total_qty'],
          [fn('SUM', col('line_total')), 'total_cost'],
        ],
        group: ['part_description'],
        order: [[fn('SUM', col('line_total')), 'DESC']],
        limit: 10,
      });

      if (items.length === 0) {
        return { success: true, data: [], message: 'No material usage data found.' };
      }

      const list = items.map(i => ({
        material: i.part_description,
        quantity: Number(i.get('total_qty')),
        cost: Number(i.get('total_cost')),
      }));

      const msg = list.map(m => `--- ${m.material}: Qty ${m.quantity}, Cost ---${Number(m.cost).toLocaleString()}`).join('\n');
      return {
        success: true,
        data: list,
        message: `**Material Usage Report**\n${msg}`,
      };
    } catch (err) {
      return { success: false, message: 'Could not generate material usage report.' };
    }
  },

  async get_active_orders(params, companyId) {
    try {
      const statuses = ['Order Confirmed', 'In Production', 'Inspected'];
      const projects = await Project.findAll({
        where: { status: { [Op.in]: statuses }, ...(companyId ? { company_id: companyId } : {}) },
        include: [{ model: Client, as: 'client', required: false }],
        order: [['updated_at', 'DESC']],
        limit: 10,
      });

      return {
        success: true,
        data: projects.map(p => ({
          id: p.id,
          name: p.project_name,
          status: p.status,
          client: p.client?.client_name,
        })),
        count: projects.length,
        message: projects.length
          ? `**${projects.length} Active Order(s)**\n${projects.map((p, i) => `${i + 1}. ${p.project_name} --- ${p.status} (${p.client?.client_name || 'N/A'})`).join('\n')}`
          : 'No active orders right now.',
      };
    } catch (err) {
      return { success: false, message: 'Could not fetch active orders.' };
    }
  },

  async get_daily_summary(params, companyId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const scope = companyId ? { company_id: companyId } : {};

      const [totalProjects, activeOrders, inProduction, readyToShip, completedToday, totalRevenue, totalClients] = await Promise.all([
        Project.count({ where: scope }),
        Project.count({ where: { ...scope, status: { [Op.in]: ['Order Confirmed', 'In Production', 'Inspected'] } } }),
        Project.count({ where: { ...scope, status: 'In Production' } }),
        Project.count({ where: { ...scope, status: 'Inspected' } }),
        Project.count({ where: { ...scope, status: 'Completed', updated_at: { [Op.gte]: today } } }),
        Invoice.sum('final_total', { where: { ...scope, status: { [Op.ne]: 'Cancelled' } } }) || 0,
        Client.count({ where: scope }),
      ]);

      const lowStock = await Stock.count({ where: { quantity: { [Op.lte]: 5 } } });

      return {
        success: true,
        data: {
          total_projects: totalProjects,
          active_orders: activeOrders,
          in_production: inProduction,
          ready_to_ship: readyToShip,
          completed_today: completedToday,
          total_revenue: totalRevenue || 0,
          total_clients: totalClients,
          low_stock_alerts: lowStock,
        },
        message: `**---- Daily Summary**\n--- Total Projects: ${totalProjects}\n--- Active Orders: ${activeOrders}\n--- In Production: ${inProduction}\n--- Ready to Ship: ${readyToShip}\n--- Completed Today: ${completedToday}\n--- Total Revenue: ---${Number(totalRevenue || 0).toLocaleString()}\n--- Total Clients: ${totalClients}${lowStock > 0 ? `\n--- ------ Low Stock Alerts: ${lowStock}` : ''}`,
      };
    } catch (err) {
      return { success: false, message: 'Could not generate daily summary.' };
    }
  },

  // ------ RFQ ------
  async create_rfq(params) {
    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 4,
      message: 'Opening the Vendor PO tab to create an RFQ.',
    };
  },

  async send_rfq(params) {
    return {
      success: true,
      action: 'send_rfq',
      params: { rfq_id: params.rfq_id },
      message: 'Ready to send the RFQ to the vendor.',
    };
  },

  // ------ Missing Executors (gap-fill) ------

  async update_estimation(params) {
    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 1,
      message: 'Opening the Estimation tab so you can update the estimation.',
    };
  },

  async add_estimation_material(params) {
    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 1,
      message: 'Opening the Estimation tab to add a new material line-item.',
    };
  },

  async generate_quotation_pdf(params) {
    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 2,
      message: 'Opening the Quotation tab to download the PDF.',
    };
  },

  async send_vendor_po(params) {
    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 4,
      message: 'Opening the Vendor PO tab to send the purchase order.',
    };
  },

  async upload_vendor_quote(params) {
    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 4,
      message: 'Opening the Vendor PO tab to upload the vendor quote for comparison.',
    };
  },

  async send_invoice(params) {
    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 11,
      message: 'Opening the Invoice tab to send the invoice via email.',
    };
  },

  async download_document(params) {
    return {
      success: true,
      action: 'navigate_tab',
      navigate: `/projects/${params.project_id}`,
      tab: 9,
      message: 'Opening the Documents tab to download the requested document.',
    };
  },

  async update_stock(params, companyId) {
    try {
      const { Material } = require('../models');
      const where = {};
      if (params.material_id) where.id = params.material_id;
      else if (params.name) where.name = { [require('sequelize').Op.iLike]: `%${params.name}%` };
      else return { success: false, message: 'Please specify a material name or ID to update.' };
      if (companyId) where.company_id = companyId;

      const material = await Material.findOne({ where });
      if (!material) return { success: false, message: 'Material not found.' };

      if (params.quantity !== undefined) material.stock_quantity = params.quantity;
      if (params.unit_price !== undefined) material.unit_price = params.unit_price;
      await material.save();

      return {
        success: true,
        message: `--- Stock updated for **${material.name}** --- quantity is now **${material.stock_quantity}**.`,
      };
    } catch (err) {
      return { success: false, message: 'Could not update stock. ' + err.message };
    }
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  EXECUTE TOOL (with workflow check + logging)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function executeTool(toolName, params, user, companyId) {
  const executor = toolExecutors[toolName];
  if (!executor) return { success: false, message: `Unknown action: ${toolName}` };

  // Check workflow
  const dep = await checkWorkflowDependency(toolName, params);
  if (!dep.ok) return { success: false, message: dep.reason, workflow_block: dep.missing_step };

  // Execute
  const result = await executor(params, companyId, user);

  // Log the action
  try {
    await AuditLog.create({
      user_id: user?.id,
      action: `ai_tool:${toolName}`,
      entity_type: 'ai_action',
      details: {
        tool: toolName,
        params,
        success: result.success,
        approved: true,
        timestamp: new Date().toISOString(),
      },
      company_id: companyId,
    });
  } catch (logErr) {
    console.error('AI action log error:', logErr.message);
  }

  return result;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//  FUZZY ENTITY RESOLVER
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

async function resolveEntity(type, text) {
  const t = (text || '').trim();
  if (!t) return null;

  if (type === 'client') {
    const client = await Client.findOne({
      where: { client_name: { [Op.iLike]: `%${t}%` } },
      attributes: ['id', 'client_name'],
    });
    return client ? { id: client.id, name: client.client_name } : null;
  }

  if (type === 'vendor') {
    const vendor = await Vendor.findOne({
      where: { company_name: { [Op.iLike]: `%${t}%` } },
      attributes: ['id', 'company_name'],
    });
    return vendor ? { id: vendor.id, name: vendor.company_name } : null;
  }

  if (type === 'project') {
    const project = await Project.findOne({
      where: { project_name: { [Op.iLike]: `%${t}%` } },
      attributes: ['id', 'project_name', 'status'],
      include: [{ model: Client, as: 'client', attributes: ['client_name'], required: false }],
    });
    return project ? { id: project.id, name: project.project_name, status: project.status, client: project.client?.client_name } : null;
  }

  if (type === 'material') {
    const mat = await Material.findOne({
      where: { name: { [Op.iLike]: `%${t}%` } },
      attributes: ['id', 'name', 'grade'],
    });
    return mat ? { id: mat.id, name: mat.name, grade: mat.grade } : null;
  }

  return null;
}

module.exports = {
  TOOL_DEFINITIONS,
  WORKFLOW_ORDER,
  executeTool,
  checkWorkflowDependency,
  resolveEntity,
  toolExecutors,
};
