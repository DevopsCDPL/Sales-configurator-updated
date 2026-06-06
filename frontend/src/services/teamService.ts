import api from './api';

export interface TeamMemberData {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
    position?: string;
  };
}

export interface TeamPermissionData {
  id: string;
  team_id: string;
  permission_key: string;
  enabled: boolean;
}

export interface TeamActivityData {
  id: string;
  team_id: string;
  user_id: string;
  action: string;
  type: string;
  created_at: string;
  user?: { id: string; name: string };
}

export interface TeamData {
  id: string;
  name: string;
  description?: string;
  company_id: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  company?: { id: string; name: string };
  creator?: { id: string; name: string };
  members: TeamMemberData[];
  permissions: TeamPermissionData[];
  activities?: TeamActivityData[];
  member_count?: number;
  member_avatars?: { id: string; name: string; initial: string }[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export const teamService = {
  async getAll(filters?: Record<string, string>): Promise<TeamData[]> {
    const response = await api.get<ApiResponse<TeamData[]>>('/teams', { params: filters });
    return response.data.data;
  },

  async getById(id: string): Promise<TeamData> {
    const response = await api.get<ApiResponse<TeamData>>(`/teams/${id}`);
    return response.data.data;
  },

  async create(data: { name: string; description?: string; company_id?: string; members?: { user_id: string; role: string }[] }): Promise<TeamData> {
    const response = await api.post<ApiResponse<TeamData>>('/teams', data);
    return response.data.data;
  },

  async update(id: string, data: { name?: string; description?: string }): Promise<TeamData> {
    const response = await api.put<ApiResponse<TeamData>>(`/teams/${id}`, data);
    return response.data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/teams/${id}`);
  },

  async addMember(teamId: string, data: { user_id: string; role?: string }): Promise<TeamData> {
    const response = await api.post<ApiResponse<TeamData>>(`/teams/${teamId}/members`, data);
    return response.data.data;
  },

  async removeMember(teamId: string, userId: string): Promise<TeamData> {
    const response = await api.delete<ApiResponse<TeamData>>(`/teams/${teamId}/members/${userId}`);
    return response.data.data;
  },

  async updateMemberRole(teamId: string, userId: string, role: string): Promise<TeamData> {
    const response = await api.put<ApiResponse<TeamData>>(`/teams/${teamId}/members/${userId}`, { role });
    return response.data.data;
  },

  async updatePermissions(teamId: string, permissions: Record<string, boolean>): Promise<TeamData> {
    const response = await api.put<ApiResponse<TeamData>>(`/teams/${teamId}/permissions`, { permissions });
    return response.data.data;
  },

  async getActivity(teamId: string): Promise<TeamActivityData[]> {
    const response = await api.get<ApiResponse<TeamActivityData[]>>(`/teams/${teamId}/activity`);
    return response.data.data;
  },
};
