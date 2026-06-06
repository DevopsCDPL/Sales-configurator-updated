import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Card, Chip, Button, TextField, InputAdornment, Select, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  IconButton, Tooltip, Checkbox, Menu, alpha, Drawer, Tabs, Tab, Divider, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions, Stepper, Step, StepLabel,
  Radio, RadioGroup, FormControlLabel, LinearProgress, Snackbar, Alert,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Download as DownloadIcon,
  Edit as EditIcon, Block as BlockIcon, Delete as DeleteIcon,
  FilterList as FilterIcon, MoreVert as MoreIcon, Close as CloseIcon,
  Business as BusinessIcon, CheckCircle as CheckIcon,
  ArrowForward as ArrowIcon, People as PeopleIcon,
  CreditCard as CreditCardIcon, History as HistoryIcon,
  TrendingUp as TrendUpIcon, Refresh as RefreshIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';

// ─── Design Tokens ──────────────────────────────────────────────────
const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

// ─── Mock Data ──────────────────────────────────────────────────────
const MOCK_COMPANIES = [
  { id: '1', name: 'Tata Steel Ltd', status: 'Active', plan: 'Enterprise', users: 45, created: '2025-06-15', email: 'admin@tatasteel.com', revenue: '₹1,25,000/mo' },
  { id: '2', name: 'Reliance Industries', status: 'Active', plan: 'Enterprise', users: 38, created: '2025-07-20', email: 'admin@reliance.com', revenue: '₹98,000/mo' },
  { id: '3', name: 'Mahindra & Mahindra', status: 'Active', plan: 'Pro', users: 24, created: '2025-08-10', email: 'admin@mahindra.com', revenue: '₹72,000/mo' },
  { id: '4', name: 'Bajaj Auto', status: 'Suspended', plan: 'Pro', users: 18, created: '2025-09-05', email: 'admin@bajaj.com', revenue: '₹58,000/mo' },
  { id: '5', name: 'Godrej Industries', status: 'Expired', plan: 'Starter', users: 12, created: '2025-10-12', email: 'admin@godrej.com', revenue: '₹0/mo' },
  { id: '6', name: 'Bharat Forge', status: 'Active', plan: 'Pro', users: 20, created: '2025-11-01', email: 'admin@bharatforge.com', revenue: '₹72,000/mo' },
  { id: '7', name: 'Ashok Leyland', status: 'Active', plan: 'Starter', users: 8, created: '2025-12-18', email: 'admin@ashokleyland.com', revenue: '₹35,000/mo' },
  { id: '8', name: 'Larsen & Toubro', status: 'Active', plan: 'Enterprise', users: 52, created: '2026-01-05', email: 'admin@lnt.com', revenue: '₹1,50,000/mo' },
  { id: '9', name: 'Kirloskar Brothers', status: 'Suspended', plan: 'Free', users: 3, created: '2026-02-14', email: 'admin@kirloskar.com', revenue: '₹0/mo' },
  { id: '10', name: 'Sundaram Fasteners', status: 'Active', plan: 'Starter', users: 10, created: '2026-03-01', email: 'admin@sundaram.com', revenue: '₹35,000/mo' },
];

const ACTIVITY_LOG = [
  { time: '2 hours ago', action: 'User limit increased to 60', by: 'Platform Admin' },
  { time: '1 day ago', action: 'Plan upgraded from Pro to Enterprise', by: 'Vikraman' },
  { time: '3 days ago', action: 'New admin user added: priya@tatasteel.com', by: 'Admin' },
  { time: '1 week ago', action: 'Billing address updated', by: 'Admin' },
  { time: '2 weeks ago', action: 'Company onboarded successfully', by: 'Platform Admin' },
];

const BILLING_HISTORY = [
  { id: 'INV-2024-001', date: '2026-04-01', amount: '₹1,25,000', status: 'Paid' },
  { id: 'INV-2024-002', date: '2026-03-01', amount: '₹1,25,000', status: 'Paid' },
  { id: 'INV-2024-003', date: '2026-02-01', amount: '₹98,000', status: 'Paid' },
  { id: 'INV-2024-004', date: '2026-01-01', amount: '₹98,000', status: 'Paid' },
];

const PLAN_OPTIONS = [
  { name: 'Free', price: '₹0/mo', features: ['5 Users', '1 GB Storage', 'Basic Support', 'Core Features'] },
  { name: 'Starter', price: '₹35,000/mo', features: ['15 Users', '10 GB Storage', 'Email Support', 'All Core Features', 'Basic Analytics'] },
  { name: 'Pro', price: '₹72,000/mo', features: ['50 Users', '50 GB Storage', 'Priority Support', 'Advanced Analytics', 'API Access', 'Custom Roles'] },
  { name: 'Enterprise', price: '₹1,25,000/mo', features: ['Unlimited Users', '500 GB Storage', '24/7 Support', 'All Features', 'SSO/SAML', 'Dedicated Manager', 'SLA'] },
];

const CDPLCompaniesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [planFilter, setPlanFilter] = useState('All');
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerCompany, setDrawerCompany] = useState<typeof MOCK_COMPANIES[0] | null>(null);
  const [drawerTab, setDrawerTab] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState(0);
  const [bulkMenu, setBulkMenu] = useState<null | HTMLElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [newCompany, setNewCompany] = useState({ name: '', code: '', email: '', plan: 'Starter', adminName: '', adminEmail: '' });

  const stats = useMemo(() => ({
    total: MOCK_COMPANIES.length,
    active: MOCK_COMPANIES.filter((c) => c.status === 'Active').length,
    suspended: MOCK_COMPANIES.filter((c) => c.status === 'Suspended').length,
    expired: MOCK_COMPANIES.filter((c) => c.status === 'Expired').length,
  }), []);

  const filtered = useMemo(() => {
    return MOCK_COMPANIES.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (planFilter !== 'All' && c.plan !== planFilter) return false;
      return true;
    });
  }, [search, statusFilter, planFilter]);

  const statusChip = (status: string) => {
    const cfg: Record<string, { bg: string; color: string }> = {
      Active: { bg: alpha(T.green, 0.1), color: T.green },
      Suspended: { bg: alpha(T.amber, 0.1), color: T.amber },
      Expired: { bg: alpha(T.red, 0.1), color: T.red },
    };
    const c = cfg[status] || cfg.Active;
    return <Chip label={status} size="small" sx={{ bgcolor: c.bg, color: c.color, fontWeight: 600, fontSize: 12, height: 24 }} />;
  };

  const planChip = (plan: string) => {
    const cfg: Record<string, string> = { Enterprise: T.purple, Pro: T.blue, Starter: T.teal, Free: T.t3 };
    const color = cfg[plan] || T.t3;
    return <Chip label={plan} size="small" variant="outlined" sx={{ borderColor: alpha(color, 0.4), color, fontWeight: 600, fontSize: 12, height: 24 }} />;
  };

  const handleSelectAll = (checked: boolean) => setSelected(checked ? filtered.map((c) => c.id) : []);
  const handleSelect = (id: string) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const openDrawer = (company: typeof MOCK_COMPANIES[0]) => {
    setDrawerCompany(company);
    setDrawerTab(0);
    setDrawerOpen(true);
  };

  return (
    <Box>
      {/* ── Page Header ── */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>Management / Companies</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>Companies</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 12, color: T.t3, mr: 1 }}>
            Last updated: {dayjs().format('MMM D, YYYY h:mm A')}
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon sx={{ fontSize: 18 }} />}
            onClick={() => { setAddStep(0); setNewCompany({ name: '', code: '', email: '', plan: 'Starter', adminName: '', adminEmail: '' }); setAddOpen(true); }}
            sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}
          >
            Add Company
          </Button>
        </Box>
      </Box>

      {/* ── Stat Cards ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        {[
          { label: 'Total Companies', value: stats.total, icon: <BusinessIcon />, color: T.blue },
          { label: 'Active', value: stats.active, icon: <CheckIcon />, color: T.green },
          { label: 'Suspended', value: stats.suspended, icon: <BlockIcon />, color: T.amber },
          { label: 'Expired', value: stats.expired, icon: <DeleteIcon />, color: T.red },
        ].map((s) => (
          <Card key={s.label} sx={{ p: 2, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 44, height: 44, borderRadius: '10px', bgcolor: alpha(s.color, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
              {s.icon}
            </Box>
            <Box>
              <Typography sx={{ fontSize: 24, fontWeight: 700, color: T.t1 }}>{s.value}</Typography>
              <Typography sx={{ fontSize: 12, color: T.t3 }}>{s.label}</Typography>
            </Box>
          </Card>
        ))}
      </Box>

      {/* ── Filter Bar ── */}
      <Card sx={{ p: 2, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', mb: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
          <TextField
            size="small" placeholder="Search companies..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: T.t3 }} /></InputAdornment> }}
            sx={{ minWidth: 240, '& input': { fontSize: 13 } }}
          />
          <Select size="small" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 120, fontSize: 13 }}>
            <MenuItem value="All" sx={{ fontSize: 13 }}>All Status</MenuItem>
            <MenuItem value="Active" sx={{ fontSize: 13 }}>Active</MenuItem>
            <MenuItem value="Suspended" sx={{ fontSize: 13 }}>Suspended</MenuItem>
            <MenuItem value="Expired" sx={{ fontSize: 13 }}>Expired</MenuItem>
          </Select>
          <Select size="small" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} sx={{ minWidth: 120, fontSize: 13 }}>
            <MenuItem value="All" sx={{ fontSize: 13 }}>All Plans</MenuItem>
            <MenuItem value="Free" sx={{ fontSize: 13 }}>Free</MenuItem>
            <MenuItem value="Starter" sx={{ fontSize: 13 }}>Starter</MenuItem>
            <MenuItem value="Pro" sx={{ fontSize: 13 }}>Pro</MenuItem>
            <MenuItem value="Enterprise" sx={{ fontSize: 13 }}>Enterprise</MenuItem>
          </Select>
          <Box sx={{ flex: 1 }} />
          {selected.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 12, color: T.teal, fontWeight: 600 }}>{selected.length} selected</Typography>
              <Button size="small" startIcon={<DownloadIcon sx={{ fontSize: 16 }} />} onClick={() => setToast('CSV exported successfully')} sx={{ textTransform: 'none', fontSize: 12, color: T.t2 }}>Export CSV</Button>
              <Button size="small" startIcon={<BlockIcon sx={{ fontSize: 16 }} />} onClick={() => setToast(`${selected.length} companies suspended`)} sx={{ textTransform: 'none', fontSize: 12, color: T.amber }}>Bulk Suspend</Button>
              <Button size="small" startIcon={<DeleteIcon sx={{ fontSize: 16 }} />} onClick={() => setToast(`${selected.length} companies deleted`)} sx={{ textTransform: 'none', fontSize: 12, color: T.red }}>Bulk Delete</Button>
            </Box>
          )}
        </Box>
      </Card>

      {/* ── Data Table ── */}
      <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={selected.length === filtered.length && filtered.length > 0} indeterminate={selected.length > 0 && selected.length < filtered.length} onChange={(e) => handleSelectAll(e.target.checked)} sx={{ color: T.t3, '&.Mui-checked': { color: T.teal } }} />
                </TableCell>
                {['Company Name', 'Status', 'Plan Tier', 'Users', 'Created Date', 'Actions'].map((h) => (
                  <TableCell key={h} sx={{ fontSize: 11, fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.05em', borderColor: T.borderSubtle }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((c) => (
                <TableRow key={c.id} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: alpha(T.teal, 0.02) } }} onClick={() => openDrawer(c)}>
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    <Checkbox size="small" checked={selected.includes(c.id)} onChange={() => handleSelect(c.id)} sx={{ color: T.t3, '&.Mui-checked': { color: T.teal } }} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(T.teal, 0.1), color: T.teal, fontSize: 13, fontWeight: 700 }}>{c.name.charAt(0)}</Avatar>
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.t1 }}>{c.name}</Typography>
                        <Typography sx={{ fontSize: 11, color: T.t3 }}>{c.email}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>{statusChip(c.status)}</TableCell>
                  <TableCell>{planChip(c.plan)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <PeopleIcon sx={{ fontSize: 16, color: T.t3 }} />
                      <Typography sx={{ fontSize: 13, color: T.t1 }}>{c.users}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: 13, color: T.t2 }}>{dayjs(c.created).format('MMM D, YYYY')}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Edit"><IconButton size="small" sx={{ color: T.blue }}><EditIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                      <Tooltip title="Suspend"><IconButton size="small" sx={{ color: T.amber }}><BlockIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" sx={{ color: T.red }}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={filtered.length} page={page} rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[5, 10, 25]}
          sx={{ borderTop: `1px solid ${T.borderSubtle}`, '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: 12 } }}
        />
      </Card>

      {/* ── Company Detail Drawer ── */}
      <Drawer anchor="right" open={drawerOpen} onClose={() => setDrawerOpen(false)} PaperProps={{ sx: { width: { xs: '100%', md: 520 }, borderRadius: '16px 0 0 16px' } }}>
        {drawerCompany && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 3, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar sx={{ width: 40, height: 40, bgcolor: alpha(T.teal, 0.1), color: T.teal, fontWeight: 700 }}>{drawerCompany.name.charAt(0)}</Avatar>
                <Box>
                  <Typography sx={{ fontSize: 16, fontWeight: 700, color: T.t1 }}>{drawerCompany.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: T.t3 }}>{drawerCompany.email}</Typography>
                </Box>
              </Box>
              <IconButton onClick={() => setDrawerOpen(false)} size="small"><CloseIcon /></IconButton>
            </Box>

            <Tabs value={drawerTab} onChange={(_, v) => setDrawerTab(v)} sx={{ px: 3, borderBottom: `1px solid ${T.border}`, '& .MuiTab-root': { textTransform: 'none', fontSize: 13, fontWeight: 600, minHeight: 44 }, '& .Mui-selected': { color: T.teal }, '& .MuiTabs-indicator': { bgcolor: T.teal } }}>
              <Tab label="Overview" />
              <Tab label="Users" />
              <Tab label="Billing" />
              <Tab label="Activity" />
            </Tabs>

            <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
              {drawerTab === 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {[
                    { label: 'Status', value: drawerCompany.status, chip: true },
                    { label: 'Plan', value: drawerCompany.plan },
                    { label: 'Users', value: `${drawerCompany.users} active` },
                    { label: 'Revenue', value: drawerCompany.revenue },
                    { label: 'Created', value: dayjs(drawerCompany.created).format('MMM D, YYYY') },
                  ].map((f) => (
                    <Box key={f.label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1, borderBottom: `1px solid ${T.borderSubtle}` }}>
                      <Typography sx={{ fontSize: 13, color: T.t3 }}>{f.label}</Typography>
                      {f.chip ? statusChip(f.value) : <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.t1 }}>{f.value}</Typography>}
                    </Box>
                  ))}
                </Box>
              )}

              {drawerTab === 1 && (
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 2 }}>Team Members ({drawerCompany.users})</Typography>
                  {Array.from({ length: Math.min(drawerCompany.users, 5) }, (_, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, borderBottom: `1px solid ${T.borderSubtle}` }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(T.blue, 0.1), color: T.blue, fontSize: 12 }}>{String.fromCharCode(65 + i)}</Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 500 }}>User {i + 1}</Typography>
                        <Typography sx={{ fontSize: 11, color: T.t3 }}>user{i + 1}@{drawerCompany.name.toLowerCase().replace(/\s+/g, '')}.com</Typography>
                      </Box>
                      <Chip label={i === 0 ? 'Admin' : 'User'} size="small" sx={{ fontSize: 10, height: 20, bgcolor: i === 0 ? alpha(T.purple, 0.1) : alpha(T.t3, 0.1), color: i === 0 ? T.purple : T.t2 }} />
                    </Box>
                  ))}
                </Box>
              )}

              {drawerTab === 2 && (
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 2 }}>Billing History</Typography>
                  {BILLING_HISTORY.map((inv) => (
                    <Box key={inv.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5, borderBottom: `1px solid ${T.borderSubtle}` }}>
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 500, fontFamily: 'monospace', color: T.teal }}>{inv.id}</Typography>
                        <Typography sx={{ fontSize: 11, color: T.t3 }}>{dayjs(inv.date).format('MMM D, YYYY')}</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{inv.amount}</Typography>
                        <Chip label={inv.status} size="small" sx={{ fontSize: 10, height: 18, bgcolor: alpha(T.green, 0.1), color: T.green }} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}

              {drawerTab === 3 && (
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 2 }}>Recent Activity</Typography>
                  {ACTIVITY_LOG.map((a, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1.5, py: 1.5, borderBottom: `1px solid ${T.borderSubtle}` }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: T.teal, mt: 0.8, flexShrink: 0 }} />
                      <Box>
                        <Typography sx={{ fontSize: 13, color: T.t1 }}>{a.action}</Typography>
                        <Typography sx={{ fontSize: 11, color: T.t3 }}>{a.time} · by {a.by}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Drawer>

      {/* ── Add Company Multi-Step Modal ── */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 600, fontSize: 18, pb: 1 }}>Add Company</DialogTitle>
        <DialogContent>
          <Stepper activeStep={addStep} sx={{ mb: 3, mt: 1 }}>
            {['Company Info', 'Plan Selection', 'Admin Assignment', 'Review'].map((label) => (
              <Step key={label}><StepLabel sx={{ '& .MuiStepLabel-label': { fontSize: 12 } }}>{label}</StepLabel></Step>
            ))}
          </Stepper>

          {addStep === 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField label="Company Name" size="small" fullWidth value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
              <TextField label="Company Code" size="small" fullWidth value={newCompany.code} onChange={(e) => setNewCompany({ ...newCompany, code: e.target.value })} InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
              <TextField label="Contact Email" size="small" fullWidth value={newCompany.email} onChange={(e) => setNewCompany({ ...newCompany, email: e.target.value })} InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
            </Box>
          )}

          {addStep === 1 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              {PLAN_OPTIONS.map((p) => (
                <Card
                  key={p.name}
                  onClick={() => setNewCompany({ ...newCompany, plan: p.name })}
                  sx={{
                    p: 2, cursor: 'pointer', borderRadius: '10px',
                    border: `2px solid ${newCompany.plan === p.name ? T.teal : T.border}`,
                    bgcolor: newCompany.plan === p.name ? alpha(T.teal, 0.03) : T.surface,
                    transition: 'border-color 0.2s',
                  }}
                >
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: T.t1, mb: 0.5 }}>{p.name}</Typography>
                  <Typography sx={{ fontSize: 16, fontWeight: 700, color: T.teal, mb: 1 }}>{p.price}</Typography>
                  {p.features.map((f) => (
                    <Typography key={f} sx={{ fontSize: 11, color: T.t2, mb: 0.3 }}>✓ {f}</Typography>
                  ))}
                </Card>
              ))}
            </Box>
          )}

          {addStep === 2 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography sx={{ fontSize: 13, color: T.t2, mb: 1 }}>Assign the initial admin user for this company.</Typography>
              <TextField label="Admin Full Name" size="small" fullWidth value={newCompany.adminName} onChange={(e) => setNewCompany({ ...newCompany, adminName: e.target.value })} InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
              <TextField label="Admin Email" size="small" fullWidth value={newCompany.adminEmail} onChange={(e) => setNewCompany({ ...newCompany, adminEmail: e.target.value })} InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
            </Box>
          )}

          {addStep === 3 && (
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 2 }}>Review Details</Typography>
              {[
                { label: 'Company', value: newCompany.name || '—' },
                { label: 'Code', value: newCompany.code || '—' },
                { label: 'Email', value: newCompany.email || '—' },
                { label: 'Plan', value: newCompany.plan },
                { label: 'Admin', value: newCompany.adminName || '—' },
                { label: 'Admin Email', value: newCompany.adminEmail || '—' },
              ].map((r) => (
                <Box key={r.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: `1px solid ${T.borderSubtle}` }}>
                  <Typography sx={{ fontSize: 13, color: T.t3 }}>{r.label}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: T.t1 }}>{r.value}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          {addStep > 0 && <Button onClick={() => setAddStep(addStep - 1)} sx={{ textTransform: 'none', color: T.t2 }}>Back</Button>}
          {addStep < 3 ? (
            <Button variant="contained" onClick={() => setAddStep(addStep + 1)} sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
              Next
            </Button>
          ) : (
            <Button variant="contained" onClick={() => { setAddOpen(false); setToast('Company created successfully'); }} sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
              Create Company
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ borderRadius: '8px' }}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
};

export default CDPLCompaniesPage;
