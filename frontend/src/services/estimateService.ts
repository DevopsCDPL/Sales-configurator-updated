import api from './api';
import { Estimate, EstimateItem, ApiResponse, ProcessModuleType } from '../types';

export const estimateService = {
  async getByProjectId(projectId: string, revision?: number): Promise<Estimate | null> {
    try {
      const params = revision !== undefined ? `?revision=${revision}` : '';
      const response = await api.get<ApiResponse<Estimate>>(`/estimates/project/${projectId}${params}`);
      return response.data.data;
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  },

  async getAllByProjectId(projectId: string): Promise<Estimate[]> {
    try {
      const response = await api.get<ApiResponse<Estimate[]>>(`/estimates/project/${projectId}/all`);
      return response.data.data;
    } catch (err: any) {
      if (err.response?.status === 404) return [];
      throw err;
    }
  },

  async copyRevision(projectId: string, sourceRevision?: number): Promise<Estimate> {
    const response = await api.post<ApiResponse<Estimate>>(`/estimates/project/${projectId}/copy`, {
      sourceRevision
    });
    return response.data.data;
  },

  async deleteRevision(projectId: string, revision: number): Promise<void> {
    await api.delete(`/estimates/project/${projectId}/revision/${revision}`);
  },

  async createOrUpdate(projectId: string, data: Partial<Estimate>): Promise<Estimate> {
    const response = await api.post<ApiResponse<Estimate>>(`/estimates/project/${projectId}`, data);
    return response.data.data;
  },

  async addItem(estimateId: string, data: Partial<EstimateItem>): Promise<EstimateItem> {
    const response = await api.post<ApiResponse<EstimateItem>>(`/estimates/${estimateId}/items`, data);
    return response.data.data;
  },

  async updateItem(estimateId: string, itemId: string, data: Partial<EstimateItem>): Promise<EstimateItem> {
    const response = await api.put<ApiResponse<EstimateItem>>(`/estimates/${estimateId}/items/${itemId}`, data);
    return response.data.data;
  },

  async deleteItem(estimateId: string, itemId: string): Promise<void> {
    await api.delete(`/estimates/${estimateId}/items/${itemId}`);
  },

  async approve(estimateId: string): Promise<Estimate> {
    const response = await api.post<ApiResponse<Estimate>>(`/estimates/${estimateId}/approve`);
    return response.data.data;
  },

  async getModuleTypes(): Promise<ProcessModuleType[]> {
    const response = await api.get<ApiResponse<ProcessModuleType[]>>('/estimates/module-types');
    return response.data.data;
  },

  async calculateCost(moduleType: ProcessModuleType, inputs: Record<string, any>): Promise<Record<string, any>> {
    const response = await api.post<ApiResponse<Record<string, any>>>('/estimates/calculate', {
      moduleType,
      inputs
    });
    return response.data.data;
  },

  // Quotation methods
  async updateQuotation(estimateId: string, data: {
    validity_days: number;
    delivery_terms: string;
    payment_terms: string;
    notes: string;
    terms_conditions?: string;
    include_terms?: boolean;
    line_items?: any[];
    schedule_items?: any[];
    bom_items?: any[];
  }): Promise<Estimate> {
    const response = await api.put<ApiResponse<Estimate>>(`/estimates/${estimateId}/quotation`, data);
    return response.data.data;
  },

  async generateQuotationPdf(estimateId: string): Promise<{ blob: Blob; filename?: string }> {
    const response = await api.get(`/estimates/${estimateId}/quotation/pdf`, {
      responseType: 'blob',
    });
    const disposition = response.headers?.['content-disposition'] || '';
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    const filename = match?.[1]?.trim();
    return { blob: response.data, filename };
  },

  async sendQuotationToClient(estimateId: string): Promise<{ message: string; status: string; emailSent: boolean }> {
    const response = await api.post<ApiResponse<{ message: string; status: string; emailSent: boolean }>>(`/estimates/${estimateId}/quotation/send`);
    return response.data.data;
  },
};
