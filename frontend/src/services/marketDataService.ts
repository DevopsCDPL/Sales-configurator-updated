/**
 * Market Data Service — Phase 3 (infrastructure only)
 *
 * Wraps the COMEX copper endpoints exposed in Phase 2:
 *   GET /api/configurator/market/copper
 *   GET /api/configurator/market/copper/history?from=&to=
 *
 * The backend caches for ~10 min and persists daily snapshots in
 * `configurator_comex_copper_snapshots`. Consumers should NOT add
 * their own caching layer.
 */
import api from './api';
import type { ApiResponse } from '../types';

export interface CopperPrice {
  price_per_lb: number;
  currency: string;
  source?: string | null;
  fetched_at?: string;
  cached?: boolean;
  fallback?: boolean;
}

export interface CopperSnapshot {
  id?: string;
  date: string;                  // YYYY-MM-DD
  price_per_lb: number;
  currency: string;
  source?: string | null;
  raw_payload?: Record<string, any> | null;
}

const ROOT = '/configurator/market';

export const marketDataService = {
  async getCopperPrice(): Promise<CopperPrice> {
    const res = await api.get<ApiResponse<CopperPrice>>(`${ROOT}/copper`);
    return res.data.data;
  },

  async getCopperPriceForDate(date: string): Promise<CopperPrice | null> {
    try {
      const res = await api.get<ApiResponse<CopperPrice>>(`${ROOT}/copper`, {
        params: { date },
      });
      return res.data.data;
    } catch (e: any) {
      if (e?.response?.status === 404) return null;
      throw e;
    }
  },

  async getHistory(params: { from?: string; to?: string } = {}): Promise<CopperSnapshot[]> {
    const res = await api.get<ApiResponse<CopperSnapshot[]>>(`${ROOT}/copper/history`, { params });
    return res.data.data ?? [];
  },
};

export default marketDataService;
