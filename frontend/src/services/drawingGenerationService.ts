/**
 * Drawing Generation Service — Phase 3 (infrastructure only)
 *
 * Wraps the SolidWorks-proxy endpoints exposed in Phase 2:
 *   GET  /api/configurator/drawing-generation/health
 *   GET  /api/configurator/drawing-generation/jobs
 *   GET  /api/configurator/drawing-generation/jobs/:jobId
 *   GET  /api/configurator/drawing-generation/jobs/:jobId/files
 *   GET  /api/configurator/drawing-generation/jobs/:jobId/files/:filename
 *   POST /api/configurator/drawing-generation/create
 *
 * The backend service NEVER throws on connection errors — it returns
 * `{ ok: false, status: 503, fallback: true }`. Consumers should treat
 * that as the canonical "service unavailable" signal.
 */
import api, { getBackendBaseUrl } from './api';
import type { ApiResponse } from '../types';

export type CircuitBreakerBrand = 'ABB' | 'SCHNEIDER' | 'SIEMENS';

export interface DrawingHealth {
  ok: boolean;
  status?: number;
  fallback?: boolean;
  version?: string;
  error?: string;
  [key: string]: any;
}

export interface DrawingJob {
  job_id?: string;
  jobId?: string;
  status?: 'queued' | 'running' | 'completed' | 'failed' | string;
  folder_name?: string;
  panel_count?: number;
  circuit_breaker_brand?: CircuitBreakerBrand;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface DrawingJobFile {
  filename: string;
  size?: number;
  url?: string;
  [key: string]: any;
}

export interface CreateDrawingRequest {
  folderName: string;            // 1–200 chars
  panelCount: number;            // 1–20
  circuitBreakerBrand: CircuitBreakerBrand;
}

const ROOT = '/configurator/drawing-generation';

export const drawingGenerationService = {
  async health(): Promise<DrawingHealth> {
    try {
      const res = await api.get<ApiResponse<DrawingHealth>>(`${ROOT}/health`);
      return res.data.data ?? { ok: true };
    } catch (e: any) {
      // Network/timeout failures are normalized here so the UI can show
      // an unavailable state without try/catch on every caller.
      return {
        ok: false,
        fallback: true,
        status: e?.response?.status ?? 0,
        error: e?.message ?? 'unreachable',
      };
    }
  },

  async listJobs(): Promise<DrawingJob[]> {
    const res = await api.get<ApiResponse<DrawingJob[]>>(`${ROOT}/jobs`);
    return res.data.data ?? [];
  },

  async getJob(jobId: string): Promise<DrawingJob | null> {
    try {
      const res = await api.get<ApiResponse<DrawingJob>>(`${ROOT}/jobs/${jobId}`);
      return res.data.data;
    } catch (e: any) {
      if (e?.response?.status === 404) return null;
      throw e;
    }
  },

  async listJobFiles(jobId: string): Promise<DrawingJobFile[]> {
    const res = await api.get<ApiResponse<DrawingJobFile[]>>(`${ROOT}/jobs/${jobId}/files`);
    return res.data.data ?? [];
  },

  fileDownloadUrl(jobId: string, filename: string): string {
    const base = getBackendBaseUrl();
    return `${base}/api${ROOT}/jobs/${jobId}/files/${encodeURIComponent(filename)}`;
  },

  async downloadFile(jobId: string, filename: string): Promise<Blob> {
    const res = await api.get(`${ROOT}/jobs/${jobId}/files/${encodeURIComponent(filename)}`, {
      responseType: 'blob',
    });
    return res.data as Blob;
  },

  async createDrawing(payload: CreateDrawingRequest): Promise<DrawingJob> {
    const res = await api.post<ApiResponse<DrawingJob>>(`${ROOT}/create`, payload);
    return res.data.data;
  },

  /* ── Job-polling helper (used by tab shells) ───────────────────────── */
  /**
   * Polls a job until it reaches a terminal status or the timeout elapses.
   * Returns the final job state. Intentionally minimal — Phase 4 will
   * replace this with a SWR/React-Query subscription.
   */
  async pollJob(
    jobId: string,
    opts: {
      intervalMs?: number;
      timeoutMs?: number;
      onTick?: (job: DrawingJob) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<DrawingJob | null> {
    const interval = opts.intervalMs ?? 3000;
    const deadline = Date.now() + (opts.timeoutMs ?? 5 * 60_000);
    while (Date.now() < deadline) {
      if (opts.signal?.aborted) return null;
      const job = await this.getJob(jobId);
      if (job) {
        opts.onTick?.(job);
        const status = String(job.status ?? '').toLowerCase();
        if (status === 'completed' || status === 'failed' || status === 'error') return job;
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    return null;
  },
};

export default drawingGenerationService;
