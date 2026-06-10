import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Card, Chip, Button, TextField, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  IconButton, Tooltip, Avatar, alpha, Dialog, DialogTitle, DialogContent,
  DialogActions, Snackbar, Alert, Menu, MenuItem, CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon, PersonAdd as AddIcon,
  MoreVert as MoreIcon, Edit as EditIcon, Delete as DeleteIcon,
  Block as DisableIcon, CheckCircle as EnableIcon, Refresh as RefreshIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import dayjs from 'dayjs';

const PRIMARY = '#1F7A63';

interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  last_login?: string;
  created_at?: string;
}

const CDPLAdminsPage: React.FC = () => {
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // Menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuAdmin, setMenuAdmin] = useState<PlatformAdmin | null>(null);

  // Add / Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PlatformAdmin | null>(null);

  /* ── Fetch admins ─────────────────────────────────────────────────── */
  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/platform-admin/users');
      setAdmins(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      console.error('Failed to load admins:', err);
      setToast({ message: 'Failed to load admins', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  /* ── Filtered + paginated ─────────────────────────────────────────── */
  const filtered = useMemo(() => {
    if (!search) return admins;
    const q = search.toLowerCase();
    return admins.filter(a => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [admins, search]);

  const paged = useMemo(() => filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), [filtered, page, rowsPerPage]);

  /* ── Stats ────────────────────────────────────────────────────────── */
  const totalAdmins = admins.length;
  const activeAdmins = admins.filter(a => a.is_active).length;

  /* ── Open add/edit dialog ─────────────────────────────────────────── */
  const openAdd = () => {
    setEditId(null);
    setForm({ name: '', email: '', password: '' });
    setDialogOpen(true);
  };

  const openEdit = (admin: PlatformAdmin) => {
    setEditId(admin.id);
    setForm({ name: admin.name, email: admin.email, password: '' });
    setDialogOpen(true);
    closeMenu();
  };

  /* ── Save (create or update) ──────────────────────────────────────── */
  const handleSave = async () => {
    setSaving(true);
    try {
      if (editId) {
        const body: Record<string, string> = {};
        if (form.name) body.name = form.name;
        if (form.email) body.email = form.email;
        if (form.password) body.password = form.password;
        await api.put(`/platform-admin/users/${editId}`, body);
        setToast({ message: 'Admin updated', severity: 'success' });
      } else {
        await api.post('/platform-admin/users', { name: form.name, email: form.email, password: form.password });
        setToast({ message: 'Admin created', severity: 'success' });
      }
      setDialogOpen(false);
      fetchAdmins();
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Operation failed', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /* ── Toggle active ────────────────────────────────────────────────── */
  const handleToggleActive = async (admin: PlatformAdmin) => {
    try {
      await api.put(`/platform-admin/users/${admin.id}`, { is_active: !admin.is_active });
      setAdmins(prev => prev.map(a => a.id === admin.id ? { ...a, is_active: !a.is_active } : a));
      setToast({ message: `Admin ${admin.is_active ? 'disabled' : 'enabled'}`, severity: 'success' });
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed', severity: 'error' });
    }
    closeMenu();
  };

  /* ── Delete ───────────────────────────────────────────────────────── */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/platform-admin/users/${deleteTarget.id}`);
      setToast({ message: 'Admin deleted', severity: 'success' });
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchAdmins();
    } catch (err: any) {
      setToast({ message: err.response?.data?.message || 'Failed to delete', severity: 'error' });
    }
  };

  /* ── Menu ──────────────────────────────────────────────────────────── */
  const openMenu = (e: React.MouseEvent<HTMLElement>, admin: PlatformAdmin) => {
    setMenuAnchor(e.currentTarget);
    setMenuAdmin(admin);
  };
  const closeMenu = () => { setMenuAnchor(null); setMenuAdmin(null); };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Platform Admins
          </Typography>
          <Typography sx={{ fontSize: '0.88rem', color: '#64748b', mt: 0.5 }}>
            Manage platform-level administrator accounts.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button size="small" startIcon={<RefreshIcon />} onClick={fetchAdmins}
            sx={{ textTransform: 'none', fontWeight: 600 }}>Refresh</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}
            sx={{ bgcolor: PRIMARY, textTransform: 'none', fontWeight: 600, borderRadius: 2, '&:hover': { bgcolor: '#166354' } }}>
            Add Admin
          </Button>
        </Box>
      </Box>

      {/* Stat Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
        {[
          { label: 'Total Admins', value: totalAdmins, color: '#166354' },
          { label: 'Active', value: activeAdmins, color: '#16A34A' },
          { label: 'Disabled', value: totalAdmins - activeAdmins, color: '#EF4444' },
        ].map(s => (
          <Card key={s.label} elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E2E8F0' }}>
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</Typography>
            <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, mt: 0.5, color: s.color, lineHeight: 1 }}>{s.value}</Typography>
          </Card>
        ))}
      </Box>

      {/* Search */}
      <Box sx={{ mb: 2 }}>
        <TextField size="small" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: '#94A3B8' }} /></InputAdornment> }}
          sx={{ minWidth: 300 }} />
      </Box>

      {/* Table */}
      <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #E2E8F0' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: alpha(PRIMARY, 0.04) }}>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Last Login</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}><CircularProgress size={28} /></TableCell></TableRow>
              ) : paged.length === 0 ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                  <Typography sx={{ color: '#64748b' }}>{search ? 'No admins match your search' : 'No platform admins found'}</Typography>
                </TableCell></TableRow>
              ) : paged.map(admin => (
                <TableRow key={admin.id} hover sx={{ opacity: admin.is_active ? 1 : 0.55, '&:hover': { bgcolor: alpha(PRIMARY, 0.02) } }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: alpha('#166354', 0.12), color: '#166354', fontSize: '0.85rem', fontWeight: 700 }}>
                        {admin.name?.charAt(0)?.toUpperCase() || 'A'}
                      </Avatar>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{admin.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell><Typography sx={{ fontSize: '0.82rem', color: '#475569' }}>{admin.email}</Typography></TableCell>
                  <TableCell>
                    <Chip size="small" label={admin.is_active ? 'Active' : 'Disabled'}
                      sx={{ fontWeight: 600, fontSize: '0.72rem',
                        bgcolor: admin.is_active ? alpha('#16A34A', 0.1) : alpha('#EF4444', 0.1),
                        color: admin.is_active ? '#16A34A' : '#EF4444' }} />
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>
                      {admin.last_login ? dayjs(admin.last_login).format('MMM D, YYYY h:mm A') : 'Never'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>
                      {admin.created_at ? dayjs(admin.created_at).format('MMM D, YYYY') : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={e => openMenu(e, admin)}>
                      <MoreIcon sx={{ fontSize: 18, color: '#94A3B8' }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {filtered.length > rowsPerPage && (
          <TablePagination component="div" count={filtered.length} page={page} rowsPerPage={rowsPerPage}
            onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[5, 10, 25]} />
        )}
      </Card>

      {/* Row Actions Menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 160, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' } }}>
        <MenuItem onClick={() => menuAdmin && openEdit(menuAdmin)} sx={{ fontSize: 13, gap: 1 }}>
          <EditIcon sx={{ fontSize: 16, color: '#94A3B8' }} /> Edit
        </MenuItem>
        <MenuItem onClick={() => menuAdmin && handleToggleActive(menuAdmin)} sx={{ fontSize: 13, gap: 1 }}>
          {menuAdmin?.is_active
            ? <><DisableIcon sx={{ fontSize: 16, color: '#F59E0B' }} /> Disable</>
            : <><EnableIcon sx={{ fontSize: 16, color: '#16A34A' }} /> Enable</>}
        </MenuItem>
        <MenuItem onClick={() => { setDeleteTarget(menuAdmin); setDeleteOpen(true); closeMenu(); }} sx={{ fontSize: 13, gap: 1, color: '#EF4444' }}>
          <DeleteIcon sx={{ fontSize: 16 }} /> Delete
        </MenuItem>
      </Menu>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>{editId ? 'Edit Admin' : 'Add Platform Admin'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required fullWidth />
          <TextField label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required fullWidth />
          <TextField label={editId ? 'New Password (leave blank to keep current)' : 'Password'} type="password"
            value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
            required={!editId} fullWidth helperText="Minimum 6 characters" />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setDialogOpen(false)} variant="outlined" sx={{ borderColor: '#E2E8F0', color: '#64748B' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}
            disabled={saving || !form.name || !form.email || (!editId && form.password.length < 6)}
            sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#166354' } }}>
            {saving ? <CircularProgress size={20} /> : editId ? 'Save Changes' : 'Create Admin'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Admin</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem', color: '#475569' }}>
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} sx={{ color: '#64748B' }}>Cancel</Button>
          <Button variant="contained" onClick={handleDelete}
            sx={{ bgcolor: '#EF4444', '&:hover': { bgcolor: '#DC2626' } }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : <span />}
      </Snackbar>
    </Box>
  );
};

export default CDPLAdminsPage;
