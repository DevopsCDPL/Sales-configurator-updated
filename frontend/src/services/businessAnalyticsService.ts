import api from './api';
import { BusinessAnalyticsDashboard, AnalyticsKPIs } from '../types';

export type DatePeriod = 'today' | 'this_week' | 'this_month' | 'this_year' | 'all' | 'custom';

interface DateParams {
  period: DatePeriod;
  from?: string;
  to?: string;
}

class BusinessAnalyticsService {
  async getDashboard(params: DateParams): Promise<BusinessAnalyticsDashboard> {
    const response = await api.get('/business-analytics/dashboard', { params });
    return response.data.data;
  }

  async getKPIs(params: DateParams): Promise<AnalyticsKPIs> {
    const response = await api.get('/business-analytics/kpis', { params });
    return response.data.data;
  }

  async getRevenueTrend(params: DateParams) {
    const response = await api.get('/business-analytics/revenue-trend', { params });
    return response.data.data;
  }

  async getProfitVsCost(params: DateParams) {
    const response = await api.get('/business-analytics/profit-vs-cost', { params });
    return response.data.data;
  }

  async getOrderPipeline(params: DateParams) {
    const response = await api.get('/business-analytics/order-pipeline', { params });
    return response.data.data;
  }

  async getTopCustomers(params: DateParams & { limit?: number }) {
    const response = await api.get('/business-analytics/top-customers', { params });
    return response.data.data;
  }

  async getRecentOrders(params: DateParams & { limit?: number }) {
    const response = await api.get('/business-analytics/recent-orders', { params });
    return response.data.data;
  }

  async exportExcel(from: string, to: string): Promise<Blob> {
    const response = await api.get('/business-analytics/export-excel', {
      params: { from, to },
      responseType: 'blob',
    });
    return response.data;
  }
}

export const businessAnalyticsService = new BusinessAnalyticsService();
