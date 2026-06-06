import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Box, Typography } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import PlatformAdminSidebar, { SidebarBadges } from './PlatformAdminSidebar';
import api from '../../services/api';

const PlatformAdminLayout: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [badges, setBadges] = useState<SidebarBadges>({});

  // Fetch badge counts
  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const res = await api.get('/platform-admin/stats');
        const s = res.data;
        setBadges({
          companies: s.totalCompanies ?? 0,
          users: s.totalUsers ?? 0,
          expiring: s.expiringSoon ?? 0,
        });
      } catch {
        // silent
      }
    };
    fetchBadges();
  }, []);

  // Page title from path
  const getPageTitle = () => {
    const path = location.pathname.replace('/platform-admin', '').replace(/^\//, '');
    if (!path) return 'Dashboard';
    return path
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: '#F5F7FA' }}>
      <PlatformAdminSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        badges={badges}
      />

      {/* Main Content */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top Bar */}
        <Box
          sx={{
            height: 64,
            px: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            bgcolor: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <Typography variant="subtitle1" fontWeight={600} color="var(--text-primary)">
            {getPageTitle()}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {user?.name}
            </Typography>
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: '#22C55E',
                border: '2px solid #fff',
                boxShadow: '0 0 0 1px #22C55E33',
              }}
            />
          </Box>
        </Box>

        {/* Page Content */}
        <Box sx={{ flex: 1, p: 3, overflow: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

export default PlatformAdminLayout;
