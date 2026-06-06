import api from './api';

export interface ProcurementRFQ {
  id: string;
  rfq_number: string;
  status: 'Draft' | 'Sent' | 'Quoted' | 'Closed';
  notes?: string;
  company_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  items?: ProcurementRFQItem[];
  vendors?: ProcurementRFQVendor[];
  quotes?: ProcurementVendorQuote[];
  creator?: { id: string; name: string };
}

export interface ProcurementRFQItem {
  id: string;
  rfq_id: string;
  material_id: string;
  quantity: number;
  unit: string;
  material?: { id: string; material_name: string; unit: string; category?: string };
}

export interface ProcurementRFQVendor {
  id: string;
  rfq_id: string;
  vendor_id: string;
  status: 'Pending' | 'Responded';
  vendor?: { id: string; vendor_name: string; contact_email?: string; contact_phone?: string };
}

export interface ProcurementVendorQuote {
  id: string;
  rfq_id: string;
  vendor_id: string;
  material_id: string;
  price_per_unit: number;
  lead_time?: string;
  remarks?: string;
  vendor?: { id: string; vendor_name: string };
  material?: { id: string; material_name: string; unit: string };
}

export interface ProcurementPO {
  id: string;
  po_number: string;
  rfq_id?: string;
  vendor_id: string;
  status: 'Draft' | 'Issued' | 'Received';
  total_value: number;
  notes?: string;
  company_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  items?: ProcurementPOItem[];
  vendor?: { id: string; vendor_name: string; contact_email?: string; contact_phone?: string; address?: string };
  rfq?: { id: string; rfq_number: string };
  creator?: { id: string; name: string };
}

export interface ProcurementPOItem {
  id: string;
  po_id: string;
  material_id: string;
  quantity: number;
  price_per_unit: number;
  heat_number?: string;
  unit: string;
  material?: { id: string; material_name: string; unit: string; category?: string };
}

export interface ProcurementStats {
  totalRfqs: number;
  pendingQuotes: number;
  activePOs: number;
  monthlySpend: number;
}

export interface VendorComparisonItem {
  material_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  vendor_quotes: {
    vendor_id: string;
    vendor_name: string;
    price_per_unit: number;
    lead_time?: string;
    remarks?: string;
    total_price: number;
  }[];
  lowest_price: number | null;
  lowest_vendor_id: string | null;
}

class ProcurementService {
  // ─── Stats ─────────────────────────────────────────────────────────────────
  async getStats(): Promise<ProcurementStats> {
    const response = await api.get('/procurement/stats');
    return response.data?.data || response.data;
  }

  // ─── RFQ Operations ────────────────────────────────────────────────────────
  async getAllRFQs(params?: { status?: string; search?: string }): Promise<ProcurementRFQ[]> {
    const response = await api.get('/procurement/rfqs', { params });
    return response.data?.data || response.data || [];
  }

  async getRFQById(id: string): Promise<ProcurementRFQ> {
    const response = await api.get(`/procurement/rfqs/${id}`);
    return response.data?.data || response.data;
  }

  async createRFQ(data: {
    items: { material_id: string; quantity: number; unit?: string }[];
    vendor_ids: string[];
    notes?: string;
  }): Promise<ProcurementRFQ> {
    const response = await api.post('/procurement/rfqs', data);
    return response.data?.data || response.data;
  }

  async updateRFQ(id: string, data: {
    items?: { material_id: string; quantity: number; unit?: string }[];
    vendor_ids?: string[];
    notes?: string;
  }): Promise<ProcurementRFQ> {
    const response = await api.put(`/procurement/rfqs/${id}`, data);
    return response.data?.data || response.data;
  }

  async sendRFQ(id: string): Promise<ProcurementRFQ> {
    const response = await api.patch(`/procurement/rfqs/${id}/send`);
    return response.data?.data || response.data;
  }

  async deleteRFQ(id: string): Promise<void> {
    await api.delete(`/procurement/rfqs/${id}`);
  }

  // ─── Vendor Quote Operations ───────────────────────────────────────────────
  async addVendorQuote(rfqId: string, vendorId: string, quotes: {
    material_id: string;
    price_per_unit: number;
    lead_time?: string;
    remarks?: string;
  }[]): Promise<ProcurementRFQ> {
    const response = await api.post(`/procurement/rfqs/${rfqId}/quotes`, {
      vendor_id: vendorId,
      quotes,
    });
    return response.data?.data || response.data;
  }

  async getVendorComparison(rfqId: string): Promise<VendorComparisonItem[]> {
    const response = await api.get(`/procurement/rfqs/${rfqId}/comparison`);
    return response.data?.data || response.data || [];
  }

  // ─── Purchase Order Operations ─────────────────────────────────────────────
  async getAllPOs(params?: { status?: string; search?: string }): Promise<ProcurementPO[]> {
    const response = await api.get('/procurement/pos', { params });
    return response.data?.data || response.data || [];
  }

  async getPOById(id: string): Promise<ProcurementPO> {
    const response = await api.get(`/procurement/pos/${id}`);
    return response.data?.data || response.data;
  }

  async createPO(data: {
    rfq_id?: string;
    vendor_id: string;
    items: { material_id: string; quantity: number; price_per_unit: number; unit?: string }[];
    notes?: string;
  }): Promise<ProcurementPO> {
    const response = await api.post('/procurement/pos', data);
    return response.data?.data || response.data;
  }

  async issuePO(id: string): Promise<ProcurementPO> {
    const response = await api.patch(`/procurement/pos/${id}/issue`);
    return response.data?.data || response.data;
  }

  async receivePO(id: string, items: { po_item_id: string; heat_number: string }[]): Promise<ProcurementPO> {
    const response = await api.patch(`/procurement/pos/${id}/receive`, { items });
    return response.data?.data || response.data;
  }

  async deletePO(id: string): Promise<void> {
    await api.delete(`/procurement/pos/${id}`);
  }
}

export const procurementService = new ProcurementService();
