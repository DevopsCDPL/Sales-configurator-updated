import api from './api';
import { Project, ApiResponse } from '../types';

export const projectService = {
  async getAll(filters?: Record<string, any>): Promise<Project[]> {
    const response = await api.get<ApiResponse<Project[]>>('/projects', { params: filters });
    return response.data.data;
  },

  async getById(id: string): Promise<Project> {
    const response = await api.get<ApiResponse<Project>>(`/projects/${id}`);
    return response.data.data;
  },

  async create(data: Partial<Project>): Promise<Project> {
    const response = await api.post<ApiResponse<Project>>('/projects', data);
    return response.data.data;
  },

  async update(id: string, data: Partial<Project>): Promise<Project> {
    const response = await api.put<ApiResponse<Project>>(`/projects/${id}`, data);
    return response.data.data;
  },

  async updateStatus(id: string, status: string): Promise<Project> {
    const response = await api.patch<ApiResponse<Project>>(`/projects/${id}/status`, { status });
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/projects/${id}`);
  },

  async copy(id: string): Promise<Project> {
    const response = await api.post<ApiResponse<Project>>(`/projects/${id}/copy`);
    return response.data.data;
  },

  async getWorkflow(): Promise<Record<string, string[]>> {
    const response = await api.get<ApiResponse<Record<string, string[]>>>('/projects/workflow');
    return response.data.data;
  },

  async getNextQuotationNumber(): Promise<string> {
    const response = await api.get<ApiResponse<string>>('/projects/next-quotation-number');
    return response.data.data;
  },

  async getNextProjectNumber(): Promise<string> {
    const response = await api.get<ApiResponse<string>>('/projects/next-project-number');
    return response.data.data;
  },

  async selectRevision(id: string, revision: number): Promise<Project> {
    const response = await api.patch<ApiResponse<Project>>(`/projects/${id}/select-revision`, { revision });
    return response.data.data;
  },

  async advanceWorkflow(id: string, completedStep: number): Promise<Project> {
    const response = await api.patch<ApiResponse<Project>>(`/projects/${id}/advance-workflow`, { completedStep });
    return response.data.data;
  }
};
