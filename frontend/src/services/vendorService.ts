import api from './api';
import { Vendor } from '../types';

class VendorService {
  async getAll(): Promise<Vendor[]> {
    const response = await api.get('/vendors');
    return response.data?.data || response.data || [];
  }

  async getById(id: string): Promise<Vendor> {
    const response = await api.get(`/vendors/${id}`);
    return response.data?.data || response.data;
  }

  async create(data: Partial<Vendor>): Promise<Vendor> {
    const response = await api.post('/vendors', data);
    return response.data?.data || response.data;
  }

  async update(id: string, data: Partial<Vendor>): Promise<Vendor> {
    const response = await api.put(`/vendors/${id}`, data);
    return response.data?.data || response.data;
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/vendors/${id}`);
  }

  async getByCategory(category: string): Promise<Vendor[]> {
    const response = await api.get(`/vendors/category/${category}`);
    return response.data?.data || response.data || [];
  }

  async getAllMaterials(): Promise<any[]> {
    const response = await api.get('/vendors/materials/all');
    return response.data?.data || response.data || [];
  }
}

export const vendorService = new VendorService();
