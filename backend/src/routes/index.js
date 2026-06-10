const express = require('express');
const router = express.Router();
const { tenantScope } = require('../middleware/tenantScope');
const { applyUuidValidation } = require('../middleware/validateUuid');

const authRoutes = require('./authRoutes');
const passwordResetRoutes = require('./passwordReset');
const userRoutes = require('./userRoutes');
const clientRoutes = require('./clientRoutes');
const vendorRoutes = require('./vendorRoutes');
const projectRoutes = require('./projectRoutes');
const estimateRoutes = require('./estimateRoutes');
const salesOrderRoutes = require('./salesOrderRoutes');
const workOrderRoutes = require('./workOrderRoutes');
const qualityRoutes = require('./qualityRoutes');
const logisticsRoutes = require('./logisticsRoutes');
const documentRoutes = require('./documentRoutes');
const settingsRoutes = require('./settingsRoutes');
const companyRoutes = require('./companyRoutes');
const permissionRoutes = require('./permissionRoutes');
const permissionTemplateRoutes = require('./permissionTemplateRoutes');
const auditLogRoutes = require('./auditLogRoutes');
const sessionRoutes = require('./sessionRoutes');
const customRoleRoutes = require('./customRoleRoutes');
const approvalRoutes = require('./approvalRoutes');
const riskRoutes = require('./riskRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const setupRoutes = require('./setupRoutes');
const chatRoutes = require('./chatRoutes');
const aiAssistantRoutes = require('./aiAssistantRoutes');
const materialRoutes = require('./materialRoutes');
const businessAnalyticsRoutes = require('./businessAnalyticsRoutes');
const vendorProcurementRoutes = require('./vendorProcurementRoutes');
const stockRoutes = require('./stockRoutes');
const invoiceRoutes = require('./invoice');
const searchRoutes = require('./searchRoutes');
const recycleBinRoutes = require('./recycleBinRoutes');
const partRoutes = require('./partRoutes');
const materialStockRoutes = require('./materialStockRoutes');
const materialTransactionRoutes = require('./materialTransactionRoutes');
const procurementRoutes = require('./procurementRoutes');
const mgmtProcurementRoutes = require('./mgmtProcurementRoutes');
const rawMaterialRoutes = require('./rawMaterialRoutes');
const documentNumberingRoutes = require('./documentNumberingRoutes');
const coAdminRoutes = require('./coAdminRoutes');
const fileManagerRoutes = require('./fileManagerRoutes');
const systemConfigRoutes = require('./systemConfigRoutes');
const teamRoutes = require('./teamRoutes');
const platformAdminRoutes = require('./platformAdminRoutes');
const calendarEventRoutes = require('./calendarEventRoutes');
const configuratorRoutes = require('./configuratorRoutes');
const configuratorV2Routes = require('./configuratorV2Routes');

// Register UUID param validators on every sub-router.
// router.param() is local to the router instance where the param is defined,
// so we must apply it to each child router — the parent router cannot see
// params declared in children.
[
  authRoutes, passwordResetRoutes, userRoutes, clientRoutes, vendorRoutes,
  projectRoutes, estimateRoutes, salesOrderRoutes, workOrderRoutes,
  qualityRoutes, logisticsRoutes, documentRoutes, settingsRoutes,
  companyRoutes, permissionRoutes, permissionTemplateRoutes, auditLogRoutes,
  sessionRoutes, customRoleRoutes, approvalRoutes, riskRoutes, analyticsRoutes,
  setupRoutes, chatRoutes, aiAssistantRoutes, materialRoutes,
  businessAnalyticsRoutes, vendorProcurementRoutes, stockRoutes, invoiceRoutes,
  searchRoutes, recycleBinRoutes, partRoutes, materialStockRoutes,
  materialTransactionRoutes, procurementRoutes, mgmtProcurementRoutes,
  rawMaterialRoutes, documentNumberingRoutes, coAdminRoutes, fileManagerRoutes,
  systemConfigRoutes, teamRoutes, platformAdminRoutes, calendarEventRoutes,
  configuratorRoutes,
].forEach(applyUuidValidation);

router.use('/setup', setupRoutes);
router.use('/auth', authRoutes);
router.use('/password', passwordResetRoutes);
router.use('/users', userRoutes);
router.use('/clients', clientRoutes);
router.use('/vendors', vendorRoutes);
router.use('/projects', projectRoutes);
router.use('/estimates', estimateRoutes);
router.use('/sales-orders', salesOrderRoutes);
router.use('/work-orders', workOrderRoutes);
router.use('/quality', qualityRoutes);
router.use('/logistics', logisticsRoutes);
router.use('/documents', documentRoutes);
router.use('/settings', settingsRoutes);
router.use('/document-numbering', documentNumberingRoutes);
router.use('/companies', companyRoutes);
router.use('/permissions', permissionRoutes);
router.use('/permission-templates', permissionTemplateRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/sessions', sessionRoutes);
router.use('/custom-roles', customRoleRoutes);
router.use('/approvals', approvalRoutes);
router.use('/risk', riskRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/chat', chatRoutes);
router.use('/ai-assistant', aiAssistantRoutes);
router.use('/materials', materialRoutes);
router.use('/business-analytics', businessAnalyticsRoutes);
router.use('/vendor-procurement', vendorProcurementRoutes);
router.use('/stocks', stockRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/search', searchRoutes);
router.use('/recycle-bin', recycleBinRoutes);
router.use('/parts', partRoutes);
router.use('/material-stock', materialStockRoutes);
router.use('/material-transactions', materialTransactionRoutes);
router.use('/procurement', procurementRoutes);
router.use('/mgmt-procurement', mgmtProcurementRoutes);
router.use('/raw-materials', rawMaterialRoutes);
router.use('/co-admin', coAdminRoutes);
router.use('/file-manager', fileManagerRoutes);
router.use('/system-config', systemConfigRoutes);
router.use('/teams', teamRoutes);
router.use('/platform-admin', platformAdminRoutes);
router.use('/calendar-events', calendarEventRoutes);
router.use('/configurator', configuratorRoutes);
// V2 spine (Phases A–F) — inert unless CONFIGURATOR_V2_SPINE=true
router.use('/configurator-v2', configuratorV2Routes);

module.exports = router;
