import React, { useState } from 'react';
import {
  Box, Typography, Card, Chip, Button, TextField, InputAdornment, Select, MenuItem,
  alpha, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Divider, Snackbar, Alert,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Close as CloseIcon,
  TrendingUp as TrendingUpIcon, Warning as WarningIcon,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, Legend } from 'recharts';
import dayjs from 'dayjs';

const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

const PLANS = [
  { name: 'Starter', color: T.t3, price: '₹5,000/mo', features: '5 Users, 2GB Storage, Basic Support' },
  { name: 'Professional', color: T.blue, price: '₹15,000/mo', features: '25 Users, 10GB Storage, Priority Support' },
  { name: 'Enterprise', color: T.purple, price: '₹45,000/mo', features: 'Unlimited Users, 50GB, Dedicated Support' },
  { name: 'Custom', color: T.teal, price: 'Contact Sales', features: 'Custom Limits, SLA, White-label' },
];

const STATUS_COLORS: Record<string, string> = {
  Active: T.green, Expiring: T.amber, Expired: T.red, Trial: T.blue,
};

const MOCK_SUBS = [
  { id: 'SUB-001', company: 'Tata Steel Ltd', plan: 'Enterprise', status: 'Active', startDate: '2025-04-01', endDate: '2026-03-31', amount: '₹5,40,000', autoRenew: true, users: 48 },
  { id: 'SUB-002', company: 'Reliance Industries', plan: 'Enterprise', status: 'Active', startDate: '2025-06-01', endDate: '2026-05-31', amount: '₹5,40,000', autoRenew: true, users: 35 },
  { id: 'SUB-003', company: 'Mahindra & Mahindra', plan: 'Professional', status: 'Expiring', startDate: '2025-03-15', endDate: '2026-03-20', amount: '₹1,80,000', autoRenew: false, users: 22 },
  { id: 'SUB-004', company: 'Bajaj Auto', plan: 'Professional', status: 'Active', startDate: '2025-09-01', endDate: '2026-08-31', amount: '₹1,80,000', autoRenew: true, users: 18 },
  { id: 'SUB-005', company: 'Godrej Industries', plan: 'Starter', status: 'Active', startDate: '2025-11-01', endDate: '2026-10-31', amount: '₹60,000', autoRenew: true, users: 5 },
  { id: 'SUB-006', company: 'Bharat Forge', plan: 'Professional', status: 'Expired', startDate: '2025-01-01', endDate: '2026-01-01', amount: '₹1,80,000', autoRenew: false, users: 15 },
  { id: 'SUB-007', company: 'Larsen & Toubro', plan: 'Enterprise', status: 'Active', startDate: '2025-07-01', endDate: '2026-06-30', amount: '₹5,40,000', autoRenew: true, users: 40 },
  { id: 'SUB-008', company: 'Sundaram Fasteners', plan: 'Starter', status: 'Trial', startDate: '2026-03-01', endDate: '2026-03-31', amount: '₹0', autoRenew: false, users: 3 },
  { id: 'SUB-009', company: 'Ashok Leyland', plan: 'Professional', status: 'Expiring', startDate: '2025-03-25', endDate: '2026-03-25', amount: '₹1,80,000', autoRenew: false, users: 20 },
  { id: 'SUB-010', company: 'Hero MotoCorp', plan: 'Enterprise', status: 'Active', startDate: '2025-08-15', endDate: '2026-08-14', amount: '₹5,40,000', autoRenew: true, users: 55 },
];

const PIE_DATA = [
  { name: 'Enterprise', value: 4, color: T.purple },
  { name: 'Professional', value: 4, color: T.blue },
  { name: 'Starter', value: 2, color: T.t3 },
];

const CDPLSubscriptionsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [changeOpen, setChangeOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState<typeof MOCK_SUBS[0] | null>(null);
  const [newPlan, setNewPlan] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const filtered = MOCK_SUBS.filter((s) => {
    if (search && !s.company.toLowerCase().includes(search.toLowerCase())) return false;
    if (planFilter !== 'All' && s.plan !== planFilter) return false;
    if (statusFilter !== 'All' && s.status !== statusFilter) return false;
    return true;
  });

  const totalMRR = '₹28,40,000';
  const activeCount = MOCK_SUBS.filter((s) => s.status === 'Active').length;
  const expiringCount = MOCK_SUBS.filter((s) => s.status === 'Expiring').length;

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>System / Subscriptions</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>Subscriptions</Typography>
        </Box>
        <Typography sx={{ fontSize: 12, color: T.t3 }}>Last updated: {dayjs().format('MMM D, YYYY h:mm A')}</Typography>
      </Box>

      {/* Summary + Chart */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 2.5, mb: 3 }}>
        {/* Summary Cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          {[
            { label: 'Total MRR', value: totalMRR, icon: TrendingUpIcon, color: T.teal },
            { label: 'Active Subscriptions', value: activeCount, icon: TrendingUpIcon, color: T.green },
            { label: 'Expiring Soon', value: expiringCount, icon: WarningIcon, color: T.amber },
            { label: 'Total Companies', value: MOCK_SUBS.length, icon: TrendingUpIcon, color: T.blue },
          ].map((c) => (
            <Card key={c.label} sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '8px', bgcolor: alpha(c.color, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <c.icon sx={{ fontSize: 16, color: c.color }} />
                </Box>
                <Typography sx={{ fontSize: 11, color: T.t3 }}>{c.label}</Typography>
              </Box>
              <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.t1 }}>{c.value}</Typography>
            </Card>
          ))}
        </Box>

        {/* Donut Chart */}
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.t1, mb: 1 }}>Plan Distribution</Typography>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={PIE_DATA} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3} stroke="none">
                {PIE_DATA.map((p) => <Cell key={p.name} fill={p.color} />)}
              </Pie>
              <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </Box>

      {/* Plan Comparison Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        {PLANS.map((p) => (
          <Card key={p.name} sx={{ p: 2, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: 'none', '&:hover': { borderColor: p.color } }}>
            <Chip label={p.name} size="small" sx={{ fontSize: 10, bgcolor: alpha(p.color, 0.1), color: p.color, fontWeight: 600, mb: 1 }} />
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: T.t1, mb: 0.5 }}>{p.price}</Typography>
            <Typography sx={{ fontSize: 11, color: T.t3, lineHeight: 1.5 }}>{p.features}</Typography>
          </Card>
        ))}
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
        <TextField size="small" placeholder="Search company..." value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: T.t3 }} /></InputAdornment> }}
          sx={{ minWidth: 240, '& input': { fontSize: 13 }, bgcolor: T.surface }} />
        <Select size="small" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} sx={{ minWidth: 140, fontSize: 13, bgcolor: T.surface }}>
          <MenuItem value="All" sx={{ fontSize: 13 }}>All Plans</MenuItem>
          {PLANS.map((p) => <MenuItem key={p.name} value={p.name} sx={{ fontSize: 13 }}>{p.name}</MenuItem>)}
        </Select>
        <Select size="small" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 140, fontSize: 13, bgcolor: T.surface }}>
          <MenuItem value="All" sx={{ fontSize: 13 }}>All Status</MenuItem>
          {Object.keys(STATUS_COLORS).map((s) => <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>{s}</MenuItem>)}
        </Select>
      </Box>

      {/* Subscriptions Table */}
      <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'auto' }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <Box component="thead">
            <Box component="tr" sx={{ borderBottom: `1px solid ${T.border}` }}>
              {['Company', 'Plan', 'Status', 'Start', 'End', 'Amount', 'Auto-Renew', 'Users', 'Action'].map((h) => (
                <Box component="th" key={h} sx={{ px: 2, py: 1.5, textAlign: 'left', fontSize: 11, fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {filtered.map((sub) => (
              <Box component="tr" key={sub.id} sx={{
                borderBottom: `1px solid ${T.borderSubtle}`,
                bgcolor: sub.status === 'Expiring' ? alpha(T.amber, 0.03) : sub.status === 'Expired' ? alpha(T.red, 0.02) : 'transparent',
                '&:hover': { bgcolor: alpha(T.teal, 0.02) },
              }}>
                <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 13, fontWeight: 500, color: T.t1 }}>{sub.company}</Box>
                <Box component="td" sx={{ px: 2, py: 1.5 }}><Chip label={sub.plan} size="small" sx={{ fontSize: 10, height: 20, bgcolor: alpha(PLANS.find((p) => p.name === sub.plan)?.color || T.t3, 0.1), color: PLANS.find((p) => p.name === sub.plan)?.color || T.t3 }} /></Box>
                <Box component="td" sx={{ px: 2, py: 1.5 }}><Chip label={sub.status} size="small" sx={{ fontSize: 10, height: 20, bgcolor: alpha(STATUS_COLORS[sub.status], 0.1), color: STATUS_COLORS[sub.status] }} /></Box>
                <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: T.t2 }}>{dayjs(sub.startDate).format('MMM D, YY')}</Box>
                <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: T.t2 }}>{dayjs(sub.endDate).format('MMM D, YY')}</Box>
                <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, fontWeight: 600, color: T.t1 }}>{sub.amount}</Box>
                <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: sub.autoRenew ? T.green : T.t3 }}>{sub.autoRenew ? 'Yes' : 'No'}</Box>
                <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: T.t2 }}>{sub.users}</Box>
                <Box component="td" sx={{ px: 2, py: 1.5 }}>
                  <Button size="small" onClick={() => { setSelectedSub(sub); setNewPlan(sub.plan); setChangeOpen(true); }}
                    sx={{ textTransform: 'none', fontSize: 11, color: T.teal, fontWeight: 600 }}>
                    Change Plan
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Card>

      {/* Change Plan Dialog */}
      <Dialog open={changeOpen} onClose={() => setChangeOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Change Plan — {selectedSub?.company}</Typography>
          <IconButton onClick={() => setChangeOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 12, color: T.t3, mb: 2 }}>Current plan: <strong>{selectedSub?.plan}</strong></Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {PLANS.map((p) => (
              <Card key={p.name}
                onClick={() => setNewPlan(p.name)}
                sx={{
                  p: 2, cursor: 'pointer', borderRadius: '10px',
                  border: `2px solid ${newPlan === p.name ? p.color : T.border}`,
                  bgcolor: newPlan === p.name ? alpha(p.color, 0.04) : T.surface,
                  '&:hover': { borderColor: p.color },
                }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.t1 }}>{p.name}</Typography>
                    <Typography sx={{ fontSize: 11, color: T.t3 }}>{p.features}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: p.color }}>{p.price}</Typography>
                </Box>
              </Card>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setChangeOpen(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          <Button variant="contained" onClick={() => { setChangeOpen(false); setToast('Plan updated successfully'); }}
            sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
            Confirm Change
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ borderRadius: '8px' }}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
};

export default CDPLSubscriptionsPage;
