import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Select, MenuItem, TextField,
  Button, Table, TableHead, TableRow, TableCell, TableBody, Chip, Skeleton,
  alpha, InputLabel, FormControl, SelectChangeEvent, IconButton, Tooltip,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AttachMoney as MoneyIcon,
  AccountBalance as CostIcon,
  ShowChart as ProfitIcon,
  LocalShipping as ShippedIcon,
  Engineering as ProductionIcon,
  Refresh as RefreshIcon,
  Assessment as AssessmentIcon,
  BarChart as BarChartIcon,
} from '@mui/icons-material';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { businessAnalyticsService, DatePeriod } from '../services/businessAnalyticsService';
import {
  BusinessAnalyticsDashboard, AnalyticsKPIs, RevenueTrendPoint,
  ProfitVsCostPoint, OrderPipelinePoint, TopCustomerPoint, RecentOrder,
} from '../types';

/* ── Constants ─────────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  draft: '#94A3B8', estimated: '#3B82F6', quoted: '#2A9D7E',
  order_confirmed: '#2A9D7E', in_production: '#F59E0B', inspected: '#06B6D4',
  shipped: '#10B981', closed: '#6B7280',
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', estimated: 'Estimated', quoted: 'Quoted',
  order_confirmed: 'Order Confirmed', in_production: 'In Production',
  inspected: 'Inspected', shipped: 'Shipped', closed: 'Closed',
};
const PERIOD_OPTIONS: { value: DatePeriod; label: string }[] = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

const fmt = (v: number) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${v.toLocaleString('en-IN')}`;

/* ── Card wrapper ─────────────────────────────────────── */
const DashCard: React.FC<{ children: React.ReactNode; sx?: any }> = ({ children, sx }) => (
  <Card sx={{
    borderRadius: '16px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    height: '100%', transition: 'box-shadow 0.2s, transform 0.2s',
    '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.07)', transform: 'translateY(-1px)' },
    ...sx,
  }}>
    {children}
  </Card>
);

const CardTitle: React.FC<{ children: React.ReactNode; icon?: React.ReactElement<any> }> = ({ children, icon }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
    {icon && <Box sx={{ color: '#6B7280', '& .MuiSvgIcon-root': { fontSize: 18 } }}>{icon}</Box>}
    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{children}</Typography>
  </Box>
);

/* ── KPI Card ─────────────────────────────────────────── */
const KPICard: React.FC<{
  label: string; value: string; trend?: number; color: string; icon: React.ReactElement<any>; bgGradient?: string;
}> = ({ label, value, trend, color, icon, bgGradient }) => (
  <DashCard>
    <CardContent sx={{ py: 2.5, px: 2.5, '&:last-child': { pb: 2.5 }, position: 'relative', overflow: 'hidden' }}>
      {/* Decorative gradient circle */}
      <Box sx={{
        position: 'absolute', top: -20, right: -20, width: 80, height: 80,
        borderRadius: '50%', background: bgGradient || `radial-gradient(circle, ${alpha(color, 0.08)} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{
            fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase',
            letterSpacing: '.08em', mb: 0.75,
          }}>
            {label}
          </Typography>
          <Typography sx={{
            fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15,
            fontFamily: '"Inter", "SF Pro Display", system-ui, sans-serif',
          }}>
            {value}
          </Typography>
          {trend !== undefined && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, mt: 0.75 }}>
              {trend >= 0
                ? <TrendingUpIcon sx={{ fontSize: 14, color: '#2A9D7E' }} />
                : <TrendingDownIcon sx={{ fontSize: 14, color: '#EF4444' }} />
              }
              <Typography sx={{
                fontSize: '0.7rem', fontWeight: 700,
                color: trend >= 0 ? '#2A9D7E' : '#EF4444',
              }}>
                {trend >= 0 ? '+' : ''}{trend.toFixed(1)}%
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: 'var(--text-muted)', ml: 0.25 }}>vs last period</Typography>
            </Box>
          )}
        </Box>
        <Box sx={{
          width: 44, height: 44, borderRadius: '12px',
          background: `linear-gradient(135deg, ${alpha(color, 0.15)}, ${alpha(color, 0.05)})`,
          border: `1px solid ${alpha(color, 0.15)}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color, '& .MuiSvgIcon-root': { fontSize: 22 }, flexShrink: 0,
        }}>
          {icon}
        </Box>
      </Box>
    </CardContent>
  </DashCard>
);

/* ── Custom Tooltip for Recharts ─────────────────────── */
const ChartTooltipStyle = {
  fontSize: '0.75rem', borderRadius: 12, border: '1px solid var(--border)',
  boxShadow: 'none', padding: '10px 14px',
  backgroundColor: 'var(--bg-surface)',
};

/* ══════════════════════════════════════════════════════════ */
const BusinessAnalyticsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<DatePeriod>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<BusinessAnalyticsDashboard | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { period };
      if (period === 'custom' && customFrom && customTo) {
        params.from = customFrom;
        params.to = customTo;
      }
      const result = await businessAnalyticsService.getDashboard(params);
      setData(result);
    } catch (e) {
      console.error('Analytics fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePeriodChange = (e: SelectChangeEvent) => setPeriod(e.target.value as DatePeriod);

  /* ── Loading skeleton ── */
  if (loading && !data) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1360, mx: 'auto' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Skeleton variant="text" width={200} height={36} />
          <Skeleton variant="rounded" width={140} height={36} />
        </Box>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[1,2,3,4,5,6].map(i => (
            <Grid item xs={6} sm={4} md={2} key={i}>
              <Skeleton variant="rounded" height={120} sx={{ borderRadius: '16px' }} />
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={7}><Skeleton variant="rounded" height={300} sx={{ borderRadius: '16px' }} /></Grid>
          <Grid item xs={12} md={5}><Skeleton variant="rounded" height={300} sx={{ borderRadius: '16px' }} /></Grid>
        </Grid>
      </Box>
    );
  }

  const kpis = data?.kpis;
  const revenueTrend = data?.revenueTrend || [];
  const profitVsCost = data?.profitVsCost || [];
  const pipeline = data?.orderPipeline || [];
  const topCustomers = data?.topCustomers || [];
  const recentOrders = data?.recentOrders || [];

  /* ── Pipeline chart data ── */
  const pipelineChartData = pipeline.map(p => ({
    name: STATUS_LABELS[p.status] || p.status,
    value: p.count,
    color: STATUS_COLORS[p.status] || '#94A3B8',
  }));
  const pipelineTotal = pipelineChartData.reduce((s, d) => s + d.value, 0);

  /* ── Top Customers horizontal bar ── */
  const customerBarData = topCustomers.map(c => ({
    name: c.customer?.length > 18 ? c.customer.substring(0, 16) + '…' : c.customer,
    fullName: c.customer,
    revenue: c.revenue,
  }));

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1360, mx: 'auto', minHeight: '100vh' }}>

      {/* ═══════════ HEADER ═══════════ */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        mb: 3.5, flexWrap: 'wrap', gap: 1.5,
      }}>
        <Box>
          <Typography sx={{
            fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)',
            letterSpacing: '-0.025em', lineHeight: 1.2,
          }}>
            Business Analytics
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-muted)', mt: 0.3, fontWeight: 500 }}>
            Manufacturing performance insights & metrics
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{
            minWidth: 150,
            '& .MuiOutlinedInput-root': {
              borderRadius: '10px', fontSize: '0.82rem', backgroundColor: 'var(--bg-input)',
              '& fieldset': { borderColor: 'var(--border)' },
              '&:hover fieldset': { borderColor: 'var(--text-muted)' },
            },
          }}>
            <InputLabel sx={{ fontSize: '0.82rem' }}>Period</InputLabel>
            <Select value={period} label="Period" onChange={handlePeriodChange}>
              {PERIOD_OPTIONS.map(o => <MenuItem key={o.value} value={o.value} sx={{ fontSize: '0.82rem' }}>{o.label}</MenuItem>)}
            </Select>
          </FormControl>
          {period === 'custom' && (
            <>
              <TextField size="small" type="date" label="From" value={customFrom}
                onChange={e => setCustomFrom(e.target.value)} InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: '0.82rem' } }} />
              <TextField size="small" type="date" label="To" value={customTo}
                onChange={e => setCustomTo(e.target.value)} InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: '0.82rem' } }} />
            </>
          )}
          <Tooltip title="Refresh data" arrow>
            <IconButton onClick={fetchData} sx={{
              border: '1px solid var(--border)', borderRadius: '10px', width: 38, height: 38,
              color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface)',
              '&:hover': { backgroundColor: 'rgba(0,200,255,0.08)', color: '#00c8ff', borderColor: 'rgba(0,200,255,0.30)' },
              transition: 'all 0.15s',
            }}>
              <RefreshIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ═══════════ KPI CARDS ═══════════ */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={4} md={2}>
          <KPICard label="Total Revenue" value={fmt(kpis?.totalRevenue || 0)}
            color="#1F7A63" icon={<MoneyIcon />} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KPICard label="MFG Cost" value={fmt(kpis?.totalCost || 0)}
            color="#EF4444" icon={<CostIcon />} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KPICard label="Total Profit" value={fmt(kpis?.totalProfit || 0)}
            color="#3B82F6" icon={<ProfitIcon />} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KPICard label="Avg Margin" value={`${kpis?.avgMargin?.toFixed(1) || 0}%`}
            color="#2A9D7E" icon={<TrendingUpIcon />} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KPICard label="In Progress" value={String(kpis?.inProduction || 0)}
            color="#F59E0B" icon={<ProductionIcon />} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <KPICard label="Delivered" value={String(kpis?.deliveredOrders || 0)}
            color="#10B981" icon={<ShippedIcon />} />
        </Grid>
      </Grid>

      {/* ═══════════ CHARTS ROW 1 — Revenue Trend + Profit vs Cost ═══════════ */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Revenue Trend Line Chart */}
        <Grid item xs={12} md={7}>
          <DashCard>
            <CardContent sx={{ p: 2.5 }}>
              <CardTitle icon={<TrendingUpIcon />}>Revenue vs Cost vs Profit Trend</CardTitle>
              {revenueTrend.length === 0 ? (
                <Box sx={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No trend data available</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={revenueTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1F7A63" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#1F7A63" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 100000 ? `${(v/100000).toFixed(0)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                    <RechartsTooltip contentStyle={ChartTooltipStyle}
                      formatter={(value: any, name: any) => [fmt(value), name]}
                      labelStyle={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }} />
                    <Legend iconType="circle" iconSize={8}
                      wrapperStyle={{ fontSize: '0.72rem', paddingTop: 8 }} />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#1F7A63" strokeWidth={2.5}
                      dot={{ r: 3, fill: '#fff', stroke: '#1F7A63', strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: '#1F7A63', stroke: '#fff', strokeWidth: 2 }} />
                    <Line type="monotone" dataKey="cost" name="MFG Cost" stroke="#EF4444" strokeWidth={2}
                      dot={{ r: 3, fill: '#fff', stroke: '#EF4444', strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: '#EF4444', stroke: '#fff', strokeWidth: 2 }}
                      strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="profit" name="Profit" stroke="#3B82F6" strokeWidth={2}
                      dot={{ r: 3, fill: '#fff', stroke: '#3B82F6', strokeWidth: 2 }}
                      activeDot={{ r: 5, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </DashCard>
        </Grid>

        {/* Profit vs Cost Grouped Bar Chart */}
        <Grid item xs={12} md={5}>
          <DashCard>
            <CardContent sx={{ p: 2.5 }}>
              <CardTitle icon={<BarChartIcon />}>Profit vs Cost</CardTitle>
              {profitVsCost.length === 0 ? (
                <Box sx={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No data available</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={profitVsCost} margin={{ top: 5, right: 10, left: 10, bottom: 5 }} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 100000 ? `${(v/100000).toFixed(0)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                    <RechartsTooltip contentStyle={ChartTooltipStyle}
                      formatter={(value: any, name: any) => [fmt(value), name]}
                      labelStyle={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }} />
                    <Legend iconType="circle" iconSize={8}
                      wrapperStyle={{ fontSize: '0.72rem', paddingTop: 8 }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#1F7A63" radius={[4, 4, 0, 0]} barSize={14} />
                    <Bar dataKey="cost" name="MFG Cost" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={14} />
                    <Bar dataKey="profit" name="Profit" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </DashCard>
        </Grid>
      </Grid>

      {/* ═══════════ CHARTS ROW 2 — Pipeline + Top Customers ═══════════ */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Order Pipeline Donut */}
        <Grid item xs={12} md={4}>
          <DashCard>
            <CardContent sx={{ p: 2.5 }}>
              <CardTitle icon={<AssessmentIcon />}>Order Pipeline</CardTitle>
              {pipeline.length === 0 ? (
                <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No pipeline data</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Box sx={{ position: 'relative', width: 200, height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pipelineChartData} cx="50%" cy="50%"
                          innerRadius={58} outerRadius={88} paddingAngle={3}
                          dataKey="value" stroke="none">
                          {pipelineChartData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: any, name: any) => [`${value} orders`, name]}
                          contentStyle={ChartTooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <Box sx={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%, -50%)', textAlign: 'center',
                    }}>
                      <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                        {pipelineTotal}
                      </Typography>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', mt: 0.25, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                        Total
                      </Typography>
                    </Box>
                  </Box>
                  {/* Legend */}
                  <Box sx={{
                    display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
                    gap: '8px 16px', mt: 2, px: 1,
                  }}>
                    {pipelineChartData.map((d, i) => (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Box sx={{
                          width: 10, height: 10, borderRadius: '3px', bgcolor: d.color, flexShrink: 0,
                        }} />
                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {d.name}
                          <Typography component="span" sx={{ fontWeight: 700, color: 'var(--text-primary)', ml: 0.5, fontSize: '0.72rem' }}>
                            {d.value}
                          </Typography>
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </CardContent>
          </DashCard>
        </Grid>

        {/* Top Customers Horizontal Bar Chart */}
        <Grid item xs={12} md={8}>
          <DashCard>
            <CardContent sx={{ p: 2.5 }}>
              <CardTitle icon={<MoneyIcon />}>Top Customers by Revenue</CardTitle>
              {customerBarData.length === 0 ? (
                <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No customer data</Typography>
                </Box>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(customerBarData.length * 52, 200)}>
                  <BarChart data={customerBarData} layout="vertical"
                    margin={{ top: 0, right: 30, left: 10, bottom: 0 }} barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 100000 ? `${(v/100000).toFixed(0)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : `${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-secondary)', fontWeight: 500 }}
                      axisLine={false} tickLine={false} width={130} />
                    <RechartsTooltip contentStyle={ChartTooltipStyle}
                      formatter={(value: any) => [fmt(value), 'Revenue']}
                      labelFormatter={(label: any, payload: any) => payload?.[0]?.payload?.fullName || label}
                      labelStyle={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }} />
                    <Bar dataKey="revenue" fill="#1F7A63" radius={[0, 6, 6, 0]}
                      background={{ fill: 'var(--bg-canvas)', radius: 6 } as any} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </DashCard>
        </Grid>
      </Grid>

      {/* ═══════════ RECENT ORDERS TABLE ═══════════ */}
      <DashCard>
        <CardContent sx={{ p: 2.5 }}>
          <CardTitle>Recent Orders</CardTitle>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 750 }}>
              <TableHead>
                <TableRow>
                  {['Order', 'Customer', 'Revenue', 'MFG Cost', 'Profit', 'Status'].map((col, i) => (
                    <TableCell key={col}
                      align={i >= 2 && i <= 4 ? 'right' : 'left'}
                      sx={{
                        fontWeight: 700, fontSize: '0.7rem', color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '.06em',
                        borderBottom: '2px solid #F1F5F9', py: 1.5,
                      }}>
                      {col}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {recentOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Box sx={{ py: 5 }}>
                        <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                          No orders found for the selected period
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
                {recentOrders.map((o, idx) => (
                  <TableRow key={o.id} hover
                    sx={{
                      '&:hover': { backgroundColor: 'var(--bg-canvas)' },
                      '& td': { borderBottom: idx === recentOrders.length - 1 ? 'none' : '1px solid var(--border-subtle)' },
                    }}>
                    <TableCell sx={{ py: 1.75 }}>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {o.project_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.82rem', color: '#6B7280' }}>
                        {o.customer}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography sx={{
                        fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)',
                        fontFamily: '"JetBrains Mono", monospace',
                      }}>
                        {fmt(o.revenue)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {o.cost_data_pending ? (
                        <Chip label="Cost Data Pending" size="small" sx={{
                          fontSize: '0.65rem', fontWeight: 600, borderRadius: '6px', height: 22,
                          bgcolor: alpha('#F59E0B', 0.1), color: '#D97706',
                          border: `1px solid ${alpha('#F59E0B', 0.2)}`,
                        }} />
                      ) : (
                        <Typography sx={{
                          fontSize: '0.82rem', fontWeight: 600, color: '#EF4444',
                          fontFamily: '"JetBrains Mono", monospace',
                        }}>
                          {fmt(o.mfg_cost || 0)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {o.cost_data_pending ? (
                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>—</Typography>
                      ) : (
                        <Typography sx={{
                          fontSize: '0.82rem', fontWeight: 600,
                          color: (o.profit || 0) >= 0 ? '#1F7A63' : '#EF4444',
                          fontFamily: '"JetBrains Mono", monospace',
                        }}>
                          {fmt(o.profit || 0)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={STATUS_LABELS[o.status] || o.status}
                        size="small"
                        sx={{
                          fontSize: '0.68rem', fontWeight: 600, borderRadius: '8px',
                          bgcolor: alpha(STATUS_COLORS[o.status] || '#94A3B8', 0.1),
                          color: STATUS_COLORS[o.status] || '#6B7280',
                          border: `1px solid ${alpha(STATUS_COLORS[o.status] || '#94A3B8', 0.2)}`,
                          height: 26,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </DashCard>

    </Box>
  );
};

export default BusinessAnalyticsPage;
