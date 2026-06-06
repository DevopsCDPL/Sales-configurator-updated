import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Button, alpha,
  Stack, CircularProgress, Avatar, LinearProgress, Grid, Tooltip,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  ToggleButtonGroup, ToggleButton, TextField, FormControl, InputLabel,
  Select, MenuItem, Checkbox, ListItemText, Autocomplete,
  FormControlLabel, Switch,
} from '@mui/material';
import {
  PersonAdd as PersonAddIcon,
  Login as LoginIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Security as SecurityIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon,
  Business as CompanyIcon,
  Description as DocIcon,
  AdminPanelSettings as AdminIcon,
  Timeline as TimelineIcon,
  TrendingUp as TrendingIcon,
  FilterList as FilterIcon,
  Speed as SpeedIcon,
  Warning as WarningIcon,
  CalendarMonth as CalendarIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Close as CloseIcon,
  ViewWeek as WeekIcon,
  Today as DayIcon,
  CalendarViewMonth as MonthIcon,
  Add as AddIcon,
  Event as EventIcon,
  Flag as FlagIcon,
  Assignment as TaskIcon,
  Groups as MeetingIcon,
  AccessTime as TimeIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { useSearchParams } from 'react-router-dom';

const PRIMARY = '#1F7A63';

/* ── Event type colors ─────────────────────────────────── */
const EVENT_COLORS: Record<string, string> = {
  meeting: '#166354',  // Blue
  deadline: '#dc2626', // Red
  task: '#16a34a',     // Green
};
const EVENT_LABELS: Record<string, string> = {
  meeting: 'Meeting',
  deadline: 'Deadline',
  task: 'Task',
};
const EVENT_ICONS: Record<string, React.ReactElement<any>> = {
  meeting: <MeetingIcon />,
  deadline: <FlagIcon />,
  task: <TaskIcon />,
};

const PROJECT_MODULES = [
  { value: 'estimation', label: 'Estimation (legacy)' },
  { value: 'quotation', label: 'Quotation' },
  { value: 'po_from_client', label: 'PO from Client' },
  { value: 'work_order', label: 'Work Order' },
  { value: 'production', label: 'Production' },
  { value: 'quality', label: 'Quality' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'invoice', label: 'Invoice' },
];

const REMINDER_OPTIONS = [
  { value: 'none', label: 'No reminder' },
  { value: '15min', label: '15 minutes before' },
  { value: '1hour', label: '1 hour before' },
  { value: '1day', label: '1 day before' },
];

/* ── Types ─────────────────────────────────────────────── */
interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  event_type: 'meeting' | 'deadline' | 'task';
  project_id?: string;
  project_module?: string;
  event_date: string;
  start_time?: string;
  end_time?: string;
  all_day: boolean;
  assigned_users: string[];
  reminder: string;
  is_overdue: boolean;
  completed: boolean;
  creator?: { id: string; name: string; email: string };
  project?: { id: string; project_name: string; quotation_number?: string };
}

interface TimelineEntry {
  id: string; action: string; description: string; icon?: string;
  severity: string; created_at: string; metadata?: any;
  user?: { id: string; name: string; email: string };
  company?: { name: string };
}

interface SimpleUser { id: string; name: string; email: string; }
interface SimpleProject { id: string; project_name: string; quotation_number?: string; }

/* ── Helpers ───────────────────────────────────────────── */
function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const ACTION_CONFIG: Record<string, { icon: React.ReactElement<any>; color: string; label: string }> = {
  user_created:       { icon: <PersonAddIcon />, color: '#1F7A63', label: 'User Created' },
  user_updated:       { icon: <EditIcon />,      color: '#1F7A63', label: 'User Updated' },
  user_deleted:       { icon: <DeleteIcon />,    color: '#dc2626', label: 'User Deleted' },
  login:              { icon: <LoginIcon />,     color: PRIMARY,      label: 'Login' },
  login_failed:       { icon: <LoginIcon />,     color: '#dc2626', label: 'Login Failed' },
  role_assigned:      { icon: <AdminIcon />,     color: '#2A9D7E', label: 'Role Assigned' },
  role_created:       { icon: <SecurityIcon />,  color: '#2A9D7E', label: 'Role Created' },
  session_revoked:    { icon: <SecurityIcon />,  color: '#b45309', label: 'Session Revoked' },
  company_created:    { icon: <CompanyIcon />,   color: '#1F7A63', label: 'Company Created' },
  company_updated:    { icon: <CompanyIcon />,   color: '#1F7A63', label: 'Company Updated' },
  settings_changed:   { icon: <SettingsIcon />,  color: '#6B7280', label: 'Settings Changed' },
  document_uploaded:  { icon: <DocIcon />,       color: '#1F7A63', label: 'Document Uploaded' },
  approval_created:   { icon: <DocIcon />,       color: '#b45309', label: 'Approval Created' },
  approval_approved:  { icon: <DocIcon />,       color: '#1F7A63', label: 'Approved' },
  approval_rejected:  { icon: <DocIcon />,       color: '#dc2626', label: 'Rejected' },
};

const SEVERITY_COLOR: Record<string, string> = {
  low: '#6B7280', medium: '#1F7A63', high: '#b45309', critical: '#dc2626',
};

const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDateLabel = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const fmtMonthYear = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

const getConfig = (action: string) =>
  ACTION_CONFIG[action] || { icon: <SettingsIcon />, color: '#6B7280', label: action.replace(/_/g, ' ') };

/* ── Stat Card ─────────────────────────────── */
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

/* ── Empty Form State ─────────────────────── */
const EMPTY_FORM = {
  title: '',
  description: '',
  event_type: 'task' as 'meeting' | 'deadline' | 'task',
  project_id: '',
  project_module: '',
  event_date: '',
  start_time: '',
  end_time: '',
  all_day: true,
  assigned_users: [] as string[],
  reminder: 'none',
};

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
const ActivityTimelineView: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { showError, showSuccess } = useNotification();
  const isMainAdmin = currentUser?.role === 'main_admin';
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar'>(
    searchParams.get('view') === 'calendar' ? 'calendar' : 'calendar'
  );

  /* Calendar state */
  const [calDate, setCalDate] = useState(new Date());
  const [calView, setCalView] = useState<'month' | 'week' | 'day'>('month');

  /* Events state */
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  /* Event modal */
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventDialogMode, setEventDialogMode] = useState<'create' | 'edit' | 'view'>('create');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventForm, setEventForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  /* Day detail dialog */
  const [dayDialogDate, setDayDialogDate] = useState<string | null>(null);

  /* Reference data */
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [projects, setProjects] = useState<SimpleProject[]>([]);

  /* Filters */
  const [filterType, setFilterType] = useState<string>('');
  const [filterProject, setFilterProject] = useState<string>('');
  const [filterUser, setFilterUser] = useState<string>('');

  /* Timeline data (for timeline view) */
  const [allEntries, setAllEntries] = useState<TimelineEntry[]>([]);

  // ── Load reference data ────────────────────────────────────────────────
  useEffect(() => {
    const loadRef = async () => {
      try {
        const [usersRes, projectsRes] = await Promise.all([
          api.get('/users'),
          api.get('/projects'),
        ]);
        setUsers((usersRes.data.data || usersRes.data || []).map((u: any) => ({
          id: u.id, name: u.name, email: u.email,
        })));
        setProjects((projectsRes.data.data || projectsRes.data || []).map((p: any) => ({
          id: p.id, project_name: p.project_name, quotation_number: p.quotation_number,
        })));
      } catch { /* ignore */ }
    };
    loadRef();
  }, []);

  // ── Load calendar events ───────────────────────────────────────────────
  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      // Calculate date range based on current view
      let startDate: string, endDate: string;
      if (calView === 'month') {
        const first = new Date(calDate.getFullYear(), calDate.getMonth(), 1);
        const last = new Date(calDate.getFullYear(), calDate.getMonth() + 2, 0);
        // Pad for prev/next month days shown
        first.setDate(first.getDate() - 7);
        startDate = toDateKey(first);
        endDate = toDateKey(last);
      } else if (calView === 'week') {
        const day = calDate.getDay();
        const start = new Date(calDate);
        start.setDate(calDate.getDate() - day);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        startDate = toDateKey(start);
        endDate = toDateKey(end);
      } else {
        startDate = toDateKey(calDate);
        endDate = startDate;
      }
      const params: any = { startDate, endDate };
      if (filterType) params.eventType = filterType;
      if (filterProject) params.projectId = filterProject;
      if (filterUser) params.userId = filterUser;

      const { data } = await api.get('/calendar-events', { params });
      setEvents(data.data || []);
    } catch { /* ignore */ }
    setEventsLoading(false);
  }, [calDate, calView, filterType, filterProject, filterUser]);

  useEffect(() => {
    if (viewMode === 'calendar') loadEvents();
  }, [viewMode, loadEvents]);

  // ── Load timeline entries ──────────────────────────────────────────────
  const loadTimeline = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = isMainAdmin ? '/analytics/timeline/global' : '/analytics/timeline';
      const { data } = await api.get(endpoint, { params: { page, limit: 20 } });
      const result = data.data || {};
      if (page === 1) {
        setEntries(result.entries || []);
      } else {
        setEntries(prev => [...prev, ...(result.entries || [])]);
      }
      setTotal(result.total || 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [isMainAdmin, page]);

  useEffect(() => { if (viewMode === 'timeline') loadTimeline(); }, [viewMode, loadTimeline]);

  const loadCalendarEntries = useCallback(async () => {
    try {
      const endpoint = isMainAdmin ? '/analytics/timeline/global' : '/analytics/timeline';
      const { data } = await api.get(endpoint, { params: { page: 1, limit: 500 } });
      setAllEntries((data.data || {}).entries || []);
    } catch { /* ignore */ }
  }, [isMainAdmin]);

  // ── Events by date ─────────────────────────────────────────────────────
  const eventsByDate = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {};
    events.forEach(e => {
      const key = e.event_date; // Already YYYY-MM-DD
      if (!m[key]) m[key] = [];
      m[key].push(e);
    });
    return m;
  }, [events]);

  // Also include timeline entries by date (for calendar view)
  const timelineByDate = useMemo(() => {
    const m: Record<string, TimelineEntry[]> = {};
    allEntries.forEach(e => {
      const key = toDateKey(new Date(e.created_at));
      if (!m[key]) m[key] = [];
      m[key].push(e);
    });
    return m;
  }, [allEntries]);

  // ── Calendar navigation ────────────────────────────────────────────────
  const getMonthDays = (d: Date) => {
    const year = d.getFullYear(), month = d.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = first.getDay();
    const days: { date: Date; inMonth: boolean }[] = [];
    for (let i = startDay - 1; i >= 0; i--) {
      const pd = new Date(year, month, -i);
      days.push({ date: pd, inMonth: false });
    }
    for (let i = 1; i <= last.getDate(); i++) {
      days.push({ date: new Date(year, month, i), inMonth: true });
    }
    while (days.length < 42) {
      const nd = new Date(year, month + 1, days.length - last.getDate() - startDay + 1);
      days.push({ date: nd, inMonth: false });
    }
    return days;
  };

  const getWeekDays = (d: Date) => {
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => {
      const wd = new Date(start);
      wd.setDate(start.getDate() + i);
      return wd;
    });
  };

  const navigateCal = (dir: -1 | 1) => {
    const nd = new Date(calDate);
    if (calView === 'month') nd.setMonth(nd.getMonth() + dir);
    else if (calView === 'week') nd.setDate(nd.getDate() + dir * 7);
    else nd.setDate(nd.getDate() + dir);
    setCalDate(nd);
  };

  const calendarTitle = useMemo(() => {
    if (calView === 'month') return fmtMonthYear(calDate);
    if (calView === 'day') return fmtDateLabel(calDate);
    const week = getWeekDays(calDate);
    const s = week[0], e = week[6];
    if (s.getMonth() === e.getMonth()) return `${s.toLocaleDateString('en-US', { month: 'long' })} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`;
    return `${s.toLocaleDateString('en-US', { month: 'short' })} ${s.getDate()} – ${e.toLocaleDateString('en-US', { month: 'short' })} ${e.getDate()}, ${e.getFullYear()}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calDate, calView]);

  // ── Event CRUD handlers ────────────────────────────────────────────────
  const openCreateDialog = (date?: string) => {
    setEventForm({ ...EMPTY_FORM, event_date: date || toDateKey(new Date()) });
    setSelectedEvent(null);
    setEventDialogMode('create');
    setEventDialogOpen(true);
  };

  const openViewDialog = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventForm({
      title: event.title,
      description: event.description || '',
      event_type: event.event_type,
      project_id: event.project_id || '',
      project_module: event.project_module || '',
      event_date: event.event_date,
      start_time: event.start_time || '',
      end_time: event.end_time || '',
      all_day: event.all_day,
      assigned_users: event.assigned_users || [],
      reminder: event.reminder || 'none',
    });
    setEventDialogMode('view');
    setEventDialogOpen(true);
  };

  const switchToEdit = () => setEventDialogMode('edit');

  const handleSaveEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.event_date) {
      showError('Title and date are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...eventForm,
        project_id: eventForm.project_id || null,
        project_module: eventForm.project_module || null,
        start_time: eventForm.all_day ? null : (eventForm.start_time || null),
        end_time: eventForm.all_day ? null : (eventForm.end_time || null),
      };
      if (eventDialogMode === 'create') {
        await api.post('/calendar-events', payload);
        showSuccess('Event created');
      } else {
        await api.put(`/calendar-events/${selectedEvent!.id}`, payload);
        showSuccess('Event updated');
      }
      setEventDialogOpen(false);
      loadEvents();
    } catch {
      showError('Failed to save event');
    }
    setSaving(false);
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;
    setSaving(true);
    try {
      await api.delete(`/calendar-events/${selectedEvent.id}`);
      showSuccess('Event deleted');
      setEventDialogOpen(false);
      loadEvents();
    } catch {
      showError('Failed to delete event');
    }
    setSaving(false);
  };

  const handleToggleComplete = async (event: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.put(`/calendar-events/${event.id}`, { completed: !event.completed });
      loadEvents();
    } catch { /* ignore */ }
  };

  // ── Timeline helpers ───────────────────────────────────────────────────
  const severityCounts = useMemo(() => {
    const c = { low: 0, medium: 0, high: 0, critical: 0 };
    entries.forEach(e => { if (c.hasOwnProperty(e.severity)) (c as any)[e.severity]++; });
    return c;
  }, [entries]);

  const actionBreakdown = useMemo(() => {
    const m: Record<string, number> = {};
    entries.forEach(e => { m[e.action] = (m[e.action] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [entries]);

  const uniqueUsers = useMemo(() => {
    const s = new Set<string>();
    entries.forEach(e => { if (e.user?.name) s.add(e.user.name); });
    return s.size;
  }, [entries]);

  const displayed = filter ? entries.filter(e => e.action === filter) : entries;

  const recentCount = useMemo(() => {
    const cutoff = Date.now() - 3600000;
    return entries.filter(e => new Date(e.created_at).getTime() > cutoff).length;
  }, [entries]);

  // ── Event counts for stats ─────────────────────────────────────────────
  const eventStats = useMemo(() => {
    let meetings = 0, deadlines = 0, tasks = 0, overdue = 0;
    events.forEach(e => {
      if (e.event_type === 'meeting') meetings++;
      else if (e.event_type === 'deadline') deadlines++;
      else tasks++;
      if (e.is_overdue && !e.completed) overdue++;
    });
    return { meetings, deadlines, tasks, overdue, total: events.length };
  }, [events]);

  // ── Day dialog ─────────────────────────────────────────────────────────
  const dayDialogEvents = useMemo(() => {
    if (!dayDialogDate) return [];
    return eventsByDate[dayDialogDate] || [];
  }, [dayDialogDate, eventsByDate]);

  // ── Render event chip (for calendar cells) ─────────────────────────────
  const renderEventChip = (event: CalendarEvent, compact = false) => {
    const color = event.is_overdue && !event.completed ? '#dc2626' : EVENT_COLORS[event.event_type];
    const time = event.all_day ? '' : (event.start_time?.slice(0, 5) || '');
    return (
      <Box
        key={event.id}
        onClick={(e) => { e.stopPropagation(); openViewDialog(event); }}
        sx={{
          fontSize: compact ? 9 : 10, fontWeight: 600,
          color: event.completed ? '#94a3b8' : color,
          bgcolor: alpha(color, event.completed ? 0.04 : 0.08),
          borderRadius: '4px', px: .5, py: .15, mb: .3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.4, cursor: 'pointer',
          borderLeft: `2px solid ${event.completed ? '#d1d5db' : color}`,
          textDecoration: event.completed ? 'line-through' : 'none',
          transition: 'all .15s',
          '&:hover': { bgcolor: alpha(color, 0.15) },
        }}
      >
        {time ? `${time} ` : ''}{event.title}
      </Box>
    );
  };

  /* ═══════════════════════════════════ RENDER ════════════════════════════ */
  return (
    <Box sx={{ pb: 4, minHeight: '100vh', bgcolor: 'var(--bg-canvas)' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: 26, fontWeight: 800, color: '#1F2937', letterSpacing: -.3, lineHeight: 1.2 }}>
            {viewMode === 'calendar' ? 'Calendar & Scheduling' : 'Activity Timeline'}
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#94a3b8', mt: .4 }}>
            {viewMode === 'calendar'
              ? 'Plan meetings, track deadlines, and manage tasks'
              : (isMainAdmin ? 'Global platform activity feed' : 'Company activity feed')
            }
            {viewMode === 'timeline' && total > 0 && ` · ${total.toLocaleString()} events`}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {viewMode === 'calendar' && (
            <Button
              startIcon={<AddIcon sx={{ fontSize: 16 }} />}
              onClick={() => openCreateDialog()}
              variant="contained" size="small"
              sx={{
                textTransform: 'none', borderRadius: '10px', fontWeight: 600, fontSize: 13,
                bgcolor: PRIMARY, color: '#fff', boxShadow: `0 2px 8px ${alpha(PRIMARY, .25)}`,
                '&:hover': { bgcolor: alpha(PRIMARY, .9) },
              }}>
              Add Event
            </Button>
          )}
          <Button
            startIcon={viewMode === 'calendar' ? <TimelineIcon sx={{ fontSize: 16 }} /> : <CalendarIcon sx={{ fontSize: 16 }} />}
            onClick={() => {
              setViewMode(viewMode === 'timeline' ? 'calendar' : 'timeline');
              if (viewMode === 'timeline') loadCalendarEntries();
            }}
            variant={viewMode === 'calendar' ? 'outlined' : 'contained'} size="small"
            sx={{
              textTransform: 'none', borderRadius: '10px', fontWeight: 600, fontSize: 13,
              ...(viewMode === 'calendar'
                ? { borderColor: '#e5e7eb', color: '#6B7280' }
                : { bgcolor: PRIMARY, color: '#fff', boxShadow: `0 2px 8px ${alpha(PRIMARY, .25)}`, '&:hover': { bgcolor: alpha(PRIMARY, .9) } }),
            }}>
            {viewMode === 'calendar' ? 'Timeline' : 'Calendar'}
          </Button>
          <Button startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
            onClick={() => { if (viewMode === 'calendar') loadEvents(); else { setPage(1); } }}
            variant="outlined" size="small"
            sx={{ textTransform: 'none', borderRadius: '10px', borderColor: '#e5e7eb', color: '#6B7280', fontWeight: 600, fontSize: 13 }}>
            Refresh
          </Button>
        </Box>
      </Box>

      {viewMode === 'calendar' ? (
        /* ═══════════════════════ CALENDAR VIEW ═══════════════════════ */
        <>
          {/* Stat cards */}
          <Grid container spacing={2} sx={{ mb: 2.5 }}>
            <Grid item xs={6} sm={3}>
              <StatCard label="Total Events" value={eventStats.total} color={PRIMARY} icon={<EventIcon />} subtext="this view" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard label="Meetings" value={eventStats.meetings} color="#166354" icon={<MeetingIcon />} subtext="scheduled" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard label="Deadlines" value={eventStats.deadlines} color="#dc2626" icon={<FlagIcon />}
                subtext={eventStats.overdue > 0 ? `${eventStats.overdue} overdue` : 'on track'} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard label="Tasks" value={eventStats.tasks} color="#16a34a" icon={<TaskIcon />} subtext="in progress" />
            </Grid>
          </Grid>

          {/* Filter bar */}
          <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', mb: 2, p: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <FilterIcon sx={{ fontSize: 18, color: '#94a3b8' }} />
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel sx={{ fontSize: 12 }}>Event Type</InputLabel>
                <Select value={filterType} onChange={(e) => setFilterType(e.target.value as string)}
                  label="Event Type" sx={{ borderRadius: '10px', fontSize: 12, height: 36 }}>
                  <MenuItem value="" sx={{ fontSize: 12 }}>All Types</MenuItem>
                  <MenuItem value="meeting" sx={{ fontSize: 12 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#166354' }} /> Meeting
                    </Box>
                  </MenuItem>
                  <MenuItem value="deadline" sx={{ fontSize: 12 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#dc2626' }} /> Deadline
                    </Box>
                  </MenuItem>
                  <MenuItem value="task" sx={{ fontSize: 12 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#16a34a' }} /> Task
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel sx={{ fontSize: 12 }}>Project</InputLabel>
                <Select value={filterProject} onChange={(e) => setFilterProject(e.target.value as string)}
                  label="Project" sx={{ borderRadius: '10px', fontSize: 12, height: 36 }}>
                  <MenuItem value="" sx={{ fontSize: 12 }}>All Projects</MenuItem>
                  {projects.map(p => (
                    <MenuItem key={p.id} value={p.id} sx={{ fontSize: 12 }}>
                      {p.quotation_number ? `${p.quotation_number} – ` : ''}{p.project_name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel sx={{ fontSize: 12 }}>Assigned User</InputLabel>
                <Select value={filterUser} onChange={(e) => setFilterUser(e.target.value as string)}
                  label="Assigned User" sx={{ borderRadius: '10px', fontSize: 12, height: 36 }}>
                  <MenuItem value="" sx={{ fontSize: 12 }}>All Users</MenuItem>
                  {users.map(u => (
                    <MenuItem key={u.id} value={u.id} sx={{ fontSize: 12 }}>{u.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {(filterType || filterProject || filterUser) && (
                <Button size="small" onClick={() => { setFilterType(''); setFilterProject(''); setFilterUser(''); }}
                  sx={{ textTransform: 'none', fontSize: 11, color: '#94a3b8', minWidth: 0 }}>
                  Clear Filters
                </Button>
              )}
            </Box>
          </Card>

          {/* Calendar navigation bar */}
          <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', mb: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.5, flexWrap: 'wrap', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IconButton size="small" onClick={() => navigateCal(-1)} sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', width: 32, height: 32 }}>
                  <ChevronLeftIcon sx={{ fontSize: 18 }} />
                </IconButton>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1F2937', minWidth: 180, textAlign: 'center' }}>
                  {calendarTitle}
                </Typography>
                <IconButton size="small" onClick={() => navigateCal(1)} sx={{ border: '1px solid #e5e7eb', borderRadius: '8px', width: 32, height: 32 }}>
                  <ChevronRightIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {eventsLoading && <CircularProgress size={16} sx={{ color: PRIMARY }} />}
                <Button size="small" onClick={() => setCalDate(new Date())}
                  sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, borderRadius: '8px', border: '1px solid #e5e7eb', color: '#6B7280', minWidth: 0, px: 1.5 }}>
                  Today
                </Button>
                <ToggleButtonGroup size="small" exclusive value={calView} onChange={(_, v) => v && setCalView(v)}
                  sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: 11.5, fontWeight: 600, px: 1.2, py: .4, borderRadius: '8px !important', border: '1px solid #e5e7eb' } }}>
                  <ToggleButton value="month"><MonthIcon sx={{ fontSize: 14, mr: .4 }} />Month</ToggleButton>
                  <ToggleButton value="week"><WeekIcon sx={{ fontSize: 14, mr: .4 }} />Week</ToggleButton>
                  <ToggleButton value="day"><DayIcon sx={{ fontSize: 14, mr: .4 }} />Day</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Box>
          </Card>

          {/* ── MONTH VIEW ──────── */}
          {calView === 'month' && (() => {
            const days = getMonthDays(calDate);
            const today = toDateKey(new Date());
            return (
              <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', overflow: 'hidden' }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #f0f0f0' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <Box key={d} sx={{ py: 1, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5 }}>{d}</Typography>
                    </Box>
                  ))}
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {days.map(({ date, inMonth }, idx) => {
                    const key = toDateKey(date);
                    const evts = eventsByDate[key] || [];
                    const isToday = key === today;
                    return (
                      <Box key={idx}
                        onClick={() => {
                          if (evts.length > 0) setDayDialogDate(key);
                          else openCreateDialog(key);
                        }}
                        sx={{
                          minHeight: 100, p: .8, borderRight: (idx + 1) % 7 !== 0 ? '1px solid #f5f5f5' : 'none',
                          borderBottom: idx < 35 ? '1px solid #f5f5f5' : 'none',
                          bgcolor: isToday ? alpha(PRIMARY, .03) : (inMonth ? '#fff' : '#fafafa'),
                          cursor: 'pointer', transition: 'background .15s',
                          '&:hover': { bgcolor: alpha(PRIMARY, .06) },
                        }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: .3 }}>
                          <Typography sx={{
                            fontSize: 12, fontWeight: isToday ? 800 : 500,
                            color: isToday ? PRIMARY : (inMonth ? '#1F2937' : '#d1d5db'),
                            width: 24, height: 24, lineHeight: '24px', textAlign: 'center', borderRadius: '50%',
                            bgcolor: isToday ? alpha(PRIMARY, .12) : 'transparent',
                          }}>
                            {date.getDate()}
                          </Typography>
                          {evts.length === 0 && inMonth && (
                            <AddIcon sx={{ fontSize: 14, color: '#e5e7eb', opacity: 0, '.MuiBox-root:hover > .MuiBox-root > &': { opacity: 1 } }} />
                          )}
                        </Box>
                        {evts.slice(0, 3).map(ev => renderEventChip(ev, true))}
                        {evts.length > 3 && (
                          <Typography sx={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', pl: .3 }}>+{evts.length - 3} more</Typography>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Card>
            );
          })()}

          {/* ── WEEK VIEW ──────── */}
          {calView === 'week' && (() => {
            const weekDays = getWeekDays(calDate);
            const today = toDateKey(new Date());
            return (
              <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', overflow: 'hidden' }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {weekDays.map((date, idx) => {
                    const key = toDateKey(date);
                    const evts = eventsByDate[key] || [];
                    const isToday = key === today;
                    return (
                      <Box key={idx}
                        sx={{
                          minHeight: 320, borderRight: idx < 6 ? '1px solid #f0f0f0' : 'none',
                          transition: 'background .15s',
                        }}>
                        <Box
                          onClick={() => openCreateDialog(key)}
                          sx={{
                            textAlign: 'center', py: 1.2, borderBottom: '1px solid #f0f0f0',
                            bgcolor: isToday ? alpha(PRIMARY, .06) : '#fafafa',
                            cursor: 'pointer', '&:hover': { bgcolor: alpha(PRIMARY, .1) },
                          }}>
                          <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5 }}>
                            {date.toLocaleDateString('en-US', { weekday: 'short' })}
                          </Typography>
                          <Typography sx={{
                            fontSize: 18, fontWeight: isToday ? 800 : 600,
                            color: isToday ? PRIMARY : '#1F2937', lineHeight: 1.3,
                          }}>
                            {date.getDate()}
                          </Typography>
                        </Box>
                        <Box sx={{ p: .8 }}>
                          {evts.map(ev => renderEventChip(ev))}
                          {evts.length === 0 && (
                            <Typography
                              onClick={() => openCreateDialog(key)}
                              sx={{ fontSize: 10, color: '#d1d5db', textAlign: 'center', mt: 4, cursor: 'pointer', '&:hover': { color: PRIMARY } }}>
                              + Add event
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Card>
            );
          })()}

          {/* ── DAY VIEW ──────── */}
          {calView === 'day' && (() => {
            const key = toDateKey(calDate);
            const evts = eventsByDate[key] || [];
            return (
              <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px' }}>
                <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #f0f0f0', bgcolor: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>
                      {fmtDateLabel(calDate)}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: '#94a3b8', mt: .2 }}>{evts.length} event{evts.length !== 1 ? 's' : ''}</Typography>
                  </Box>
                  <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                    onClick={() => openCreateDialog(key)}
                    sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, borderRadius: '8px', color: PRIMARY }}>
                    Add Event
                  </Button>
                </Box>
                {evts.length === 0 ? (
                  <Box sx={{ textAlign: 'center', py: 8, cursor: 'pointer' }} onClick={() => openCreateDialog(key)}>
                    <CalendarIcon sx={{ fontSize: 48, color: '#e5e7eb', mb: 1 }} />
                    <Typography sx={{ fontSize: 13, color: '#94a3b8' }}>No events — click to add</Typography>
                  </Box>
                ) : (
                  <Box sx={{ p: 2 }}>
                    {evts.map(event => {
                      const color = event.is_overdue && !event.completed ? '#dc2626' : EVENT_COLORS[event.event_type];
                      const time = event.all_day ? 'All day' : `${event.start_time?.slice(0, 5) || ''}${event.end_time ? ' – ' + event.end_time.slice(0, 5) : ''}`;
                      return (
                        <Box key={event.id}
                          onClick={() => openViewDialog(event)}
                          sx={{
                            display: 'flex', gap: 1.5, mb: 1.5, alignItems: 'flex-start',
                            cursor: 'pointer', borderRadius: '10px', p: 1, transition: 'all .15s',
                            '&:hover': { bgcolor: alpha(color, .04) },
                          }}>
                          <Box sx={{ minWidth: 56, textAlign: 'right', pt: .5 }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>{time}</Typography>
                          </Box>
                          <Box sx={{ width: 3, bgcolor: color, borderRadius: 1, alignSelf: 'stretch', minHeight: 40 }} />
                          <Box sx={{ flex: 1, p: 1.2, borderRadius: '10px', border: '1px solid #f0f0f0' }}>
                            <Box sx={{ display: 'flex', gap: .5, mb: .3, flexWrap: 'wrap', alignItems: 'center' }}>
                              <Chip label={EVENT_LABELS[event.event_type]} size="small"
                                sx={{ height: 18, bgcolor: alpha(color, .08), color, fontWeight: 700, fontSize: 9.5 }} />
                              {event.project?.project_name && (
                                <Chip label={event.project.project_name} size="small"
                                  sx={{ height: 18, bgcolor: alpha('#6B7280', .06), color: '#6B7280', fontWeight: 600, fontSize: 9.5 }} />
                              )}
                              {event.is_overdue && !event.completed && (
                                <Chip label="OVERDUE" size="small"
                                  sx={{ height: 18, bgcolor: alpha('#dc2626', .08), color: '#dc2626', fontWeight: 700, fontSize: 9 }} />
                              )}
                              {event.completed && (
                                <Chip label="Done" size="small"
                                  sx={{ height: 18, bgcolor: alpha('#16a34a', .08), color: '#16a34a', fontWeight: 700, fontSize: 9 }} />
                              )}
                            </Box>
                            <Typography sx={{
                              fontSize: 13, color: '#1F2937', fontWeight: 600,
                              textDecoration: event.completed ? 'line-through' : 'none',
                            }}>
                              {event.title}
                            </Typography>
                            {event.description && (
                              <Typography sx={{ fontSize: 11.5, color: '#6B7280', mt: .3 }}>{event.description}</Typography>
                            )}
                            {event.creator && (
                              <Typography sx={{ fontSize: 10.5, color: '#94a3b8', mt: .3 }}>Created by {event.creator.name}</Typography>
                            )}
                          </Box>
                          <Tooltip title={event.completed ? 'Mark incomplete' : 'Mark complete'}>
                            <Checkbox
                              checked={event.completed}
                              onClick={(e) => handleToggleComplete(event, e)}
                              size="small"
                              sx={{ mt: .5, color: '#d1d5db', '&.Mui-checked': { color: '#16a34a' } }}
                            />
                          </Tooltip>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Card>
            );
          })()}

          {/* ── Legend ──────── */}
          <Box sx={{ display: 'flex', gap: 2, mt: 2, justifyContent: 'center' }}>
            {Object.entries(EVENT_COLORS).map(([type, color]) => (
              <Box key={type} sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: color }} />
                <Typography sx={{ fontSize: 11, color: '#6B7280', textTransform: 'capitalize', fontWeight: 600 }}>{type}</Typography>
              </Box>
            ))}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: '#dc2626', border: '1px dashed #dc2626' }} />
              <Typography sx={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Overdue</Typography>
            </Box>
          </Box>

          {/* ── Day detail dialog ──────── */}
          <Dialog open={!!dayDialogDate} onClose={() => setDayDialogDate(null)} maxWidth="sm" fullWidth
            PaperProps={{ sx: { borderRadius: '16px' } }}>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
              <Box>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>
                  {dayDialogDate && fmtDateLabel(new Date(dayDialogDate + 'T12:00:00'))}
                </Typography>
                <Typography sx={{ fontSize: 12, color: '#94a3b8' }}>{dayDialogEvents.length} event{dayDialogEvents.length !== 1 ? 's' : ''}</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: .5 }}>
                <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                  onClick={() => { setDayDialogDate(null); openCreateDialog(dayDialogDate!); }}
                  sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600, borderRadius: '8px', color: PRIMARY }}>
                  Add
                </Button>
                <IconButton size="small" onClick={() => setDayDialogDate(null)}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
              </Box>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 2 }}>
              {dayDialogEvents.map(event => {
                const color = event.is_overdue && !event.completed ? '#dc2626' : EVENT_COLORS[event.event_type];
                const time = event.all_day ? 'All day' : `${event.start_time?.slice(0, 5) || ''}${event.end_time ? ' – ' + event.end_time.slice(0, 5) : ''}`;
                return (
                  <Box key={event.id}
                    onClick={() => { setDayDialogDate(null); openViewDialog(event); }}
                    sx={{
                      display: 'flex', gap: 1.5, mb: 1.5, alignItems: 'flex-start',
                      cursor: 'pointer', p: 1, borderRadius: '10px', transition: 'all .15s',
                      '&:hover': { bgcolor: alpha(color, .04) },
                    }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', minWidth: 52, textAlign: 'right', pt: .5 }}>{time}</Typography>
                    <Box sx={{ width: 3, bgcolor: color, borderRadius: 1, alignSelf: 'stretch', minHeight: 36 }} />
                    <Box sx={{ flex: 1, p: 1, borderRadius: '10px', border: '1px solid #f0f0f0' }}>
                      <Box sx={{ display: 'flex', gap: .5, mb: .3 }}>
                        <Chip label={EVENT_LABELS[event.event_type]} size="small"
                          sx={{ height: 18, bgcolor: alpha(color, .08), color, fontWeight: 700, fontSize: 9.5 }} />
                        {event.is_overdue && !event.completed && (
                          <Chip label="OVERDUE" size="small"
                            sx={{ height: 18, bgcolor: alpha('#dc2626', .08), color: '#dc2626', fontWeight: 700, fontSize: 9 }} />
                        )}
                      </Box>
                      <Typography sx={{ fontSize: 12, color: '#1F2937', fontWeight: 600, textDecoration: event.completed ? 'line-through' : 'none' }}>
                        {event.title}
                      </Typography>
                      {event.project?.project_name && (
                        <Typography sx={{ fontSize: 10.5, color: '#94a3b8', mt: .2 }}>{event.project.project_name}</Typography>
                      )}
                    </Box>
                    <Checkbox
                      checked={event.completed}
                      onClick={(e) => { e.stopPropagation(); handleToggleComplete(event, e); }}
                      size="small"
                      sx={{ mt: .5, color: '#d1d5db', '&.Mui-checked': { color: '#16a34a' } }}
                    />
                  </Box>
                );
              })}
            </DialogContent>
          </Dialog>

          {/* ═══════════ EVENT CREATE / EDIT / VIEW DIALOG ═══════════ */}
          <Dialog open={eventDialogOpen} onClose={() => setEventDialogOpen(false)} maxWidth="sm" fullWidth
            PaperProps={{ sx: { borderRadius: '16px' } }}>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{
                  width: 36, height: 36, borderRadius: '10px',
                  bgcolor: alpha(EVENT_COLORS[eventForm.event_type] || PRIMARY, .08),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {React.cloneElement(EVENT_ICONS[eventForm.event_type] || <EventIcon />, {
                    sx: { fontSize: 18, color: EVENT_COLORS[eventForm.event_type] || PRIMARY },
                  })}
                </Box>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>
                  {eventDialogMode === 'create' ? 'New Event' : eventDialogMode === 'edit' ? 'Edit Event' : eventForm.title}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: .5, alignItems: 'center' }}>
                {eventDialogMode === 'view' && (
                  <>
                    <Button size="small" startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                      onClick={switchToEdit}
                      sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600, borderRadius: '8px', color: PRIMARY }}>
                      Edit
                    </Button>
                    <Button size="small" startIcon={<DeleteIcon sx={{ fontSize: 14 }} />}
                      onClick={handleDeleteEvent}
                      disabled={saving}
                      sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600, borderRadius: '8px', color: '#dc2626' }}>
                      Delete
                    </Button>
                  </>
                )}
                <IconButton size="small" onClick={() => setEventDialogOpen(false)}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
              </Box>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 2.5 }}>
              {eventDialogMode === 'view' ? (
                /* View mode */
                <Stack spacing={2}>
                  {selectedEvent?.description && (
                    <Box>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .5 }}>Description</Typography>
                      <Typography sx={{ fontSize: 13, color: '#1F2937' }}>{selectedEvent.description}</Typography>
                    </Box>
                  )}
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .5 }}>Type</Typography>
                      <Chip label={EVENT_LABELS[selectedEvent?.event_type || 'task']} size="small"
                        sx={{ bgcolor: alpha(EVENT_COLORS[selectedEvent?.event_type || 'task'], .08), color: EVENT_COLORS[selectedEvent?.event_type || 'task'], fontWeight: 700 }} />
                    </Grid>
                    <Grid item xs={6}>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .5 }}>Date</Typography>
                      <Typography sx={{ fontSize: 13, color: '#1F2937', fontWeight: 600 }}>
                        {selectedEvent?.event_date && new Date(selectedEvent.event_date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </Typography>
                    </Grid>
                    {!selectedEvent?.all_day && (selectedEvent?.start_time || selectedEvent?.end_time) && (
                      <Grid item xs={6}>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .5 }}>Time</Typography>
                        <Typography sx={{ fontSize: 13, color: '#1F2937' }}>
                          {selectedEvent?.start_time?.slice(0, 5)}{selectedEvent?.end_time ? ` – ${selectedEvent.end_time.slice(0, 5)}` : ''}
                        </Typography>
                      </Grid>
                    )}
                    {selectedEvent?.project?.project_name && (
                      <Grid item xs={6}>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .5 }}>Project</Typography>
                        <Typography sx={{ fontSize: 13, color: '#1F2937' }}>{selectedEvent.project.project_name}</Typography>
                      </Grid>
                    )}
                    {selectedEvent?.project_module && (
                      <Grid item xs={6}>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .5 }}>Module</Typography>
                        <Typography sx={{ fontSize: 13, color: '#1F2937', textTransform: 'capitalize' }}>{selectedEvent.project_module.replace(/_/g, ' ')}</Typography>
                      </Grid>
                    )}
                    {selectedEvent?.reminder && selectedEvent.reminder !== 'none' && (
                      <Grid item xs={6}>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .5 }}>Reminder</Typography>
                        <Typography sx={{ fontSize: 13, color: '#1F2937' }}>
                          {REMINDER_OPTIONS.find(r => r.value === selectedEvent.reminder)?.label}
                        </Typography>
                      </Grid>
                    )}
                  </Grid>
                  {selectedEvent?.assigned_users && selectedEvent.assigned_users.length > 0 && (
                    <Box>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .5 }}>Assigned Users</Typography>
                      <Box sx={{ display: 'flex', gap: .5, flexWrap: 'wrap' }}>
                        {selectedEvent.assigned_users.map(uid => {
                          const u = users.find(x => x.id === uid);
                          return u ? (
                            <Chip key={uid} size="small"
                              avatar={<Avatar sx={{ width: 20, height: 20, fontSize: 10 }}>{u.name[0]}</Avatar>}
                              label={u.name}
                              sx={{ fontSize: 11, fontWeight: 600 }} />
                          ) : null;
                        })}
                      </Box>
                    </Box>
                  )}
                  {selectedEvent?.creator && (
                    <Box>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .5 }}>Created By</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
                        <Avatar sx={{ width: 22, height: 22, fontSize: 10, bgcolor: alpha(PRIMARY, .1), color: PRIMARY }}>{selectedEvent.creator.name[0]}</Avatar>
                        <Typography sx={{ fontSize: 12, color: '#1F2937' }}>{selectedEvent.creator.name}</Typography>
                      </Box>
                    </Box>
                  )}
                </Stack>
              ) : (
                /* Create / Edit mode */
                <Stack spacing={2.5}>
                  <TextField
                    label="Title" fullWidth required size="small"
                    value={eventForm.title}
                    onChange={e => setEventForm(f => ({ ...f, title: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                  />
                  <FormControl fullWidth size="small">
                    <InputLabel>Event Type *</InputLabel>
                    <Select value={eventForm.event_type}
                      onChange={e => setEventForm(f => ({ ...f, event_type: e.target.value as any }))}
                      label="Event Type *" sx={{ borderRadius: '10px' }}>
                      {Object.entries(EVENT_LABELS).map(([val, label]) => (
                        <MenuItem key={val} value={val}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: EVENT_COLORS[val] }} />
                            {label}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Date" type="date" fullWidth required size="small"
                    value={eventForm.event_date}
                    onChange={e => setEventForm(f => ({ ...f, event_date: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                  />
                  <FormControlLabel
                    control={
                      <Switch checked={eventForm.all_day}
                        onChange={e => setEventForm(f => ({ ...f, all_day: e.target.checked }))}
                        size="small" sx={{ '& .Mui-checked': { color: PRIMARY }, '& .Mui-checked+.MuiSwitch-track': { bgcolor: PRIMARY } }} />
                    }
                    label={<Typography sx={{ fontSize: 13 }}>All Day</Typography>}
                  />
                  {!eventForm.all_day && (
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <TextField label="Start Time" type="time" fullWidth size="small"
                          value={eventForm.start_time}
                          onChange={e => setEventForm(f => ({ ...f, start_time: e.target.value }))}
                          InputLabelProps={{ shrink: true }}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
                      </Grid>
                      <Grid item xs={6}>
                        <TextField label="End Time" type="time" fullWidth size="small"
                          value={eventForm.end_time}
                          onChange={e => setEventForm(f => ({ ...f, end_time: e.target.value }))}
                          InputLabelProps={{ shrink: true }}
                          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
                      </Grid>
                    </Grid>
                  )}
                  <FormControl fullWidth size="small">
                    <InputLabel>Project (optional)</InputLabel>
                    <Select value={eventForm.project_id}
                      onChange={e => setEventForm(f => ({ ...f, project_id: e.target.value as string }))}
                      label="Project (optional)" sx={{ borderRadius: '10px' }}>
                      <MenuItem value="">None</MenuItem>
                      {projects.map(p => (
                        <MenuItem key={p.id} value={p.id}>
                          {p.quotation_number ? `${p.quotation_number} – ` : ''}{p.project_name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {eventForm.project_id && (
                    <FormControl fullWidth size="small">
                      <InputLabel>Module (optional)</InputLabel>
                      <Select value={eventForm.project_module}
                        onChange={e => setEventForm(f => ({ ...f, project_module: e.target.value as string }))}
                        label="Module (optional)" sx={{ borderRadius: '10px' }}>
                        <MenuItem value="">None</MenuItem>
                        {PROJECT_MODULES.map(m => (
                          <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                  <FormControl fullWidth size="small">
                    <InputLabel>Assigned Users</InputLabel>
                    <Select
                      multiple
                      value={eventForm.assigned_users}
                      onChange={e => setEventForm(f => ({ ...f, assigned_users: e.target.value as string[] }))}
                      label="Assigned Users"
                      renderValue={(sel) => (sel as string[]).map(id => users.find(u => u.id === id)?.name || id).join(', ')}
                      sx={{ borderRadius: '10px' }}>
                      {users.map(u => (
                        <MenuItem key={u.id} value={u.id}>
                          <Checkbox checked={eventForm.assigned_users.includes(u.id)} size="small" />
                          <ListItemText primary={u.name} secondary={u.email}
                            primaryTypographyProps={{ fontSize: 13 }}
                            secondaryTypographyProps={{ fontSize: 11 }} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth size="small">
                    <InputLabel>Reminder</InputLabel>
                    <Select value={eventForm.reminder}
                      onChange={e => setEventForm(f => ({ ...f, reminder: e.target.value as string }))}
                      label="Reminder" sx={{ borderRadius: '10px' }}>
                      {REMINDER_OPTIONS.map(r => (
                        <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Description" fullWidth multiline rows={3} size="small"
                    value={eventForm.description}
                    onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
                  />
                </Stack>
              )}
            </DialogContent>
            {eventDialogMode !== 'view' && (
              <DialogActions sx={{ px: 2.5, py: 1.5 }}>
                <Button onClick={() => setEventDialogOpen(false)}
                  sx={{ textTransform: 'none', borderRadius: '10px', color: '#6B7280', fontWeight: 600 }}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEvent} disabled={saving} variant="contained"
                  sx={{
                    textTransform: 'none', borderRadius: '10px', fontWeight: 600,
                    bgcolor: PRIMARY, '&:hover': { bgcolor: alpha(PRIMARY, .9) },
                  }}>
                  {saving ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : (eventDialogMode === 'create' ? 'Create Event' : 'Save Changes')}
                </Button>
              </DialogActions>
            )}
          </Dialog>
        </>
      ) : (
        /* ═══════════════════════ TIMELINE VIEW ═══════════════════════ */
        <>
          {loading && page === 1 ? (
            <LinearProgress sx={{ mb: 2, borderRadius: 2, '& .MuiLinearProgress-bar': { bgcolor: PRIMARY } }} />
          ) : (
            <>
              {/* Stat Cards */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <StatCard label="Total Events" value={total} color={PRIMARY} icon={<TimelineIcon />} subtext="all time" />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <StatCard label="Active Users" value={uniqueUsers} color="#1F7A63" icon={<PersonAddIcon />} subtext="in this view" />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <StatCard label="Last Hour" value={recentCount} color="#1F7A63" icon={<SpeedIcon />}
                    subtext={recentCount > 0 ? 'recent activity' : 'quiet period'} />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <StatCard label="High / Critical" value={severityCounts.high + severityCounts.critical}
                    color={severityCounts.critical > 0 ? '#dc2626' : '#f59e0b'} icon={<WarningIcon />}
                    subtext={severityCounts.critical > 0 ? `${severityCounts.critical} critical` : 'no critical events'} />
                </Grid>
              </Grid>

              {/* Top Actions + Severity breakdown */}
              <Grid container spacing={2.5} sx={{ mb: 3 }}>
                <Grid item xs={12} md={6}>
                  <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', height: '100%' }}>
                    <CardContent sx={{ p: '18px 22px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <Box sx={{ bgcolor: alpha(PRIMARY, .08), borderRadius: '10px', p: .6, display: 'flex' }}>
                          <TrendingIcon sx={{ fontSize: 17, color: PRIMARY }} />
                        </Box>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>Top Activity Types</Typography>
                      </Box>
                      {actionBreakdown.length === 0
                        ? <Typography sx={{ fontSize: 12, color: '#94a3b8' }}>No data yet</Typography>
                        : <Stack spacing={1.5}>
                            {actionBreakdown.map(([action, count]) => {
                              const cfg = getConfig(action);
                              const pct = entries.length ? Math.round((count / entries.length) * 100) : 0;
                              return (
                                <Box key={action}>
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: .4, alignItems: 'center' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
                                      <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: cfg.color }} />
                                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                                        {cfg.label}
                                      </Typography>
                                    </Box>
                                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{count} ({pct}%)</Typography>
                                  </Box>
                                  <Box sx={{ height: 5, borderRadius: 3, bgcolor: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                                    <Box sx={{ height: '100%', borderRadius: 3, bgcolor: cfg.color, width: `${pct}%`, transition: 'width .6s' }} />
                                  </Box>
                                </Box>
                              );
                            })}
                          </Stack>
                      }
                    </CardContent>
                  </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                  <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', height: '100%' }}>
                    <CardContent sx={{ p: '18px 22px !important' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <Box sx={{ bgcolor: alpha('#2A9D7E', .08), borderRadius: '10px', p: .6, display: 'flex' }}>
                          <SecurityIcon sx={{ fontSize: 17, color: '#2A9D7E' }} />
                        </Box>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>Severity Breakdown</Typography>
                      </Box>
                      {entries.length > 0 && (
                        <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', mb: 2 }}>
                          {Object.entries(severityCounts).filter(([, v]) => v > 0).map(([level, count]) => (
                            <Tooltip key={level} title={`${level}: ${count}`}>
                              <Box sx={{ width: `${(count / entries.length) * 100}%`, bgcolor: SEVERITY_COLOR[level], transition: 'width .6s' }} />
                            </Tooltip>
                          ))}
                        </Box>
                      )}
                      <Grid container spacing={1.5}>
                        {Object.entries(severityCounts).map(([level, count]) => (
                          <Grid item xs={6} key={level}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: .8, p: 1, borderRadius: '10px', border: '1px solid #f0f0f0', bgcolor: alpha(SEVERITY_COLOR[level], .02) }}>
                              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: SEVERITY_COLOR[level] }} />
                              <Box sx={{ flex: 1 }}>
                                <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize', lineHeight: 1 }}>{level}</Typography>
                                <Typography sx={{ fontSize: 17, fontWeight: 800, color: SEVERITY_COLOR[level], lineHeight: 1.2 }}>{count}</Typography>
                              </Box>
                            </Box>
                          </Grid>
                        ))}
                      </Grid>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Filter Chips */}
              {actionBreakdown.length > 0 && (
                <Box sx={{ mb: 2, display: 'flex', gap: .8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <FilterIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                  <Chip label="All" size="small" onClick={() => setFilter(null)}
                    sx={{
                      bgcolor: !filter ? alpha(PRIMARY, .1) : 'var(--bg-canvas)',
                      color: !filter ? PRIMARY : '#6B7280', fontWeight: !filter ? 700 : 500,
                      fontSize: 11.5, border: !filter ? `1px solid ${alpha(PRIMARY, .3)}` : '1px solid #f0f0f0',
                      cursor: 'pointer',
                    }} />
                  {actionBreakdown.map(([action]) => {
                    const cfg = getConfig(action);
                    const active = filter === action;
                    return (
                      <Chip key={action} label={cfg.label} size="small" onClick={() => setFilter(active ? null : action)}
                        sx={{
                          bgcolor: active ? alpha(cfg.color, .1) : 'var(--bg-canvas)',
                          color: active ? cfg.color : '#6B7280', fontWeight: active ? 700 : 500,
                          fontSize: 11.5, border: active ? `1px solid ${alpha(cfg.color, .3)}` : '1px solid #f0f0f0',
                          cursor: 'pointer',
                        }} />
                    );
                  })}
                </Box>
              )}

              {/* Timeline */}
              {displayed.length === 0 && !loading && (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                  <TimelineIcon sx={{ fontSize: 64, color: 'var(--border)', mb: 2 }} />
                  <Typography sx={{ color: '#94a3b8', fontSize: 14 }}>
                    {filter ? 'No events matching this filter' : 'No activity recorded yet'}
                  </Typography>
                </Box>
              )}

              <Box sx={{ position: 'relative', pl: 4 }}>
                {displayed.length > 1 && (
                  <Box sx={{ position: 'absolute', left: 19, top: 24, bottom: 24, width: 2, bgcolor: 'var(--border)', borderRadius: 1 }} />
                )}
                {displayed.map((entry) => {
                  const cfg = getConfig(entry.action);
                  const sevColor = SEVERITY_COLOR[entry.severity] || '#6B7280';
                  return (
                    <Box key={entry.id} sx={{ position: 'relative', mb: 1.5 }}>
                      <Box sx={{
                        position: 'absolute', left: -25, top: 14,
                        width: 28, height: 28, borderRadius: '50%',
                        bgcolor: alpha(cfg.color, 0.12), display: 'flex',
                        alignItems: 'center', justifyContent: 'center', zIndex: 1,
                        border: `2px solid ${alpha(cfg.color, 0.25)}`,
                      }}>
                        {React.cloneElement(cfg.icon, { sx: { fontSize: 14, color: cfg.color } })}
                      </Box>

                      <Card elevation={0} sx={{
                        border: '1px solid #f0f0f0', borderRadius: '14px', overflow: 'hidden',
                        position: 'relative', transition: 'all .2s',
                        '&:hover': { borderColor: alpha(cfg.color, .25), boxShadow: `0 2px 12px ${alpha(cfg.color, .06)}` },
                      }}>
                        <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, bgcolor: cfg.color }} />
                        <CardContent sx={{ p: '14px 16px 14px 20px !important' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <Box sx={{ flex: 1 }}>
                              <Box sx={{ display: 'flex', gap: .5, alignItems: 'center', mb: .5, flexWrap: 'wrap' }}>
                                <Chip label={cfg.label} size="small"
                                  sx={{ height: 20, bgcolor: alpha(cfg.color, 0.08), color: cfg.color, fontWeight: 700, fontSize: 10, textTransform: 'capitalize' }} />
                                <Chip label={entry.severity} size="small"
                                  sx={{ height: 20, bgcolor: alpha(sevColor, 0.06), color: sevColor, fontWeight: 600, fontSize: 10 }} />
                              </Box>
                              <Typography sx={{ fontSize: 13, color: '#1F2937', fontWeight: 500, mb: .3 }}>{entry.description}</Typography>
                              <Stack direction="row" spacing={1.5} sx={{ mt: .3 }}>
                                {entry.user && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: .4 }}>
                                    <Avatar sx={{ width: 18, height: 18, fontSize: 9, bgcolor: alpha(cfg.color, .1), color: cfg.color, fontWeight: 700 }}>
                                      {entry.user.name[0]}
                                    </Avatar>
                                    <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>{entry.user.name}</Typography>
                                  </Box>
                                )}
                                {entry.company && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: .3 }}>
                                    <CompanyIcon sx={{ fontSize: 12, color: '#94a3b8' }} />
                                    <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>{entry.company.name}</Typography>
                                  </Box>
                                )}
                              </Stack>
                            </Box>
                            <Typography sx={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap', ml: 2, mt: .3, fontWeight: 500 }}>
                              {timeAgo(entry.created_at)}
                            </Typography>
                          </Box>
                        </CardContent>
                      </Card>
                    </Box>
                  );
                })}
              </Box>

              {loading && page > 1 && <CircularProgress sx={{ display: 'block', mx: 'auto', my: 2, color: PRIMARY }} size={28} />}

              {entries.length < total && !loading && (
                <Box sx={{ textAlign: 'center', mt: 2 }}>
                  <Button onClick={() => setPage(p => p + 1)} variant="outlined" size="small"
                    sx={{
                      textTransform: 'none', borderRadius: '10px', borderColor: 'var(--border)',
                      color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, px: 3,
                      '&:hover': { borderColor: PRIMARY, color: PRIMARY },
                    }}>
                    Load More ({(total - entries.length).toLocaleString()} remaining)
                  </Button>
                </Box>
              )}
            </>
          )}
        </>
      )}
    </Box>
  );
};

export default ActivityTimelineView;
