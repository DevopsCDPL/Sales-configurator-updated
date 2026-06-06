import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Button, TextField, IconButton, Alert, InputAdornment, Snackbar,
  Tooltip, alpha, Skeleton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Menu, MenuItem, ListItemIcon, ListItemText, Divider,
  Select, FormControl, InputLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon, Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  MoreVert as MoreIcon,
  Refresh as RefreshIcon, Clear as ClearIcon,
  People as PeopleIcon,
  PersonAdd as PersonAddIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Group as GroupIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { userManagementService, UserRecord, CreateUserData, UpdateUserData } from '../services/userManagementService';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

/* ─── constants ───────────────────────────────────────────────────── */
const ROWS_PER_PAGE = 10;
const ROLE_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  main_admin: { label: 'Owner', bg: '#fef3c7', fg: '#92400e' },
  admin: { label: 'Admin', bg: '#dbeafe', fg: '#0D3D2F' },
  user: { label: 'User', bg: '#f1f5f9', fg: '#475569' },
  sales_engineer: { label: 'Sales Engineer', bg: '#E8F7F2', fg: '#0D3D2F' },
};
const PAL = ['#1F7A63', '#0891b2', '#ea580c', '#166354', '#dc2626', '#1F7A63', '#d97706', '#059669'];
const hashColor = (s: string) => PAL[Math.abs([...(s || 'N')].reduce((a, c) => a + c.charCodeAt(0), 0)) % PAL.length];
const initials = (s: string) => (s || 'N').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

/* ─── field styling ───────────────────────────────────────────────── */
const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px', bgcolor: 'var(--bg-input)', fontSize: 13,
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha('#1F7A63', 0.5) },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#1F7A63', borderWidth: 2 },
  },
  '& .MuiInputLabel-root': { fontSize: 13 },
  '& .MuiInputLabel-root.Mui-focused': { color: '#1F7A63' },
};

/* ─── stat card ───────────────────────────────────────────────────── */
const MiniStatCard: React.FC<{
  icon: React.ReactNode; label: string; value: string | number; borderColor: string;
}> = ({ icon, label, value, borderColor }) => (
  <Box sx={{
    flex: '1 1 0', minWidth: 170, p: '14px 16px', bgcolor: 'var(--card)', borderRadius: 'var(--radius)',
    border: '1px solid var(--border)', borderLeft: `3px solid ${borderColor}`,
    boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: '12px',
    transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 'var(--shadow)' },
  }}>
    <Box sx={{
      width: 38, height: 38, borderRadius: 'var(--radius-sm)', bgcolor: alpha(borderColor, 0.08),
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{
        fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.06em', lineHeight: 1, mb: '4px', whiteSpace: 'nowrap',
      }}>{label}</Typography>
      <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>
        {value}
      </Typography>
    </Box>
  </Box>
);

/* ─── role badge ──────────────────────────────────────────────────── */
const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const r = ROLE_LABELS[role] || { label: role, bg: '#f1f5f9', fg: '#475569' };
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: '4px', px: '8px', py: '2px',
      borderRadius: 'var(--radius-sm)', bgcolor: r.bg, border: `1px solid ${alpha(r.fg, 0.12)}`,
    }}>
      <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: r.fg, lineHeight: 1 }}>
        {r.label}
      </Typography>
    </Box>
  );
};

/* ─── status badge ────────────────────────────────────────────────── */
const StatusBadge: React.FC<{ active: boolean }> = ({ active }) => (
  <Box sx={{
    display: 'inline-flex', alignItems: 'center', gap: '4px', px: '7px', py: '2px',
    borderRadius: 'var(--radius-sm)',
    bgcolor: active ? alpha('#16A34A', 0.06) : alpha('#dc2626', 0.06),
  }}>
    <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: active ? '#16A34A' : '#dc2626' }} />
    <Typography sx={{
      fontSize: '0.65rem', fontWeight: 700, lineHeight: 1,
      color: active ? '#16A34A' : '#dc2626',
    }}>
      {active ? 'Active' : 'Disabled'}
    </Typography>
  </Box>
);

/* ═════════════════════════════════════════════════════════════════════ */
const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const canWrite = currentUser?.role === 'main_admin' || currentUser?.role === 'admin';

  /* data state */
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  /* filters */
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  /* add/edit dialog */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  /* delete confirmation */
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* action menu */
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuUser, setMenuUser] = useState<UserRecord | null>(null);

  /* form */
  const [formData, setFormData] = useState({
    name: '', email: '', password: '', role: 'user', phone: '', position: '', team_id: '',
  });

  useEffect(() => { loadData(); }, []);
  useEffect(() => { setPage(1); }, [searchQuery, roleFilter, statusFilter, teamFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, teamsData] = await Promise.all([
        userManagementService.getAll(),
        userManagementService.getTeams().catch(() => []),
      ]);
      setUsers(usersData || []);
      setTeams(teamsData || []);
    } catch {
      setError('Error loading users');
    } finally {
      setLoading(false);
    }
  };

  /* ─── metrics ────────────────────────────────────────────────────── */
  const total = users.length;
  const active = users.filter(u => u.is_active).length;
  const admins = users.filter(u => u.role === 'admin' || u.role === 'main_admin').length;
  const disabled = users.filter(u => !u.is_active).length;

  /* ─── team lookup ────────────────────────────────────────────────── */
  const getTeamName = useCallback((u: UserRecord) => {
    const memberships = (u as any).teamMemberships;
    if (memberships && memberships.length > 0) {
      const team = memberships[0]?.team;
      return team?.name || '—';
    }
    return '—';
  }, []);

  const getTeamId = useCallback((u: UserRecord) => {
    const memberships = (u as any).teamMemberships;
    if (memberships && memberships.length > 0) {
      return memberships[0]?.team_id || '';
    }
    return '';
  }, []);

  /* ─── filters ────────────────────────────────────────────────────── */
  const clearFilters = useCallback(() => {
    setSearchQuery(''); setRoleFilter('all'); setStatusFilter('all'); setTeamFilter('all'); setPage(1);
  }, []);
  const hasFilters = searchQuery || roleFilter !== 'all' || statusFilter !== 'all' || teamFilter !== 'all';

  const filtered = useMemo(() => {
    return users.filter(u => {
      const q = searchQuery.toLowerCase();
      const ms = !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
      const mR = roleFilter === 'all' || u.role === roleFilter;
      const mS = statusFilter === 'all' ||
        (statusFilter === 'active' && u.is_active) ||
        (statusFilter === 'disabled' && !u.is_active);
      const mT = teamFilter === 'all' || getTeamId(u) === teamFilter;
      return ms && mR && mS && mT;
    }).sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
  }, [users, searchQuery, roleFilter, statusFilter, teamFilter, getTeamId]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, page]);

  /* ─── dialog helpers ─────────────────────────────────────────────── */
  const handleOpenDialog = (u?: UserRecord) => {
    if (u) {
      setEditingUser(u);
      setFormData({
        name: u.name || '',
        email: u.email || '',
        password: '',
        role: u.role || 'user',
        phone: u.phone || '',
        position: u.position || '',
        team_id: getTeamId(u),
      });
    } else {
      setEditingUser(null);
      setFormData({ name: '', email: '', password: '', role: 'user', phone: '', position: '', team_id: '' });
    }
    setDialogOpen(true);
    setDialogError(null);
    setShowPassword(false);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingUser(null);
    setDialogError(null);
    setSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) { setDialogError('Name is required'); return; }
    if (!formData.email.trim()) { setDialogError('Email is required'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) { setDialogError('Valid email is required'); return; }
    if (!editingUser && !formData.password) { setDialogError('Password is required for new users'); return; }
    if (!editingUser && formData.password.length < 6) { setDialogError('Password must be at least 6 characters'); return; }

    setSubmitting(true);
    setDialogError(null);
    try {
      if (editingUser) {
        const updatePayload: UpdateUserData = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          role: formData.role,
          phone: formData.phone || undefined,
          position: formData.position || undefined,
        };
        await userManagementService.update(editingUser.id, updatePayload);

        // Handle team assignment change
        const currentTeamId = getTeamId(editingUser);
        if (formData.team_id !== currentTeamId) {
          if (currentTeamId) {
            await userManagementService.removeFromTeam(currentTeamId, editingUser.id).catch(() => {});
          }
          if (formData.team_id) {
            await userManagementService.assignTeam(formData.team_id, editingUser.id).catch(() => {});
          }
        }
        setSuccessMsg('User updated successfully');
      } else {
        const createPayload: CreateUserData = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          password: formData.password,
          role: formData.role,
          phone: formData.phone || undefined,
          position: formData.position || undefined,
        };
        const newUser = await userManagementService.create(createPayload);

        // Assign team if selected
        if (formData.team_id) {
          await userManagementService.assignTeam(formData.team_id, newUser.id).catch(() => {});
        }
        setSuccessMsg('User created successfully');
      }
      handleCloseDialog();
      loadData();
    } catch (err: any) {
      setDialogError(
        err.response?.data?.errors?.map((e: any) => e.message).join(', ') ||
        err.response?.data?.message ||
        'Error saving user'
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── toggle status ──────────────────────────────────────────────── */
  const handleToggleStatus = async (u: UserRecord) => {
    try {
      await userManagementService.update(u.id, { is_active: !u.is_active });
      setSuccessMsg(u.is_active ? 'User disabled' : 'User enabled');
      loadData();
    } catch {
      setError('Failed to update user status');
    }
  };

  /* ─── delete ─────────────────────────────────────────────────────── */
  const handleDelete = (u: UserRecord) => setDeleteTarget(u);
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await userManagementService.delete(deleteTarget.id);
      setSuccessMsg('User deleted');
      setDeleteTarget(null);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error deleting user');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  /* ─── export ─────────────────────────────────────────────────────── */
  const exportToCSV = () => {
    const headers = ['Name', 'Email', 'Role', 'Team', 'Status', 'Last Login', 'Created'];
    const rows = filtered.map(u => [
      u.name || '', u.email || '',
      ROLE_LABELS[u.role]?.label || u.role,
      getTeamName(u),
      u.is_active ? 'Active' : 'Disabled',
      u.last_login ? dayjs(u.last_login).format('YYYY-MM-DD HH:mm') : 'Never',
      u.created_at ? dayjs(u.created_at).format('YYYY-MM-DD') : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `users-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
  };

  /* ═══════════════════════════════════════════════════════════════════ */
  return (
    <Box sx={{ pb: 4 }} className="animate-fadeIn">

      {/* ═══ HEADER ═══════════════════════════════════════════════════ */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '20px', flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
            User Management
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'var(--muted)', mt: '2px' }}>
            Manage workspace users, assign roles and teams
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={loadData}
              sx={{
                color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                width: 34, height: 34, transition: 'all 0.15s',
                '&:hover': { borderColor: 'var(--primary)', color: 'var(--primary)', bgcolor: 'var(--primary-bg)' },
              }}>
              <RefreshIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Button variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 15 }} />} onClick={exportToCSV}
            sx={{
              textTransform: 'none', borderRadius: 'var(--radius-sm)', borderColor: 'var(--border)',
              color: 'var(--secondary-foreground)', fontWeight: 600, fontSize: '0.78rem', height: 34,
              transition: 'all 0.15s',
              '&:hover': { borderColor: 'var(--primary)', color: 'var(--primary)', bgcolor: 'var(--primary-bg)' },
            }}>
            Export
          </Button>
          {canWrite && (
            <Button variant="contained" startIcon={<AddIcon sx={{ fontSize: 17 }} />} onClick={() => handleOpenDialog()}
              sx={{
                bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-light)' },
                textTransform: 'none', fontWeight: 700, borderRadius: 'var(--radius-sm)',
                px: 2, height: 34, boxShadow: 'none', fontSize: '0.78rem',
              }}>
              Add User
            </Button>
          )}
        </Box>
      </Box>

      {/* ═══ STAT CARDS ═══════════════════════════════════════════════ */}
      <Box sx={{ display: 'flex', gap: '14px', mb: '20px', flexWrap: 'wrap' }}>
        <MiniStatCard icon={<PeopleIcon sx={{ fontSize: 20, color: '#0EA5E9' }} />}
          label="Total Users" value={total} borderColor="#0EA5E9" />
        <MiniStatCard icon={<CheckCircleIcon sx={{ fontSize: 20, color: '#16A34A' }} />}
          label="Active" value={active} borderColor="#16A34A" />
        <MiniStatCard icon={<PersonAddIcon sx={{ fontSize: 20, color: '#166354' }} />}
          label="Admins" value={admins} borderColor="#166354" />
        <MiniStatCard icon={<BlockIcon sx={{ fontSize: 20, color: '#DC2626' }} />}
          label="Disabled" value={disabled} borderColor="#DC2626" />
      </Box>

      {error && <Alert severity="error" sx={{ mb: '20px', borderRadius: 'var(--radius-sm)' }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ═══ FILTER TOOLBAR ═══════════════════════════════════════════ */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '20px', flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="Search by name or email…"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          sx={{
            flex: '1 1 280px', maxWidth: 360,
            '& .MuiOutlinedInput-root': {
              borderRadius: 'var(--radius)', fontSize: '0.8rem', height: 38, bgcolor: 'var(--card)',
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
            },
          }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 17, color: 'var(--muted)' }} /></InputAdornment>,
          }}
        />

        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel sx={{ fontSize: '0.78rem' }}>Role</InputLabel>
          <Select value={roleFilter} label="Role" onChange={e => setRoleFilter(e.target.value as string)}
            sx={{ borderRadius: 'var(--radius)', fontSize: '0.78rem', height: 38, bgcolor: 'var(--card)' }}>
            <MenuItem value="all">All Roles</MenuItem>
            <MenuItem value="main_admin">Owner</MenuItem>
            <MenuItem value="admin">Admin</MenuItem>
            <MenuItem value="sales_engineer">Manager</MenuItem>
            <MenuItem value="user">User</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel sx={{ fontSize: '0.78rem' }}>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value as string)}
            sx={{ borderRadius: 'var(--radius)', fontSize: '0.78rem', height: 38, bgcolor: 'var(--card)' }}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="disabled">Disabled</MenuItem>
          </Select>
        </FormControl>

        {teams.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel sx={{ fontSize: '0.78rem' }}>Team</InputLabel>
            <Select value={teamFilter} label="Team" onChange={e => setTeamFilter(e.target.value as string)}
              sx={{ borderRadius: 'var(--radius)', fontSize: '0.78rem', height: 38, bgcolor: 'var(--card)' }}>
              <MenuItem value="all">All Teams</MenuItem>
              {teams.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
            </Select>
          </FormControl>
        )}

        {hasFilters && (
          <Button size="small" startIcon={<ClearIcon sx={{ fontSize: 14 }} />} onClick={clearFilters}
            sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', borderRadius: 'var(--radius-sm)', height: 38 }}>
            Clear
          </Button>
        )}
      </Box>

      {/* ═══ TABLE ════════════════════════════════════════════════════ */}
      <TableContainer sx={{
        borderRadius: 'var(--radius)', border: '1px solid var(--border)', bgcolor: 'var(--card)',
        boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
      }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{
              bgcolor: 'var(--accent)',
              '& th': {
                fontWeight: 700, fontSize: '0.65rem', color: 'var(--muted-foreground)',
                textTransform: 'uppercase', letterSpacing: '.08em',
                borderBottom: '1px solid var(--border)', py: '10px', px: '14px',
                position: 'sticky', top: 0, bgcolor: 'var(--accent)', zIndex: 1,
              },
            }}>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Team</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Last Active</TableCell>
              <TableCell align="right" sx={{ pr: '20px !important' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j} sx={{ px: '14px' }}><Skeleton height={22} /></TableCell>
                ))}
              </TableRow>
            )) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: 'center', py: 8, borderBottom: 'none' }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Box sx={{
                      width: 64, height: 64, borderRadius: '50%', bgcolor: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5,
                    }}>
                      <PeopleIcon sx={{ fontSize: 28, color: 'var(--muted)' }} />
                    </Box>
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--secondary-foreground)', mb: 0.5 }}>
                      {hasFilters ? 'No users match your filters' : 'No users yet'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--muted)', mb: 2 }}>
                      {hasFilters ? 'Try adjusting your filter criteria.' : 'Add your first user to get started.'}
                    </Typography>
                    {hasFilters && (
                      <Button size="small" variant="outlined" onClick={clearFilters}
                        sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 'var(--radius-sm)', borderColor: 'var(--border)', color: 'var(--secondary-foreground)' }}>
                        Clear Filters
                      </Button>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ) : paginated.map((u, idx) => {
              const c = hashColor(u.name || '');
              const isSelf = u.id === currentUser?.id;
              return (
                <TableRow key={u.id}
                  sx={{
                    bgcolor: idx % 2 === 1 ? alpha('#F1F5F9', 0.5) : 'transparent',
                    borderLeft: '3px solid transparent',
                    transition: 'all 0.15s ease',
                    '@keyframes rowIn': { from: { opacity: 0 }, to: { opacity: 1 } },
                    animation: `rowIn 0.2s ease ${idx * 0.03}s both`,
                    '&:hover': { bgcolor: alpha('#1F7A63', 0.03), borderLeftColor: 'var(--primary)' },
                    '& td': {
                      fontSize: '0.8rem', color: 'var(--card-foreground)', py: '10px', px: '14px',
                      borderBottom: '1px solid var(--border-light)',
                    },
                  }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Box sx={{
                        width: 34, height: 34, borderRadius: '50%', flexShrink: 0, bgcolor: c,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Typography sx={{ color: '#fff', fontSize: '0.7rem', fontWeight: 700, lineHeight: 1 }}>
                          {initials(u.name || '')}
                        </Typography>
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{
                          fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {u.name}
                          {isSelf && (
                            <Chip label="You" size="small" sx={{
                              ml: 1, height: 16, fontSize: '0.55rem', fontWeight: 700,
                              bgcolor: alpha('#1F7A63', 0.08), color: '#1F7A63',
                              '& .MuiChip-label': { px: 0.6 },
                            }} />
                          )}
                        </Typography>
                        {u.position && (
                          <Typography sx={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{u.position}</Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--secondary-foreground)' }}>
                      {u.email}
                    </Typography>
                  </TableCell>
                  <TableCell><RoleBadge role={u.role} /></TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--secondary-foreground)' }}>
                      {getTeamName(u)}
                    </Typography>
                  </TableCell>
                  <TableCell><StatusBadge active={u.is_active} /></TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {u.last_login ? dayjs(u.last_login).fromNow() : 'Never'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ pr: '20px !important' }}>
                    {canWrite && !isSelf && (
                      <IconButton size="small"
                        onClick={e => { setMenuAnchor(e.currentTarget); setMenuUser(u); }}
                        sx={{
                          color: 'var(--muted)', width: 30, height: 30, border: '1px solid transparent',
                          '&:hover': { borderColor: 'var(--border)', bgcolor: 'var(--accent)' },
                        }}>
                        <MoreIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ═══ PAGINATION ═══════════════════════════════════════════════ */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: '16px', px: '4px' }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            Showing {((page - 1) * ROWS_PER_PAGE) + 1}–{Math.min(page * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
          </Typography>
          <Box sx={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <IconButton size="small" disabled={page === 1} onClick={() => setPage(p => p - 1)}
              sx={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <ChevronLeftIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--foreground)', px: 1 }}>
              {page} / {totalPages}
            </Typography>
            <IconButton size="small" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
              sx={{ width: 30, height: 30, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <ChevronRightIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        </Box>
      )}

      {/* ═══ ACTION MENU ══════════════════════════════════════════════ */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => { setMenuAnchor(null); setMenuUser(null); }}
        PaperProps={{
          sx: {
            borderRadius: 'var(--radius)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            border: '1px solid var(--border)', minWidth: 180,
          },
        }}
      >
        <MenuItem onClick={() => { setMenuAnchor(null); if (menuUser) handleOpenDialog(menuUser); }}
          sx={{ fontSize: '0.8rem', py: 1 }}>
          <ListItemIcon><EditIcon sx={{ fontSize: 16 }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>Edit User</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); if (menuUser) handleToggleStatus(menuUser); }}
          sx={{ fontSize: '0.8rem', py: 1 }}>
          <ListItemIcon>
            {menuUser?.is_active
              ? <BlockIcon sx={{ fontSize: 16, color: '#dc2626' }} />
              : <CheckCircleIcon sx={{ fontSize: 16, color: '#16A34A' }} />
            }
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
            {menuUser?.is_active ? 'Disable User' : 'Enable User'}
          </ListItemText>
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem onClick={() => { setMenuAnchor(null); if (menuUser) handleDelete(menuUser); }}
          sx={{ fontSize: '0.8rem', py: 1, color: '#dc2626' }}>
          <ListItemIcon><DeleteIcon sx={{ fontSize: 16, color: '#dc2626' }} /></ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: '0.8rem', color: '#dc2626' }}>Delete User</ListItemText>
        </MenuItem>
      </Menu>

      {/* ═══ ADD/EDIT DIALOG ══════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '14px', maxHeight: '90vh' } }}>
        <Box sx={{ height: 3, bgcolor: 'var(--primary)' }} />
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 3.5, pt: 2.5, pb: 2, borderBottom: '1px solid var(--border)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 38, height: 38, borderRadius: '8px', bgcolor: 'var(--primary-bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${alpha('#1F7A63', 0.15)}`,
            }}>
              <PersonAddIcon sx={{ fontSize: 18, color: 'var(--primary)' }} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 17, color: 'var(--foreground)', lineHeight: 1.2 }}>
                {editingUser ? 'Edit User' : 'Add User'}
              </Typography>
              <Typography sx={{ fontSize: 12, color: 'var(--muted)' }}>
                {editingUser ? 'Update user details and permissions' : 'Create a new workspace user'}
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={handleCloseDialog} sx={{ color: 'var(--muted)' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 3.5, pt: 2.5, pb: 1 }}>
          {dialogError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: '8px', fontSize: '0.8rem' }} onClose={() => setDialogError(null)}>
              {dialogError}
            </Alert>
          )}
          <Grid container spacing={2.5}>
            <Grid item xs={12} md={6}>
              <TextField label="Name" value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                fullWidth required size="small" sx={fieldSx} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Email" type="email" value={formData.email}
                onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                fullWidth required size="small" sx={fieldSx} />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small" sx={fieldSx}>
                <InputLabel>Role</InputLabel>
                <Select value={formData.role} label="Role"
                  onChange={e => setFormData(f => ({ ...f, role: e.target.value as string }))}>
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="sales_engineer">Sales Engineer</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {teams.length > 0 && (
              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small" sx={fieldSx}>
                  <InputLabel>Team (Optional)</InputLabel>
                  <Select value={formData.team_id} label="Team (Optional)"
                    onChange={e => setFormData(f => ({ ...f, team_id: e.target.value as string }))}>
                    <MenuItem value="">No Team</MenuItem>
                    {teams.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
            )}
            {!editingUser && (
              <Grid item xs={12}>
                <TextField label="Password" type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={e => setFormData(f => ({ ...f, password: e.target.value }))}
                  fullWidth required size="small" sx={fieldSx}
                  helperText="Minimum 6 characters"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowPassword(!showPassword)} edge="end">
                          {showPassword ? <VisibilityOffIcon sx={{ fontSize: 18 }} /> : <VisibilityIcon sx={{ fontSize: 18 }} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
            )}
            <Grid item xs={12} md={6}>
              <TextField label="Phone (Optional)" value={formData.phone}
                onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                fullWidth size="small" sx={fieldSx} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Position (Optional)" value={formData.position}
                onChange={e => setFormData(f => ({ ...f, position: e.target.value }))}
                fullWidth size="small" sx={fieldSx} placeholder="e.g. Project Manager" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3.5, py: 2, borderTop: '1px solid var(--border)' }}>
          <Button onClick={handleCloseDialog} disabled={submitting}
            sx={{
              textTransform: 'none', fontWeight: 600, fontSize: '0.82rem',
              color: 'var(--muted)', borderRadius: '8px',
            }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSubmit} disabled={submitting}
            sx={{
              bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-light)' },
              textTransform: 'none', fontWeight: 700, fontSize: '0.82rem',
              borderRadius: '8px', px: 3, boxShadow: 'none',
            }}>
            {submitting ? 'Saving…' : editingUser ? 'Update User' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ DELETE CONFIRMATION ══════════════════════════════════════ */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '14px' } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pt: 3 }}>Delete User</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.85rem', color: 'var(--secondary-foreground)' }}>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}
            sx={{ textTransform: 'none', fontWeight: 600, color: 'var(--muted)', borderRadius: '8px' }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmDelete} disabled={deleting}
            sx={{
              bgcolor: '#dc2626', '&:hover': { bgcolor: '#b91c1c' },
              textTransform: 'none', fontWeight: 700, borderRadius: '8px', boxShadow: 'none',
            }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ SUCCESS SNACKBAR ═════════════════════════════════════════ */}
      <Snackbar
        open={Boolean(successMsg)}
        autoHideDuration={3000}
        onClose={() => setSuccessMsg('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={successMsg}
      />
    </Box>
  );
};

export default UsersPage;
