import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  IconButton,
  Tooltip,
  Skeleton,
  Button,
  TextField,
  InputAdornment,
  Chip,
  alpha,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  AttachMoney as MoneyIcon,
  FolderOutlined as FolderIcon,
  CheckCircleOutline as CompletedIcon,
  PeopleOutline as PeopleIcon,
  TrendingUp as TrendUpIcon,
  Search as SearchIcon,
  Add as AddIcon,
  ArrowForward as ArrowForwardIcon,
  FileDownloadOutlined as DownloadIcon,
  AccessTime as RecentIcon,
  ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { projectService } from '../services/projectService';
import { clientService } from '../services/clientService';
import { vendorService } from '../services/vendorService';
import { Project, Client, Vendor } from '../types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

/* ---------------------------------------------------------------------------
   DESIGN TOKENS
   --------------------------------------------------------------------------- */
const C = {
  bg: 'var(--bg-canvas)',
  surface: 'var(--bg-surface)',
  border: 'var(--border)',
  borderLight: 'var(--border-subtle)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  blue: '#38bdf8',
  blueBg: 'rgba(56, 189, 248, 0.10)',
  green: '#00c8ff',
  greenBg: 'rgba(0, 200, 255, 0.08)',
  orange: '#F59E0B',
  orangeBg: '#FFFBEB',
  purple: '#0099cc',
  purpleBg: 'rgba(0, 200, 255, 0.08)',
  red: '#EF4444',
  redBg: 'rgba(220, 38, 38, 0.10)',
  PRIMARY: '#00c8ff',
  tealBg: 'rgba(34, 211, 238, 0.08)',
  slate100: 'var(--border-subtle)',
  slate200: 'var(--border)',
  slate400: 'var(--text-muted)',
  slate500: '#6B7280',
  slate600: 'var(--text-secondary)',
  slate800: 'var(--text-primary)',
  accent: '#00c8ff',
  accentBg: 'rgba(0, 200, 255, 0.08)',
};

/* Fade-in animation for cards and rows */
const fadeInSx = (delay = 0) => ({
  '@keyframes fadeInUp': {
    from: { opacity: 0, transform: 'translateY(12px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
  animation: `fadeInUp 0.4s ease ${delay}s both`,
});

const STATUS_LABELS: Record<string, string> = {
  estimated: 'Estimated',
  in_production: 'In Production',
  draft: 'Pending',
  closed: 'Completed',
  shipped: 'Shipped',
  issue: 'Issue',
  quoted: 'Quoted',
  order_confirmed: 'Confirmed',
  inspected: 'Inspected',
};

const STATUS_COLORS: Record<string, { bg: string; color: string; dot: string; icon: string }> = {
  draft:           { bg: 'var(--border-subtle)', color: '#6B7280', dot: 'var(--text-muted)', icon: '⏳' },
  estimated:       { bg: 'rgba(56, 189, 248, 0.10)', color: '#38bdf8', dot: '#38bdf8', icon: '📋' },
  quoted:          { bg: 'rgba(0, 200, 255, 0.08)', color: '#00c8ff', dot: '#00c8ff', icon: '💬' },
  order_confirmed: { bg: 'rgba(0, 200, 255, 0.08)', color: '#00c8ff', dot: '#00c8ff', icon: '✓' },
  in_production:   { bg: 'rgba(251, 146, 60, 0.10)', color: '#fb923c', dot: '#fb923c', icon: '⚙' },
  inspected:       { bg: 'rgba(34, 211, 238, 0.10)', color: '#22d3ee', dot: '#22d3ee', icon: '🔍' },
  shipped:         { bg: 'rgba(16, 185, 129, 0.10)', color: '#10b981', dot: '#10b981', icon: '📦' },
  closed:          { bg: 'rgba(0, 200, 255, 0.08)', color: '#0099cc', dot: '#0099cc', icon: '✅' },
  issue:           { bg: 'rgba(220, 38, 38, 0.10)', color: '#EF4444', dot: '#F87171', icon: '⚠' },
};

/* ---------------------------------------------------------------------------
   MINI SPARKLINE (SVG-based)
   --------------------------------------------------------------------------- */
const Sparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 60, h = 22;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="spark-chart" aria-hidden>
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#spark-${color.replace('#', '')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/* ---------------------------------------------------------------------------
   KPI CARD  (gradient bg, hover animation, sparkline)
   --------------------------------------------------------------------------- */
const KpiCard: React.FC<{
  icon: React.ReactNode;
  value: string | number;
  label: string;
  subtitle: string;
  accentColor: string;
  trend?: string;
  sparkData?: number[];
}> = ({ icon, value, label, subtitle, accentColor, trend, sparkData }) => (
  <Box sx={{
    display: 'flex', alignItems: 'center', gap: '14px',
    px: '20px', py: '18px',
    border: `1px solid var(--border)`,
    borderRadius: '12px',
    backgroundColor: 'var(--bg-surface)',
    position: 'relative', overflow: 'hidden',
    cursor: 'default',
    transition: 'border-color 0.22s ease',
    '&:hover': {
      borderColor: 'var(--border-strong)',
    },
  }}>
    <Box sx={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', backgroundColor: accentColor, borderRadius: '12px 0 0 12px', opacity: 0.5 }} />
    <Box sx={{
      width: 44, height: 44, borderRadius: '10px', flexShrink: 0,
      backgroundColor: alpha(accentColor, 0.10),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: accentColor,
      border: `1px solid ${alpha(accentColor, 0.18)}`,
    }}>
      {icon}
    </Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <Typography sx={{ fontSize: 22, fontWeight: 800, color: C.textPrimary, lineHeight: 1.1, letterSpacing: '-0.03em' }}>
          {value}
        </Typography>
        {trend && (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px', px: '5px', py: '1px', borderRadius: '6px', bgcolor: trend.startsWith('+') || trend.startsWith('\u2191') ? alpha('#10B981', 0.1) : alpha('#EF4444', 0.1) }}>
            <TrendUpIcon sx={{ fontSize: 11, color: trend.startsWith('+') || trend.startsWith('\u2191') ? '#10B981' : '#EF4444', transform: trend.startsWith('-') || trend.startsWith('\u2193') ? 'rotate(180deg)' : 'none' }} />
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: trend.startsWith('+') || trend.startsWith('\u2191') ? '#10B981' : '#EF4444' }}>{trend}</Typography>
          </Box>
        )}
      </Box>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, mt: '2px', letterSpacing: '0.01em' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 10.5, color: C.textMuted, mt: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {subtitle}
      </Typography>
    </Box>
    {sparkData && sparkData.length > 1 && (
      <Box sx={{ flexShrink: 0, opacity: 0.85 }}>
        <Sparkline data={sparkData} color={accentColor} />
      </Box>
    )}
  </Box>
);

const KpiSkeleton: React.FC = () => (
  <Box sx={{
    border: `1px solid ${C.border}`, borderRadius: '14px', px: '18px', py: '16px',
    display: 'flex', gap: '14px', alignItems: 'center',
    overflow: 'hidden', position: 'relative',
    '&::after': {
      content: '""', position: 'absolute', top: 0, left: '-100%',
      width: '200%', height: '100%',
      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
      animation: 'shimmer 1.8s infinite',
    },
    '@keyframes shimmer': { '0%': { transform: 'translateX(-50%)' }, '100%': { transform: 'translateX(50%)' } },
  }}>
    <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: '11px' }} />
    <Box>
      <Skeleton width={55} height={22} />
      <Skeleton width={85} height={12} sx={{ mt: '2px' }} />
    </Box>
  </Box>
);

/* ---------------------------------------------------------------------------
   STATUS BADGE
   --------------------------------------------------------------------------- */
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const meta = STATUS_COLORS[status] || { bg: C.slate100, color: C.slate500, dot: C.slate400, icon: '•' };
  const label = STATUS_LABELS[status] || status;
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      px: '10px', py: '3.5px', borderRadius: '999px',
      bgcolor: meta.bg, border: `1px solid ${alpha(meta.color, 0.18)}`,
      transition: 'all 0.15s',
      '&:hover': {
        boxShadow: `0 2px 8px ${alpha(meta.color, 0.15)}`,
        transform: 'scale(1.02)',
      },
    }}>
      <Typography sx={{ fontSize: 10, lineHeight: 1 }}>{meta.icon}</Typography>
      <Typography sx={{ fontSize: 11.5, fontWeight: 650, color: meta.color, whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
    </Box>
  );
};

/* ---------------------------------------------------------------------------
   DONUT CHART FOR RISK OVERVIEW
   --------------------------------------------------------------------------- */
const DonutChart: React.FC<{ segments: { label: string; value: number; color: string }[] }> = ({ segments }) => {
  const size = 120;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const [hovered, setHovered] = useState<number | null>(null);

  let cumulativeOffset = 0;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      {/* SVG Donut */}
      <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={C.slate100} strokeWidth={strokeWidth} />
          {segments.map((seg, i) => {
            const ratio = seg.value / total;
            const dashLen = ratio * circumference;
            const offset = -cumulativeOffset + circumference * 0.25;
            cumulativeOffset += dashLen;
            const isHov = hovered === i;
            return (
              <circle
                key={i}
                cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke={seg.color} strokeWidth={isHov ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={offset}
                strokeLinecap="round"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  transition: 'stroke-width 0.2s ease, stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease',
                  cursor: 'pointer',
                  filter: isHov ? `drop-shadow(0 2px 6px ${alpha(seg.color, 0.4)})` : 'none',
                }}
              />
            );
          })}
        </svg>
        <Box sx={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          {hovered !== null ? (
            <>
              <Typography sx={{ fontSize: 16, fontWeight: 700, color: segments[hovered].color, lineHeight: 1 }}>
                {segments[hovered].value}%
              </Typography>
              <Typography sx={{ fontSize: 9, fontWeight: 600, color: C.textMuted, lineHeight: 1.2, mt: '1px', textAlign: 'center' }}>
                {segments[hovered].label}
              </Typography>
            </>
          ) : (
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.textSecondary, lineHeight: 1 }}>Risk</Typography>
          )}
        </Box>
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {segments.map((seg, i) => (
          <Box key={i} sx={{
            display: 'flex', alignItems: 'center', gap: '6px',
            cursor: 'pointer', px: '4px', py: '2px', borderRadius: '6px',
            transition: 'all 0.15s',
            bgcolor: hovered === i ? alpha(seg.color, 0.06) : 'transparent',
            '&:hover': { bgcolor: alpha(seg.color, 0.08) },
          }}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: seg.color, flexShrink: 0, transition: 'transform 0.15s', transform: hovered === i ? 'scale(1.3)' : 'scale(1)' }} />
            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 500, color: C.textSecondary, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                {seg.label}
              </Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, lineHeight: 1.3 }}>
                {seg.value}%
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

/* ---------------------------------------------------------------------------
   MAIN DASHBOARD
   --------------------------------------------------------------------------- */
const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [_vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [p, c, v] = await Promise.all([
          projectService.getAll(),
          clientService.getAll(),
          vendorService.getAll(),
        ]);
        setProjects(p);
        setClients(c);
        setVendors(v);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  /* --- Keyboard shortcuts --- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        navigate('/projects?action=new');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  /* --- Derived data --- */
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => !['closed', 'shipped'].includes(p.status)).length;
  const inProductionCount = projects.filter(p => p.status === 'in_production').length;
  const awaitingApproval = projects.filter(p => ['draft', 'estimated'].includes(p.status)).length;
  const completedThisMonth = useMemo(() => {
    const now = dayjs();
    return projects.filter(p =>
      ['closed', 'shipped'].includes(p.status) &&
      dayjs(p.updated_at).month() === now.month() &&
      dayjs(p.updated_at).year() === now.year()
    ).length;
  }, [projects]);
  const totalClients = clients.length;
  const newClientsThisMonth = useMemo(() => {
    const now = dayjs();
    return clients.filter(c =>
      dayjs(c.created_at).month() === now.month() &&
      dayjs(c.created_at).year() === now.year()
    ).length;
  }, [clients]);

  /* Sparkline trend data (simulated weekly) */
  const sparkRevenue = useMemo(() => [12, 18, 14, 22, 19, 26, 24], []);
  const sparkActive = useMemo(() => [3, 5, 4, 6, Math.max(2, activeProjects - 1), activeProjects, activeProjects], [activeProjects]);
  const sparkCompleted = useMemo(() => [0, 1, 0, 2, 1, completedThisMonth, completedThisMonth], [completedThisMonth]);
  const sparkClients = useMemo(() => [totalClients - 3, totalClients - 2, totalClients - 1, totalClients, totalClients, totalClients + 1, totalClients].map(n => Math.max(0, n)), [totalClients]);

  // Filtered projects for table
  const filteredProjects = useMemo(() => {
    let list = [...projects].sort((a, b) => dayjs(b.updated_at).unix() - dayjs(a.updated_at).unix());

    if (timeFilter !== 'all') {
      const now = dayjs();
      list = list.filter(p => {
        const d = dayjs(p.updated_at);
        if (timeFilter === 'today') return d.isSame(now, 'day');
        if (timeFilter === 'week') return d.isAfter(now.subtract(7, 'day'));
        if (timeFilter === 'month') return d.isSame(now, 'month');
        return true;
      });
    }

    if (statusFilter !== 'all') {
      list = list.filter(p => p.status === statusFilter);
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(p =>
        p.project_name.toLowerCase().includes(q) ||
        (p.client?.client_name || '').toLowerCase().includes(q)
      );
    }

    return list.slice(0, 8);
  }, [projects, timeFilter, statusFilter, searchTerm]);

  // Recent activity
  const recentActivity = useMemo(() => {
    return [...projects]
      .sort((a, b) => dayjs(b.updated_at).unix() - dayjs(a.updated_at).unix())
      .slice(0, 5);
  }, [projects]);

  // Risk metrics (computed from project statuses)
  const riskMetrics = useMemo(() => {
    const total = projects.length || 1;
    const issueCount = projects.filter(p => p.status === 'issue').length;
    const inProd = projects.filter(p => p.status === 'in_production').length;
    const overallRisk = Math.round((issueCount / total) * 100);
    return {
      overall: overallRisk,
      supplyChain: Math.min(Math.round((inProd / total) * 40), 100),
      delay: Math.min(Math.round(((issueCount + inProd) / total) * 50), 100),
      resource: Math.min(Math.round((activeProjects / total) * 30), 100),
      riskLevel: overallRisk > 50 ? 'High Risk' : overallRisk > 20 ? 'Medium Risk' : 'Low Risk',
      riskColor: overallRisk > 50 ? C.red : overallRisk > 20 ? C.orange : C.green,
    };
  }, [projects, activeProjects]);

  const totalRevenue = useMemo(() => {
    return projects.reduce((sum, p) => sum + (p.estimate?.final_price || 0), 0);
  }, [projects]);

  const formatDate = (iso: string) => dayjs(iso).format('MMM DD, YYYY');

  /* --- CSV Export --- */
  const handleExportCSV = () => {
    const headers = ['S.No', 'Project Name', 'Client', 'Status', 'Last Updated'];
    const rows = filteredProjects.map((p, i) => [
      i + 1, `"${p.project_name}"`, `"${p.client?.client_name || '-'}"`,
      STATUS_LABELS[p.status] || p.status, formatDate(p.updated_at),
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dashboard-projects-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click(); URL.revokeObjectURL(url);
    setToast('CSV exported successfully');
  };

  /* --- Render --- */
  return (
    <Box sx={{ width: '100%' }}>

      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '24px' }}>
        <Box>
          <Typography sx={{ fontSize: 23, fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
            Operations Dashboard
          </Typography>
          <Typography sx={{ fontSize: 13, color: C.textMuted, mt: '4px', fontWeight: 500 }}>
            Real-time visibility into projects, production, and performance metrics.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: C.textMuted, mr: '2px' }}>Show:</Typography>
          {(['today', 'week', 'month', 'all'] as const).map(f => {
            const labels: Record<string, string> = { today: 'Today', week: 'This Week', month: 'This Month', all: 'All' };
            const active = timeFilter === f;
            return (
              <Chip key={f} label={labels[f]} size="small" onClick={() => setTimeFilter(f)}
                sx={{
                  fontSize: 11, fontWeight: active ? 700 : 500, borderRadius: '999px', height: 26, px: '6px',
                  backgroundColor: active ? '#00c8ff' : 'transparent',
                  color: active ? '#06151c' : C.textSecondary,
                  border: active ? '1px solid transparent' : `1px solid ${C.border}`, cursor: 'pointer',
                  boxShadow: 'none',
                  transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease',
                  '&:hover': active
                    ? { backgroundColor: '#33d4ff' }
                    : { bgcolor: 'rgba(255,255,255,0.04)', borderColor: 'var(--border-strong)', color: C.textPrimary },
                }}
              />
            );
          })}
        </Box>
      </Box>

      {/* KPI Cards */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
        gap: '14px', mb: '24px',
      }}>
        {loading ? (
          <>
            <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
          </>
        ) : (
          <>
            <KpiCard
              icon={<MoneyIcon sx={{ fontSize: 20 }} />}
              value={totalRevenue > 0 ? `$${totalRevenue.toLocaleString()}` : '$0'}
              label="Total Revenue"
              subtitle={`\u2192 0% vs last month`}
              accentColor={C.blue}
              trend="+0%"
              sparkData={sparkRevenue}
            />
            <KpiCard
              icon={<FolderIcon sx={{ fontSize: 20 }} />}
              value={activeProjects}
              label="Active Projects"
              subtitle={`${inProductionCount} in Production \u00B7 ${awaitingApproval} awaiting approval`}
              accentColor={C.green}
              trend={activeProjects > 0 ? `${activeProjects}` : undefined}
              sparkData={sparkActive}
            />
            <KpiCard
              icon={<CompletedIcon sx={{ fontSize: 20 }} />}
              value={completedThisMonth}
              label="Completed This Month"
              subtitle={`${totalProjects > 0 ? Math.round((completedThisMonth / totalProjects) * 100) : 0}% on-time delivery rate`}
              accentColor={C.orange}
              trend={completedThisMonth > 0 ? `+${completedThisMonth}` : undefined}
              sparkData={sparkCompleted}
            />
            <KpiCard
              icon={<PeopleIcon sx={{ fontSize: 20 }} />}
              value={totalClients}
              label="Total Clients"
              subtitle={`${newClientsThisMonth} new onboarded this month`}
              accentColor={C.PRIMARY}
              trend={newClientsThisMonth > 0 ? `+${newClientsThisMonth}` : undefined}
              sparkData={sparkClients}
            />
          </>
        )}
      </Box>

      {/* Main Body: Table + Sidebar */}
      <Grid container spacing="18px" alignItems="flex-start">

        {/* LEFT: Project Overview Table */}
        <Grid item xs={12} md={8.5}>
          <Card elevation={0} sx={{
            border: `1px solid ${C.border}`, borderRadius: '12px',
            bgcolor: 'var(--bg-surface)', overflow: 'hidden',
            boxShadow: 'none',
            transition: 'border-color 0.22s ease',
            '&:hover': { borderColor: 'var(--border-strong)' },
            ...fadeInSx(0.1),
          }}>
            {/* Toolbar */}
            <Box sx={{
              px: '18px', py: '12px', borderBottom: `1px solid ${C.borderLight}`,
              display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.textPrimary, letterSpacing: '-0.02em' }}>
                Project Overview
              </Typography>
              <Box sx={{ flex: 1 }} />
              <TextField
                size="small"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                sx={{
                  width: 180,
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '8px', fontSize: 11.5, bgcolor: C.bg,
                    height: 32,
                    '& fieldset': { borderColor: C.border },
                    '&:hover fieldset': { borderColor: C.slate200 },
                    '&.Mui-focused fieldset': { borderColor: C.blue, borderWidth: 1.5 },
                  },
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 14, color: C.textMuted }} />
                    </InputAdornment>
                  ),
                }}
              />
              <Tooltip title="Export CSV">
                <IconButton size="small" onClick={handleExportCSV} sx={{
                  width: 32, height: 32, border: `1px solid ${C.border}`, borderRadius: '8px',
                  color: C.textMuted, '&:hover': { bgcolor: C.slate100, color: C.accent },
                }}>
                  <DownloadIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                onClick={() => navigate('/projects')}
                sx={{
                  textTransform: 'none', fontWeight: 600, fontSize: 11.5,
                  borderRadius: '8px', height: 32, px: '12px',
                  borderColor: C.accent, color: C.accent,
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: C.accentBg, borderColor: C.accent, transform: 'scale(1.02)' },
                }}
              >
                New Project
              </Button>
            </Box>

            {/* Status Filter Pills */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '18px', py: '8px', borderBottom: `1px solid ${C.borderLight}`, overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
              {([
                { key: 'all', label: 'All', dot: C.green },
                { key: 'estimated', label: 'Estimated', dot: '#38bdf8' },
                { key: 'quoted', label: 'Quoted', dot: '#00c8ff' },
                { key: 'in_production', label: 'In Production', dot: '#fb923c' },
                { key: 'closed', label: 'Completed', dot: '#0099cc' },
              ] as { key: string; label: string; dot: string }[]).map(tab => {
                const active = statusFilter === tab.key;
                return (
                  <Chip
                    key={tab.key}
                    icon={<Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: active ? '#06151c' : tab.dot, ml: '4px !important', mr: '-2px !important', flexShrink: 0 }} />}
                    label={tab.label}
                    size="small"
                    onClick={() => setStatusFilter(tab.key)}
                    sx={{
                      fontSize: '11px', fontWeight: active ? 700 : 500,
                      borderRadius: '999px', px: '10px', height: 26,
                      backgroundColor: active ? '#00c8ff' : 'var(--bg-surface-2)',
                      color: active ? '#06151c' : 'var(--text-secondary)',
                      border: active ? '1px solid transparent' : `1px solid ${C.border}`,
                      cursor: 'pointer',
                      boxShadow: 'none',
                      transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease',
                      '&:hover': active
                        ? { backgroundColor: '#33d4ff' }
                        : { bgcolor: 'var(--bg-canvas)', borderColor: 'var(--border-strong)', color: 'var(--text-primary)' },
                    }}
                  />
                );
              })}
            </Box>

            {/* Table Header */}
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: '36px minmax(120px, 1fr) minmax(100px, 0.8fr) 80px 100px 90px 50px',
              alignItems: 'center', px: '16px', py: '8px',
              borderBottom: `1px solid ${C.border}`, bgcolor: 'transparent',
              background: 'var(--bg-surface-2)', gap: '12px',
            }}>
              {[
                { label: '#', align: 'center' },
                { label: 'PROJECT', align: 'left' },
                { label: 'CLIENT', align: 'left' },
                { label: 'STAGE', align: 'center' },
                { label: 'STATUS', align: 'center' },
                { label: 'UPDATED', align: 'center' },
                { label: '', align: 'center' },
              ].map((h, i) => (
                <Typography key={i} sx={{
                  fontSize: 9.5, fontWeight: 700, color: C.textMuted,
                  textTransform: 'uppercase', letterSpacing: '.07em',
                  textAlign: h.align as any,
                }}>
                  {h.label}
                </Typography>
              ))}
            </Box>

            {/* Table Rows */}
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Box key={i} sx={{ px: '16px', py: '10px', borderBottom: `1px solid ${C.borderLight}` }}>
                  <Skeleton variant="rounded" height={16} width={`${70 + (i * 7) % 25}%`} sx={{ borderRadius: '4px' }} />
                </Box>
              ))
            ) : filteredProjects.length === 0 ? (
              <Box sx={{ py: 5, textAlign: 'center' }}>
                <Box sx={{ fontSize: 40, mb: 1, opacity: 0.5 }}>📋</Box>
                <Typography sx={{ color: C.textMuted, fontSize: 13, fontWeight: 600 }}>No projects found</Typography>
                <Typography sx={{ color: C.textMuted, fontSize: 11, mt: 0.5 }}>Try adjusting your search or time filter</Typography>
              </Box>
            ) : (
              filteredProjects.map((project, idx) => {
                // Compute stage progress from status
                const stageMap: Record<string, number> = { draft: 10, estimated: 25, quoted: 35, order_confirmed: 50, in_production: 65, inspected: 80, shipped: 90, closed: 100, issue: 60 };
                const stagePct = stageMap[project.status] || 10;
                const stageColor = STATUS_COLORS[project.status]?.color || C.textMuted;
                return (
                <Box
                  key={project.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '36px minmax(120px, 1fr) minmax(100px, 0.8fr) 80px 100px 90px 50px',
                    alignItems: 'center', px: '16px', py: '8px', gap: '12px',
                    borderBottom: `1px solid ${C.borderLight}`,
                    borderLeft: '3px solid transparent',
                    cursor: 'pointer',
                    bgcolor: idx % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: alpha(C.accent, 0.04),
                      borderLeftColor: C.accent,
                    },
                    ...fadeInSx(0.05 * idx),
                  }}
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  <Typography sx={{ fontSize: 11, color: C.textMuted, fontWeight: 500, textAlign: 'center' }}>
                    {idx + 1}
                  </Typography>
                  <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                    <Typography sx={{
                      fontSize: 12.5, fontWeight: 600, color: C.textPrimary,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}>
                      {project.project_name}
                    </Typography>
                  </Box>
                  <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                    <Typography sx={{
                      fontSize: 11.5, color: C.textSecondary,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }}>
                      {project.client?.client_name || '\u2014'}
                    </Typography>
                  </Box>
                  {/* Stage progress bar */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <Box sx={{ width: '100%', height: 6, borderRadius: 3, bgcolor: alpha(stageColor, 0.12), overflow: 'hidden' }}>
                      <Box sx={{ width: `${stagePct}%`, height: '100%', borderRadius: 3, background: `linear-gradient(90deg, ${stageColor}, ${alpha(stageColor, 0.7)})`, transition: 'width 0.4s ease' }} />
                    </Box>
                    <Typography sx={{ fontSize: 9, fontWeight: 600, color: C.textMuted }}>{stagePct}%</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <StatusBadge status={project.status} />
                  </Box>
                  <Typography sx={{ fontSize: 11, color: C.textMuted, whiteSpace: 'nowrap', textAlign: 'center' }}>
                    {dayjs(project.updated_at).fromNow()}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: '2px', justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
                    <Tooltip title="View">
                    <IconButton size="small" onClick={() => navigate(`/projects/${project.id}`)}
                      sx={{ color: C.textMuted, p: '3px', borderRadius: '6px', '&:hover': { bgcolor: C.slate100, color: C.accent } }}>
                      <ChevronRightIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              );
              })
            )}

            {/* Footer */}
            {!loading && filteredProjects.length > 0 && (
              <Box sx={{
                px: '16px', py: '8px', borderTop: `1px solid ${C.borderLight}`,
                bgcolor: 'transparent',
                background: 'var(--bg-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <Typography sx={{ fontSize: 11, color: C.textMuted }}>
                  Showing {filteredProjects.length} of {projects.length} projects
                </Typography>
                <Button
                  size="small"
                  endIcon={<ArrowForwardIcon sx={{ fontSize: 12 }} />}
                  onClick={() => navigate('/projects')}
                  sx={{
                    textTransform: 'none', fontSize: 11.5, fontWeight: 600, color: C.accent, py: 0,
                    transition: 'all 0.15s ease',
                    '&:hover': { bgcolor: C.accentBg, transform: 'scale(1.02)' },
                  }}
                >
                  View All Projects
                </Button>
              </Box>
            )}
          </Card>
        </Grid>

        {/* RIGHT: Sidebar Panels */}
        <Grid item xs={12} md={3.5}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Production Risk Overview */}
            <Card elevation={0} sx={{
              border: `1px solid ${C.border}`, borderRadius: '12px', bgcolor: 'var(--bg-surface)',
              boxShadow: 'none', overflow: 'hidden',
              transition: 'border-color 0.22s ease',
              '&:hover': { borderColor: 'var(--border-strong)' },
              ...fadeInSx(0.15),
            }}>
              <CardContent sx={{ p: '14px !important' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mb: '10px' }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: C.accent }} />
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.textPrimary, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Production Risk Overview
                  </Typography>
                </Box>

                {/* Risk header — inline */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '12px' }}>
                  <Typography sx={{ fontSize: 36, fontWeight: 700, color: riskMetrics.riskColor, lineHeight: 1, letterSpacing: '-0.03em' }}>
                    {riskMetrics.overall}%
                  </Typography>
                  <Box>
                    <Typography sx={{ fontSize: 11, color: C.textMuted }}>Overall Risk Score</Typography>
                    <Chip label={`\u25CF ${riskMetrics.riskLevel}`} size="small"
                      sx={{ mt: '2px', fontSize: 10, fontWeight: 600, bgcolor: alpha(riskMetrics.riskColor, 0.1), color: riskMetrics.riskColor, border: `1px solid ${alpha(riskMetrics.riskColor, 0.2)}`, borderRadius: '999px', height: 20 }} />
                  </Box>
                </Box>

                <DonutChart segments={[
                  { label: 'Supply Chain', value: riskMetrics.supplyChain, color: C.orange },
                  { label: 'Delay Risk', value: riskMetrics.delay, color: C.red },
                  { label: 'Resource', value: riskMetrics.resource, color: C.blue },
                ]} />

                <Button fullWidth variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
                  sx={{ mt: '8px', textTransform: 'none', fontWeight: 600, fontSize: 11, borderRadius: '7px', height: 30, borderColor: C.accent, color: C.accent, transition: 'all 0.15s ease', '&:hover': { bgcolor: C.accentBg, borderColor: C.accent, transform: 'scale(1.02)' } }}>
                  Download Risk Report
                </Button>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card elevation={0} sx={{
              border: `1px solid ${C.border}`, borderRadius: '12px', bgcolor: 'var(--bg-surface)',
              boxShadow: 'none', overflow: 'hidden',
              transition: 'border-color 0.22s ease',
              '&:hover': { borderColor: 'var(--border-strong)' },
              ...fadeInSx(0.25),
            }}>
              <CardContent sx={{ p: '14px !important' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', mb: '8px' }}>
                  <Box sx={{ bgcolor: alpha(C.accent, 0.08), borderRadius: '5px', p: '3px', display: 'flex' }}>
                    <RecentIcon sx={{ fontSize: 12, color: C.accent }} />
                  </Box>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.textPrimary, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Recent Activity
                  </Typography>
                </Box>

                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} variant="rounded" height={28} sx={{ mb: 0.75, borderRadius: '6px' }} />
                  ))
                ) : recentActivity.length === 0 ? (
                  <Typography sx={{ fontSize: 11.5, color: C.textMuted }}>No recent activity.</Typography>
                ) : (
                  recentActivity.map((p, i) => {
                    const sc = STATUS_COLORS[p.status] || { dot: C.slate400, color: C.slate500 };
                    return (
                      <Box key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: '8px', py: '5px',
                          borderBottom: i < recentActivity.length - 1 ? `1px solid ${C.borderLight}` : 'none',
                          cursor: 'pointer', px: '2px',
                          '&:hover': { bgcolor: C.bg },
                          '&:hover .rn': { color: C.accent },
                        }}>
                        <Box sx={{ fontSize: 13, flexShrink: 0, lineHeight: 1 }}>{sc.icon || '●'}</Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography className="rn" sx={{
                            fontSize: 12, fontWeight: 600, color: C.textPrimary,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {p.project_name}
                          </Typography>
                          <Typography sx={{ fontSize: 10, color: C.textMuted }}>
                            {STATUS_LABELS[p.status] || p.status} &middot; {dayjs(p.updated_at).fromNow()}
                          </Typography>
                        </Box>
                        <Box sx={{
                          display: 'inline-flex', alignItems: 'center', gap: '2px', flexShrink: 0,
                          px: '6px', py: '1px', borderRadius: '20px',
                          bgcolor: alpha(sc.color, 0.08), border: `1px solid ${alpha(sc.color, 0.15)}`,
                        }}>
                          <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: sc.dot }} />
                          <Typography sx={{ fontSize: 9.5, fontWeight: 600, color: sc.color, whiteSpace: 'nowrap' }}>
                            {STATUS_LABELS[p.status] || p.status}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })
                )}
              </CardContent>
            </Card>

          </Box>
        </Grid>
      </Grid>
      {/* Toast Notifications */}
      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="success"
          onClose={() => setToast(null)}
          sx={{ borderRadius: '10px', fontWeight: 600, fontSize: 12 }}
        >
          {toast}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DashboardPage;
