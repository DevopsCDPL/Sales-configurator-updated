import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { LoginCredentials, RegisterData, AuthState } from '../types';
import { authService } from '../services/authService';
import { clearConfiguratorPartsCache } from '../hooks/useConfiguratorParts';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(() => {
    // Check for impersonation handoff from CDPL admin opening Forge in a new tab
    const params = new URLSearchParams(window.location.search);
    if (params.get('impersonate') === '1') {
      const impToken = localStorage.getItem('forge_impersonate_token');
      const impUser = localStorage.getItem('forge_impersonate_user');
      if (impToken && impUser) {
        // Store in sessionStorage (tab-scoped) to avoid clobbering
        // the platform admin's localStorage token in the original tab
        sessionStorage.setItem('token', impToken);
        sessionStorage.setItem('user', impUser);
        localStorage.removeItem('forge_impersonate_token');
        localStorage.removeItem('forge_impersonate_user');
        // Clean up URL param
        params.delete('impersonate');
        const cleanUrl = params.toString()
          ? `${window.location.pathname}?${params.toString()}`
          : window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        const parsed = JSON.parse(impUser);
        return {
          user: parsed,
          token: impToken,
          isAuthenticated: true,
          isLoading: true, // will refresh profile
        };
      }
    }
    const token = authService.getToken();
    const storedUser = authService.getStoredUser();
    return {
      user: storedUser,
      token,
      isAuthenticated: !!token && !!storedUser,
      isLoading: !!token,
    };
  });

  // Track whether we just logged in so we can skip aggressive logout on 401
  const justLoggedIn = useRef(false);

  const refreshUser = useCallback(async () => {
    // Get token from localStorage to avoid stale closure
    const token = authService.getToken();
    if (token) {
      try {
        const user = await authService.getProfile();
        setState(prev => ({ ...prev, user, token, isAuthenticated: true, isLoading: false }));
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
        // If we JUST logged in, keep the session alive (token might be
        // malformed/instant-expiry due to backend misconfiguration, but
        // the login itself succeeded — don't kick the user out instantly).
        if (justLoggedIn.current) {
          console.warn('Profile fetch failed after login — keeping session alive');
          setState(prev => ({ ...prev, isLoading: false }));
        } else {
          authService.logout();
          setState({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false
          });
        }
      }
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Listen for 401 session-expired events from the API interceptor
  useEffect(() => {
    const handleSessionExpired = () => {
      authService.logout();
      setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
    };
    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, []);

  const login = async (credentials: LoginCredentials) => {
    const { user, token } = await authService.login(credentials);
    justLoggedIn.current = true;
    setState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false
    });
    // Clear the flag after a grace period
    setTimeout(() => { justLoggedIn.current = false; }, 15_000);
  };

  const register = async (data: RegisterData) => {
    const { user, token } = await authService.register(data);
    setState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false
    });
  };

  const logout = () => {
    authService.logout();
    clearConfiguratorPartsCache();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false
    });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
