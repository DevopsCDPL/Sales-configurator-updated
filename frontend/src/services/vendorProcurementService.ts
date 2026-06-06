import api from './api';
import { VendorRFQ, VendorPO, RFQBundle, VendorSuppliedPart, VendorPurchaseOrder } from '../types';

class VendorProcurementService {
  // Procurement overview
  async getProcurementItems(): Promise<{ rfqs: VendorRFQ[]; purchaseOrders: VendorPO[] }> {
    const response = await api.get('/vendor-procurement');
    return response.data.data;
  }

  // Suggested vendors for a material
  async getSuggestedVendors(materialId: string) {
    const response = await api.get(`/vendor-procurement/suggested-vendors/${materialId}`);
    return response.data.data;
  }

  // RFQ CRUD
  async createRFQ(data: FormData | Partial<VendorRFQ>): Promise<VendorRFQ> {
    const response = await api.post('/vendor-procurement/rfq', data);
    return response.data.data;
  }

  async updateRFQ(id: string, data: FormData | Partial<VendorRFQ>): Promise<VendorRFQ> {
    const response = await api.put(`/vendor-procurement/rfq/${id}`, data);
    return response.data.data;
  }

  async deleteRFQ(id: string): Promise<void> {
    await api.delete(`/vendor-procurement/rfq/${id}`);
  }

  async selectVendor(rfqId: string): Promise<VendorRFQ> {
    const response = await api.patch(`/vendor-procurement/rfq/${rfqId}/select`);
    return response.data.data;
  }

  // Vendor PO
  async getAllPOs(params?: { status?: string }): Promise<VendorPO[]> {
    const response = await api.get('/vendor-procurement/po', { params });
    return response.data.data;
  }

  async getPOById(id: string): Promise<VendorPO> {
    const response = await api.get(`/vendor-procurement/po/${id}`);
    return response.data.data;
  }

  async generatePO(data: Partial<VendorPO>): Promise<VendorPO> {
    const response = await api.post('/vendor-procurement/po', data);
    return response.data.data;
  }

  async updatePO(id: string, data: Partial<VendorPO>): Promise<VendorPO> {
    const response = await api.put(`/vendor-procurement/po/${id}`, data);
    return response.data.data;
  }

  // ─── RFQ Bundle (Multi-Part RFQ System) ───────────────────────

  async getVendorSuppliedParts(projectId: string): Promise<VendorSuppliedPart[]> {
    const response = await api.get(`/vendor-procurement/vendor-parts/${projectId}`);
    return response.data.data;
  }

  async getRFQBundles(params?: { project_id?: string; status?: string }): Promise<RFQBundle[]> {
    const response = await api.get('/vendor-procurement/bundles', { params });
    return response.data.data;
  }

  async getRFQBundleById(id: string): Promise<RFQBundle> {
    const response = await api.get(`/vendor-procurement/bundles/${id}`);
    return response.data.data;
  }

  async createRFQBundle(data: Partial<RFQBundle> & { items: any[] }): Promise<RFQBundle> {
    const response = await api.post('/vendor-procurement/bundles', data);
    return response.data.data;
  }

  async updateRFQBundle(id: string, data: Partial<RFQBundle> & { items?: any[] }): Promise<RFQBundle> {
    const response = await api.put(`/vendor-procurement/bundles/${id}`, data);
    return response.data.data;
  }

  async deleteRFQBundle(id: string): Promise<void> {
    await api.delete(`/vendor-procurement/bundles/${id}`);
  }

  async duplicateRFQBundle(id: string): Promise<RFQBundle> {
    const response = await api.post(`/vendor-procurement/bundles/${id}/duplicate`);
    return response.data.data;
  }

  async sendRFQToVendor(id: string): Promise<{ bundle: RFQBundle; emailSent: boolean }> {
    const response = await api.post(`/vendor-procurement/bundles/${id}/send`);
    return { bundle: response.data.data, emailSent: response.data.emailSent !== false };
  }

  async downloadRFQBundlePdf(id: string): Promise<void> {
    const response = await api.get(`/vendor-procurement/bundles/${id}/pdf`, { responseType: 'blob' });
    const disposition = response.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : `RFQ_${id}.pdf`;
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  // ─── Vendor Purchase Order (from approved RFQ bundle) ─────────

  async getVendorPurchaseOrders(params?: { project_id?: string; vendor_id?: string; status?: string }): Promise<VendorPurchaseOrder[]> {
    const response = await api.get('/vendor-procurement/purchase-orders', { params });
    return response.data.data;
  }

  async getVendorPurchaseOrderById(id: string): Promise<VendorPurchaseOrder> {
    const response = await api.get(`/vendor-procurement/purchase-orders/${id}`);
    return response.data.data;
  }

  async createVendorPurchaseOrder(data: FormData | Partial<VendorPurchaseOrder> & { items?: any[] }): Promise<VendorPurchaseOrder> {
    const response = await api.post('/vendor-procurement/purchase-orders', data);
    return response.data.data;
  }

  async updateVendorPurchaseOrder(id: string, data: FormData | Partial<VendorPurchaseOrder> & { items?: any[] }): Promise<VendorPurchaseOrder> {
    const response = await api.put(`/vendor-procurement/purchase-orders/${id}`, data);
    return response.data.data;
  }

  async deleteVendorPurchaseOrder(id: string): Promise<void> {
    await api.delete(`/vendor-procurement/purchase-orders/${id}`);
  }

  async sendVendorPOToVendor(id: string): Promise<{ po: VendorPurchaseOrder; emailSent: boolean }> {
    const response = await api.post(`/vendor-procurement/purchase-orders/${id}/send`);
    return { po: response.data.data, emailSent: response.data.emailSent !== false };
  }

  async rateVendorPurchaseOrder(id: string, ratings: { price: number; delivery: number; quality: number }): Promise<VendorPurchaseOrder> {
    const response = await api.patch(`/vendor-procurement/purchase-orders/${id}/ratings`, ratings);
    return response.data.data;
  }

  async downloadVendorPOPdf(id: string): Promise<void> {
    const response = await api.get(`/vendor-procurement/purchase-orders/${id}/pdf`, { responseType: 'blob' });
    const disposition = response.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : `VPO_${id}.pdf`;
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
}

export const vendorProcurementService = new VendorProcurementService();
