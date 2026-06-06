import api from './api';

export interface RecycleBinItem {
  id: string;
  _module: string;
  _label: string;
  _displayName: string;
  _deletedByName: string | null;
  deleted_at: string;
  deleted_by: string | null;
  [key: string]: any;
}

export interface RecycleBinData {
  [module: string]: {
    items: RecycleBinItem[];
    total: number;
  };
}

export const recycleBinService = {
  async getAll(params?: { module?: string; search?: string; page?: number; limit?: number }): Promise<RecycleBinData> {
    const response = await api.get('/recycle-bin', { params });
    return response.data.data;
  },

  async restore(module: string, id: string): Promise<{ message: string }> {
    const response = await api.post(`/recycle-bin/${module}/${id}/restore`);
    return response.data.data;
  },

  async permanentDelete(module: string, id: string): Promise<{ message: string }> {
    const response = await api.delete(`/recycle-bin/${module}/${id}`);
    return response.data.data;
  },

  async bulkRestore(items: { module: string; id: string }[]): Promise<{ message: string; restored: number; failed: number }> {
    const response = await api.post('/recycle-bin/bulk-restore', { items });
    return response.data.data;
  },

  async bulkPermanentDelete(items: { module: string; id: string }[]): Promise<{ message: string; deleted: number; failed: number }> {
    const response = await api.post('/recycle-bin/bulk-delete', { items });
    return response.data.data;
  },
};
