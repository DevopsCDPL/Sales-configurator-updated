import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  alpha,
  useMediaQuery,
  Breadcrumbs,
  Link,
  Fade,
  Skeleton,
  CircularProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  ArrowBack as ArrowBackIcon,
  Info as InfoIcon,
  Calculate as CalculateIcon,
  RequestQuote as RequestQuoteIcon,
  ShoppingCart as ShoppingCartIcon,
  Storefront as StorefrontIcon,
  Build as BuildIcon,
  PrecisionManufacturing as PrecisionIcon,
  VerifiedUser as VerifiedUserIcon,
  LocalShipping as LocalShippingIcon,
  Description as DescriptionIcon,
  ContentCopy as CopyIcon,
  CheckCircle as CheckCircleIcon,
  Lock as LockIcon,
  Home as HomeIcon,
  FolderOpen as FolderOpenIcon,
  NavigateNext as NavNextIcon,
  BarChart as AnalyticsIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { projectService } from '../services/projectService';
import { Project, ProjectStatus } from '../types';
import { PROJECT_STEPS, statusToMaxStep } from '../config/projectSteps';

// Tab Components (eager â€” preserves existing bundle profile)
import ProjectInfoTab from '../components/ProjectTabs/ProjectInfoTab';
// EstimationTab is preserved on disk for backward compatibility but is
// replaced in the workflow by ConfigurationTab (Phase 3).
import QuotationTab from '../components/ProjectTabs/QuotationTab';
import SalesOrderTab from '../components/ProjectTabs/SalesOrderTab';
import WorkOrderTab from '../components/ProjectTabs/WorkOrderTab';
import ProductionTab from '../components/ProjectTabs/ProductionTab';
import QualityTab from '../components/ProjectTabs/QualityTab';
import LogisticsTab from '../components/ProjectTabs/LogisticsTab';
import InvoiceTab from '../components/ProjectTabs/InvoiceTab';
import DocumentsTab from '../components/ProjectTabs/DocumentsTab';
import AnalyticsTab from '../components/ProjectTabs/AnalyticsTab';

// Phase 3 â€” lazy-loaded shells (keep configurator code out of the initial bundle)
const ConfigurationTab = lazy(() => import('../components/ProjectTabs/ConfigurationTab'));
const DrawingGenerationTab = lazy(() => import('../components/ProjectTabs/DrawingGenerationTab'));

const TabFallback: React.FC = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 8 }}>
    <CircularProgress size={22} />
  </Box>
);

/* â”€â”€â”€ Palette â”€â”€â”€ */
const P = {
  primary: '#00c8ff',
  primaryLight: '#33d4ff',
  primaryBg: 'rgba(0, 200, 255, 0.08)',
  primaryGlow: 'rgba(0, 200, 255, 0.12)',
  dark: 'var(--text-primary)',
  text: 'var(--text-secondary)',
  muted: 'var(--text-muted)',
  border: 'var(--border)',
  borderLight: 'var(--border-subtle)',
  bg: 'var(--bg-canvas)',
  white: 'var(--bg-surface)',
  locked: 'var(--text-muted)',
};

/* â”€â”€â”€ Stepper animations â”€â”€â”€ */
const stepperKeyframes = `
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(0, 200, 255,0.06); }
  50% { box-shadow: 0 0 0 8px rgba(0, 200, 255,0.10); }
}
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(0, 200, 255,0.07), 0 0 12px rgba(0, 200, 255,0.04); }
  50% { box-shadow: 0 0 0 6px rgba(0, 200, 255,0.12), 0 0 20px rgba(0, 200, 255,0.06); }
}
@keyframes attentionPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.4); opacity: 0.7; }
}
@keyframes rippleEffect {
  0% { transform: scale(0); opacity: 0.5; }
  100% { transform: scale(2.5); opacity: 0; }
}
@keyframes stepSlideIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}`;
if (typeof document !== 'undefined' && !document.getElementById('pulse-kf')) {
  const style = document.createElement('style');
  style.id = 'pulse-kf';
  style.textContent = stepperKeyframes;
  document.head.appendChild(style);
}

/* â”€â”€â”€ Phase groups for visual separators â”€â”€â”€ */
const PHASE_BREAKS = new Set<number>(); // No phase separators
const PHASE_LABELS: Record<number, string> = {};

// Returns the highest tab index that the project status has already unlocked
// (delegates to the Phase-3 canonical 12-step mapping)
const statusToMaxTab = (status: ProjectStatus): number => statusToMaxStep(status);

interface TabPanelProps { children?: React.ReactNode; index: number; value: number; }
const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div hidden={value !== index} className="tab-panel-no-padding">
    {value === index && <Fade in timeout={250}><div>{children}</div></Fade>}
  </div>
);

/* â”€â”€â”€ Tab Metadata â€” canonical 12-step workflow (Phase 3) â”€â”€â”€ */
const tabs = PROJECT_STEPS.map((s) => ({ label: s.label, short: s.short, desc: s.desc }));

const tabIcons = [
  InfoIcon,           // 0  Project Info
  SettingsIcon,       // 1  Configuration
  RequestQuoteIcon,   // 2  Quotation
  ShoppingCartIcon,   // 3  PO from Client
  BuildIcon,          // 4  Work Order
  PrecisionIcon,      // 5  Production Traveller
  VerifiedUserIcon,   // 6  Quality
  LocalShippingIcon,  // 7  Logistics
  DescriptionIcon,    // 8  Invoice
  DescriptionIcon,    // 9  Documentation
  AnalyticsIcon,      // 10 Analytics
];

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  draft:           { label: 'Draft',         color: '#6B7280', bg: 'var(--border-subtle)', border: 'var(--border)', icon: 'ðŸ“' },
  estimated:       { label: 'Estimated',     color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.10)', border: 'rgba(56, 189, 248, 0.20)', icon: 'ðŸ“Š' },
  quoted:          { label: 'Quoted',        color: '#00c8ff', bg: 'rgba(0, 200, 255, 0.08)', border: 'rgba(0, 200, 255, 0.18)', icon: '💬' },
  order_confirmed: { label: 'Confirmed',     color: '#00c8ff', bg: 'rgba(0, 200, 255, 0.08)', border: 'rgba(0, 200, 255, 0.18)', icon: '✅' },
  in_production:   { label: 'In Production', color: '#fb923c', bg: 'rgba(251, 146, 60, 0.10)', border: 'rgba(251, 146, 60, 0.20)', icon: '🏭' },
  inspected:       { label: 'Inspected',     color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.10)', border: 'rgba(34, 211, 238, 0.20)', icon: '🔍' },
  shipped:         { label: 'Shipped',       color: '#0099cc', bg: 'rgba(0, 200, 255, 0.06)', border: 'rgba(0, 200, 255, 0.15)', icon: '📦' },
  issue:           { label: 'Issue',         color: '#DC2626', bg: 'rgba(220, 38, 38, 0.10)', border: 'rgba(220, 38, 38, 0.20)', icon: 'âš ï¸' },
  closed:          { label: 'Closed',        color: '#374151', bg: 'var(--bg-surface-2)', border: 'var(--border)', icon: 'ðŸ' },
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [maxUnlockedTab, setMaxUnlockedTab] = useState(1);
  const [copied, setCopied] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [rippleStep, setRippleStep] = useState<number | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const stepperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (id) loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadProject = useCallback(async () => {
    try {
      const data = await projectService.getById(id!);
      if (!data) {
        setError('Project data is empty');
        return;
      }
      setProject(data);
      setMaxUnlockedTab((prev) => Math.max(prev, statusToMaxTab(data.status)));
    } catch (err: any) {
      console.error('Error loading project:', err);
      setError(err.response?.data?.message || err.message || 'Error loading project');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isTabAccessible = (tabIndex: number) => {
    // Documentation (9) and Analytics (10) are always accessible (history views)
    return tabIndex <= maxUnlockedTab || tabIndex === 9 || tabIndex === 10;
  };

  const unlockAndGo = async (tabIndex: number) => {
    setMaxUnlockedTab((prev) => Math.max(prev, tabIndex));
    setActiveTab(tabIndex);
    // Advance backend project status based on the step just completed
    if (id) {
      try {
        const updated = await projectService.advanceWorkflow(id, tabIndex - 1);
        setProject(updated);
      } catch { /* status didn't change â€” ok */ }
    }
  };

  /* â”€â”€â”€ Check if any estimate part is Vendor Supplied â”€â”€â”€ */
  const hasVendorSupplied = useMemo(() => {
    if (!project) return false;
    const parts = project.estimate?.custom_parts || project.estimate?.all_items || [];
    return parts.some((p: any) => p.material_source === 'Vendor Supplied');
  }, [project]);

  const completedSteps = useMemo(() => {
    // Count steps that are "done" (below maxUnlockedTab), excluding Documents & Analytics
    let count = 0;
    for (let i = 0; i < 11; i++) { if (i < maxUnlockedTab) count++; }
    return count;
  }, [maxUnlockedTab]);

  const progressPct = Math.round((completedSteps / 11) * 100);

  const handleCopyId = () => {
    if (!project) return;
    navigator.clipboard.writeText(project.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  /* â”€â”€â”€ Keyboard navigation for stepper â”€â”€â”€ */
  const handleStepperKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      let next = activeTab + dir;
      while (next >= 0 && next < tabs.length) {
        if (isTabAccessible(next) || (next === maxUnlockedTab && next < 8)) {
          setActiveTab(next);
          break;
        }
        next += dir;
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, maxUnlockedTab]);

  const handleStepClick = useCallback((i: number) => {
    if (isTabAccessible(i) || (i === maxUnlockedTab && i < 9)) {
      setRippleStep(i);
      setTimeout(() => setRippleStep(null), 500);
      setActiveTab(i);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxUnlockedTab]);

  /* â”€â”€â”€ Attention logic â”€â”€â”€ */
  const getAttentionDot = useCallback((tabIndex: number): 'red' | 'amber' | null => {
    if (!project) return null;
    if (project.status === 'issue' && tabIndex >= 5 && tabIndex <= 7 && tabIndex === activeTab) return 'red';
    if (tabIndex === maxUnlockedTab && tabIndex < 11 && tabIndex !== activeTab) return 'amber';
    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, activeTab, maxUnlockedTab]);

  /* â”€â”€â”€ Loading skeleton â”€â”€â”€ */
  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: P.bg }}>
        <Box sx={{ p: 2, bgcolor: P.white, borderBottom: `1px solid ${P.border}` }}>
          <Skeleton variant="rectangular" width="40%" height={28} sx={{ borderRadius: 1, mb: 1 }} />
          <Skeleton variant="rectangular" width="70%" height={16} sx={{ borderRadius: 1 }} />
        </Box>
        <Box sx={{ p: 2, bgcolor: P.white, borderBottom: `1px solid ${P.border}` }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            {[...Array(isMobile ? 3 : 8)].map((_, i) => (
              <Skeleton key={i} variant="circular" width={28} height={28} />
            ))}
          </Box>
        </Box>
        <Box sx={{ p: 3 }}>
          <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
        </Box>
      </Box>
    );
  }

  if (error || !project) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: P.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Box sx={{
          bgcolor: P.white, borderRadius: 3, p: 4, maxWidth: 420, width: '90%',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center',
        }}>
          <Typography sx={{ fontSize: 48, mb: 1 }}>ðŸ˜•</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: P.dark, mb: 0.5 }}>
            {error ? 'Something went wrong' : 'Project not found'}
          </Typography>
          <Typography sx={{ fontSize: 13, color: P.muted, mb: 2 }}>
            {error || 'The project you are looking for does not exist or was deleted.'}
          </Typography>
          <Button
            variant="contained"
            onClick={() => navigate('/projects')}
            sx={{
              bgcolor: P.primary, textTransform: 'none', fontWeight: 600,
              borderRadius: 2, px: 3,
              '&:hover': { bgcolor: P.primaryLight },
            }}
          >
            Back to Projects
          </Button>
        </Box>
      </Box>
    );
  }

  const currentStatus = statusConfig[project.status] || statusConfig.draft;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: P.bg }}>

      {/* â•â•â• STICKY HEADER â•â•â• */}
      <Box data-project-sticky-header="true" ref={headerRef} sx={{
        position: 'sticky', top: 0, zIndex: 100,
        bgcolor: P.white,
        borderBottom: `1px solid ${P.border}`,
        boxShadow: scrolled ? '0 2px 8px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s ease',
      }}>

        {/* Row 2: Title + Badges (collapses on scroll) */}
        <Box sx={{
          px: { xs: 1.5, sm: 2.5 },
          pt: scrolled ? 0 : 0.5,
          pb: scrolled ? 0 : 0.75,
          overflow: 'hidden',
          maxHeight: scrolled ? 0 : 100,
          opacity: scrolled ? 0 : 1,
          transition: 'max-height 0.25s ease, opacity 0.2s ease, padding 0.2s ease',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton size="small" onClick={() => navigate('/projects')} sx={{
              color: P.muted, p: 0.4, border: `1px solid ${P.border}`, borderRadius: '7px',
              '&:hover': { color: P.primary, background: P.primaryBg, borderColor: P.primary },
            }}>
              <ArrowBackIcon sx={{ fontSize: 16 }} />
            </IconButton>

            <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: P.dark, letterSpacing: '-0.025em', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
              {project.project_name}{project.project_number ? ` : ${project.project_number}` : ''}
            </Typography>

            <Box sx={{ flex: 1 }} />
          </Box>
        </Box>

        {/* Compact bar when scrolled */}
        {scrolled && (
          <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: 0.5, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: `1px solid ${P.border}` }}>
            <IconButton size="small" onClick={() => navigate('/projects')} sx={{ color: P.muted, p: 0.3 }}>
              <ArrowBackIcon sx={{ fontSize: 15 }} />
            </IconButton>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: P.dark, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.project_name}{project.project_number ? ` : ${project.project_number}` : ''}
            </Typography>
          </Box>
        )}

        {/* â•â•â• WORKFLOW PIPELINE STEPPER â•â•â• */}
        <Box sx={{ borderTop: `1px solid ${P.borderLight}` }}>
          {/* Stepper */}
          <Box
            ref={stepperRef}
            tabIndex={0}
            onKeyDown={handleStepperKeyDown}
            sx={{
              display: 'flex', alignItems: 'flex-start',
              px: { xs: 0.5, sm: 1.5, md: 2.5 }, pb: 2, pt: 1.25,
              overflowX: 'hidden',
              outline: 'none',
              gap: { xs: 0, sm: 0.25, md: 0.5 },
              '&:focus-visible': {
                '& .step-circle': { outline: `2px solid ${alpha(P.primary, 0.4)}`, outlineOffset: 2 },
              },
            }}
          >
            {tabs.map((tab, i) => {
              const isActive = activeTab === i;
              const isCompleted = i < maxUnlockedTab && !isActive;
              const isAccessible = isTabAccessible(i);
              const isNext = i === maxUnlockedTab && i < 11;
              const isLocked = !isAccessible && !isNext;
              const Icon = tabIcons[i];
              const attention = getAttentionDot(i);
              const showSeparator = PHASE_BREAKS.has(i);

              return (
                <React.Fragment key={i}>
                  {/* Phase separator */}
                  {showSeparator && (
                    <Box sx={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'flex-start', pt: '11px', mx: { xs: 0.25, sm: 0.5, md: 0.75 },
                      flexShrink: 0,
                    }}>
                      <Box sx={{
                        width: 1, height: 16, bgcolor: '#e2e8f0', // replaced alpha(P.border, 0.6)
                        borderRadius: 1,
                      }} />
                      {!isMobile && PHASE_LABELS[i] && (
                        <Typography sx={{
                          fontSize: '0.55rem', fontWeight: 700, color: P.muted,
                          textTransform: 'uppercase', letterSpacing: '0.06em', mt: 0.25,
                          whiteSpace: 'nowrap',
                        }}>
                          {PHASE_LABELS[i]}
                        </Typography>
                      )}
                    </Box>
                  )}

                  <Tooltip
                    title={
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 180 }}>
                        <Box sx={{
                          width: 28, height: 28, borderRadius: '8px', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: isCompleted ? alpha(P.primary, 0.1) : isActive ? alpha(P.primary, 0.12) : 'var(--border-subtle)',
                          border: `1px solid ${isCompleted || isActive ? alpha(P.primary, 0.2) : 'var(--border)'}`,
                        }}>
                          <Icon sx={{ fontSize: 14, color: isCompleted || isActive ? P.primary : P.locked }} />
                        </Box>
                        <Box>
                          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                            Step {i + 1}: {tab.label}
                          </Typography>
                          <Typography sx={{ fontSize: '0.65rem', fontWeight: 450, color: '#64748B', lineHeight: 1.4 }}>
                            {tab.desc}
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mt: 0.4 }}>
                            {isCompleted ? (
                              <><CheckCircleIcon sx={{ fontSize: 10, color: P.primary }} />
                              <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: P.primary }}>Completed</Typography></>
                            ) : isActive ? (
                              <><Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: P.primary, animation: 'attentionPulse 2s infinite' }} />
                              <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: P.primary }}>In Progress</Typography></>
                            ) : isNext ? (
                              <><NavNextIcon sx={{ fontSize: 10, color: P.primaryLight }} />
                              <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: P.primaryLight }}>Next Step</Typography></>
                            ) : (
                              <><LockIcon sx={{ fontSize: 9, color: 'var(--text-muted)' }} />
                              <Typography sx={{ fontSize: '0.6rem', fontWeight: 500, color: 'var(--text-muted)' }}>Not Started</Typography></>
                            )}
                          </Box>
                        </Box>
                      </Box>
                    }
                    arrow placement="bottom" enterDelay={200}
                    componentsProps={{
                      tooltip: { sx: {
                        bgcolor: 'var(--bg-surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)',
                        borderRadius: '12px', boxShadow: '0 12px 40px -8px rgba(0,0,0,0.50), 0 4px 12px rgba(0,0,0,0.30)',
                        px: 1.75, py: 1.25, maxWidth: 260,
                      }},
                      arrow: { sx: { color: 'var(--bg-surface-2)', '&::before': { border: '1px solid var(--border)', bgcolor: 'var(--bg-surface-2)' } } },
                    }}
                  >
                    <Box
                      data-step={i}
                      onClick={() => handleStepClick(i)}
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        cursor: (isAccessible || isNext) ? 'pointer' : 'default',
                        position: 'relative', px: { xs: 0.5, sm: 0.75, md: 1 },
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        animation: `stepSlideIn 0.3s ease ${i * 0.03}s both`,
                        '&:hover': (isAccessible || isNext) && !isActive ? {
                          '& .step-circle': {
                            borderColor: P.primary, bgcolor: alpha(P.primary, 0.04),
                            transform: 'scale(1.15)',
                            boxShadow: `0 0 0 5px ${P.primaryGlow}`,
                          },
                          '& .step-label': { color: P.primary },
                        } : {},
                      }}
                    >
                      {/* Connector line (gradient fill up to current step) */}
                      {i > 0 && !showSeparator && (
                        <>
                          {/* Background track */}
                          <Box sx={{
                            position: 'absolute', top: { xs: 13, sm: 14, md: 15 }, right: '50%', width: '100%',
                            height: 2.5, zIndex: 0, bgcolor: '#f1f5f9', // replaced alpha(P.border, 0.5)
                            borderRadius: 2,
                          }} />
                          {/* Filled portion */}
                          {i <= maxUnlockedTab && (
                            <Box sx={{
                              position: 'absolute', top: { xs: 13, sm: 14, md: 15 }, right: '50%', width: '100%',
                              height: 2.5, zIndex: 0, borderRadius: 2,
                              background: `linear-gradient(90deg, ${P.primary}, ${alpha(P.primaryLight, 0.85)})`,
                              transition: 'opacity 0.4s ease',
                            }} />
                          )}
                        </>
                      )}

                      {/* Step circle */}
                      <Box className="step-circle" sx={{
                        width: { xs: 26, sm: 28, md: 30 }, height: { xs: 26, sm: 28, md: 30 }, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        position: 'relative', zIndex: 1,
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        overflow: 'hidden',
                        ...(isActive ? {
                          bgcolor: 'var(--bg-surface-3)',
                          border: `2.5px solid ${P.primary}`,
                          boxShadow: `0 0 0 4px ${alpha(P.primary, 0.15)}, 0 0 16px ${alpha(P.primary, 0.12)}`,
                          animation: 'glowPulse 2.5s ease-in-out infinite',
                        } : isCompleted ? {
                          bgcolor: P.primary,
                          border: `2px solid ${P.primary}`,
                          boxShadow: `0 1px 3px ${alpha(P.primary, 0.3)}`,
                        } : isNext ? {
                          bgcolor: P.white,
                          border: `2px solid ${P.primaryLight}`,
                        } : isLocked ? {
                          bgcolor: 'var(--bg-surface-2)',
                          border: `1.5px dashed ${P.border}`, // removed alpha() as it fails with CSS variables
                        } : {
                          bgcolor: P.white,
                          border: `2px solid ${P.locked}`,
                        }),
                      }}>
                        {/* Ripple effect */}
                        {rippleStep === i && (
                          <Box sx={{
                            position: 'absolute', inset: 0, borderRadius: '50%',
                            bgcolor: alpha(P.primary, 0.2),
                            animation: 'rippleEffect 0.5s ease-out forwards',
                          }} />
                        )}
                        {isActive ? <Icon sx={{ fontSize: 15, color: P.primary, position: 'relative', zIndex: 1 }} />
                          : isCompleted ? <CheckCircleIcon sx={{ fontSize: 17, color: '#fff', position: 'relative', zIndex: 1 }} />
                          : isNext ? <Icon sx={{ fontSize: 14, color: P.primaryLight }} />
                          : isLocked ? <LockIcon sx={{ fontSize: 12, color: P.locked }} />
                          : <Icon sx={{ fontSize: 14, color: P.muted }} />}
                      </Box>

                      {/* Attention dot */}
                      {attention && (
                        <Box sx={{
                          position: 'absolute', top: 1, right: 'calc(50% - 16px)',
                          width: 7, height: 7, borderRadius: '50%', zIndex: 2,
                          bgcolor: attention === 'red' ? '#DC2626' : '#F59E0B',
                          border: `1.5px solid var(--bg-canvas)`,
                          animation: 'attentionPulse 2s ease-in-out infinite',
                          boxShadow: `0 0 4px ${attention === 'red' ? 'rgba(220,38,38,0.4)' : 'rgba(245,158,11,0.4)'}`,
                        }} />
                      )}

                      {/* Step label */}
                      <Typography className="step-label" sx={{
                        fontSize: { xs: '0.55rem', sm: '0.62rem', md: '0.72rem' },
                        fontWeight: isActive ? 700 : isCompleted ? 600 : isNext ? 550 : 450,
                        color: isActive ? P.primary
                          : isCompleted ? P.text
                          : isNext ? P.primaryLight
                          : isLocked ? P.muted // removed alpha() as it fails with CSS variables
                          : '#6B7280',
                        mt: 0.75, textAlign: 'center', lineHeight: 1.2, letterSpacing: '-0.01em',
                        whiteSpace: 'nowrap',
                        transition: 'color 0.2s ease, font-weight 0.2s ease',
                        maxWidth: { xs: 56, sm: 68, md: 'none' },
                        overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {isMobile || isTablet ? tab.short : tab.label}
                      </Typography>

                      {/* Active indicator line */}
                      {isActive && (
                        <Box sx={{
                          width: 16, height: 2.5, borderRadius: 2, bgcolor: P.primary, mt: 0.3,
                          boxShadow: `0 0 6px ${alpha(P.primary, 0.3)}`,
                        }} />
                      )}
                    </Box>
                  </Tooltip>
                </React.Fragment>
              );
            })}
          </Box>
        </Box>
      </Box>

      {/* â•â•â• Tab Content (12-step workflow) â•â•â• */}
      <Box sx={{ pb: 4 }}>
        <TabPanel value={activeTab} index={0}>
          <ProjectInfoTab project={project} onUpdate={loadProject} onProceedToEstimation={() => unlockAndGo(1)} />
        </TabPanel>
        <TabPanel value={activeTab} index={1}>
          <Suspense fallback={<TabFallback />}>
            <ConfigurationTab
              project={project}
              onUpdate={loadProject}
              onBack={() => setActiveTab(0)}
              onNext={() => unlockAndGo(2)}
            />
          </Suspense>
        </TabPanel>
        <TabPanel value={activeTab} index={2}>
          <QuotationTab project={project} onUpdate={loadProject} onBack={() => setActiveTab(1)} onNext={() => unlockAndGo(3)} />
        </TabPanel>
        <TabPanel value={activeTab} index={3}>
          <SalesOrderTab project={project} onUpdate={loadProject} onBack={() => setActiveTab(2)} onNext={() => unlockAndGo(4)} hasVendorSupplied={hasVendorSupplied} />
        </TabPanel>
        <TabPanel value={activeTab} index={4}>
          <WorkOrderTab project={project} onUpdate={loadProject} onBack={() => setActiveTab(3)} onNext={() => unlockAndGo(5)} onGoToEstimation={() => setActiveTab(1)} />
        </TabPanel>
        <TabPanel value={activeTab} index={5}>
          <ProductionTab project={project} onUpdate={loadProject} onBack={() => setActiveTab(4)} onNext={() => unlockAndGo(6)} />
        </TabPanel>
        <TabPanel value={activeTab} index={6}>
          <QualityTab project={project} onUpdate={loadProject} onBack={() => setActiveTab(5)} onNext={() => unlockAndGo(7)} />
        </TabPanel>
        <TabPanel value={activeTab} index={7}>
          <LogisticsTab project={project} onUpdate={loadProject} onBack={() => setActiveTab(6)} onNext={() => unlockAndGo(8)} />
        </TabPanel>
        <TabPanel value={activeTab} index={8}>
          <InvoiceTab project={project} onUpdate={loadProject} onBack={() => setActiveTab(7)} onNext={() => unlockAndGo(9)} />
        </TabPanel>
        <TabPanel value={activeTab} index={9}>
          <DocumentsTab project={project} onUpdate={loadProject} hasVendorSupplied={hasVendorSupplied} onBack={() => setActiveTab(8)} onNext={() => unlockAndGo(10)} />
        </TabPanel>
        <TabPanel value={activeTab} index={10}>
          <AnalyticsTab project={project} onUpdate={loadProject} onBack={() => setActiveTab(9)} />
        </TabPanel>
      </Box>
    </Box>
  );
};

export default ProjectDetailPage;


