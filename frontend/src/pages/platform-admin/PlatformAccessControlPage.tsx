import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem, FormControl,
  InputLabel, Chip, Avatar, Tooltip, InputAdornment, Snackbar, Alert,
  CircularProgress, Breadcrumbs, Link, alpha, Tabs, Tab, Stack, Divider,
  TablePagination, SelectChangeEvent, Checkbox,
} from '@mui/material';
import {
  Search as SearchIcon, Refresh as RefreshIcon, Visibility as ViewIcon,
  Edit as EditIcon, Delete as DeleteIcon, LockReset as ResetIcon,
  PersonAdd as AddIcon, Business as BusinessIcon, People as PeopleIcon,
  CheckCircle as ActiveIcon, Cancel as InactiveIcon, ArrowBack as BackIcon,
  NavigateNext as NavNextIcon, FilterList as FilterIcon,
  AdminPanelSettings as AdminIcon, Shield as ShieldIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import dayjs from 'dayjs';

const PRIMARY = '#1F7A63';

const ROLE_LABELS: Record<string, string> = {
  main_admin: 'Company Owner',
  admin: 'Admin',
  sales_engineer: 'Sales Engineer',
  user: 'User',
};

const ROLE_COLORS: Record<string, string> = {
  main_admin: '#2A9D7E',
  admin: '#0D3D2F',
  sales_engineer: '#F59E0B',
  user: '#6B7280',
};

// ─── Stat Card ───────────────────────────────────────────────────────────
function StatCard({ title, value, icon, color }: { title: string; value: number | string; icon: React.ReactNode; color: string }) {
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: alpha('#000', 0.06), borderRadius: 3 }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Typography>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, mt: 0.5, color, lineHeight: 1 }}>{value}</Typography>
          </Box>
          <Box sx={{ width: 40, height: 40, borderRadius: 2.5, bgcolor: alpha(color, 0.08), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {React.cloneElement(icon as React.ReactElement, { sx: { fontSize: 20, color } })}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────
interface UserRecord {
  id: string; name: string; email: string; role: string; is_active: boolean;
  company_id?: string; company_name?: string; last_login?: string;
  created_at: string; phone?: string; position?: string; department?: string;
  company?: { id: string; name: string; plan?: string };
}

interface CompanyRecord {
  id: string; name: string; company_code?: string; email?: string; phone?: string;
  is_active: boolean; plan: string; logo_url?: string; created_at: string;
  owner?: { id: string; name: string; email: string; last_login?: string };
  totalUsers: number; activeUsers: number;
}

// ─── Main Component ─────────────────────────────────────────────────────
const PlatformAccessControlPage: React.FC = () => {
  const [tab, setTab] = useState<'users' | 'companies'>('companies');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // Users
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [searchUser, setSearchUser] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCompanyId, setFilterCompanyId] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Companies
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);

  // Drill-down
  const [drillCompany, setDrillCompany] = useState<CompanyRecord | null>(null);
  const [drillUsers, setDrillUsers] = useState<UserRecord[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  // Dialogs
  const [viewUser, setViewUser] = useState<UserRecord | null>(null);
  const [editDialog, setEditDialog] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [editTarget, setEditTarget] = useState<UserRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetDialog, setResetDialog] = useState<UserRecord | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<UserRecord | null>(null);
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [addDialog, setAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [addCompanyId, setAddCompanyId] = useState('');

  // ─── Data Loaders ───────────────
  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (searchUser) params.search = searchUser;
      if (filterRole) params.role = filterRole;
      if (filterStatus) params.is_active = filterStatus;
      if (filterCompanyId) params.company_id = filterCompanyId;
      const res = await api.get('/platform-admin/access-control/users', { params });
      setUsers(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  }, [searchUser, filterRole, filterStatus, filterCompanyId]);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/platform-admin/access-control/companies');
      setCompanies(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      console.error('Failed to load companies:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDrillDown = useCallback(async (companyId: string) => {
    setDrillLoading(true);
    try {
      const res = await api.get(`/platform-admin/companies/${companyId}/users`);
      const data = res.data?.data;
      setDrillUsers(Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load company users:', err);
    } finally {
      setDrillLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'users') loadUsers();
    else loadCompanies();
  }, [tab, loadUsers, loadCompanies]);

  // ─── Handlers ───────────────────
  const handleDrillInto = (company: CompanyRecord) => {
    setDrillCompany(company);
    setSelectedUsers(new Set());
    loadDrillDown(company.id);
  };

  const handleDrillBack = () => {
    setDrillCompany(null);
    setDrillUsers([]);
    setSelectedUsers(new Set());
  };

  const handleViewUser = (user: UserRecord) => setViewUser(user);

  const handleEditOpen = (user: UserRecord) => {
    setEditTarget(user);
    setEditForm({ name: user.name, email: user.email, role: user.role, is_active: user.is_active });
    setEditDialog(true);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const companyId = editTarget.company_id || editTarget.company?.id;
      if (companyId) {
        await api.put(`/platform-admin/companies/${companyId}/users/${editTarget.id}`, editForm);
      } else {
        await api.put(`/users/${editTarget.id}`, editForm);
      }
      setToast({ message: 'User updated successfully', severity: 'success' });
      setEditDialog(false);
      if (drillCompany) loadDrillDown(drillCompany.id);
      else loadUsers();
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed to update user', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetSave = async () => {
    if (!resetDialog) return;
    setSaving(true);
    try {
      await api.post(`/platform-admin/users/${resetDialog.id}/reset-password`, { password: resetPassword });
      setToast({ message: 'Password reset successfully', severity: 'success' });
      setResetDialog(null);
      setResetPassword('');
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed to reset password', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog) return;
    setSaving(true);
    try {
      const companyId = deleteDialog.company_id || deleteDialog.company?.id;
      if (companyId) {
        await api.delete(`/platform-admin/companies/${companyId}/users/${deleteDialog.id}`);
      } else {
        // No company_id: use bulk delete endpoint with single user
        await api.post('/platform-admin/users/bulk-delete', { userIds: [deleteDialog.id] });
      }
      setToast({ message: 'User deleted successfully', severity: 'success' });
      setDeleteDialog(null);
      setSelectedUsers(new Set());
      if (drillCompany) loadDrillDown(drillCompany.id);
      else loadUsers();
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed to delete user', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (selectedUsers.size === 0) return;
    setSaving(true);
    try {
      const userIds = Array.from(selectedUsers);

      if (drillCompany) {
        // Company drill-down: use company-scoped endpoint
        await api.post(`/platform-admin/companies/${drillCompany.id}/users/bulk-delete`, { userIds });
      } else {
        // All Users tab: use direct bulk delete endpoint
        await api.post('/platform-admin/users/bulk-delete', { userIds });
      }

      setToast({ message: `${selectedUsers.size} user(s) deleted successfully`, severity: 'success' });
      setBulkDeleteDialog(false);
      setSelectedUsers(new Set());
      if (drillCompany) loadDrillDown(drillCompany.id);
      else loadUsers();
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed to delete users', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const toggleSelectUser = (id: string) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (userList: UserRecord[]) => {
    const pageUsers = userList.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
    const allSelected = pageUsers.every(u => selectedUsers.has(u.id));
    setSelectedUsers(prev => {
      const next = new Set(prev);
      pageUsers.forEach(u => {
        if (allSelected) next.delete(u.id);
        else next.add(u.id);
      });
      return next;
    });
  };

  const handleAddUser = async () => {
    const targetCompanyId = addCompanyId || drillCompany?.id;
    if (!targetCompanyId) {
      setToast({ message: 'Please select a company', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      await api.post(`/platform-admin/companies/${targetCompanyId}/users`, addForm);
      setToast({ message: 'User created successfully', severity: 'success' });
      setAddDialog(false);
      setAddForm({ name: '', email: '', password: '', role: 'user' });
      if (drillCompany) loadDrillDown(drillCompany.id);
      else loadUsers();
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed to create user', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const roleBadge = (role: string) => (
    <Chip label={ROLE_LABELS[role] || role} size="small"
      sx={{ bgcolor: alpha(ROLE_COLORS[role] || '#6B7280', 0.1), color: ROLE_COLORS[role] || '#6B7280', fontWeight: 600, fontSize: '0.7rem', height: 24 }} />
  );

  const statusChip = (active: boolean) => (
    active
      ? <Chip icon={<ActiveIcon sx={{ fontSize: 14 }} />} label="Active" size="small" sx={{ bgcolor: alpha('#1F7A63', 0.1), color: '#1F7A63', fontWeight: 600, fontSize: '0.7rem', height: 24 }} />
      : <Chip icon={<InactiveIcon sx={{ fontSize: 14 }} />} label="Inactive" size="small" sx={{ bgcolor: alpha('#dc2626', 0.1), color: '#dc2626', fontWeight: 600, fontSize: '0.7rem', height: 24 }} />
  );

  const fmtDate = (d?: string | null) => d ? dayjs(d).format('DD MMM YYYY, HH:mm') : '—';

  // ─── User Table (shared between users tab and drill-down) ───────────
  const renderUserTable = (userList: UserRecord[], showCompany: boolean = true) => {
    const paged = userList.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
    const allPageSelected = paged.length > 0 && paged.every(u => selectedUsers.has(u.id));
    const somePageSelected = paged.some(u => selectedUsers.has(u.id));
    return (
      <>
        {/* Bulk action bar */}
        {selectedUsers.size > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5, bgcolor: alpha('#dc2626', 0.04), borderBottom: '1px solid', borderColor: alpha('#dc2626', 0.12) }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#dc2626' }}>
              {selectedUsers.size} user{selectedUsers.size !== 1 ? 's' : ''} selected
            </Typography>
            <Button size="small" variant="contained" color="error" startIcon={<DeleteIcon />}
              onClick={() => setBulkDeleteDialog(true)}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem' }}>
              Delete Selected
            </Button>
            <Button size="small" onClick={() => setSelectedUsers(new Set())}
              sx={{ textTransform: 'none', fontSize: '0.78rem', color: '#64748b' }}>
              Clear Selection
            </Button>
          </Box>
        )}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid', borderColor: alpha('#000', 0.08) } }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={allPageSelected}
                    indeterminate={somePageSelected && !allPageSelected}
                    onChange={() => toggleSelectAll(userList)}
                    sx={{ color: '#94a3b8', '&.Mui-checked': { color: PRIMARY } }}
                  />
                </TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                {showCompany && <TableCell>Company</TableCell>}
                <TableCell>Last Login</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow><TableCell colSpan={showCompany ? 8 : 7} align="center" sx={{ py: 6, color: '#94a3b8' }}>No users found</TableCell></TableRow>
              ) : paged.map((user) => (
                <TableRow key={user.id} hover
                  selected={selectedUsers.has(user.id)}
                  sx={{ '&:hover': { bgcolor: alpha(PRIMARY, 0.03) }, '&.Mui-selected': { bgcolor: alpha(PRIMARY, 0.06) } }}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selectedUsers.has(user.id)}
                      onChange={() => toggleSelectUser(user.id)}
                      sx={{ color: '#94a3b8', '&.Mui-checked': { color: PRIMARY } }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(ROLE_COLORS[user.role] || '#6B7280', 0.15), color: ROLE_COLORS[user.role] || '#6B7280', fontSize: '0.8rem', fontWeight: 700 }}>
                        {user.name?.charAt(0)?.toUpperCase() || '?'}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{user.name}</Typography>
                        {user.position && <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8' }}>{user.position}</Typography>}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>{user.email}</TableCell>
                  <TableCell>{roleBadge(user.role)}</TableCell>
                  <TableCell>{statusChip(user.is_active)}</TableCell>
                  {showCompany && <TableCell sx={{ fontSize: '0.8rem' }}>{user.company_name || user.company?.name || '—'}</TableCell>}
                  <TableCell sx={{ fontSize: '0.78rem', color: '#64748b' }}>{fmtDate(user.last_login)}</TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      <Tooltip title="View"><IconButton size="small" onClick={() => handleViewUser(user)}><ViewIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                      <Tooltip title="Edit"><IconButton size="small" onClick={() => handleEditOpen(user)}><EditIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                      <Tooltip title="Reset Password"><IconButton size="small" onClick={() => setResetDialog(user)}><ResetIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => setDeleteDialog(user)}><DeleteIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div" count={userList.length} page={page} rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[5, 10, 25, 50]}
        />
      </>
    );
  };

  // ─── Companies Tab ─────────────────────────────────────────────────────
  const renderCompaniesView = () => {
    if (drillCompany) {
      return (
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <IconButton onClick={handleDrillBack} sx={{ bgcolor: alpha(PRIMARY, 0.06) }}><BackIcon /></IconButton>
            <Box>
              <Breadcrumbs separator={<NavNextIcon sx={{ fontSize: 16 }} />}>
                <Link underline="hover" color="inherit" onClick={handleDrillBack} sx={{ cursor: 'pointer', fontSize: '0.85rem' }}>Companies</Link>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: PRIMARY }}>{drillCompany.name}</Typography>
              </Breadcrumbs>
              <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5 }}>{drillCompany.name} — Users</Typography>
            </Box>
            <Box sx={{ flexGrow: 1 }} />
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setAddCompanyId(drillCompany.id); setAddDialog(true); }}
              sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#166354' }, textTransform: 'none' }}>
              Add User
            </Button>
          </Box>

          {/* Company Info Bar */}
          <Card elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: alpha('#000', 0.06), borderRadius: 3, bgcolor: alpha(PRIMARY, 0.02) }}>
            <CardContent sx={{ py: 2, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <Box>
                <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Company</Typography>
                <Typography sx={{ fontWeight: 700 }}>{drillCompany.name}</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box>
                <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Owner</Typography>
                <Typography sx={{ fontWeight: 600 }}>{drillCompany.owner?.name || '—'}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#64748b' }}>{drillCompany.owner?.email || ''}</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box>
                <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Total Users</Typography>
                <Typography sx={{ fontWeight: 700, color: PRIMARY }}>{drillCompany.totalUsers}</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box>
                <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Active</Typography>
                <Typography sx={{ fontWeight: 700, color: '#1F7A63' }}>{drillCompany.activeUsers}</Typography>
              </Box>
              <Divider orientation="vertical" flexItem />
              <Box>
                <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Plan</Typography>
                <Chip label={drillCompany.plan?.charAt(0).toUpperCase() + drillCompany.plan?.slice(1)} size="small" sx={{ fontWeight: 600, fontSize: '0.72rem' }} />
              </Box>
            </CardContent>
          </Card>

          {drillLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
          ) : (
            <Card elevation={0} sx={{ border: '1px solid', borderColor: alpha('#000', 0.06), borderRadius: 3 }}>
              {renderUserTable(drillUsers, false)}
            </Card>
          )}
        </Box>
      );
    }

    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6" fontWeight={700}>Company-Based View</Typography>
          <Button size="small" startIcon={<RefreshIcon />} onClick={loadCompanies}>Refresh</Button>
        </Box>

        {/* Stats */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2, mb: 3 }}>
          <StatCard title="Total Companies" value={companies.length} icon={<BusinessIcon />} color={PRIMARY} />
          <StatCard title="Total Users" value={companies.reduce((s, c) => s + c.totalUsers, 0)} icon={<PeopleIcon />} color="#0D3D2F" />
          <StatCard title="Company Owners" value={companies.filter(c => c.owner).length} icon={<AdminIcon />} color="#2A9D7E" />
          <StatCard title="Active Users" value={companies.reduce((s, c) => s + c.activeUsers, 0)} icon={<ActiveIcon />} color="#16a34a" />
        </Box>

        {/* Company Cards / Table */}
        <Card elevation={0} sx={{ border: '1px solid', borderColor: alpha('#000', 0.06), borderRadius: 3 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid', borderColor: alpha('#000', 0.08) } }}>
                  <TableCell>Company</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Plan</TableCell>
                  <TableCell>Users</TableCell>
                  <TableCell>Active</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {companies.length === 0 ? (
                  <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6, color: '#94a3b8' }}>No companies found</TableCell></TableRow>
                ) : companies.map((c) => (
                  <TableRow key={c.id} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: alpha(PRIMARY, 0.03) } }} onClick={() => handleDrillInto(c)}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ width: 36, height: 36, bgcolor: alpha(PRIMARY, 0.12), color: PRIMARY, fontSize: '0.85rem', fontWeight: 700 }}>
                          {c.name?.charAt(0)?.toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.name}</Typography>
                          {c.company_code && <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8' }}>{c.company_code}</Typography>}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {c.owner ? (
                        <Box>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{c.owner.name}</Typography>
                          <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8' }}>{c.owner.email}</Typography>
                        </Box>
                      ) : <Typography sx={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</Typography>}
                    </TableCell>
                    <TableCell>
                      <Chip label={c.plan?.charAt(0).toUpperCase() + c.plan?.slice(1)} size="small"
                        sx={{ fontWeight: 600, fontSize: '0.7rem', height: 24 }} />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{c.totalUsers}</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#16a34a' }}>{c.activeUsers}</TableCell>
                    <TableCell>{statusChip(c.is_active)}</TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title="View Users">
                        <Button size="small" variant="outlined" onClick={() => handleDrillInto(c)}
                          sx={{ fontSize: '0.72rem', textTransform: 'none', borderColor: PRIMARY, color: PRIMARY }}>
                          View Users →
                        </Button>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Box>
    );
  };

  // ─── Users Tab ─────────────────────────────────────────────────────────
  const renderUsersView = () => (
    <Box>
      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small" placeholder="Search by name or email" value={searchUser}
          onChange={(e) => { setSearchUser(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: '#94a3b8' }} /></InputAdornment> }}
          sx={{ minWidth: 250 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Role</InputLabel>
          <Select value={filterRole} label="Role" onChange={(e: SelectChangeEvent) => { setFilterRole(e.target.value); setPage(0); }}>
            <MenuItem value="">All Roles</MenuItem>
            <MenuItem value="main_admin">Company Owner</MenuItem>
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="user">User</MenuItem>
            <MenuItem value="sales_engineer">Sales Engineer</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Status</InputLabel>
          <Select value={filterStatus} label="Status" onChange={(e: SelectChangeEvent) => { setFilterStatus(e.target.value); setPage(0); }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Active</MenuItem>
            <MenuItem value="false">Inactive</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ flexGrow: 1 }} />
        <Button size="small" startIcon={<RefreshIcon />} onClick={loadUsers}>Refresh</Button>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 2, mb: 3 }}>
        <StatCard title="Total Users" value={users.length} icon={<PeopleIcon />} color={PRIMARY} />
        <StatCard title="Active" value={users.filter(u => u.is_active).length} icon={<ActiveIcon />} color="#16a34a" />
        <StatCard title="Inactive" value={users.filter(u => !u.is_active).length} icon={<InactiveIcon />} color="#dc2626" />
        <StatCard title="Company Owners" value={users.filter(u => u.role === 'main_admin').length} icon={<AdminIcon />} color="#2A9D7E" />
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: alpha('#000', 0.06), borderRadius: 3 }}>
          {renderUserTable(users, true)}
        </Card>
      )}
    </Box>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Access Control</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: '#94a3b8', mt: 0.3 }}>
            Manage users across all companies with full CRUD operations
          </Typography>
        </Box>
      </Box>

      {!drillCompany && (
        <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(0); }} sx={{ mb: 3, '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 }, '& .Mui-selected': { color: PRIMARY } }}>
          <Tab value="companies" icon={<BusinessIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Companies" />
          <Tab value="users" icon={<PeopleIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="All Users" />
        </Tabs>
      )}

      {tab === 'companies' ? renderCompaniesView() : renderUsersView()}

      {/* ─── View User Dialog ─── */}
      <Dialog open={!!viewUser} onClose={() => setViewUser(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>User Details</DialogTitle>
        <DialogContent dividers>
          {viewUser && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              {[
                { label: 'Name', value: viewUser.name },
                { label: 'Email', value: viewUser.email },
                { label: 'Role', value: ROLE_LABELS[viewUser.role] || viewUser.role },
                { label: 'Status', value: viewUser.is_active ? 'Active' : 'Inactive' },
                { label: 'Company', value: viewUser.company_name || viewUser.company?.name || '—' },
                { label: 'Position', value: viewUser.position || '—' },
                { label: 'Department', value: viewUser.department || '—' },
                { label: 'Phone', value: viewUser.phone || '—' },
                { label: 'Last Login', value: fmtDate(viewUser.last_login) },
                { label: 'Created', value: fmtDate(viewUser.created_at) },
              ].map(({ label, value }) => (
                <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                  <Typography sx={{ fontWeight: 600, color: '#64748b', fontSize: '0.85rem' }}>{label}</Typography>
                  <Typography sx={{ fontSize: '0.85rem' }}>{value}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewUser(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Edit User Dialog ─── */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit User</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField label="Name" fullWidth value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <TextField label="Email" fullWidth value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select value={editForm.role || 'user'} label="Role" onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
                <MenuItem value="main_admin">Company Owner</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="sales_engineer">Sales Engineer</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select value={editForm.is_active ? 'true' : 'false'} label="Status" onChange={(e) => setEditForm({ ...editForm, is_active: e.target.value === 'true' })}>
                <MenuItem value="true">Active</MenuItem>
                <MenuItem value="false">Inactive</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={saving}
            sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#166354' } }}>
            {saving ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Reset Password Dialog ─── */}
      <Dialog open={!!resetDialog} onClose={() => setResetDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Reset Password</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ mb: 2, fontSize: '0.85rem' }}>
            Reset password for <strong>{resetDialog?.name}</strong> ({resetDialog?.email})
          </Typography>
          <TextField label="New Password" type="password" fullWidth value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            helperText="Minimum 6 characters" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setResetDialog(null); setResetPassword(''); }}>Cancel</Button>
          <Button variant="contained" onClick={handleResetSave} disabled={saving || resetPassword.length < 6}
            sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#166354' } }}>
            {saving ? <CircularProgress size={20} /> : 'Reset'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ─── */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#dc2626' }}>Delete User</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize: '0.85rem' }}>
            Are you sure you want to delete <strong>{deleteDialog?.name}</strong> ({deleteDialog?.email})?
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: '#64748b', mt: 1 }}>
            The user will be marked inactive and permanently removed from the system.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Bulk Delete Confirmation Dialog ─── */}
      <Dialog open={bulkDeleteDialog} onClose={() => setBulkDeleteDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: '#dc2626' }}>Delete {selectedUsers.size} User{selectedUsers.size !== 1 ? 's' : ''}</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize: '0.85rem' }}>
            Are you sure you want to delete <strong>{selectedUsers.size}</strong> selected user{selectedUsers.size !== 1 ? 's' : ''}?
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: '#64748b', mt: 1 }}>
            All selected users will be marked inactive and permanently removed from the system. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteDialog(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleBulkDeleteConfirm} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : `Delete ${selectedUsers.size} User${selectedUsers.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Add User Dialog ─── */}
      <Dialog open={addDialog} onClose={() => setAddDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add New User</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            {!drillCompany && (
              <FormControl fullWidth>
                <InputLabel>Company</InputLabel>
                <Select value={addCompanyId} label="Company" onChange={(e) => setAddCompanyId(e.target.value)}>
                  {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <TextField label="Name" fullWidth value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} />
            <TextField label="Email" fullWidth value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} />
            <TextField label="Password" type="password" fullWidth value={addForm.password} onChange={(e) => setAddForm({ ...addForm, password: e.target.value })} helperText="Minimum 6 characters" />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select value={addForm.role} label="Role" onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}>
                <MenuItem value="main_admin">Company Owner</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="sales_engineer">Sales Engineer</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddUser}
            disabled={saving || !addForm.name || !addForm.email || addForm.password.length < 6}
            sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#166354' } }}>
            {saving ? <CircularProgress size={20} /> : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ─── Toast ─── */}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">{toast.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
};

export default PlatformAccessControlPage;
