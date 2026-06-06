import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Skeleton,
  alpha,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  LinearProgress,
  Chip,
  Button,
} from '@mui/material';
import {
  Business as BusinessIcon,
  People as PeopleIcon,
  CheckCircle as ActiveIcon,
  Warning as WarningIcon,
  Block as BlockIcon,
  AdminPanelSettings as AdminIcon,
  TrendingUp as TrendUpIcon,
  Add as AddIcon,
  PersonAdd as PersonAddIcon,
  Refresh as RefreshIcon,
  ArrowForward as ArrowForwardIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

// ─── Design Tokens ──────────────────────────────────────────────────
const T = {
  surface: '#FFFFFF',
  border: '#E2E8F0',
  borderSubtle: '#F1F5F9',
  t1: '#0F172A',
  t2: '#475569',
  t3: '#94A3B8',
  teal: '#1F7A63',
  green: '#16A34A',
  blue: '#166354',
  purple: '#166354',
  amber: '#F59E0B',
  red: '#EF4444',
  shadow: '0 1px 3px rgba(0,0,0,0.06)',
};

// ─── Types ──────────────────────────────────────────────────────────
interface DashboardStats {
  totalCompanies: number;
  activeCompanies: number;
  totalUsers: number;
  platformAdmins: number;
  expiringSoon: number;
  expired: number;
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  time: string;
  icon: string;
  color: string;
}

// ─── Mock Data ──────────────────────────────────────────────────────
const MOCK_STATS: DashboardStats = {
  totalCompanies: 48,
  activeCompanies: 41,
  totalUsers: 312,
  platformAdmins: 5,
  expiringSoon: 4,
  expired: 3,
};

const generateSparkData = (base: number, count = 7, volatility = 0.15): number[] => {
  const data: number[] = [];
  let current = base * (1 - volatility * 2);
  for (let i = 0; i < count; i++) {
    current += base * volatility * (Math.random() - 0.3);
    data.push(Math.max(0, Math.round(current)));
  }
  data[count - 1] = base;
  return data;
};

const generateUserGrowthData = () => {
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
  let users = 85;
  return months.map(m => {
    users += Math.floor(Math.random() * 35) + 10;
    return { month: m, users, companies: Math.floor(users / 7) };
  });
};

const generateRevenueData = () => {
  const months = ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
  return months.map(m => ({
    month: m,
    revenue: Math.floor(Math.random() * 50000) + 80000,
    target: 100000,
  }));
};

const MOCK_ACTIVITY: ActivityItem[] = [
  { id: '1', type: 'user_signup', title: 'New user registered', description: 'Priya Sharma joined Tata Steel Corp', time: '2 min ago', icon: '👤', color: '#166354' },
  { id: '2', type: 'company_created', title: 'New company onboarded', description: 'Adani Forge Pvt Ltd added to the platform', time: '18 min ago', icon: '🏢', color: '#1F7A63' },
  { id: '3', type: 'subscription_change', title: 'Plan upgraded', description: 'JSW Industries upgraded to Enterprise plan', time: '1 hr ago', icon: '⬆️', color: '#166354' },
  { id: '4', type: 'admin_action', title: 'Admin permissions updated', description: 'Rahul Mehta promoted to Platform Admin', time: '2 hrs ago', icon: '🛡️', color: '#F59E0B' },
  { id: '5', type: 'company_expired', title: 'Subscription expired', description: 'SteelCraft Ltd subscription has expired', time: '3 hrs ago', icon: '⚠️', color: '#EF4444' },
  { id: '6', type: 'user_signup', title: 'New user registered', description: 'Anita Desai joined Bharat Forge Co', time: '4 hrs ago', icon: '👤', color: '#166354' },
  { id: '7', type: 'company_created', title: 'New company onboarded', description: 'Precision Engineering Works added', time: '5 hrs ago', icon: '🏢', color: '#1F7A63' },
  { id: '8', type: 'subscription_change', title: 'Trial started', description: 'MetalWorks India started 14-day trial', time: '6 hrs ago', icon: '🎯', color: '#16A34A' },
];

const INITIAL_CHECKLIST = [
  { id: 'c1', label: 'Create your first company', done: true, path: '/platform-admin/companies' },
  { id: 'c2', label: 'Invite a platform admin', done: true, path: '/platform-admin/admins' },
  { id: 'c3', label: 'Configure subscription plans', done: false, path: '/platform-admin/subscriptions' },
  { id: 'c4', label: 'Set up email notifications', done: false, path: '/platform-admin/notifications' },
  { id: 'c5', label: 'Review billing settings', done: false, path: '/platform-admin/billing' },
];

// ─── Sparkline SVG ──────────────────────────────────────────────────
const Sparkline: React.FC<{ data: number[]; color: string; w?: number; h?: number }> = ({
  data, color, w = 64, h = 24,
}) => {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  const gradId = `spk-${color.replace('#', '')}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill={`url(#${gradId})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ─── Area Chart ─────────────────────────────────────────────────────
const AreaChart: React.FC<{
  data: { label: string; values: { key: string; value: number; color: string }[] }[];
  height?: number;
}> = ({ data, height = 200 }) => {
  if (!data.length) return null;
  const allValues = data.flatMap(d => d.values.map(v => v.value));
  const max = Math.max(...allValues, 1);
  const w = 100, h2 = 60;
  const keys = data[0].values.map(v => v.key);
  const colors = data[0].values.map(v => v.color);

  return (
    <Box sx={{ px: 2, pb: 1.5 }}>
      <Box sx={{ height }}>
        <svg viewBox={`0 0 ${w} ${h2 + 12}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
          {keys.map((key, ki) => {
            const color = colors[ki];
            const pts = data.map((d, i) => {
              const x = (i / Math.max(data.length - 1, 1)) * w;
              const val = d.values.find(v => v.key === key)?.value || 0;
              const y = h2 - (val / max) * (h2 - 6) - 3;
              return { x, y };
            });
            const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
            const area = line + ` L${w},${h2} L0,${h2} Z`;
            const gId = `ac-${color.replace('#', '')}`;
            return (
              <g key={key}>
                <defs>
                  <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <path d={area} fill={`url(#${gId})`} />
                <path d={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={2} fill={T.surface} stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke">
                    <title>{data[i].label}: {data[i].values.find(v => v.key === key)?.value}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {data.map((d, i) => {
            if (i % Math.max(1, Math.floor(data.length / 5)) !== 0 && i !== data.length - 1) return null;
            const x = (i / Math.max(data.length - 1, 1)) * w;
            return <text key={i} x={x} y={h2 + 10} textAnchor="middle" fontSize={3.5} fill={T.t3}>{d.label}</text>;
          })}
        </svg>
      </Box>
    </Box>
  );
};

// ─── Bar Chart ──────────────────────────────────────────────────────
const BarChart: React.FC<{
  data: { label: string; value: number; target?: number }[];
  color: string;
  height?: number;
}> = ({ data, color, height = 180 }) => {
  if (!data.length) return null;
  const max = Math.max(...data.map(d => Math.max(d.value, d.target || 0)), 1);
  const w = 100, h2 = 55;
  const barW = (w / data.length) * 0.5;
  const gap = (w / data.length) * 0.5;

  return (
    <Box sx={{ px: 2, pb: 1.5 }}>
      <Box sx={{ height }}>
        <svg viewBox={`0 0 ${w} ${h2 + 12}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
          {data.map((d, i) => {
            const x = i * (barW + gap) + gap / 2;
            const barH = (d.value / max) * (h2 - 4);
            const tgtH = d.target ? (d.target / max) * (h2 - 4) : 0;
            return (
              <g key={i}>
                {d.target && (
                  <rect x={x - 1} y={h2 - tgtH} width={barW + 2} height={tgtH} rx={2} fill={alpha(color, 0.08)} />
                )}
                <rect x={x} y={h2 - barH} width={barW} height={barH} rx={2} fill={color} opacity={0.75}>
                  <title>{d.label}: ₹{d.value.toLocaleString()}</title>
                </rect>
              </g>
            );
          })}
          <line x1="0" y1={h2} x2={w} y2={h2} stroke={T.border} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
          {data.map((d, i) => {
            const x = i * (barW + gap) + gap / 2 + barW / 2;
            return <text key={i} x={x} y={h2 + 9} textAnchor="middle" fontSize={3} fill={T.t3}>{d.label}</text>;
          })}
        </svg>
      </Box>
    </Box>
  );
};

// ─── Card Wrappers ──────────────────────────────────────────────────
const DashCard: React.FC<{ children: React.ReactNode; sx?: object }> = ({ children, sx }) => (
  <Box sx={{
    bgcolor: T.surface, borderRadius: '14px', border: `1px solid ${T.border}`,
    boxShadow: T.shadow, overflow: 'hidden', ...sx,
  }}>
    {children}
  </Box>
);

const CardHead: React.FC<{ title: string; action?: React.ReactNode }> = ({ title, action }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, pt: 2, pb: 1 }}>
    <Typography sx={{ fontSize: 14, fontWeight: 700, color: T.t1, letterSpacing: '-0.01em' }}>{title}</Typography>
    {action}
  </Box>
);

// ─── Stat Card with Sparkline ───────────────────────────────────────
const EnhancedStatCard: React.FC<{
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  trend?: string;
  sparkData: number[];
  loading: boolean;
  onClick?: () => void;
}> = ({ title, value, icon, color, trend, sparkData, loading, onClick }) => (
  <Box
    onClick={onClick}
    sx={{
      bgcolor: T.surface, borderRadius: '14px',
      border: `1px solid ${alpha(color, 0.15)}`,
      boxShadow: T.shadow, p: '18px 20px',
      position: 'relative', overflow: 'hidden',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
      '&:hover': {
        transform: onClick ? 'translateY(-4px)' : 'none',
        boxShadow: onClick ? `0 12px 28px ${alpha(color, 0.18)}` : T.shadow,
        borderColor: alpha(color, 0.3),
      },
      '&::before': {
        content: '""', position: 'absolute', top: 0, left: 0, width: 4, height: '100%',
        background: `linear-gradient(180deg, ${color}, ${alpha(color, 0.4)})`,
        borderRadius: '14px 0 0 14px',
      },
      '&::after': {
        content: '""', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: `linear-gradient(135deg, ${alpha(color, 0.04)} 0%, transparent 60%)`,
        pointerEvents: 'none',
      },
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mb: 1.2 }}>
          <Box sx={{
            width: 40, height: 40, borderRadius: '11px', flexShrink: 0,
            background: `linear-gradient(135deg, ${alpha(color, 0.18)} 0%, ${alpha(color, 0.08)} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 2px 8px ${alpha(color, 0.15)}`,
          }}>
            {React.cloneElement(icon as React.ReactElement, { sx: { fontSize: 22, color } })}
          </Box>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.t2, letterSpacing: '0.01em' }}>{title}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
          {loading ? (
            <Skeleton width={60} height={36} />
          ) : (
            <Typography sx={{ fontSize: 28, fontWeight: 800, color: T.t1, lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</Typography>
          )}
          {trend && !loading && (
            <Box sx={{
              display: 'inline-flex', alignItems: 'center', gap: '2px',
              px: '6px', py: '2px', borderRadius: '6px',
              bgcolor: trend.startsWith('+') ? alpha('#10B981', 0.1) : alpha('#EF4444', 0.1),
            }}>
              <TrendUpIcon sx={{
                fontSize: 11,
                color: trend.startsWith('+') ? '#10B981' : '#EF4444',
                transform: trend.startsWith('-') ? 'rotate(180deg)' : 'none',
              }} />
              <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: trend.startsWith('+') ? '#10B981' : '#EF4444' }}>{trend}</Typography>
            </Box>
          )}
        </Box>
      </Box>
      {!loading && sparkData.length > 1 && (
        <Box sx={{ flexShrink: 0, mt: 1, opacity: 0.85 }}>
          <Sparkline data={sparkData} color={color} />
        </Box>
      )}
    </Box>
    {onClick && (
      <Box sx={{ position: 'absolute', bottom: 8, right: 12, zIndex: 1, opacity: 0.3 }}>
        <OpenInNewIcon sx={{ fontSize: 14, color: T.t3 }} />
      </Box>
    )}
  </Box>
);

const StatSkeleton: React.FC = () => (
  <Box sx={{
    bgcolor: T.surface, borderRadius: '14px', border: `1px solid ${T.border}`,
    p: '18px 20px', position: 'relative', overflow: 'hidden',
    '&::after': {
      content: '""', position: 'absolute', top: 0, left: '-100%',
      width: '200%', height: '100%',
      background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
      animation: 'shimmer 1.8s infinite',
    },
    '@keyframes shimmer': { '0%': { transform: 'translateX(-50%)' }, '100%': { transform: 'translateX(50%)' } },
  }}>
    <Box sx={{ display: 'flex', gap: 1.2, mb: 1.2 }}>
      <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: '11px' }} />
      <Skeleton width={90} height={16} sx={{ mt: 1 }} />
    </Box>
    <Skeleton width={55} height={30} />
  </Box>
);

// ═══════════════════════════════════════════════════════════════════════
//   MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
const PlatformDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [checklist, setChecklist] = useState(INITIAL_CHECKLIST);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/platform-admin/dashboard');
        setStats(res.data?.data || res.data);
      } catch {
        setStats(MOCK_STATS);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const s = stats || MOCK_STATS;

  const sparks = useMemo(() => ({
    totalCompanies: generateSparkData(s.totalCompanies),
    activeCompanies: generateSparkData(s.activeCompanies),
    totalUsers: generateSparkData(s.totalUsers),
    platformAdmins: generateSparkData(s.platformAdmins, 7, 0.08),
    expiringSoon: generateSparkData(s.expiringSoon, 7, 0.25),
    expired: generateSparkData(s.expired, 7, 0.2),
  }), [s]);

  const userGrowth = useMemo(() => generateUserGrowthData(), []);
  const revenueData = useMemo(() => generateRevenueData(), []);
  const userChartData = useMemo(() =>
    userGrowth.map(d => ({
      label: d.month,
      values: [
        { key: 'users', value: d.users, color: T.blue },
        { key: 'companies', value: d.companies, color: T.teal },
      ],
    })),
  [userGrowth]);

  const checklistDone = checklist.filter(c => c.done).length;
  const checklistTotal = checklist.length;
  const checklistPct = Math.round((checklistDone / checklistTotal) * 100);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await api.get('/platform-admin/dashboard');
      setStats(res.data?.data || res.data);
    } catch {
      setStats(MOCK_STATS);
    } finally {
      setLoading(false);
    }
  };

  const cards = [
    { title: 'Total Companies', value: s.totalCompanies, icon: <BusinessIcon />, color: T.teal, trend: '+12%', spark: sparks.totalCompanies, path: '/platform-admin/companies' },
    { title: 'Active Companies', value: s.activeCompanies, icon: <ActiveIcon />, color: T.green, trend: '+8%', spark: sparks.activeCompanies, path: '/platform-admin/companies' },
    { title: 'Total Users', value: s.totalUsers, icon: <PeopleIcon />, color: T.blue, trend: '+24%', spark: sparks.totalUsers, path: '/platform-admin/users' },
    { title: 'Platform Admins', value: s.platformAdmins, icon: <AdminIcon />, color: T.purple, trend: '+1', spark: sparks.platformAdmins, path: '/platform-admin/admins' },
    { title: 'Expiring Soon', value: s.expiringSoon, icon: <WarningIcon />, color: T.amber, trend: '-2', spark: sparks.expiringSoon, path: '/platform-admin/subscriptions' },
    { title: 'Expired', value: s.expired, icon: <BlockIcon />, color: T.red, trend: '+1', spark: sparks.expired, path: '/platform-admin/subscriptions' },
  ];

  const firstName = user?.name?.split(' ')[0] || 'Admin';

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>

      {/* ── Welcome Header + Quick Actions ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 800, color: T.t1, letterSpacing: '-0.02em' }}>
            Welcome back, {firstName}!
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: T.t2, mt: 0.3 }}>
            Here's what's happening on your platform today.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/platform-admin/companies')}
            sx={{
              bgcolor: T.teal, textTransform: 'none', fontWeight: 600, fontSize: 13,
              borderRadius: '10px', px: 2, py: 0.9,
              boxShadow: `0 2px 8px ${alpha(T.teal, 0.3)}`,
              '&:hover': { bgcolor: '#186B56' },
            }}
          >
            Add Company
          </Button>
          <Button
            variant="outlined"
            startIcon={<PersonAddIcon />}
            onClick={() => navigate('/platform-admin/users')}
            sx={{
              borderColor: T.border, color: T.t2, textTransform: 'none',
              fontWeight: 600, fontSize: 13, borderRadius: '10px', px: 2, py: 0.9,
              '&:hover': { borderColor: T.teal, color: T.teal, bgcolor: alpha(T.teal, 0.04) },
            }}
          >
            Invite User
          </Button>
          <Select
            value={dateRange}
            onChange={e => setDateRange(e.target.value as typeof dateRange)}
            size="small"
            sx={{
              minWidth: 100, fontSize: 12.5, borderRadius: '10px', bgcolor: T.surface,
              '& .MuiSelect-select': { py: 0.7, px: 1.2 },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
            }}
          >
            <MenuItem value="7d">Last 7 days</MenuItem>
            <MenuItem value="30d">Last 30 days</MenuItem>
            <MenuItem value="90d">Last 90 days</MenuItem>
            <MenuItem value="all">All time</MenuItem>
          </Select>
          <Tooltip title="Refresh data">
            <IconButton
              onClick={handleRefresh}
              size="small"
              sx={{
                bgcolor: T.surface, border: `1px solid ${T.border}`,
                borderRadius: '10px', width: 34, height: 34,
                '&:hover': { borderColor: T.teal, color: T.teal },
              }}
            >
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Stat Cards 3x2 Grid ── */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
        gap: 2, mb: 3,
      }}>
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <StatSkeleton key={i} />)
          : cards.map(card => (
              <EnhancedStatCard
                key={card.title}
                title={card.title}
                value={card.value}
                icon={card.icon}
                color={card.color}
                trend={card.trend}
                sparkData={card.spark}
                loading={loading}
                onClick={() => navigate(card.path)}
              />
            ))
        }
      </Box>

      {/* ── Charts Row ── */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr' },
        gap: 2, mb: 3,
      }}>
        <DashCard>
          <CardHead
            title="User & Company Growth"
            action={
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                {[{ label: 'Users', color: T.blue }, { label: 'Companies', color: T.teal }].map(l => (
                  <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: l.color }} />
                    <Typography sx={{ fontSize: 11, color: T.t3 }}>{l.label}</Typography>
                  </Box>
                ))}
              </Box>
            }
          />
          <AreaChart data={userChartData} height={200} />
        </DashCard>

        <DashCard>
          <CardHead
            title="Subscription Revenue"
            action={
              <Chip
                label={`₹${(revenueData.reduce((sum, d) => sum + d.revenue, 0) / 100000).toFixed(1)}L total`}
                size="small"
                sx={{ fontSize: 11, fontWeight: 600, bgcolor: alpha(T.green, 0.1), color: T.green, height: 22 }}
              />
            }
          />
          <BarChart data={revenueData.map(d => ({ label: d.month, value: d.revenue, target: d.target }))} color={T.teal} height={200} />
          <Box sx={{ display: 'flex', gap: 1.5, px: 2.5, pb: 1.5 }}>
            {[{ l: 'Revenue', o: 0.75 }, { l: 'Target', o: 0.08 }].map(x => (
              <Box key={x.l} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: 1, bgcolor: T.teal, opacity: x.o }} />
                <Typography sx={{ fontSize: 11, color: T.t3 }}>{x.l}</Typography>
              </Box>
            ))}
          </Box>
        </DashCard>
      </Box>

      {/* ── Bottom Row: Activity Feed + Checklist ── */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1.5fr 1fr' },
        gap: 2, mb: 3,
      }}>
        {/* Recent Activity Feed */}
        <DashCard>
          <CardHead
            title="Recent Activity"
            action={
              <Button
                size="small"
                endIcon={<ArrowForwardIcon sx={{ fontSize: '14px !important' }} />}
                onClick={() => navigate('/platform-admin/activity-logs')}
                sx={{
                  textTransform: 'none', fontSize: 12, fontWeight: 600, color: T.teal,
                  borderRadius: '8px', px: 1.2,
                  '&:hover': { bgcolor: alpha(T.teal, 0.06) },
                }}
              >
                View All
              </Button>
            }
          />
          <Box sx={{ px: 1, pb: 1.5 }}>
            {MOCK_ACTIVITY.map((item, idx) => (
              <Box
                key={item.id}
                sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1.5,
                  px: 1.5, py: 1.2, borderRadius: '10px',
                  transition: 'background 0.15s',
                  '&:hover': { bgcolor: alpha(item.color, 0.04) },
                  borderBottom: idx < MOCK_ACTIVITY.length - 1 ? `1px solid ${T.borderSubtle}` : 'none',
                }}
              >
                <Box sx={{
                  width: 34, height: 34, borderRadius: '9px', flexShrink: 0,
                  bgcolor: alpha(item.color, 0.1),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, mt: 0.2,
                }}>
                  {item.icon}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.t1, lineHeight: 1.3 }}>{item.title}</Typography>
                  <Typography sx={{ fontSize: 12, color: T.t2, lineHeight: 1.4, mt: 0.2 }}>{item.description}</Typography>
                </Box>
                <Typography sx={{ fontSize: 11, color: T.t3, whiteSpace: 'nowrap', flexShrink: 0, mt: 0.2 }}>
                  {item.time}
                </Typography>
              </Box>
            ))}
          </Box>
        </DashCard>

        {/* Getting Started + Billing Summary */}
        <DashCard>
          <CardHead title="Getting Started" />
          <Box sx={{ px: 2.5, pb: 1.5 }}>
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.8 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.t2 }}>
                  {checklistDone} of {checklistTotal} completed
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: T.teal }}>{checklistPct}%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={checklistPct}
                sx={{
                  height: 6, borderRadius: 3, bgcolor: alpha(T.teal, 0.1),
                  '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: T.teal },
                }}
              />
            </Box>

            {checklist.map((item) => (
              <Box
                key={item.id}
                onClick={() => {
                  if (!item.done) setChecklist(prev => prev.map(c => c.id === item.id ? { ...c, done: true } : c));
                  navigate(item.path);
                }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.2,
                  py: 1.1, px: 1, borderRadius: '8px',
                  cursor: 'pointer', transition: 'all 0.15s',
                  '&:hover': { bgcolor: alpha(T.teal, 0.04) },
                  borderBottom: `1px solid ${T.borderSubtle}`,
                  '&:last-child': { borderBottom: 'none' },
                }}
              >
                <Box sx={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: item.done ? 'none' : `2px solid ${T.border}`,
                  bgcolor: item.done ? T.teal : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}>
                  {item.done && <Typography sx={{ fontSize: 12, color: '#fff', lineHeight: 1 }}>✓</Typography>}
                </Box>
                <Typography sx={{
                  fontSize: 13, fontWeight: 500,
                  color: item.done ? T.t3 : T.t1,
                  textDecoration: item.done ? 'line-through' : 'none',
                  flex: 1,
                }}>
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Billing Summary Widget */}
          <Box sx={{
            mx: 2.5, mb: 2, p: 2, borderRadius: '10px',
            bgcolor: alpha(T.teal, 0.04), border: `1px solid ${alpha(T.teal, 0.12)}`,
          }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: T.t1, mb: 1.2 }}>
              💳 Billing Summary
            </Typography>
            {[
              { label: 'Monthly Recurring Revenue', value: '₹2.4L' },
              { label: 'Active Subscriptions', value: '41' },
              { label: 'Avg. Revenue / Company', value: '₹5,854' },
              { label: 'Next billing cycle', value: 'May 1, 2026' },
            ].map(row => (
              <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography sx={{ fontSize: 12, color: T.t2 }}>{row.label}</Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: T.t1 }}>{row.value}</Typography>
              </Box>
            ))}
          </Box>
        </DashCard>
      </Box>
    </Box>
  );
};

export default PlatformDashboardPage;
