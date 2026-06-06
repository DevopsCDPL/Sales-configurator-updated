import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
  Snackbar,
  Alert,
  CircularProgress,
  alpha,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Tabs,
  Tab,
  Divider,
  Switch,
  FormControlLabel,
  Paper,
  Grid,
  Avatar,
  LinearProgress,
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  CheckCircle as ActivateIcon,
  Block as DeactivateIcon,
  LockReset as ResetIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  PersonAdd as PersonAddIcon,
  ArrowBack as BackIcon,
  Search as SearchIcon,
  Business as BusinessIcon,
  People as PeopleIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  Cancel as CancelLogoIcon,
  CloudUpload as UploadIcon,
  Launch as EnterCompanyIcon,
  MoreVert as MoreIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import dayjs from 'dayjs';
import { setActiveCompanyContext } from '../../utils/activeCompany';

const PRIMARY = '#1F7A63';
const PRIMARY_DARK = '#166354';
const BLUE = '#0D3D2F';
const PLAN_COLORS: Record<string, string> = { free: '#6B7280', starter: PRIMARY, premium: BLUE, professional: BLUE, enterprise: '#2A9D7E' };

/* ─── Types ─────────────────────────────────────────────────────────── */
interface Company {
  id: string;
  name: string;
  company_code?: string;
  email?: string;
  phone?: string;
  address?: string;
  plan?: string;
  user_limit?: number;
  is_active: boolean;
  subscription_status?: string;
  subscription_start_date?: string;
  subscription_end_date?: string;
  created_at?: string;
  userCount?: number;
  activeUserCount?: number;
  logo_url?: string;
  logo_data?: string;
  last_activity_at?: string;
  storage_used_mb?: number;
  owner?: {
    id: string;
    name: string;
    email: string;
    last_login?: string;
  } | null;
}

interface CompanyUser {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  modules?: string[];
  last_login?: string;
  created_at?: string;
  invite_status?: string;
  force_password_reset?: boolean;
}

interface InitialUser {
  name: string;
  email: string;
  role: string;
  password: string;
  send_invite: boolean;
}

interface CompanyActivity {
  company_name: string;
  company_code: string;
  plan: string;
  user_limit: number;
  total_users: number;
  active_users: number;
  inactive_users: number;
  recently_active: number;
  storage_used_mb: number;
  subscription_status: string;
  subscription_end_date: string;
  last_activity_at: string;
}

/* ─── Plan config ───────────────────────────────────────────────────── */
const PLAN_CONFIG: Record<string, { label: string; limit: number | null; desc: string }> = {
  free:       { label: 'Free',       limit: 5,    desc: '5 users' },
  starter:    { label: 'Starter',    limit: 5,    desc: '5 users' },
  premium:    { label: 'Premium',    limit: 10,   desc: '10 users' },
  enterprise: { label: 'Enterprise', limit: null, desc: 'Custom users' },
};

/* ─── Roles ─────────────────────────────────────────────────────────── */
const ROLES = [
  { value: 'main_admin',      label: 'Owner',           desc: 'Company owner with full administrative access' },
  { value: 'admin',           label: 'Admin',           desc: 'Full access to all modules' },
  { value: 'sales_engineer',  label: 'Sales Engineer',  desc: 'All modules except Business Analytics' },
  { value: 'user',            label: 'User',            desc: 'Standard access' },
];

const emptyForm = {
  company_name: '',
  admin_name: '',
  admin_email: '',
  admin_password: '',
  email: '',
  phone: '',
  address: '',
  plan: 'starter' as string,
  custom_user_limit: 20,
  subscription_start_date: dayjs().format('YYYY-MM-DD'),
  subscription_end_date: dayjs().add(1, 'year').format('YYYY-MM-DD'),
};

const emptyUser: InitialUser = { name: '', email: '', role: 'user', password: '', send_invite: false };

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */
const PlatformCompaniesPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [initialUsers, setInitialUsers] = useState<InitialUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Company detail view
  const [detailCompany, setDetailCompany] = useState<Company | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [companyActivity, setCompanyActivity] = useState<CompanyActivity | null>(null);
  const [companyUserLimit, setCompanyUserLimit] = useState(5);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add user dialog
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'user', password: '', send_invite: false });
  const [savingUser, setSavingUser] = useState(false);

  // Reset password dialog
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [resetPwCompanyId, setResetPwCompanyId] = useState('');
  const [resetPwValue, setResetPwValue] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuCompany, setMenuCompany] = useState<Company | null>(null);

  /* ─── Fetch companies ─────────────────────────────────────────────── */
  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/platform-admin/companies');
      const data = Array.isArray(res.data?.data) ? res.data.data : Array.isArray(res.data) ? res.data : [];
      setCompanies(data);
    } catch (err) {
      console.error('Failed to load companies:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  useEffect(() => {
    const navState = location.state as { companyId?: string; mode?: 'view' | 'edit' } | null;
    if (!navState?.companyId || companies.length === 0) return;

    const targetCompany = companies.find((company) => company.id === navState.companyId);
    if (!targetCompany) return;

    if (navState.mode === 'edit') {
      handleOpen(targetCompany);
    } else {
      openDetail(targetCompany);
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [companies, location.pathname, location.state, navigate]);

  /* ─── Open create/edit dialog ─────────────────────────────────────── */
  const handleOpen = (company?: Company) => {
    if (company) {
      setEditId(company.id);
      setForm({
        company_name: company.name || '',
        admin_name: '',
        admin_email: '',
        admin_password: '',
        email: company.email || '',
        phone: company.phone || '',
        address: company.address || '',
        plan: company.plan || 'starter',
        custom_user_limit: company.user_limit || 20,
        subscription_start_date: company.subscription_start_date || '',
        subscription_end_date: company.subscription_end_date || '',
      });
      setInitialUsers([]);
      setLogoFile(null);
      const base = (api.defaults.baseURL || '').replace('/api', '');
      setLogoPreview(company.logo_data || (company.logo_url ? `${base}${company.logo_url}` : null));
    } else {
      setEditId(null);
      setForm(emptyForm);
      setInitialUsers([]);
      setLogoFile(null);
      setLogoPreview(null);
    }
    setDialogOpen(true);
  };

  /* ─── Save company ────────────────────────────────────────────────── */
  const handleSave = async () => {
    setSaving(true);
    try {
      if (editId) {
        const formData = new FormData();
        formData.append('company_name', form.company_name);
        formData.append('email', form.email);
        formData.append('phone', form.phone);
        formData.append('address', form.address);
        formData.append('plan', form.plan);
        formData.append('user_limit', String(form.plan === 'enterprise' ? form.custom_user_limit : (PLAN_CONFIG[form.plan]?.limit || 5)));
        if (form.subscription_start_date) formData.append('subscription_start_date', form.subscription_start_date);
        if (form.subscription_end_date) formData.append('subscription_end_date', form.subscription_end_date);
        if (logoFile) formData.append('logo', logoFile);
        // If logo was removed (preview is null and no new file), send empty logo_url
        if (!logoPreview && !logoFile) formData.append('logo_url', '');
        await api.put(`/platform-admin/companies/${editId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setToast({ message: 'Company updated', severity: 'success' });
      } else {
        const formData = new FormData();
        formData.append('company_name', form.company_name);
        formData.append('admin_name', form.admin_name);
        formData.append('admin_email', form.admin_email);
        formData.append('admin_password', form.admin_password);
        formData.append('email', form.email || form.admin_email);
        formData.append('phone', form.phone);
        formData.append('address', form.address);
        formData.append('plan', form.plan);
        if (form.plan === 'enterprise') formData.append('custom_user_limit', String(form.custom_user_limit));
        formData.append('subscription_start_date', form.subscription_start_date);
        formData.append('subscription_end_date', form.subscription_end_date);
        if (logoFile) formData.append('logo', logoFile);
        if (initialUsers.filter(u => u.email).length > 0) {
          formData.append('initial_users', JSON.stringify(initialUsers.filter(u => u.email)));
        }
        await api.post('/platform-admin/companies', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        setToast({ message: 'Company created successfully', severity: 'success' });
      }
      setDialogOpen(false);
      fetchCompanies();
      // Refresh detail view if we're editing the currently viewed company
      if (editId && detailCompany?.id === editId) {
        const updated = await api.get('/platform-admin/companies');
        const data = Array.isArray(updated.data?.data) ? updated.data.data : Array.isArray(updated.data) ? updated.data : [];
        const found = data.find((co: Company) => co.id === editId);
        if (found) setDetailCompany(found);
      }
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Operation failed', severity: 'error' });
      console.log(err.response);
      console.log(err.response?.data?.message);
    } finally {
      setSaving(false);
    }
  };

  /* ─── Toggle active ───────────────────────────────────────────────── */
  const handleToggleActive = async (company: Company) => {
    try {
      const endpoint = company.is_active ? 'deactivate' : 'activate';
      await api.post(`/platform-admin/companies/${company.id}/${endpoint}`);
      setToast({ message: `Company ${company.is_active ? 'deactivated' : 'activated'}`, severity: 'success' });
      fetchCompanies();
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed', severity: 'error' });
    }
  };

  /* ─── Reset password ──────────────────────────────────────────────── */
  const openResetPw = (companyId: string) => {
    setResetPwCompanyId(companyId);
    setResetPwValue('');
    setResetPwOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetPwValue || resetPwValue.length < 6) {
      setToast({ message: 'Password must be at least 6 characters', severity: 'error' });
      return;
    }
    try {
      await api.post(`/platform-admin/companies/${resetPwCompanyId}/reset-password`, { password: resetPwValue });
      setToast({ message: 'Admin password reset successfully', severity: 'success' });
      setResetPwOpen(false);
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed', severity: 'error' });
    }
  };

  /* ─── Delete company ──────────────────────────────────────────────── */
  const handleDeleteCompany = async (companyId: string) => {
    if (!window.confirm('Are you sure you want to delete this company? This action cannot be undone.')) return;
    try {
      await api.delete(`/platform-admin/companies/${companyId}`);
      setToast({ message: 'Company deleted', severity: 'success' });
      fetchCompanies();
      if (detailCompany?.id === companyId) setDetailCompany(null);
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed', severity: 'error' });
    }
  };

  const handleEnterCompany = async (company: Company) => {
    try {
      const res = await api.post(`/platform-admin/companies/${company.id}/enter`);
      const selected = res.data?.data;
      setActiveCompanyContext({
        id: selected?.id || company.id,
        name: selected?.name || company.name,
        company_code: selected?.company_code || company.company_code || null,
        plan: selected?.plan || company.plan || null,
        owner_name: selected?.owner?.name || company.owner?.name || null,
      });
      // Open Forge working dashboard in a new tab with impersonation
      if (selected?.impersonation_token) {
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
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed to enter company', severity: 'error' });
    }
  };

  /* ─── View company detail ─────────────────────────────────────────── */
  const openDetail = async (company: Company) => {
    setDetailCompany(company);
    setDetailTab(0);
    setLoadingDetail(true);
    try {
      const [usersRes, activityRes] = await Promise.all([
        api.get(`/platform-admin/companies/${company.id}/users`),
        api.get(`/platform-admin/companies/${company.id}/activity`),
      ]);
      const usersData = usersRes.data?.data || {};
      setCompanyUsers(usersData.users || []);
      setCompanyUserLimit(usersData.user_limit || 5);
      setCompanyActivity(activityRes.data?.data || null);
    } catch (err) {
      console.error('Failed to load company detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  /* ─── Add user to company ─────────────────────────────────────────── */
  const handleAddUser = async () => {
    if (!detailCompany) return;
    setSavingUser(true);
    try {
      await api.post(`/platform-admin/companies/${detailCompany.id}/users`, newUser);
      setToast({ message: 'User added successfully', severity: 'success' });
      setAddUserOpen(false);
      setNewUser({ name: '', email: '', role: 'user', password: '', send_invite: false });
      const res = await api.get(`/platform-admin/companies/${detailCompany.id}/users`);
      setCompanyUsers(res.data?.data?.users || []);
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed to add user', severity: 'error' });
    } finally {
      setSavingUser(false);
    }
  };

  /* ─── Delete user from company ────────────────────────────────────── */
  const handleDeleteUser = async (userId: string) => {
    if (!detailCompany) return;
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    try {
      await api.delete(`/platform-admin/companies/${detailCompany.id}/users/${userId}`);
      setToast({ message: 'User deleted', severity: 'success' });
      setCompanyUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed', severity: 'error' });
    }
  };

  /* ─── Toggle user active ──────────────────────────────────────────── */
  const handleToggleUserActive = async (user: CompanyUser) => {
    if (!detailCompany) return;
    try {
      await api.put(`/platform-admin/companies/${detailCompany.id}/users/${user.id}`, { is_active: !user.is_active });
      setCompanyUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed', severity: 'error' });
    }
  };

  /* ─── Initial users for create form ───────────────────────────────── */
  const addInitialUser = () => setInitialUsers(prev => [...prev, { ...emptyUser }]);
  const removeInitialUser = (i: number) => setInitialUsers(prev => prev.filter((_, idx) => idx !== i));
  const updateInitialUser = (i: number, field: keyof InitialUser, val: any) => {
    setInitialUsers(prev => prev.map((u, idx) => idx === i ? { ...u, [field]: val } : u));
  };

  const statusColor = (status?: string) => {
    switch (status) {
      case 'active': return 'success';
      case 'expired': return 'error';
      default: return 'default';
    }
  };

  const planLabel = (plan?: string) => PLAN_CONFIG[plan || '']?.label || plan || 'N/A';

  const userLimitMax = form.plan === 'enterprise' ? form.custom_user_limit : (PLAN_CONFIG[form.plan]?.limit || 5);

  /* ═══════════════════════════════════════════════════════════════════
     RENDER: Company Detail View
     ═══════════════════════════════════════════════════════════════════ */
  if (detailCompany) {
    const detailBaseUrl = (api.defaults.baseURL || '').replace('/api', '');
    return (
      <Box>
        <Button startIcon={<BackIcon />} onClick={() => setDetailCompany(null)} sx={{ mb: 2 }}>
          Back to Companies
        </Button>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
              src={detailCompany.logo_data || (detailCompany.logo_url ? `${detailBaseUrl}${detailCompany.logo_url}` : undefined)}
              sx={{ width: 48, height: 48, bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY, fontSize: '1.2rem', fontWeight: 700 }}
            >
              {!detailCompany.logo_data && !detailCompany.logo_url && (detailCompany.name || '?').charAt(0).toUpperCase()}
            </Avatar>
            <Box>
              <Typography variant="h5" fontWeight={700}>{detailCompany.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                Code: {detailCompany.company_code || 'No data'} &bull; Plan: {planLabel(detailCompany.plan)} &bull; Limit: {detailCompany.user_limit} users
              </Typography>
            </Box>
          </Box>
          <Chip
            size="small"
            label={detailCompany.is_active ? 'Active' : 'Inactive'}
            sx={{
              bgcolor: detailCompany.is_active ? alpha('#16A34A', 0.1) : alpha('#EF4444', 0.1),
              color: detailCompany.is_active ? '#16A34A' : '#EF4444', fontWeight: 600,
            }}
          />
        </Box>

        <Tabs value={detailTab} onChange={(_, v) => setDetailTab(v)} sx={{ mb: 2 }}>
          <Tab label="Users" />
          <Tab label="Activity" />
        </Tabs>

        {loadingDetail ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
        ) : detailTab === 0 ? (
          /* ── Users Tab ── */
          <Card sx={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0' }}>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Users ({companyUsers.length} / {companyUserLimit})
              </Typography>
              <Button
                size="small" variant="contained" startIcon={<PersonAddIcon />}
                onClick={() => { setNewUser({ name: '', email: '', role: 'user', password: '', send_invite: false }); setAddUserOpen(true); }}
                disabled={companyUsers.length >= companyUserLimit}
                sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#166354' } }}
              >
                Add User
              </Button>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Last Login</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {companyUsers.length === 0 ? (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.secondary' }}>No users</TableCell></TableRow>
                  ) : companyUsers.map(u => (
                    <TableRow key={u.id} hover>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Chip size="small" label={ROLES.find(r => r.value === u.role)?.label || u.role}
                          sx={{ bgcolor: u.role === 'admin' ? alpha(PRIMARY, 0.1) : alpha('#1F7A63', 0.1),
                                color: u.role === 'admin' ? PRIMARY : '#1F7A63', fontWeight: 600 }} />
                      </TableCell>
                      <TableCell>
                        <Chip size="small"
                          label={u.invite_status === 'pending' ? 'Invite Pending' : u.is_active ? 'Active' : 'Inactive'}
                          color={u.invite_status === 'pending' ? 'warning' : u.is_active ? 'success' : 'default'} />
                      </TableCell>
                      <TableCell>{u.last_login ? dayjs(u.last_login).format('MMM D, YYYY h:mm A') : 'No data'}</TableCell>
                      <TableCell align="right">
                        <Tooltip title={u.is_active ? 'Deactivate' : 'Activate'}>
                          <IconButton size="small" onClick={() => handleToggleUserActive(u)}>
                            {u.is_active ? <DeactivateIcon fontSize="small" color="error" /> : <ActivateIcon fontSize="small" color="success" />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete User">
                          <IconButton size="small" onClick={() => handleDeleteUser(u.id)} color="error">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        ) : (
          /* ── Activity Tab ── */
          <Box>
            {companyActivity ? (
              <Grid container spacing={2}>
                {[
                  { label: 'Total Users', value: companyActivity.total_users },
                  { label: 'Active Users', value: companyActivity.active_users },
                  { label: 'Inactive Users', value: companyActivity.inactive_users },
                  { label: 'Recently Active (30d)', value: companyActivity.recently_active },
                  { label: 'User Limit', value: companyActivity.user_limit },
                  { label: 'Plan', value: planLabel(companyActivity.plan) },
                  { label: 'Subscription', value: companyActivity.subscription_status || 'N/A' },
                  { label: 'Expires', value: companyActivity.subscription_end_date ? dayjs(companyActivity.subscription_end_date).format('MMM D, YYYY') : 'N/A' },
                  { label: 'Storage Used', value: `${(companyActivity.storage_used_mb || 0).toFixed(1)} MB` },
                  { label: 'Last Activity', value: companyActivity.last_activity_at ? dayjs(companyActivity.last_activity_at).format('MMM D, YYYY h:mm A') : 'N/A' },
                ].map((item, i) => (
                  <Grid item xs={6} sm={4} md={3} key={i}>
                    <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #E2E8F0' }}>
                      <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                      <Typography variant="h6" fontWeight={700}>{item.value}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Typography color="text.secondary">No activity data</Typography>
            )}
          </Box>
        )}

        {/* Add User Dialog */}
        <Dialog open={addUserOpen} onClose={() => setAddUserOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Add User to {detailCompany.name}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
            <TextField label="Name" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} fullWidth />
            <TextField label="Email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required fullWidth />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select value={newUser.role} label="Role" onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                {ROLES.map(r => (
                  <MenuItem key={r.value} value={r.value}>
                    <Box>
                      <Typography variant="body2">{r.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.desc}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={<Switch checked={newUser.send_invite} onChange={e => setNewUser({ ...newUser, send_invite: e.target.checked })} />}
              label="Send email invite (user sets own password)"
            />
            {!newUser.send_invite && (
              <TextField label="Password" type="password" value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })} required fullWidth />
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setAddUserOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleAddUser} disabled={savingUser || !newUser.email}
              sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#166354' } }}>
              {savingUser ? <CircularProgress size={20} /> : 'Add User'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Toast */}
        <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
          {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
        </Snackbar>
      </Box>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     RENDER: Companies List
     ═══════════════════════════════════════════════════════════════════ */

  const baseUrl = (api.defaults.baseURL || '').replace('/api', '');
  const filteredCompanies = companies.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.company_code || '').toLowerCase().includes(search.toLowerCase()));

  // Compute stats from loaded companies
  const totalCompanies = companies.length;
  const activeCompanies = companies.filter(c => c.is_active).length;
  const inactiveCompanies = companies.filter(c => !c.is_active).length;
  const totalUsers = companies.reduce((sum, c) => sum + (c.userCount || 0), 0);
  const expiringSoon = companies.filter(c => {
    if (!c.subscription_end_date) return false;
    const daysLeft = dayjs(c.subscription_end_date).diff(dayjs(), 'day');
    return daysLeft >= 0 && daysLeft <= 30;
  }).length;

  return (
    <Box>
      {/* ── Stat Cards ── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { title: 'Total Companies', value: totalCompanies, icon: <BusinessIcon />, color: PRIMARY },
          { title: 'Active', value: activeCompanies, icon: <ActivateIcon />, color: '#16A34A' },
          { title: 'Expiring Soon', value: expiringSoon, icon: <WarningIcon />, color: '#f59e0b' },
        ].map((s, i) => (
          <Grid item xs={6} sm={4} md key={i}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: alpha('#000', 0.05), borderRadius: 3, transition: 'all 0.25s ease', '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } }}>
              <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.title}</Typography>
                    <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, mt: 0.5, color: s.color, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</Typography>
                  </Box>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2.5, bgcolor: alpha(s.color, 0.08), display: 'flex', alignItems: 'center', justifyContent: 'center', '& .MuiSvgIcon-root': { fontSize: 20, color: s.color } }}>
                    {s.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* ── Toolbar ── */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: '#94a3b8' }} /></InputAdornment> }}
          sx={{ minWidth: 240 }} />
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<RefreshIcon />} onClick={fetchCompanies}>Refresh</Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}
          sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DARK } }}>
          Add Company
        </Button>
      </Box>

      {/* ── Companies Table ── */}
      <Card sx={{ borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 1100 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: alpha(PRIMARY, 0.04) }}>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap', minWidth: 160 }}>Company</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap', minWidth: 140 }}>Owner</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Code</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Plan</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap', minWidth: 90 }}>Users</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Subscription</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Expires</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>Last Activity</TableCell>
                <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap', position: 'sticky', right: 0, bgcolor: alpha(PRIMARY, 0.04), zIndex: 1 }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              ) : filteredCompanies.length === 0 ? (
                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                  <BusinessIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1, display: 'block', mx: 'auto' }} />
                  <Typography color="text.secondary">{search ? 'No matching companies' : 'No companies found'}</Typography>
                </TableCell></TableRow>
              ) : filteredCompanies.map((c) => {
                const usagePercent = c.user_limit ? Math.min(((c.userCount || 0) / c.user_limit) * 100, 100) : 0;
                const isOverLimit = (c.userCount || 0) >= (c.user_limit || Infinity);
                const planColor = PLAN_COLORS[c.plan || ''] || '#6B7280';
                return (
                <TableRow key={c.id} hover sx={{ '&:hover': { bgcolor: alpha(PRIMARY, 0.02) } }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar
                        src={c.logo_data || (c.logo_url ? `${baseUrl}${c.logo_url}` : undefined)}
                        sx={{ width: 36, height: 36, bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY, fontSize: '0.85rem', fontWeight: 700 }}
                      >
                        {!c.logo_data && !c.logo_url && (c.name || '?').charAt(0).toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{c.name}</Typography>
                        {c.email && <Typography variant="caption" color="text.secondary">{c.email}</Typography>}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {c.owner ? (
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{c.owner.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{c.owner.email}</Typography>
                      </Box>
                    ) : (
                      <Typography variant="caption" sx={{ color: '#D97706', fontWeight: 500 }}>No Owner Assigned</Typography>
                    )}
                  </TableCell>
                  <TableCell><Chip size="small" label={c.company_code || 'No data'} variant="outlined" sx={{ fontWeight: 600, fontSize: '0.75rem' }} /></TableCell>
                  <TableCell>
                    <Chip size="small" label={planLabel(c.plan)}
                      sx={{ bgcolor: alpha(planColor, 0.1), color: planColor, fontWeight: 600, fontSize: '0.7rem', height: 24 }} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={500}>{c.userCount ?? 0} of {c.user_limit ?? 'N/A'} used</Typography>
                    {c.user_limit && (
                      <LinearProgress variant="determinate" value={usagePercent}
                        sx={{ height: 4, borderRadius: 2, mt: 0.5, bgcolor: alpha('#000', 0.06),
                          '& .MuiLinearProgress-bar': { bgcolor: isOverLimit ? '#dc2626' : PRIMARY, borderRadius: 2 } }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={c.subscription_status || 'N/A'} color={statusColor(c.subscription_status) as any} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{c.subscription_end_date ? dayjs(c.subscription_end_date).format('MMM D, YYYY') : 'No data'}</Typography>
                    {c.subscription_end_date && (() => {
                      const daysLeft = dayjs(c.subscription_end_date).diff(dayjs(), 'day');
                      if (daysLeft < 0) return <Typography variant="caption" color="error">Expired</Typography>;
                      if (daysLeft <= 30) return <Typography variant="caption" sx={{ color: '#f59e0b' }}>{daysLeft}d left</Typography>;
                      return null;
                    })()}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={c.is_active ? 'Active' : 'Inactive'}
                      icon={c.is_active ? <ActivateIcon sx={{ fontSize: 14 }} /> : <DeactivateIcon sx={{ fontSize: 14 }} />}
                      sx={{ bgcolor: c.is_active ? alpha('#16A34A', 0.1) : alpha('#EF4444', 0.1),
                            color: c.is_active ? '#16A34A' : '#EF4444', fontWeight: 600, fontSize: '0.7rem', height: 24,
                            '& .MuiChip-icon': { color: 'inherit' } }} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {c.last_activity_at ? dayjs(c.last_activity_at).format('MMM D, YYYY') : 'No data'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ position: 'sticky', right: 0, bgcolor: 'background.paper', zIndex: 1, borderLeft: '1px solid #E2E8F0' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<EnterCompanyIcon sx={{ fontSize: 16 }} />}
                        onClick={() => handleEnterCompany(c)}
                        disabled={!c.is_active}
                        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap', borderColor: PRIMARY, color: PRIMARY, '&:hover': { bgcolor: alpha(PRIMARY, 0.06) } }}
                      >
                        Enter
                      </Button>
                      <IconButton size="small" onClick={(e) => { setMenuAnchor(e.currentTarget); setMenuCompany(c); }}>
                        <MoreIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* ── 3-dot Menu ── */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => { setMenuAnchor(null); setMenuCompany(null); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { minWidth: 180, borderRadius: 2, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' } }}
      >
        <MenuItem onClick={() => { if (menuCompany) openDetail(menuCompany); setMenuAnchor(null); setMenuCompany(null); }}>
          <ListItemIcon><ViewIcon fontSize="small" sx={{ color: PRIMARY }} /></ListItemIcon>
          <ListItemText>View Details</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (menuCompany) handleOpen(menuCompany); setMenuAnchor(null); setMenuCompany(null); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (menuCompany) handleToggleActive(menuCompany); setMenuAnchor(null); setMenuCompany(null); }}>
          <ListItemIcon>{menuCompany?.is_active ? <DeactivateIcon fontSize="small" color="error" /> : <ActivateIcon fontSize="small" color="success" />}</ListItemIcon>
          <ListItemText>{menuCompany?.is_active ? 'Deactivate' : 'Activate'}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (menuCompany) openResetPw(menuCompany.id); setMenuAnchor(null); setMenuCompany(null); }}>
          <ListItemIcon><ResetIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Reset Password</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => { if (menuCompany) handleDeleteCompany(menuCompany.id); setMenuAnchor(null); setMenuCompany(null); }} sx={{ color: '#EF4444' }}>
          <ListItemIcon><DeleteIcon fontSize="small" sx={{ color: '#EF4444' }} /></ListItemIcon>
          <ListItemText>Delete Company</ListItemText>
        </MenuItem>
      </Menu>

      {/* ── Create / Edit Company Dialog ── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ textAlign: 'center', fontWeight: 700, pb: 0 }}>{editId ? 'Edit Company' : 'Add New Company'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>

          {/* ── Logo Upload Section (click, drag-and-drop, paste) ── */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, mb: 1 }}>
            <Box
              sx={{
                position: 'relative',
                width: 96, height: 96,
                borderRadius: '50%',
                border: `2px dashed ${alpha(PRIMARY, 0.4)}`,
                bgcolor: alpha(PRIMARY, 0.05),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                '&:hover': { borderColor: PRIMARY, bgcolor: alpha(PRIMARY, 0.1) },
                overflow: 'hidden',
              }}
              onClick={() => document.getElementById('company-logo-input')?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDragEnter={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => {
                e.preventDefault(); e.stopPropagation();
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('image/')) { setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); }
              }}
              onPaste={e => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.startsWith('image/')) {
                    const file = items[i].getAsFile();
                    if (file) { setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); }
                    break;
                  }
                }
              }}
              tabIndex={0}
            >
              {logoPreview ? (
                <Box component="img" src={logoPreview} alt="Logo" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <UploadIcon sx={{ fontSize: 32, color: PRIMARY }} />
              )}
              {logoPreview && (
                <IconButton
                  size="small"
                  onClick={e => { e.stopPropagation(); setLogoFile(null); setLogoPreview(null); }}
                  sx={{ position: 'absolute', top: -2, right: -2, bgcolor: 'var(--bg-surface)', border: '1px solid var(--border)', '&:hover': { bgcolor: 'rgba(248,113,113,0.18)' } }}
                >
                  <CancelLogoIcon sx={{ fontSize: 16, color: '#EF4444' }} />
                </IconButton>
              )}
            </Box>
            <Typography
              variant="caption" color="primary" sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
              onClick={() => document.getElementById('company-logo-input')?.click()}
            >
              {logoPreview ? 'Click to replace' : 'Upload logo'}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', mt: -0.5 }}>
              Drag & drop, paste, or click to upload
            </Typography>
            <input
              id="company-logo-input"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              hidden
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) { setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); }
                e.target.value = '';
              }}
            />
          </Box>

          {/* Company Name */}
          <TextField label="Company Name" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} required fullWidth />

          {!editId && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
              Company Code will be auto-generated (e.g. CMP-0001)
            </Typography>
          )}

          {/* Email + Phone side by side */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} fullWidth />
            <TextField label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} fullWidth />
          </Box>

          {/* Address */}
          <TextField label="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} fullWidth multiline rows={2} />

          {/* Plan + User Limit side by side */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Plan</InputLabel>
              <Select value={form.plan} label="Plan" onChange={e => setForm({ ...form, plan: e.target.value })}>
                {Object.entries(PLAN_CONFIG).map(([key, cfg]) => (
                  <MenuItem key={key} value={key}>{cfg.label} — {cfg.desc}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {form.plan === 'enterprise' ? (
              <TextField label="User Limit" type="number" value={form.custom_user_limit}
                onChange={e => setForm({ ...form, custom_user_limit: Math.max(1, parseInt(e.target.value) || 1) })}
                inputProps={{ min: 1 }} fullWidth />
            ) : (
              <TextField label="User Limit" value={PLAN_CONFIG[form.plan]?.limit || 5} InputProps={{ readOnly: true }} fullWidth />
            )}
          </Box>

          {/* Subscription dates */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Subscription Start" type="date" value={form.subscription_start_date}
              onChange={e => setForm({ ...form, subscription_start_date: e.target.value })}
              InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Subscription End" type="date" value={form.subscription_end_date}
              onChange={e => setForm({ ...form, subscription_end_date: e.target.value })}
              InputLabelProps={{ shrink: true }} fullWidth />
          </Box>

          {/* Admin account — only for create */}
          {!editId && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>COMPANY ADMIN ACCOUNT</Typography>
              <TextField label="Admin Name" value={form.admin_name} onChange={e => setForm({ ...form, admin_name: e.target.value })} required fullWidth />
              <TextField label="Admin Email" value={form.admin_email} onChange={e => setForm({ ...form, admin_email: e.target.value })} required fullWidth />
              <TextField label="Admin Password" type="password" value={form.admin_password} onChange={e => setForm({ ...form, admin_password: e.target.value })} required fullWidth />
            </>
          )}

          {/* Initial users — only for create */}
          {!editId && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={600}>ADDITIONAL USERS (Optional)</Typography>
                <Button size="small" startIcon={<PersonAddIcon />} onClick={addInitialUser}
                  disabled={initialUsers.length >= (userLimitMax - 1)}>
                  Add User
                </Button>
              </Box>

              {initialUsers.map((u, i) => (
                <Paper key={i} sx={{ p: 2, border: '1px solid #E2E8F0', borderRadius: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" fontWeight={600}>User {i + 1}</Typography>
                    <IconButton size="small" onClick={() => removeInitialUser(i)} color="error"><DeleteIcon fontSize="small" /></IconButton>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField size="small" label="Name" value={u.name} onChange={e => updateInitialUser(i, 'name', e.target.value)} fullWidth />
                    <TextField size="small" label="Email" value={u.email} onChange={e => updateInitialUser(i, 'email', e.target.value)} required fullWidth />
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel>Role</InputLabel>
                      <Select value={u.role} label="Role" onChange={e => updateInitialUser(i, 'role', e.target.value)}>
                        {ROLES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <FormControlLabel
                      control={<Switch size="small" checked={u.send_invite} onChange={e => updateInitialUser(i, 'send_invite', e.target.checked)} />}
                      label={<Typography variant="caption">Send Invite</Typography>}
                    />
                    {!u.send_invite && (
                      <TextField size="small" label="Password" type="password" value={u.password}
                        onChange={e => updateInitialUser(i, 'password', e.target.value)} sx={{ flex: 1 }} />
                    )}
                  </Box>
                </Paper>
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setDialogOpen(false)} variant="outlined" sx={{ borderColor: '#E2E8F0', color: '#64748B' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.company_name || (!editId && (!form.admin_email || !form.admin_password))}
            sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DARK } }}>
            {saving ? <CircularProgress size={20} /> : editId ? 'Save Changes' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Reset Password Dialog ── */}
      <Dialog open={resetPwOpen} onClose={() => setResetPwOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset Admin Password</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField label="New Password" type="password" value={resetPwValue}
            onChange={e => setResetPwValue(e.target.value)} fullWidth autoFocus
            helperText="Minimum 6 characters" />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResetPwOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleResetPassword} disabled={resetPwValue.length < 6}
            sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#166354' } }}>
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
};

export default PlatformCompaniesPage;
