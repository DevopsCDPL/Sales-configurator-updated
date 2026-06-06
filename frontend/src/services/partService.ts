import api from './api';

export interface PartData {
  id: string;
  part_id_seq: string | null;
  part_name: string;
  part_number: string | null;
  heat_number: string | null;
  revision: string | null;
  drawing_given_by_client: boolean | null;
  drawing_url: string | null;
  description: string | null;
  material_category: string | null;
  material_grade: string | null;
  condition: string | null;
  density: number | null;
  form: string | null;
  shape: string | null;
  dimensions: Record<string, string>;
  volume: number | null;
  weight_per_piece: number | null;
  total_weight: number | null;
  weight_unit: string | null;
  quantity: number | null;
  cost_type: string | null;
  cost_rate: number | null;
  cost_per_piece: number | null;
  total_cost: number | null;
  cost_per_unit: number | null;
  raw_material_id: string | null;
  vendor_id: string | null;
  client_id: string | null;
  notes: string | null;
  is_active: boolean;
  company_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  vendor?: { id: string; vendor_name: string };
  client?: { id: string; client_name: string };
  creator?: { id: string; name: string };
  rawMaterial?: { id: string; material_id?: string; material_category: string; material_grade: string; condition: string; density: number; form: string; shape: string; dimensions: Record<string, string> };
  production_industry: string | null;
  manufacturing_type: string | null;
  cut_method: string | null;
  cut_length: string | null;
  lathe_ops_required: string | null;
  mill_ops_required: string | null;
  deburr_required: string | null;
  heat_treat_required: string | null;
  marking_required: string | null;
}

export interface GradeInfo {
  name: string;
  density: number;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export const partService = {
  // ── Lookup endpoints ───────────────────────────────────────────
  async getMaterialCategories(): Promise<string[]> {
    const response = await api.get<ApiResponse<string[]>>('/parts/lookup/categories');
    return response.data.data;
  },

  async getGrades(category: string): Promise<GradeInfo[]> {
    const response = await api.get<ApiResponse<GradeInfo[]>>(`/parts/lookup/grades/${encodeURIComponent(category)}`);
    return response.data.data;
  },

  async getForms(): Promise<string[]> {
    const response = await api.get<ApiResponse<string[]>>('/parts/lookup/forms');
    return response.data.data;
  },

  async getShapes(form: string): Promise<string[]> {
    const response = await api.get<ApiResponse<string[]>>(`/parts/lookup/shapes/${encodeURIComponent(form)}`);
    return response.data.data;
  },

  // ── CRUD endpoints ─────────────────────────────────────────────
  async getAll(filters?: Record<string, any>): Promise<PartData[]> {
    const response = await api.get<ApiResponse<PartData[]>>('/parts', { params: filters });
    return response.data.data;
  },

  async getById(id: string): Promise<PartData> {
    const response = await api.get<ApiResponse<PartData>>(`/parts/${id}`);
    return response.data.data;
  },

  async create(data: Partial<PartData>): Promise<PartData> {
    const response = await api.post<ApiResponse<PartData>>('/parts', data);
    return response.data.data;
  },

  async update(id: string, data: Partial<PartData>): Promise<PartData> {
    const response = await api.put<ApiResponse<PartData>>(`/parts/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/parts/${id}`);
  },

  async toggleStatus(id: string): Promise<PartData> {
    const response = await api.patch<ApiResponse<PartData>>(`/parts/${id}/toggle-status`);
    return response.data.data;
  },

  async duplicate(id: string): Promise<PartData> {
    const response = await api.post<ApiResponse<PartData>>(`/parts/${id}/duplicate`);
    return response.data.data;
  },

  async uploadDrawing(file: File, partId?: string): Promise<{ url: string; filename: string }> {
    const formData = new FormData();
    formData.append('drawing', file);
    if (partId) formData.append('part_id', partId);
    const response = await api.post<ApiResponse<{ url: string; filename: string }>>('/parts/upload-drawing', formData);
    return response.data.data;
  },
};
