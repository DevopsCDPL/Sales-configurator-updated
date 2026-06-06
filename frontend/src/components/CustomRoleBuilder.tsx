import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tooltip, Alert, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, alpha, Stack,
  Checkbox, Divider, Avatar, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as CloneIcon,
  Save as SaveIcon,
  Security as SecurityIcon,
  Close as CloseIcon,
  Shield as ShieldIcon,
  VpnKey as KeyIcon,
  AdminPanelSettings as AdminIcon,
  Person as PersonIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const PRIMARY = '#1F7A63';

const ACTION_LABELS: Record<string, string> = {
  view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', export: 'Export', approve: 'Approve',
};

interface PermissionAction { view: boolean; create: boolean; edit: boolean; delete: boolean; export: boolean; approve: boolean; }
interface RolePermissions { [module: string]: PermissionAction; }
interface CustomRole {
  id: string; name: string; description: string; company_id: string; is_system: boolean;
  base_role: string; permissions: RolePermissions; conditions: any[]; color: string;
  icon: string; priority: number; created_by: string; createdAt: string;
  creator?: { name: string }; company?: { name: string };
}

const EMPTY_PERM: PermissionAction = { view: false, create: false, edit: false, delete: false, export: false, approve: false };
const BASE_ROLES = ['user', 'admin'];
const COLORS = ['#1F7A63', '#0D3D2F', '#2A9D7E', '#EF4444', '#b45309', '#1F7A63', '#be185d', '#6B7280'];

/* ── Stat Card ───────────────────────────────── */
const StatCard: React.FC<{
  label: string; value: number | string; color: string; icon: React.ReactElement<any>; subtext?: string;
}> = ({ label, value, color, icon, subtext }) => (
  <Card elevation={0} sx={{
    border: '1px solid var(--border)', borderRadius: '12px', height: '100%', bgcolor: 'var(--bg-surface)',
    transition: 'all .25s', position: 'relative', overflow: 'hidden',
    '&:hover': { boxShadow: '0 6px 24px rgba(0,0,0,.06)', transform: 'translateY(-2px)' },
  }}>
    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: color, borderRadius: '16px 16px 0 0' }} />
    <CardContent sx={{ p: '20px 18px 16px !important' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .8, lineHeight: 1, mb: .8 }}>{label}</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 900, color: '#1F2937', lineHeight: 1, letterSpacing: -.5 }}>{value}</Typography>
          {subtext && <Typography sx={{ fontSize: 11.5, color: '#94a3b8', mt: .5, fontWeight: 500 }}>{subtext}</Typography>}
        </Box>
        <Box sx={{
          width: 42, height: 42, borderRadius: '12px', bgcolor: alpha(color, 0.08),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1.5px solid ${alpha(color, 0.15)}`,
        }}>
          {React.cloneElement(icon, { sx: { fontSize: 20, color } })}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const CustomRoleBuilder: React.FC = () => {
  useAuth();
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [schema, setSchema] = useState<{ modules: string[]; actions: string[] }>({ modules: [], actions: [] });
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [snack, setSnack] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; role: CustomRole | null }>({ open: false, role: null });
  const [form, setForm] = useState({
    name: '', description: '', base_role: 'user', color: PRIMARY, priority: 10,
    permissions: {} as RolePermissions,
  });

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/custom-roles');
      setRoles(data.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const loadSchema = useCallback(async () => {
    try {
      const { data } = await api.get('/custom-roles/schema');
      setSchema(data.data || { modules: [], actions: [] });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadRoles(); loadSchema(); }, [loadRoles, loadSchema]);

  const openCreate = () => {
    const perms: RolePermissions = {};
    schema.modules.forEach(m => { perms[m] = { ...EMPTY_PERM }; });
    setForm({ name: '', description: '', base_role: 'user', color: PRIMARY, priority: 10, permissions: perms });
    setEditing(null); setIsNew(true);
  };

  const openEdit = (role: CustomRole) => {
    const perms: RolePermissions = {};
    schema.modules.forEach(m => { perms[m] = role.permissions?.[m] ? { ...role.permissions[m] } : { ...EMPTY_PERM }; });
    setForm({ name: role.name, description: role.description || '', base_role: role.base_role, color: role.color || PRIMARY, priority: role.priority || 10, permissions: perms });
    setEditing(role); setIsNew(false);
  };

  const handleSave = async () => {
    try {
      if (isNew) {
        await api.post('/custom-roles', form);
        setSnack('Role created successfully');
      } else if (editing) {
        await api.put(`/custom-roles/${editing.id}`, form);
        setSnack('Role updated successfully');
      }
      setEditing(null); setIsNew(false); loadRoles();
    } catch (e: any) { setSnack(e.response?.data?.message || 'Operation failed'); }
  };

  const handleDelete = async () => {
    if (!deleteDialog.role) return;
    try {
      await api.delete(`/custom-roles/${deleteDialog.role.id}`);
      setSnack('Role deleted');
      setDeleteDialog({ open: false, role: null }); loadRoles();
    } catch (e: any) { setSnack(e.response?.data?.message || 'Delete failed'); }
  };

  const handleClone = async (role: CustomRole) => {
    try {
      await api.post(`/custom-roles/${role.id}/clone`, { name: `${role.name} (Copy)` });
      setSnack('Role cloned'); loadRoles();
    } catch { setSnack('Clone failed'); }
  };

  const togglePerm = (mod: string, action: string) => {
    setForm(prev => ({
      ...prev,
      permissions: { ...prev.permissions, [mod]: { ...prev.permissions[mod], [action]: !prev.permissions[mod]?.[action as keyof PermissionAction] } },
    }));
  };

  const toggleAllModulePerms = (mod: string, checked: boolean) => {
    const p: PermissionAction = { view: checked, create: checked, edit: checked, delete: checked, export: checked, approve: checked };
    setForm(prev => ({ ...prev, permissions: { ...prev.permissions, [mod]: p } }));
  };

  const getPermCount = (perms: RolePermissions): number =>
    Object.values(perms || {}).reduce((s, m) => s + Object.values(m).filter(Boolean).length, 0);

  const showEditor = isNew || editing;
  const systemRoles = roles.filter(r => r.is_system);
  const customRoles = roles.filter(r => !r.is_system);
  const totalPerms = roles.reduce((s, r) => s + getPermCount(r.permissions), 0);

  return (
    <Box sx={{ pb: 4, minHeight: '100vh', bgcolor: 'var(--bg-canvas)' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: 26, fontWeight: 800, color: '#1F2937', letterSpacing: -.3, lineHeight: 1.2 }}>
            Custom Role Builder
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#94a3b8', mt: .4 }}>Create and manage dynamic roles with granular permissions</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<RefreshIcon sx={{ fontSize: 16 }} />} onClick={loadRoles}
            variant="outlined" size="small"
            sx={{ textTransform: 'none', borderRadius: '10px', borderColor: 'var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13 }}>
            Refresh
          </Button>
          {!showEditor && (
            <Button startIcon={<AddIcon />} onClick={openCreate} variant="contained" size="small"
              sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#1F7A63' }, textTransform: 'none', fontWeight: 700, borderRadius: '10px', boxShadow: 'none', fontSize: 13 }}>
              New Role
            </Button>
          )}
        </Box>
      </Box>

      {snack && <Alert severity="info" onClose={() => setSnack('')} sx={{ mb: 2, borderRadius: '12px' }}>{snack}</Alert>}

      {/* Stat Cards */}
      {!showEditor && roles.length > 0 && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <StatCard label="Total Roles" value={roles.length} color={PRIMARY} icon={<ShieldIcon />}
              subtext={`${systemRoles.length} system, ${customRoles.length} custom`} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard label="Total Permissions" value={totalPerms} color="#128A3A" icon={<KeyIcon />}
              subtext={`across ${schema.modules.length} modules`} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard label="Modules" value={schema.modules.length} color="#2A9D7E" icon={<AdminIcon />}
              subtext={`${Object.keys(ACTION_LABELS).length} actions each`} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard label="Custom Roles" value={customRoles.length} color="#1F7A63" icon={<PersonIcon />}
              subtext="user-defined roles" />
          </Grid>
        </Grid>
      )}

      {/* Role Editor */}
      {showEditor && (
        <Card elevation={0} sx={{ border: `2px solid ${PRIMARY}`, borderRadius: '16px', mb: 3 }}>
          <CardContent sx={{ p: '24px !important' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ bgcolor: alpha(PRIMARY, .08), borderRadius: '10px', p: .6, display: 'flex' }}>
                  <ShieldIcon sx={{ fontSize: 18, color: PRIMARY }} />
                </Box>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>{isNew ? 'Create New Role' : 'Edit Role'}</Typography>
              </Box>
              <IconButton onClick={() => { setEditing(null); setIsNew(false); }} size="small" sx={{ color: '#94a3b8' }}>
                <CloseIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Role Name" value={form.name} size="small"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField fullWidth label="Description" value={form.description} size="small"
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
              </Grid>
              <Grid item xs={12} sm={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Base Role</InputLabel>
                  <Select value={form.base_role} label="Base Role"
                    onChange={e => setForm(f => ({ ...f, base_role: e.target.value }))}
                    sx={{ borderRadius: '10px' }}>
                    {BASE_ROLES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={2}>
                <TextField fullWidth label="Priority" type="number" value={form.priority} size="small"
                  onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
              </Grid>
            </Grid>

            {/* Color picker */}
            <Box sx={{ mb: 3 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#6B7280', mb: 1 }}>Role Color</Typography>
              <Stack direction="row" spacing={1}>
                {COLORS.map(c => (
                  <Box key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    sx={{
                      width: 28, height: 28, borderRadius: '8px', bgcolor: c, cursor: 'pointer',
                      border: form.color === c ? '3px solid #1F2937' : '2px solid transparent', transition: '0.2s',
                      '&:hover': { transform: 'scale(1.15)' },
                    }} />
                ))}
              </Stack>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Permission Matrix */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>Permission Matrix</Typography>
              <Chip label={`${getPermCount(form.permissions)} active`} size="small"
                sx={{ bgcolor: alpha(PRIMARY, .06), color: PRIMARY, fontWeight: 600, fontSize: 11 }} />
            </Box>

            <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '12px', overflow: 'hidden' }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'var(--bg-canvas)' }}>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11.5, color: '#6B7280', width: 180, py: 1.5 }}>Module</TableCell>
                      {Object.keys(ACTION_LABELS).map(a => (
                        <TableCell key={a} align="center" sx={{ fontWeight: 700, fontSize: 11, color: '#6B7280', py: 1.5 }}>{ACTION_LABELS[a]}</TableCell>
                      ))}
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: 11, color: '#6B7280', py: 1.5 }}>All</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {schema.modules.map(mod => {
                      const allChecked = Object.values(form.permissions[mod] || {}).every(Boolean);
                      const permCount = Object.values(form.permissions[mod] || {}).filter(Boolean).length;
                      return (
                        <TableRow key={mod} sx={{ '&:hover': { bgcolor: 'var(--bg-canvas)' } }}>
                          <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#1F2937' }}>{mod}</Typography>
                              {permCount > 0 && (
                                <Typography sx={{ fontSize: 10, color: PRIMARY, fontWeight: 600, bgcolor: alpha(PRIMARY, .06), px: .6, py: .1, borderRadius: '4px' }}>
                                  {permCount}
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          {Object.keys(ACTION_LABELS).map(act => (
                            <TableCell key={act} align="center" sx={{ p: .5, borderBottom: '1px solid #f8f8f8' }}>
                              <Checkbox size="small" checked={!!form.permissions[mod]?.[act as keyof PermissionAction]}
                                onChange={() => togglePerm(mod, act)}
                                sx={{ '&.Mui-checked': { color: PRIMARY }, p: .5 }} />
                            </TableCell>
                          ))}
                          <TableCell align="center" sx={{ p: .5, borderBottom: '1px solid #f8f8f8' }}>
                            <Checkbox size="small" checked={allChecked}
                              onChange={(_, c) => toggleAllModulePerms(mod, c)}
                              sx={{ '&.Mui-checked': { color: PRIMARY }, p: .5 }} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button onClick={() => { setEditing(null); setIsNew(false); }} variant="outlined" size="small"
                sx={{ borderRadius: '10px', borderColor: 'var(--border)', color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 600 }}>
                Cancel
              </Button>
              <Button startIcon={<SaveIcon sx={{ fontSize: 16 }} />} variant="contained" onClick={handleSave}
                disabled={!form.name.trim()} size="small"
                sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#1F7A63' }, textTransform: 'none', fontWeight: 600, borderRadius: '10px', boxShadow: 'none' }}>
                {isNew ? 'Create Role' : 'Save Changes'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {loading && <CircularProgress sx={{ display: 'block', mx: 'auto', my: 4, color: PRIMARY }} />}

      {/* Roles Grid */}
      {!showEditor && (
        <Grid container spacing={2}>
          {roles.map(role => {
            const permCount = getPermCount(role.permissions);
            const permModules = Object.entries(role.permissions || {}).filter(([_, p]) => Object.values(p).some(Boolean)).length;
            return (
              <Grid item xs={12} sm={6} md={4} key={role.id}>
                <Card elevation={0} sx={{
                  border: '1px solid #f0f0f0', borderRadius: '16px', height: '100%',
                  transition: 'all .25s', position: 'relative', overflow: 'hidden',
                  '&:hover': { boxShadow: '0 6px 24px rgba(0,0,0,.06)', transform: 'translateY(-2px)', borderColor: role.color || PRIMARY },
                }}>
                  <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: role.color || PRIMARY }} />
                  <CardContent sx={{ p: '18px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{
                          width: 36, height: 36, bgcolor: alpha(role.color || PRIMARY, 0.1),
                          color: role.color || PRIMARY, fontSize: 14, fontWeight: 800,
                        }}>
                          {role.name[0]?.toUpperCase()}
                        </Avatar>
                        <Box>
                          <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{role.name}</Typography>
                          <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>{role.description || 'No description'}</Typography>
                        </Box>
                      </Box>
                      {role.is_system && (
                        <Chip label="System" size="small"
                          sx={{ height: 20, bgcolor: alpha('#f59e0b', .08), color: '#f59e0b', fontWeight: 700, fontSize: 10 }} />
                      )}
                    </Box>

                    {/* Permission badges */}
                    <Box sx={{ display: 'flex', gap: .5, flexWrap: 'wrap', mb: 2 }}>
                      <Chip icon={<KeyIcon sx={{ fontSize: 12 }} />}
                        label={`${permCount} permissions`} size="small"
                        sx={{ height: 24, bgcolor: alpha(role.color || PRIMARY, 0.06), color: role.color || PRIMARY, fontWeight: 600, fontSize: 11 }} />
                      <Chip label={`${permModules} modules`} size="small"
                        sx={{ height: 24, bgcolor: 'var(--bg-canvas)', color: '#6B7280', fontWeight: 600, fontSize: 11 }} />
                      <Chip label={role.base_role} size="small"
                        sx={{ height: 24, bgcolor: alpha('#128A3A', .06), color: '#128A3A', fontWeight: 600, fontSize: 11 }} />
                    </Box>

                    {/* Permission progress */}
                    <Box sx={{ mb: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: .5 }}>
                        <Typography sx={{ fontSize: 10.5, color: '#94a3b8' }}>Permission coverage</Typography>
                        <Typography sx={{ fontSize: 10.5, color: '#6B7280', fontWeight: 600 }}>
                          {schema.modules.length > 0 ? Math.round((permCount / (schema.modules.length * 6)) * 100) : 0}%
                        </Typography>
                      </Box>
                      <Box sx={{ height: 4, borderRadius: 2, bgcolor: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                        <Box sx={{
                          height: '100%', borderRadius: 2, bgcolor: role.color || PRIMARY,
                          width: `${schema.modules.length > 0 ? (permCount / (schema.modules.length * 6)) * 100 : 0}%`,
                          transition: 'width .6s ease',
                        }} />
                      </Box>
                    </Box>

                    {/* Meta info */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1, borderTop: '1px solid #f1f5f9' }}>
                      <Box sx={{ display: 'flex', gap: .5 }}>
                        {role.company && (
                          <Typography sx={{ fontSize: 10.5, color: '#94a3b8' }}>{role.company.name}</Typography>
                        )}
                        {role.creator && (
                          <Typography sx={{ fontSize: 10.5, color: '#94a3b8' }}>by {role.creator.name}</Typography>
                        )}
                      </Box>
                      <Box sx={{ display: 'flex', gap: .3 }}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => openEdit(role)}
                            sx={{ color: '#6B7280', '&:hover': { bgcolor: alpha(PRIMARY, .06), color: PRIMARY } }}>
                            <EditIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Clone">
                          <IconButton size="small" onClick={() => handleClone(role)}
                            sx={{ color: '#6B7280', '&:hover': { bgcolor: alpha('#128A3A', .06), color: '#128A3A' } }}>
                            <CloneIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                        {!role.is_system && (
                          <Tooltip title="Delete">
                            <IconButton size="small" onClick={() => setDeleteDialog({ open: true, role })}
                              sx={{ color: '#6B7280', '&:hover': { bgcolor: alpha('#ef4444', .06), color: '#ef4444' } }}>
                              <DeleteIcon sx={{ fontSize: 15 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {!loading && roles.length === 0 && !showEditor && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <SecurityIcon sx={{ fontSize: 64, color: 'var(--border)', mb: 2 }} />
          <Typography sx={{ color: '#94a3b8', fontSize: 14 }}>No custom roles created yet</Typography>
          <Button onClick={openCreate} size="small"
            sx={{ mt: 1, color: PRIMARY, textTransform: 'none', fontWeight: 600 }}>
            Create your first role
          </Button>
        </Box>
      )}

      {/* Delete dialog */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, role: null })}
        PaperProps={{ sx: { borderRadius: '16px', minWidth: 360 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>Delete Role</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
            Permanently delete <strong>{deleteDialog.role?.name}</strong>? Users with this role will be unassigned.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setDeleteDialog({ open: false, role: null })} variant="outlined" size="small"
            sx={{ borderRadius: '10px', borderColor: 'var(--border)', color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 600 }}>
            Cancel
          </Button>
          <Button onClick={handleDelete} variant="contained" size="small"
            sx={{ borderRadius: '10px', bgcolor: '#ef4444', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#EF4444' } }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CustomRoleBuilder;
