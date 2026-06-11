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
  section_index: number;
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

export const configuratorV2Service = {
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
