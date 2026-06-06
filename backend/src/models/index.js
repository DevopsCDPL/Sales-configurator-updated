const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

const isProduction = process.env.NODE_ENV === 'production';
const privateDatabaseUrl = process.env.DATABASE_PRIVATE_URL || process.env.POSTGRES_PRIVATE_URL;
const publicOrGenericDatabaseUrl = process.env.DATABASE_URL;

const hasPrivateHostConfig = Boolean(
  (process.env.RAILWAY_PRIVATE_DOMAIN || process.env.POSTGRES_HOST || process.env.PGHOST) &&
  (process.env.POSTGRES_DATABASE || process.env.PGDATABASE || process.env.DB_NAME) &&
  (process.env.POSTGRES_USER || process.env.PGUSER || process.env.DB_USER) &&
  (process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || process.env.DB_PASSWORD)
);

const databaseUrl = privateDatabaseUrl || (!hasPrivateHostConfig ? publicOrGenericDatabaseUrl : null);
const isRailwayRuntime = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_PRIVATE_DOMAIN ||
  process.env.PGHOST
);
const shouldUseSsl = isProduction && (Boolean(databaseUrl) || isRailwayRuntime);

const dbHost =
  process.env.RAILWAY_PRIVATE_DOMAIN ||
  process.env.POSTGRES_HOST ||
  process.env.PGHOST ||
  process.env.DB_HOST ||
  'localhost';

const dbPort =
  process.env.POSTGRES_PORT ||
  process.env.PGPORT ||
  process.env.DB_PORT ||
  5432;

const dbName =
  process.env.POSTGRES_DATABASE ||
  process.env.PGDATABASE ||
  process.env.DB_NAME ||
  'forgedas';

const dbUser =
  process.env.POSTGRES_USER ||
  process.env.PGUSER ||
  process.env.DB_USER ||
  'postgres';

const dbPassword =
  process.env.POSTGRES_PASSWORD ||
  process.env.PGPASSWORD ||
  process.env.DB_PASSWORD ||
  'postgres';

if (isProduction && !privateDatabaseUrl && hasPrivateHostConfig && publicOrGenericDatabaseUrl) {
  logger.info('Using private Postgres host variables over DATABASE_URL to avoid public proxy routing.');
}

// Pool tuning — kept well below PostgreSQL's default max_connections (100)
// to leave headroom for migrations, admin tools, and other services.
//   max 20  : handles concurrent request spikes without exhausting the DB
//   min  3  : keeps warm connections ready, avoids cold-start latency
//   acquire  60 s : generous timeout for high-load queuing before error
//   idle    10 s : reclaim unused connections quickly
const POOL = { max: 20, min: 3, acquire: 60000, idle: 10000 };

const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, {
      dialect: 'postgres',
      logging: false,
      pool: POOL,
      dialectOptions: shouldUseSsl
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
    })
  : new Sequelize(
      dbName,
      dbUser,
      dbPassword,
      {
        host: dbHost,
        port: dbPort,
        dialect: 'postgres',
        logging: false,
        dialectOptions: shouldUseSsl
          ? { ssl: { require: true, rejectUnauthorized: false } }
          : {},
        pool: POOL,
      }
    );

// Phase 4: Initialize `app.company_id` to '' on every new physical DB connection.
// This ensures fresh pool connections default to platform-admin mode (see all rows)
// until tenantScope middleware sets the correct value for the incoming request.
//
// Phase 4b: After startup DDL is complete, _rlsRoleActive is set to true by
// activateRls(). From that point, every new connection also executes
// SET ROLE forged_app, making the connection a non-superuser (NOBYPASSRLS)
// so that PostgreSQL RLS policies are actually enforced for all app queries.
let _rlsRoleActive = false;

sequelize.addHook('afterConnect', async (connection) => {
  try {
    await connection.query("SELECT set_config('app.company_id', '', false)");
    if (_rlsRoleActive) {
      // Switch to the restricted application role. forged_app is NOBYPASSRLS, so
      // all subsequent queries on this connection are subject to RLS policies.
      await connection.query('SET ROLE forged_app');
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'RLS: afterConnect init failed');
  }
});

/**
 * Activates PostgreSQL RLS enforcement for all future DB connections.
 *
 * Call this ONCE, after initDatabase() has finished all DDL (sync, alter table).
 * It:
 *   1. Sets _rlsRoleActive = true so every new pool connection will SET ROLE forged_app.
 *   2. Drains the pool — destroys idle connections (including any leftover superuser
 *      connections from startup). The pool stays functional; new connections are
 *      created on demand and go through afterConnect with forged_app role.
 *
 * Idempotent — safe to call multiple times.
 */
/**
 * Returns true after activateRls() has been called — i.e. the connection
 * pool is switching all new connections to the forged_app role. Exposed so
 * the /api/health/db-role endpoint can report the in-process flag state.
 */
function isRlsActive() {
  return _rlsRoleActive;
}

async function activateRls() {
  if (_rlsRoleActive) return;
  _rlsRoleActive = true;
  try {
    // Destroy idle connections individually so they are recreated as forged_app.
    // We avoid pool.drain() because it halts the pool entirely (generic-pool API).
    // Instead, we use destroyAllNow() which destroys idle connections while keeping
    // the pool functional — new connections go through afterConnect with SET ROLE forged_app.
    const pool = sequelize.connectionManager.pool;
    if (typeof pool.destroyAllNow === 'function') {
      await pool.destroyAllNow();
      logger.info('[Phase 4] RLS activated: idle connections destroyed, new connections will use forged_app role.');
    } else {
      // Fallback: rely on idle timeout (10 s) to recycle old superuser connections.
      logger.info('[Phase 4] RLS activated: flag set, idle connections will expire via idle timeout.');
    }
  } catch (err) {
    logger.warn({ err: err.message }, '[Phase 4] RLS pool recycle warning (non-fatal)');
  }
}

// Import models
const User = require('./User')(sequelize);
const Client = require('./Client')(sequelize);
const Carrier = require('./Carrier')(sequelize);
const Vendor = require('./Vendor')(sequelize);
const Project = require('./Project')(sequelize);
const Estimate = require('./Estimate')(sequelize);
const EstimateItem = require('./EstimateItem')(sequelize);
const SalesOrder = require('./SalesOrder')(sequelize);
const WorkOrder = require('./WorkOrder')(sequelize);
const QualityRecord = require('./QualityRecord')(sequelize);
const Document = require('./Document')(sequelize);
const Company = require('./Company')(sequelize);
const Permission = require('./Permission')(sequelize);
const AuditLog = require('./AuditLog')(sequelize);
const PermissionTemplate = require('./PermissionTemplate')(sequelize);
const LoginHistory = require('./LoginHistory')(sequelize);
const Session = require('./Session')(sequelize);
const CustomRole = require('./CustomRole')(sequelize);
const ApprovalWorkflow = require('./ApprovalWorkflow')(sequelize);
const RiskScore = require('./RiskScore')(sequelize);
const ApiToken = require('./ApiToken')(sequelize);
const Webhook = require('./Webhook')(sequelize);
const ActivityTimeline = require('./ActivityTimeline')(sequelize);
const Conversation = require('./Conversation')(sequelize);
const ConversationParticipant = require('./ConversationParticipant')(sequelize);
const Message = require('./Message')(sequelize);
const Material = require('./Material')(sequelize);
const VendorMaterial = require('./VendorMaterial')(sequelize);
const VendorRFQ = require('./VendorRFQ')(sequelize);
const VendorPO = require('./VendorPO')(sequelize);
const RFQBundle = require('./RFQBundle')(sequelize);
const RFQBundleItem = require('./RFQBundleItem')(sequelize);
const VendorPurchaseOrder = require('./VendorPurchaseOrder')(sequelize);
const VendorPOItem = require('./VendorPOItem')(sequelize);
const ProjectAnalytics = require('./ProjectAnalytics')(sequelize);
const Stock = require('./Stock')(sequelize);
const Invoice = require('./Invoice')(sequelize);
const Setting = require('./Setting')(sequelize);
const Part = require('./Part')(sequelize);
const PartDimension = require('./PartDimension')(sequelize);
const PartTemplate = require('./PartTemplate')(sequelize);
const OtpToken = require('./OtpToken')(sequelize);

// Team Models
const Team = require('./Team')(sequelize);
const TeamMember = require('./TeamMember')(sequelize);
const TeamPermission = require('./TeamPermission')(sequelize);
const TeamActivity = require('./TeamActivity')(sequelize);

// System Module Config
const SystemModuleConfig = require('./SystemModuleConfig')(sequelize);

// File Manager
const FileManagerFolder = require('./FileManagerFolder')(sequelize);

// Raw Material Master
const RawMaterial = require('./RawMaterial')(sequelize);

// Material Stock / Inventory Models
const MaterialStock = require('./MaterialStock')(sequelize);
const MaterialTransaction = require('./MaterialTransaction')(sequelize);
const MaterialVendorMapping = require('./MaterialVendorMapping')(sequelize);

// Procurement Models
const ProcurementRFQ = require('./ProcurementRFQ')(sequelize);
const ProcurementRFQItem = require('./ProcurementRFQItem')(sequelize);
const ProcurementRFQVendor = require('./ProcurementRFQVendor')(sequelize);
const ProcurementVendorQuote = require('./ProcurementVendorQuote')(sequelize);
const ProcurementPO = require('./ProcurementPO')(sequelize);
const ProcurementPOItem = require('./ProcurementPOItem')(sequelize);

// Management Procurement Models (independent module)
const MgmtProcurementRFQ = require('./MgmtProcurementRFQ')(sequelize);
const MgmtProcurementPO = require('./MgmtProcurementPO')(sequelize);

// Calendar Events
const CalendarEvent = require('./CalendarEvent')(sequelize);

// New Document (clean metadata table — isolated, no associations)
const NewDocument = require('./NewDocument')(sequelize);

// ── Configurator models (Sales Configurator → Forge migration, Phase 1) ──
const configuratorModels = require('./configurator')(sequelize);
const ConfiguratorComponentCategory      = configuratorModels.ConfiguratorComponentCategory;
const ConfiguratorComponent              = configuratorModels.ConfiguratorComponent;
const ConfiguratorComponentCompatibility = configuratorModels.ConfiguratorComponentCompatibility;
const ConfiguratorConfiguration          = configuratorModels.ConfiguratorConfiguration;
const ConfiguratorSystemParameters       = configuratorModels.ConfiguratorSystemParameters;
const ConfiguratorSystemSection          = configuratorModels.ConfiguratorSystemSection;
const ConfiguratorBomItem                = configuratorModels.ConfiguratorBomItem;
const ConfiguratorLabourLine             = configuratorModels.ConfiguratorLabourLine;
const ConfiguratorQuotation              = configuratorModels.ConfiguratorQuotation;
const ConfiguratorQuotationItem          = configuratorModels.ConfiguratorQuotationItem;
const ConfiguratorComexCopperSnapshot    = configuratorModels.ConfiguratorComexCopperSnapshot;
const ConfiguratorSldDocument            = configuratorModels.ConfiguratorSldDocument;

// Define associations
// Company <-> User associations
Company.hasMany(User, { foreignKey: 'company_id', as: 'users' });
User.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// Company <-> Vendor associations
Company.hasMany(Vendor, { foreignKey: 'company_id', as: 'vendors' });
Vendor.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// Company <-> Client associations
Company.hasMany(Client, { foreignKey: 'company_id', as: 'clients' });
Client.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// Company <-> Project associations
Company.hasMany(Project, { foreignKey: 'company_id', as: 'projects' });
Project.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// Vendor creator
Vendor.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
User.hasMany(Vendor, { foreignKey: 'created_by', as: 'createdVendors' });

// Client creator
Client.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
User.hasMany(Client, { foreignKey: 'created_by', as: 'createdClients' });

// User self-association (who created this user)
User.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
User.hasMany(User, { foreignKey: 'created_by', as: 'createdUsers' });

// User associations
User.hasMany(Project, { foreignKey: 'prepared_by', as: 'preparedProjects' });

// Client associations
Client.hasMany(Project, { foreignKey: 'client_id', as: 'projects' });
Project.belongsTo(Client, { foreignKey: 'client_id', as: 'client' });

// Project associations
Project.belongsTo(User, { foreignKey: 'prepared_by', as: 'preparedBy' });
Project.hasMany(Estimate, { foreignKey: 'project_id', as: 'estimate' });
Project.hasOne(SalesOrder, { foreignKey: 'project_id', as: 'salesOrder' });
Project.hasOne(WorkOrder, { foreignKey: 'project_id', as: 'workOrder' });
Project.hasOne(QualityRecord, { foreignKey: 'project_id', as: 'qualityRecord' });
Project.hasMany(Document, { foreignKey: 'project_id', as: 'documents' });

// Estimate associations
Estimate.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
Estimate.hasMany(EstimateItem, { foreignKey: 'estimate_id', as: 'items' });
Estimate.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(Estimate, { foreignKey: 'company_id', as: 'estimates' });

// EstimateItem associations
EstimateItem.belongsTo(Estimate, { foreignKey: 'estimate_id', as: 'estimate' });

// SalesOrder associations
SalesOrder.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
SalesOrder.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(SalesOrder, { foreignKey: 'company_id', as: 'salesOrders' });

// WorkOrder associations
WorkOrder.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
WorkOrder.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(WorkOrder, { foreignKey: 'company_id', as: 'workOrders' });

// QualityRecord associations
QualityRecord.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
QualityRecord.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(QualityRecord, { foreignKey: 'company_id', as: 'qualityRecords' });

// Document associations
Document.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
Document.belongsTo(User, { foreignKey: 'generated_by', as: 'generatedBy' });
Document.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploadedBy' });
Document.belongsTo(FileManagerFolder, { foreignKey: 'folder_id', as: 'folder' });
Document.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// FileManagerFolder associations
FileManagerFolder.hasMany(FileManagerFolder, { foreignKey: 'parent_id', as: 'children' });
FileManagerFolder.belongsTo(FileManagerFolder, { foreignKey: 'parent_id', as: 'parent' });
FileManagerFolder.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
FileManagerFolder.belongsTo(Part, { foreignKey: 'part_id', as: 'part' });
FileManagerFolder.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
FileManagerFolder.hasMany(Document, { foreignKey: 'folder_id', as: 'documents' });
Project.hasMany(FileManagerFolder, { foreignKey: 'project_id', as: 'fileManagerFolders' });

// AuditLog associations
AuditLog.belongsTo(User, { foreignKey: 'performed_by', as: 'performer' });
AuditLog.belongsTo(User, { foreignKey: 'entity_id', as: 'targetUser', constraints: false });
AuditLog.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(AuditLog, { foreignKey: 'company_id', as: 'auditLogs' });

// PermissionTemplate associations
PermissionTemplate.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
PermissionTemplate.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Company.hasMany(PermissionTemplate, { foreignKey: 'company_id', as: 'permissionTemplates' });

// LoginHistory associations
LoginHistory.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(LoginHistory, { foreignKey: 'user_id', as: 'loginHistory' });
LoginHistory.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(LoginHistory, { foreignKey: 'company_id', as: 'loginHistories' });

// Session associations
Session.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(Session, { foreignKey: 'user_id', as: 'sessions' });
Session.belongsTo(User, { foreignKey: 'revoked_by', as: 'revoker', constraints: false });
Session.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(Session, { foreignKey: 'company_id', as: 'sessions' });

// CustomRole associations
CustomRole.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(CustomRole, { foreignKey: 'company_id', as: 'customRoles' });
CustomRole.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
User.belongsTo(CustomRole, { foreignKey: 'custom_role_id', as: 'customRole' });

// ApprovalWorkflow associations
ApprovalWorkflow.belongsTo(User, { foreignKey: 'requested_by', as: 'requester' });
ApprovalWorkflow.belongsTo(User, { foreignKey: 'decided_by', as: 'decider', constraints: false });
ApprovalWorkflow.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(ApprovalWorkflow, { foreignKey: 'company_id', as: 'approvalWorkflows' });

// ApiToken associations
ApiToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
ApiToken.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
User.hasMany(ApiToken, { foreignKey: 'user_id', as: 'apiTokens' });

// Webhook associations
Webhook.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Webhook.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Company.hasMany(Webhook, { foreignKey: 'company_id', as: 'webhooks' });

// ActivityTimeline associations
ActivityTimeline.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
ActivityTimeline.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Company.hasMany(ActivityTimeline, { foreignKey: 'company_id', as: 'activities' });
User.hasMany(ActivityTimeline, { foreignKey: 'user_id', as: 'activities' });

// Conversation associations
Conversation.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Conversation.hasMany(ConversationParticipant, { foreignKey: 'conversation_id', as: 'participants' });
Conversation.hasMany(Message, { foreignKey: 'conversation_id', as: 'messages' });

ConversationParticipant.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
ConversationParticipant.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Message.belongsTo(Conversation, { foreignKey: 'conversation_id', as: 'conversation' });
Message.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });
Conversation.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(Conversation, { foreignKey: 'company_id', as: 'conversations' });

// Material associations
Material.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(Material, { foreignKey: 'company_id', as: 'materials' });
Material.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// Material <-> MaterialVendorMapping (one-to-many)
Material.hasMany(MaterialVendorMapping, { foreignKey: 'material_id', as: 'vendorMappings', onDelete: 'CASCADE' });
MaterialVendorMapping.belongsTo(Material, { foreignKey: 'material_id', as: 'material' });
MaterialVendorMapping.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
Vendor.hasMany(MaterialVendorMapping, { foreignKey: 'vendor_id', as: 'materialMappings' });

// Vendor -> VendorMaterial (one-to-many: vendor has many material supply entries)
Vendor.hasMany(VendorMaterial, { foreignKey: 'vendor_id', as: 'vendorMaterials', onDelete: 'CASCADE' });
VendorMaterial.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });

// VendorRFQ associations
VendorRFQ.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
VendorRFQ.belongsTo(Material, { foreignKey: 'material_id', as: 'material' });
VendorRFQ.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
VendorRFQ.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
VendorRFQ.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// VendorPO associations
VendorPO.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
VendorPO.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
VendorPO.belongsTo(Material, { foreignKey: 'material_id', as: 'material' });
VendorPO.belongsTo(VendorRFQ, { foreignKey: 'rfq_id', as: 'rfq' });
VendorPO.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
VendorPO.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// RFQBundle associations (Multi-Part RFQ System)
RFQBundle.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
RFQBundle.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
RFQBundle.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
RFQBundle.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
RFQBundle.hasMany(RFQBundleItem, { foreignKey: 'rfq_bundle_id', as: 'items', onDelete: 'CASCADE' });
Project.hasMany(RFQBundle, { foreignKey: 'project_id', as: 'rfqBundles' });
Vendor.hasMany(RFQBundle, { foreignKey: 'vendor_id', as: 'rfqBundles' });

// RFQBundleItem associations
RFQBundleItem.belongsTo(RFQBundle, { foreignKey: 'rfq_bundle_id', as: 'bundle' });

// VendorPurchaseOrder associations
VendorPurchaseOrder.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
VendorPurchaseOrder.belongsTo(RFQBundle, { foreignKey: 'rfq_bundle_id', as: 'rfqBundle' });
VendorPurchaseOrder.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
VendorPurchaseOrder.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
VendorPurchaseOrder.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
VendorPurchaseOrder.hasMany(VendorPOItem, { foreignKey: 'vendor_po_id', as: 'items', onDelete: 'CASCADE' });
Project.hasMany(VendorPurchaseOrder, { foreignKey: 'project_id', as: 'vendorPurchaseOrders' });
RFQBundle.hasOne(VendorPurchaseOrder, { foreignKey: 'rfq_bundle_id', as: 'purchaseOrder' });

// VendorPOItem associations
VendorPOItem.belongsTo(VendorPurchaseOrder, { foreignKey: 'vendor_po_id', as: 'purchaseOrder' });

// ProjectAnalytics associations
Project.hasMany(ProjectAnalytics, { foreignKey: 'project_id', as: 'analytics' });
ProjectAnalytics.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
ProjectAnalytics.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(ProjectAnalytics, { foreignKey: 'company_id', as: 'projectAnalytics' });

// Stock associations
Stock.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(Stock, { foreignKey: 'company_id', as: 'stocks' });
Stock.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Stock.belongsTo(RawMaterial, { foreignKey: 'raw_material_id', as: 'rawMaterial' });
RawMaterial.hasMany(Stock, { foreignKey: 'raw_material_id', as: 'stocks' });

// Invoice associations
Project.hasMany(Invoice, { foreignKey: 'project_id', as: 'invoices' });
Invoice.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
Invoice.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(Invoice, { foreignKey: 'company_id', as: 'invoices' });

// Part associations
Part.belongsTo(RawMaterial, { foreignKey: 'raw_material_id', as: 'rawMaterial' });
RawMaterial.hasMany(Part, { foreignKey: 'raw_material_id', as: 'parts' });
Part.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
Vendor.hasMany(Part, { foreignKey: 'vendor_id', as: 'parts' });
Part.belongsTo(Client, { foreignKey: 'client_id', as: 'client' });
Client.hasMany(Part, { foreignKey: 'client_id', as: 'parts' });
Part.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Part.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(Part, { foreignKey: 'company_id', as: 'parts' });
Part.hasMany(PartDimension, { foreignKey: 'part_id', as: 'dimensions_list' });
PartDimension.belongsTo(Part, { foreignKey: 'part_id', as: 'part' });
PartDimension.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
PartTemplate.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(PartTemplate, { foreignKey: 'company_id', as: 'part_templates' });

// ─── Raw Material Master Associations ─────────────────────────────────────
RawMaterial.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(RawMaterial, { foreignKey: 'company_id', as: 'rawMaterials' });
RawMaterial.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// ─── Material Stock / Inventory Associations ────────────────────────────────

// MaterialStock <-> Material (one-to-one)
Material.hasOne(MaterialStock, { foreignKey: 'material_id', as: 'stock' });
MaterialStock.belongsTo(Material, { foreignKey: 'material_id', as: 'material' });
MaterialStock.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(MaterialStock, { foreignKey: 'company_id', as: 'materialStocks' });

// MaterialTransaction <-> Material, Vendor, Project, User, Company
Material.hasMany(MaterialTransaction, { foreignKey: 'material_id', as: 'transactions' });
MaterialTransaction.belongsTo(Material, { foreignKey: 'material_id', as: 'material' });
MaterialTransaction.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
MaterialTransaction.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
MaterialTransaction.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
MaterialTransaction.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(MaterialTransaction, { foreignKey: 'company_id', as: 'materialTransactions' });

// ─── Procurement Associations ────────────────────────────────────────────────

// ProcurementRFQ associations
ProcurementRFQ.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(ProcurementRFQ, { foreignKey: 'company_id', as: 'procurementRfqs' });
ProcurementRFQ.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
ProcurementRFQ.hasMany(ProcurementRFQItem, { foreignKey: 'rfq_id', as: 'items', onDelete: 'CASCADE' });
ProcurementRFQ.hasMany(ProcurementRFQVendor, { foreignKey: 'rfq_id', as: 'vendors', onDelete: 'CASCADE' });
ProcurementRFQ.hasMany(ProcurementVendorQuote, { foreignKey: 'rfq_id', as: 'quotes', onDelete: 'CASCADE' });
ProcurementRFQ.hasMany(ProcurementPO, { foreignKey: 'rfq_id', as: 'purchaseOrders' });

// ProcurementRFQItem associations
ProcurementRFQItem.belongsTo(ProcurementRFQ, { foreignKey: 'rfq_id', as: 'rfq' });
ProcurementRFQItem.belongsTo(Material, { foreignKey: 'material_id', as: 'material' });

// ProcurementRFQVendor associations
ProcurementRFQVendor.belongsTo(ProcurementRFQ, { foreignKey: 'rfq_id', as: 'rfq' });
ProcurementRFQVendor.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });

// ProcurementVendorQuote associations
ProcurementVendorQuote.belongsTo(ProcurementRFQ, { foreignKey: 'rfq_id', as: 'rfq' });
ProcurementVendorQuote.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
ProcurementVendorQuote.belongsTo(Material, { foreignKey: 'material_id', as: 'material' });

// ProcurementPO associations
ProcurementPO.belongsTo(ProcurementRFQ, { foreignKey: 'rfq_id', as: 'rfq' });
ProcurementPO.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
ProcurementPO.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
ProcurementPO.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
ProcurementPO.hasMany(ProcurementPOItem, { foreignKey: 'po_id', as: 'items', onDelete: 'CASCADE' });

// ProcurementPOItem associations
ProcurementPOItem.belongsTo(ProcurementPO, { foreignKey: 'po_id', as: 'po' });
ProcurementPOItem.belongsTo(Material, { foreignKey: 'material_id', as: 'material' });

// ─── Team Associations ───────────────────────────────────────────────────────
Team.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(Team, { foreignKey: 'company_id', as: 'teams' });
Team.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Team.hasMany(TeamMember, { foreignKey: 'team_id', as: 'members', onDelete: 'CASCADE' });
Team.hasMany(TeamPermission, { foreignKey: 'team_id', as: 'permissions', onDelete: 'CASCADE' });
Team.hasMany(TeamActivity, { foreignKey: 'team_id', as: 'activities', onDelete: 'CASCADE' });

TeamMember.belongsTo(Team, { foreignKey: 'team_id', as: 'team' });
TeamMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(TeamMember, { foreignKey: 'user_id', as: 'teamMemberships' });

TeamPermission.belongsTo(Team, { foreignKey: 'team_id', as: 'team' });

TeamActivity.belongsTo(Team, { foreignKey: 'team_id', as: 'team' });
TeamActivity.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// ─── Management Procurement Associations (fully isolated) ────────────────────
MgmtProcurementRFQ.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
MgmtProcurementRFQ.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
MgmtProcurementRFQ.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
MgmtProcurementRFQ.hasMany(MgmtProcurementPO, { foreignKey: 'rfq_id', as: 'purchaseOrders' });

MgmtProcurementPO.belongsTo(MgmtProcurementRFQ, { foreignKey: 'rfq_id', as: 'rfq' });
MgmtProcurementPO.belongsTo(Vendor, { foreignKey: 'vendor_id', as: 'vendor' });
MgmtProcurementPO.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
MgmtProcurementPO.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// ─── Calendar Event Associations ─────────────────────────────────────────────
CalendarEvent.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(CalendarEvent, { foreignKey: 'company_id', as: 'calendarEvents' });
CalendarEvent.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
User.hasMany(CalendarEvent, { foreignKey: 'created_by', as: 'calendarEvents' });
CalendarEvent.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
Project.hasMany(CalendarEvent, { foreignKey: 'project_id', as: 'calendarEvents' });

// ─── Setting Associations ─────────────────────────────────────────────────────
// Settings now have a proper company_id column (Phase 3).
// settingsService handles all scoping explicitly, so no auto-hook needed.
Setting.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(Setting, { foreignKey: 'company_id', as: 'settingRows' });

// ─── Configurator Associations (Phase 1 — Sales Configurator migration) ────
// All configurator models are tenant-scoped via company_id and get their
// auto-scoping hook below alongside the rest of the schema.

// Company ↔ configurator entities
Company.hasMany(ConfiguratorComponentCategory, { foreignKey: 'company_id', as: 'configuratorCategories' });
ConfiguratorComponentCategory.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
ConfiguratorComponentCategory.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

Company.hasMany(ConfiguratorComponent, { foreignKey: 'company_id', as: 'configuratorComponents' });
ConfiguratorComponent.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
ConfiguratorComponent.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// Component ↔ Component compatibility (self-M2M via explicit join model)
ConfiguratorComponent.hasMany(ConfiguratorComponentCompatibility, {
  foreignKey: 'component_id',
  as: 'compatibilityLinks',
  onDelete: 'CASCADE',
});
ConfiguratorComponent.hasMany(ConfiguratorComponentCompatibility, {
  foreignKey: 'compatible_component_id',
  as: 'reverseCompatibilityLinks',
  onDelete: 'CASCADE',
});
ConfiguratorComponentCompatibility.belongsTo(ConfiguratorComponent, {
  foreignKey: 'component_id',
  as: 'component',
});
ConfiguratorComponentCompatibility.belongsTo(ConfiguratorComponent, {
  foreignKey: 'compatible_component_id',
  as: 'compatibleWith',
});
ConfiguratorComponent.belongsToMany(ConfiguratorComponent, {
  through: ConfiguratorComponentCompatibility,
  foreignKey: 'component_id',
  otherKey: 'compatible_component_id',
  as: 'compatibleComponents',
});

// Project ↔ Configuration (bidirectional)
Project.hasMany(ConfiguratorConfiguration, { foreignKey: 'project_id', as: 'configurations' });
ConfiguratorConfiguration.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
ConfiguratorConfiguration.belongsTo(User, { foreignKey: 'user_id', as: 'owner' });
ConfiguratorConfiguration.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
ConfiguratorConfiguration.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(ConfiguratorConfiguration, { foreignKey: 'company_id', as: 'configuratorConfigurations' });

// Configuration ↔ System sections
ConfiguratorConfiguration.hasMany(ConfiguratorSystemSection, {
  foreignKey: 'configuration_id',
  as: 'sections',
  onDelete: 'CASCADE',
});
ConfiguratorSystemSection.belongsTo(ConfiguratorConfiguration, {
  foreignKey: 'configuration_id',
  as: 'configuration',
});
ConfiguratorSystemSection.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// Configuration ↔ BOM items
ConfiguratorConfiguration.hasMany(ConfiguratorBomItem, {
  foreignKey: 'configuration_id',
  as: 'bomItems',
  onDelete: 'CASCADE',
});
ConfiguratorBomItem.belongsTo(ConfiguratorConfiguration, {
  foreignKey: 'configuration_id',
  as: 'configuration',
});
ConfiguratorBomItem.belongsTo(ConfiguratorComponent, {
  foreignKey: 'component_id',
  as: 'component',
});
ConfiguratorComponent.hasMany(ConfiguratorBomItem, {
  foreignKey: 'component_id',
  as: 'bomUsages',
});
ConfiguratorBomItem.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// Configuration ↔ Labour lines
ConfiguratorConfiguration.hasMany(ConfiguratorLabourLine, {
  foreignKey: 'configuration_id',
  as: 'labourLines',
  onDelete: 'CASCADE',
});
ConfiguratorLabourLine.belongsTo(ConfiguratorConfiguration, {
  foreignKey: 'configuration_id',
  as: 'configuration',
});
ConfiguratorLabourLine.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// System parameters (per user, per company)
ConfiguratorSystemParameters.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
ConfiguratorSystemParameters.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
User.hasOne(ConfiguratorSystemParameters, { foreignKey: 'user_id', as: 'configuratorSystemParameters' });

// Configuration ↔ Quotation (bidirectional)
ConfiguratorConfiguration.hasMany(ConfiguratorQuotation, {
  foreignKey: 'configuration_id',
  as: 'quotations',
});
ConfiguratorQuotation.belongsTo(ConfiguratorConfiguration, {
  foreignKey: 'configuration_id',
  as: 'configuration',
});
Project.hasMany(ConfiguratorQuotation, { foreignKey: 'project_id', as: 'configuratorQuotations' });
ConfiguratorQuotation.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
ConfiguratorQuotation.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
Company.hasMany(ConfiguratorQuotation, { foreignKey: 'company_id', as: 'configuratorQuotations' });
ConfiguratorQuotation.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
ConfiguratorQuotation.belongsTo(Document, { foreignKey: 'pdf_document_id', as: 'pdfDocument' });

// Quotation ↔ Quotation items (bidirectional)
ConfiguratorQuotation.hasMany(ConfiguratorQuotationItem, {
  foreignKey: 'quotation_id',
  as: 'items',
  onDelete: 'CASCADE',
});
ConfiguratorQuotationItem.belongsTo(ConfiguratorQuotation, {
  foreignKey: 'quotation_id',
  as: 'quotation',
});
ConfiguratorQuotationItem.belongsTo(ConfiguratorComponent, {
  foreignKey: 'component_id',
  as: 'component',
});
ConfiguratorQuotationItem.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// Comex copper snapshots
Company.hasMany(ConfiguratorComexCopperSnapshot, {
  foreignKey: 'company_id',
  as: 'comexCopperSnapshots',
});
ConfiguratorComexCopperSnapshot.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
ConfiguratorComexCopperSnapshot.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// SLD documents
ConfiguratorConfiguration.hasMany(ConfiguratorSldDocument, {
  foreignKey: 'configuration_id',
  as: 'sldDocuments',
  onDelete: 'CASCADE',
});
ConfiguratorSldDocument.belongsTo(ConfiguratorConfiguration, {
  foreignKey: 'configuration_id',
  as: 'configuration',
});
ConfiguratorSldDocument.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });
Project.hasMany(ConfiguratorSldDocument, { foreignKey: 'project_id', as: 'sldDocuments' });
ConfiguratorSldDocument.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });
ConfiguratorSldDocument.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
ConfiguratorSldDocument.belongsTo(Document, { foreignKey: 'rendered_document_id', as: 'renderedDocument' });

// ─── Automatic Tenant Scoping Hooks ──────────────────────────────────────────
// Uses AsyncLocalStorage (tenantContext) set by tenantScope middleware.
// Automatically injects company_id into WHERE clauses (beforeFind) and
// new record payloads (beforeCreate/beforeBulkCreate) for all tenant models.
// This is a SAFETY NET — controllers must still explicitly pass req.tenantScope.
// If context is absent (cron jobs, seeds, background tasks), hooks are no-ops.

const tenantContext = require('../middleware/tenantContext');

// ── _skipTenantScope allowlist (Phase 3) ───────────────────────────────────
// _skipTenantScope: true bypasses the Sequelize auto-scoping hook entirely.
// It must ONLY be used in services that build their own explicit WHERE clause
// with a company_id already present. This allowlist is the single source of
// truth for every legitimate use.
//
// To add a new entry: add the path suffix here AND add an INTERNAL_ONLY
// comment with a justification on the usage site itself. Do NOT copy this
// flag into controllers or routes — that is a cross-tenant data leak.
const _SKIP_TENANT_SCOPE_ALLOWLIST = [
  'services/settingsService.js',
  'services/documentNumberingService.js',
  // salesOrderService performs global sales_order_number collision checks to
  // handle legacy rows (e.g., company_id=NULL) and stale global unique indexes.
  // INTERNAL_ONLY: every _skipTenantScope usage must be constrained and read-only.
  'services/salesOrderService.js',
  // workOrderService performs global work_order_number collision checks to
  // handle legacy rows (e.g., company_id=NULL) and stale global unique indexes.
  // INTERNAL_ONLY: every _skipTenantScope usage must be constrained and read-only.
  'services/workOrderService.js',
  // fileManagerService queries root folders (company_id=null) alongside tenant folders;
  // every call that uses _skipTenantScope explicitly includes company_id in WHERE.
  'services/fileManagerService.js',
];

/**
 * Called from the beforeFind hook whenever _skipTenantScope is set.
 * - Verifies the caller is on the allowlist (via call stack inspection).
 * - Throws in non-production if the caller is not on the allowlist, so
 *   it is caught immediately during development/testing.
 * - In production it logs a CRITICAL security alert instead of throwing,
 *   to avoid crashing live requests — but the issue must be investigated.
 * - Always emits an audit log line so every legitimate use is traceable.
 *
 * @param {string} modelName  - Sequelize model name for the log message
 */
function _assertSkipTenantScopeAllowed(modelName) {
  const stack = new Error().stack.replace(/\\/g, '/');
  const allowed = _SKIP_TENANT_SCOPE_ALLOWLIST.some(entry => stack.includes(entry));

  if (!allowed) {
    const msg =
      `[SECURITY] _skipTenantScope used on ${modelName} from an UNAUTHORIZED caller. ` +
      `Only files listed in _SKIP_TENANT_SCOPE_ALLOWLIST in models/index.js may use this flag. ` +
      `Add the file to the allowlist only if it supplies an explicit company_id WHERE clause. ` +
      `\nStack:\n${stack}`;

    if (process.env.NODE_ENV === 'production') {
      // Non-fatal in production — alert but do not crash a live request.
      // THIS MUST BE INVESTIGATED. Cross-tenant data may be exposed.
      logger.error({ msg }, 'SECURITY CRITICAL: unauthorized tenant scope bypass');
    } else {
      throw new Error(msg);
    }
    return; // unauthorized — do not emit the audit line
  }

  // Audit trail: log every legitimate bypass so it is visible in logs.
  logger.info({ model: modelName }, 'tenantContext: _skipTenantScope authorised — caller handles explicit company_id scoping');
}

// Models with a company_id column that should be auto-scoped.
const TENANT_MODELS = [
  User, Client, Vendor, Project, Estimate, EstimateItem, SalesOrder, WorkOrder,
  QualityRecord, Document, AuditLog, PermissionTemplate, LoginHistory, Session,
  CustomRole, ApprovalWorkflow, ApiToken, Webhook, ActivityTimeline,
  Conversation, Material, VendorRFQ, VendorPO, RFQBundle, RFQBundleItem,
  VendorPurchaseOrder, ProjectAnalytics, Stock, Invoice, Part, PartDimension,
  PartTemplate, Team, FileManagerFolder, RawMaterial, MaterialStock,
  MaterialTransaction, ProcurementRFQ, ProcurementRFQItem, ProcurementRFQVendor,
  ProcurementVendorQuote, ProcurementPO, ProcurementPOItem,
  MgmtProcurementRFQ, MgmtProcurementPO, CalendarEvent, NewDocument,
  SalesOrder, Invoice, PermissionTemplate,
  RiskScore,
  // Configurator (Phase 1)
  ConfiguratorComponentCategory, ConfiguratorComponent,
  ConfiguratorComponentCompatibility, ConfiguratorConfiguration,
  ConfiguratorSystemParameters, ConfiguratorSystemSection,
  ConfiguratorBomItem, ConfiguratorLabourLine,
  ConfiguratorQuotation, ConfiguratorQuotationItem,
  ConfiguratorComexCopperSnapshot, ConfiguratorSldDocument,
];

// De-duplicate (some models appear twice in the list above for clarity)
const uniqueTenantModels = [...new Set(TENANT_MODELS)];

for (const Model of uniqueTenantModels) {
  // beforeFind: inject company_id filter when context is set
  Model.addHook('beforeFind', 'tenantAutoScope', (options) => {
    // ── Case 1: _skipTenantScope — validate allowlist first ───────────────
    // The caller has declared it will handle its own scoping. Verify it is
    // on the allowlist before allowing the bypass. If not → throw (dev) or
    // CRITICAL log (prod). If yes → emit audit log and return immediately.
    if (options._skipTenantScope) {
      _assertSkipTenantScopeAllowed(Model.name);
      return;
    }

    options.where = options.where || {};

    const ctx = tenantContext.get();

    // ── Case 2: No ALS context (background task with no wrapper) ──────────
    // Running outside an HTTP request with no runWithTenantContext() wrapper.
    // Warn so the developer can find and fix the unguarded query.
    if (ctx === null) {
      if (!options.where.company_id) {
        logger.warn(
          { model: Model.name, caller: new Error().stack.split('\n')[2]?.trim() },
          'tenantContext: query called with no tenant context — wrap in runWithTenantContext() or runAsPlatformAdmin()'
        );
      }
      return;
    }

    // ── Case 3: Platform-admin context — no company_id filter needed ──────
    const companyId = tenantContext.getCompanyId();
    if (!companyId) return;

    // ── Case 4: Tenant context — inject company_id ────────────────────────
    if (!options.where.company_id) {
      options.where.company_id = companyId;
    }
  });

  // beforeCreate: inject company_id on new records when context is set
  Model.addHook('beforeCreate', 'tenantAutoScope', (instance, options) => {
    // Respect _skipTenantScope — caller has set explicit company_id in defaults
    if (options && options._skipTenantScope) return;
    const companyId = tenantContext.getCompanyId();
    if (!companyId) return;
    // Only set if company_id field exists on the model and isn't already set
    if (instance.rawAttributes && instance.rawAttributes.company_id) {
      if (!instance.company_id) {
        instance.company_id = companyId;
      }
    }
  });

  // beforeBulkCreate: inject company_id on each record
  Model.addHook('beforeBulkCreate', 'tenantAutoScope', (records) => {
    const companyId = tenantContext.getCompanyId();
    if (!companyId) return;
    for (const instance of records) {
      if (instance.rawAttributes && instance.rawAttributes.company_id) {
        if (!instance.company_id) {
          instance.company_id = companyId;
        }
      }
    }
  });
}

module.exports = {
  sequelize,
  activateRls,
  isRlsActive,
  User,
  Client,
  Carrier,
  Vendor,
  Project,
  Estimate,
  EstimateItem,
  SalesOrder,
  WorkOrder,
  QualityRecord,
  Document,
  Company,
  Permission,
  AuditLog,
  PermissionTemplate,
  LoginHistory,
  Session,
  CustomRole,
  ApprovalWorkflow,
  RiskScore,
  ApiToken,
  Webhook,
  ActivityTimeline,
  Conversation,
  ConversationParticipant,
  Message,
  Material,
  VendorMaterial,
  VendorRFQ,
  VendorPO,
  RFQBundle,
  RFQBundleItem,
  VendorPurchaseOrder,
  VendorPOItem,
  ProjectAnalytics,
  Stock,
  Invoice,
  Setting,
  Part,
  PartDimension,
  PartTemplate,
  // Material Stock / Inventory Models
  MaterialStock,
  MaterialTransaction,
  MaterialVendorMapping,
  // Procurement Models
  ProcurementRFQ,
  ProcurementRFQItem,
  ProcurementRFQVendor,
  ProcurementVendorQuote,
  ProcurementPO,
  ProcurementPOItem,
  // Raw Material Master
  RawMaterial,
  // Management Procurement Models
  MgmtProcurementRFQ,
  MgmtProcurementPO,
  // Team Models
  Team,
  TeamMember,
  TeamPermission,
  TeamActivity,
  // OTP Tokens
  OtpToken,
  // System Module Config
  SystemModuleConfig,
  // File Manager
  FileManagerFolder,
  // Calendar Events
  CalendarEvent,
  // New Document (clean metadata table)
  NewDocument,
  // Configurator (Sales Configurator → Forge migration, Phase 1)
  ConfiguratorComponentCategory,
  ConfiguratorComponent,
  ConfiguratorComponentCompatibility,
  ConfiguratorConfiguration,
  ConfiguratorSystemParameters,
  ConfiguratorSystemSection,
  ConfiguratorBomItem,
  ConfiguratorLabourLine,
  ConfiguratorQuotation,
  ConfiguratorQuotationItem,
  ConfiguratorComexCopperSnapshot,
  ConfiguratorSldDocument,
};
