import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, Chip, Button, TextField, InputAdornment, Select, MenuItem,
  Avatar, AvatarGroup, alpha, Dialog, DialogTitle, DialogContent, DialogActions,
  IconButton, Divider, Snackbar, Alert, Menu, Switch, CircularProgress,
  Autocomplete, Checkbox, ListItemText, FormControl, InputLabel, SelectChangeEvent,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Close as CloseIcon,
  People as PeopleIcon, MoreVert as MoreVertIcon,
  Edit as EditIcon, PersonAdd as PersonAddIcon,
  Security as SecurityIcon, Delete as DeleteIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuth } from '../../contexts/AuthContext';
import { teamService, TeamData, TeamActivityData } from '../../services/teamService';
import api from '../../services/api';

dayjs.extend(relativeTime);

const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

const COLORS = [T.teal, T.blue, T.purple, T.amber, T.red, T.green];

const PERMISSION_KEYS = [
  { key: 'view_projects', label: 'View Projects' },
  { key: 'edit_projects', label: 'Edit Projects' },
  { key: 'view_clients', label: 'View Clients' },
  { key: 'manage_vendors', label: 'Manage Vendors' },
  { key: 'view_analytics', label: 'View Analytics' },
];

const MEMBER_ROLES = ['Lead', 'Senior Dev', 'Developer', 'QA', 'Member'];

interface CompanyOption {
  id: string;
  name: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
  position?: string;
}

const CDPLTeamsPage: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'platform_admin' || user?.role === 'main_admin' || user?.role === 'admin';
  const canManagePermissions = user?.role === 'platform_admin' || user?.role === 'main_admin';

  // Data state
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');

  // Dialog state
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<TeamData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  // Form state
  const [newTeam, setNewTeam] = useState({ name: '', description: '', company_id: '' });
  const [editTeam, setEditTeam] = useState({ name: '', description: '' });
  const [newMemberUserId, setNewMemberUserId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Member');
  const [createMembers, setCreateMembers] = useState<{ user_id: string; role: string; name: string }[]>([]);

  // Card menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuTeam, setMenuTeam] = useState<TeamData | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);

  // Load teams
  const loadTeams = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (companyFilter) params.company_id = companyFilter;
      const data = await teamService.getAll(params);
      setTeams(data);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Failed to load teams', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [search, companyFilter]);

  // Load companies for filter
  const loadCompanies = useCallback(async () => {
    try {
      const res = await api.get('/platform-admin/companies');
      const list = (res.data?.data || []).map((c: any) => ({ id: c.id, name: c.name }));
      setCompanies(list);
    } catch {
      // non-platform-admin may not have access; ignore
    }
  }, []);

  // Load available users for member selection
  const loadUsers = useCallback(async (companyId?: string) => {
    try {
      const params: Record<string, string> = {};
      if (companyId) params.company_id = companyId;
      const res = await api.get('/users', { params });
      setAvailableUsers((res.data?.data || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        position: u.position,
      })));
    } catch {
      setAvailableUsers([]);
    }
  }, []);

  useEffect(() => {
    loadTeams();
    loadCompanies();
    loadUsers();
  }, [loadTeams, loadCompanies, loadUsers]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => { loadTeams(); }, 300);
    return () => clearTimeout(timer);
  }, [search, companyFilter, loadTeams]);

  // Open team detail
  const openDetail = async (team: TeamData) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const full = await teamService.getById(team.id);
      setSelectedTeam(full);
    } catch {
      setToast({ message: 'Failed to load team details', severity: 'error' });
    } finally {
      setDetailLoading(false);
    }
  };

  // Refresh selected team in-place
  const refreshSelectedTeam = async (teamId: string) => {
    try {
      const full = await teamService.getById(teamId);
      setSelectedTeam(full);
    } catch { /* ignore */ }
  };

  // --- Card Menu Handlers ---
  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>, team: TeamData) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuTeam(team);
  };
  const handleMenuClose = () => { setMenuAnchor(null); setMenuTeam(null); };

  const handleMenuEdit = () => {
    if (menuTeam) {
      setEditTeam({ name: menuTeam.name, description: menuTeam.description || '' });
      setSelectedTeam(menuTeam);
      setEditOpen(true);
    }
    handleMenuClose();
  };

  const handleMenuAddMembers = () => {
    if (menuTeam) {
      setSelectedTeam(menuTeam);
      loadUsers(menuTeam.company_id);
      setAddMemberOpen(true);
    }
    handleMenuClose();
  };

  const handleMenuManagePermissions = async () => {
    if (menuTeam) {
      await openDetail(menuTeam);
    }
    handleMenuClose();
  };

  const handleMenuDelete = () => {
    if (menuTeam) {
      setSelectedTeam(menuTeam);
      setDeleteConfirmOpen(true);
    }
    handleMenuClose();
  };

  // --- CRUD ---
  const handleCreate = async () => {
    if (!newTeam.name.trim()) return;
    setSaving(true);
    try {
      await teamService.create({
        name: newTeam.name,
        description: newTeam.description,
        company_id: newTeam.company_id || undefined,
        members: createMembers.map(m => ({ user_id: m.user_id, role: m.role })),
      });
      setCreateOpen(false);
      setNewTeam({ name: '', description: '', company_id: '' });
      setCreateMembers([]);
      setToast({ message: 'Team created successfully', severity: 'success' });
      loadTeams();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Failed to create team', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedTeam || !editTeam.name.trim()) return;
    setSaving(true);
    try {
      await teamService.update(selectedTeam.id, { name: editTeam.name, description: editTeam.description });
      setEditOpen(false);
      setToast({ message: 'Team updated successfully', severity: 'success' });
      loadTeams();
      if (detailOpen) refreshSelectedTeam(selectedTeam.id);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Failed to update team', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTeam) return;
    setSaving(true);
    try {
      await teamService.delete(selectedTeam.id);
      setDeleteConfirmOpen(false);
      setDetailOpen(false);
      setToast({ message: 'Team deleted successfully', severity: 'success' });
      loadTeams();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Failed to delete team', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedTeam || !newMemberUserId) return;
    setSaving(true);
    try {
      const updated = await teamService.addMember(selectedTeam.id, { user_id: newMemberUserId, role: newMemberRole });
      setSelectedTeam(updated);
      setAddMemberOpen(false);
      setNewMemberUserId('');
      setNewMemberRole('Member');
      setToast({ message: 'Member added successfully', severity: 'success' });
      loadTeams();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Failed to add member', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedTeam) return;
    try {
      const updated = await teamService.removeMember(selectedTeam.id, userId);
      setSelectedTeam(updated);
      setToast({ message: 'Member removed', severity: 'success' });
      loadTeams();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Failed to remove member', severity: 'error' });
    }
  };

  const handleUpdateMemberRole = async (userId: string, role: string) => {
    if (!selectedTeam) return;
    try {
      const updated = await teamService.updateMemberRole(selectedTeam.id, userId, role);
      setSelectedTeam(updated);
      loadTeams();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Failed to update role', severity: 'error' });
    }
  };

  const handleTogglePermission = async (key: string, enabled: boolean) => {
    if (!selectedTeam) return;
    try {
      const updated = await teamService.updatePermissions(selectedTeam.id, { [key]: enabled });
      setSelectedTeam(updated);
      setToast({ message: 'Permission updated', severity: 'success' });
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Failed to update permission', severity: 'error' });
    }
  };

  // Helper: get permission status
  const getPermEnabled = (teamPerms: TeamData['permissions'], key: string) => {
    const p = teamPerms?.find(pp => pp.permission_key === key);
    return p ? p.enabled : false;
  };

  // Members not already in the team (for Add Member dialog)
  const availableForTeam = selectedTeam
    ? availableUsers.filter(u => !selectedTeam.members?.some(m => m.user_id === u.id))
    : availableUsers;

  // Filtered teams (client-side secondary filter for instant feedback)
  const filtered = teams;

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>Management / Teams</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>Teams</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 12, color: T.t3, mr: 1 }}>Last updated: {dayjs().format('MMM D, YYYY h:mm A')}</Typography>
          {canEdit && (
            <Button variant="contained" startIcon={<AddIcon sx={{ fontSize: 18 }} />} onClick={() => { setCreateOpen(true); loadUsers(); }}
              sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
              Create Team
            </Button>
          )}
        </Box>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
        <TextField size="small" placeholder="Search teams..." value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: T.t3 }} /></InputAdornment> }}
          sx={{ minWidth: 240, '& input': { fontSize: 13 }, bgcolor: T.surface }} />
        {companies.length > 0 && (
          <Select size="small" value={companyFilter} displayEmpty onChange={(e: SelectChangeEvent) => setCompanyFilter(e.target.value)} sx={{ minWidth: 180, fontSize: 13, bgcolor: T.surface }}>
            <MenuItem value="" sx={{ fontSize: 13 }}>All Companies</MenuItem>
            {companies.map((c) => <MenuItem key={c.id} value={c.id} sx={{ fontSize: 13 }}>{c.name}</MenuItem>)}
          </Select>
        )}
      </Box>

      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: T.teal }} />
        </Box>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <PeopleIcon sx={{ fontSize: 48, color: T.t3, mb: 1 }} />
          <Typography sx={{ fontSize: 14, color: T.t3 }}>No teams found. Create your first team to get started.</Typography>
        </Box>
      )}

      {/* Team Cards Grid */}
      {!loading && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 2 }}>
          {filtered.map((team, idx) => (
            <Card
              key={team.id}
              onClick={() => openDetail(team)}
              sx={{
                p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', borderColor: T.teal },
              }}
            >
              {/* 3-dot menu */}
              {canEdit && (
                <IconButton
                  size="small"
                  onClick={(e) => handleMenuOpen(e, team)}
                  sx={{ position: 'absolute', top: 8, right: 8, color: T.t3, '&:hover': { color: T.t1 } }}
                >
                  <MoreVertIcon sx={{ fontSize: 18 }} />
                </IconButton>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, pr: 3 }}>
                <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: alpha(COLORS[idx % COLORS.length], 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PeopleIcon sx={{ fontSize: 20, color: COLORS[idx % COLORS.length] }} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 700, color: T.t1, mb: 0.25 }}>{team.name}</Typography>
                  <Typography sx={{ fontSize: 11, color: T.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.company?.name || ''}</Typography>
                </Box>
              </Box>

              <Typography sx={{ fontSize: 12, color: T.t2, mb: 2, lineHeight: 1.5, minHeight: 36 }}>{team.description || ''}</Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <AvatarGroup max={5} sx={{ '& .MuiAvatar-root': { width: 28, height: 28, fontSize: 11, fontWeight: 600, border: '2px solid #fff' } }}>
                  {(team.member_avatars || []).map((m, i) => (
                    <Avatar key={m.id || i} sx={{ bgcolor: alpha(COLORS[(idx + i) % COLORS.length], 0.2), color: COLORS[(idx + i) % COLORS.length] }}>{m.initial}</Avatar>
                  ))}
                </AvatarGroup>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.t2 }}>{team.member_count || team.members?.length || 0}</Typography>
                  <Typography sx={{ fontSize: 11, color: T.t3 }}>members</Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 1.5 }} />
              <Typography sx={{ fontSize: 11, color: T.t3 }}>Created {dayjs(team.created_at).format('MMM D, YYYY')}</Typography>
            </Card>
          ))}
        </Box>
      )}

      {/* Card 3-dot Menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleMenuClose}
        PaperProps={{ sx: { borderRadius: '8px', minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' } }}>
        <MenuItem onClick={handleMenuEdit} sx={{ fontSize: 13, gap: 1 }}>
          <EditIcon sx={{ fontSize: 16, color: T.t3 }} /> Edit Team
        </MenuItem>
        <MenuItem onClick={handleMenuAddMembers} sx={{ fontSize: 13, gap: 1 }}>
          <PersonAddIcon sx={{ fontSize: 16, color: T.t3 }} /> Add Members
        </MenuItem>
        {canManagePermissions && (
          <MenuItem onClick={handleMenuManagePermissions} sx={{ fontSize: 13, gap: 1 }}>
            <SecurityIcon sx={{ fontSize: 16, color: T.t3 }} /> Manage Permissions
          </MenuItem>
        )}
        <Divider />
        <MenuItem onClick={handleMenuDelete} sx={{ fontSize: 13, gap: 1, color: T.red }}>
          <DeleteIcon sx={{ fontSize: 16 }} /> Delete Team
        </MenuItem>
      </Menu>

      {/* ====== Team Detail Dialog ====== */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        {detailLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress size={32} sx={{ color: T.teal }} />
          </Box>
        ) : selectedTeam && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{selectedTeam.name}</Typography>
                <Typography sx={{ fontSize: 12, color: T.t3 }}>{selectedTeam.company?.name} · {selectedTeam.members?.length || 0} members</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {canEdit && (
                  <>
                    <IconButton size="small" onClick={() => { setEditTeam({ name: selectedTeam.name, description: selectedTeam.description || '' }); setEditOpen(true); }}>
                      <EditIcon sx={{ fontSize: 18, color: T.t3 }} />
                    </IconButton>
                    <IconButton size="small" onClick={() => { loadUsers(selectedTeam.company_id); setAddMemberOpen(true); }}>
                      <PersonAddIcon sx={{ fontSize: 18, color: T.t3 }} />
                    </IconButton>
                  </>
                )}
                <IconButton onClick={() => setDetailOpen(false)} size="small"><CloseIcon /></IconButton>
              </Box>
            </DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
                {/* Members List */}
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Members</Typography>
                    {canEdit && (
                      <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                        onClick={() => { loadUsers(selectedTeam.company_id); setAddMemberOpen(true); }}
                        sx={{ textTransform: 'none', fontSize: 12, color: T.teal }}>
                        Add Member
                      </Button>
                    )}
                  </Box>
                  {(selectedTeam.members || []).length === 0 && (
                    <Typography sx={{ fontSize: 12, color: T.t3, py: 2, textAlign: 'center' }}>No members yet</Typography>
                  )}
                  {(selectedTeam.members || []).map((m) => (
                    <Box key={m.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, borderBottom: `1px solid ${T.borderSubtle}` }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(T.teal, 0.15), color: T.teal, fontSize: 12 }}>
                        {m.user?.name?.charAt(0)?.toUpperCase() || '?'}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 500, color: T.t1 }}>{m.user?.name}</Typography>
                        {canEdit ? (
                          <Select
                            size="small"
                            value={m.role}
                            onChange={(e) => handleUpdateMemberRole(m.user_id, e.target.value)}
                            variant="standard"
                            disableUnderline
                            sx={{ fontSize: 11, color: T.t3, '& .MuiSelect-select': { py: 0 } }}
                          >
                            {MEMBER_ROLES.map(r => <MenuItem key={r} value={r} sx={{ fontSize: 12 }}>{r}</MenuItem>)}
                          </Select>
                        ) : (
                          <Typography sx={{ fontSize: 11, color: T.t3 }}>{m.role}</Typography>
                        )}
                      </Box>
                      {canEdit && (
                        <IconButton size="small" onClick={() => handleRemoveMember(m.user_id)} sx={{ color: T.t3, '&:hover': { color: T.red } }}>
                          <RemoveIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      )}
                    </Box>
                  ))}
                </Box>

                {/* Permissions & Activity */}
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1.5 }}>Team Permissions</Typography>
                  {PERMISSION_KEYS.map((p) => {
                    const enabled = getPermEnabled(selectedTeam.permissions, p.key);
                    return (
                      <Box key={p.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.75, borderBottom: `1px solid ${T.borderSubtle}` }}>
                        <Typography sx={{ fontSize: 13, color: T.t2 }}>{p.label}</Typography>
                        {canManagePermissions ? (
                          <Switch
                            size="small"
                            checked={enabled}
                            onChange={(_, checked) => handleTogglePermission(p.key, checked)}
                            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: T.green }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: T.green } }}
                          />
                        ) : (
                          <Chip
                            label={enabled ? 'Granted' : 'Denied'}
                            size="small"
                            sx={{
                              fontSize: 10, height: 20,
                              bgcolor: enabled ? alpha(T.green, 0.1) : alpha(T.red, 0.1),
                              color: enabled ? T.green : T.red,
                            }}
                          />
                        )}
                      </Box>
                    );
                  })}

                  <Typography sx={{ fontSize: 14, fontWeight: 600, mt: 3, mb: 1.5 }}>Activity Feed</Typography>
                  {(selectedTeam.activities || []).length === 0 && (
                    <Typography sx={{ fontSize: 12, color: T.t3, textAlign: 'center', py: 2 }}>No activity yet</Typography>
                  )}
                  {(selectedTeam.activities || []).map((a: TeamActivityData) => (
                    <Box key={a.id} sx={{ display: 'flex', gap: 1.5, py: 1, borderBottom: `1px solid ${T.borderSubtle}` }}>
                      <Box sx={{
                        width: 6, height: 6, borderRadius: '50%', mt: 0.8, flexShrink: 0,
                        bgcolor: a.type === 'member' ? T.blue : a.type === 'permission' ? T.amber : a.type === 'role' ? T.purple : T.teal,
                      }} />
                      <Box>
                        <Typography sx={{ fontSize: 12, color: T.t1 }}>{a.action}</Typography>
                        <Typography sx={{ fontSize: 10, color: T.t3 }}>{dayjs(a.created_at).fromNow()}</Typography>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>

      {/* ====== Create Team Dialog ====== */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 600, fontSize: 18 }}>Create Team</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Team Name" size="small" fullWidth value={newTeam.name}
              onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
              InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
            <TextField label="Description" size="small" fullWidth multiline rows={2} value={newTeam.description}
              onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
              InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
            {companies.length > 0 && (
              <FormControl size="small" fullWidth>
                <InputLabel sx={{ fontSize: 13 }}>Company</InputLabel>
                <Select value={newTeam.company_id} label="Company"
                  onChange={(e: SelectChangeEvent) => {
                    setNewTeam({ ...newTeam, company_id: e.target.value });
                    loadUsers(e.target.value);
                  }}
                  sx={{ fontSize: 13 }}>
                  {companies.map((c) => <MenuItem key={c.id} value={c.id} sx={{ fontSize: 13 }}>{c.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}

            {/* Add Members */}
            <Typography sx={{ fontSize: 13, fontWeight: 600, mt: 1 }}>Add Members</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <Select
                  value={newMemberUserId}
                  displayEmpty
                  onChange={(e: SelectChangeEvent) => setNewMemberUserId(e.target.value)}
                  sx={{ fontSize: 13 }}
                >
                  <MenuItem value="" disabled sx={{ fontSize: 13 }}>Select user...</MenuItem>
                  {availableUsers
                    .filter(u => !createMembers.some(m => m.user_id === u.id))
                    .map((u) => (
                      <MenuItem key={u.id} value={u.id} sx={{ fontSize: 13 }}>{u.name} ({u.email})</MenuItem>
                    ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ width: 130 }}>
                <Select value={newMemberRole} onChange={(e: SelectChangeEvent) => setNewMemberRole(e.target.value)} sx={{ fontSize: 13 }}>
                  {MEMBER_ROLES.map(r => <MenuItem key={r} value={r} sx={{ fontSize: 13 }}>{r}</MenuItem>)}
                </Select>
              </FormControl>
              <Button size="small" variant="outlined"
                disabled={!newMemberUserId}
                onClick={() => {
                  const u = availableUsers.find(u => u.id === newMemberUserId);
                  if (u) {
                    setCreateMembers(prev => [...prev, { user_id: u.id, role: newMemberRole, name: u.name }]);
                    setNewMemberUserId('');
                    setNewMemberRole('Member');
                  }
                }}
                sx={{ textTransform: 'none', fontSize: 12, borderColor: T.teal, color: T.teal, minWidth: 60 }}>
                Add
              </Button>
            </Box>

            {/* Selected members list */}
            {createMembers.length > 0 && (
              <Box sx={{ border: `1px solid ${T.border}`, borderRadius: '8px', p: 1 }}>
                {createMembers.map((m, i) => (
                  <Box key={m.user_id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar sx={{ width: 24, height: 24, fontSize: 10, bgcolor: alpha(T.teal, 0.15), color: T.teal }}>{m.name.charAt(0)}</Avatar>
                      <Typography sx={{ fontSize: 12 }}>{m.name}</Typography>
                      <Chip label={m.role} size="small" sx={{ fontSize: 10, height: 18 }} />
                    </Box>
                    <IconButton size="small" onClick={() => setCreateMembers(prev => prev.filter((_, idx) => idx !== i))}>
                      <CloseIcon sx={{ fontSize: 14, color: T.t3 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !newTeam.name.trim()}
            sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ====== Edit Team Dialog ====== */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 600, fontSize: 18 }}>Edit Team</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Team Name" size="small" fullWidth value={editTeam.name}
              onChange={(e) => setEditTeam({ ...editTeam, name: e.target.value })}
              InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
            <TextField label="Description" size="small" fullWidth multiline rows={2} value={editTeam.description}
              onChange={(e) => setEditTeam({ ...editTeam, description: e.target.value })}
              InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdate} disabled={saving || !editTeam.name.trim()}
            sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ====== Add Member Dialog ====== */}
      <Dialog open={addMemberOpen} onClose={() => setAddMemberOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 600, fontSize: 16 }}>Add Member</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: 13 }}>Select User</InputLabel>
              <Select value={newMemberUserId} label="Select User"
                onChange={(e: SelectChangeEvent) => setNewMemberUserId(e.target.value)}
                sx={{ fontSize: 13 }}>
                {availableForTeam.map((u) => (
                  <MenuItem key={u.id} value={u.id} sx={{ fontSize: 13 }}>{u.name} ({u.email})</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: 13 }}>Role</InputLabel>
              <Select value={newMemberRole} label="Role"
                onChange={(e: SelectChangeEvent) => setNewMemberRole(e.target.value)}
                sx={{ fontSize: 13 }}>
                {MEMBER_ROLES.map(r => <MenuItem key={r} value={r} sx={{ fontSize: 13 }}>{r}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddMemberOpen(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          <Button variant="contained" onClick={handleAddMember} disabled={saving || !newMemberUserId}
            sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ====== Delete Confirmation ====== */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 600, fontSize: 16 }}>Delete Team</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: T.t2 }}>
            Are you sure you want to delete <strong>{selectedTeam?.name}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          <Button variant="contained" onClick={handleDelete} disabled={saving}
            sx={{ bgcolor: T.red, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#DC2626' } }}>
            {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Toast */}
      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity={toast?.severity || 'success'} variant="filled" sx={{ borderRadius: '8px' }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CDPLTeamsPage;
