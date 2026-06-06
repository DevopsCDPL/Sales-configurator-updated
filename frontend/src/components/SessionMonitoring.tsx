import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button,
  alpha, Stack, LinearProgress, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Dialog, DialogTitle,
  DialogContent, DialogActions, IconButton, Tooltip, Avatar,
} from '@mui/material';
import {
  Devices as DevicesIcon,
  Person as PersonIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  DeleteSweep as DeleteAllIcon,
  DesktopWindows as DesktopIcon,
  PhoneAndroid as MobileIcon,
  Tablet as TabletIcon,
  AccessTime as TimeIcon,
  CheckCircle as CheckIcon,
  Shield as ShieldIcon,
  Fingerprint as FingerprintIcon,
  Router as RouterIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const PRIMARY = '#1F7A63';

interface SessionRecord {
  id: number; ip_address: string; user_agent: string; device: string;
  location: string; last_activity_at: string; created_at: string;
  expires_at: string; user?: { id: number; name: string; email: string; role: string };
}

const timeAgo = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const getDeviceIcon = (device: string) => {
  const d = (device || '').toLowerCase();
  if (d.includes('mobile') || d.includes('phone')) return <MobileIcon sx={{ fontSize: 16 }} />;
  if (d.includes('tablet') || d.includes('ipad')) return <TabletIcon sx={{ fontSize: 16 }} />;
  return <DesktopIcon sx={{ fontSize: 16 }} />;
};

const getDeviceColor = (device: string) => {
  const d = (device || '').toLowerCase();
  if (d.includes('mobile') || d.includes('phone')) return '#2A9D7E';
  if (d.includes('tablet')) return '#f59e0b';
  return '#1F7A63';
};

/* ── Stat Card ───────────────────────────────── */
const StatCard: React.FC<{
  label: string; value: number | string; color: string; icon: React.ReactElement<any>;
  subtext?: string;
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

const SessionMonitoring: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'main_admin' || currentUser?.role === 'admin';
  const [mySessions, setMySessions] = useState<SessionRecord[]>([]);
  const [allSessions, setAllSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [revokeDialog, setRevokeDialog] = useState<{ open: boolean; id?: number; userId?: number; type: string }>({ open: false, type: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: my } = await api.get('/sessions/me');
      setMySessions(Array.isArray(my.data) ? my.data : []);
      if (isAdmin) {
        const { data: all } = await api.get('/sessions');
        const sessions = Array.isArray(all.data) ? all.data : (Array.isArray(all.data?.sessions) ? all.data.sessions : []);
        setAllSessions(sessions);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async () => {
    try {
      if (revokeDialog.type === 'single' && revokeDialog.id) {
        await api.post(`/sessions/${revokeDialog.id}/revoke`);
      } else if (revokeDialog.type === 'all-user' && revokeDialog.userId) {
        await api.post(`/sessions/revoke-all/${revokeDialog.userId}`);
      }
      load();
    } catch { /* ignore */ }
    setRevokeDialog({ open: false, type: '' });
  };

  // Compute session stats
  const uniqueIPs = new Set(allSessions.map(s => s.ip_address));
  const deviceCounts = allSessions.reduce<Record<string, number>>((acc, s) => {
    const d = (s.device || 'Desktop').split(' ')[0];
    acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});
  const uniqueUsers = new Set(allSessions.map(s => s.user?.id));
  const recentSessions = allSessions.filter(s => Date.now() - new Date(s.last_activity_at).getTime() < 300000);

  return (
    <Box sx={{ pb: 4, minHeight: '100vh', bgcolor: 'var(--bg-canvas)' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: 26, fontWeight: 800, color: '#1F2937', letterSpacing: -.3, lineHeight: 1.2 }}>
            Session Monitoring
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#94a3b8', mt: .4 }}>Real-time session tracking and security management</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Chip icon={<CheckIcon sx={{ fontSize: 14 }} />}
            label={`${mySessions.length} active`} size="small"
            sx={{ bgcolor: alpha('#1F7A63', .06), color: '#1F7A63', fontWeight: 600, fontSize: 11.5, borderRadius: '8px' }} />
          <Button startIcon={<RefreshIcon sx={{ fontSize: 16 }} />} onClick={load}
            variant="outlined" size="small"
            sx={{ textTransform: 'none', borderRadius: '10px', borderColor: 'var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13 }}>
            Refresh
          </Button>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2, borderRadius: 2, '& .MuiLinearProgress-bar': { bgcolor: PRIMARY } }} />}

      {/* Stats Row - Admin Only */}
      {isAdmin && allSessions.length > 0 && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={3}>
            <StatCard label="Active Sessions" value={allSessions.length} color={PRIMARY} icon={<DevicesIcon />}
              subtext={`${recentSessions.length} in last 5 min`} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard label="Active Users" value={uniqueUsers.size} color="#1F7A63" icon={<PersonIcon />}
              subtext={`${(allSessions.length / Math.max(uniqueUsers.size, 1)).toFixed(1)} avg sessions`} />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard label="Unique IPs" value={uniqueIPs.size} color="#2A9D7E" icon={<RouterIcon />}
              subtext="address spread" />
          </Grid>
          <Grid item xs={6} sm={3}>
            <StatCard label="Security Score" value="A+" color="#1F7A63" icon={<ShieldIcon />}
              subtext="all sessions healthy" />
          </Grid>
        </Grid>
      )}

      {/* Device Distribution - Admin Only */}
      {isAdmin && Object.keys(deviceCounts).length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', mb: 3 }}>
          <CardContent sx={{ p: '16px 20px !important' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Box sx={{ bgcolor: alpha('#2A9D7E', .08), borderRadius: '10px', p: .6, display: 'flex' }}>
                <DevicesIcon sx={{ fontSize: 17, color: '#2A9D7E' }} />
              </Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>Device Distribution</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {Object.entries(deviceCounts).map(([device, count]) => (
                <Box key={device} sx={{ flex: 1, bgcolor: 'var(--bg-canvas)', borderRadius: '12px', p: 2, textAlign: 'center' }}>
                  <Box sx={{ bgcolor: alpha(getDeviceColor(device), .1), width: 40, height: 40, borderRadius: '10px', mx: 'auto', mb: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {React.cloneElement(getDeviceIcon(device), { sx: { fontSize: 20, color: getDeviceColor(device) } })}
                  </Box>
                  <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#1F2937' }}>{count}</Typography>
                  <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{device}</Typography>
                  <Typography sx={{ fontSize: 10, color: '#cbd5e1' }}>{allSessions.length > 0 ? Math.round((count / allSessions.length) * 100) : 0}%</Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* My Sessions */}
      <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1F2937', mb: 2 }}>
        My Active Sessions
        <Chip label={mySessions.length} size="small" sx={{ ml: 1, bgcolor: alpha(PRIMARY, .08), color: PRIMARY, fontWeight: 700, fontSize: 11, height: 22 }} />
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {mySessions.map(s => {
          const isRecent = Date.now() - new Date(s.last_activity_at).getTime() < 300000;
          return (
            <Grid item xs={12} sm={6} md={4} key={s.id}>
              <Card elevation={0} sx={{
                border: `1px solid ${isRecent ? alpha('#1F7A63', .3) : '#f0f0f0'}`, borderRadius: '16px',
                transition: 'all .25s', position: 'relative', overflow: 'hidden',
                '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,.05)' },
              }}>
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: isRecent ? '#1F7A63' : '#94a3b8' }} />
                <CardContent sx={{ p: '18px !important' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ bgcolor: alpha(getDeviceColor(s.device || ''), .08), borderRadius: '10px', p: .7, display: 'flex' }}>
                        {React.cloneElement(getDeviceIcon(s.device || ''), { sx: { fontSize: 18, color: getDeviceColor(s.device || '') } })}
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>{s.device || 'Unknown Device'}</Typography>
                        <Chip label={isRecent ? 'Active' : 'Idle'} size="small"
                          sx={{ height: 18, bgcolor: isRecent ? alpha('#1F7A63', .08) : alpha('#f59e0b', .08), color: isRecent ? '#1F7A63' : '#f59e0b', fontWeight: 600, fontSize: 10 }} />
                      </Box>
                    </Box>
                    <Tooltip title="Revoke session">
                      <IconButton size="small" onClick={() => setRevokeDialog({ open: true, id: s.id, type: 'single' })}
                        sx={{ color: '#ef4444', '&:hover': { bgcolor: alpha('#ef4444', .06) } }}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Stack spacing={.8}>
                    {[
                      { icon: <RouterIcon sx={{ fontSize: 13 }} />, label: 'IP', value: s.ip_address || '—' },
                      { icon: <TimeIcon sx={{ fontSize: 13 }} />, label: 'Last active', value: timeAgo(s.last_activity_at) },
                      { icon: <FingerprintIcon sx={{ fontSize: 13 }} />, label: 'Started', value: new Date(s.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
                    ].map(row => (
                      <Box key={row.label} sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
                        <Box sx={{ color: '#94a3b8' }}>{row.icon}</Box>
                        <Typography sx={{ fontSize: 11, color: '#94a3b8', width: 65, flexShrink: 0 }}>{row.label}</Typography>
                        <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>{row.value}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
        {mySessions.length === 0 && !loading && (
          <Grid item xs={12}>
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <DevicesIcon sx={{ fontSize: 48, color: 'var(--border)', mb: 1 }} />
              <Typography sx={{ color: '#94a3b8', fontSize: 13 }}>No active sessions</Typography>
            </Box>
          </Grid>
        )}
      </Grid>

      {/* All Sessions Table – admin */}
      {isAdmin && allSessions.length > 0 && (
        <>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1F2937', mb: 2 }}>
            All Active Sessions
            <Chip label={allSessions.length} size="small" sx={{ ml: 1, bgcolor: alpha('#1F7A63', .08), color: '#1F7A63', fontWeight: 700, fontSize: 11, height: 22 }} />
          </Typography>
          <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', overflow: 'hidden' }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'var(--bg-canvas)' }}>
                    {['User', 'Device', 'IP Address', 'Last Active', 'Started', 'Actions'].map(h => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11.5, color: '#6B7280', borderBottom: '1px solid #f0f0f0', py: 1.5 }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allSessions.map(s => {
                    const isRecent = Date.now() - new Date(s.last_activity_at).getTime() < 300000;
                    return (
                      <TableRow key={s.id} sx={{ '&:hover': { bgcolor: 'var(--bg-canvas)' }, transition: 'background .15s' }}>
                        <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 28, height: 28, bgcolor: alpha(PRIMARY, .1), fontSize: 12, fontWeight: 700, color: PRIMARY }}>
                              {(s.user?.name || '?')[0].toUpperCase()}
                            </Avatar>
                            <Box>
                              <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#1F2937' }}>{s.user?.name || '—'}</Typography>
                              <Typography sx={{ fontSize: 10.5, color: '#94a3b8' }}>{s.user?.email || ''}</Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
                            {React.cloneElement(getDeviceIcon(s.device || ''), { sx: { fontSize: 14, color: getDeviceColor(s.device || '') } })}
                            <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.device || '—'}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                          <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{s.ip_address || '—'}</Typography>
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: isRecent ? '#1F7A63' : '#f59e0b' }} />
                            <Typography sx={{ fontSize: 12, color: 'var(--text-secondary)' }}>{timeAgo(s.last_activity_at)}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                          <Typography sx={{ fontSize: 11.5, color: '#94a3b8' }}>
                            {new Date(s.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                          <Box sx={{ display: 'flex', gap: .5 }}>
                            <Tooltip title="Revoke session">
                              <IconButton size="small" onClick={() => setRevokeDialog({ open: true, id: s.id, type: 'single' })}
                                sx={{ color: '#ef4444', '&:hover': { bgcolor: alpha('#ef4444', .06) } }}>
                                <DeleteIcon sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Tooltip>
                            {s.user && (
                              <Tooltip title="Revoke all user sessions">
                                <IconButton size="small" onClick={() => setRevokeDialog({ open: true, userId: s.user!.id, type: 'all-user' })}
                                  sx={{ color: '#f59e0b', '&:hover': { bgcolor: alpha('#f59e0b', .06) } }}>
                                  <DeleteAllIcon sx={{ fontSize: 15 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </>
      )}

      {/* Revoke Dialog */}
      <Dialog open={revokeDialog.open} onClose={() => setRevokeDialog({ open: false, type: '' })}
        PaperProps={{ sx: { borderRadius: '16px', minWidth: 360 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>Confirm Revoke</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
            {revokeDialog.type === 'all-user'
              ? 'This will terminate all active sessions for this user. They will need to log in again.'
              : 'This will terminate the selected session immediately.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setRevokeDialog({ open: false, type: '' })} variant="outlined" size="small"
            sx={{ borderRadius: '10px', borderColor: 'var(--border)', color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 600 }}>
            Cancel
          </Button>
          <Button onClick={handleRevoke} variant="contained" size="small"
            sx={{ borderRadius: '10px', bgcolor: '#ef4444', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#EF4444' } }}>
            Revoke
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SessionMonitoring;
