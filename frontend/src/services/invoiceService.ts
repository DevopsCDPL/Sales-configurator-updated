import api from './api';

export interface InvoiceLineItem {
  part: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface InvoiceData {
  id?: string;
  project_id: string;
  invoice_number: string;
  invoice_type: 'Commercial' | 'Proforma' | 'Tax';
  invoice_date: string;
  customer_name: string;
  customer_address: string;
  client_po_number: string;
  client_po_date: string;
  project_name: string;
  revision: string;
  line_items: InvoiceLineItem[];
  tax_type: string;
  tax_percent: number;
  payment_terms: string;
  notes: string;
  terms_conditions?: { title: string; body: string }[];
  shipping_charges: number;
  subtotal: number;
  tax_amount: number;
  final_total: number;
  status: 'Draft' | 'Sent' | 'Paid' | 'Cancelled';
  created_at?: string;
  updated_at?: string;
}

export interface AnalyticsMetrics {
  totalRevenue: number;
  totalManufacturingCost: number;
  rawMaterialCost: number;
  processCost: number;
  totalProfit: number;
  profitMargin: number;
  activeOrders: number;
  topCustomers: { customer_name: string; total_revenue: number }[];
  revenueTrend: { month: string; revenue: number }[];
  materialUsage: { material_name: string; total_purchased: number; total_used: number; remaining: number }[];
}

export const invoiceService = {
  /** Fetch auto-populated invoice data for a project */
  async getAutoPopulatedData(projectId: string): Promise<Partial<InvoiceData>> {
    const response = await api.get(`/invoices/auto-populate/${projectId}`);
    return response.data.data;
  },

  /** Create a new invoice */
  async create(data: Partial<InvoiceData>): Promise<InvoiceData> {
    const response = await api.post('/invoices', data);
    return response.data.data;
  },

  /** Get all invoices for a project */
  async getByProjectId(projectId: string): Promise<InvoiceData[]> {
    const response = await api.get(`/invoices/project/${projectId}`);
    return response.data.data;
  },

  /** Get a single invoice by ID */
  async getById(id: string): Promise<InvoiceData> {
    const response = await api.get(`/invoices/${id}`);
    return response.data.data;
  },

  /** Update an invoice */
  async update(id: string, data: Partial<InvoiceData>): Promise<InvoiceData> {
    const response = await api.put(`/invoices/${id}`, data);
    return response.data.data;
  },

  /** Download invoice as PDF */
  async downloadPdf(id: string, invoiceType?: string): Promise<void> {
    const params = invoiceType ? `?invoice_type=${encodeURIComponent(invoiceType)}` : '';
    const response = await api.get(`/invoices/${id}/pdf${params}`, {
      responseType: 'blob',
    });
    const disposition = response.headers?.['content-disposition'] || '';
    const fnMatch = disposition.match(/filename="?([^";\n]+)"?/);
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fnMatch?.[1]?.trim() || `invoice-${id}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  /** Delete an invoice */
  async delete(id: string): Promise<void> {
    await api.delete(`/invoices/${id}`);
  },

  /** Get all invoices */
  async getAll(): Promise<InvoiceData[]> {
    const response = await api.get('/invoices/all');
    return response.data.data;
  },

  /** Get analytics dashboard metrics */
  async getAnalytics(): Promise<AnalyticsMetrics> {
    const response = await api.get('/invoices/analytics/metrics');
    return response.data.data;
  },
};

export default invoiceService;
