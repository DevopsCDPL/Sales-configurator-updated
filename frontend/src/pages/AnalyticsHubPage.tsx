import React, { lazy, Suspense, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import {
  BarChart as BarChartIcon,
  Warning as WarningIcon,
  Insights as InsightsIcon,
} from '@mui/icons-material';

const BusinessAnalyticsPage = lazy(() => import('./BusinessAnalyticsPage'));
const RiskDashboard = lazy(() => import('../components/RiskDashboard'));

const PRIMARY = '#33d6ff';
const BORDER = '#1E2235';
const TEXT = '#F1F5F9';
const TEXT_DIM = '#94A3B8';

interface TabDef {
  key: string;
  label: string;
  icon: React.ReactElement;
}

const TABS: TabDef[] = [
  { key: 'business', label: 'Business Analytics', icon: <BarChartIcon sx={{ fontSize: 16 }} /> },
  { key: 'risk',     label: 'Risk Dashboard',     icon: <WarningIcon sx={{ fontSize: 16 }} /> },
];

const AnalyticsHubPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const initial = params.get('tab') || TABS[0].key;
  const [active, setActive] = useState<string>(TABS.some(t => t.key === initial) ? initial : TABS[0].key);

  const handleSelect = (key: string) => {
    setActive(key);
    const next = new URLSearchParams(params);
    next.set('tab', key);
    setParams(next, { replace: true });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#000', color: TEXT }}>
      {/* Hub header */}
      <Box sx={{ px: { xs: 1.5, sm: 2.5 }, pt: 1.5, pb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: 'rgba(51,214,255,0.12)', border: `1px solid ${PRIMARY}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <InsightsIcon sx={{ fontSize: 18, color: PRIMARY }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: TEXT, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Analytics</Typography>
          <Typography sx={{ fontSize: 11.5, color: TEXT_DIM, fontWeight: 500 }}>Business performance &amp; risk intelligence</Typography>
        </Box>
      </Box>

      {/* Horizontal tab bar */}
      <Box sx={{
        position: 'sticky', top: 0, zIndex: 5,
        bgcolor: '#000',
        borderBottom: `1px solid ${BORDER}`,
        px: { xs: 1.5, sm: 2.5 },
        display: 'flex', gap: 0.5, overflowX: 'auto',
        '&::-webkit-scrollbar': { height: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: BORDER, borderRadius: 2 },
      }}>
        {TABS.map(t => {
          const isActive = active === t.key;
          return (
            <Button
              key={t.key}
              onClick={() => handleSelect(t.key)}
              startIcon={t.icon}
              sx={{
                textTransform: 'none', fontWeight: isActive ? 700 : 500, fontSize: '0.82rem',
                color: isActive ? PRIMARY : TEXT_DIM,
                bgcolor: 'transparent', borderRadius: 0,
                px: 1.75, py: 1.25, minWidth: 'auto', flexShrink: 0,
                borderBottom: isActive ? `2px solid ${PRIMARY}` : '2px solid transparent',
                '&:hover': { bgcolor: 'rgba(51,214,255,0.06)', color: isActive ? PRIMARY : TEXT },
              }}
            >
              {t.label}
            </Button>
          );
        })}
      </Box>

      {/* Tab content */}
      <Box sx={{ p: '12px' }}>
        <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress sx={{ color: PRIMARY }} /></Box>}>
          {active === 'business' && <BusinessAnalyticsPage />}
          {active === 'risk' && <RiskDashboard />}
        </Suspense>
      </Box>
    </Box>
  );
};

export default AnalyticsHubPage;
