import React, { useState, useEffect, useMemo } from 'react';
import {
  Box, Typography, Select, MenuItem, TextField, Chip, Skeleton,
  IconButton, Tooltip, alpha, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Refresh as RefreshIcon,
  Receipt as ReceiptIcon,
} from '@mui/icons-material';
import { businessAnalyticsService, DatePeriod } from '../services/businessAnalyticsService';
import { BusinessAnalyticsDashboard as DashboardData } from '../types';
import invoiceService, { AnalyticsMetrics } from '../services/invoiceService';

/* ─── Design Tokens ─────────────────────────────────────────────────── */
const T = {
  bg: 'var(--bg-surface-2)', card: '#FFFFFF', border: '#ECEEF1',
  t1: '#111827', t2: '#4B5563', t3: '#9CA3AF',
  emerald: '#059669', blue: '#166354', red: '#DC2626',
  violet: '#166354', amber: '#D97706', cyan: '#0891B2',
  shadow: '0 1px 2px rgba(0,0,0,.04)',
};
const PAL = ['#059669', '#166354', '#D97706', '#DC2626', '#166354', '#0891B2', '#EC4899', '#F97316'];
const STATUS_C: Record<string, string> = {
  draft: '#9CA3AF', estimated: '#3B82F6', quoted: '#2A9D7E',
  order_confirmed: '#059669', in_production: '#D97706',
  inspected: '#0891B2', shipped: '#10B981', closed: '#6B7280',
};
const STATUS_L: Record<string, string> = {
  draft: 'Draft', estimated: 'Estimated', quoted: 'Quoted',
  order_confirmed: 'Confirmed', in_production: 'Production',
  inspected: 'Inspected', shipped: 'Shipped', closed: 'Closed',
};
const fmt = (v: number) => `₹${v.toLocaleString('en-IN')}`;
const fmtK = (v: number) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` : fmt(v);

/* ─── Card Shell ────────────────────────────────────────────────────── */
const Card: React.FC<{ children: React.ReactNode; sx?: object }> = ({ children, sx }) => (
  <Box sx={{ bgcolor: T.card, borderRadius: '8px', border: `1px solid ${T.border}`, boxShadow: T.shadow, ...sx }}>{children}</Box>
);
const CardHead: React.FC<{ title: string; sub?: React.ReactNode }> = ({ title, sub }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, pt: 1.2, pb: 0.6 }}>
    <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, color: T.t1, letterSpacing: '-0.01em' }}>{title}</Typography>
    {sub}
  </Box>
);

/* ─── KPI Tile (inline) ─────────────────────────────────────────────── */
const KPI: React.FC<{ label: string; value: string; accent: string; sub?: string }> = ({ label, value, accent, sub }) => (
  <Box sx={{ flex: 1, minWidth: 0, px: 1.5, py: 1.2, borderRight: `1px solid ${T.border}`, '&:last-child': { borderRight: 'none' } }}>
    <Typography sx={{ fontSize: '0.64rem', fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '.05em', mb: 0.3 }}>{label}</Typography>
    <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: accent, lineHeight: 1.2 }}>{value}</Typography>
    {sub && <Typography sx={{ fontSize: '0.64rem', color: T.t3, mt: 0.2 }}>{sub}</Typography>}
  </Box>
);

/* ─── Sparkline Area ────────────────────────────────────────────────── */
const Spark: React.FC<{ data: { label: string; value: number }[]; color?: string; h?: number }> = ({ data, color = T.emerald, h = 80 }) => {
  if (!data.length) return <Typography sx={{ color: T.t3, textAlign: 'center', fontSize: '0.72rem', py: 2 }}>No data</Typography>;
  const max = Math.max(...data.map(d => d.value), 1);
  const vb = '0 0 100 50';
  const pts = data.map((d, i) => ({ x: (i / Math.max(data.length - 1, 1)) * 100, y: (1 - d.value / max) * 44 + 3 }));
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = line + ` L100,50 L0,50 Z`;
  const id = `sp_${color.replace('#', '')}`;
  return (
    <Box sx={{ px: 1.5, pb: 1 }}>
      <Box sx={{ height: h }}>
        <svg viewBox={vb} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.12} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
          <path d={area} fill={`url(#${id})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={1.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.8} fill={T.card} stroke={color} strokeWidth={0.8} vectorEffect="non-scaling-stroke"><title>{data[i].label}: {fmt(data[i].value)}</title></circle>)}
        </svg>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.3 }}>
        {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 4)) === 0 || i === data.length - 1).map((d, i) => (
          <Typography key={i} sx={{ fontSize: '0.58rem', color: T.t3 }}>{d.label.slice(5)}</Typography>
        ))}
      </Box>
    </Box>
  );
};

/* ─── Donut ──────────────────────────────────────────────────────────── */
const Donut: React.FC<{ data: { label: string; value: number; color: string }[] }> = ({ data }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Typography sx={{ color: T.t3, textAlign: 'center', fontSize: '0.72rem', py: 2 }}>No data</Typography>;
  const cx = 50, cy = 50, r = 36, sw = 9;
  let cum = -90;
  const arcs = data.map(d => { const pct = d.value / total; const s = cum; cum += pct * 360; return { ...d, pct, s, e: cum }; });
  const pol = (deg: number) => ({ x: cx + r * Math.cos((deg - 90) * Math.PI / 180), y: cy + r * Math.sin((deg - 90) * Math.PI / 180) });
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, pb: 1 }}>
      <svg width={90} height={90} viewBox="0 0 100 100">
        {arcs.map((a, i) => {
          const s = pol(a.s), e = pol(a.e);
          return <path key={i} d={`M${s.x},${s.y} A${r},${r} 0 ${a.pct > .5 ? 1 : 0} 1 ${e.x},${e.y}`}
            fill="none" stroke={a.color} strokeWidth={sw} strokeLinecap="round" opacity={0.9}><title>{a.label}: {a.value}</title></path>;
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={13} fontWeight={700} fill={T.t1}>{total}</text>
      </svg>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3, minWidth: 0, flex: 1 }}>
        {data.slice(0, 6).map((d, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: d.color, flexShrink: 0 }} />
            <Typography noWrap sx={{ fontSize: '0.64rem', color: T.t2, flex: 1, minWidth: 0 }}>{d.label}</Typography>
            <Typography sx={{ fontSize: '0.64rem', fontWeight: 600, color: T.t1 }}>{d.value}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

/* ─── Stacked Bar Chart ─────────────────────────────────────────────── */
const StackedBars: React.FC<{ data: { label: string; revenue: number; cost: number; profit: number }[] }> = ({ data }) => {
  if (!data.length) return <Typography sx={{ color: T.t3, textAlign: 'center', fontSize: '0.72rem', py: 2 }}>No data</Typography>;
  const max = Math.max(...data.map(d => d.revenue), 1);
  const bw = 100 / (data.length * 2);
  const h = 50;
  return (
    <Box sx={{ px: 1.5, pb: 1 }}>
      <Box sx={{ height: 80 }}>
        <svg viewBox={`0 0 100 ${h + 10}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
          {data.map((d, i) => {
            const x = (i / data.length) * 100 + bw * 0.5;
            const rH = (d.revenue / max) * h;
            const cH = (d.cost / max) * h;
            return (
              <g key={i}>
                <rect x={x} y={h - rH} width={bw} height={rH} rx={1.5} fill={T.emerald} opacity={0.18}><title>Revenue: {fmt(d.revenue)}</title></rect>
                <rect x={x} y={h - cH} width={bw} height={cH} rx={1.5} fill={T.red} opacity={0.55}><title>Cost: {fmt(d.cost)}</title></rect>
                {d.profit > 0 && <rect x={x} y={h - (d.profit / max) * h} width={bw} height={(d.profit / max) * h} rx={1.5} fill={T.emerald} opacity={0.7}><title>Profit: {fmt(d.profit)}</title></rect>}
              </g>
            );
          })}
          {/* baseline */}
          <line x1="0" y1={h} x2="100" y2={h} stroke={T.border} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
        </svg>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.2 }}>
        {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 5)) === 0 || i === data.length - 1).map((d, i) => (
          <Typography key={i} sx={{ fontSize: '0.56rem', color: T.t3 }}>{d.label.slice(5)}</Typography>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5 }}>
        {[{ l: 'Revenue', c: T.emerald, o: 0.18 }, { l: 'Cost', c: T.red, o: 0.55 }, { l: 'Profit', c: T.emerald, o: 0.7 }].map(x => (
          <Box key={x.l} sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: 0.5, bgcolor: x.c, opacity: x.o }} />
            <Typography sx={{ fontSize: '0.6rem', color: T.t3 }}>{x.l}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

/* ─── Horizontal Bars (Top customers) ───────────────────────────────── */
const HBars: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8, px: 1.5, pb: 1 }}>
      {data.slice(0, 5).map((d, i) => (
        <Box key={i}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.2 }}>
            <Typography noWrap sx={{ fontSize: '0.68rem', color: T.t1, fontWeight: 500 }}>{d.label}</Typography>
            <Typography sx={{ fontSize: '0.66rem', color: T.t2, fontWeight: 600, flexShrink: 0, ml: 1 }}>{fmtK(d.value)}</Typography>
          </Box>
          <Box sx={{ height: 4, bgcolor: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${(d.value / max) * 100}%`, bgcolor: PAL[i % PAL.length], borderRadius: 2, opacity: 0.75 }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
};

/* ═══════════════════════════════════════════════════════════════════════
     ANALYTICS DASHBOARD
   ═══════════════════════════════════════════════════════════════════════ */
const AnalyticsDashboard: React.FC = () => {
  const [period, setPeriod] = useState<DatePeriod>('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [invMetrics, setInvMetrics] = useState<AnalyticsMetrics | null>(null);
  const [invLoading, setInvLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = { period };
      if (period === 'custom' && customFrom && customTo) { params.from = customFrom; params.to = customTo; }
      const result = await businessAnalyticsService.getDashboard(params);
      setData(result);
    } catch (err) { console.error('Failed to load analytics:', err); }
    finally { setLoading(false); }
  };

  const fetchInvoiceMetrics = async () => {
    setInvLoading(true);
    try {
      const result = await invoiceService.getAnalytics();
      setInvMetrics(result);
    } catch (err) { console.error('Failed to load invoice metrics:', err); }
    finally { setInvLoading(false); }
  };

  useEffect(() => { fetchData(); fetchInvoiceMetrics(); }, [period, customFrom, customTo]);

  const kpis = data?.kpis;
  const pipelineData = useMemo(() => {
    if (!data?.orderPipeline) return [];
    return data.orderPipeline.map((p, i) => ({
      label: STATUS_L[p.status] || p.status, value: p.count,
      color: STATUS_C[p.status] || PAL[i % PAL.length],
    }));
  }, [data?.orderPipeline]);

  const sk = (h: number) => <Skeleton variant="rounded" height={h} sx={{ borderRadius: '6px', mx: 1.5, mb: 1 }} />;

  return (
    <Box sx={{ p: { xs: 1.5, md: 2 }, bgcolor: T.bg, minHeight: '100vh' }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 0.8 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: T.t1 }}>Analytics</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
          <Select value={period} onChange={e => setPeriod(e.target.value as DatePeriod)} size="small"
            sx={{ minWidth: 110, fontSize: '0.75rem', borderRadius: '6px', bgcolor: 'var(--bg-input)',
              '& .MuiSelect-select': { py: 0.6, px: 1.2 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border } }}>
            <MenuItem value="today">Today</MenuItem>
            <MenuItem value="this_week">This Week</MenuItem>
            <MenuItem value="this_month">This Month</MenuItem>
            <MenuItem value="this_year">This Year</MenuItem>
            <MenuItem value="all">All Time</MenuItem>
            <MenuItem value="custom">Custom</MenuItem>
          </Select>
          {period === 'custom' && (
            <>
              <TextField type="date" size="small" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                sx={{ width: 120, bgcolor: 'var(--bg-input)', borderRadius: '6px', '& input': { py: 0.6, fontSize: '0.75rem' } }} />
              <TextField type="date" size="small" value={customTo} onChange={e => setCustomTo(e.target.value)}
                sx={{ width: 120, bgcolor: 'var(--bg-input)', borderRadius: '6px', '& input': { py: 0.6, fontSize: '0.75rem' } }} />
            </>
          )}
          <Tooltip title="Refresh">
            <IconButton onClick={fetchData} size="small"
              sx={{ bgcolor: 'var(--bg-input)', border: `1px solid ${T.border}`, borderRadius: '6px', width: 30, height: 30 }}>
              <RefreshIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── KPI Strip ─────────────────────────────────────────────────── */}
      <Card sx={{ display: 'flex', flexWrap: 'wrap', mb: 1.2 }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Box key={i} sx={{ flex: 1, minWidth: 110, px: 1.5, py: 1.2, borderRight: `1px solid ${T.border}`, '&:last-child': { borderRight: 'none' } }}>
              <Skeleton width={60} height={10} /><Skeleton width={80} height={22} sx={{ mt: 0.5 }} />
            </Box>
          ))
        ) : (
          <>
            <KPI label="Revenue" value={kpis ? fmtK(kpis.totalRevenue) : '—'} accent={T.emerald} />
            <KPI label="Cost" value={kpis ? fmtK(kpis.totalCost) : '—'} accent={T.red} />
            <KPI label="Profit" value={kpis ? fmtK(kpis.totalProfit) : '—'} accent={T.blue} />
            <KPI label="Margin" value={kpis ? `${kpis.avgMargin.toFixed(1)}%` : '—'} accent={T.violet} />
            <KPI label="In Progress" value={kpis ? String(kpis.inProduction) : '—'} accent={T.amber} />
            <KPI label="Delivered" value={kpis ? String(kpis.deliveredOrders) : '—'} accent={T.emerald} />
          </>
        )}
      </Card>

      {/* ── Row 1: Revenue Trend · Profit vs Cost · Pipeline ──────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr 0.8fr' }, gap: 1.2, mb: 1.2 }}>
        <Card>
          <CardHead title="Revenue Trend" />
          {loading ? sk(80) : <Spark data={(data?.revenueTrend || []).map(d => ({ label: d.month, value: d.revenue }))} />}
        </Card>
        <Card>
          <CardHead title="Profit vs Cost" />
          {loading ? sk(80) : <StackedBars data={(data?.profitVsCost || []).map(d => ({ label: d.month, revenue: d.revenue, cost: d.cost, profit: d.profit }))} />}
        </Card>
        <Card>
          <CardHead title="Pipeline" />
          {loading ? sk(80) : <Donut data={pipelineData} />}
        </Card>
      </Box>

      {/* ── Row 2: Top Customers · Recent Orders ──────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' }, gap: 1.2 }}>
        <Card>
          <CardHead title="Top Customers" />
          {loading ? sk(80) : <HBars data={(data?.topCustomers || []).map(d => ({ label: d.customer, value: d.revenue }))} />}
        </Card>
        <Card sx={{ overflow: 'hidden' }}>
          <CardHead title="Recent Orders" />
          <TableContainer sx={{ maxHeight: 180 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {['Project', 'Customer', 'Revenue', 'Profit', 'Status'].map(h => (
                    <TableCell key={h} sx={{ fontSize: '0.62rem', fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '.04em', py: 0.6, px: 1.2, bgcolor: 'var(--bg-canvas)', borderColor: T.border }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j} sx={{ py: 0.5 }}><Skeleton height={14} /></TableCell>)}</TableRow>)
                ) : (data?.recentOrders || []).length === 0 ? (
                  <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', py: 2, color: T.t3, fontSize: '0.72rem' }}>No orders</TableCell></TableRow>
                ) : (
                  (data?.recentOrders || []).slice(0, 5).map(o => (
                    <TableRow key={o.id} sx={{ '&:hover': { bgcolor: 'var(--bg-surface-2)' } }}>
                      <TableCell sx={{ fontSize: '0.72rem', fontWeight: 500, color: T.t1, py: 0.5, px: 1.2, borderColor: T.border }}>{o.project_name}</TableCell>
                      <TableCell sx={{ fontSize: '0.72rem', color: T.t2, py: 0.5, px: 1.2, borderColor: T.border }}>{o.customer}</TableCell>
                      <TableCell sx={{ fontSize: '0.72rem', fontWeight: 500, color: T.t1, py: 0.5, px: 1.2, borderColor: T.border }}>{fmtK(o.revenue)}</TableCell>
                      <TableCell sx={{ fontSize: '0.72rem', fontWeight: 500, color: (o.profit || 0) >= 0 ? T.emerald : T.red, py: 0.5, px: 1.2, borderColor: T.border }}>{o.cost_data_pending ? 'Pending' : fmtK(o.profit || 0)}</TableCell>
                      <TableCell sx={{ py: 0.5, px: 1.2, borderColor: T.border }}>
                        <Chip label={STATUS_L[o.status] || o.status} size="small" sx={{
                          fontSize: '0.6rem', fontWeight: 600, height: 18, borderRadius: '4px',
                          bgcolor: alpha(STATUS_C[o.status] || '#9CA3AF', 0.08),
                          color: STATUS_C[o.status] || T.t2,
                        }} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Box>

      {/* ── Row 3: Invoice Analytics ── */}
      <Box sx={{ mt: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mb: 0.8 }}>
          <ReceiptIcon sx={{ fontSize: 16, color: T.t2 }} />
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: T.t1 }}>Invoice Analytics</Typography>
        </Box>

        {/* Invoice KPIs */}
        <Card sx={{ display: 'flex', flexWrap: 'wrap', mb: 1.2 }}>
          {invLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Box key={i} sx={{ flex: 1, minWidth: 110, px: 1.5, py: 1.2, borderRight: `1px solid ${T.border}`, '&:last-child': { borderRight: 'none' } }}>
                <Skeleton width={60} height={10} /><Skeleton width={80} height={22} sx={{ mt: 0.5 }} />
              </Box>
            ))
          ) : (
            <>
              <KPI label="Invoice Revenue" value={invMetrics ? fmtK(invMetrics.totalRevenue) : '—'} accent={T.emerald} />
              <KPI label="Mfg Cost" value={invMetrics ? fmtK(invMetrics.totalManufacturingCost) : '—'} accent={T.red}
                sub={invMetrics ? `Raw: ${fmtK(invMetrics.rawMaterialCost)} + Process: ${fmtK(invMetrics.processCost)}` : undefined} />
              <KPI label="Net Profit" value={invMetrics ? fmtK(invMetrics.totalProfit) : '—'}
                accent={invMetrics && invMetrics.totalProfit >= 0 ? T.emerald : T.red} />
              <KPI label="Margin" value={invMetrics ? `${invMetrics.profitMargin.toFixed(1)}%` : '—'} accent={T.violet} />
              <KPI label="Active Orders" value={invMetrics ? String(invMetrics.activeOrders) : '—'} accent={T.amber} />
            </>
          )}
        </Card>

        {/* Invoice Row: Revenue Trend · Top Invoice Customers · Material Usage */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 1.2 }}>
          <Card>
            <CardHead title="Invoice Revenue Trend" />
            {invLoading ? sk(80) : (
              <Spark
                data={(invMetrics?.revenueTrend || []).map(d => ({ label: d.month, value: d.revenue }))}
                color={T.blue}
              />
            )}
          </Card>
          <Card>
            <CardHead title="Top Invoice Customers" />
            {invLoading ? sk(80) : (
              <HBars data={(invMetrics?.topCustomers || []).map(d => ({ label: d.customer_name, value: d.total_revenue }))} />
            )}
          </Card>
          <Card sx={{ overflow: 'hidden' }}>
            <CardHead title="Material Usage" />
            {invLoading ? sk(80) : (invMetrics?.materialUsage || []).length === 0 ? (
              <Typography sx={{ color: T.t3, textAlign: 'center', fontSize: '0.72rem', py: 2 }}>No material data</Typography>
            ) : (
              <TableContainer sx={{ maxHeight: 160 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {['Material', 'Purchased', 'Used'].map(h => (
                        <TableCell key={h} sx={{ fontSize: '0.58rem', fontWeight: 600, color: T.t3, textTransform: 'uppercase', py: 0.4, px: 1, bgcolor: 'var(--bg-canvas)', borderColor: T.border }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(invMetrics?.materialUsage || []).slice(0, 8).map((m, i) => (
                      <TableRow key={i} sx={{ '&:hover': { bgcolor: 'var(--bg-surface-2)' } }}>
                        <TableCell sx={{ fontSize: '0.68rem', color: T.t1, py: 0.4, px: 1, borderColor: T.border, fontWeight: 500 }}>{m.material_name}</TableCell>
                        <TableCell sx={{ fontSize: '0.68rem', color: T.t2, py: 0.4, px: 1, borderColor: T.border }}>{m.total_purchased}</TableCell>
                        <TableCell sx={{ fontSize: '0.68rem', color: T.t2, py: 0.4, px: 1, borderColor: T.border }}>{m.total_used}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Card>
        </Box>
      </Box>
    </Box>
  );
};

export default AnalyticsDashboard;
