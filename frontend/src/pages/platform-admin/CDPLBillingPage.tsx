import React, { useState } from 'react';
import {
  Box, Typography, Card, Chip, Button, TextField, InputAdornment, Select, MenuItem,
  alpha, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Divider,
} from '@mui/material';
import {
  Search as SearchIcon, Download as DownloadIcon, Close as CloseIcon,
  Receipt as ReceiptIcon, CheckCircle as PaidIcon, Schedule as PendingIcon,
  Warning as OverdueIcon, CreditCard as CardIcon, AccountBalance as BankIcon,
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';

const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

const REV_DATA = [
  { month: 'Oct', revenue: 2600000 }, { month: 'Nov', revenue: 2750000 },
  { month: 'Dec', revenue: 2400000 }, { month: 'Jan', revenue: 2900000 },
  { month: 'Feb', revenue: 2840000 }, { month: 'Mar', revenue: 3100000 },
];

const STATUS_MAP: Record<string, { icon: any; color: string }> = {
  Paid: { icon: PaidIcon, color: T.green },
  Pending: { icon: PendingIcon, color: T.amber },
  Overdue: { icon: OverdueIcon, color: T.red },
  Refunded: { icon: ReceiptIcon, color: T.purple },
};

const MOCK_INVOICES = [
  { id: 'INV-2026-101', company: 'Tata Steel Ltd', plan: 'Enterprise', amount: '₹45,000', status: 'Paid', date: '2026-03-01', dueDate: '2026-03-15', method: 'Credit Card' },
  { id: 'INV-2026-102', company: 'Reliance Industries', plan: 'Enterprise', amount: '₹45,000', status: 'Paid', date: '2026-03-01', dueDate: '2026-03-15', method: 'Bank Transfer' },
  { id: 'INV-2026-103', company: 'Mahindra & Mahindra', plan: 'Professional', amount: '₹15,000', status: 'Pending', date: '2026-03-01', dueDate: '2026-03-20', method: 'Credit Card' },
  { id: 'INV-2026-104', company: 'Bajaj Auto', plan: 'Professional', amount: '₹15,000', status: 'Overdue', date: '2026-02-01', dueDate: '2026-02-28', method: 'Bank Transfer' },
  { id: 'INV-2026-105', company: 'Godrej Industries', plan: 'Starter', amount: '₹5,000', status: 'Paid', date: '2026-03-01', dueDate: '2026-03-15', method: 'UPI' },
  { id: 'INV-2026-106', company: 'Bharat Forge', plan: 'Professional', amount: '₹15,000', status: 'Overdue', date: '2026-01-01', dueDate: '2026-01-31', method: 'Credit Card' },
  { id: 'INV-2026-107', company: 'Larsen & Toubro', plan: 'Enterprise', amount: '₹45,000', status: 'Paid', date: '2026-03-01', dueDate: '2026-03-15', method: 'Bank Transfer' },
  { id: 'INV-2026-108', company: 'Sundaram Fasteners', plan: 'Starter', amount: '₹0', status: 'Paid', date: '2026-03-01', dueDate: '2026-03-31', method: 'Trial' },
  { id: 'INV-2026-109', company: 'Hero MotoCorp', plan: 'Enterprise', amount: '₹45,000', status: 'Paid', date: '2026-03-01', dueDate: '2026-03-15', method: 'Credit Card' },
  { id: 'INV-2026-110', company: 'Ashok Leyland', plan: 'Professional', amount: '₹15,000', status: 'Refunded', date: '2026-02-15', dueDate: '2026-02-28', method: 'Bank Transfer' },
];

const PAYMENT_METHODS = [
  { type: 'Credit Card', icon: CardIcon, ending: '•••• 4242', expiry: '12/27', isDefault: true },
  { type: 'Bank Transfer', icon: BankIcon, ending: 'HDFC ••• 8891', expiry: '—', isDefault: false },
];

const CDPLBillingPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedInv, setSelectedInv] = useState<typeof MOCK_INVOICES[0] | null>(null);

  const filtered = MOCK_INVOICES.filter((inv) => {
    if (search && !inv.company.toLowerCase().includes(search.toLowerCase()) && !inv.id.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'All' && inv.status !== statusFilter) return false;
    return true;
  });

  const totalCollected = '₹2,15,000';
  const totalPending = '₹30,000';
  const totalOverdue = '₹30,000';

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>System / Billing</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>Billing & Invoices</Typography>
        </Box>
        <Button variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
          sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, borderColor: T.border, color: T.t2, borderRadius: '8px' }}>
          Export All
        </Button>
      </Box>

      {/* Summary + Revenue Chart */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 2fr' }, gap: 2.5, mb: 3 }}>
        {/* Summary Cards */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { label: 'Collected (This Month)', value: totalCollected, color: T.green },
            { label: 'Pending', value: totalPending, color: T.amber },
            { label: 'Overdue', value: totalOverdue, color: T.red },
          ].map((c) => (
            <Card key={c.label} sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box sx={{ width: 8, height: 36, borderRadius: '4px', bgcolor: c.color }} />
                <Box>
                  <Typography sx={{ fontSize: 11, color: T.t3 }}>{c.label}</Typography>
                  <Typography sx={{ fontSize: 22, fontWeight: 700, color: T.t1 }}>{c.value}</Typography>
                </Box>
              </Box>
            </Card>
          ))}
        </Box>

        {/* Revenue Chart */}
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.t1, mb: 2 }}>Revenue (Last 6 Months)</Typography>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={REV_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.borderSubtle} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.t3 }} />
              <YAxis tick={{ fontSize: 10, fill: T.t3 }} width={50} tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`} />
              <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}` }} formatter={(v: any) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Revenue']} />
              <Bar dataKey="revenue" fill={T.teal} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </Box>

      {/* Payment Methods */}
      <Card sx={{ p: 2.5, mb: 3, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.t1, mb: 2 }}>Platform Payment Methods</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {PAYMENT_METHODS.map((pm) => (
            <Box key={pm.type} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, borderRadius: '10px', border: `1px solid ${pm.isDefault ? T.teal : T.border}`, bgcolor: pm.isDefault ? alpha(T.teal, 0.03) : 'transparent', minWidth: 240 }}>
              <pm.icon sx={{ fontSize: 24, color: pm.isDefault ? T.teal : T.t3 }} />
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: T.t1 }}>{pm.ending}</Typography>
                  {pm.isDefault && <Chip label="Default" size="small" sx={{ fontSize: 9, height: 16, bgcolor: alpha(T.teal, 0.1), color: T.teal }} />}
                </Box>
                <Typography sx={{ fontSize: 11, color: T.t3 }}>{pm.type}{pm.expiry !== '—' ? ` · Exp ${pm.expiry}` : ''}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Card>

      {/* Filters */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
        <TextField size="small" placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: T.t3 }} /></InputAdornment> }}
          sx={{ minWidth: 260, '& input': { fontSize: 13 }, bgcolor: T.surface }} />
        <Select size="small" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 140, fontSize: 13, bgcolor: T.surface }}>
          <MenuItem value="All" sx={{ fontSize: 13 }}>All Status</MenuItem>
          {Object.keys(STATUS_MAP).map((s) => <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>{s}</MenuItem>)}
        </Select>
      </Box>

      {/* Invoice Table */}
      <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'auto' }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 850 }}>
          <Box component="thead">
            <Box component="tr" sx={{ borderBottom: `1px solid ${T.border}` }}>
              {['Invoice', 'Company', 'Plan', 'Amount', 'Status', 'Date', 'Due Date', 'Method', ''].map((h) => (
                <Box component="th" key={h} sx={{ px: 2, py: 1.5, textAlign: 'left', fontSize: 11, fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {filtered.map((inv) => {
              const st = STATUS_MAP[inv.status];
              const StIcon = st.icon;
              return (
                <Box component="tr" key={inv.id}
                  onClick={() => { setSelectedInv(inv); setDetailOpen(true); }}
                  sx={{ borderBottom: `1px solid ${T.borderSubtle}`, cursor: 'pointer', '&:hover': { bgcolor: alpha(T.teal, 0.02) } }}>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontFamily: 'monospace', fontSize: 12, color: T.blue, fontWeight: 500 }}>{inv.id}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 13, color: T.t1 }}>{inv.company}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: T.t2 }}>{inv.plan}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 13, fontWeight: 600, color: T.t1 }}>{inv.amount}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5 }}>
                    <Chip icon={<StIcon sx={{ fontSize: '14px !important' }} />} label={inv.status} size="small"
                      sx={{ fontSize: 10, height: 22, bgcolor: alpha(st.color, 0.1), color: st.color, fontWeight: 600, '& .MuiChip-icon': { color: `${st.color} !important` } }} />
                  </Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: T.t2 }}>{dayjs(inv.date).format('MMM D')}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: T.t2 }}>{dayjs(inv.dueDate).format('MMM D')}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 11, color: T.t3 }}>{inv.method}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5 }}>
                    <Button size="small" sx={{ textTransform: 'none', fontSize: 11, color: T.teal }}>View</Button>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Card>

      {/* Invoice Detail Dialog */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        {selectedInv && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{selectedInv.id}</Typography>
                <Typography sx={{ fontSize: 12, color: T.t3 }}>{selectedInv.company}</Typography>
              </Box>
              <IconButton onClick={() => setDetailOpen(false)} size="small"><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent>
              {[
                ['Plan', selectedInv.plan],
                ['Amount', selectedInv.amount],
                ['Status', selectedInv.status],
                ['Invoice Date', dayjs(selectedInv.date).format('MMMM D, YYYY')],
                ['Due Date', dayjs(selectedInv.dueDate).format('MMMM D, YYYY')],
                ['Payment Method', selectedInv.method],
              ].map(([label, value]) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 1.2, borderBottom: `1px solid ${T.borderSubtle}` }}>
                  <Typography sx={{ fontSize: 12, color: T.t3 }}>{label}</Typography>
                  <Typography sx={{ fontSize: 12, color: T.t1, fontWeight: 500 }}>{value}</Typography>
                </Box>
              ))}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 14 }} />}
                sx={{ textTransform: 'none', fontSize: 12, borderColor: T.border, color: T.t2, borderRadius: '8px' }}>
                Download PDF
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default CDPLBillingPage;
