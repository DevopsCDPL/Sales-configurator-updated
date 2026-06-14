import api from './api';

export interface OverwatchPipelineProject {
  id: string;
  name: string;
  code: string | null;
  stage: string;
  updated_at: string | null;
}

export interface OverwatchPipelineStage {
  stage: string;
  count: number;
  projects: OverwatchPipelineProject[];
}

export interface OverwatchRisk {
  severity: 'red' | 'amber';
  code: string;
  message: string;
  entity: string;
}

export interface OverwatchBatch {
  code: string;
  vendor: string | null;
  sentAt: string | null;
  total: number;
  received: number;
  ageDays: number | null;
}

export interface OverwatchApproval {
  id: string;
  reason: string;
  originator: string;
  configuration_id: string | null;
  ageDays: number | null;
  created_at: string | null;
}

export interface OverwatchActivity {
  entity: 'project' | 'quotation' | 'rfq';
  name: string;
  when: string | null;
}

export interface OverwatchSummary {
  pipeline: { byStage: OverwatchPipelineStage[]; total: number };
  quotes: {
    byStatus: Record<string, number>;
    issuedValue: number;
    issuedCount: number;
    staleDrafts: number;
    currency: string;
  };
  procurement: {
    openBatches: number;
    oldestBatchAgeDays: number | null;
    pendingRfqParts: number;
    batches: OverwatchBatch[];
  };
  approvals: { pending: number; list: OverwatchApproval[] };
  risks: OverwatchRisk[];
  activity: OverwatchActivity[];
  warnings: { section: string; message: string }[];
  generatedAt: string;
}

/**
 * Fetch the Owner Overwatch dashboard summary (rule-based analytics + risk board).
 * Returns the unwrapped `data` payload.
 */
export async function overwatchSummary(): Promise<OverwatchSummary> {
  const response = await api.get('/overwatch/summary');
  return response.data.data;
}


export interface OverwatchNarrative {
  enabled: boolean;
  briefing?: string;
  model?: string;
  error?: string;
  reason?: string;
  detail?: string;
  generatedAt?: string;
}

export async function overwatchLlmStatus(): Promise<{ enabled: boolean }> {
  const response = await api.get('/overwatch/llm-status');
  return response.data.data;
}

export async function overwatchNarrative(summary: OverwatchSummary): Promise<OverwatchNarrative> {
  const response = await api.post('/overwatch/narrative', { summary });
  return response.data.data;
}
