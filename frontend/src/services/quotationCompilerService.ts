/**
 * Quotation Compiler Service — Phase 3 (infrastructure only)
 *
 * Wraps the pricing-engine endpoints exposed in Phase 2:
 *   POST /api/configurator/preview     → in-memory pricing preview (no persist)
 *   POST /api/configurator/compile     → transactional compile-and-persist
 *   GET  /api/configurator/quotations/:id
 *   GET  /api/configurator/quotations/:id/pdf
 *   POST /api/configurator/quotations/:id/regenerate-pdf
 *   POST /api/configurator/quotations/:id/mark-sold
 */
import api, { getBackendBaseUrl } from './api';
import type { ApiResponse } from '../types';
import type { QuotationPreviewResult, CompiledQuotation } from './configuratorService';

export interface PreviewOverrides {
  lookup?: Record<string, any>;
  pricing_strategy?: Record<string, any>;
  schedule?: Record<string, any>;
  holidays?: string[];
  line_adders?: any[];
}

export interface CompileOptions extends PreviewOverrides {
  generate_pdf?: boolean;
  customer?: Record<string, any>;
}

export interface QuotationRecord {
  id: string;
  code?: string | null;
  configuration_id?: string | null;
  project_id?: string | null;
  status?: string | null;
  total?: number | null;
  bom_spec?: any;
  pricing_spec?: any;
  pdf_document_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

const ROOT = '/configurator';

/* Per-route timeout overrides (Phase 6).
 * The default axios timeout is 45 s. Pricing engine + PDF generation
 * can legitimately exceed that ceiling on cold starts or large BOMs. */
const COMPILE_TIMEOUT_MS = 180_000;       // 3 min
const PDF_DOWNLOAD_TIMEOUT_MS = 120_000;  // 2 min
const PDF_REGEN_TIMEOUT_MS = 180_000;     // 3 min

export const quotationCompilerService = {
  async preview(
    configurationId: string,
    overrides?: PreviewOverrides
  ): Promise<QuotationPreviewResult> {
    const res = await api.post<ApiResponse<QuotationPreviewResult>>(`${ROOT}/preview`, {
      configuration_id: configurationId,
      overrides: overrides ?? {},
    });
    return res.data.data;
  },

  async compile(
    configurationId: string,
    opts?: CompileOptions
  ): Promise<CompiledQuotation> {
    const { generate_pdf, customer, ...overrides } = opts ?? {};
    const res = await api.post<ApiResponse<CompiledQuotation>>(
      `${ROOT}/compile`,
      {
        configuration_id: configurationId,
        overrides,
        generate_pdf: generate_pdf ?? false,
        customer,
      },
      { timeout: COMPILE_TIMEOUT_MS },
    );
    console.log(`res: ${res.data.data}`)
    return res.data.data;
  },

  async getQuotation(id: string): Promise<QuotationRecord | null> {
    try {
      const res = await api.get<ApiResponse<QuotationRecord>>(`${ROOT}/quotations/${id}`);
      return res.data.data;
    } catch (e: any) {
      if (e?.response?.status === 404) return null;
      throw e;
    }
  },

  async listQuotations(params?: {
    configuration_id?: string;
    project_id?: string;
  }): Promise<QuotationRecord[]> {
    const res = await api.get<ApiResponse<QuotationRecord[]>>(`${ROOT}/quotations`, { params });
    return res.data.data ?? [];
  },

  /**
   * Returns a streamable URL for the rendered PDF. Authentication is
   * handled by axios interceptor → use api.get with responseType:'blob'
   * to download. This helper returns just the URL for <a href> previews.
   */
  pdfUrl(quotationId: string): string {
    const base = getBackendBaseUrl();
    return `${base}/api${ROOT}/quotations/${quotationId}/pdf`;
  },

  async downloadPdf(quotationId: string): Promise<Blob> {
    const res = await api.get(`${ROOT}/quotations/${quotationId}/pdf`, {
      responseType: 'blob',
      timeout: PDF_DOWNLOAD_TIMEOUT_MS,
    });
    return res.data as Blob;
  },

  async regeneratePdf(quotationId: string): Promise<CompiledQuotation> {
    const res = await api.post<ApiResponse<CompiledQuotation>>(
      `${ROOT}/quotations/${quotationId}/regenerate-pdf`,
      undefined,
      { timeout: PDF_REGEN_TIMEOUT_MS },
    );
    return res.data.data;
  },

  async markSold(quotationId: string): Promise<QuotationRecord> {
    const res = await api.post<ApiResponse<QuotationRecord>>(
      `${ROOT}/quotations/${quotationId}/mark-sold`
    );
    return res.data.data;
  },
};

export default quotationCompilerService;
