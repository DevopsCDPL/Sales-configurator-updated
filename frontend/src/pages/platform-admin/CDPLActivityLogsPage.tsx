import React, { useState } from 'react';
import {
  Box, Typography, Card, Chip, Button, TextField, InputAdornment, Select, MenuItem,
  Avatar, alpha, Tooltip, Switch, FormControlLabel,
} from '@mui/material';
import {
  Search as SearchIcon, Download as DownloadIcon, FiberManualRecord as DotIcon,
  Login as LoginIcon, Edit as EditIcon, Delete as DeleteIcon, PersonAdd as PersonAddIcon,
  Settings as SettingsIcon, Shield as ShieldIcon,
} from '@mui/icons-material';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';

const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

const CHART_DATA = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, '0')}:00`,
  actions: Math.floor(Math.random() * 80) + 10,
}));

const ACTION_TYPES = {
  login: { label: 'Login', icon: LoginIcon, color: T.green },
  edit: { label: 'Edit', icon: EditIcon, color: T.blue },
  delete: { label: 'Delete', icon: DeleteIcon, color: T.red },
  create: { label: 'Create', icon: PersonAddIcon, color: T.teal },
  settings: { label: 'Settings', icon: SettingsIcon, color: T.purple },
  security: { label: 'Security', icon: ShieldIcon, color: T.amber },
};

type ActionKey = keyof typeof ACTION_TYPES;

const MOCK_LOGS = [
  { id: '1', user: 'Vikraman Nair', email: 'vikraman@tata.com', action: 'login' as ActionKey, description: 'Logged in successfully', ip: '192.168.1.45', device: 'Chrome / Windows', timestamp: '2026-03-15T14:32:00' },
  { id: '2', user: 'Priya Sharma', email: 'priya@reliance.com', action: 'edit' as ActionKey, description: 'Updated project "Steel Bridge Assembly"', ip: '10.0.0.128', device: 'Firefox / macOS', timestamp: '2026-03-15T14:28:00' },
  { id: '3', user: 'Rajesh Kumar', email: 'rajesh@mahindra.com', action: 'create' as ActionKey, description: 'Created new vendor "MetalWorks India"', ip: '172.16.0.55', device: 'Safari / iOS', timestamp: '2026-03-15T14:15:00' },
  { id: '4', user: 'Deepa Iyer', email: 'deepa@bajaj.com', action: 'delete' as ActionKey, description: 'Deleted draft quotation QT-2026-089', ip: '10.1.1.200', device: 'Edge / Windows', timestamp: '2026-03-15T13:50:00' },
  { id: '5', user: 'Ananya Desai', email: 'ananya@godrej.com', action: 'security' as ActionKey, description: 'Enabled 2FA for account', ip: '192.168.5.100', device: 'Chrome / Android', timestamp: '2026-03-15T13:30:00' },
  { id: '6', user: 'Suresh Patel', email: 'suresh@tata.com', action: 'settings' as ActionKey, description: 'Changed notification preferences', ip: '10.0.0.65', device: 'Chrome / Windows', timestamp: '2026-03-15T13:10:00' },
  { id: '7', user: 'Meera Reddy', email: 'meera@larsen.com', action: 'edit' as ActionKey, description: 'Updated estimate revision R3', ip: '172.16.1.88', device: 'Firefox / Linux', timestamp: '2026-03-15T12:45:00' },
  { id: '8', user: 'Kiran Joshi', email: 'kiran@sundaram.com', action: 'login' as ActionKey, description: 'Logged in from new device', ip: '192.168.10.33', device: 'Safari / macOS', timestamp: '2026-03-15T12:20:00' },
  { id: '9', user: 'Arjun Mehta', email: 'arjun@bharat.com', action: 'create' as ActionKey, description: 'Created work order WO-2026-045', ip: '10.2.2.77', device: 'Chrome / Windows', timestamp: '2026-03-15T11:55:00' },
  { id: '10', user: 'Nisha Gupta', email: 'nisha@reliance.com', action: 'delete' as ActionKey, description: 'Removed expired subscription data', ip: '172.16.3.44', device: 'Edge / Windows', timestamp: '2026-03-15T11:30:00' },
];

const CDPLActivityLogsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('All');
  const [isLive, setIsLive] = useState(true);

  const filtered = MOCK_LOGS.filter((l) => {
    if (search && !l.user.toLowerCase().includes(search.toLowerCase()) && !l.description.toLowerCase().includes(search.toLowerCase())) return false;
    if (actionFilter !== 'All' && l.action !== actionFilter) return false;
    return true;
  });

  const handleExport = () => {
    const headers = ['User', 'Email', 'Action', 'Description', 'IP', 'Device', 'Timestamp'];
    const rows = filtered.map((l) => [l.user, l.email, l.action, l.description, l.ip, l.device, l.timestamp]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-logs-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>Operations / Activity Logs</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>Activity Logs</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FormControlLabel
            control={<Switch size="small" checked={isLive} onChange={(e) => setIsLive(e.target.checked)} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: T.green }, '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': { bgcolor: T.green } }} />}
            label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {isLive && <DotIcon sx={{ fontSize: 10, color: T.green, animation: 'pulse 1.5s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />}
              <Typography sx={{ fontSize: 12, color: isLive ? T.green : T.t3, fontWeight: 500 }}>{isLive ? 'Live' : 'Paused'}</Typography>
            </Box>}
          />
          <Button variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 16 }} />} onClick={handleExport}
            sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, borderColor: T.border, color: T.t2, borderRadius: '8px' }}>
            Export
          </Button>
        </Box>
      </Box>

      {/* Activity Chart */}
      <Card sx={{ p: 2.5, mb: 3, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.t1, mb: 2 }}>24-Hour Activity</Typography>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={CHART_DATA}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.borderSubtle} />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: T.t3 }} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: T.t3 }} width={30} />
            <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}` }} />
            <Area type="monotone" dataKey="actions" stroke={T.teal} fill={alpha(T.teal, 0.1)} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Filters */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
        <TextField size="small" placeholder="Search by user or action..." value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: T.t3 }} /></InputAdornment> }}
          sx={{ minWidth: 280, '& input': { fontSize: 13 }, bgcolor: T.surface }} />
        <Select size="small" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} sx={{ minWidth: 140, fontSize: 13, bgcolor: T.surface }}>
          <MenuItem value="All" sx={{ fontSize: 13 }}>All Actions</MenuItem>
          {Object.entries(ACTION_TYPES).map(([k, v]) => <MenuItem key={k} value={k} sx={{ fontSize: 13 }}>{v.label}</MenuItem>)}
        </Select>
      </Box>

      {/* Activity Feed */}
      <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {filtered.map((log, i) => {
          const at = ACTION_TYPES[log.action];
          const Icon = at.icon;
          return (
            <Box key={log.id} sx={{
              display: 'flex', alignItems: 'center', gap: 2, px: 2.5, py: 2,
              borderBottom: i < filtered.length - 1 ? `1px solid ${T.borderSubtle}` : 'none',
              '&:hover': { bgcolor: alpha(T.teal, 0.02) },
              transition: 'background 0.15s',
            }}>
              {/* Timeline Dot */}
              <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Box sx={{ width: 34, height: 34, borderRadius: '8px', bgcolor: alpha(at.color, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon sx={{ fontSize: 16, color: at.color }} />
                </Box>
              </Box>

              {/* User */}
              <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(T.teal, 0.15), color: T.teal, fontSize: 12, fontWeight: 600 }}>{log.user.charAt(0)}</Avatar>
              
              {/* Details */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.t1 }}>{log.user}</Typography>
                  <Chip label={at.label} size="small" sx={{ fontSize: 10, height: 18, bgcolor: alpha(at.color, 0.1), color: at.color }} />
                </Box>
                <Typography sx={{ fontSize: 12, color: T.t2 }}>{log.description}</Typography>
              </Box>

              {/* Meta */}
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.3 }}>{dayjs(log.timestamp).format('h:mm A')}</Typography>
                <Tooltip title={`${log.ip} · ${log.device}`}>
                  <Typography sx={{ fontSize: 10, color: T.t3, fontFamily: 'monospace' }}>{log.ip}</Typography>
                </Tooltip>
              </Box>
            </Box>
          );
        })}
      </Card>
    </Box>
  );
};

export default CDPLActivityLogsPage;
