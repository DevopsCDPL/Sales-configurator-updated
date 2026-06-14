import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Grid, Tabs, Tab, TextField, MenuItem, Button, Table,
  TableHead, TableRow, TableCell, TableBody, IconButton, Chip, CircularProgress,
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import {
  listTeams, createTeam, deleteTeam,
  listWorkers, createWorker, deleteWorker,
  listMachines, createMachine, deleteMachine,
  listTasks, createTask, checkInTask, checkOutTask, listMyTasks,
  listNotifications, markNotificationRead, markAllNotificationsRead,
  CapacityTeam, CapacityWorker, CapacityMachine, WorkTask, AppNotificationRow,
} from '../services/capacityService';

/* ── Palette (shared with Overwatch) ────────────────────── */
const C = {
  bg: '#000000',
  surface: '#0B0B0D',
  border: '#1E2235',
  blue: '#00c8ff',
  blueText: '#06151c',
  sub: '#64748B',
  text: '#E2E8F0',
  title: '#F0F6FF',
  green: '#22C55E',
  amber: '#D97706',
  red: '#EF4444',
};

/* The 8 department roles (departments.js). */
const DEPARTMENTS = [
  'manufacturing', 'procurement', 'assembly', 'outsourcing',
  'quality', 'packing', 'logistics', 'commissioning',
];

/* Seed machine / work-center types (editable free text too). */
const MACHINE_TYPES = ['cnc_punch', 'press_brake', 'shear', 'plating', 'test_bay', 'assembly_bench', 'generic'];

/* sentence-case a snake/lower token for display. */
const displayCase = (s: string) =>
  (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/* ── Field styling helpers (dark inputs) ────────────────── */
const fieldSx = {
  '& .MuiInputBase-root': { color: C.text, bgcolor: C.bg, fontSize: '0.82rem' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: C.border },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.blue },
  '& .MuiInputLabel-root': { color: C.sub, fontSize: '0.82rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: C.blue },
  '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: C.blue },
};

const Card: React.FC<{ title?: string; sub?: string; children: React.ReactNode; sx?: any }> = ({ title, sub, children, sx }) => (
  <Box sx={{ bgcolor: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', p: 2.25, ...sx }}>
    {title && (
      <Typography sx={{ color: C.title, fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
        {title}
      </Typography>
    )}
    {sub && <Typography sx={{ color: C.sub, fontSize: '0.74rem', mt: 0.25, mb: 1.5 }}>{sub}</Typography>}
    {!sub && title && <Box sx={{ mb: 1.5 }} />}
    {children}
  </Box>
);

const headCellSx = { color: `${C.sub} !important`, fontWeight: 700 } as const;
const tableSx = { '& td, & th': { borderColor: C.border, color: C.text, fontSize: '0.78rem', py: 0.7 } } as const;

const addBtnSx = {
  bgcolor: C.blue, color: C.blueText, fontWeight: 700, textTransform: 'none' as const,
  fontSize: '0.78rem', '&:hover': { bgcolor: '#33d4ff' },
  '&.Mui-disabled': { bgcolor: C.border, color: C.sub },
};

const CapacityPlanningPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'main_admin' || user?.role === 'admin' || !!user?.is_co_admin;

  const [tab, setTab] = useState(0);
  const [teams, setTeams] = useState<CapacityTeam[]>([]);
  const [workers, setWorkers] = useState<CapacityWorker[]>([]);
  const [machines, setMachines] = useState<CapacityMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [teamForm, setTeamForm] = useState({ name: '', department: DEPARTMENTS[0] });
  const [workerForm, setWorkerForm] = useState({ display_name: '', team_id: '', skills: '', hours_per_day: 8 });
  const [machineForm, setMachineForm] = useState({ name: '', type: MACHINE_TYPES[0], capacity_per_day: 8 });
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [myTasks, setMyTasks] = useState<WorkTask[]>([]);
  const [notifications, setNotifications] = useState<AppNotificationRow[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [taskForm, setTaskForm] = useState({ title: '', department: DEPARTMENTS[0], assignee_user_id: '', est_hours: '', board_id: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, w, m, tk, mt, nf] = await Promise.all([listTeams(), listWorkers(), listMachines(), listTasks(), listMyTasks(), listNotifications()]);
      setTeams(t); setWorkers(w); setMachines(m); setTasks(tk); setMyTasks(mt); setNotifications(nf.items); setNotifUnread(nf.unread);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load capacity data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const teamName = (id?: string | null) => teams.find((t) => t.id === id)?.name || '—';

  const handleAddTeam = async () => {
    if (!teamForm.name.trim()) return;
    setSaving(true);
    try {
      await createTeam({ name: teamForm.name.trim(), department: teamForm.department });
      setTeamForm({ name: '', department: DEPARTMENTS[0] });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to add team.');
    } finally { setSaving(false); }
  };

  const handleAddWorker = async () => {
    if (!workerForm.display_name.trim()) return;
    const team = teams.find((t) => t.id === workerForm.team_id);
    if (!team) { setError('Pick a team for the worker first.'); return; }
    setSaving(true);
    try {
      await createWorker({
        display_name: workerForm.display_name.trim(),
        department: team.department,
        team_id: team.id,
        skills: workerForm.skills.split(',').map((s) => s.trim()).filter(Boolean),
        hours_per_day: Number(workerForm.hours_per_day) || 8,
      });
      setWorkerForm({ display_name: '', team_id: '', skills: '', hours_per_day: 8 });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to add worker.');
    } finally { setSaving(false); }
  };

  const handleAddMachine = async () => {
    if (!machineForm.name.trim()) return;
    setSaving(true);
    try {
      await createMachine({
        name: machineForm.name.trim(),
        type: machineForm.type,
        capacity_per_day: Number(machineForm.capacity_per_day) || 8,
      });
      setMachineForm({ name: '', type: MACHINE_TYPES[0], capacity_per_day: 8 });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to add machine.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (kind: 'team' | 'worker' | 'machine', id: string) => {
    try {
      if (kind === 'team') await deleteTeam(id);
      else if (kind === 'worker') await deleteWorker(id);
      else await deleteMachine(id);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to delete.');
    }
  };

  const reloadTasks = async () => {
    try {
      const [tk, mt, nf] = await Promise.all([listTasks(), listMyTasks(), listNotifications()]);
      setTasks(tk); setMyTasks(mt); setNotifications(nf.items); setNotifUnread(nf.unread);
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to refresh tasks.'); }
  };
  const handleAddTask = async () => {
    if (!taskForm.title.trim()) return;
    setSaving(true);
    try {
      await createTask({
        title: taskForm.title.trim(),
        department: taskForm.department,
        assignee_user_id: taskForm.assignee_user_id || null,
        est_hours: taskForm.est_hours ? Number(taskForm.est_hours) : null,
        board_id: taskForm.board_id.trim() || null,
      });
      setTaskForm({ title: '', department: DEPARTMENTS[0], assignee_user_id: '', est_hours: '', board_id: '' });
      await reloadTasks();
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to add task.'); }
    finally { setSaving(false); }
  };
  const handleCheckIn = async (id: string) => {
    try { await checkInTask(id); await reloadTasks(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Check-in failed.'); }
  };
  const handleCheckOut = async (id: string, status = 'done') => {
    try { await checkOutTask(id, { status }); await reloadTasks(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Check-out failed.'); }
  };
  const handleMarkRead = async (id: string) => {
    try { await markNotificationRead(id); await reloadTasks(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed.'); }
  };
  const handleMarkAllRead = async () => {
    try { await markAllNotificationsRead(); await reloadTasks(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed.'); }
  };
  const assigneeName = (uid?: string | null) => {
    if (!uid) return '\u2014';
    if (uid === user?.id) return 'Me';
    const w = workers.find((x) => x.user_id === uid);
    return w?.display_name || uid.slice(0, 8);
  };
  const statusColor = (st: string) => (({ pending: '#64748B', assigned: '#00c8ff', in_progress: '#D97706', done: '#22C55E' }) as Record<string, string>)[st] || '#64748B';
  const miniBtnSx = { textTransform: 'none', fontSize: '0.72rem', color: C.blue, minWidth: 0, px: 1 } as const;

  const hasAll = teams.length > 0 && workers.length > 0 && machines.length > 0;

  if (!isAdmin) {
    return (
      <Box sx={{ p: 4, bgcolor: C.bg, minHeight: '100%' }}>
        <Typography sx={{ color: C.sub }}>You do not have access to capacity planning.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: C.bg, minHeight: '100%' }}>
      {/* Header */}
      <Box sx={{ mb: 2.5 }}>
        <Typography sx={{ color: C.title, fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.02em' }}>
          Capacity planning
        </Typography>
        <Typography sx={{ color: C.sub, fontSize: '0.82rem', mt: 0.25 }}>
          Set up your teams, people and machines — the planner uses this to schedule approved projects.
        </Typography>
      </Box>

      {error && (
        <Box sx={{ mb: 2 }}>
          <Card sx={{ p: 1.5, borderColor: C.red }}>
            <Typography sx={{ color: C.red, fontSize: '0.82rem' }}>{error}</Typography>
          </Card>
        </Box>
      )}

      {/* Planner status panel */}
      <Box sx={{ mb: 2.5 }}>
        <Card title="Planner">
          {hasAll ? (
            <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: C.green, mt: '5px', boxShadow: `0 0 6px ${C.green}` }} />
              <Typography sx={{ color: C.text, fontSize: '0.84rem', lineHeight: 1.4 }}>
                Capacity data ready — auto-planner activates after the workflow questions are answered
                (see docs/capacity-traveler-design.md).
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: C.amber, mt: '5px', boxShadow: `0 0 6px ${C.amber}` }} />
              <Typography sx={{ color: C.sub, fontSize: '0.84rem', lineHeight: 1.4 }}>
                Add at least one team, one worker and one machine / work center to get started.
                The planner stays inert until your capacity setup is complete.
              </Typography>
            </Box>
          )}
        </Card>
      </Box>

      {/* Setup tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2,
          '& .MuiTab-root': { color: C.sub, textTransform: 'none', fontWeight: 600, fontSize: '0.84rem' },
          '& .MuiTab-root.Mui-selected': { color: C.blue },
          '& .MuiTabs-indicator': { bgcolor: C.blue },
        }}
      >
        <Tab label={`Teams (${teams.length})`} />
        <Tab label={`Workers (${workers.length})`} />
        <Tab label={`Machines / work centers (${machines.length})`} />
        <Tab label={`Tasks (${tasks.length})`} />
        <Tab label={`My work (${myTasks.length})`} />
        <Tab label={`Notifications${notifUnread ? ` (${notifUnread})` : ''}`} />
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: C.blue }} />
        </Box>
      ) : (
        <>
          {/* ── Teams ── */}
          {tab === 0 && (
            <Card>
              <Grid container spacing={1.5} sx={{ mb: 2 }} alignItems="flex-end">
                <Grid item xs={12} sm={5}>
                  <TextField fullWidth size="small" label="Team name" sx={fieldSx}
                    value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth select size="small" label="Department" sx={fieldSx}
                    value={teamForm.department} onChange={(e) => setTeamForm({ ...teamForm, department: e.target.value })}>
                    {DEPARTMENTS.map((d) => <MenuItem key={d} value={d}>{displayCase(d)}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Button fullWidth startIcon={<AddIcon />} disabled={saving || !teamForm.name.trim()}
                    onClick={handleAddTeam} sx={addBtnSx}>Add team</Button>
                </Grid>
              </Grid>
              {teams.length === 0 ? (
                <Typography sx={{ color: C.sub, fontSize: '0.82rem' }}>No teams yet.</Typography>
              ) : (
                <Table size="small" sx={tableSx}>
                  <TableHead><TableRow>
                    <TableCell sx={headCellSx}>Name</TableCell>
                    <TableCell sx={headCellSx}>Department</TableCell>
                    <TableCell sx={headCellSx} align="right">Remove</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {teams.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.name}</TableCell>
                        <TableCell><Chip label={displayCase(t.department)} size="small"
                          sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(0,200,255,0.08)', color: C.blue, fontWeight: 700 }} /></TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => handleDelete('team', t.id)} sx={{ color: C.sub, '&:hover': { color: C.red } }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* ── Workers ── */}
          {tab === 1 && (
            <Card>
              {teams.length === 0 && (
                <Typography sx={{ color: C.amber, fontSize: '0.78rem', mb: 1.5 }}>
                  Add a team first — workers must be linked to a team.
                </Typography>
              )}
              <Grid container spacing={1.5} sx={{ mb: 2 }} alignItems="flex-end">
                <Grid item xs={12} sm={3}>
                  <TextField fullWidth size="small" label="Worker name" sx={fieldSx}
                    value={workerForm.display_name} onChange={(e) => setWorkerForm({ ...workerForm, display_name: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField fullWidth select size="small" label="Team" sx={fieldSx}
                    value={workerForm.team_id} onChange={(e) => setWorkerForm({ ...workerForm, team_id: e.target.value })}>
                    {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name} ({displayCase(t.department)})</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField fullWidth size="small" label="Skills (comma sep, optional)" sx={fieldSx}
                    value={workerForm.skills} onChange={(e) => setWorkerForm({ ...workerForm, skills: e.target.value })} />
                </Grid>
                <Grid item xs={6} sm={1.5}>
                  <TextField fullWidth size="small" type="number" label="Hrs/day" sx={fieldSx}
                    value={workerForm.hours_per_day} onChange={(e) => setWorkerForm({ ...workerForm, hours_per_day: Number(e.target.value) })} />
                </Grid>
                <Grid item xs={6} sm={1.5}>
                  <Button fullWidth startIcon={<AddIcon />} disabled={saving || !workerForm.display_name.trim() || !workerForm.team_id}
                    onClick={handleAddWorker} sx={addBtnSx}>Add</Button>
                </Grid>
              </Grid>
              {workers.length === 0 ? (
                <Typography sx={{ color: C.sub, fontSize: '0.82rem' }}>No workers yet.</Typography>
              ) : (
                <Table size="small" sx={tableSx}>
                  <TableHead><TableRow>
                    <TableCell sx={headCellSx}>Name</TableCell>
                    <TableCell sx={headCellSx}>Team</TableCell>
                    <TableCell sx={headCellSx}>Department</TableCell>
                    <TableCell sx={headCellSx}>Skills</TableCell>
                    <TableCell sx={headCellSx} align="right">Hrs/day</TableCell>
                    <TableCell sx={headCellSx} align="right">Remove</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {workers.map((w) => (
                      <TableRow key={w.id}>
                        <TableCell>{w.display_name || '—'}</TableCell>
                        <TableCell sx={{ color: `${C.sub} !important` }}>{teamName(w.team_id)}</TableCell>
                        <TableCell sx={{ color: `${C.sub} !important` }}>{displayCase(w.department)}</TableCell>
                        <TableCell sx={{ color: `${C.sub} !important` }}>{(w.skills && w.skills.length) ? w.skills.join(', ') : '—'}</TableCell>
                        <TableCell align="right">{w.hours_per_day}</TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => handleDelete('worker', w.id)} sx={{ color: C.sub, '&:hover': { color: C.red } }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* ── Machines ── */}
          {tab === 2 && (
            <Card>
              <Grid container spacing={1.5} sx={{ mb: 2 }} alignItems="flex-end">
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Machine / work center name" sx={fieldSx}
                    value={machineForm.name} onChange={(e) => setMachineForm({ ...machineForm, name: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={3}>
                  <TextField fullWidth select size="small" label="Type" sx={fieldSx}
                    value={machineForm.type} onChange={(e) => setMachineForm({ ...machineForm, type: e.target.value })}>
                    {MACHINE_TYPES.map((m) => <MenuItem key={m} value={m}>{displayCase(m)}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={6} sm={2.5}>
                  <TextField fullWidth size="small" type="number" label="Capacity hrs/day" sx={fieldSx}
                    value={machineForm.capacity_per_day} onChange={(e) => setMachineForm({ ...machineForm, capacity_per_day: Number(e.target.value) })} />
                </Grid>
                <Grid item xs={6} sm={2.5}>
                  <Button fullWidth startIcon={<AddIcon />} disabled={saving || !machineForm.name.trim()}
                    onClick={handleAddMachine} sx={addBtnSx}>Add machine</Button>
                </Grid>
              </Grid>
              {machines.length === 0 ? (
                <Typography sx={{ color: C.sub, fontSize: '0.82rem' }}>No machines / work centers yet.</Typography>
              ) : (
                <Table size="small" sx={tableSx}>
                  <TableHead><TableRow>
                    <TableCell sx={headCellSx}>Name</TableCell>
                    <TableCell sx={headCellSx}>Type</TableCell>
                    <TableCell sx={headCellSx} align="right">Capacity (hrs/day)</TableCell>
                    <TableCell sx={headCellSx} align="right">Remove</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {machines.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{m.name}</TableCell>
                        <TableCell><Chip label={displayCase(m.type)} size="small"
                          sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(0,200,255,0.08)', color: C.blue, fontWeight: 700 }} /></TableCell>
                        <TableCell align="right">{m.capacity_per_day}</TableCell>
                        <TableCell align="right">
                          <IconButton size="small" onClick={() => handleDelete('machine', m.id)} sx={{ color: C.sub, '&:hover': { color: C.red } }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* ── Tasks ── */}
          {tab === 3 && (
            <Card>
              <Grid container spacing={1.5} sx={{ mb: 2 }} alignItems="flex-end">
                <Grid item xs={12} sm={3}>
                  <TextField fullWidth size="small" label="Task title" sx={fieldSx}
                    value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField fullWidth select size="small" label="Department" sx={fieldSx}
                    value={taskForm.department} onChange={(e) => setTaskForm({ ...taskForm, department: e.target.value })}>
                    {DEPARTMENTS.map((d) => <MenuItem key={d} value={d}>{displayCase(d)}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth select size="small" label="Assignee" sx={fieldSx}
                    value={taskForm.assignee_user_id} onChange={(e) => setTaskForm({ ...taskForm, assignee_user_id: e.target.value })}>
                    <MenuItem value="">— Unassigned —</MenuItem>
                    {user?.id ? <MenuItem value={user.id}>Me</MenuItem> : null}
                    {workers.filter((w) => w.user_id && w.user_id !== user?.id).map((w) => (
                      <MenuItem key={w.id} value={w.user_id as string}>{w.display_name || 'Worker'}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid item xs={6} sm={2}>
                  <TextField fullWidth size="small" label="Est. hours" type="number" sx={fieldSx}
                    value={taskForm.est_hours} onChange={(e) => setTaskForm({ ...taskForm, est_hours: e.target.value })} />
                </Grid>
                <Grid item xs={6} sm={2}>
                  <Button fullWidth startIcon={<AddIcon />} disabled={saving || !taskForm.title.trim()}
                    onClick={handleAddTask} sx={addBtnSx}>Add task</Button>
                </Grid>
              </Grid>
              {tasks.length === 0 ? (
                <Typography sx={{ color: C.sub, fontSize: '0.82rem' }}>No tasks yet.</Typography>
              ) : (
                <Table size="small" sx={tableSx}>
                  <TableHead><TableRow>
                    <TableCell sx={headCellSx}>Title</TableCell>
                    <TableCell sx={headCellSx}>Department</TableCell>
                    <TableCell sx={headCellSx}>Assignee</TableCell>
                    <TableCell sx={headCellSx}>Status</TableCell>
                    <TableCell sx={headCellSx} align="right">Action</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {tasks.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.title}</TableCell>
                        <TableCell><Chip label={displayCase(t.department)} size="small"
                          sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(0,200,255,0.08)', color: C.blue, fontWeight: 700 }} /></TableCell>
                        <TableCell>{assigneeName(t.assignee_user_id)}</TableCell>
                        <TableCell><Chip label={displayCase(t.status)} size="small"
                          sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.06)', color: statusColor(t.status), fontWeight: 700 }} /></TableCell>
                        <TableCell align="right">
                          {(t.status === 'pending' || t.status === 'assigned') && (
                            <Button size="small" onClick={() => handleCheckIn(t.id)} sx={miniBtnSx}>Check in</Button>
                          )}
                          {t.status === 'in_progress' && (
                            <Button size="small" onClick={() => handleCheckOut(t.id)} sx={miniBtnSx}>Check out</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* ── My work ── */}
          {tab === 4 && (
            <Card>
              {myTasks.length === 0 ? (
                <Typography sx={{ color: C.sub, fontSize: '0.82rem' }}>No tasks assigned to you.</Typography>
              ) : (
                <Table size="small" sx={tableSx}>
                  <TableHead><TableRow>
                    <TableCell sx={headCellSx}>Title</TableCell>
                    <TableCell sx={headCellSx}>Department</TableCell>
                    <TableCell sx={headCellSx}>Status</TableCell>
                    <TableCell sx={headCellSx} align="right">Action</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {myTasks.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.title}</TableCell>
                        <TableCell>{displayCase(t.department)}</TableCell>
                        <TableCell><Chip label={displayCase(t.status)} size="small"
                          sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.06)', color: statusColor(t.status), fontWeight: 700 }} /></TableCell>
                        <TableCell align="right">
                          {(t.status === 'pending' || t.status === 'assigned') && (
                            <Button size="small" onClick={() => handleCheckIn(t.id)} sx={miniBtnSx}>Check in</Button>
                          )}
                          {t.status === 'in_progress' && (
                            <Button size="small" onClick={() => handleCheckOut(t.id)} sx={miniBtnSx}>Check out</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* ── Notifications ── */}
          {tab === 5 && (
            <Card>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                <Button size="small" disabled={!notifUnread} onClick={handleMarkAllRead} sx={miniBtnSx}>Mark all read</Button>
              </Box>
              {notifications.length === 0 ? (
                <Typography sx={{ color: C.sub, fontSize: '0.82rem' }}>No notifications.</Typography>
              ) : (
                notifications.map((n) => (
                  <Box key={n.id} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, py: 1, borderBottom: `1px solid ${C.border}` }}>
                    <Box>
                      <Typography sx={{ color: n.read_at ? C.sub : C.title, fontSize: '0.84rem', fontWeight: n.read_at ? 500 : 700 }}>{n.title}</Typography>
                      {n.body ? <Typography sx={{ color: C.sub, fontSize: '0.76rem' }}>{n.body}</Typography> : null}
                    </Box>
                    {!n.read_at && <Button size="small" onClick={() => handleMarkRead(n.id)} sx={miniBtnSx}>Mark read</Button>}
                  </Box>
                ))
              )}
            </Card>
          )}

        </>
      )}
    </Box>
  );
};

export default CapacityPlanningPage;
