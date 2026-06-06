import api from './api';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  phone?: string;
  position?: string;
  department?: string;
  company_id?: string;
  company_name?: string;
  last_login?: string;
  created_at?: string;
  updated_at?: string;
  teamMemberships?: Array<{ team_id: string; role: string; team?: { id: string; name: string } }>;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role: string;
  department?: string;
  position?: string;
  phone?: string;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  role?: string;
  is_active?: boolean;
  department?: string;
  position?: string;
  phone?: string;
}

class UserManagementService {
  async getAll(filters?: Record<string, any>): Promise<UserRecord[]> {
    const response = await api.get('/users', { params: filters });
    return response.data?.data || response.data || [];
  }

  async getById(id: string): Promise<UserRecord> {
    const response = await api.get(`/users/${id}`);
    return response.data?.data || response.data;
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    const response = await api.post('/users', data);
    return response.data?.data || response.data;
  }

  async update(id: string, data: UpdateUserData): Promise<UserRecord> {
    const response = await api.put(`/users/${id}`, data);
    return response.data?.data || response.data;
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  }

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await api.post(`/users/${id}/reset-password`, { newPassword });
  }

  async getTeams(): Promise<Array<{ id: string; name: string }>> {
    const response = await api.get('/teams');
    return response.data?.data || response.data || [];
  }

  async assignTeam(teamId: string, userId: string, role: string = 'Member'): Promise<void> {
    await api.post(`/teams/${teamId}/members`, { user_id: userId, role });
  }

  async removeFromTeam(teamId: string, userId: string): Promise<void> {
    await api.delete(`/teams/${teamId}/members/${userId}`);
  }
}

export const userManagementService = new UserManagementService();
