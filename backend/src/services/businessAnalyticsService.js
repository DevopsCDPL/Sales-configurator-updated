const { Op, fn, col, literal } = require('sequelize');
const {
  sequelize, Project, Estimate, EstimateItem, Client, User,
  SalesOrder, WorkOrder, Invoice, ProjectAnalytics,
} = require('../models');

class BusinessAnalyticsService {

  // --------- Helper: get latest estimate from array ------------------------------------------------------------------------------
  _latestEstimate(p) {
    const estimates = Array.isArray(p.estimate) ? p.estimate : (p.estimate ? [p.estimate] : []);
    return estimates.length > 0
      ? estimates.reduce((a, b) => ((a.revision ?? 0) > (b.revision ?? 0) ? a : b))
      : null;
  }

  /**
   * Enhanced KPIs with full status breakdown
   */
  async getKPIs(companyId, dateFilter) {
    const dateWhere = this._buildDateWhere(dateFilter, companyId);

    const projects = await Project.findAll({
      where: dateWhere,
      include: [
        { model: Estimate, as: 'estimate', attributes: ['id', 'final_price', 'total_cost', 'raw_material_cost', 'process_cost', 'overhead_cost', 'margin_percent', 'revision'] },
        { model: Client, as: 'client', attributes: ['id', 'client_name'] },
        { model: WorkOrder, as: 'workOrder', attributes: ['id', 'status', 'release_date', 'target_date'] },
        { model: ProjectAnalytics, as: 'analytics', attributes: ['mfg_cost', 'total'] },
      ],
    });

    let totalRevenue = 0, totalCost = 0, rawMaterialCost = 0, processCost = 0, overheadCost = 0;
    let marginSum = 0, marginCount = 0;
    let activeProjects = 0, completedOrders = 0, pendingOrders = 0, inProduction = 0, deliveredOrders = 0;
    const totalProjects = projects.length;

    projects.forEach(p => {
      const latest = this._latestEstimate(p);
      const rev = latest ? (parseFloat(latest.final_price) || 0) : 0;
      totalRevenue += rev;

      // Actual MFG cost from user-entered Analytics tab data
      const analyticsRows = p.analytics || [];
      const projectMfgCost = analyticsRows.reduce((sum, a) => sum + (parseFloat(a.mfg_cost) || 0), 0);
      totalCost += projectMfgCost;

      // Estimate-based cost breakdown (reference)
      if (latest) {
        rawMaterialCost += parseFloat(latest.raw_material_cost) || 0;
        processCost += parseFloat(latest.process_cost) || 0;
        overheadCost += parseFloat(latest.overhead_cost) || 0;
      }

      // Margin from projects with actual cost data
      if (rev > 0 && projectMfgCost > 0) {
        marginSum += ((rev - projectMfgCost) / rev) * 100;
        marginCount++;
      }

      if (['draft', 'estimated', 'quoted'].includes(p.status)) pendingOrders++;
      if (['order_confirmed', 'in_production', 'inspected'].includes(p.status)) activeProjects++;
      if (p.status === 'in_production') inProduction++;
      if (p.status === 'shipped') deliveredOrders++;
      if (['shipped', 'closed'].includes(p.status)) completedOrders++;
    });

    const totalProfit = totalRevenue - totalCost;
    const avgMargin = marginCount > 0 ? marginSum / marginCount : (totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0);

    // Pending work orders
    const pendingWorkOrders = projects.filter(p => p.workOrder && p.workOrder.status === 'pending').length;

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      avgMargin: Math.round(avgMargin * 100) / 100,
      rawMaterialCost: Math.round(rawMaterialCost * 100) / 100,
      processCost: Math.round(processCost * 100) / 100,
      overheadCost: Math.round(overheadCost * 100) / 100,
      totalProjects,
      activeProjects,
      completedOrders,
      pendingOrders,
      inProduction,
      deliveredOrders,
      pendingWorkOrders,
    };
  }

  /**
   * Revenue trend by month with cost & profit
   */
  async getRevenueTrend(companyId, dateFilter) {
    const dateWhere = this._buildDateWhere(dateFilter, companyId);

    const projects = await Project.findAll({
      where: dateWhere,
      include: [
        { model: Estimate, as: 'estimate', attributes: ['final_price', 'total_cost', 'revision'] },
        { model: ProjectAnalytics, as: 'analytics', attributes: ['mfg_cost'] },
      ],
      attributes: ['id', 'created_at'],
      order: [['created_at', 'ASC']],
    });

    const monthMap = {};
    projects.forEach(p => {
      const month = new Date(p.created_at).toISOString().slice(0, 7);
      const latest = this._latestEstimate(p);
      const rev = latest ? (parseFloat(latest.final_price) || 0) : 0;
      const cost = (p.analytics || []).reduce((sum, a) => sum + (parseFloat(a.mfg_cost) || 0), 0);
      if (!monthMap[month]) monthMap[month] = { revenue: 0, cost: 0, profit: 0 };
      monthMap[month].revenue += rev;
      monthMap[month].cost += cost;
      monthMap[month].profit += (rev - cost);
    });

    return Object.entries(monthMap).map(([month, d]) => ({
      month,
      revenue: Math.round(d.revenue * 100) / 100,
      cost: Math.round(d.cost * 100) / 100,
      profit: Math.round(d.profit * 100) / 100,
    }));
  }

  /**
   * Profit vs Cost chart with breakdown
   */
  async getProfitVsCost(companyId, dateFilter) {
    const dateWhere = this._buildDateWhere(dateFilter, companyId);

    const projects = await Project.findAll({
      where: dateWhere,
      include: [
        { model: Estimate, as: 'estimate', attributes: ['final_price', 'total_cost', 'raw_material_cost', 'process_cost', 'overhead_cost', 'revision'] },
        { model: ProjectAnalytics, as: 'analytics', attributes: ['mfg_cost'] },
      ],
      attributes: ['id', 'created_at'],
      order: [['created_at', 'ASC']],
    });

    const monthMap = {};
    projects.forEach(p => {
      const month = new Date(p.created_at).toISOString().slice(0, 7);
      const latest = this._latestEstimate(p);
      const rev = latest ? (parseFloat(latest.final_price) || 0) : 0;
      const cost = (p.analytics || []).reduce((sum, a) => sum + (parseFloat(a.mfg_cost) || 0), 0);
      const rawMat = latest ? (parseFloat(latest.raw_material_cost) || 0) : 0;
      const proc = latest ? (parseFloat(latest.process_cost) || 0) : 0;
      const overhead = latest ? (parseFloat(latest.overhead_cost) || 0) : 0;
      if (!monthMap[month]) monthMap[month] = { revenue: 0, cost: 0, profit: 0, rawMaterial: 0, process: 0, overhead: 0 };
      monthMap[month].revenue += rev;
      monthMap[month].cost += cost;
      monthMap[month].profit += (rev - cost);
      monthMap[month].rawMaterial += rawMat;
      monthMap[month].process += proc;
      monthMap[month].overhead += overhead;
    });

    return Object.entries(monthMap).map(([month, d]) => ({
      month,
      revenue: Math.round(d.revenue * 100) / 100,
      cost: Math.round(d.cost * 100) / 100,
      profit: Math.round(d.profit * 100) / 100,
      rawMaterial: Math.round(d.rawMaterial * 100) / 100,
      process: Math.round(d.process * 100) / 100,
      overhead: Math.round(d.overhead * 100) / 100,
    }));
  }

  /**
   * Order pipeline --- distribution by status
   */
  async getOrderPipeline(companyId, dateFilter) {
    const dateWhere = this._buildDateWhere(dateFilter, companyId);

    const results = await Project.findAll({
      where: dateWhere,
      attributes: ['status', [fn('COUNT', '*'), 'count']],
      group: ['status'],
      raw: true,
    });

    return results.map(r => ({ status: r.status, count: parseInt(r.count, 10) }));
  }

  /**
   * Manufacturing workflow stages with project counts
   */
  async getWorkflowAnalytics(companyId, dateFilter) {
    const dateWhere = this._buildDateWhere(dateFilter, companyId);

    const projects = await Project.findAll({
      where: dateWhere,
      attributes: ['id', 'status', 'quotation_number', 'po_number', 'updated_at'],
      include: [
        { model: Estimate, as: 'estimate', attributes: ['id', 'revision'] },
        { model: WorkOrder, as: 'workOrder', attributes: ['id', 'status'] },
        { model: Invoice, as: 'invoices', attributes: ['id'] },
      ],
    });

    // Define workflow stages and map projects
    const stages = [
      { key: 'project_info', label: 'Project Info', count: 0 },
      { key: 'estimation', label: 'Estimation', count: 0 },
      { key: 'quotation', label: 'Quotation', count: 0 },
      { key: 'po_from_client', label: 'PO from Client', count: 0 },
      { key: 'work_order', label: 'Work Order', count: 0 },
      { key: 'production', label: 'Production', count: 0 },
      { key: 'quality', label: 'Quality', count: 0 },
      { key: 'logistics', label: 'Logistics', count: 0 },
      { key: 'invoice', label: 'Invoice', count: 0 },
    ];

    projects.forEach(p => {
      const estimates = Array.isArray(p.estimate) ? p.estimate : (p.estimate ? [p.estimate] : []);
      const hasEstimate = estimates.length > 0;
      const hasQuotation = !!p.quotation_number;
      const hasPO = !!p.po_number;
      const hasWO = !!p.workOrder;
      const hasInvoice = p.invoices && p.invoices.length > 0;

      // Determine current stage based on status
      if (p.status === 'draft') {
        stages[0].count++; // Project Info
      } else if (p.status === 'estimated') {
        stages[1].count++; // Estimation
      } else if (p.status === 'quoted') {
        stages[2].count++; // Quotation
      } else if (p.status === 'order_confirmed') {
        if (hasWO) stages[4].count++; // Work Order
        else stages[3].count++; // PO from Client
      } else if (p.status === 'in_production') {
        stages[5].count++; // Production
      } else if (p.status === 'inspected') {
        stages[6].count++; // Quality
      } else if (p.status === 'shipped') {
        stages[7].count++; // Logistics
      } else if (p.status === 'closed') {
        stages[8].count++; // Invoice / Closed
      }
    });

    // Detect bottlenecks --- stages with disproportionately high counts
    const totalProjects = projects.length || 1;
    const avgPerStage = totalProjects / stages.length;
    const bottlenecks = stages
      .filter(s => s.count > avgPerStage * 1.5 && s.count >= 2)
      .map(s => s.key);

    return { stages, bottlenecks, totalProjects: projects.length };
  }

  /**
   * Top customers by revenue with order count
   */
  async getTopCustomers(companyId, dateFilter, limit = 10) {
    const dateWhere = this._buildDateWhere(dateFilter, companyId);

    const projects = await Project.findAll({
      where: dateWhere,
      include: [
        { model: Client, as: 'client', attributes: ['id', 'client_name'] },
        { model: Estimate, as: 'estimate', attributes: ['final_price', 'total_cost', 'revision'] },
        { model: ProjectAnalytics, as: 'analytics', attributes: ['mfg_cost'] },
      ],
    });

    const customerMap = {};
    projects.forEach(p => {
      const name = p.client?.client_name || 'Unknown';
      const clientId = p.client?.id || 'unknown';
      const latest = this._latestEstimate(p);
      const rev = latest ? (parseFloat(latest.final_price) || 0) : 0;
      const cost = (p.analytics || []).reduce((sum, a) => sum + (parseFloat(a.mfg_cost) || 0), 0);
      if (!customerMap[clientId]) customerMap[clientId] = { customer: name, revenue: 0, cost: 0, orderCount: 0 };
      customerMap[clientId].revenue += rev;
      customerMap[clientId].cost += cost;
      customerMap[clientId].orderCount++;
    });

    return Object.values(customerMap)
      .map(c => ({
        customer: c.customer,
        revenue: Math.round(c.revenue * 100) / 100,
        profit: Math.round((c.revenue - c.cost) * 100) / 100,
        orderCount: c.orderCount,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  /**
   * Product / Part analytics --- most produced, most profitable
   */
  async getProductAnalytics(companyId, dateFilter) {
    const dateWhere = this._buildDateWhere(dateFilter, companyId);

    const projects = await Project.findAll({
      where: dateWhere,
      attributes: ['id', 'project_name', 'quantity', 'material_type', 'material_grade'],
      include: [
        { model: Estimate, as: 'estimate', attributes: ['id', 'final_price', 'total_cost', 'revision', 'custom_parts'] },
      ],
    });

    const partMap = {};
    const materialMap = {};

    projects.forEach(p => {
      const latest = this._latestEstimate(p);
      const rev = latest ? (parseFloat(latest.final_price) || 0) : 0;
      const cost = latest ? (parseFloat(latest.total_cost) || 0) : 0;
      const qty = parseInt(p.quantity) || 1;
      const name = p.project_name || 'Unknown Part';

      if (!partMap[name]) partMap[name] = { name, totalQty: 0, revenue: 0, profit: 0, orderCount: 0 };
      partMap[name].totalQty += qty;
      partMap[name].revenue += rev;
      partMap[name].profit += (rev - cost);
      partMap[name].orderCount++;

      // Material tracking
      const mat = [p.material_type, p.material_grade].filter(Boolean).join(' ');
      if (mat) {
        if (!materialMap[mat]) materialMap[mat] = { material: mat, count: 0, totalQty: 0 };
        materialMap[mat].count++;
        materialMap[mat].totalQty += qty;
      }
    });

    const mostProduced = Object.values(partMap)
      .sort((a, b) => b.totalQty - a.totalQty).slice(0, 8)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100, profit: Math.round(p.profit * 100) / 100 }));

    const mostProfitable = Object.values(partMap)
      .sort((a, b) => b.profit - a.profit).slice(0, 8)
      .map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100, profit: Math.round(p.profit * 100) / 100 }));

    const topMaterials = Object.values(materialMap)
      .sort((a, b) => b.count - a.count).slice(0, 8);

    return { mostProduced, mostProfitable, topMaterials };
  }

  /**
   * Operational analytics --- production, delivery, quality
   */
  async getOperationalAnalytics(companyId, dateFilter) {
    const dateWhere = this._buildDateWhere(dateFilter, companyId);

    const projects = await Project.findAll({
      where: dateWhere,
      attributes: ['id', 'status', 'created_at', 'updated_at'],
      include: [
        { model: WorkOrder, as: 'workOrder', attributes: ['id', 'status', 'release_date', 'target_date', 'created_at', 'updated_at'] },
      ],
    });

    let totalProductionDays = 0, productionCount = 0;
    let totalDeliveryDays = 0, deliveryCount = 0;
    let pendingWorkOrders = 0, completedWorkOrders = 0, inProgressWorkOrders = 0;
    let overdueOrders = 0;
    const now = new Date();

    projects.forEach(p => {
      const wo = p.workOrder;
      if (wo) {
        if (wo.status === 'pending') pendingWorkOrders++;
        else if (wo.status === 'in_progress') inProgressWorkOrders++;
        else if (wo.status === 'completed') completedWorkOrders++;

        // Production time: from WO creation to project shipped/closed
        if (['shipped', 'closed'].includes(p.status) && wo.created_at) {
          const days = Math.ceil((new Date(p.updated_at) - new Date(wo.created_at)) / (1000 * 60 * 60 * 24));
          if (days > 0 && days < 365) { totalProductionDays += days; productionCount++; }
        }

        // Overdue: target_date passed but not completed
        if (wo.target_date && wo.status !== 'completed' && new Date(wo.target_date) < now) {
          overdueOrders++;
        }
      }

      // Delivery time: from project creation to shipped
      if (p.status === 'shipped' || p.status === 'closed') {
        const days = Math.ceil((new Date(p.updated_at) - new Date(p.created_at)) / (1000 * 60 * 60 * 24));
        if (days > 0 && days < 365) { totalDeliveryDays += days; deliveryCount++; }
      }
    });

    return {
      avgProductionDays: productionCount > 0 ? Math.round(totalProductionDays / productionCount) : 0,
      avgDeliveryDays: deliveryCount > 0 ? Math.round(totalDeliveryDays / deliveryCount) : 0,
      pendingWorkOrders,
      inProgressWorkOrders,
      completedWorkOrders,
      overdueOrders,
    };
  }

  /**
   * Recent orders table
   */
  async getRecentOrders(companyId, dateFilter, limit = 20) {
    const dateWhere = this._buildDateWhere(dateFilter, companyId);

    const projects = await Project.findAll({
      where: dateWhere,
      include: [
        { model: Client, as: 'client', attributes: ['id', 'client_name'] },
        { model: Estimate, as: 'estimate', attributes: ['final_price', 'total_cost', 'margin_percent', 'revision'] },
        { model: ProjectAnalytics, as: 'analytics', attributes: ['mfg_cost'] },
      ],
      order: [['updated_at', 'DESC']],
      limit,
    });

    return projects.map(p => {
      const latest = this._latestEstimate(p);
      const revenue = latest ? (parseFloat(latest.final_price) || 0) : 0;
      const analyticsRows = p.analytics || [];
      const mfgCost = analyticsRows.reduce((sum, a) => sum + (parseFloat(a.mfg_cost) || 0), 0);
      const hasActualCost = analyticsRows.some(a => a.mfg_cost != null && a.mfg_cost !== 0);
      return {
        id: p.id,
        project_name: p.project_name,
        customer: p.client?.client_name || 'Unknown',
        revenue: Math.round(revenue * 100) / 100,
        mfg_cost: hasActualCost ? Math.round(mfgCost * 100) / 100 : null,
        profit: hasActualCost ? Math.round((revenue - mfgCost) * 100) / 100 : null,
        cost_data_pending: !hasActualCost,
        status: p.status,
        updated_at: p.updated_at,
      };
    });
  }

  /**
   * Full dashboard data --- enhanced
   */
  async getDashboard(companyId, dateFilter) {
    const [kpis, revenueTrend, profitVsCost, orderPipeline, topCustomers, recentOrders, workflowAnalytics, productAnalytics, operationalAnalytics] = await Promise.all([
      this.getKPIs(companyId, dateFilter),
      this.getRevenueTrend(companyId, dateFilter),
      this.getProfitVsCost(companyId, dateFilter),
      this.getOrderPipeline(companyId, dateFilter),
      this.getTopCustomers(companyId, dateFilter),
      this.getRecentOrders(companyId, dateFilter),
      this.getWorkflowAnalytics(companyId, dateFilter),
      this.getProductAnalytics(companyId, dateFilter),
      this.getOperationalAnalytics(companyId, dateFilter),
    ]);

    return { kpis, revenueTrend, profitVsCost, orderPipeline, topCustomers, recentOrders, workflowAnalytics, productAnalytics, operationalAnalytics };
  }

  // --------- Date filter helper ------------------------------------------------------------------------------------------------------------------------------------------
  _buildDateWhere(dateFilter, companyId) {
    const where = {};
    if (companyId) where.company_id = companyId;

    if (!dateFilter || dateFilter === 'all') return where;
    const now = new Date();
    let start;

    switch (dateFilter) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'this_week': {
        const day = now.getDay();
        start = new Date(now);
        start.setDate(now.getDate() - day);
        start.setHours(0, 0, 0, 0);
        break;
      }
      case 'this_month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'this_year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        if (dateFilter.from && dateFilter.to) {
          where.created_at = {
            [Op.between]: [new Date(dateFilter.from), new Date(dateFilter.to)],
          };
          return where;
        }
        return where;
    }

    where.created_at = { [Op.gte]: start };
    return where;
  }
}

module.exports = new BusinessAnalyticsService();
