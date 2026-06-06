import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import { getActiveCompanyId, listenToActiveCompanyChange } from '../utils/activeCompany';

interface CompanyLogoContextType {
  logoUrl: string | null;
  refreshLogo: () => Promise<void>;
}

const CompanyLogoContext = createContext<CompanyLogoContextType>({ logoUrl: null, refreshLogo: async () => {} });

export const DEFAULT_LOGO = '/j3m-logo-trimmed.jpeg';

export const CompanyLogoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(() => getActiveCompanyId());

  const refreshLogo = useCallback(async () => {
    try {
      const r = await api.get('/settings/company', {
        params: { _t: Date.now() },
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' },
      });
      const data = r.data?.data;
      if (data?.logo_data) {
        setLogoUrl(data.logo_data);
      } else if (data?.logo && !data?.logo_missing) {
        const base = (api.defaults.baseURL || '').replace('/api', '');
        setLogoUrl(`${base}${data.logo}?t=${Date.now()}`);
      } else {
        setLogoUrl(null);
      }
    } catch {
      setLogoUrl(null);
    }
  }, []);

  // Listen for active company changes (platform admin entering/exiting a company)
  useEffect(() => {
    const unsubscribe = listenToActiveCompanyChange(() => {
      setActiveCompanyId(getActiveCompanyId());
    });
    return unsubscribe;
  }, []);

  // Refresh logo on auth change or active company change
  useEffect(() => {
    if (isAuthenticated) refreshLogo();
  }, [isAuthenticated, activeCompanyId, refreshLogo]);

  return (
    <CompanyLogoContext.Provider value={{ logoUrl, refreshLogo }}>
      {children}
    </CompanyLogoContext.Provider>
  );
};

export const useCompanyLogo = () => useContext(CompanyLogoContext);
