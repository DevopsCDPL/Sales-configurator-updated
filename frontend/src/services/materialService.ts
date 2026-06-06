import api from './api';
import { Material, MaterialVendorMapping } from '../types';

class MaterialService {
  async getAll(params?: { search?: string; category?: string; status?: string }): Promise<Material[]> {
    const response = await api.get('/materials', { params });
    return response.data.data;
  }

  async getById(id: string): Promise<Material> {
    const response = await api.get(`/materials/${id}`);
    return response.data.data;
  }

  async getVendorMappings(materialId: string): Promise<MaterialVendorMapping[]> {
    const response = await api.get(`/materials/${materialId}/vendors`);
    return response.data.data;
  }

  async create(data: Partial<Material>): Promise<Material> {
    const response = await api.post('/materials', data);
    return response.data.data;
  }

  async update(id: string, data: Partial<Material>): Promise<Material> {
    const response = await api.put(`/materials/${id}`, data);
    return response.data.data;
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/materials/${id}`);
  }

  async toggleStatus(id: string): Promise<Material> {
    const response = await api.patch(`/materials/${id}/toggle-status`);
    return response.data.data;
  }
}

export const materialService = new MaterialService();
