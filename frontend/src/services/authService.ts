import api from './api';
import { User, LoginCredentials, RegisterData, ApiResponse } from '../types';
import { clearActiveCompanyContext } from '../utils/activeCompany';

interface AuthResponse {
  user: User;
  token: string;
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures (private mode / quota / restricted envs)
  }
}

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage remove failures
  }
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', credentials);
    const payload = response.data?.data;
    if (!payload?.user || !payload?.token) {
      throw new Error('Invalid login response from server');
    }
    const { user, token } = payload;
    clearActiveCompanyContext();
    safeSetItem('token', token);
    safeSetItem('user', JSON.stringify(user));
    return { user, token };
  },

  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/register', data);
    const payload = response.data?.data;
    if (!payload?.user || !payload?.token) {
      throw new Error('Invalid register response from server');
    }
    const { user, token } = payload;
    clearActiveCompanyContext();
    safeSetItem('token', token);
    safeSetItem('user', JSON.stringify(user));
    return { user, token };
  },

  async getProfile(): Promise<User> {
    const response = await api.get<ApiResponse<User>>('/auth/profile');
    const user = response.data?.data;
    if (!user || typeof user !== 'object') {
      throw new Error('Invalid profile response from server');
    }
    // Keep storage in sync so refreshes pick up latest data
    try {
      if (sessionStorage.getItem('token')) {
        sessionStorage.setItem('user', JSON.stringify(user));
      } else {
        safeSetItem('user', JSON.stringify(user));
      }
    } catch {
      safeSetItem('user', JSON.stringify(user));
    }
    return user;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post('/auth/change-password', { currentPassword, newPassword });
  },

  logout(): void {
    clearActiveCompanyContext();
    try { sessionStorage.removeItem('token'); sessionStorage.removeItem('user'); } catch {}
    safeRemoveItem('token');
    safeRemoveItem('user');
    safeRemoveItem('platform_admin_token');
    safeRemoveItem('platform_admin_user');
  },

  getStoredUser(): User | null {
    let userStr: string | null = null;
    try { userStr = sessionStorage.getItem('user'); } catch {}
    if (!userStr) userStr = safeGetItem('user');
    if (!userStr) return null;

    try {
      const parsed = JSON.parse(userStr);
      if (!parsed || typeof parsed !== 'object') {
        safeRemoveItem('user');
        return null;
      }
      return parsed as User;
    } catch {
      // Remove corrupted localStorage value (for example: "undefined")
      safeRemoveItem('user');
      return null;
    }
  },

  getToken(): string | null {
    try { const st = sessionStorage.getItem('token'); if (st) return st; } catch {}
    return safeGetItem('token');
  },

  isAuthenticated(): boolean {
    return !!safeGetItem('token');
  }
};
