import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Button, IconButton, TextField, MenuItem, Select,
  FormControl, InputLabel, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TablePagination, Checkbox, Chip,
  Avatar, Dialog, DialogTitle, DialogContent, DialogActions, Grid, Card,
  CardContent, InputAdornment, Tooltip, Divider, Alert, Snackbar, Switch,
  FormControlLabel, Paper, SelectChangeEvent, alpha,
  LinearProgress, Breadcrumbs, Link, Stack, Skeleton, CircularProgress,
} from '@mui/material';
import {
  PersonAdd as PersonAddIcon,
  Search as SearchIcon,
  Download as DownloadIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  LockReset as LockResetIcon,
  Visibility as ViewIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
  Group as GroupIcon,
  Shield as ShieldIcon,
  Security as SecurityIcon,
  Business as BusinessIcon,
  Block as BlockIcon,
  PlayArrow as ReactivateIcon,
  Warning as WarningIcon,
  TrendingUp as TrendingUpIcon,
  People as PeopleIcon,
  AdminPanelSettings as AdminPanelIcon,
  ContentCopy as CloneIcon,
  Assignment as TemplateIcon,
  History as HistoryIcon,
  Lock as LockIcon,
  NavigateNext as BreadcrumbSep,
  Home as HomeIcon,
  CloudUpload as ImportIcon,
  Email as InviteIcon,
  Upgrade as UpgradeIcon,
  Speed as SpeedIcon,
  SupervisorAccount as CoAdminIcon,
  VpnKey as OtpIcon,
  VerifiedUser as VerifiedIcon,
  Settings as SettingsIcon,
  VisibilityOff as VisibilityOffIcon,
  AddAPhoto as AddAPhotoIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { getCreatableRoles } from '../config/rolePermissions';
import { useNavigate, useLocation } from 'react-router-dom';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AccessControlProps {
  section: 'users' | 'admins' | 'co-admins' | 'companies' | 'roles' | 'templates' | 'audit-logs' | 'security';
}

interface UserRecord {
  id: string; name: string; email: string; role: 'main_admin' | 'admin' | 'user' | 'sales_engineer';
  is_active: boolean; phone?: string; modules?: string[]; module_permissions?: Record<string, { read: boolean; write: boolean; admin: boolean }>;
  company_id?: string; company_name?: string; company?: { id: string; name: string };
  created_by?: string; creator?: { id: string; name: string; role?: string };
  created_at: string; last_login?: string; department?: string; tags?: string[];
  last_login_ip?: string; last_login_device?: string; failed_login_attempts?: number;
  locked_until?: string; two_factor_enabled?: boolean; force_password_reset?: boolean;
  invited_at?: string; invite_status?: string;
}

interface CompanyRecord {
  id: string; name: string; email?: string; phone?: string; address?: string;
  website?: string; tax_id?: string;
  is_active: boolean; user_limit: number; plan: string; logo_url?: string; logo_data?: string;
  suspended_at?: string; suspension_reason?: string; risk_flags: string[];
  storage_used_mb: number; last_activity_at?: string; created_at: string;
  user_count: number; admin_count: number; active_user_count: number;
  admin?: { id: string; name: string };
}

interface AuditLogRecord {
  id: string; action: string; entity_type: string; entity_id: string;
  entity_name: string; performed_by: string; performer_name: string;
  performer_role: string; details: Record<string, unknown>;
  ip_address?: string; created_at: string;
}

interface PermTemplateRecord {
  id: string; name: string; description?: string;
  permissions: Record<string, { read: boolean; write: boolean; admin: boolean }>;
  company_id?: string; creator?: { id: string; name: string };
  is_global: boolean; created_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PRIMARY = '#1F7A63';

const PRIMARY_DARK = '#1F7A63';
const BLUE = '#0D3D2F';
const GREEN = '#1F7A63';

const ROLE_COLORS: Record<string, string> = { main_admin: '#2A9D7E', admin: BLUE, sales_engineer: '#F59E0B', user: GREEN };
const ROLE_LABELS: Record<string, string> = { main_admin: 'Super Admin', admin: 'Admin', sales_engineer: 'Sales Engineer', user: 'Member' };
const PLAN_COLORS: Record<string, string> = { free: '#6B7280', starter: PRIMARY, professional: BLUE, enterprise: '#2A9D7E' };

const ALL_MODULES = ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings'];

function roleBadge(role: string) {
  return (
    <Chip label={ROLE_LABELS[role] || role} size="small"
      sx={{ bgcolor: alpha(ROLE_COLORS[role] || '#6B7280', 0.1), color: ROLE_COLORS[role] || '#6B7280', fontWeight: 600, fontSize: '0.7rem', height: 24 }} />
  );
}

function statusChip(active: boolean) {
  return active
    ? <Chip icon={<ActiveIcon sx={{ fontSize: 14 }} />} label="Active" size="small" sx={{ bgcolor: alpha('#1F7A63', 0.1), color: '#1F7A63', fontWeight: 600, fontSize: '0.7rem', height: 24 }} />
    : <Chip icon={<InactiveIcon sx={{ fontSize: 14 }} />} label="Inactive" size="small" sx={{ bgcolor: alpha('#dc2626', 0.1), color: '#dc2626', fontWeight: 600, fontSize: '0.7rem', height: 24 }} />;
}

function planChip(plan: string) {
  return <Chip label={plan?.charAt(0).toUpperCase() + plan?.slice(1)} size="small"
    sx={{ bgcolor: alpha(PLAN_COLORS[plan] || '#6B7280', 0.1), color: PLAN_COLORS[plan] || '#6B7280', fontWeight: 600, fontSize: '0.7rem', height: 24 }} />;
}

function riskBadge(flags: string[]) {
  if (!flags?.length) return null;
  return (
    <Stack direction="row" spacing={0.5}>
      {flags.map(f => (
        <Chip key={f} label={f.replace(/_/g, ' ')} size="small"
          sx={{ bgcolor: alpha('#dc2626', 0.1), color: '#dc2626', fontWeight: 500, fontSize: '0.65rem', height: 20 }}
          icon={<WarningIcon sx={{ fontSize: 12, color: '#dc2626' }} />} />
      ))}
    </Stack>
  );
}

function fmtDate(d: string | undefined | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(d: string | undefined | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatCard({ title, value, icon, color, sub }: { title: string; value: number | string; icon: React.ReactNode; color: string; sub?: string }) {
  return (
    <Card elevation={0} className="hover-lift" sx={{ border: '1px solid', borderColor: 'var(--border)', borderRadius: 3, bgcolor: 'var(--bg-surface)', transition: 'all 0.25s ease' }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Typography>
            <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, mt: 0.5, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</Typography>
            {sub && <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', mt: 0.5 }}>{sub}</Typography>}
          </Box>
          <Box sx={{ width: 40, height: 40, borderRadius: 2.5, bgcolor: alpha(color, 0.08), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{React.cloneElement(icon as React.ReactElement, { sx: { fontSize: 20, color } })}</Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

const AccessControlCenter: React.FC<AccessControlProps> = ({ section }) => {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  useLocation();

  // Shared state
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });
  const [search, setSearch] = useState('');

  // Users state
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // Company state (Super Admin)
  const [companyStats, setCompanyStats] = useState<any>(null);
  const [companyList, setCompanyList] = useState<CompanyRecord[]>([]);

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditAction, setAuditAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Permission templates
  const [templates, setTemplates] = useState<PermTemplateRecord[]>([]);

  // Dialogs
  const [userDialog, setUserDialog] = useState(false);
  const [editUser, setEditUser] = useState<UserRecord | null>(null);
  const [viewUser, setViewUser] = useState<UserRecord | null>(null);
  const [companyDialog, setCompanyDialog] = useState(false);
  const [editCompany, setEditCompany] = useState<CompanyRecord | null>(null);
  const [suspendDialog, setSuspendDialog] = useState<CompanyRecord | null>(null);
  const [planDialog, setPlanDialog] = useState<CompanyRecord | null>(null);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [editTemplate, setEditTemplate] = useState<PermTemplateRecord | null>(null);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [securityDialog, setSecurityDialog] = useState<UserRecord | null>(null);
  const [loginHistory, setLoginHistory] = useState<any[]>([]);

  // Super Admin creation dialog state
  const [otpDialog, setOtpDialog] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [pendingSuperAdmin, setPendingSuperAdmin] = useState<any>(null);
  const [otpDialogError, setOtpDialogError] = useState('');

  // Co Admin credential slots state
  const [credSlots, setCredSlots] = useState<any[]>([]);
  const [credLoading, setCredLoading] = useState(false);
  const [credDialog, setCredDialog] = useState(false);
  const [credEditSlot, setCredEditSlot] = useState<any>(null);
  const [credForm, setCredForm] = useState<{ name: string; email: string; password: string }>({ name: '', email: '', password: '' });

  // Dynamic co-admin access state (from backend checkAccess)
  const [isCurrentUserOwner, setIsCurrentUserOwner] = useState(false);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [hasCoAdminAccess, setHasCoAdminAccess] = useState(false);

  // Settings dialog state (Role & Ownership Management)
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [ownerInfo, setOwnerInfo] = useState<any>(null);
  const [roleTransferSlot, setRoleTransferSlot] = useState('');
  const [roleTransferEmail, setRoleTransferEmail] = useState('');
  const [roleTransferLoading, setRoleTransferLoading] = useState(false);

  // Form state
  const [form, setForm] = useState<any>({});
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [newPlan, setNewPlan] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [importData, setImportData] = useState('');

  // Logo upload state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const showSnack = (message: string, severity: 'success' | 'error' = 'success') => setSnack({ open: true, message, severity });

  // ─── Data Loaders ────────────────────────────────────────────────────────

  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get('/users', { params: { search } });
      setUsers(res.data?.data || res.data || []);
    } catch { }
  }, [search]);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get('/users/stats');
      setStats(res.data?.data || res.data);
    } catch { }
  }, []);

  const loadCompanies = useCallback(async () => {
    try {
      const res = await api.get('/users/companies');
      setCompanies(res.data?.data || res.data || []);
    } catch { }
  }, []);

  const loadCompanyStats = useCallback(async () => {
    try {
      const res = await api.get('/companies/stats');
      const data = res.data;
      setCompanyStats(data.summary || data);
      setCompanyList(data.companies || []);
    } catch { }
  }, []);

  const loadAuditLogs = useCallback(async () => {
    try {
      const params: any = { page: page + 1, limit: rowsPerPage };
      if (search) params.search = search;
      if (auditAction) params.action = auditAction;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const res = await api.get('/audit-logs', { params });
      const d = res.data;
      setAuditLogs(d.data || d.logs || []);
      setAuditTotal(d.pagination?.total || d.total || 0);
    } catch { }
  }, [page, rowsPerPage, search, auditAction, dateFrom, dateTo]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await api.get('/permission-templates');
      setTemplates(res.data || []);
    } catch { }
  }, []);

  // Auto-load on section change
  useEffect(() => {
    setPage(0);
    setSearch('');
    setSelectedUsers([]);
    setLoading(true);
    const init = async () => {
      if (section === 'users' || section === 'admins' || section === 'security' || section === 'co-admins') {
        await Promise.all([loadUsers(), loadStats(), loadCompanies()]);
      }
      if (section === 'co-admins') {
        await Promise.all([loadCredSlots(), loadCoAdminAccess()]);
      }
      if (section === 'companies') {
        await loadCompanyStats();
      }
      if (section === 'audit-logs') {
        await loadAuditLogs();
      }
      if (section === 'roles' || section === 'templates') {
        await loadTemplates();
      }
      setLoading(false);
    };
    init();
  }, [section]); // eslint-disable-line

  // Reload when search/pagination changes for audit
  useEffect(() => {
    if (section === 'audit-logs') loadAuditLogs();
  }, [page, rowsPerPage, auditAction, dateFrom, dateTo]); // eslint-disable-line

  // Filtered users
  const filteredUsers = users.filter(u => {
    if (section === 'co-admins') return u.role === 'main_admin';
    if (section === 'admins') return u.role === 'admin';
    if (section === 'security') return true;
    return true;
  }).filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleCreateUser = async () => {
    if (!form.password || form.password.length < 6) {
      showSnack('Password is required (minimum 6 characters)', 'error');
      return;
    }
    try {
      await api.post('/users', form);
      showSnack('User created successfully');
      setUserDialog(false); setForm({}); setShowCreatePassword(false);
      loadUsers(); loadStats();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed to create user', 'error');
    }
  };

  const handleUpdateUser = async () => {
    if (!editUser) return;
    try {
      await api.put(`/users/${editUser.id}`, form);
      showSnack('User updated successfully');
      setEditUser(null); setForm({});
      loadUsers(); loadStats();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed to update user', 'error');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('Deactivate this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      showSnack('User deactivated');
      loadUsers(); loadStats();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed', 'error');
    }
  };

  const handleResetPassword = async (id: string) => {
    const pw = window.prompt('Enter new password (min 6 chars):');
    if (!pw || pw.length < 6) return;
    try {
      await api.post(`/users/${id}/reset-password`, { newPassword: pw });
      showSnack('Password reset');
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed', 'error');
    }
  };

  const handleBulkDeactivate = async () => {
    if (!selectedUsers.length || !window.confirm(`Deactivate ${selectedUsers.length} user(s)?`)) return;
    try {
      await api.post('/users/bulk/deactivate', { userIds: selectedUsers });
      showSnack(`${selectedUsers.length} users deactivated`);
      setSelectedUsers([]); loadUsers(); loadStats();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed', 'error');
    }
  };

  const handleInvite = async () => {
    try {
      await api.post('/users/invite', { email: inviteEmail, role: inviteRole });
      showSnack('Invitation sent');
      setInviteDialog(false); setInviteEmail(''); loadUsers();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed', 'error');
    }
  };

  const handleImport = async () => {
    try {
      const lines = importData.trim().split('\n');
      const usersToImport = lines.slice(1).map(line => {
        const [name, email, role, department] = line.split(',').map(s => s.trim());
        return { name, email, role: role || 'user', department };
      });
      const res = await api.post('/users/bulk/import', { users: usersToImport });
      const d = res.data?.data || res.data;
      showSnack(`Imported ${d.created} users. ${d.errors?.length || 0} errors.`);
      setImportDialog(false); setImportData(''); loadUsers(); loadStats();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Import failed', 'error');
    }
  };

  // Company actions (Super Admin)
  const handleCreateCompany = async () => {
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, val]) => { if (val !== undefined && val !== null) formData.append(key, String(val)); });
      if (logoFile) formData.append('logo', logoFile);
      await api.post('/companies', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      showSnack('Company created');
      setCompanyDialog(false); setForm({}); setLogoFile(null); setLogoPreview(null);
      loadCompanyStats();
    } catch (err: any) {
      showSnack(err.response?.data?.message || err.response?.data?.error || 'Failed', 'error');
    }
  };

  const handleUpdateCompany = async () => {
    if (!editCompany) return;
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, val]) => { if (val !== undefined && val !== null) formData.append(key, String(val)); });
      if (logoFile) formData.append('logo', logoFile);
      if (form.remove_logo) formData.append('remove_logo', 'true');
      await api.put(`/companies/${editCompany.id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      showSnack('Company updated');
      setEditCompany(null); setForm({}); setLogoFile(null); setLogoPreview(null);
      loadCompanyStats();
    } catch (err: any) {
      showSnack(err.response?.data?.message || err.response?.data?.error || 'Failed', 'error');
    }
  };

  const handleSuspend = async () => {
    if (!suspendDialog) return;
    try {
      await api.post(`/companies/${suspendDialog.id}/suspend`, { reason: suspendReason });
      showSnack('Company suspended');
      setSuspendDialog(null); setSuspendReason('');
      loadCompanyStats();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed', 'error');
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await api.post(`/companies/${id}/reactivate`);
      showSnack('Company reactivated');
      loadCompanyStats();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed', 'error');
    }
  };

  const handleChangePlan = async () => {
    if (!planDialog || !newPlan) return;
    try {
      await api.post(`/companies/${planDialog.id}/change-plan`, { plan: newPlan });
      showSnack('Plan updated');
      setPlanDialog(null); setNewPlan('');
      loadCompanyStats();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed', 'error');
    }
  };

  // Permission templates
  const handleSaveTemplate = async () => {
    try {
      if (editTemplate) {
        await api.put(`/permission-templates/${editTemplate.id}`, form);
        showSnack('Template updated');
      } else {
        await api.post('/permission-templates', form);
        showSnack('Template created');
      }
      setTemplateDialog(false); setEditTemplate(null); setForm({});
      loadTemplates();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed', 'error');
    }
  };

  const handleCloneTemplate = async (id: string, name: string) => {
    try {
      await api.post(`/permission-templates/${id}/clone`, { name: `${name} (Copy)` });
      showSnack('Template cloned');
      loadTemplates();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed', 'error');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.delete(`/permission-templates/${id}`);
      showSnack('Template deleted');
      loadTemplates();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Failed', 'error');
    }
  };

  // Security actions
  const handleForcePasswordReset = async (userId: string) => {
    try {
      await api.post(`/users/${userId}/force-password-reset`);
      showSnack('Password reset required on next login');
      loadUsers();
    } catch (err: any) { showSnack(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleToggle2FA = async (userId: string, enabled: boolean) => {
    try {
      await api.post(`/users/${userId}/toggle-2fa`, { enabled });
      showSnack(`2FA ${enabled ? 'enabled' : 'disabled'}`);
      loadUsers();
    } catch (err: any) { showSnack(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleLockAccount = async (userId: string) => {
    if (!window.confirm('Lock this account?')) return;
    try {
      await api.post(`/users/${userId}/lock`);
      showSnack('Account locked');
      loadUsers();
    } catch (err: any) { showSnack(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleUnlockAccount = async (userId: string) => {
    try {
      await api.post(`/users/${userId}/unlock`);
      showSnack('Account unlocked');
      loadUsers();
    } catch (err: any) { showSnack(err.response?.data?.message || 'Failed', 'error'); }
  };

  const loadLoginHistory = async (userId: string) => {
    try {
      const res = await api.get(`/users/${userId}/login-history`);
      setLoginHistory(res.data?.data || []);
    } catch { setLoginHistory([]); }
  };

  // CSV Export
  const exportCSV = () => {
    const rows = filteredUsers;
    const hdr = 'Name,Email,Role,Status,Company,Department,Created\n';
    const csv = rows.map(u => `"${u.name}","${u.email}","${u.role}","${u.is_active ? 'Active' : 'Inactive'}","${u.company_name || ''}","${u.department || ''}","${fmtDate(u.created_at)}"`).join('\n');
    const blob = new Blob([hdr + csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `users_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ─── Super Admin Creation Handlers ─────────────────────────────────────

  const handleCreateSuperAdmin = async () => {
    setOtpDialogError('');
    if (!pendingSuperAdmin?.name || !pendingSuperAdmin?.email || !pendingSuperAdmin?.password) {
      setOtpDialogError('Name, email, and password are required.');
      return;
    }
    setOtpLoading(true);
    try {
      console.log('[SuperAdmin] Creating super admin:', pendingSuperAdmin.email);
      const res = await api.post('/co-admin/create-super-admin', {
        name: pendingSuperAdmin.name,
        email: pendingSuperAdmin.email,
        password: pendingSuperAdmin.password,
      });
      console.log('[SuperAdmin] Create response:', res.data);
      showSnack('Super Admin created successfully');
      resetOtpFlow();
      loadUsers();
      loadStats();
    } catch (err: any) {
      console.error('[SuperAdmin] Create failed:', err.response?.data || err.message);
      const msg = err.response?.data?.message || 'Failed to create Super Admin';
      setOtpDialogError(msg);
      showSnack(msg, 'error');
    } finally {
      setOtpLoading(false);
    }
  };

  const resetOtpFlow = () => {
    setOtpDialog(false);
    setOtpLoading(false);
    setPendingSuperAdmin(null);
    setOtpDialogError('');
  };

  const openSuperAdminCreation = () => {
    setPendingSuperAdmin({ name: '', email: '', password: '' });
    setOtpDialog(true);
  };

  // ─── Co Admin Credential Handlers ────────────────────────────────────────

  const loadCredSlots = useCallback(async () => {
    try {
      setCredLoading(true);
      const res = await api.get('/co-admin/credentials');
      setCredSlots(res.data?.data || []);
    } catch { }
    finally { setCredLoading(false); }
  }, []);

  const loadCoAdminAccess = useCallback(async () => {
    try {
      const res = await api.get('/co-admin/check-access');
      const data = res.data?.data || {};
      setHasCoAdminAccess(!!data.isCoAdmin);
      setIsCurrentUserOwner(!!data.isOwner);
      setIsSetupComplete(!!data.isSetupComplete);
    } catch { }
  }, []);

  const openCredUpdate = (slot: any) => {
    setCredEditSlot(slot);
    setCredForm({
      name: slot.user?.name || slot.label,
      email: slot.user?.email || '',
      password: '',
    });
    setCredDialog(true);
  };

  const handleUpdateCred = async () => {
    if (!credEditSlot) return;
    try {
      const body: any = {};
      if (credForm.name) body.name = credForm.name;
      if (credForm.email) body.email = credForm.email;
      if (credForm.password) body.password = credForm.password;
      await api.put(`/co-admin/credentials/${credEditSlot.key}`, body);
      showSnack(`${credEditSlot.label} credentials updated`);
      setCredDialog(false); setCredEditSlot(null);
      setCredForm({ name: '', email: '', password: '' });
      loadCredSlots();
      loadCoAdminAccess();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Update failed', 'error');
    }
  };

  // ─── Settings / Role & Ownership Management Handlers ─────────────────────

  const loadOwnerInfo = useCallback(async () => {
    try {
      const res = await api.get('/co-admin/owner-info');
      setOwnerInfo(res.data?.data || null);
    } catch { }
  }, []);

  const openSettingsDialog = () => {
    loadOwnerInfo();
    setRoleTransferSlot('');
    setRoleTransferEmail('');
    setSettingsDialog(true);
  };

  const handleTransferRole = async () => {
    if (!roleTransferSlot || !roleTransferEmail) {
      showSnack('Select a role slot and enter an email', 'error');
      return;
    }
    try {
      setRoleTransferLoading(true);
      await api.post('/co-admin/transfer-role', {
        targetSlot: roleTransferSlot,
        targetEmail: roleTransferEmail,
      });
      showSnack('Role transfer completed successfully');
      setSettingsDialog(false);
      loadCredSlots();
      loadOwnerInfo();
    } catch (err: any) {
      showSnack(err.response?.data?.message || 'Transfer failed', 'error');
    } finally { setRoleTransferLoading(false); }
  };

  // ─── Breadcrumb ──────────────────────────────────────────────────────────

  const sectionTitles: Record<string, string> = {
    'co-admins': 'Co Admin Management',
    users: 'User Management', admins: 'Admin Management', companies: 'Company Management',
    roles: 'Roles & Permissions', templates: 'Permission Templates',
    'audit-logs': 'Audit Logs', security: 'Security Controls',
  };

  const layerColor = currentUser?.role === 'main_admin' ? PRIMARY_DARK : currentUser?.role === 'admin' ? BLUE : GREEN;

  // ─── Render Sections ────────────────────────────────────────────────────

  const renderBreadcrumb = () => null;

  const renderHeader = () => (
    <Box sx={{ mb: 3 }}>
      {renderBreadcrumb()}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontSize: '1.55rem', fontWeight: 800, color: '#1F2937', letterSpacing: '-0.025em' }}>
            {sectionTitles[section]}
          </Typography>
          <Typography sx={{ fontSize: '0.84rem', color: '#94a3b8', mt: 0.4 }}>
            {currentUser?.role === 'main_admin' ? 'Platform-wide management' : currentUser?.role === 'admin' ? 'Company administration' : 'Your access overview'}
          </Typography>
        </Box>
        <Chip label={isCurrentUserOwner ? 'Owner' : ROLE_LABELS[currentUser?.role || ''] || 'User'} size="small"
          sx={{ bgcolor: alpha(layerColor, 0.06), color: layerColor, fontWeight: 700, px: 1.5, borderRadius: 2, fontSize: '0.75rem' }} />
      </Box>
    </Box>
  );

  // ─── (0) Co Admin: Super Admin Management ──────────────────────────────

  const renderCoAdminsSection = () => {
    const superAdmins = filteredUsers;
    const creatableRoles = getCreatableRoles(currentUser?.role, hasCoAdminAccess);
    const canCreateSuperAdmin = creatableRoles.includes('main_admin');
    const canCreateAdmin = creatableRoles.includes('admin');
    const canCreateUser = creatableRoles.includes('user');

    return (
      <Box className="animate-fadeIn">
        {/* Stat cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <StatCard title="Super Admins" value={superAdmins.length} icon={<CoAdminIcon />} color={PRIMARY} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard title="Active" value={superAdmins.filter(u => u.is_active).length} icon={<ActiveIcon />} color="#1F7A63" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard title="Total Users" value={users.length} icon={<PeopleIcon />} color={BLUE} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard title="Your Role" value={isCurrentUserOwner ? 'Owner' : hasCoAdminAccess ? 'Co-owner' : 'Super Admin'} icon={<ShieldIcon />} color="#166354" />
          </Grid>
        </Grid>

        {/* Actions toolbar */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" placeholder="Search super admins..." value={search} onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> }}
            sx={{ minWidth: 220, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.85rem' } }}
          />
          <Box sx={{ flex: 1 }} />
          {canCreateSuperAdmin && (
            <Button variant="contained" startIcon={<OtpIcon />} onClick={openSuperAdminCreation}
              sx={{ bgcolor: '#166354', '&:hover': { bgcolor: '#0D3D2F' }, textTransform: 'none', fontWeight: 700, borderRadius: 2, fontSize: '0.82rem', px: 2 }}>
              Add Super Admin
            </Button>
          )}
          {canCreateAdmin && (
            <Button variant="contained" startIcon={<PersonAddIcon />} onClick={() => { setForm({ role: 'admin', password: '' }); setShowCreatePassword(false); setUserDialog(true); }}
              sx={{ bgcolor: BLUE, '&:hover': { bgcolor: '#1e3a8a' }, textTransform: 'none', fontWeight: 700, borderRadius: 2, fontSize: '0.82rem', px: 2 }}>
              Add Admin
            </Button>
          )}
          {canCreateUser && (
            <Button variant="outlined" startIcon={<PersonAddIcon />} onClick={() => { setForm({ role: 'user', password: '' }); setShowCreatePassword(false); setUserDialog(true); }}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, fontSize: '0.82rem', px: 2, borderColor: PRIMARY, color: PRIMARY }}>
              Add User
            </Button>
          )}
        </Box>

        {/* RBAC info alert */}
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2, '& .MuiAlert-message': { fontSize: '0.82rem' } }}>
          <strong>Role-Based Access:</strong> You can create: {creatableRoles.map(r => ROLE_LABELS[r] || r).join(', ') || 'None'}.
        </Alert>

        {/* ─── Co Admin Credential Slots ──────────────────────────────────── */}
        <Paper sx={{ borderRadius: 3, border: '1px solid #f1f5f9', mb: 3, overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 1.8, bgcolor: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
              <LockIcon sx={{ fontSize: 18, color: '#166354' }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', color: '#1F2937' }}>Co Admin Credentials</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title="Refresh"><IconButton size="small" onClick={loadCredSlots}><RefreshIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
              {isCurrentUserOwner && (
                <Tooltip title="Role & Ownership Settings">
                  <IconButton size="small" onClick={openSettingsDialog} sx={{ color: '#166354' }}>
                    <SettingsIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>

          {credLoading ? (
            <Box sx={{ p: 3 }}><LinearProgress sx={{ borderRadius: 1 }} /></Box>
          ) : (
            <Grid container spacing={0}>
              {credSlots.map((slot, idx) => (
                <Grid item xs={12} sm={4} key={slot.key} sx={{ borderRight: idx < credSlots.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <Box sx={{ p: 2.5 }}>
                    {/* Slot header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                      <Avatar sx={{ width: 34, height: 34, bgcolor: slot.isSeeded ? alpha('#1F7A63', 0.1) : alpha('#dc2626', 0.1),
                        color: slot.isSeeded ? '#1F7A63' : '#dc2626', fontSize: '0.75rem', fontWeight: 700 }}>
                        {slot.label.charAt(0)}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', color: '#1F2937' }}>{slot.label}</Typography>
                        <Chip size="small" label={slot.isSeeded ? 'Active' : 'Not Set'}
                          sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600,
                            bgcolor: slot.isSeeded ? alpha('#1F7A63', 0.08) : alpha('#dc2626', 0.08),
                            color: slot.isSeeded ? '#1F7A63' : '#dc2626' }} />
                      </Box>
                    </Box>

                    {/* Slot info */}
                    {slot.isSeeded && slot.user ? (
                      <Box sx={{ mb: 1.5 }}>
                        <Typography sx={{ fontSize: '0.78rem', color: '#64748b', mb: 0.3 }}>
                          <strong>Email:</strong> {slot.user.email}
                        </Typography>
                        <Typography sx={{ fontSize: '0.78rem', color: '#64748b', mb: 0.3 }}>
                          <strong>Password:</strong> ••••••••
                        </Typography>
                        {slot.user.last_login && (
                          <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            Last login: {fmtDate(slot.user.last_login)}
                          </Typography>
                        )}
                        {slot.user.force_password_reset && (
                          <Chip size="small" label="Password change required" icon={<WarningIcon sx={{ fontSize: 12 }} />}
                            sx={{ mt: 0.5, height: 20, fontSize: '0.65rem', bgcolor: alpha('#f59e0b', 0.08), color: '#f59e0b', '& .MuiChip-icon': { color: '#f59e0b' } }} />
                        )}
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: '0.78rem', color: '#94a3b8', mb: 1.5, fontStyle: 'italic' }}>
                        No credentials configured
                      </Typography>
                    )}

                    {/* Set / Update Credentials button */}
                    {(isCurrentUserOwner || !isSetupComplete) && (
                      <Button size="small" variant="outlined" onClick={() => openCredUpdate(slot)}
                        startIcon={slot.isSeeded ? <EditIcon sx={{ fontSize: 14 }} /> : <PersonAddIcon sx={{ fontSize: 14 }} />}
                        sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', borderRadius: 2, borderColor: '#166354', color: '#166354', mt: 0.5 }}>
                        {slot.isSeeded ? 'Update' : 'Set Credentials'}
                      </Button>
                    )}
                  </Box>
                </Grid>
              ))}
              {credSlots.length === 0 && !credLoading && (
                <Grid item xs={12}>
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.85rem', color: '#94a3b8', mb: 1.5 }}>No credential slots loaded. Set up Owner first.</Typography>
                  </Box>
                </Grid>
              )}
            </Grid>
          )}
        </Paper>

        {/* Super Admin table */}
        <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {superAdmins.length === 0 ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: '#94a3b8' }}>No super admins found</TableCell></TableRow>
              ) : superAdmins.map(u => (
                <TableRow key={u.id} hover sx={{ '&:hover': { bgcolor: alpha(PRIMARY, 0.02) } }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: alpha('#166354', 0.1), color: '#166354', fontSize: '0.8rem', fontWeight: 700 }}>
                        {u.name?.charAt(0)?.toUpperCase()}
                      </Avatar>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{u.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.82rem', color: '#64748b' }}>{u.email}</TableCell>
                  <TableCell>
                    <Chip label={u.is_active ? 'Active' : 'Inactive'} size="small"
                      sx={{ bgcolor: u.is_active ? alpha('#1F7A63', 0.08) : alpha('#dc2626', 0.08), color: u.is_active ? '#1F7A63' : '#dc2626', fontWeight: 600, fontSize: '0.72rem' }} />
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.82rem', color: '#94a3b8' }}>{fmtDate(u.created_at)}</TableCell>
                  <TableCell>
                    <Tooltip title="View"><IconButton size="small" onClick={() => setViewUser(u)}><ViewIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditUser(u); setForm({ name: u.name, email: u.email, role: u.role, department: u.department }); }}><EditIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                    <Tooltip title="Reset Password"><IconButton size="small" onClick={() => handleResetPassword(u.id)}><LockResetIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  // ─── OTP Verification Dialog ─────────────────────────────────────────────

  const renderOtpDialog = () => (
    <Dialog open={otpDialog} onClose={resetOtpFlow} maxWidth="sm" fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <OtpIcon sx={{ color: '#166354' }} />
          <Typography sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
            Create Super Admin
          </Typography>
        </Box>
        <IconButton size="small" onClick={resetOtpFlow}><CloseIcon /></IconButton>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 3 }}>
        {/* Super Admin details form */}
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <TextField fullWidth size="small" label="Full Name" value={pendingSuperAdmin?.name || ''}
              onChange={e => setPendingSuperAdmin((p: any) => ({ ...p, name: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth size="small" label="Email Address" type="email" value={pendingSuperAdmin?.email || ''}
              onChange={e => setPendingSuperAdmin((p: any) => ({ ...p, email: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
          </Grid>
          <Grid item xs={12}>
            <TextField fullWidth size="small" label="Password" type="password" value={pendingSuperAdmin?.password || ''}
              onChange={e => setPendingSuperAdmin((p: any) => ({ ...p, password: e.target.value }))}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
          </Grid>
        </Grid>

        {otpDialogError && (
          <Alert severity="error" onClose={() => setOtpDialogError('')}
            sx={{ mt: 2, borderRadius: 2, fontSize: '0.85rem', fontWeight: 600 }}>
            {otpDialogError}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={resetOtpFlow} disabled={otpLoading} sx={{ textTransform: 'none', color: '#64748b' }}>Cancel</Button>
        <Button variant="contained" onClick={handleCreateSuperAdmin} disabled={otpLoading || !pendingSuperAdmin?.name || !pendingSuperAdmin?.email || !pendingSuperAdmin?.password}
          startIcon={otpLoading ? <CircularProgress size={18} color="inherit" /> : null}
          sx={{ bgcolor: '#166354', '&:hover': { bgcolor: '#0D3D2F' }, textTransform: 'none', fontWeight: 700, borderRadius: 2, minWidth: 180 }}>
          {otpLoading ? 'Creating...' : 'Create Super Admin'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  // ─── (1) Super Admin: Companies ──────────────────────────────────────────

  const renderCompaniesSection = () => {
    const s = companyStats || {};
    return (
      <Box className="animate-fadeIn">
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}><StatCard title="Total Companies" value={s.totalCompanies || 0} icon={<BusinessIcon />} color={PRIMARY} /></Grid>
          <Grid item xs={6} sm={3}><StatCard title="Active" value={s.activeCompanies || 0} icon={<ActiveIcon />} color="#1F7A63" /></Grid>
          <Grid item xs={6} sm={3}><StatCard title="Suspended" value={s.suspendedCompanies || 0} icon={<BlockIcon />} color="#dc2626" /></Grid>
          <Grid item xs={6} sm={3}><StatCard title="Total Users" value={s.totalUsers || 0} icon={<PeopleIcon />} color={BLUE} sub={`${s.totalActiveUsers || 0} active`} /></Grid>
        </Grid>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}><StatCard title="Recent Logins (7d)" value={s.recentLogins || 0} icon={<TrendingUpIcon />} color={PRIMARY} /></Grid>
          <Grid item xs={6} sm={3}><StatCard title="Failed Logins (7d)" value={s.failedLogins || 0} icon={<WarningIcon />} color="#f59e0b" /></Grid>
          <Grid item xs={6} sm={3}><StatCard title="Pending Invites" value={s.pendingInvitations || 0} icon={<InviteIcon />} color="#2A9D7E" /></Grid>
          <Grid item xs={6} sm={3}><StatCard title="Inactive 30d+" value={s.inactiveCompanies || 0} icon={<SpeedIcon />} color="#dc2626" /></Grid>
        </Grid>

        {/* Action bar */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> }}
            sx={{ minWidth: 220 }} />
          <Button variant="contained" startIcon={<BusinessIcon />} size="small"
            sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DARK } }}
            onClick={() => { setCompanyDialog(true); setForm({ plan: 'starter', user_limit: 50 }); setLogoFile(null); setLogoPreview(null); }}>
            Create Company
          </Button>
          <IconButton size="small" onClick={loadCompanyStats}><Refresh /></IconButton>
        </Box>

        {/* Companies table */}
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: alpha(PRIMARY_DARK, 0.04) }}>
                <TableCell sx={{ fontWeight: 700 }}>Company</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Plan</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Users</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Admin</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Risk</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Last Activity</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(companyList || []).filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase())).map(c => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar
                        src={c.logo_data || (c.logo_url ? `${(api.defaults.baseURL || '').replace('/api', '')}${c.logo_url}` : undefined)}
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
                  <TableCell>{planChip(c.plan)}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{c.active_user_count}/{c.user_limit}</Typography>
                    <LinearProgress variant="determinate"
                      value={Math.min((c.user_count / (c.user_limit || 1)) * 100, 100)}
                      sx={{ height: 4, borderRadius: 2, mt: 0.5,
                        bgcolor: 'var(--border)',
                        '& .MuiLinearProgress-bar': { bgcolor: c.user_count >= c.user_limit ? '#dc2626' : PRIMARY }
                      }} />
                  </TableCell>
                  <TableCell>
                    {c.admin ? <Typography variant="body2">{c.admin.name}</Typography> : <Typography variant="caption" color="text.secondary">None</Typography>}
                  </TableCell>
                  <TableCell>{c.suspended_at ? <Chip label="Suspended" size="small" sx={{ bgcolor: alpha('#dc2626', 0.1), color: '#dc2626', fontSize: '0.7rem', height: 22 }} /> : statusChip(c.is_active)}</TableCell>
                  <TableCell>{riskBadge(c.risk_flags)}</TableCell>
                  <TableCell><Typography variant="caption">{fmtDate(c.last_activity_at)}</Typography></TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => {
                        setEditCompany(c);
                        setForm({ name: c.name, email: c.email, phone: c.phone, website: c.website, tax_id: c.tax_id, address: c.address, user_limit: c.user_limit });
                        setLogoFile(null);
                        const base = (api.defaults.baseURL || '').replace('/api', '');
                        setLogoPreview(c.logo_data || (c.logo_url ? `${base}${c.logo_url}` : null));
                      }}><EditIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                      {c.suspended_at ? (
                        <Tooltip title="Reactivate"><IconButton size="small" color="success" onClick={() => handleReactivate(c.id)}><ReactivateIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                      ) : (
                        <Tooltip title="Suspend"><IconButton size="small" color="error" onClick={() => setSuspendDialog(c)}><BlockIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                      )}
                      <Tooltip title="Change Plan"><IconButton size="small" onClick={() => { setPlanDialog(c); setNewPlan(c.plan); }}><UpgradeIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {(!companyList || companyList.length === 0) && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <BusinessIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">No companies found</Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  // ─── (2) User Management ─────────────────────────────────────────────────

  const renderUsersSection = () => {
    const s = stats || {};
    return (
      <Box className="animate-fadeIn">
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}><StatCard title="Total Users" value={s.totalUsers || 0} icon={<PeopleIcon />} color={PRIMARY} /></Grid>
          <Grid item xs={6} sm={3}><StatCard title="Active" value={s.activeUsers || 0} icon={<ActiveIcon />} color="#1F7A63" /></Grid>
          <Grid item xs={6} sm={3}><StatCard title="Inactive" value={s.inactiveUsers || 0} icon={<InactiveIcon />} color="#dc2626" /></Grid>
          <Grid item xs={6} sm={3}><StatCard title="Added This Week" value={s.recentlyAdded || 0} icon={<TrendingUpIcon />} color={BLUE} /></Grid>
        </Grid>

        {/* Toolbar */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField size="small" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> }}
            sx={{ minWidth: 220 }} />
          {(currentUser?.role === 'main_admin' || currentUser?.role === 'admin') && (
            <>
              <Button variant="contained" startIcon={<PersonAddIcon />} size="small"
                sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DARK } }}
                onClick={() => { setUserDialog(true); setForm({ role: 'user', password: '', modules: ALL_MODULES }); setShowCreatePassword(false); }}>
                Add User
              </Button>
              <Button variant="outlined" startIcon={<InviteIcon />} size="small" sx={{ borderColor: PRIMARY, color: PRIMARY }}
                onClick={() => setInviteDialog(true)}>
                Invite
              </Button>
              <Button variant="outlined" startIcon={<ImportIcon />} size="small" sx={{ borderColor: PRIMARY, color: PRIMARY }}
                onClick={() => setImportDialog(true)}>
                Bulk Import
              </Button>
              {selectedUsers.length > 0 && (
                <Button variant="outlined" color="error" size="small" startIcon={<DeleteIcon />}
                  onClick={handleBulkDeactivate}>
                  Deactivate ({selectedUsers.length})
                </Button>
              )}
            </>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Export CSV"><IconButton size="small" onClick={exportCSV}><DownloadIcon /></IconButton></Tooltip>
          <Tooltip title="Refresh"><IconButton size="small" onClick={() => { loadUsers(); loadStats(); }}><RefreshIcon /></IconButton></Tooltip>
        </Box>

        {/* Users table */}
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: alpha(layerColor, 0.04) }}>
                {(currentUser?.role === 'main_admin' || currentUser?.role === 'admin') && (
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                      indeterminate={selectedUsers.length > 0 && selectedUsers.length < filteredUsers.length}
                      onChange={e => setSelectedUsers(e.target.checked ? filteredUsers.map(u => u.id) : [])} />
                  </TableCell>
                )}
                <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Company</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Last Login</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredUsers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(u => (
                <TableRow key={u.id} hover selected={selectedUsers.includes(u.id)}>
                  {(currentUser?.role === 'main_admin' || currentUser?.role === 'admin') && (
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={selectedUsers.includes(u.id)}
                        onChange={() => setSelectedUsers(prev => prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id])} />
                    </TableCell>
                  )}
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(ROLE_COLORS[u.role] || '#6B7280', 0.15), color: ROLE_COLORS[u.role] || '#6B7280', fontSize: '0.8rem', fontWeight: 700 }}>
                        {u.name?.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{u.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>{roleBadge(u.role)}</TableCell>
                  <TableCell>
                    {u.locked_until && new Date(u.locked_until) > new Date()
                      ? <Chip icon={<LockIcon sx={{ fontSize: 12 }} />} label="Locked" size="small" sx={{ bgcolor: alpha('#f59e0b', 0.1), color: '#f59e0b', fontWeight: 600, fontSize: '0.7rem', height: 24 }} />
                      : statusChip(u.is_active)}
                    {u.invite_status === 'pending' && <Chip label="Invited" size="small" sx={{ ml: 0.5, bgcolor: alpha('#2A9D7E', 0.1), color: '#2A9D7E', fontSize: '0.65rem', height: 20 }} />}
                  </TableCell>
                  <TableCell><Typography variant="caption">{u.company?.name || u.company_name || '—'}</Typography></TableCell>
                  <TableCell><Typography variant="caption">{u.department || '—'}</Typography></TableCell>
                  <TableCell><Typography variant="caption">{fmtDate(u.last_login)}</Typography></TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="View"><IconButton size="small" onClick={() => setViewUser(u)}><ViewIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                      {(currentUser?.role === 'main_admin' || currentUser?.role === 'admin') && u.role !== 'main_admin' && (
                        <>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditUser(u); setForm({ name: u.name, email: u.email, role: u.role, is_active: u.is_active, modules: u.modules, department: u.department, tags: u.tags, company_id: u.company_id }); }}><EditIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                          <Tooltip title="Reset Password"><IconButton size="small" onClick={() => handleResetPassword(u.id)}><LockResetIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                          <Tooltip title="Security"><IconButton size="small" onClick={() => { setSecurityDialog(u); loadLoginHistory(u.id); }}><SecurityIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                          <Tooltip title="Deactivate"><IconButton size="small" color="error" onClick={() => handleDeleteUser(u.id)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                        </>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
              {filteredUsers.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <PeopleIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography color="text.secondary">No users found</Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination component="div" count={filteredUsers.length} page={page} rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50]} />
        </TableContainer>
      </Box>
    );
  };

  // ─── (3) Audit Logs ──────────────────────────────────────────────────────

  const renderAuditLogs = () => (
    <Box className="animate-fadeIn">
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" placeholder="Search logs..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18 }} /></InputAdornment> }}
          sx={{ minWidth: 200 }} />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Action</InputLabel>
          <Select value={auditAction} label="Action" onChange={(e: SelectChangeEvent) => { setAuditAction(e.target.value); setPage(0); }}>
            <MenuItem value="">All Actions</MenuItem>
            {['user_created', 'user_updated', 'user_deactivated', 'role_changed', 'permissions_updated', 'password_reset', 'company_created', 'company_suspended', 'company_reactivated', 'company_plan_changed', 'bulk_import', 'bulk_deactivate', 'user_invited', 'force_password_reset', 'account_locked', 'account_unlocked', 'permission_template_created'].map(a => (
              <MenuItem key={a} value={a}>{a.replace(/_/g, ' ')}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField size="small" type="date" label="From" value={dateFrom} onChange={e => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
        <TextField size="small" type="date" label="To" value={dateTo} onChange={e => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
        <Tooltip title="Refresh"><IconButton size="small" onClick={loadAuditLogs}><RefreshIcon /></IconButton></Tooltip>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(PRIMARY_DARK, 0.04) }}>
              <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Entity</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Performed By</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Details</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {auditLogs.map(log => (
              <TableRow key={log.id} hover>
                <TableCell><Typography variant="caption">{fmtDateTime(log.created_at)}</Typography></TableCell>
                <TableCell>
                  <Chip label={log.action.replace(/_/g, ' ')} size="small"
                    sx={{ bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY_DARK, fontWeight: 600, fontSize: '0.7rem', height: 22, textTransform: 'capitalize' }} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>{log.entity_name || '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">{log.entity_type}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{log.performer_name || '—'}</Typography>
                  <Typography variant="caption" color="text.secondary">{log.performer_role}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ maxWidth: 250, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.details ? JSON.stringify(log.details) : '—'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
            {auditLogs.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                <HistoryIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography color="text.secondary">No audit logs found</Typography>
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination component="div" count={auditTotal} page={page} rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]} />
      </TableContainer>
    </Box>
  );

  // ─── (4) Permission Templates ────────────────────────────────────────────

  const renderTemplatesSection = () => (
    <Box className="animate-fadeIn">
      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
        {(currentUser?.role === 'main_admin' || currentUser?.role === 'admin') && (
          <Button variant="contained" startIcon={<TemplateIcon />} size="small"
            sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DARK } }}
            onClick={() => {
              setTemplateDialog(true); setEditTemplate(null);
              setForm({ name: '', description: '', permissions: ALL_MODULES.reduce((a, m) => ({ ...a, [m]: { read: true, write: false, admin: false } }), {}), is_global: false });
            }}>
            Create Template
          </Button>
        )}
        <Tooltip title="Refresh"><IconButton size="small" onClick={loadTemplates}><RefreshIcon /></IconButton></Tooltip>
      </Box>

      <Grid container spacing={2}>
        {templates.map(t => (
          <Grid item xs={12} sm={6} md={4} key={t.id}>
            <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight={700}>{t.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{t.description || 'No description'}</Typography>
                  </Box>
                  {t.is_global && <Chip label="Global" size="small" sx={{ bgcolor: alpha('#2A9D7E', 0.1), color: '#2A9D7E', fontSize: '0.65rem', height: 20 }} />}
                </Box>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ mb: 1 }}>
                  {Object.entries(t.permissions || {}).map(([mod, perms]: [string, any]) => (
                    <Box key={mod} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.3 }}>
                      <Typography variant="caption" fontWeight={500}>{mod}</Typography>
                      <Stack direction="row" spacing={0.5}>
                        {perms.read && <Chip label="R" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: alpha('#1F7A63', 0.1), color: '#1F7A63' }} />}
                        {perms.write && <Chip label="W" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: alpha(BLUE, 0.1), color: BLUE }} />}
                        {perms.admin && <Chip label="A" size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: alpha('#2A9D7E', 0.1), color: '#2A9D7E' }} />}
                      </Stack>
                    </Box>
                  ))}
                </Box>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditTemplate(t); setForm({ name: t.name, description: t.description, permissions: t.permissions, is_global: t.is_global }); setTemplateDialog(true); }}><EditIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                  <Tooltip title="Clone"><IconButton size="small" onClick={() => handleCloneTemplate(t.id, t.name)}><CloneIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                  <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => handleDeleteTemplate(t.id)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Created by {t.creator?.name || '—'} · {fmtDate(t.created_at)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
        {templates.length === 0 && (
          <Grid item xs={12}>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <TemplateIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">No permission templates yet</Typography>
            </Box>
          </Grid>
        )}
      </Grid>
    </Box>
  );

  // ─── (5) Security Controls ───────────────────────────────────────────────

  const renderSecuritySection = () => (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>Security controls allow you to manage account locks, 2FA, password resets, and monitor login activity for each user.</Alert>
      {renderUsersSection()}
    </Box>
  );

  // ─── (6) Roles Overview ──────────────────────────────────────────────────

  const renderRolesSection = () => (
    <Box className="animate-fadeIn">
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: '2px solid', borderColor: alpha(PRIMARY_DARK, 0.3), borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Avatar sx={{ bgcolor: alpha(PRIMARY_DARK, 0.1), color: PRIMARY_DARK, width: 36, height: 36 }}><ShieldIcon /></Avatar>
                <Typography variant="subtitle1" fontWeight={700} color={PRIMARY_DARK}>Super Admin</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Full platform control. Can manage all companies, admins, and users. Access to all modules and audit logs.</Typography>
              <Chip label="Platform Owner" size="small" sx={{ bgcolor: alpha(PRIMARY_DARK, 0.1), color: PRIMARY_DARK, fontSize: '0.7rem' }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: '2px solid', borderColor: alpha(BLUE, 0.3), borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Avatar sx={{ bgcolor: alpha(BLUE, 0.1), color: BLUE, width: 36, height: 36 }}><AdminPanelIcon /></Avatar>
                <Typography variant="subtitle1" fontWeight={700} color={BLUE}>Company Admin</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Manages company users. Can create, edit, deactivate members. Access to analytics and permission templates.</Typography>
              <Chip label="Company Manager" size="small" sx={{ bgcolor: alpha(BLUE, 0.1), color: BLUE, fontSize: '0.7rem' }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card elevation={0} sx={{ border: '2px solid', borderColor: alpha(GREEN, 0.3), borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Avatar sx={{ bgcolor: alpha(GREEN, 0.1), color: GREEN, width: 36, height: 36 }}><GroupIcon /></Avatar>
                <Typography variant="subtitle1" fontWeight={700} color={GREEN}>Member</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Access based on assigned modules. Granular read/write/admin permissions per module. Views own activity.</Typography>
              <Chip label="Team Member" size="small" sx={{ bgcolor: alpha(GREEN, 0.1), color: GREEN, fontSize: '0.7rem' }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Permission Templates</Typography>
      {renderTemplatesSection()}
    </Box>
  );

  // ─── Dialogs ─────────────────────────────────────────────────────────────

  const renderDialogs = () => (
    <>
      {/* Create/Edit User Dialog */}
      <Dialog open={userDialog || !!editUser} onClose={() => { setUserDialog(false); setEditUser(null); setForm({}); setShowCreatePassword(false); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editUser ? 'Edit User' : 'Create User'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}><TextField fullWidth size="small" label="Name" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth size="small" label="Email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Grid>
            {!editUser && (
              <Grid item xs={12}>
                <TextField
                  fullWidth size="small" label="Password" required
                  type={showCreatePassword ? 'text' : 'password'}
                  value={form.password || ''}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  autoComplete="new-password"
                  placeholder="Enter password (min 6 characters)"
                  error={form.password !== undefined && form.password.length > 0 && form.password.length < 6}
                  helperText={form.password !== undefined && form.password.length > 0 && form.password.length < 6 ? 'Minimum 6 characters required' : ''}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" edge="end" onClick={() => setShowCreatePassword(v => !v)} tabIndex={-1}>
                          {showCreatePassword ? <VisibilityOffIcon sx={{ fontSize: 18 }} /> : <ViewIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
            )}
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select value={form.role || 'user'} label="Role" onChange={(e: SelectChangeEvent) => setForm({ ...form, role: e.target.value })}>
                  {currentUser?.role === 'main_admin' && <MenuItem value="main_admin">Super Admin</MenuItem>}
                  {currentUser?.role === 'main_admin' && <MenuItem value="admin">Admin</MenuItem>}
                  <MenuItem value="sales_engineer">Sales Engineer</MenuItem>
                  <MenuItem value="user">Member</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Department" value={form.department || ''} onChange={e => setForm({ ...form, department: e.target.value })} /></Grid>
            {currentUser?.role === 'main_admin' && (
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>Company</InputLabel>
                  <Select value={form.company_id || ''} label="Company" onChange={(e: SelectChangeEvent) => setForm({ ...form, company_id: e.target.value })}>
                    <MenuItem value="">None</MenuItem>
                    {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12}>
              <Typography variant="caption" fontWeight={600} sx={{ mb: 1, display: 'block' }}>Module Access</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {ALL_MODULES.map(m => (
                  <FormControlLabel key={m} label={m} control={
                    <Checkbox size="small" checked={(form.modules || []).includes(m)}
                      onChange={e => {
                        const mods = [...(form.modules || [])];
                        if (e.target.checked) mods.push(m); else mods.splice(mods.indexOf(m), 1);
                        setForm({ ...form, modules: mods });
                      }} />
                  } sx={{ '& .MuiTypography-root': { fontSize: '0.8rem' } }} />
                ))}
              </Box>
            </Grid>
            {editUser && (
              <Grid item xs={12}>
                <FormControlLabel label="Active" control={
                  <Switch checked={form.is_active ?? true} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                } />
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setUserDialog(false); setEditUser(null); setForm({}); setShowCreatePassword(false); }}>Cancel</Button>
          <Button variant="contained" sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DARK } }}
            onClick={editUser ? handleUpdateUser : handleCreateUser}>
            {editUser ? 'Save Changes' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View User Dialog */}
      <Dialog open={!!viewUser} onClose={() => setViewUser(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          User Details
          <IconButton onClick={() => setViewUser(null)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          {viewUser && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Avatar sx={{ width: 56, height: 56, bgcolor: alpha(ROLE_COLORS[viewUser.role] || '#6B7280', 0.15), color: ROLE_COLORS[viewUser.role], fontSize: '1.5rem', fontWeight: 700 }}>
                  {viewUser.name?.charAt(0).toUpperCase()}
                </Avatar>
                <Box>
                  <Typography variant="h6" fontWeight={700}>{viewUser.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{viewUser.email}</Typography>
                </Box>
              </Box>
              <Grid container spacing={1}>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Role</Typography><Box>{roleBadge(viewUser.role)}</Box></Grid>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Status</Typography><Box>{statusChip(viewUser.is_active)}</Box></Grid>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Company</Typography><Typography variant="body2">{viewUser.company?.name || viewUser.company_name || '—'}</Typography></Grid>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Department</Typography><Typography variant="body2">{viewUser.department || '—'}</Typography></Grid>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Last Login</Typography><Typography variant="body2">{fmtDateTime(viewUser.last_login)}</Typography></Grid>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Created</Typography><Typography variant="body2">{fmtDate(viewUser.created_at)}</Typography></Grid>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">2FA</Typography><Typography variant="body2">{viewUser.two_factor_enabled ? 'Enabled' : 'Disabled'}</Typography></Grid>
                <Grid item xs={6}><Typography variant="caption" color="text.secondary">Login IP</Typography><Typography variant="body2">{viewUser.last_login_ip || '—'}</Typography></Grid>
              </Grid>
              {viewUser.tags && viewUser.tags.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">Tags</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                    {viewUser.tags.map(t => <Chip key={t} label={t} size="small" />)}
                  </Box>
                </Box>
              )}
              {viewUser.modules && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">Modules</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                    {viewUser.modules.map(m => <Chip key={m} label={m} size="small" variant="outlined" />)}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Company Dialog */}
      <Dialog open={companyDialog || !!editCompany} onClose={() => { setCompanyDialog(false); setEditCompany(null); setForm({}); setLogoFile(null); setLogoPreview(null); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editCompany ? 'Edit Company' : 'Create Company'}</DialogTitle>
        <DialogContent>
          {/* Logo Upload */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2, mt: 1 }}>
            <Box sx={{ position: 'relative', cursor: 'pointer' }} onClick={() => logoInputRef.current?.click()}>
              <Avatar
                src={logoPreview || undefined}
                sx={{
                  width: 88, height: 88,
                  bgcolor: logoPreview ? 'transparent' : alpha(PRIMARY, 0.08),
                  border: `2px dashed ${logoPreview ? 'transparent' : alpha(PRIMARY, 0.3)}`,
                  color: PRIMARY, fontSize: '2rem',
                }}
              >
                {!logoPreview && <AddAPhotoIcon sx={{ fontSize: 32, color: alpha(PRIMARY, 0.5) }} />}
              </Avatar>
              {logoPreview && (
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); setLogoFile(null); setLogoPreview(null); setForm({ ...form, remove_logo: true }); }}
                  sx={{
                    position: 'absolute', top: -6, right: -6,
                    bgcolor: 'error.main', color: '#fff', width: 22, height: 22,
                    '&:hover': { bgcolor: 'error.dark' },
                  }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              {logoPreview ? 'Click to replace' : 'Click to upload logo'}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
              JPG, PNG, or SVG (max 2 MB)
            </Typography>
            <input
              ref={logoInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.svg"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { showSnack('File size must be under 2 MB', 'error'); return; }
                setLogoFile(file);
                setLogoPreview(URL.createObjectURL(file));
                setForm((prev: any) => { const f = { ...prev }; delete f.remove_logo; return f; });
                e.target.value = '';
              }}
            />
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12}><TextField fullWidth size="small" label="Company Name" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Phone" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Website" value={form.website || ''} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Tax ID" value={form.tax_id || ''} onChange={e => setForm({ ...form, tax_id: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth size="small" label="Address" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} /></Grid>
            <Grid item xs={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Plan</InputLabel>
                <Select value={form.plan || 'starter'} label="Plan" onChange={(e: SelectChangeEvent) => setForm({ ...form, plan: e.target.value })}>
                  <MenuItem value="free">Free (5 users)</MenuItem>
                  <MenuItem value="starter">Starter (50 users)</MenuItem>
                  <MenuItem value="professional">Professional (200 users)</MenuItem>
                  <MenuItem value="enterprise">Enterprise (10,000 users)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}><TextField fullWidth size="small" type="number" label="User Limit" value={form.user_limit || 50} onChange={e => setForm({ ...form, user_limit: parseInt(e.target.value) })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCompanyDialog(false); setEditCompany(null); setForm({}); setLogoFile(null); setLogoPreview(null); }}>Cancel</Button>
          <Button variant="contained" sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DARK } }}
            onClick={editCompany ? handleUpdateCompany : handleCreateCompany}>
            {editCompany ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Suspend Company Dialog */}
      <Dialog open={!!suspendDialog} onClose={() => setSuspendDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#dc2626' }}>Suspend Company</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>This will deactivate the company and all its users.</Alert>
          <Typography variant="body2" sx={{ mb: 2 }}>Company: <strong>{suspendDialog?.name}</strong></Typography>
          <TextField fullWidth size="small" label="Reason" multiline rows={3} value={suspendReason} onChange={e => setSuspendReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSuspendDialog(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleSuspend}>Suspend</Button>
        </DialogActions>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={!!planDialog} onClose={() => setPlanDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Change Plan</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>Company: <strong>{planDialog?.name}</strong> (current: {planDialog?.plan})</Typography>
          <FormControl fullWidth size="small">
            <InputLabel>New Plan</InputLabel>
            <Select value={newPlan} label="New Plan" onChange={(e: SelectChangeEvent) => setNewPlan(e.target.value)}>
              <MenuItem value="free">Free (5 users)</MenuItem>
              <MenuItem value="starter">Starter (50 users)</MenuItem>
              <MenuItem value="professional">Professional (200 users)</MenuItem>
              <MenuItem value="enterprise">Enterprise (10,000 users)</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanDialog(null)}>Cancel</Button>
          <Button variant="contained" sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DARK } }} onClick={handleChangePlan}>Update Plan</Button>
        </DialogActions>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={inviteDialog} onClose={() => setInviteDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Invite User</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}><TextField fullWidth size="small" label="Email" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} /></Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select value={inviteRole} label="Role" onChange={(e: SelectChangeEvent) => setInviteRole(e.target.value)}>
                  <MenuItem value="user">Member</MenuItem>
                  <MenuItem value="sales_engineer">Sales Engineer</MenuItem>
                  {currentUser?.role === 'main_admin' && <MenuItem value="admin">Admin</MenuItem>}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteDialog(false)}>Cancel</Button>
          <Button variant="contained" sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DARK } }} onClick={handleInvite}>Send Invite</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={importDialog} onClose={() => setImportDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Bulk Import Users</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>Paste CSV data. Format: name,email,role,department (first row = header). Password defaults to Temp@1234.</Alert>
          <TextField fullWidth multiline rows={8} placeholder={'name,email,role,department\nJohn Doe,john@example.com,user,Engineering\nJane Doe,jane@example.com,user,Design'}
            value={importData} onChange={e => setImportData(e.target.value)} sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialog(false)}>Cancel</Button>
          <Button variant="contained" sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DARK } }} onClick={handleImport} disabled={!importData.trim()}>
            Import
          </Button>
        </DialogActions>
      </Dialog>

      {/* Permission Template Dialog */}
      <Dialog open={templateDialog} onClose={() => { setTemplateDialog(false); setEditTemplate(null); setForm({}); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}><TextField fullWidth size="small" label="Template Name" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></Grid>
            <Grid item xs={12}><TextField fullWidth size="small" label="Description" multiline rows={2} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} /></Grid>
            {currentUser?.role === 'main_admin' && (
              <Grid item xs={12}>
                <FormControlLabel label="Global template (available to all companies)" control={
                  <Switch checked={form.is_global || false} onChange={e => setForm({ ...form, is_global: e.target.checked })} />
                } />
              </Grid>
            )}
            <Grid item xs={12}>
              <Typography variant="caption" fontWeight={700} sx={{ mb: 1, display: 'block' }}>Module Permissions</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Module</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Read</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Write</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700 }}>Admin</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ALL_MODULES.map(mod => {
                      const perms = form.permissions?.[mod] || { read: false, write: false, admin: false };
                      return (
                        <TableRow key={mod}>
                          <TableCell>{mod}</TableCell>
                          <TableCell align="center"><Checkbox size="small" checked={perms.read} onChange={e => setForm({ ...form, permissions: { ...form.permissions, [mod]: { ...perms, read: e.target.checked } } })} /></TableCell>
                          <TableCell align="center"><Checkbox size="small" checked={perms.write} onChange={e => setForm({ ...form, permissions: { ...form.permissions, [mod]: { ...perms, write: e.target.checked } } })} /></TableCell>
                          <TableCell align="center"><Checkbox size="small" checked={perms.admin} onChange={e => setForm({ ...form, permissions: { ...form.permissions, [mod]: { ...perms, admin: e.target.checked } } })} /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setTemplateDialog(false); setEditTemplate(null); setForm({}); }}>Cancel</Button>
          <Button variant="contained" sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DARK } }} onClick={handleSaveTemplate}>
            {editTemplate ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Security Dialog */}
      <Dialog open={!!securityDialog} onClose={() => setSecurityDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Security Controls — {securityDialog?.name}
          <IconButton onClick={() => setSecurityDialog(null)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          {securityDialog && (
            <Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">2FA Status</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      <Chip label={securityDialog.two_factor_enabled ? 'Enabled' : 'Disabled'} size="small"
                        sx={{ bgcolor: alpha(securityDialog.two_factor_enabled ? '#1F7A63' : '#dc2626', 0.1), color: securityDialog.two_factor_enabled ? '#1F7A63' : '#dc2626' }} />
                      <Button size="small" variant="outlined" onClick={() => handleToggle2FA(securityDialog.id, !securityDialog.two_factor_enabled)}>
                        {securityDialog.two_factor_enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </Box>
                  </Card>
                </Grid>
                <Grid item xs={6}>
                  <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Account Lock</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      {securityDialog.locked_until && new Date(securityDialog.locked_until) > new Date()
                        ? <><Chip label="Locked" size="small" sx={{ bgcolor: alpha('#f59e0b', 0.1), color: '#f59e0b' }} />
                          <Button size="small" color="success" variant="outlined" onClick={() => handleUnlockAccount(securityDialog.id)}>Unlock</Button></>
                        : <><Chip label="Unlocked" size="small" sx={{ bgcolor: alpha('#1F7A63', 0.1), color: '#1F7A63' }} />
                          <Button size="small" color="error" variant="outlined" onClick={() => handleLockAccount(securityDialog.id)}>Lock</Button></>}
                    </Box>
                  </Card>
                </Grid>
                <Grid item xs={6}>
                  <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Failed Attempts</Typography>
                    <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5, color: (securityDialog.failed_login_attempts || 0) > 3 ? '#dc2626' : 'inherit' }}>
                      {securityDialog.failed_login_attempts || 0}
                    </Typography>
                  </Card>
                </Grid>
                <Grid item xs={6}>
                  <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', p: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">Force Password Reset</Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <Button size="small" variant="outlined" startIcon={<LockResetIcon />}
                        onClick={() => handleForcePasswordReset(securityDialog.id)}>
                        Require Reset
                      </Button>
                    </Box>
                  </Card>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Recent Login History</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>IP</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Device</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loginHistory.map((lh: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell><Typography variant="caption">{fmtDateTime(lh.created_at)}</Typography></TableCell>
                        <TableCell>
                          <Chip label={lh.status} size="small"
                            sx={{ bgcolor: alpha(lh.status === 'success' ? '#1F7A63' : '#dc2626', 0.1), color: lh.status === 'success' ? '#1F7A63' : '#dc2626', fontSize: '0.65rem', height: 20 }} />
                        </TableCell>
                        <TableCell><Typography variant="caption">{lh.ip_address || '—'}</Typography></TableCell>
                        <TableCell><Typography variant="caption">{lh.device || '—'}</Typography></TableCell>
                      </TableRow>
                    ))}
                    {loginHistory.length === 0 && (
                      <TableRow><TableCell colSpan={4} align="center"><Typography variant="caption" color="text.secondary">No login history</Typography></TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );

  // ─── Main Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
        <Skeleton variant="text" width={200} height={28} sx={{ mb: 1, borderRadius: 1 }} />
        <Skeleton variant="text" width={300} height={18} sx={{ mb: 3, borderRadius: 1 }} />
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[1,2,3,4].map(i => <Grid item xs={6} sm={3} key={i}><Skeleton variant="rounded" height={100} sx={{ borderRadius: 3 }} /></Grid>)}
        </Grid>
        <Skeleton variant="rounded" height={300} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {renderHeader()}

      {section === 'co-admins' && currentUser && currentUser.role === 'main_admin' && renderCoAdminsSection()}
      {section === 'companies' && currentUser?.role === 'main_admin' && renderCompaniesSection()}
      {(section === 'users' || section === 'admins') && renderUsersSection()}
      {section === 'audit-logs' && renderAuditLogs()}
      {section === 'roles' && renderRolesSection()}
      {section === 'templates' && renderTemplatesSection()}
      {section === 'security' && renderSecuritySection()}

      {/* Show companies overview for main_admin on users tab too */}
      {section === 'users' && currentUser?.role === 'main_admin' && companyList.length === 0 && !companyStats && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="info">
            Navigate to <Link component="button" onClick={() => navigate('/platform-admin/access-control/companies')} sx={{ fontWeight: 600 }}>Companies</Link> to manage your organizations.
          </Alert>
        </Box>
      )}

      {renderDialogs()}
      {renderOtpDialog()}

      {/* ─── Credential Update Dialog ──────────────────────────────────── */}
      <Dialog open={credDialog} onClose={() => { setCredDialog(false); setCredEditSlot(null); }} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LockIcon sx={{ color: '#166354' }} />
            <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
              {credEditSlot?.isSeeded ? `Update ${credEditSlot?.label} Credentials` : `Set ${credEditSlot?.label} Credentials`}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => { setCredDialog(false); setCredEditSlot(null); }}><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 3 }}>
          {!isSetupComplete && !credEditSlot?.isSeeded && (
            <Alert severity="info" sx={{ mb: 2, borderRadius: 2, fontSize: '0.82rem' }}>
              {credEditSlot?.key === 'owner'
                ? 'Set the Owner first to configure other roles.'
                : 'Owner must be set before configuring this role.'}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Display Name" value={credForm.name}
                onChange={e => setCredForm(f => ({ ...f, name: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Email Address" type="email" value={credForm.email}
                onChange={e => setCredForm(f => ({ ...f, email: e.target.value }))}
                helperText="Email address for this co-admin role"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label={credEditSlot?.isSeeded ? 'New Password (leave blank to keep current)' : 'Password'}
                type="password" value={credForm.password}
                onChange={e => setCredForm(f => ({ ...f, password: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setCredDialog(false); setCredEditSlot(null); }} sx={{ textTransform: 'none', color: '#64748b' }}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateCred}
            disabled={!credForm.email || (!credEditSlot?.isSeeded && !credForm.password)}
            sx={{ bgcolor: '#166354', '&:hover': { bgcolor: '#0D3D2F' }, textTransform: 'none', fontWeight: 700, borderRadius: 2 }}>
            {credEditSlot?.isSeeded ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Role & Ownership Settings Dialog ──────────────────────────── */}
      <Dialog open={settingsDialog} onClose={() => setSettingsDialog(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SettingsIcon sx={{ color: '#166354' }} />
            <Typography sx={{ fontWeight: 700, fontSize: '1.05rem' }}>Role &amp; Ownership Settings</Typography>
          </Box>
          <IconButton size="small" onClick={() => setSettingsDialog(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 3 }}>
          {/* Current Assignments */}
          {ownerInfo && (
            <Box sx={{ mb: 3 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: '#1F2937', mb: 1.5 }}>Current Assignments</Typography>
              {ownerInfo.slots?.map((slot: any) => (
                <Box key={slot.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.8, px: 1.5, mb: 0.8,
                  borderRadius: 2, bgcolor: slot.isSeeded ? alpha('#1F7A63', 0.04) : alpha('#dc2626', 0.04), border: '1px solid', borderColor: slot.isSeeded ? alpha('#1F7A63', 0.12) : alpha('#dc2626', 0.12) }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 28, height: 28, bgcolor: slot.isSeeded ? alpha('#1F7A63', 0.1) : alpha('#dc2626', 0.1),
                      color: slot.isSeeded ? '#1F7A63' : '#dc2626', fontSize: '0.7rem', fontWeight: 700 }}>
                      {slot.label.charAt(0)}
                    </Avatar>
                    <Box>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#1F2937' }}>{slot.label}</Typography>
                      <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>{slot.user?.email || 'Not assigned'}</Typography>
                    </Box>
                  </Box>
                  <Chip size="small" label={slot.isSeeded ? 'Active' : 'Empty'}
                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600,
                      bgcolor: slot.isSeeded ? alpha('#1F7A63', 0.08) : alpha('#dc2626', 0.08),
                      color: slot.isSeeded ? '#1F7A63' : '#dc2626' }} />
                </Box>
              ))}
            </Box>
          )}

          <Divider sx={{ mb: 2.5 }} />

          {/* Transfer Role Section */}
          <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: '#1F2937', mb: 0.5 }}>Transfer / Update Role</Typography>
          <Typography sx={{ fontSize: '0.78rem', color: '#64748b', mb: 2 }}>
            Select a role slot and assign a new email.
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField select fullWidth size="small" label="Select Role Slot" value={roleTransferSlot}
                onChange={e => setRoleTransferSlot(e.target.value)}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}>
                <MenuItem value="">— Select —</MenuItem>
                {(ownerInfo?.slots || []).map((s: any) => (
                  <MenuItem key={s.key} value={s.key}>{s.label} {s.user?.email ? `(${s.user.email})` : '(empty)'}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="New Email for Role" type="email" value={roleTransferEmail}
                onChange={e => setRoleTransferEmail(e.target.value)}
                helperText="The email of the user to assign to this role"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
            </Grid>
          </Grid>

          {/* Transfer Button */}
          {roleTransferSlot && roleTransferEmail && (
            <Box sx={{ mt: 2.5 }}>
              <Button variant="contained" fullWidth onClick={handleTransferRole}
                disabled={roleTransferLoading}
                startIcon={roleTransferLoading ? <CircularProgress size={16} color="inherit" /> : <VerifiedIcon sx={{ fontSize: 16 }} />}
                sx={{ bgcolor: '#166354', '&:hover': { bgcolor: '#0D3D2F' }, textTransform: 'none', fontWeight: 700, borderRadius: 2, py: 1 }}>
                {roleTransferLoading ? 'Transferring...' : 'Confirm Role Transfer'}
              </Button>
            </Box>
          )}

          {/* Audit note */}
          <Alert severity="warning" icon={<HistoryIcon sx={{ fontSize: 18 }} />}
            sx={{ mt: 3, borderRadius: 2, fontSize: '0.78rem', '& .MuiAlert-message': { fontSize: '0.78rem' } }}>
            All role transfers are logged in the audit trail.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSettingsDialog(false)} sx={{ textTransform: 'none', color: '#64748b' }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snack.open} autoHideDuration={5000} onClose={() => setSnack(s => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} sx={{ zIndex: 9999 }}>
        <Alert severity={snack.severity} onClose={() => setSnack(s => ({ ...s, open: false }))} variant="filled">{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
};

// Helper component used inside — just alias the icon import
const Refresh = RefreshIcon;

export default AccessControlCenter;
