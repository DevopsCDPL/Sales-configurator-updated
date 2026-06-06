import api from './api';
import { Client, ApiResponse } from '../types';

export const clientService = {
  async getAll(filters?: Record<string, any>): Promise<Client[]> {
    const response = await api.get<ApiResponse<Client[]>>('/clients', { params: filters });
    return response.data.data;
  },

  async getById(id: string): Promise<Client> {
    const response = await api.get<ApiResponse<Client>>(`/clients/${id}`);
    return response.data.data;
  },

  async create(data: Partial<Client>): Promise<Client> {
    const response = await api.post<ApiResponse<Client>>('/clients', data);
    return response.data.data;
  },

  async update(id: string, data: Partial<Client>): Promise<Client> {
    const response = await api.put<ApiResponse<Client>>(`/clients/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/clients/${id}`);
  }
};
