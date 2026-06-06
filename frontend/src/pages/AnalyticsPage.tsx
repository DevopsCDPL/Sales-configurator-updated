import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Card, Grid, Select, MenuItem, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Skeleton, IconButton, Tooltip, alpha, Button, CircularProgress,
  Snackbar, Alert,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AttachMoney as MoneyIcon,
  LocalShipping as ShippingIcon,
  Engineering as EngineeringIcon,
  PieChart as PieChartIcon,
  Refresh as RefreshIcon,
  FileDownload as DownloadIcon,
} from '@mui/icons-material';
import { businessAnalyticsService, DatePeriod } from '../services/businessAnalyticsService';
import {
  BusinessAnalyticsDashboard, AnalyticsKPIs, RevenueTrendPoint,
  ProfitVsCostPoint, OrderPipelinePoint, TopCustomerPoint, RecentOrder,
} from '../types';

// ─── Color Tokens ────────────────────────────────────────────────────────
const PRIMARY = '#1F7A63';
const PRIMARY_LIGHT = '#e0e7ff';
const BG = 'var(--bg-canvas)';
const CARD_BG = '#FFFFFF';
const BORDER = 'var(--border)';
const TEXT_DARK = 'var(--text-primary)';
const TEXT_MED = 'var(--text-secondary)';
const TEXT_LIGHT = 'var(--text-muted)';
const CARD_SHADOW = '0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)';

const STATUS_COLORS: Record<string, string> = {
  draft: '#94A3B8',
  estimated: '#3B82F6',
  quoted: '#2A9D7E',
  order_confirmed: '#1F7A63',
  in_production: '#F59E0B',
  inspected: '#06B6D4',
  shipped: '#10B981',
  closed: '#6B7280',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  estimated: 'Estimated',
  quoted: 'Quoted',
  order_confirmed: 'Order Confirmed',
  in_production: 'In Production',
  inspected: 'Inspected',
  shipped: 'Shipped',
  closed: 'Closed',
};

const CHART_COLORS = ['#1F7A63', '#3B82F6', '#F59E0B', '#EF4444', '#2A9D7E', '#06B6D4', '#EC4899', '#F97316'];

const formatCurrency = (v: number) => `₹${v.toLocaleString('en-IN')}`;

// ─── KPI Card ────────────────────────────────────────────────────────────
const KPICard: React.FC<{
  title: string; value: string; subtitle?: string;
  icon: React.ReactNode; color: string; bgColor: string;
}> = ({ title, value, subtitle, icon, color, bgColor }) => (
  <Card sx={{ p: 2.5, borderRadius: '14px', border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW, height: '100%' }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: TEXT_LIGHT, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {title}
      </Typography>
      <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {React.cloneElement(icon as React.ReactElement, { sx: { fontSize: 18, color } })}
      </Box>
    </Box>
    <Typography sx={{ fontSize: '1.6rem', fontWeight: 700, color: TEXT_DARK, lineHeight: 1.2, mb: 0.5 }}>
      {value}
    </Typography>
    {subtitle && (
      <Typography sx={{ fontSize: '0.75rem', color: TEXT_MED }}>{subtitle}</Typography>
    )}
  </Card>
);

// ─── Simple Bar Chart (SVG) ──────────────────────────────────────────────
const SimpleBarChart: React.FC<{
  data: { label: string; values: { value: number; color: string; label: string }[] }[];
  height?: number;
}> = ({ data, height = 220 }) => {
  const maxVal = Math.max(...data.flatMap(d => d.values.map(v => v.value)), 1);
  const barW = Math.min(24, Math.floor(500 / (data.length * 3 + data.length)));
  const gap = 4;
  const groupW = data[0]?.values.length * (barW + gap);
  const totalW = data.length * (groupW + 20);

  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <svg width={Math.max(totalW, 300)} height={height + 40} style={{ display: 'block' }}>
        {data.map((group, gi) => (
          <g key={gi} transform={`translate(${gi * (groupW + 20) + 30}, 0)`}>
            {group.values.map((v, vi) => {
              const barH = (v.value / maxVal) * height;
              return (
                <g key={vi}>
                  <rect x={vi * (barW + gap)} y={height - barH} width={barW} height={barH} rx={3} fill={v.color} opacity={0.85} />
                  <title>{`${v.label}: ${formatCurrency(v.value)}`}</title>
                </g>
              );
            })}
            <text x={groupW / 2} y={height + 16} textAnchor="middle" fontSize={10} fill={TEXT_LIGHT}>
              {group.label}
            </text>
          </g>
        ))}
      </svg>
    </Box>
  );
};

// ─── Simple Line Chart (SVG) ─────────────────────────────────────────────
const SimpleLineChart: React.FC<{
  data: { label: string; value: number }[];
  height?: number; color?: string;
}> = ({ data, height = 180, color = PRIMARY }) => {
  if (!data.length) return <Typography sx={{ p: 3, color: TEXT_LIGHT, textAlign: 'center' }}>No data</Typography>;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const w = Math.max(data.length * 60, 300);
  const padX = 40;
  const padY = 20;

  const points = data.map((d, i) => ({
    x: padX + (i / Math.max(data.length - 1, 1)) * (w - 2 * padX),
    y: padY + (1 - d.value / maxVal) * (height - 2 * padY),
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaD = pathD + ` L${points[points.length - 1].x},${height - padY} L${points[0].x},${height - padY} Z`;

  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <svg width={w} height={height + 30} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#areaGrad)" />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="#fff" stroke={color} strokeWidth={2} />
            <title>{`${data[i].label}: ${formatCurrency(data[i].value)}`}</title>
            <text x={p.x} y={height + 14} textAnchor="middle" fontSize={9} fill={TEXT_LIGHT}>
              {data[i].label.slice(5)}
            </text>
          </g>
        ))}
      </svg>
    </Box>
  );
};

// ─── Simple Pie Chart (SVG) ──────────────────────────────────────────────
const SimplePieChart: React.FC<{
  data: { label: string; value: number; color: string }[];
  size?: number;
}> = ({ data, size = 180 }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <Typography sx={{ p: 3, color: TEXT_LIGHT, textAlign: 'center' }}>No data</Typography>;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  let cumAngle = -Math.PI / 2;

  const slices = data.map(d => {
    const angle = (d.value / total) * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(startAngle + angle);
    const y2 = cy + r * Math.sin(startAngle + angle);
    const largeArc = angle > Math.PI ? 1 : 0;
    return {
      ...d,
      path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`,
    };
  });

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
      <svg width={size} height={size}>
        {slices.map((s, i) => (
          <g key={i}>
            <path d={s.path} fill={s.color} opacity={0.85} stroke="#fff" strokeWidth={2} />
            <title>{`${s.label}: ${s.value}`}</title>
          </g>
        ))}
      </svg>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {data.map((d, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: d.color, flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.75rem', color: TEXT_MED }}>{d.label} ({d.value})</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// ─── Horizontal Bar Chart ────────────────────────────────────────────────
const HorizontalBarChart: React.FC<{
  data: { label: string; value: number }[];
  color?: string;
}> = ({ data, color = PRIMARY }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {data.map((d, i) => (
        <Box key={i}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.3 }}>
            <Typography sx={{ fontSize: '0.78rem', color: TEXT_DARK, fontWeight: 500 }}>{d.label}</Typography>
            <Typography sx={{ fontSize: '0.78rem', color: TEXT_MED, fontWeight: 600 }}>{formatCurrency(d.value)}</Typography>
          </Box>
          <Box sx={{ height: 8, bgcolor: 'var(--border-subtle)', borderRadius: 4, overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${(d.value / maxVal) * 100}%`, bgcolor: CHART_COLORS[i % CHART_COLORS.length], borderRadius: 4, transition: 'width .5s ease' }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
//  Analytics Page
// ═══════════════════════════════════════════════════════════════════════════
const AnalyticsPage: React.FC = () => {
  const [period, setPeriod] = useState<DatePeriod>('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<BusinessAnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  // Export state
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = { period };
      if (period === 'custom' && customFrom && customTo) {
        params.from = customFrom;
        params.to = customTo;
      }
      const result = await businessAnalyticsService.getDashboard(params);
      setData(result);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [period, customFrom, customTo]);

  const handleExportExcel = async () => {
    if (!exportFrom || !exportTo) {
      setExportMsg({ type: 'error', text: 'Please select both From and To dates' });
      return;
    }
    if (new Date(exportFrom) > new Date(exportTo)) {
      setExportMsg({ type: 'error', text: 'From date must be before To date' });
      return;
    }
    setExporting(true);
    setExportMsg(null);
    try {
      const blob = await businessAnalyticsService.exportExcel(exportFrom, exportTo);
      // Check if response is an error JSON (blob might be error)
      if (blob.type && blob.type.includes('application/json')) {
        const text = await blob.text();
        const err = JSON.parse(text);
        setExportMsg({ type: 'error', text: err.message || 'Export failed' });
        return;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Forge_Business_Report_${exportFrom}_${exportTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setExportMsg({ type: 'success', text: 'Report exported successfully' });
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Export failed';
      setExportMsg({ type: 'error', text: typeof msg === 'string' ? msg : 'No data available for selected date range' });
    } finally {
      setExporting(false);
    }
  };

  const kpis = data?.kpis;
  const monthLabel = (m: string) => {
    const d = new Date(m + '-01');
    return d.toLocaleString('default', { month: 'short', year: '2-digit' });
  };

  const pipelineData = useMemo(() => {
    if (!data?.orderPipeline) return [];
    return data.orderPipeline.map((p, i) => ({
      label: STATUS_LABELS[p.status] || p.status,
      value: p.count,
      color: STATUS_COLORS[p.status] || CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [data?.orderPipeline]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: BG, minHeight: '100vh' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: TEXT_DARK }}>Analytics Dashboard</Typography>
          <Typography sx={{ fontSize: '0.85rem', color: TEXT_LIGHT }}>Business insights and performance metrics</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Select
            value={period}
            onChange={e => setPeriod(e.target.value as DatePeriod)}
            size="small"
            sx={{ minWidth: 140, fontSize: '0.85rem', borderRadius: '8px', bgcolor: 'var(--bg-input)' }}
          >
            <MenuItem value="today">Today</MenuItem>
            <MenuItem value="this_week">This Week</MenuItem>
            <MenuItem value="this_month">This Month</MenuItem>
            <MenuItem value="this_year">This Year</MenuItem>
            <MenuItem value="all">All Time</MenuItem>
            <MenuItem value="custom">Custom Range</MenuItem>
          </Select>
          {period === 'custom' && (
            <>
              <TextField type="date" size="small" label="From" value={customFrom} onChange={e => setCustomFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 150, bgcolor: 'var(--bg-input)', borderRadius: '8px' }} />
              <TextField type="date" size="small" label="To" value={customTo} onChange={e => setCustomTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 150, bgcolor: 'var(--bg-input)', borderRadius: '8px' }} />
            </>
          )}
          <Tooltip title="Refresh"><IconButton onClick={fetchData} size="small"><RefreshIcon /></IconButton></Tooltip>
        </Box>
      </Box>

      {/* ─── Export to Excel Section ───────────────────────────────── */}
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, flexWrap: 'wrap',
        p: 2, bgcolor: CARD_BG, borderRadius: '12px', border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW,
      }}>
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: TEXT_MED, mr: 0.5 }}>Export Report:</Typography>
        <TextField
          type="date" size="small" label="From" value={exportFrom}
          onChange={e => setExportFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 155, bgcolor: 'var(--bg-input)', borderRadius: '8px', '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.85rem' } }}
        />
        <TextField
          type="date" size="small" label="To" value={exportTo}
          onChange={e => setExportTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 155, bgcolor: 'var(--bg-input)', borderRadius: '8px', '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.85rem' } }}
        />
        <Button
          variant="contained"
          startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon sx={{ fontSize: 18 }} />}
          onClick={handleExportExcel}
          disabled={exporting}
          sx={{
            bgcolor: PRIMARY, '&:hover': { bgcolor: '#16614e' }, textTransform: 'none',
            fontWeight: 600, fontSize: '0.85rem', borderRadius: '8px', px: 2.5, boxShadow: 'none',
          }}
        >
          {exporting ? 'Exporting...' : 'Export to Excel'}
        </Button>
      </Box>

      {/* Export notification */}
      <Snackbar
        open={!!exportMsg} autoHideDuration={5000}
        onClose={() => setExportMsg(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setExportMsg(null)} severity={exportMsg?.type || 'info'} sx={{ width: '100%' }}>
          {exportMsg?.text}
        </Alert>
      </Snackbar>

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { title: 'Total Revenue', value: kpis ? formatCurrency(kpis.totalRevenue) : '—', icon: <MoneyIcon />, color: '#1F7A63', bg: PRIMARY_LIGHT },
          { title: 'Total Production Cost', value: kpis ? formatCurrency(kpis.totalCost) : '—', icon: <EngineeringIcon />, color: '#DC2626', bg: '#FEE2E2' },
          { title: 'Total Profit', value: kpis ? formatCurrency(kpis.totalProfit) : '—', icon: <TrendingUpIcon />, color: '#166354', bg: '#DBEAFE' },
          { title: 'Avg Profit Margin', value: kpis ? `${kpis.avgMargin.toFixed(1)}%` : '—', icon: <PieChartIcon />, color: '#166354', bg: '#E8F7F2' },
          { title: 'Orders In Progress', value: kpis ? String(kpis.inProduction) : '—', icon: <EngineeringIcon />, color: '#D97706', bg: '#FEF3C7' },
          { title: 'Orders Delivered', value: kpis ? String(kpis.deliveredOrders) : '—', icon: <ShippingIcon />, color: '#059669', bg: '#D1FAE5' },
        ].map((card, i) => (
          <Grid item xs={6} md={4} lg={2} key={i}>
            {loading ? <Skeleton variant="rounded" height={120} sx={{ borderRadius: '14px' }} /> : (
              <KPICard title={card.title} value={card.value} icon={card.icon} color={card.color} bgColor={card.bg} />
            )}
          </Grid>
        ))}
      </Grid>

      {/* Charts Row 1 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Revenue Trend */}
        <Grid item xs={12} md={8}>
          <Card sx={{ p: 2.5, borderRadius: '14px', border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW, height: '100%' }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: TEXT_DARK, mb: 2 }}>Revenue Trend</Typography>
            {loading ? <Skeleton variant="rounded" height={200} /> : (
              <SimpleLineChart
                data={(data?.revenueTrend || []).map(d => ({ label: d.month, value: d.revenue }))}
              />
            )}
          </Card>
        </Grid>

        {/* Order Pipeline */}
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2.5, borderRadius: '14px', border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW, height: '100%' }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: TEXT_DARK, mb: 2 }}>Order Pipeline</Typography>
            {loading ? <Skeleton variant="circular" width={180} height={180} sx={{ mx: 'auto' }} /> : (
              <SimplePieChart data={pipelineData} />
            )}
          </Card>
        </Grid>
      </Grid>

      {/* Charts Row 2 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Profit vs Cost */}
        <Grid item xs={12} md={7}>
          <Card sx={{ p: 2.5, borderRadius: '14px', border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: TEXT_DARK }}>Profit vs Cost</Typography>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                {[{ label: 'Revenue', color: '#1F7A63' }, { label: 'Cost', color: '#EF4444' }, { label: 'Profit', color: '#3B82F6' }].map(l => (
                  <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: l.color }} />
                    <Typography sx={{ fontSize: '0.7rem', color: TEXT_LIGHT }}>{l.label}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
            {loading ? <Skeleton variant="rounded" height={220} /> : (
              <SimpleBarChart
                data={(data?.profitVsCost || []).map(d => ({
                  label: d.month.slice(5),
                  values: [
                    { value: d.revenue, color: '#1F7A63', label: 'Revenue' },
                    { value: d.cost, color: '#EF4444', label: 'Cost' },
                    { value: d.profit, color: '#3B82F6', label: 'Profit' },
                  ],
                }))}
              />
            )}
          </Card>
        </Grid>

        {/* Top Customers */}
        <Grid item xs={12} md={5}>
          <Card sx={{ p: 2.5, borderRadius: '14px', border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW }}>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: TEXT_DARK, mb: 2 }}>Top Customers by Revenue</Typography>
            {loading ? <Skeleton variant="rounded" height={220} /> : (
              <HorizontalBarChart
                data={(data?.topCustomers || []).map(d => ({ label: d.customer, value: d.revenue }))}
              />
            )}
          </Card>
        </Grid>
      </Grid>

      {/* Recent Orders Table */}
      <Card sx={{ borderRadius: '14px', border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: TEXT_DARK }}>Recent Orders</Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'var(--bg-canvas)' }}>
                {['Project', 'Customer', 'Revenue', 'Profit', 'Status'].map(h => (
                  <TableCell key={h} sx={{ fontSize: '0.7rem', fontWeight: 600, color: TEXT_LIGHT, textTransform: 'uppercase', letterSpacing: '.05em', borderColor: BORDER, py: 1.2 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (data?.recentOrders || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, color: TEXT_LIGHT }}>No orders found</TableCell>
                </TableRow>
              ) : (
                (data?.recentOrders || []).map(order => (
                  <TableRow key={order.id} sx={{ '&:hover': { bgcolor: 'var(--bg-surface-2)' } }}>
                    <TableCell sx={{ fontSize: '0.82rem', fontWeight: 500, color: TEXT_DARK, borderColor: BORDER }}>{order.project_name}</TableCell>
                    <TableCell sx={{ fontSize: '0.82rem', color: TEXT_MED, borderColor: BORDER }}>{order.customer}</TableCell>
                    <TableCell sx={{ fontSize: '0.82rem', fontWeight: 500, color: TEXT_DARK, borderColor: BORDER }}>{formatCurrency(order.revenue)}</TableCell>
                    <TableCell sx={{ fontSize: '0.82rem', fontWeight: 500, color: (order.profit || 0) >= 0 ? '#1F7A63' : '#DC2626', borderColor: BORDER }}>{order.cost_data_pending ? 'Pending' : formatCurrency(order.profit || 0)}</TableCell>
                    <TableCell sx={{ borderColor: BORDER }}>
                      <Chip
                        label={STATUS_LABELS[order.status] || order.status}
                        size="small"
                        sx={{
                          fontSize: '0.7rem', fontWeight: 600, height: 24,
                          bgcolor: alpha(STATUS_COLORS[order.status] || '#94A3B8', 0.1),
                          color: STATUS_COLORS[order.status] || TEXT_MED,
                          border: `1px solid ${alpha(STATUS_COLORS[order.status] || '#94A3B8', 0.3)}`,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
};

export default AnalyticsPage;
