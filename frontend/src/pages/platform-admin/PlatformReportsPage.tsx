import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Card, Chip, Button, Select, MenuItem, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Tooltip, Menu, alpha, Divider, Dialog, DialogTitle,
  DialogContent, DialogActions, FormControlLabel, Checkbox, Radio,
  RadioGroup,
} from '@mui/material';
import {
  TrendingUp as TrendUpIcon, TrendingDown as TrendDownIcon,
  CalendarMonth as CalendarIcon, Download as DownloadIcon,
  FilterList as FilterIcon, Schedule as ScheduleIcon,
} from '@mui/icons-material';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import dayjs from 'dayjs';

// ─── Design Tokens ──────────────────────────────────────────────────
const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

// ─── Mock Data ──────────────────────────────────────────────────────
const KPI_DATA = [
  { label: 'Total Revenue', value: '₹48,25,600', change: 12.5, positive: true, icon: '₹', color: T.teal },
  { label: 'MRR', value: '₹8,04,267', change: 8.3, positive: true, icon: '↻', color: T.blue },
  { label: 'Active Users', value: '2,847', change: 15.2, positive: true, icon: '👥', color: T.purple },
  { label: 'Churn Rate', value: '3.2%', change: -0.8, positive: true, icon: '📉', color: T.green },
];

const REVENUE_TREND = [
  { month: 'Nov', revenue: 580000, target: 600000 },
  { month: 'Dec', revenue: 620000, target: 620000 },
  { month: 'Jan', revenue: 710000, target: 650000 },
  { month: 'Feb', revenue: 685000, target: 700000 },
  { month: 'Mar', revenue: 760000, target: 750000 },
  { month: 'Apr', revenue: 825600, target: 800000 },
];

const TOP_COMPANIES = [
  { name: 'Tata Steel Ltd', revenue: 1250000 },
  { name: 'Reliance Industries', revenue: 980000 },
  { name: 'Mahindra & Mahindra', revenue: 720000 },
  { name: 'Bajaj Auto', revenue: 580000 },
  { name: 'Godrej Industries', revenue: 445000 },
];

const PLAN_DISTRIBUTION = [
  { name: 'Enterprise', value: 35, color: T.teal },
  { name: 'Pro', value: 28, color: T.blue },
  { name: 'Starter', value: 22, color: T.purple },
  { name: 'Free', value: 15, color: T.t3 },
];

const RECENT_TRANSACTIONS = [
  { id: 'TXN-001', company: 'Tata Steel Ltd', amount: '₹1,25,000', type: 'Subscription', date: '2026-04-10', status: 'Completed' },
  { id: 'TXN-002', company: 'Reliance Industries', amount: '₹98,000', type: 'Upgrade', date: '2026-04-09', status: 'Completed' },
  { id: 'TXN-003', company: 'Bajaj Auto', amount: '₹58,000', type: 'Renewal', date: '2026-04-08', status: 'Pending' },
  { id: 'TXN-004', company: 'Godrej Industries', amount: '₹44,500', type: 'Subscription', date: '2026-04-07', status: 'Completed' },
  { id: 'TXN-005', company: 'Bharat Forge', amount: '₹72,000', type: 'Upgrade', date: '2026-04-06', status: 'Failed' },
  { id: 'TXN-006', company: 'Ashok Leyland', amount: '₹35,000', type: 'Renewal', date: '2026-04-05', status: 'Completed' },
];

const COMPANIES_FILTER = ['All Companies', 'Tata Steel Ltd', 'Reliance Industries', 'Mahindra & Mahindra', 'Bajaj Auto', 'Godrej Industries'];

const PlatformReportsPage: React.FC = () => {
  const [dateRange, setDateRange] = useState('6m');
  const [companyFilter, setCompanyFilter] = useState('All Companies');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [reportFormat, setReportFormat] = useState('pdf');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleFreq, setScheduleFreq] = useState('weekly');

  const StatusChip: React.FC<{ status: string }> = ({ status }) => {
    const cfg: Record<string, { bg: string; color: string }> = {
      Completed: { bg: alpha(T.green, 0.1), color: T.green },
      Pending: { bg: alpha(T.amber, 0.1), color: T.amber },
      Failed: { bg: alpha(T.red, 0.1), color: T.red },
    };
    const c = cfg[status] || cfg.Pending;
    return (
      <Chip
        label={status}
        size="small"
        sx={{ bgcolor: c.bg, color: c.color, fontWeight: 600, fontSize: 12, height: 24 }}
      />
    );
  };

  return (
    <Box>
      {/* ── Page Header ── */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>Analytics / Reports</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>Reports</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 12, color: T.t3 }}>
            Last updated: {dayjs().format('MMM D, YYYY h:mm A')}
          </Typography>
          <Select
            size="small"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            sx={{ minWidth: 160, fontSize: 13, bgcolor: T.surface, '& .MuiSelect-select': { py: 0.8 } }}
          >
            {COMPANIES_FILTER.map((c) => (
              <MenuItem key={c} value={c} sx={{ fontSize: 13 }}>{c}</MenuItem>
            ))}
          </Select>
          <Select
            size="small"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            sx={{ minWidth: 120, fontSize: 13, bgcolor: T.surface, '& .MuiSelect-select': { py: 0.8 } }}
          >
            <MenuItem value="1m" sx={{ fontSize: 13 }}>Last Month</MenuItem>
            <MenuItem value="3m" sx={{ fontSize: 13 }}>Last 3 Months</MenuItem>
            <MenuItem value="6m" sx={{ fontSize: 13 }}>Last 6 Months</MenuItem>
            <MenuItem value="1y" sx={{ fontSize: 13 }}>Last Year</MenuItem>
          </Select>
          <Button
            variant="contained"
            startIcon={<DownloadIcon sx={{ fontSize: 18 }} />}
            onClick={() => setGenerateOpen(true)}
            sx={{
              bgcolor: T.teal, textTransform: 'none', fontWeight: 600, fontSize: 13,
              borderRadius: '8px', px: 2, '&:hover': { bgcolor: '#166354' },
            }}
          >
            Generate Report
          </Button>
        </Box>
      </Box>

      {/* ── KPI Cards ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        {KPI_DATA.map((kpi) => (
          <Card
            key={kpi.label}
            sx={{
              p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', position: 'relative', overflow: 'hidden',
            }}
          >
            <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: kpi.color }} />
            <Typography sx={{ fontSize: 12, color: T.t3, fontWeight: 500, mb: 1 }}>{kpi.label}</Typography>
            <Typography sx={{ fontSize: 26, fontWeight: 700, color: T.t1, mb: 0.5 }}>{kpi.value}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {kpi.positive ? (
                <TrendUpIcon sx={{ fontSize: 16, color: T.green }} />
              ) : (
                <TrendDownIcon sx={{ fontSize: 16, color: T.red }} />
              )}
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: kpi.positive ? T.green : T.red }}>
                {Math.abs(kpi.change)}%
              </Typography>
              <Typography sx={{ fontSize: 11, color: T.t3, ml: 0.5 }}>vs last period</Typography>
            </Box>
          </Card>
        ))}
      </Box>

      {/* ── Charts Row 1: Revenue Trend + Top Companies ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 2, mb: 3 }}>
        {/* Revenue Trend Line Chart */}
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: T.t1, mb: 2 }}>Revenue Trend</Typography>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={REVENUE_TREND}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.borderSubtle} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: T.t3 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: T.t3 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
              <RTooltip
                contentStyle={{ borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12 }}
                formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, '']}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke={T.teal} strokeWidth={2.5} dot={{ r: 4, fill: T.teal }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="target" name="Target" stroke={T.t3} strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Top Companies Horizontal Bar */}
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: T.t1, mb: 2 }}>Top 5 Companies by Revenue</Typography>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={TOP_COMPANIES} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.borderSubtle} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: T.t2 }} axisLine={false} tickLine={false} width={120} />
              <RTooltip
                contentStyle={{ borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12 }}
                formatter={(value: any) => [`₹${Number(value).toLocaleString()}`, 'Revenue']}
              />
              <Bar dataKey="revenue" fill={T.teal} radius={[0, 6, 6, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </Box>

      {/* ── Charts Row 2: Plan Distribution + Recent Transactions ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 2fr' }, gap: 2, mb: 3 }}>
        {/* Donut Chart */}
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: T.t1, mb: 2 }}>Users by Plan Tier</Typography>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={PLAN_DISTRIBUTION}
                cx="50%" cy="50%"
                innerRadius={60} outerRadius={90}
                dataKey="value"
                paddingAngle={3}
                stroke="none"
              >
                {PLAN_DISTRIBUTION.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <RTooltip
                contentStyle={{ borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12 }}
                formatter={(value: any, name: any) => [`${Number(value)}%`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center', mt: 1 }}>
            {PLAN_DISTRIBUTION.map((p) => (
              <Box key={p.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color }} />
                <Typography sx={{ fontSize: 11, color: T.t2 }}>{p.name} ({p.value}%)</Typography>
              </Box>
            ))}
          </Box>
        </Card>

        {/* Recent Transactions Table */}
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: T.t1 }}>Recent Transactions</Typography>
            <Button size="small" sx={{ textTransform: 'none', fontSize: 12, color: T.teal }}>View All</Button>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Transaction ID', 'Company', 'Amount', 'Type', 'Date', 'Status'].map((h) => (
                    <TableCell key={h} sx={{ fontSize: 11, fontWeight: 600, color: T.t3, borderColor: T.borderSubtle, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {RECENT_TRANSACTIONS.map((tx) => (
                  <TableRow key={tx.id} sx={{ '&:hover': { bgcolor: alpha(T.teal, 0.03) } }}>
                    <TableCell sx={{ fontSize: 13, fontWeight: 500, color: T.teal, fontFamily: 'monospace' }}>{tx.id}</TableCell>
                    <TableCell sx={{ fontSize: 13, color: T.t1 }}>{tx.company}</TableCell>
                    <TableCell sx={{ fontSize: 13, fontWeight: 600, color: T.t1 }}>{tx.amount}</TableCell>
                    <TableCell>
                      <Chip label={tx.type} size="small" sx={{ fontSize: 11, height: 22, bgcolor: alpha(T.blue, 0.08), color: T.blue }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: T.t3 }}>{dayjs(tx.date).format('MMM D, YYYY')}</TableCell>
                    <TableCell><StatusChip status={tx.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Box>

      {/* ── Generate Report Dialog ── */}
      <Dialog open={generateOpen} onClose={() => setGenerateOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 600, fontSize: 18 }}>Generate Report</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: T.t3, mb: 2 }}>Choose report format and delivery options.</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.t1, mb: 1 }}>Format</Typography>
          <RadioGroup row value={reportFormat} onChange={(e) => setReportFormat(e.target.value)} sx={{ mb: 2 }}>
            {['pdf', 'csv', 'excel'].map((f) => (
              <FormControlLabel
                key={f}
                value={f}
                control={<Radio size="small" sx={{ color: T.teal, '&.Mui-checked': { color: T.teal } }} />}
                label={<Typography sx={{ fontSize: 13, textTransform: 'uppercase' }}>{f}</Typography>}
              />
            ))}
          </RadioGroup>
          <Divider sx={{ my: 2 }} />
          <FormControlLabel
            control={
              <Checkbox
                checked={scheduleEnabled}
                onChange={(e) => setScheduleEnabled(e.target.checked)}
                size="small"
                sx={{ color: T.teal, '&.Mui-checked': { color: T.teal } }}
              />
            }
            label={<Typography sx={{ fontSize: 13 }}>Schedule recurring report</Typography>}
          />
          {scheduleEnabled && (
            <Box sx={{ ml: 4, mt: 1 }}>
              <Select
                size="small"
                value={scheduleFreq}
                onChange={(e) => setScheduleFreq(e.target.value)}
                sx={{ minWidth: 140, fontSize: 13 }}
              >
                <MenuItem value="daily" sx={{ fontSize: 13 }}>Daily</MenuItem>
                <MenuItem value="weekly" sx={{ fontSize: 13 }}>Weekly</MenuItem>
                <MenuItem value="monthly" sx={{ fontSize: 13 }}>Monthly</MenuItem>
              </Select>
              <TextField
                size="small"
                placeholder="Email address"
                sx={{ ml: 1, '& input': { fontSize: 13, py: 0.8 } }}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setGenerateOpen(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => setGenerateOpen(false)}
            sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}
          >
            Generate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PlatformReportsPage;
