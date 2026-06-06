import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import {
  Business as BusinessIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Launch as EnterIcon,
  People as PeopleIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  Block as SuspendIcon,
  PlayArrow as ActivateIcon,
  LockReset as ResetPwIcon,
  MoreVert as MoreIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { setActiveCompanyContext } from '../../utils/activeCompany';
import dayjs from 'dayjs';

const PRIMARY = '#1F7A63';
const BLUE = '#0D3D2F';
const RED = '#dc2626';

interface DashboardStats {
  totalCompanies: number;
  activeCompanies: number;
  totalUsers: number;
  totalOwners?: number;
  activeSubscriptions?: number;
  revenue?: number;
}

interface CompanyRow {
  id: string;
  name: string;
  company_code?: string;
  email?: string;
  plan?: string;
  is_active: boolean;
  user_limit?: number;
  userCount?: number;
  activeUserCount?: number;
  subscription_status?: string;
  created_at?: string;
  owner?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

const planColor = (plan?: string) => {
  switch (plan) {
    case 'enterprise':
      return '#1F7A63';
    case 'premium':
    case 'professional':
      return BLUE;
    case 'starter':
      return PRIMARY;
    default:
      return '#64748b';
  }
};

const CDPLPlatformDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  // refreshUser no longer needed after new-tab impersonation refactor
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Row action menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuCompany, setMenuCompany] = useState<CompanyRow | null>(null);

  // Reset password dialog
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [resetPwCompany, setResetPwCompany] = useState<CompanyRow | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [resetPwSaving, setResetPwSaving] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, companiesRes] = await Promise.all([
        api.get('/platform-admin/dashboard'),
        api.get('/platform-admin/companies'),
      ]);
      setStats(statsRes.data?.data || null);
      setCompanies(Array.isArray(companiesRes.data?.data) ? companiesRes.data.data : []);
    } catch (error) {
      console.error('Failed to load platform dashboard:', error);
      setToast({ message: 'Failed to load dashboard data', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const activeCompanies = useMemo(
    () => companies.filter((c) => c.is_active).length,
    [companies]
  );

  const totalUsers = useMemo(
    () => companies.reduce((sum, c) => sum + (c.userCount || 0), 0),
    [companies]
  );

  const filtered = useMemo(() => {
    let list = companies;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.owner?.name || '').toLowerCase().includes(q) ||
          (c.owner?.email || c.email || '').toLowerCase().includes(q) ||
          (c.company_code || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter === 'active') list = list.filter((c) => c.is_active);
    if (statusFilter === 'suspended') list = list.filter((c) => !c.is_active);
    return list;
  }, [companies, search, statusFilter]);

  // ── Row menu ─────────────────────────────────────────────────────────────
  const openMenu = (e: React.MouseEvent<HTMLElement>, company: CompanyRow) => {
    setMenuAnchor(e.currentTarget);
    setMenuCompany(company);
  };
  const closeMenu = () => { setMenuAnchor(null); setMenuCompany(null); };

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleDeleteCompany = async (company: CompanyRow) => {
    if (!window.confirm(`Delete ${company.name}? This action cannot be undone.`)) return;
    setActionBusyId(company.id);
    try {
      await api.delete(`/platform-admin/companies/${company.id}`);
      setToast({ message: 'Company deleted', severity: 'success' });
      await loadDashboard();
    } catch (error: any) {
      setToast({ message: error.response?.data?.message || 'Failed to delete company', severity: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleSuspendActivate = async (company: CompanyRow) => {
    const action = company.is_active ? 'deactivate' : 'activate';
    const label = company.is_active ? 'Suspend' : 'Activate';
    if (!window.confirm(`${label} ${company.name}?`)) return;
    setActionBusyId(company.id);
    try {
      await api.post(`/platform-admin/companies/${company.id}/${action}`);
      setToast({ message: `Company ${label.toLowerCase()}d successfully`, severity: 'success' });
      await loadDashboard();
    } catch (error: any) {
      setToast({ message: error.response?.data?.message || `Failed to ${label.toLowerCase()} company`, severity: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  const handleResetOwnerPassword = async () => {
    if (!resetPwCompany || !resetPwValue || resetPwValue.length < 6) return;
    setResetPwSaving(true);
    try {
      await api.post(`/platform-admin/companies/${resetPwCompany.id}/reset-password`, { password: resetPwValue });
      setToast({ message: `Owner password reset for ${resetPwCompany.name}`, severity: 'success' });
      setResetPwOpen(false);
      setResetPwValue('');
      setResetPwCompany(null);
    } catch (error: any) {
      setToast({ message: error.response?.data?.message || 'Failed to reset password', severity: 'error' });
    } finally {
      setResetPwSaving(false);
    }
  };

  const handleEnterCompany = async (company: CompanyRow) => {
    setActionBusyId(company.id);
    try {
      const response = await api.post(`/platform-admin/companies/${company.id}/enter`);
      const selected = response.data?.data;
      if (!selected?.id || !selected?.name) {
        throw new Error('Invalid company selection response');
      }
      setActiveCompanyContext({
        id: selected.id,
        name: selected.name,
        company_code: selected.company_code || null,
        plan: selected.plan || null,
        owner_name: selected.owner?.name || null,
      });
      // Open Forge working dashboard in a new tab with impersonation
      if (selected.impersonation_token) {
        const impUser = selected.owner ? JSON.stringify({
          id: selected.owner.id,
          name: selected.owner.name,
          email: selected.owner.email,
          role: 'main_admin',
          company_id: selected.id,
        }) : null;
        // Store impersonation data in temporary keys for the new tab to pick up
        localStorage.setItem('forge_impersonate_token', selected.impersonation_token);
        if (impUser) localStorage.setItem('forge_impersonate_user', impUser);
        window.open('/?impersonate=1', '_blank');
      }
    } catch (error: any) {
      setToast({ message: error.response?.data?.message || error.message || 'Failed to enter company', severity: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  const summary = stats || {
    totalCompanies: companies.length,
    activeCompanies,
    totalUsers,
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Platform Dashboard
          </Typography>
          <Typography sx={{ fontSize: '0.88rem', color: '#64748b', mt: 0.3 }}>
            Overview of all companies, users, and plans on the platform.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button variant="outlined" size="small" onClick={() => navigate('/platform-admin/company-owners')}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: '0.82rem', borderColor: '#e2e8f0', color: '#475569' }}>
            Company Owners
          </Button>
          <Button variant="contained" size="small" onClick={() => navigate('/platform-admin/companies')}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, fontSize: '0.82rem', bgcolor: PRIMARY, '&:hover': { bgcolor: '#186753' } }}>
            Manage Companies
          </Button>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={loadDashboard} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, width: 34, height: 34 }}>
              <RefreshIcon sx={{ fontSize: 18, color: '#64748b' }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {/* ── Stat Cards (3 cards) ───────────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
        {[
          { title: 'Companies', value: summary.totalCompanies, sub: `${summary.activeCompanies} active`, color: PRIMARY, icon: <BusinessIcon /> },
          { title: 'Total Users', value: summary.totalUsers, sub: 'Across all companies', color: BLUE, icon: <PeopleIcon /> },
          { title: 'Active', value: summary.activeCompanies, sub: `of ${summary.totalCompanies} companies`, color: '#16a34a', icon: <BusinessIcon /> },
        ].map((s) => (
          <Card key={s.title} elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: alpha(s.color, 0.15) }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                <Box>
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.title}</Typography>
                  <Typography sx={{ fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.1, mt: 0.5, color: '#0f172a' }}>{s.value}</Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: '#64748b', mt: 0.3 }}>{s.sub}</Typography>
                </Box>
                <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: alpha(s.color, 0.08), color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s.icon}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* ── Company Table ──────────────────────────────────────────────── */}
      <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0' }}>
        <CardContent sx={{ p: 0 }}>
          {/* Table header with search + filter */}
          <Box sx={{ px: 2.5, py: 2, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, borderBottom: '1px solid #e2e8f0' }}>
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
              Companies
              <Typography component="span" sx={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 500, ml: 1 }}>
                {filtered.length} {filtered.length === 1 ? 'company' : 'companies'}
              </Typography>
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                size="small" placeholder="Search companies..." value={search} onChange={(e) => setSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: '#94a3b8' }} /></InputAdornment> }}
                sx={{ width: 240, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.85rem' } }}
              />
              <Select size="small" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                sx={{ minWidth: 120, borderRadius: 2, fontSize: '0.85rem' }}>
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
              </Select>
            </Stack>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(PRIMARY, 0.03) }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.76rem', color: '#64748b' }}>Company</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.76rem', color: '#64748b' }}>Owner</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.76rem', color: '#64748b' }}>Plan</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.76rem', color: '#64748b' }}>Users</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.76rem', color: '#64748b' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.76rem', color: '#64748b' }}>Created</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.76rem', color: '#64748b' }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                      <Typography sx={{ color: '#64748b' }}>
                        {search || statusFilter !== 'all' ? 'No companies match your filters' : 'No companies found'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((company) => {
                  const used = company.activeUserCount ?? company.userCount ?? 0;
                  const limit = company.user_limit ?? 5;
                  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
                  return (
                    <TableRow key={company.id} hover sx={{ '&:hover': { bgcolor: alpha(PRIMARY, 0.02) } }}>
                      {/* Company (name + code) */}
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar sx={{ width: 34, height: 34, bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY, fontWeight: 700, fontSize: '0.85rem' }}>
                            {company.name?.charAt(0)?.toUpperCase() || 'C'}
                          </Avatar>
                          <Box>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{company.name}</Typography>
                            {company.company_code && (
                              <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>{company.company_code}</Typography>
                            )}
                          </Box>
                        </Stack>
                      </TableCell>
                      {/* Owner */}
                      <TableCell>
                        {company.owner ? (
                          <Box>
                            <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a', lineHeight: 1.2 }}>{company.owner.name}</Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>{company.owner.email}</Typography>
                          </Box>
                        ) : (
                          <Typography sx={{ fontSize: '0.82rem', color: '#f59e0b', fontWeight: 500 }}>No owner assigned</Typography>
                        )}
                      </TableCell>
                      {/* Plan */}
                      <TableCell>
                        <Chip label={company.plan || 'starter'} size="small"
                          sx={{ bgcolor: alpha(planColor(company.plan), 0.1), color: planColor(company.plan), fontWeight: 700, textTransform: 'capitalize', fontSize: '0.72rem' }} />
                      </TableCell>
                      {/* Users (progress bar) */}
                      <TableCell>
                        <Box sx={{ minWidth: 100 }}>
                          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#0f172a', mb: 0.3 }}>
                            {used} of {limit} used
                          </Typography>
                          <LinearProgress variant="determinate" value={pct}
                            sx={{ height: 5, borderRadius: 3, bgcolor: alpha(PRIMARY, 0.08),
                              '& .MuiLinearProgress-bar': { bgcolor: pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : PRIMARY, borderRadius: 3 } }} />
                        </Box>
                      </TableCell>
                      {/* Status */}
                      <TableCell>
                        <Chip label={company.is_active ? 'Active' : 'Suspended'} size="small"
                          sx={{ bgcolor: company.is_active ? alpha('#16a34a', 0.1) : alpha(RED, 0.1),
                            color: company.is_active ? '#15803d' : RED, fontWeight: 700, fontSize: '0.72rem' }} />
                      </TableCell>
                      {/* Created */}
                      <TableCell>
                        <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {company.created_at ? dayjs(company.created_at).format('DD MMM YYYY') : '—'}
                        </Typography>
                      </TableCell>
                      {/* Actions: Enter button + 3-dot menu */}
                      <TableCell align="right">
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                          <Tooltip title={!company.owner ? 'No owner assigned' : !company.is_active ? 'Company is suspended' : ''} arrow>
                            <span>
                              <Button size="small" variant="contained" startIcon={<EnterIcon sx={{ fontSize: 14 }} />}
                                disabled={!company.is_active || !company.owner || actionBusyId === company.id}
                                onClick={() => handleEnterCompany(company)}
                                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, fontSize: '0.74rem', px: 1.5, py: 0.4,
                                  bgcolor: PRIMARY, '&:hover': { bgcolor: '#186753' }, minWidth: 0 }}>
                                Enter
                              </Button>
                            </span>
                          </Tooltip>
                          <IconButton size="small" onClick={(e) => openMenu(e, company)}
                            disabled={actionBusyId === company.id}
                            sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, width: 30, height: 30 }}>
                            <MoreIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* ── Row Actions Menu ───────────────────────────────────────────── */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' } }}>
        <MenuItem onClick={() => { if (menuCompany) navigate('/platform-admin/companies', { state: { companyId: menuCompany.id, mode: 'view' } }); closeMenu(); }}
          sx={{ fontSize: 13, py: 1 }}>
          <ListItemIcon><ViewIcon sx={{ fontSize: 18, color: PRIMARY }} /></ListItemIcon>
          <ListItemText>View Details</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (menuCompany) navigate('/platform-admin/companies', { state: { companyId: menuCompany.id, mode: 'edit' } }); closeMenu(); }}
          sx={{ fontSize: 13, py: 1 }}>
          <ListItemIcon><EditIcon sx={{ fontSize: 18, color: '#475569' }} /></ListItemIcon>
          <ListItemText>Edit Company</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (menuCompany) { setResetPwCompany(menuCompany); setResetPwOpen(true); } closeMenu(); }}
          disabled={!menuCompany?.owner} sx={{ fontSize: 13, py: 1 }}>
          <ListItemIcon><ResetPwIcon sx={{ fontSize: 18, color: '#166354' }} /></ListItemIcon>
          <ListItemText>Reset Owner Password</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (menuCompany) handleSuspendActivate(menuCompany); closeMenu(); }}
          sx={{ fontSize: 13, py: 1 }}>
          <ListItemIcon>
            {menuCompany?.is_active
              ? <SuspendIcon sx={{ fontSize: 18, color: '#f59e0b' }} />
              : <ActivateIcon sx={{ fontSize: 18, color: '#16a34a' }} />}
          </ListItemIcon>
          <ListItemText>{menuCompany?.is_active ? 'Suspend' : 'Activate'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (menuCompany) handleDeleteCompany(menuCompany); closeMenu(); }}
          sx={{ fontSize: 13, py: 1, color: RED }}>
          <ListItemIcon><DeleteIcon sx={{ fontSize: 18, color: RED }} /></ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* ── Reset Owner Password Dialog ────────────────────────────────── */}
      <Dialog open={resetPwOpen} onClose={() => { setResetPwOpen(false); setResetPwValue(''); }} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Reset Owner Password</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2, fontSize: '0.88rem', color: '#64748b' }}>
            Reset password for <strong>{resetPwCompany?.owner?.name || 'Owner'}</strong> of <strong>{resetPwCompany?.name}</strong>
          </Typography>
          <TextField
            fullWidth
            label="New Password"
            type="password"
            value={resetPwValue}
            onChange={(e) => setResetPwValue(e.target.value)}
            helperText="Minimum 6 characters"
            error={resetPwValue.length > 0 && resetPwValue.length < 6}
            autoFocus
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setResetPwOpen(false); setResetPwValue(''); }} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleResetOwnerPassword}
            disabled={resetPwSaving || resetPwValue.length < 6}
            sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#186753' }, textTransform: 'none', fontWeight: 600 }}
          >
            {resetPwSaving ? 'Resetting...' : 'Reset Password'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : <span />}
      </Snackbar>
    </Box>
  );
};

export default CDPLPlatformDashboardPage;
