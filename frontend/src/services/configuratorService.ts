/**
 * Configurator Service — Phase 3 (infrastructure only)
 * Thin typed client over /api/configurator/* (delivered in Phase 2).
 *
 * NOTE: Step-flow UI is deferred to Phase 4. This file exposes the full
 * surface area so the ConfigurationTab shell + future step pages can
 * consume the backend without further plumbing changes.
 */
import api from './api';
import type { ApiResponse } from '../types';

/* ─── Types (loosely typed; mirrors Phase 2 backend payloads) ───────────── */
export type ConfiguratorStepKey =
  | 'system_design'
  | 'enclosure'
  | 'bussing'
  | 'glastic'
  | 'cam_lock_panel'
  | 'spd_ats'
  | 'controls'
  | 'ct_vt_cpt'
  | 'conduit_fittings'
  | 'wire_cable'
  | 'standard_bom'
  | 'labour'
  | 'plus_comp'
  | 'sld';

export interface ConfiguratorComponent {
  id: string;
  part_number?: string | null;
  name?: string | null;
  category?: string | null;
  unit_cost?: number | null;

  // Added explicit fields used by card UI rendering
  description?: string | null;
  price?: number | null;
  material_cost?: number | null;
  mat_cost?: number | null;

  [key: string]: any;
}

export interface ConfiguratorCategory {
  id?: string;
  name: string;
  normalized_name?: string;
  display_order?: number | null;
}

export interface ConfiguratorCategoryCount {
  category: string;
  count: number;
}

export interface NewComponentInput {
  name: string;
  category?: string;
  subcategory?: string;
  type?: string;
  description?: string;
  part_number?: string;
  price?: number;
  material_cost?: number;
  labor_cost?: number;
  mat_cost?: number;
  lbr_cu?: number;
  lbr_asm?: number;
  lbr_cnt?: number;
  lbr_qc?: number;
  lbr_tst?: number;
  lbr_eng?: number;
  lbr_cad?: number;
  specifications?: Record<string, any>;
  image_url?: string;
  is_active?: boolean;
}

export interface ConfigurationSummary {
  id: string;
  code?: string | null;
  name?: string | null;
  project_id?: string | null;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Configuration extends ConfigurationSummary {
  config_data?: Record<string, any> | null;
  lookup?: Record<string, any> | null;
  pricing_strategy?: Record<string, any> | null;
  schedule?: Record<string, any> | null;
  holidays?: string[] | null;
  line_adders?: any[] | null;
  [key: string]: any;
}

export interface QuotationPreviewResult {
  configuration?: any;
  quote?: any;
  labour?: any;
  items?: any[];
  bom_spec?: any;
  pricing_spec?: any;
  totals?: any;
}

export interface CompiledQuotation extends QuotationPreviewResult {
  quotation?: {
    id: string;
    code?: string | null;
    project_id?: string | null;
    [key: string]: any;
  };
  document?: {
    id: string;
    file_path?: string;
    r2_url?: string;
    file_name?: string;
  } | null;
}

const ROOT = '/configurator';

export const configuratorService = {
  /* ── Components ─────────────────────────────────────────────────────── */
  async listComponents(params?: {
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<ConfiguratorComponent[]> {
    const res = await api.get<ApiResponse<ConfiguratorComponent[]>>(`${ROOT}/components`, { params });
    return res.data.data ?? [];
  },

  async getComponent(id: string): Promise<ConfiguratorComponent | null> {
    try {
      const res = await api.get<ApiResponse<ConfiguratorComponent>>(`${ROOT}/components/${id}`);
      return res.data.data;
    } catch (e: any) {
      if (e?.response?.status === 404) return null;
      throw e;
    }
  },

  async createComponent(payload: NewComponentInput): Promise<ConfiguratorComponent> {
    const res = await api.post<ApiResponse<ConfiguratorComponent>>(`${ROOT}/components`, payload);
    return res.data.data;
  },

  async updateComponent(id: string, payload: Partial<NewComponentInput>): Promise<ConfiguratorComponent> {
    const res = await api.put<ApiResponse<ConfiguratorComponent>>(`${ROOT}/components/${id}`, payload);
    return res.data.data;
  },

  async deleteComponent(id: string): Promise<void> {
    await api.delete(`${ROOT}/components/${id}`);
  },

  async componentCategoryCounts(): Promise<ConfiguratorCategoryCount[]> {
    const res = await api.get<ApiResponse<ConfiguratorCategoryCount[]>>(`${ROOT}/components/stats/category-counts`);
    return res.data.data ?? [];
  },

  /* ── Categories ─────────────────────────────────────────── */
  async listCategories(): Promise<ConfiguratorCategory[]> {
    const res = await api.get<ApiResponse<ConfiguratorCategory[]>>(`${ROOT}/categories`);
    return res.data.data ?? [];
  },

  async upsertCategory(name: string): Promise<ConfiguratorCategory | null> {
    try {
      const res = await api.post<ApiResponse<ConfiguratorCategory>>(`${ROOT}/categories/upsert`, { name });
      return res.data.data;
    } catch {
      return null;
    }
  },

  /* ── Configurations (CRUD) ──────────────────────────────────────────── */
  async listConfigurations(params?: {
    project_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<ConfigurationSummary[]> {
    const res = await api.get<ApiResponse<ConfigurationSummary[]>>(`${ROOT}/configurations`, { params });
    return res.data.data ?? [];
  },

  async getConfiguration(id: string): Promise<Configuration | null> {
    try {
      const res = await api.get<ApiResponse<Configuration>>(`${ROOT}/configurations/${id}`);
      return res.data.data;
    } catch (e: any) {
      if (e?.response?.status === 404) return null;
      throw e;
    }
  },

  async createConfiguration(payload: Partial<Configuration>): Promise<Configuration> {
    const res = await api.post<ApiResponse<Configuration>>(`${ROOT}/configurations`, payload);
    return res.data.data;
  },

  async updateConfiguration(id: string, payload: Partial<Configuration>): Promise<Configuration> {
    const res = await api.put<ApiResponse<Configuration>>(`${ROOT}/configurations/${id}`, payload);
    return res.data.data;
  },

  async deleteConfiguration(id: string): Promise<void> {
    await api.delete(`${ROOT}/configurations/${id}`);
  },

  /* ── System Parameters / Sections (user-scoped) ─────────────────────── */
  async getSystemParameters(): Promise<Record<string, any>> {
    const res = await api.get<ApiResponse<Record<string, any>>>(`${ROOT}/system-parameters`);
    return res.data.data ?? {};
  },

  async saveSystemParameters(params: Record<string, any>): Promise<Record<string, any>> {
    const res = await api.put<ApiResponse<Record<string, any>>>(`${ROOT}/system-parameters`, params);
    return res.data.data ?? params;
  },

  async listSystemSections(): Promise<any[]> {
    const res = await api.get<ApiResponse<any[]>>(`${ROOT}/system-sections`);
    return res.data.data ?? [];
  },
};

export default configuratorService;
