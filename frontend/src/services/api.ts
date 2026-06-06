import axios from 'axios';
import { clearActiveCompanyContext, getActiveCompanyId, shouldApplyActiveCompany } from '../utils/activeCompany';

// Prefer runtime-injected URL (set by start.js at deploy time) over build-time CRA env var
export const API_BASE_URL =
  (typeof window !== 'undefined' && (window as any).__RUNTIME_API_URL__) ||
  process.env.REACT_APP_API_URL ||
  '/api';

// Get the backend base URL (without /api suffix) for direct file access
export const getBackendBaseUrl = (): string => {
  // If API_BASE_URL is relative (/api), use window.location.origin
  if (API_BASE_URL.startsWith('/')) {
    return window.location.origin;
  }
  // If API_BASE_URL is absolute, strip /api suffix to get base URL
  return API_BASE_URL.replace(/\/api\/?$/, '');
};

const api = axios.create({
  baseURL: API_BASE_URL,
  // 45-second ceiling prevents the UI from getting stuck in a perpetual
  // "loading" state when the backend stalls (e.g. network flake, long SQL).
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Tracks the last successful login timestamp so we don't immediately redirect
// users back to /login when the backend generates short-lived or instant-expiry
// tokens (e.g. JWT_EXPIRES_IN env var misconfigured).
let _lastLoginSuccessAt = 0;
const LOGIN_GRACE_MS = 15_000; // 15-second grace window after login

// Request interceptor to add auth token and handle FormData Content-Type
api.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const storedUser = (() => {
      try {
        const raw = sessionStorage.getItem('user') || localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })();

    if (shouldApplyActiveCompany(storedUser, config.url)) {
      const activeCompanyId = getActiveCompanyId();
      if (activeCompanyId) {
        config.headers['x-active-company-id'] = activeCompanyId;
      }
    }

    // Let the browser set Content-Type (with boundary) for FormData uploads
    if (config.data instanceof FormData) {
      config.headers['Content-Type'] = undefined;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    // Record successful login so we can suppress premature 401 redirects
    if (response.config?.url?.includes('/auth/login') && response.status === 200) {
      _lastLoginSuccessAt = Date.now();
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || '';
      const isLoginRequest = requestUrl.includes('/auth/login');
      const isProfileRequest = requestUrl.includes('/auth/profile') || requestUrl.includes('/auth/me');
      if (!isLoginRequest && !isProfileRequest) {
        const hadToken = !!(sessionStorage.getItem('token') || localStorage.getItem('token'));
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        clearActiveCompanyContext();
        // Only fire session-expired if a token existed AND we're outside the
        // post-login grace window. This prevents a redirect loop when the
        // backend generates instant-expiry tokens.
        if (hadToken && Date.now() - _lastLoginSuccessAt > LOGIN_GRACE_MS) {
          window.dispatchEvent(new Event('auth:session-expired'));
        }
      }
    }
    
    // Parse blob error responses so callers can access the JSON error message
    if (error.response?.data instanceof Blob && error.response.data.type === 'application/json') {
      try {
        const text = await error.response.data.text();
        const json = JSON.parse(text);
        error.response.data = json;
      } catch (_) {}
    }
    
    // Ensure error has a message property
    if (error.response?.data && !error.response.data.message) {
      error.response.data.message = error.message || 'An error occurred';
    }
    
    return Promise.reject(error);
  }
);

export default api;
