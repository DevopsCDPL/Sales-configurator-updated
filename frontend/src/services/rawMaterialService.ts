import api from './api';

export interface RawMaterialData {
  id: string;
  material_id: string | null;
  material_category: string;
  material_grade: string;
  condition: string;
  density: number;
  form: string | null;
  shape: string | null;
  dimensions: Record<string, string> | null;
  unit_system: string | null;
  cost_per_unit: number;
  cost_unit: string;
  notes: string | null;
  is_active: boolean;
  company_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  creator?: { id: string; name: string };
}

export interface RawMaterialCatalog {
  catalog: Record<string, Record<string, string[]>>;
  densityMap: Record<string, number | Record<string, number>>;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export const rawMaterialService = {
  // ── Lookup endpoints ─────────────────────────────────────────
  async getCatalog(): Promise<RawMaterialCatalog> {
    const response = await api.get<ApiResponse<RawMaterialCatalog>>('/raw-materials/lookup/catalog');
    return response.data.data;
  },

  async getCategories(): Promise<string[]> {
    const response = await api.get<ApiResponse<string[]>>('/raw-materials/lookup/categories');
    return response.data.data;
  },

  async getGrades(category: string): Promise<string[]> {
    const response = await api.get<ApiResponse<string[]>>(`/raw-materials/lookup/grades/${encodeURIComponent(category)}`);
    return response.data.data;
  },

  async getConditions(category: string, grade: string): Promise<string[]> {
    const response = await api.get<ApiResponse<string[]>>(
      `/raw-materials/lookup/conditions/${encodeURIComponent(category)}/${encodeURIComponent(grade)}`
    );
    return response.data.data;
  },

  async getDensity(category: string, grade: string): Promise<number | null> {
    const response = await api.get<ApiResponse<{ density: number | null }>>(
      `/raw-materials/lookup/density/${encodeURIComponent(category)}/${encodeURIComponent(grade)}`
    );
    return response.data.data.density;
  },

  async getFormOptions(): Promise<string[]> {
    const response = await api.get<ApiResponse<string[]>>('/raw-materials/lookup/forms');
    return response.data.data;
  },

  async getShapeForForm(form: string): Promise<string | null> {
    const response = await api.get<ApiResponse<{ shape: string | null }>>(
      `/raw-materials/lookup/shape/${encodeURIComponent(form)}`
    );
    return response.data.data.shape;
  },

  // ── CRUD ─────────────────────────────────────────────────────
  async getAll(filters?: Record<string, any>): Promise<RawMaterialData[]> {
    const response = await api.get<ApiResponse<RawMaterialData[]>>('/raw-materials', { params: filters });
    return response.data.data;
  },

  async getById(id: string): Promise<RawMaterialData> {
    const response = await api.get<ApiResponse<RawMaterialData>>(`/raw-materials/${id}`);
    return response.data.data;
  },

  async create(data: Partial<RawMaterialData>): Promise<RawMaterialData> {
    const response = await api.post<ApiResponse<RawMaterialData>>('/raw-materials', data);
    return response.data.data;
  },

  async update(id: string, data: Partial<RawMaterialData>): Promise<RawMaterialData> {
    const response = await api.put<ApiResponse<RawMaterialData>>(`/raw-materials/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/raw-materials/${id}`);
  },

  async bulkDelete(ids: string[]): Promise<{ message: string; count: number }> {
    const response = await api.post<ApiResponse<{ message: string; count: number }>>('/raw-materials/bulk-delete', { ids });
    return response.data.data;
  },

  async duplicate(id: string): Promise<RawMaterialData> {
    const response = await api.post<ApiResponse<RawMaterialData>>(`/raw-materials/duplicate/${id}`);
    return response.data.data;
  },

  async toggleStatus(id: string): Promise<RawMaterialData> {
    const response = await api.patch<ApiResponse<RawMaterialData>>(`/raw-materials/${id}/toggle-status`);
    return response.data.data;
  },
};
