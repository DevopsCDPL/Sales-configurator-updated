import api from './api';
import { StockItem } from '../types';

class StockService {
  async getAll(params?: { search?: string }): Promise<StockItem[]> {
    const response = await api.get('/stocks', { params });
    return response.data.data;
  }

  async getById(id: string): Promise<StockItem> {
    const response = await api.get(`/stocks/${id}`);
    return response.data.data;
  }

  async create(data: Partial<StockItem>): Promise<StockItem> {
    const response = await api.post('/stocks', data);
    return response.data.data;
  }

  async bulkCreate(items: Partial<StockItem>[]): Promise<StockItem[]> {
    const response = await api.post('/stocks/bulk', { items });
    return response.data.data;
  }

  async update(id: string, data: Partial<StockItem>): Promise<StockItem> {
    const response = await api.put(`/stocks/${id}`, data);
    return response.data.data;
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/stocks/${id}`);
  }

  async addUnused(part_description: string, material_grade: string, quantity: number): Promise<StockItem> {
    const response = await api.post('/stocks/add-unused', { part_description, material_grade, quantity });
    return response.data.data;
  }
}

export const stockService = new StockService();
