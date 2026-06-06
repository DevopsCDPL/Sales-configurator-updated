import React, { useState, useMemo, useCallback } from 'react';
import {
  Box, Typography, Card, Chip, Button, TextField, InputAdornment, Select, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  IconButton, Tooltip, Avatar, alpha, Drawer, Divider, Dialog, DialogTitle,
  DialogContent, DialogActions, Snackbar, Alert, Tabs, Tab, CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon, PersonAdd as InviteIcon, Close as CloseIcon,
  VpnKey as KeyIcon, History as HistoryIcon, Lock as LockIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import api from '../../services/api';

const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

const MOCK_USERS = [
  { id: '1', name: 'Vikraman Nair', email: 'vikraman@tatasteel.com', company: 'Tata Steel Ltd', role: 'Owner', status: 'Online', lastLogin: '2026-04-11T10:30:00', avatar: 'V' },
  { id: '2', name: 'Priya Sharma', email: 'priya@reliance.com', company: 'Reliance Industries', role: 'Admin', status: 'Online', lastLogin: '2026-04-11T09:15:00', avatar: 'P' },
  { id: '3', name: 'Rajesh Kumar', email: 'rajesh@mahindra.com', company: 'Mahindra & Mahindra', role: 'User', status: 'Offline', lastLogin: '2026-04-10T16:45:00', avatar: 'R' },
  { id: '4', name: 'Ananya Desai', email: 'ananya@bajaj.com', company: 'Bajaj Auto', role: 'Admin', status: 'Offline', lastLogin: '2026-04-09T14:20:00', avatar: 'A' },
  { id: '5', name: 'Sanjay Mehta', email: 'sanjay@godrej.com', company: 'Godrej Industries', role: 'User', status: 'Invited', lastLogin: '', avatar: 'S' },
  { id: '6', name: 'Deepa Iyer', email: 'deepa@bharatforge.com', company: 'Bharat Forge', role: 'User', status: 'Online', lastLogin: '2026-04-11T08:00:00', avatar: 'D' },
  { id: '7', name: 'Arun Patel', email: 'arun@lnt.com', company: 'Larsen & Toubro', role: 'Owner', status: 'Online', lastLogin: '2026-04-11T11:00:00', avatar: 'A' },
  { id: '8', name: 'Meera Reddy', email: 'meera@sundaram.com', company: 'Sundaram Fasteners', role: 'Admin', status: 'Offline', lastLogin: '2026-04-08T12:30:00', avatar: 'M' },
];

const REG_CHART = [
  { month: 'May', users: 42 }, { month: 'Jun', users: 58 }, { month: 'Jul', users: 35 },
  { month: 'Aug', users: 72 }, { month: 'Sep', users: 65 }, { month: 'Oct', users: 88 },
  { month: 'Nov', users: 95 }, { month: 'Dec', users: 78 }, { month: 'Jan', users: 110 },
  { month: 'Feb', users: 124 }, { month: 'Mar', users: 135 }, { month: 'Apr', users: 147 },
];

const LOGIN_HISTORY = [
  { time: '2026-04-11 10:30 AM', ip: '103.42.18.201', device: 'Chrome / Windows', location: 'Mumbai, IN' },
  { time: '2026-04-10 09:15 AM', ip: '103.42.18.201', device: 'Chrome / Windows', location: 'Mumbai, IN' },
  { time: '2026-04-09 11:00 AM', ip: '182.73.45.12', device: 'Safari / macOS', location: 'Pune, IN' },
  { time: '2026-04-08 08:45 AM', ip: '103.42.18.201', device: 'Chrome / Windows', location: 'Mumbai, IN' },
  { time: '2026-04-07 02:30 PM', ip: '49.36.22.88', device: 'Mobile / Android', location: 'Delhi, IN' },
];

const PERMISSIONS = [
  { module: 'Projects', view: true, create: true, edit: true, delete: false },
  { module: 'Clients', view: true, create: true, edit: true, delete: false },
  { module: 'Vendors', view: true, create: false, edit: false, delete: false },
  { module: 'Analytics', view: true, create: false, edit: false, delete: false },
  { module: 'Settings', view: false, create: false, edit: false, delete: false },
];

const CDPLUsersPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [companyFilter, setCompanyFilter] = useState('All');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<typeof MOCK_USERS[0] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('User');
  const [toast, setToast] = useState<string | null>(null);

  // User Activity state
  const [activitySearch, setActivitySearch] = useState('');
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityData, setActivityData] = useState<{
    user: { id: string; name: string; email: string; role: string; user_id: string; company: string | null; last_login: string | null; created_at: string };
    loginHistory: Array<{ id: string; ip_address: string; user_agent: string; device: string; location: string; status: string; failure_reason: string | null; created_at: string }>;
    auditLogs: Array<{ id: string; action: string; entity_type: string; entity_name: string; details: any; created_at: string }>;
  } | null>(null);

  const handleActivitySearch = useCallback(async () => {
    const q = activitySearch.trim();
    if (!q) return;
    setActivityLoading(true);
    setActivityError(null);
    setActivityData(null);
    try {
      const res = await api.get('/platform-admin/user-activity', { params: { user_id: q } });
      setActivityData(res.data.data);
    } catch (err: any) {
      setActivityError(err.response?.data?.message || 'Failed to fetch user activity');
    } finally {
      setActivityLoading(false);
    }
  }, [activitySearch]);

  const filtered = useMemo(() => {
    return MOCK_USERS.filter((u) => {
      if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
      if (roleFilter !== 'All' && u.role !== roleFilter) return false;
      if (statusFilter !== 'All' && u.status !== statusFilter) return false;
      if (companyFilter !== 'All' && u.company !== companyFilter) return false;
      return true;
    });
  }, [search, roleFilter, statusFilter, companyFilter]);

  const companies = [...new Set(MOCK_USERS.map((u) => u.company))];

  const roleBadge = (role: string) => {
    const cfg: Record<string, string> = { Owner: T.purple, Admin: T.blue, User: T.teal };
    const color = cfg[role] || T.t3;
    return <Chip label={role} size="small" sx={{ bgcolor: alpha(color, 0.1), color, fontWeight: 600, fontSize: 11, height: 22 }} />;
  };

  const statusDot = (status: string) => {
    const cfg: Record<string, string> = { Online: T.green, Offline: T.t3, Invited: T.amber };
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cfg[status] || T.t3, boxShadow: status === 'Online' ? `0 0 0 3px ${alpha(T.green, 0.2)}` : 'none' }} />
        <Typography sx={{ fontSize: 12, color: T.t2 }}>{status}</Typography>
      </Box>
    );
  };

  const openDetail = (user: typeof MOCK_USERS[0]) => { setSelectedUser(user); setDetailOpen(true); };

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>Management / Users</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>Users</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: 12, color: T.t3, mr: 1 }}>Last updated: {dayjs().format('MMM D, YYYY h:mm A')}</Typography>
          {activeTab === 0 && (
            <Button variant="contained" startIcon={<InviteIcon sx={{ fontSize: 18 }} />} onClick={() => setInviteOpen(true)}
              sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
              Invite User
            </Button>
          )}
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 3, '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: 13 }, '& .Mui-selected': { color: T.teal }, '& .MuiTabs-indicator': { backgroundColor: T.teal } }}>
        <Tab label="Users" />
        <Tab icon={<TimelineIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="User Activity" />
      </Tabs>

      {activeTab === 0 && (<>
      {/* User Registrations Chart */}
      <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', mb: 3 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: T.t1, mb: 2 }}>User Registrations (Last 12 Months)</Typography>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={REG_CHART}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.borderSubtle} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} />
            <RTooltip contentStyle={{ borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12 }} />
            <Bar dataKey="users" fill={T.teal} radius={[4, 4, 0, 0]} barSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Filters */}
      <Card sx={{ p: 2, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', mb: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          <TextField size="small" placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: T.t3 }} /></InputAdornment> }}
            sx={{ minWidth: 240, '& input': { fontSize: 13 } }} />
          <Select size="small" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} sx={{ minWidth: 110, fontSize: 13 }}>
            {['All', 'Owner', 'Admin', 'User'].map((r) => <MenuItem key={r} value={r} sx={{ fontSize: 13 }}>{r === 'All' ? 'All Roles' : r}</MenuItem>)}
          </Select>
          <Select size="small" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 120, fontSize: 13 }}>
            {['All', 'Online', 'Offline', 'Invited'].map((s) => <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>{s === 'All' ? 'All Status' : s}</MenuItem>)}
          </Select>
          <Select size="small" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} sx={{ minWidth: 160, fontSize: 13 }}>
            <MenuItem value="All" sx={{ fontSize: 13 }}>All Companies</MenuItem>
            {companies.map((c) => <MenuItem key={c} value={c} sx={{ fontSize: 13 }}>{c}</MenuItem>)}
          </Select>
        </Box>
      </Card>

      {/* Data Table */}
      <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                {['User', 'Email', 'Company', 'Role', 'Status', 'Last Login'].map((h) => (
                  <TableCell key={h} sx={{ fontSize: 11, fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.05em', borderColor: T.borderSubtle }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((u) => (
                <TableRow key={u.id} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: alpha(T.teal, 0.02) } }} onClick={() => openDetail(u)}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(T.teal, 0.15), color: T.teal, fontSize: 13, fontWeight: 600 }}>{u.avatar}</Avatar>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.t1 }}>{u.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: 13, color: T.t2 }}>{u.email}</TableCell>
                  <TableCell sx={{ fontSize: 13, color: T.t2 }}>{u.company}</TableCell>
                  <TableCell>{roleBadge(u.role)}</TableCell>
                  <TableCell>{statusDot(u.status)}</TableCell>
                  <TableCell sx={{ fontSize: 12, color: T.t3 }}>{u.lastLogin ? dayjs(u.lastLogin).format('MMM D, h:mm A') : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={filtered.length} page={page} rowsPerPage={rowsPerPage}
          onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[5, 10, 25]} sx={{ borderTop: `1px solid ${T.borderSubtle}` }} />
      </Card>
      </>)}

      {/* User Activity Tab */}
      {activeTab === 1 && (
        <Box>
          {/* Search by User ID */}
          <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', mb: 3 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1.5 }}>Search User Activity</Typography>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <TextField size="small" placeholder="Enter User ID (e.g. 7381920456)" value={activitySearch}
                onChange={(e) => setActivitySearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleActivitySearch(); }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: T.t3 }} /></InputAdornment> }}
                sx={{ minWidth: 280, '& input': { fontSize: 13 } }} />
              <Button variant="contained" onClick={handleActivitySearch} disabled={activityLoading || !activitySearch.trim()}
                sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
                {activityLoading ? <CircularProgress size={20} color="inherit" /> : 'Search'}
              </Button>
            </Box>
          </Card>

          {activityError && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }}>{activityError}</Alert>}

          {activityData && (
            <>
              {/* User Info Card */}
              <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Avatar sx={{ width: 48, height: 48, bgcolor: alpha(T.teal, 0.15), color: T.teal, fontSize: 18, fontWeight: 700 }}>
                    {activityData.user.name?.charAt(0) || '?'}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: T.t1 }}>{activityData.user.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: T.t3 }}>{activityData.user.email}</Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {[
                    { label: 'User ID', value: activityData.user.user_id },
                    { label: 'Role', value: activityData.user.role },
                    { label: 'Company', value: activityData.user.company || '—' },
                    { label: 'Last Login', value: activityData.user.last_login ? dayjs(activityData.user.last_login).format('MMM D, YYYY h:mm A') : 'Never' },
                    { label: 'Joined', value: dayjs(activityData.user.created_at).format('MMM D, YYYY') },
                  ].map((f) => (
                    <Box key={f.label}>
                      <Typography sx={{ fontSize: 11, color: T.t3 }}>{f.label}</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.t1 }}>{f.value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Card>

              {/* Login History */}
              <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', mb: 3, overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: `1px solid ${T.borderSubtle}` }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.t1 }}>
                    <HistoryIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} /> Login History
                  </Typography>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                        {['Date & Time', 'Status', 'IP Address', 'Device', 'Location'].map((h) => (
                          <TableCell key={h} sx={{ fontSize: 11, fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activityData.loginHistory.length === 0 ? (
                        <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', color: T.t3, py: 3, fontSize: 13 }}>No login history found</TableCell></TableRow>
                      ) : activityData.loginHistory.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell sx={{ fontSize: 12, color: T.t1 }}>{dayjs(l.created_at).format('MMM D, YYYY h:mm A')}</TableCell>
                          <TableCell>
                            <Chip label={l.status} size="small" sx={{ height: 20, fontSize: 11, fontWeight: 600,
                              bgcolor: l.status === 'success' ? alpha(T.green, 0.1) : alpha(T.red, 0.1),
                              color: l.status === 'success' ? T.green : T.red }} />
                          </TableCell>
                          <TableCell sx={{ fontSize: 12, color: T.t2 }}>{l.ip_address || '—'}</TableCell>
                          <TableCell sx={{ fontSize: 12, color: T.t2 }}>{l.device || l.user_agent || '—'}</TableCell>
                          <TableCell sx={{ fontSize: 12, color: T.t2 }}>{l.location || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Card>

              {/* Actions Performed (Audit Logs) */}
              <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: `1px solid ${T.borderSubtle}` }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.t1 }}>
                    <TimelineIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} /> Actions Performed
                  </Typography>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                        {['Date & Time', 'Action', 'Entity Type', 'Entity', 'Details'].map((h) => (
                          <TableCell key={h} sx={{ fontSize: 11, fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activityData.auditLogs.length === 0 ? (
                        <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', color: T.t3, py: 3, fontSize: 13 }}>No actions recorded</TableCell></TableRow>
                      ) : activityData.auditLogs.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell sx={{ fontSize: 12, color: T.t1 }}>{dayjs(a.created_at).format('MMM D, YYYY h:mm A')}</TableCell>
                          <TableCell><Chip label={a.action} size="small" sx={{ height: 20, fontSize: 11, fontWeight: 600, bgcolor: alpha(T.blue, 0.1), color: T.blue }} /></TableCell>
                          <TableCell sx={{ fontSize: 12, color: T.t2 }}>{a.entity_type}</TableCell>
                          <TableCell sx={{ fontSize: 12, color: T.t2 }}>{a.entity_name || '—'}</TableCell>
                          <TableCell sx={{ fontSize: 12, color: T.t3, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.details ? JSON.stringify(a.details) : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Card>
            </>
          )}

          {!activityData && !activityLoading && !activityError && (
            <Box sx={{ textAlign: 'center', py: 8, color: T.t3 }}>
              <TimelineIcon sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
              <Typography sx={{ fontSize: 14 }}>Enter a User ID to view their activity</Typography>
            </Box>
          )}
        </Box>
      )}

      {/* User Detail Panel */}
      <Drawer anchor="right" open={detailOpen} onClose={() => setDetailOpen(false)} PaperProps={{ sx: { width: { xs: '100%', md: 520 }, borderRadius: '16px 0 0 16px' } }}>
        {selectedUser && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 3, borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ width: 48, height: 48, bgcolor: alpha(T.teal, 0.15), color: T.teal, fontSize: 18, fontWeight: 700 }}>{selectedUser.avatar}</Avatar>
                <Box>
                  <Typography sx={{ fontSize: 16, fontWeight: 700, color: T.t1 }}>{selectedUser.name}</Typography>
                  <Typography sx={{ fontSize: 12, color: T.t3 }}>{selectedUser.email}</Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>{roleBadge(selectedUser.role)}{statusDot(selectedUser.status)}</Box>
                </Box>
              </Box>
              <IconButton onClick={() => setDetailOpen(false)} size="small"><CloseIcon /></IconButton>
            </Box>

            <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
              {/* Profile Info */}
              <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1.5 }}>Profile</Typography>
              {[
                { label: 'Company', value: selectedUser.company },
                { label: 'Role', value: selectedUser.role },
                { label: 'Last Login', value: selectedUser.lastLogin ? dayjs(selectedUser.lastLogin).format('MMM D, YYYY h:mm A') : 'Never' },
              ].map((f) => (
                <Box key={f.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: `1px solid ${T.borderSubtle}` }}>
                  <Typography sx={{ fontSize: 13, color: T.t3 }}>{f.label}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: T.t1 }}>{f.value}</Typography>
                </Box>
              ))}

              <Button startIcon={<LockIcon sx={{ fontSize: 16 }} />} variant="outlined" size="small" onClick={() => setToast('Password reset email sent')}
                sx={{ mt: 2, mb: 3, textTransform: 'none', fontSize: 12, borderColor: T.red, color: T.red, borderRadius: '8px', '&:hover': { bgcolor: alpha(T.red, 0.05), borderColor: T.red } }}>
                Reset Password
              </Button>

              <Divider sx={{ mb: 2 }} />

              {/* Login History Timeline */}
              <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1.5 }}>Login History</Typography>
              {LOGIN_HISTORY.map((l, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1.5, py: 1, borderBottom: `1px solid ${T.borderSubtle}` }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: T.teal, mt: 0.7, flexShrink: 0 }} />
                  <Box>
                    <Typography sx={{ fontSize: 12, fontWeight: 500, color: T.t1 }}>{l.time}</Typography>
                    <Typography sx={{ fontSize: 11, color: T.t3 }}>{l.device} · {l.ip} · {l.location}</Typography>
                  </Box>
                </Box>
              ))}

              <Divider sx={{ my: 2 }} />

              {/* Permissions Matrix */}
              <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 1.5 }}>Permissions</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontSize: 11, fontWeight: 600, color: T.t3 }}>Module</TableCell>
                      {['View', 'Create', 'Edit', 'Delete'].map((p) => (
                        <TableCell key={p} align="center" sx={{ fontSize: 11, fontWeight: 600, color: T.t3 }}>{p}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {PERMISSIONS.map((p) => (
                      <TableRow key={p.module}>
                        <TableCell sx={{ fontSize: 12, color: T.t1 }}>{p.module}</TableCell>
                        {[p.view, p.create, p.edit, p.delete].map((v, i) => (
                          <TableCell key={i} align="center">
                            <Box sx={{ width: 18, height: 18, borderRadius: '4px', mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              bgcolor: v ? alpha(T.green, 0.1) : alpha(T.red, 0.05), color: v ? T.green : T.t3, fontSize: 12 }}>
                              {v ? '✓' : '—'}
                            </Box>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Box>
        )}
      </Drawer>

      {/* Invite User Dialog */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 600, fontSize: 18 }}>Invite User</DialogTitle>
        <DialogContent>
          <TextField fullWidth size="small" label="Email Address" placeholder="user@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
            sx={{ mb: 2, mt: 1, '& input': { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
          <Select fullWidth size="small" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} sx={{ fontSize: 13 }}>
            {['User', 'Admin', 'Owner'].map((r) => <MenuItem key={r} value={r} sx={{ fontSize: 13 }}>{r}</MenuItem>)}
          </Select>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setInviteOpen(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          <Button variant="contained" onClick={() => { setInviteOpen(false); setToast('Invitation sent successfully'); setInviteEmail(''); }}
            sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
            Send Invite
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ borderRadius: '8px' }}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
};

export default CDPLUsersPage;
