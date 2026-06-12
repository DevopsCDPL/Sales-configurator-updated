/**
 * configuratorV2Service — typed client over /api/configurator-v2/*.
 *
 * V2 endpoints return RAW JSON (no ApiResponse envelope).
 */
import api from './api';
import type { IntakeInput, LineupProposal } from '../configurator/lib/lineup-proposal';

const ROOT = '/configurator-v2';

export interface SwitchboardRow {
  id: string;
  configuration_id: string;
  board_index: number;
  name: string;
  standards_regime: 'UL' | 'IEC';
  board_type?: string | null;
  status: 'draft' | 'complete' | 'locked';
  service_entrance: boolean;
  board_data: Record<string, any>;
  intake?: IntakeInput | null;
  drawings_status: 'none' | 'queued' | 'running' | 'generated' | 'failed';
  updated_at?: string;
}

export interface SectionRow {
  id: string;
  switchboard_id: string;
  section_number: number;
  setup?: Record<string, any> | null;
  electrical?: Record<string, any> | null;
  layout?: Record<string, any> | null;
  computed?: Record<string, any> | null;
}

export interface ComponentLineRow {
  id: string;
  switchboard_id: string;
  scope: 'board' | 'section';
  section_id?: string | null;
  component_id?: string | null;
  category?: string | null;
  part_number?: string | null;
  name?: string | null;
  quantity: number;
  unit_cost?: number | null;
  price_status: 'FIRM' | 'ESTIMATED' | 'PENDING_RFQ';
  source: 'user' | 'auto' | 'builder' | 'standard' | 'generator';
  meta?: Record<string, any> | null;
}

export interface FullBoard {
  board: SwitchboardRow;
  sections: SectionRow[];
  lines: ComponentLineRow[];
}

export interface CatalogCb {
  componentId: string;
  partNumber: string;
  manufacturer: string | null;
  frameModel: string | null;
  deviceClass: 'ACB' | 'ICCB' | 'MCCB' | 'MCB';
  ratedA: number;
  interruptingKA: number;
  poles: number;
  mounting: 'Fixed' | 'Drawout';
  pctRated: 80 | 100;
  heightIn: number | null;
  widthIn: number | null;
  depthIn: number | null;
  price: number | null;
  priceStatus: 'FIRM' | 'ESTIMATED' | 'PENDING_RFQ';
}


/* ── BOM (compiled live by GET /switchboards/:id/bom) ── */
export interface BomRow {
  sectionIndex: number | null;
  scope: 'board' | 'section';
  category: string | null;
  part_number: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  price_status: 'FIRM' | 'ESTIMATED' | 'PENDING_RFQ';
  source: string;
  generator_id: string | null;
  copper_weight_lbs: number | null;
}

export interface CopperEstimate {
  mainBusLbs: number;
  neutralLbs: number;
  groundLbs: number;
  riserLbs: number;
  stubLbs: number;
  rawLbs: number;
  estimatedLbs: number;
  costUsd: number;
  pricePerLb: number;
  supports: number;
  perSection: { sectionIndex: number; lbs: number }[];
  notes: string[];
}

export interface MbomRow {
  part_number: string | null;
  category: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  price_status: 'FIRM' | 'ESTIMATED' | 'PENDING_RFQ';
  whereUsed: string[];
}

export interface BomResponse {
  board: { id: string; name: string; status: string };
  sectionCount: number;
  copper: CopperEstimate;
  copperPricePerLb: number;
  rows: BomRow[];
  ebom: Record<string, Record<string, BomRow[]>>;
  mbom: MbomRow[];
  totals: {
    materialTotal: number;
    rowCount: number;
    nonFirmCount: number;
    copperEstLbs: number;
    laborHours: Record<string, number>;
  };
}


/* ── Quote (parity-proven v1 engine over the live BOM) ── */
export interface LaborAdjustment { bucket: 'CU'|'ASM'|'CNT'|'QC'|'TST'|'ENG'|'CAD'; hours: number; note?: string }

export interface QuoteComputed {
  generated_at: string;
  calc_version: string;
  totals: { material_total: number; section_cost_total: number; overhead_amount: number; copper_cost: number };
  labor_costs: Record<string, number>;
  labor_hours: Record<string, number>;
  total_cost: number;
  pricing: { target_price: number; rounded_price: number; actual_profit: number; actual_gm: number; roundup_factor: number };
}

export interface QuotePreviewResponse {
  board: { id: string; name: string; status: string };
  quote: QuoteComputed;
  bomTotals: { materialTotal: number; rowCount: number; nonFirmCount: number; copperEstLbs: number };
  copper: CopperEstimate;
  copperPricePerLb: number;
  inputs: { gmPct: number; roundupFactor: number; laborAdjustments: LaborAdjustment[] };
  labourHoursTotal: number;
  nonFirmCount: number;
  blockers: string[];
  canIssue: boolean;
  bomRows?: { category: string | null; quantity: number; unit_cost: number }[];
  multiUnit?: {
    units: number;
    prorateDesign: boolean;
    designCostOnce: number;
    perUnitCost: number;
    totalCost: number;
    perUnitPrice: number;
    totalPrice: number;
    profit: number;
    actualGm: number;
  } | null;
}

export interface QuoteRevisionRow {
  id: string;
  quotation_number: string;
  revision: number;
  revision_reason: string | null;
  parent_quotation_id: string | null;
  status: string;
  material_total: number;
  labour_total: number;
  overhead_total: number;
  subtotal: number;
  margin_pct: number;
  margin_total: number;
  grand_total: number;
  created_at: string;
  labourHoursTotal: number | null;
  nonFirmCount: number | null;
  forced: boolean;
}

export interface QuoteRequestBody {
  gmPct?: number;
  units?: number;
  prorateDesign?: boolean;
  roundupFactor?: number;
  laborAdjustments?: LaborAdjustment[];
  copperPricePerLb?: number | null;
  revisionReason?: string;
}


/* ── SolidWorks job queue ── */
export interface SwJobRow {
  id: string;
  switchboard_id: string;
  job_type: 'FULL' | 'DRAWINGS' | 'COPPER_ONLY';
  status: 'queued' | 'leased' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  priority: number;
  attempts: number;
  max_attempts: number;
  last_error_code: string | null;
  last_error_message: string | null;
  progress: Record<string, any> | null;
  cancel_requested: boolean;
  artifacts: { type?: string; name?: string; url?: string; path?: string }[] | null;
  completed_at: string | null;
  created_at?: string;
  updated_at?: string;
}


/* ── Price queue ── */
export interface PendingPriceGroup {
  partNumber: string | null;
  name: string | null;
  category: string | null;
  priceStatus: 'PENDING_RFQ' | 'ESTIMATED';
  lineCount: number;
  totalQty: number;
  boards: string[];
  componentId: string | null;
}

export interface PriceRfqRow {
  id: string;
  component_id: string;
  catalog_number: string;
  manufacturer: string | null;
  status: 'open' | 'sent' | 'received' | 'cancelled';
  received_price: number | null;
  created_at?: string;
}

/* ── Engineering standards ── */
export interface StandardsTableRow {
  id: string;
  table_key: string;
  version: number;
  rows: any[];
  notes: string | null;
  is_current: boolean;
  created_at?: string;
}

export const configuratorV2Service = {
  async catalogStatus(): Promise<{ count: number; withPrice: number }> {
    const res = await api.get(`${ROOT}/catalog/status`);
    return res.data;
  },

  async catalogImportBundled(): Promise<{ ok: boolean; created: number; total: number }> {
    const res = await api.post(`${ROOT}/catalog/import-bundled`);
    return res.data;
  },

  async catalogCbs(): Promise<CatalogCb[]> {
    const res = await api.get<CatalogCb[]>(`${ROOT}/catalog/cbs`);
    return res.data ?? [];
  },

  async listBoards(configurationId: string): Promise<SwitchboardRow[]> {
    const res = await api.get<SwitchboardRow[]>(`${ROOT}/configurations/${configurationId}/switchboards`);
    return res.data ?? [];
  },

  /** Company-wide list — the "Load Configuration" clone library. */
  async listAllBoards(): Promise<SwitchboardRow[]> {
    const res = await api.get<SwitchboardRow[]>(`${ROOT}/switchboards`);
    return res.data ?? [];
  },

  async createBoard(configurationId: string, name: string, cloneFromId?: string): Promise<SwitchboardRow> {
    const res = await api.post<SwitchboardRow>(`${ROOT}/configurations/${configurationId}/switchboards`, {
      name,
      cloneFromId,
    });
    return res.data;
  },

  async patchBoard(id: string, patch: Partial<Pick<SwitchboardRow, 'name' | 'board_type' | 'service_entrance' | 'board_data' | 'status'>> & { intake?: IntakeInput }): Promise<SwitchboardRow> {
    const res = await api.patch<SwitchboardRow>(`${ROOT}/switchboards/${id}`, patch);
    return res.data;
  },

  async deleteBoard(id: string): Promise<void> {
    await api.delete(`${ROOT}/switchboards/${id}`);
  },

  async getFull(id: string): Promise<FullBoard> {
    const res = await api.get<FullBoard>(`${ROOT}/switchboards/${id}/full`);
    return res.data;
  },


  async getBom(id: string, copperPricePerLb?: number): Promise<BomResponse> {
    const qs = copperPricePerLb ? `?copperPricePerLb=${copperPricePerLb}` : '';
    const res = await api.get<BomResponse>(`${ROOT}/switchboards/${id}/bom${qs}`);
    return res.data;
  },


  async quotePreview(id: string, body: QuoteRequestBody): Promise<QuotePreviewResponse> {
    const res = await api.post<QuotePreviewResponse>(`${ROOT}/switchboards/${id}/quote/preview`, body);
    return res.data;
  },

  async issueQuote(id: string, body: QuoteRequestBody): Promise<{ quotation: { id: string; quotation_number: string; revision: number } }> {
    const res = await api.post(`${ROOT}/switchboards/${id}/quote`, body);
    return res.data;
  },

  async listQuotes(id: string): Promise<QuoteRevisionRow[]> {
    const res = await api.get<QuoteRevisionRow[]>(`${ROOT}/switchboards/${id}/quotes`);
    return res.data ?? [];
  },


  async listSwJobs(switchboardId?: string): Promise<SwJobRow[]> {
    const qs = switchboardId ? `?switchboardId=${switchboardId}` : '';
    const res = await api.get<SwJobRow[]>(`${ROOT}/sw-jobs${qs}`);
    return res.data ?? [];
  },

  async enqueueSwJob(switchboardId: string, jobType: 'FULL' | 'DRAWINGS' | 'COPPER_ONLY', extra?: { estimatedCopperLbs?: number; copperPricePerLb?: number }): Promise<{ jobId: string; deduped: boolean }> {
    const res = await api.post(`${ROOT}/sw-jobs`, { switchboardId, jobType, ...extra });
    return res.data;
  },

  async cancelSwJob(jobId: string): Promise<{ ok: boolean; status?: string }> {
    const res = await api.post(`${ROOT}/sw-jobs/${jobId}/cancel`);
    return res.data;
  },


  async priceQueue(): Promise<{ pending: PendingPriceGroup[]; rfqs: PriceRfqRow[] }> {
    const res = await api.get(`${ROOT}/price-queue`);
    return res.data;
  },

  async receivePrice(partNumber: string, price: number): Promise<{ ok: boolean; componentsUpdated: number; linesUpdated: number }> {
    const res = await api.post(`${ROOT}/price-queue/receive`, { partNumber, price });
    return res.data;
  },

  async getStandard(tableKey: string): Promise<StandardsTableRow | null> {
    const res = await api.get<StandardsTableRow | null>(`${ROOT}/engineering-standards/${tableKey}`);
    return res.data ?? null;
  },

  async saveStandard(tableKey: string, rows: any[], notes?: string): Promise<StandardsTableRow> {
    const res = await api.put<StandardsTableRow>(`${ROOT}/engineering-standards/${tableKey}`, { rows, notes });
    return res.data;
  },


  async confirmOrder(quotationId: string): Promise<{ ok: boolean; results: Record<string, any>; stepErrors: [string, string][] }> {
    const res = await api.post(`${ROOT}/handoff/order-confirm`, { quotationId });
    return res.data;
  },


  async addLine(switchboardId: string, line: {
    scope: 'board' | 'section';
    section_id?: string | null;
    component_id?: string | null;
    category?: string | null;
    part_number?: string | null;
    name?: string | null;
    quantity: number;
    unit_cost?: number | null;
    price_status?: 'FIRM' | 'ESTIMATED' | 'PENDING_RFQ';
    source?: string;
    meta?: Record<string, any>;
  }): Promise<ComponentLineRow> {
    const res = await api.post<ComponentLineRow>(`${ROOT}/switchboards/${switchboardId}/lines`, line);
    return res.data;
  },

  async deleteLine(lineId: string, waiverReason?: string): Promise<void> {
    await api.delete(`${ROOT}/lines/${lineId}`, { data: waiverReason ? { waiverReason } : undefined });
  },


  async patchLine(lineId: string, patch: {
    component_id?: string | null;
    part_number?: string | null;
    name?: string | null;
    quantity?: number;
    unit_cost?: number | null;
    price_status?: 'FIRM' | 'ESTIMATED' | 'PENDING_RFQ';
    meta?: Record<string, any>;
  }): Promise<ComponentLineRow> {
    const res = await api.patch<ComponentLineRow>(`${ROOT}/lines/${lineId}`, patch);
    return res.data;
  },


  async importWorkbook(file: File): Promise<{
    ok: boolean; componentsCreated: number; componentsUpdated: number;
    busScheduleRows: number; neutralRows: number; copperPricePerLb: number | null;
    ratesFound: Record<string, number>; warnings: string[];
  }> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await api.post(`${ROOT}/catalog/import-workbook`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },


  async downloadQuotePdf(quotationId: string, filenameHint?: string): Promise<void> {
    const res = await api.get(`${ROOT}/quotations/${quotationId}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filenameHint ?? 'quotation.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },


  async downloadEpicorExport(quotationId: string, filenameHint?: string): Promise<void> {
    const res = await api.get(`${ROOT}/quotations/${quotationId}/epicor-export`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = filenameHint ?? 'epicor-import.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },


  async downloadProposalPdf(configurationId: string): Promise<void> {
    const res = await api.get(`${ROOT}/configurations/${configurationId}/proposal-pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TPS_Proposal.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },


  async raiseChangeOrder(switchboardId: string, body: { reason: string; origin?: 'customer' | 'internal'; scheduleImpact?: string }): Promise<{ ok: boolean; changeOrder: { id: string }; board: SwitchboardRow }> {
    const res = await api.post(`${ROOT}/switchboards/${switchboardId}/change-order`, body);
    return res.data;
  },

  async listChangeOrders(switchboardId: string): Promise<{ id: string; reason: string; origin: string; status: string; created_at: string }[]> {
    const res = await api.get(`${ROOT}/switchboards/${switchboardId}/change-orders`);
    return res.data ?? [];
  },

  async applyProposal(id: string, payload: {
    intake: IntakeInput;
    boardPatch: LineupProposal['boardPatch'] & { totalFeederLoadA?: number; sldTopology?: unknown };
    sections: Array<{
      sectionIndex: number;
      role: string;
      frame: Record<string, any> | null;
      usedHeightIn?: number;
      remainingHeightIn?: number;
      devices: Array<{
        designation: string;
        loadDescription?: string | null;
        role: string;
        partNumber?: string;
        manufacturer?: string;
        frameModel?: string;
        ratedA?: number | null;
        poles?: number;
        mounting?: string;
        interruptingKA?: number;
        price?: number | null;
        priceStatus?: string;
        componentId?: string;
      }>;
    }>;
  }): Promise<FullBoard & { ok: boolean }> {
    const res = await api.post(`${ROOT}/switchboards/${id}/apply-proposal`, payload);
    return res.data;
  },
};

export default configuratorV2Service;
