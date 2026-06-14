import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Table, TableHead, TableRow, TableCell, TableBody,
  Button, Chip, CircularProgress, Alert,
} from '@mui/material';
import {
  listMyTasks, checkInTask, checkOutTask,
  listNotifications, markNotificationRead, markAllNotificationsRead,
  WorkTask, AppNotificationRow,
} from '../services/capacityService';

/**
 * MyWorkPage — operator self-service view. Shows the logged-in user's assigned
 * tasks (check in/out) and their in-app notifications. Accessible to every
 * authenticated user (department operators reach their work here; the Capacity
 * planning page stays admin-only). Data is user-scoped and backend-gated.
 */

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444', title: '#F0F6FF',
};
const displayCase = (s: string) => (s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : s);
const statusColor = (st: string) =>
  (({ pending: '#64748B', ready: '#00c8ff', checked_in: '#D97706', done: '#22C55E', quality_hold: '#EF4444' }) as Record<string, string>)[st] || '#64748B';

export default function MyWorkPage() {
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [notifs, setNotifs] = useState<AppNotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, n] = await Promise.all([listMyTasks(), listNotifications()]);
      setTasks(t); setNotifs(n.items); setUnread(n.unread); setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load your work.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const doCheckIn = async (id: string) => { try { await checkInTask(id); await load(); } catch (e: any) { setError(e?.response?.data?.message || 'Check-in failed.'); } };
  const doCheckOut = async (id: string) => { try { await checkOutTask(id, { status: 'done' }); await load(); } catch (e: any) { setError(e?.response?.data?.message || 'Check-out failed.'); } };
  const readOne = async (id: string) => { try { await markNotificationRead(id); await load(); } catch { /* noop */ } };
  const readAll = async () => { try { await markAllNotificationsRead(); await load(); } catch { /* noop */ } };

  const cellSx = { color: C.text, fontSize: 13, borderBottom: `1px solid ${C.border}`, py: 0.9 };
  const headSx = { color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderBottom: `1px solid ${C.border}`, py: 0.8 };
  const btnSx = { textTransform: 'none', fontSize: '0.74rem', color: C.blue, minWidth: 0, px: 1.2 } as const;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: C.bg, minHeight: '100%' }}>
      <Typography sx={{ color: C.title, fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.02em' }}>My Work</Typography>
      <Typography sx={{ color: C.sub, fontSize: '0.82rem', mt: 0.25, mb: 2.5 }}>Your assigned tasks — check in when you start, check out when done.</Typography>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: `1px solid ${C.border}`, fontSize: 12 }}>{error}</Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress sx={{ color: C.blue }} /></Box>
      ) : (
        <>
          <Box sx={{ bgcolor: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', p: 2, mb: 2.5 }}>
            <Typography sx={{ color: C.title, fontWeight: 800, fontSize: '0.95rem', mb: 1.5 }}>Tasks</Typography>
            {tasks.length === 0 ? (
              <Typography sx={{ color: C.sub, fontSize: '0.82rem' }}>No tasks assigned to you right now.</Typography>
            ) : (
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell sx={headSx}>Title</TableCell>
                  <TableCell sx={headSx}>Department</TableCell>
                  <TableCell sx={headSx}>Status</TableCell>
                  <TableCell sx={headSx} align="right">Action</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {tasks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell sx={cellSx}>{t.title}</TableCell>
                      <TableCell sx={cellSx}>{displayCase(t.department)}</TableCell>
                      <TableCell sx={cellSx}><Chip label={displayCase(t.status)} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.06)', color: statusColor(t.status), fontWeight: 700 }} /></TableCell>
                      <TableCell sx={cellSx} align="right">
                        {(t.status === 'pending' || t.status === 'ready') && <Button size="small" onClick={() => doCheckIn(t.id)} sx={btnSx}>Check in</Button>}
                        {t.status === 'checked_in' && <Button size="small" onClick={() => doCheckOut(t.id)} sx={btnSx}>Check out</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>

          <Box sx={{ bgcolor: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography sx={{ color: C.title, fontWeight: 800, fontSize: '0.95rem' }}>Notifications{unread ? ` (${unread})` : ''}</Typography>
              <Button size="small" disabled={!unread} onClick={readAll} sx={btnSx}>Mark all read</Button>
            </Box>
            {notifs.length === 0 ? (
              <Typography sx={{ color: C.sub, fontSize: '0.82rem' }}>No notifications.</Typography>
            ) : notifs.map((n) => (
              <Box key={n.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, py: 1, borderBottom: `1px solid ${C.border}` }}>
                <Box>
                  <Typography sx={{ color: n.read_at ? C.sub : C.title, fontSize: '0.84rem', fontWeight: n.read_at ? 500 : 700 }}>{n.title}</Typography>
                  {n.body ? <Typography sx={{ color: C.sub, fontSize: '0.76rem' }}>{n.body}</Typography> : null}
                </Box>
                {!n.read_at && <Button size="small" onClick={() => readOne(n.id)} sx={btnSx}>Mark read</Button>}
              </Box>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
