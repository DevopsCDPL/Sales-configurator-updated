import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Card,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Alert,
  Tooltip,
  Drawer,
  Checkbox,
  Snackbar,
  Skeleton,
  alpha,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  ContentCopy as CopyIcon,
  DeleteSweep as DeleteSweepIcon,
  Close as CloseIcon,
  Settings as SettingsIcon,
  ArrowUpward as AscIcon,
  ArrowDownward as DescIcon,
  UnfoldMore as SortIcon,
  CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckBoxBlankIcon,
  IndeterminateCheckBox as IndeterminateIcon,
  FilterList as FilterIcon,
  FileDownload as ExportIcon,
  Edit as EditIcon,
  ChevronLeft as PrevIcon,
  ChevronRight as NextIcon,
  LocalShipping as ShippingIcon,
  CheckCircle as CheckCircleIcon,
  Folder as FolderSolidIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { projectService } from '../services/projectService';
import { clientService } from '../services/clientService';
import { Project, Client, ProjectStatus } from '../types';
import { UI } from '../components/UIComponents';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   DESIGN TOKENS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const RADIUS = { card: '16px', chip: '10px', btn: '10px', input: '10px', sm: '8px' };
const SHADOW = {
  card: '0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02)',
  cardHover: '0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.03)',
  soft: '0 1px 4px rgba(0,0,0,0.04)',
};
const COLOR = {
  bg: UI.bgSubtle,
  surface: 'var(--bg-surface)',
  border: 'var(--border)',
  borderLight: 'var(--border-subtle)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  blue: '#38bdf8',
  blueBg: 'rgba(56, 189, 248, 0.10)',
  green: UI.primary,
  greenBg: UI.primaryBg,
  orange: '#EA580C',
  orangeBg: 'rgba(251, 146, 60, 0.10)',
  purple: '#0099cc',
  purpleBg: 'rgba(0, 200, 255, 0.08)',
  red: '#EF4444',
  PRIMARY: UI.primary,
  tealBg: 'var(--border-subtle)',
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   STATUS META
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const STATUS_META: { key: ProjectStatus; label: string; color: string; bg: string; icon: string }[] = [
  { key: 'draft',           label: 'Draft',           color: '#6B7280', bg: 'var(--border-subtle)',           icon: '⏳' },
  { key: 'estimated',       label: 'Estimated',       color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.10)',       icon: '📋' },
  { key: 'quoted',          label: 'Quoted',          color: '#00c8ff', bg: 'rgba(0, 200, 255, 0.08)',        icon: '💬' },
  { key: 'order_confirmed', label: 'Order Confirmed', color: '#00c8ff', bg: 'rgba(0, 200, 255, 0.08)',        icon: '✓' },
  { key: 'in_production',   label: 'In Production',   color: '#fb923c', bg: 'rgba(251, 146, 60, 0.10)',       icon: '⚙' },
  { key: 'inspected',       label: 'Inspected',       color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.10)',       icon: '🔍' },
  { key: 'shipped',         label: 'Shipped',         color: '#10b981', bg: 'rgba(16, 185, 129, 0.10)',       icon: '📦' },
  { key: 'issue',           label: 'Issue',           color: '#EF4444', bg: 'rgba(220, 38, 38, 0.10)',        icon: '⚠' },
  { key: 'closed',          label: 'Closed',          color: '#6B7280', bg: 'var(--border-subtle)',           icon: '✅' },
];
const statusMeta = (key: ProjectStatus) =>
  STATUS_META.find(s => s.key === key) ?? { label: key, color: '#94a3b8', bg: 'var(--bg-canvas)' };

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   COLUMN WIDTHS
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
// Column widths are defined via <colgroup>/<col> inside the HTML table below.
type SortField = 'project_number' | 'project_name' | 'client' | 'status' | 'updated_at';

/* â”€â”€ Status pill badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const StatusBadge: React.FC<{ status: ProjectStatus; revision?: number | null }> = ({ status, revision }) => {
  const m = statusMeta(status);
  return (
    <Box sx={{
      display: 'inline-flex', alignItems: 'center', gap: '4px', px: '6px', py: '2px',
      borderRadius: '999px', bgcolor: m.bg, minHeight: 22, maxWidth: '100%',
      transition: 'all 0.15s',
      '&:hover': { transform: 'scale(1.04)', boxShadow: `0 2px 8px ${alpha(m.color, 0.18)}` },
    }}>
      <Box sx={{ fontSize: 11, lineHeight: 1, flexShrink: 0 }}>{(m as any).icon || '●'}</Box>
      <Typography sx={{ fontSize: '11px', fontWeight: 600, color: m.color, whiteSpace: 'nowrap', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {m.label}{revision !== null && revision !== undefined ? ` (R${revision})` : ''}
      </Typography>
    </Box>
  );
};

/* â”€â”€ Sortable column header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const SortHeader: React.FC<{
  label: string; field: SortField; width?: string;
  sortField: SortField | null; sortDir: 'asc' | 'desc';
  onSort: (f: SortField) => void;
}> = ({ label, field, sortField, sortDir, onSort }) => {
  const active = sortField === field;
  return (
    <Box onClick={() => onSort(field)}
      sx={{ display: 'flex', alignItems: 'center', gap: 0.4,
        cursor: 'pointer', userSelect: 'none',
        '&:hover .sort-lbl': { color: 'var(--text-primary)' },
        '&:hover .sort-ico': { opacity: 1 } }}>
      <Typography className="sort-lbl" sx={{
        fontSize: '12px', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.05em', color: active ? 'var(--text-primary)' : 'var(--text-muted)',
        transition: 'color .15s', lineHeight: 1,
      }}>
        {label}
      </Typography>
      {active
        ? (sortDir === 'asc'
            ? <AscIcon className="sort-ico" sx={{ fontSize: 13, color: 'var(--text-primary)' }} />
            : <DescIcon className="sort-ico" sx={{ fontSize: 13, color: 'var(--text-primary)' }} />)
        : <SortIcon className="sort-ico" sx={{ fontSize: 13, color: 'var(--text-muted)', opacity: 0, transition: 'opacity .15s' }} />
      }
    </Box>
  );
};

/* â”€â”€ SVG Donut Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DonutChart: React.FC<{ segments: { value: number; color: string; label?: string }[]; size?: number; strokeWidth?: number }> = ({ segments, size = 120, strokeWidth = 14 }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  const r = (size - strokeWidth) / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = -circumference / 4;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={strokeWidth} />
      {segments.filter(s => s.value > 0).map((seg, i) => {
        const dash = (seg.value / total) * circumference;
        const gap = circumference - dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth={strokeWidth}
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={-offset}
            strokeLinecap="round"
            style={{ transition: 'all 0.6s cubic-bezier(0.4,0,0.2,1)' }}
          />
        );
        offset += dash;
        return el;
      })}
      {/* Center text */}
      <text x={cx} y={cy - 6} textAnchor="middle" fill={COLOR.textPrimary}
        style={{ fontSize: 22, fontWeight: 700 }}>{total}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill={COLOR.textMuted}
        style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.04em' }}>TOTAL</text>
    </svg>
  );
};

/* â”€â”€ KPI Stat Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const KpiCard: React.FC<{
  label: string; value: number | string;
  accentColor: string; lightBg: string;
  icon: React.ReactNode;
  subtitle?: string;
}> = ({ label, value, accentColor, lightBg, icon }) => (
  <Box sx={{
    display: 'flex', alignItems: 'center', gap: '12px',
    borderRadius: '16px',
    background: `linear-gradient(180deg, var(--bg-surface) 0%, ${alpha(accentColor, 0.04)} 100%)`,
    border: `1px solid ${alpha(accentColor, 0.18)}`,
    boxShadow: `0 1px 2px rgba(15,23,42,0.04), 0 4px 12px -2px ${alpha(accentColor, 0.10)}`,
    py: '14px', px: '16px',
    transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1), box-shadow 0.25s ease, border-color 0.25s ease',
    cursor: 'default',
    position: 'relative',
    overflow: 'hidden',
    borderLeft: `3px solid ${accentColor}`,
    '&::before': {
      content: '""', position: 'absolute', inset: 0,
      background: `radial-gradient(120% 80% at 0% 0%, ${alpha(accentColor, 0.08)} 0%, transparent 55%)`,
      pointerEvents: 'none',
    },
    '&:hover': {
      transform: 'translateY(-3px)',
      boxShadow: `0 1px 2px rgba(15,23,42,0.04), 0 14px 28px -8px ${alpha(accentColor, 0.28)}, 0 24px 48px -16px ${alpha(accentColor, 0.18)}`,
      borderColor: alpha(accentColor, 0.4),
    },
  }}>
    <Box sx={{
      width: 40, height: 40, borderRadius: '11px', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(135deg, ${alpha(accentColor, 0.22)} 0%, ${alpha(accentColor, 0.10)} 100%)`,
      border: `1px solid ${alpha(accentColor, 0.18)}`,
      boxShadow: `0 1px 0 0 ${alpha('#fff', 0.6)} inset, 0 2px 8px ${alpha(accentColor, 0.20)}`,
    }}>
      {icon}
    </Box>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography sx={{
        fontSize: 11, fontWeight: 600, color: COLOR.textMuted,
        lineHeight: 1.2, letterSpacing: '.03em',
        textTransform: 'uppercase', mb: '3px',
      }}>
        {label}
      </Typography>
      <Typography sx={{
        fontSize: 24, fontWeight: 800, color: COLOR.textPrimary,
        lineHeight: 1, letterSpacing: '-.02em',
      }}>
        {value}
      </Typography>
    </Box>
  </Box>
);

/* â”€â”€ Loading skeleton for KPI cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const KpiSkeleton: React.FC = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px',
    borderRadius: '14px', bgcolor: COLOR.surface, border: `1px solid ${COLOR.border}`,
    py: '14px', px: '16px', borderLeft: '3px solid var(--border)',
    '@keyframes shimmer': {
      '0%': { backgroundPosition: '-200% 0' },
      '100%': { backgroundPosition: '200% 0' },
    },
    '& .MuiSkeleton-root': {
      animation: 'shimmer 1.5s ease-in-out infinite',
      backgroundImage: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-surface-2) 50%, var(--bg-surface) 75%)',
      backgroundSize: '200% 100%',
    },
  }}>
    <Skeleton variant="rounded" width={40} height={40} sx={{ borderRadius: '10px', flexShrink: 0 }} />
    <Box>
      <Skeleton width={68} height={11} sx={{ mb: '5px' }} />
      <Skeleton width={36} height={22} />
    </Box>
  </Box>
);

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   MAIN PAGE COMPONENT
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
interface ProjectFormData { project_name: string; client_id: string; }
const DEFAULT_ROWS_PER_PAGE = 7;
const ROWS_OPTIONS = [5, 7, 10, 25];

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  /* â”€â”€ state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients,  setClients]  = useState<Client[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  const [searchTerm,   setSearchTerm]   = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [sortField,    setSortField]    = useState<SortField | null>(null);
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('asc');
  const [currentPage,  setCurrentPage]  = useState(1);

  const [selectedRows,        setSelectedRows]        = useState<string[]>([]);
  const [confirmDeleteOpen,   setConfirmDeleteOpen]   = useState(false);
  const [singleDeleteProject, setSingleDeleteProject] = useState<Project | null>(null);
  const [previewProject,      setPreviewProject]      = useState<Project | null>(null);
  const [openDialog,          setOpenDialog]          = useState(false);
  const [nextQtNumber,        setNextQtNumber]        = useState('');
  const [nextPrjNumber,       setNextPrjNumber]       = useState('');
  const [copyProject,         setCopyProject]         = useState<Project | null>(null);
  const [copyLoading,         setCopyLoading]         = useState(false);
  const [successMsg,          setSuccessMsg]          = useState<string | null>(null);
  const [rowsPerPage,         setRowsPerPage]         = useState(DEFAULT_ROWS_PER_PAGE);
  const [_tableCollapsed,      _setTableCollapsed]      = useState(false);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<ProjectFormData>();

  /* â”€â”€ data loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  useEffect(() => { loadData(); }, []);

  // Auto-open create dialog when navigated with ?action=new
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'new') {
      // Clear the query param from URL to avoid re-triggering
      navigate('/projects', { replace: true });
      // Open the create dialog (after a short delay to ensure data is loaded)
      const timer = setTimeout(() => { openNewProject(); }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const loadData = async (retries = 2): Promise<void> => {
    setError(null);
    try {
      const [p, c] = await Promise.all([projectService.getAll(), clientService.getAll()]);
      setProjects(p); setClients(c);
    } catch (err) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 1500));
        // return loadData(retries - 1);
        await loadData();
      }
      const msg = (err as any)?.response?.data?.message || (err as any)?.message || 'Error loading data';
      setError(msg);
    }
    finally { setLoading(false); }
  };

  /* â”€â”€ handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const handleCreateProject = async (data: ProjectFormData) => {
    try { await projectService.create(data); setOpenDialog(false); reset(); setNextPrjNumber(''); loadData(); }
    catch (err: any) { setError(err.response?.data?.message || 'Error creating project'); }
  };
  const _handleDeleteProject = (id: string) => setSingleDeleteProject(projects.find(p => p.id === id) ?? null);
  const handleSingleDelete = async () => {
    if (!singleDeleteProject) return;
    try { await projectService.delete(singleDeleteProject.id); setSingleDeleteProject(null); loadData(); }
    catch (err: any) { setError(err.response?.data?.message || 'Error'); setSingleDeleteProject(null); }
  };
  const handleBulkDelete = async () => {
    try { await Promise.all(selectedRows.map(id => projectService.delete(id))); setSelectedRows([]); setConfirmDeleteOpen(false); loadData(); }
    catch (err: any) { setError(err.response?.data?.message || 'Error'); setConfirmDeleteOpen(false); }
  };
  const handleCopyProject = async () => {
    if (!copyProject) return;
    setCopyLoading(true);
    try {
      const copy = await projectService.copy(copyProject.id);
      setCopyProject(null);
      setSuccessMsg(`Project copied as "${copy.project_name}"`);
      loadData();
    } catch (err: any) { setError(err.response?.data?.message || 'Error copying project'); setCopyProject(null); }
    finally { setCopyLoading(false); }
  };
  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setCurrentPage(1);
  };

  const openNewProject = async () => {
    try { const n = await projectService.getNextProjectNumber(); setNextPrjNumber(n); } catch { setNextPrjNumber(''); }
    setOpenDialog(true);
  };

  /* â”€â”€ derived â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const processed = useMemo(() => {
    let list = projects.filter(p => {
      const q = searchTerm.toLowerCase();
      const ms = p.project_name.toLowerCase().includes(q) || (p.client?.client_name ?? '').toLowerCase().includes(q);
      return ms && (statusFilter === 'all' || p.status === statusFilter);
    });
    if (sortField) {
      list = [...list].sort((a, b) => {
        let av: string | number = '', bv: string | number = '';
        if (sortField === 'project_name') { av = a.project_name; bv = b.project_name; }
        else if (sortField === 'project_number') { av = a.project_number ?? ''; bv = b.project_number ?? ''; }
        else if (sortField === 'client')     { av = a.client?.client_name ?? ''; bv = b.client?.client_name ?? ''; }
        else if (sortField === 'status')     { av = a.status; bv = b.status; }
        else if (sortField === 'updated_at') { av = new Date(a.updated_at).getTime(); bv = new Date(b.updated_at).getTime(); }
        return av < bv ? (sortDir === 'asc' ? -1 : 1) : av > bv ? (sortDir === 'asc' ? 1 : -1) : 0;
      });
    }
    return list;
  }, [projects, searchTerm, statusFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(processed.length / rowsPerPage));
  const displayed  = processed.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const startIdx   = processed.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0;
  const endIdx     = Math.min(currentPage * rowsPerPage, processed.length);

  const total            = projects.length;
  const activeCount      = projects.filter(p => !['closed', 'shipped', 'draft'].includes(p.status)).length;
  const draftCount       = projects.filter(p => p.status === 'draft').length;
  const quotedCount      = projects.filter(p => p.status === 'quoted').length;
  const inProductionCount = projects.filter(p => p.status === 'in_production').length;
  const shippedCount     = projects.filter(p => p.status === 'shipped').length;
  const estimatedCount   = projects.filter(p => p.status === 'estimated').length;
  const orderConfirmedCount = projects.filter(p => p.status === 'order_confirmed').length;
  const inspectedCount   = projects.filter(p => p.status === 'inspected').length;
  const closedCount      = projects.filter(p => p.status === 'closed').length;

  /* â”€â”€ status filter chip set â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const _filterChips: { key: ProjectStatus | 'all'; label: string; count: number }[] = useMemo(() => [
    { key: 'all', label: 'All', count: total },
    { key: 'draft', label: 'Draft', count: draftCount },
    { key: 'estimated', label: 'Estimated', count: estimatedCount },
    { key: 'quoted', label: 'Quoted', count: quotedCount },
    { key: 'order_confirmed', label: 'Confirmed', count: orderConfirmedCount },
    { key: 'in_production', label: 'Production', count: inProductionCount },
    { key: 'inspected', label: 'Inspected', count: inspectedCount },
    { key: 'shipped', label: 'Shipped', count: shippedCount },
    { key: 'closed', label: 'Closed', count: closedCount },
  ], [total, draftCount, estimatedCount, quotedCount, orderConfirmedCount, inProductionCount, inspectedCount, shippedCount, closedCount]);

  /* â”€â”€ checkbox helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const allSel  = displayed.length > 0 && displayed.every(p => selectedRows.includes(p.id));
  const someSel = displayed.some(p => selectedRows.includes(p.id)) && !allSel;
  const toggleAll = () => {
    allSel
      ? setSelectedRows(prev => prev.filter(id => !displayed.find(p => p.id === id)))
      : setSelectedRows(prev => [...new Set([...prev, ...displayed.map(p => p.id)])]);
  };
  const toggleRow = (id: string) => setSelectedRows(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  /* â”€â”€ sidebar data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const _recent5 = useMemo(() =>
    [...projects].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5), [projects]);
  const _donutSegments = useMemo(() => [
    { value: activeCount, color: COLOR.green, label: 'Active' },
    { value: draftCount,  color: '#94a3b8',   label: 'Draft' },
    { value: shippedCount, color: COLOR.blue,  label: 'Shipped' },
    { value: closedCount, color: '#6B7280',    label: 'Closed' },
  ], [activeCount, draftCount, shippedCount, closedCount]);

  const sh = (f: SortField, width?: string) => ({ field: f, width, sortField, sortDir, onSort: handleSort });

  /* -- CSV export handler -- */
  const handleExportCSV = () => {
    const rows = (selectedRows.length > 0 ? processed.filter(p => selectedRows.includes(p.id)) : processed);
    const header = 'S.No,Project ID,Project Name,Client,Status,Updated\n';
    const csv = rows.map((p, i) => {
      const client = p.client?.client_name || '';
      const m = statusMeta(p.status);
      return `${i + 1},"${p.project_number || ''}","${p.project_name}","${client}","${m.label}","${dayjs(p.updated_at).format('MMM D, YYYY')}"`;
    }).join('\n');
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `projects_${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    setSuccessMsg(`Exported ${rows.length} project${rows.length !== 1 ? 's' : ''} to CSV`);
  };

  /* â”€â”€ pagination numbers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const pageNumbers = useMemo(() => {
    const p: (number | '...')[] = [];
    if (totalPages <= 6) { for (let i = 1; i <= totalPages; i++) p.push(i); }
    else {
      p.push(1);
      if (currentPage > 3) p.push('...');
      for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) p.push(i);
      if (currentPage < totalPages - 2) p.push('...');
      p.push(totalPages);
    }
    return p;
  }, [totalPages, currentPage]);

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     RENDER
     â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: COLOR.bg }}>

      {/* â”€â”€ Page Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '18px' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: COLOR.blueBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FolderSolidIcon sx={{ fontSize: 18, color: COLOR.blue }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: 23, fontWeight: 800, color: COLOR.textPrimary,
              letterSpacing: '-.03em', lineHeight: 1.1 }}>
              Projects
            </Typography>
            <Typography sx={{ fontSize: 13, color: COLOR.textMuted, fontWeight: 500, mt: 0.3 }}>
              Manage and track all project orders
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          {selectedRows.length > 0 ? (
            <>
              <Button variant="outlined" size="small" startIcon={<CloseIcon sx={{ fontSize: 16 }} />}
                onClick={() => setSelectedRows([])}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: RADIUS.btn,
                  borderColor: COLOR.border, color: COLOR.textSecondary,
                  '&:hover': { bgcolor: 'var(--bg-canvas)', borderColor: '#cbd5e1' } }}>
                Clear ({selectedRows.length})
              </Button>
              <Button variant="contained" size="small" startIcon={<DeleteSweepIcon sx={{ fontSize: 16 }} />}
                onClick={() => setConfirmDeleteOpen(true)}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: RADIUS.btn,
                  bgcolor: COLOR.red, boxShadow: 'none',
                  '&:hover': { bgcolor: '#b91c1c' } }}>
                Delete Selected
              </Button>
            </>
          ) : (
            <Button variant="contained" startIcon={<AddIcon sx={{ fontSize: 17 }} />}
              onClick={openNewProject}
              sx={{
                backgroundColor: '#33d6ff',
                color: '#000000',
                textTransform: 'none', fontWeight: 700, fontSize: 13.5,
                boxShadow: 'none',
                borderRadius: '10px',
                height: 36, px: '14px',
                letterSpacing: '.01em',
                '&:hover': { backgroundColor: '#5ce0ff', boxShadow: 'none' },
                transition: 'background-color 0.2s ease',
              }}>
              New Project
            </Button>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2.5, borderRadius: RADIUS.btn }} onClose={() => setError(null)} action={<Button color="inherit" size="small" onClick={() => { setLoading(true); loadData(); }}>Retry</Button>}>{error}</Alert>}

      {/* â”€â”€ KPI Summary Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: '14px', mb: '20px' }}>
        {loading ? (
          <>
            <KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton />
          </>
        ) : (
          <>
            <KpiCard label="Total Projects" value={total}
              accentColor={COLOR.green} lightBg={COLOR.greenBg}
              icon={<FolderSolidIcon sx={{ fontSize: 18, color: COLOR.green }} />} />
            <KpiCard label="In Production" value={inProductionCount}
              accentColor={COLOR.orange} lightBg={COLOR.orangeBg}
              icon={<SettingsIcon sx={{ fontSize: 18, color: COLOR.orange }} />} />
            <KpiCard label="Shipped" value={shippedCount}
              accentColor={COLOR.blue} lightBg={COLOR.blueBg}
              icon={<ShippingIcon sx={{ fontSize: 18, color: COLOR.blue }} />} />
            <KpiCard label="Commissioned" value={closedCount}
              accentColor={COLOR.purple} lightBg={COLOR.purpleBg}
              icon={<CheckCircleIcon sx={{ fontSize: 18, color: COLOR.purple }} />} />
          </>
        )}
      </Box>

      {/* â”€â”€ Main Body: Table + Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Grid container spacing={2} alignItems="flex-start">

        {/* Expanded Project Table (full width) */}
        <Grid item xs={12} md={12}>
          <Card sx={{ border: `1px solid #1E2235`, borderRadius: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.12), 0 4px 12px -2px rgba(0,0,0,0.20)', overflow: 'hidden',
            background: '#2A2A38',
            position: 'relative',
            transition: 'box-shadow 0.22s ease, border-color 0.22s ease',
            '&:hover': { boxShadow: '0 1px 2px rgba(0,0,0,0.15), 0 10px 24px -6px rgba(0,200,255,0.10), 0 20px 48px -12px rgba(0,200,255,0.06)', borderColor: 'var(--border-strong)' },
          }}>
            {/* Bottom accent line */}
            <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', bgcolor: COLOR.PRIMARY, borderRadius: '0 0 14px 14px', zIndex: 1 }} />

            {/* â”€â”€ Toolbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
            <Box sx={{ px: '20px', py: '14px', borderBottom: `1px solid ${COLOR.borderLight}`,
              display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: COLOR.textPrimary,
                letterSpacing: '-.02em', mr: 0.5 }}>
                Project List
              </Typography>
              <Chip label={`${processed.length}`} size="small"
                sx={{ height: 20, fontSize: 10.5, fontWeight: 600, bgcolor: COLOR.blueBg, color: COLOR.blue,
                  borderRadius: '6px', '& .MuiChip-label': { px: '6px' } }} />
              <Box sx={{ flex: 1 }} />
              <TextField size="small" placeholder="Search projects..."
                value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                sx={{ width: 220, '& .MuiOutlinedInput-root': { borderRadius: RADIUS.input, fontSize: 12.5,
                  bgcolor: 'var(--bg-canvas)', height: 34,
                  '& fieldset': { borderColor: COLOR.border },
                  '&:hover fieldset': { borderColor: '#cbd5e1' },
                  '&.Mui-focused fieldset': { borderColor: COLOR.blue, borderWidth: 1.5 } } }}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: COLOR.textMuted }} /></InputAdornment> }}
              />
              <Tooltip title="Filter">
                <IconButton size="small"
                  sx={{ width: 34, height: 34, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
                    color: COLOR.textSecondary, transition: 'all .15s',
                    '&:hover': { bgcolor: 'var(--bg-surface-2)', borderColor: 'var(--border)' } }}>
                  <FilterIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Export CSV">
                <IconButton size="small" onClick={handleExportCSV}
                  sx={{ width: 34, height: 34, border: `1px solid ${COLOR.border}`, borderRadius: RADIUS.sm,
                    color: COLOR.textSecondary, transition: 'all .15s',
                    '&:hover': { bgcolor: 'var(--bg-surface-2)', borderColor: 'var(--border)', color: COLOR.green } }}>
                  <ExportIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>

            {/* Status filter chip tabs */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: '20px', py: '10px', borderBottom: `1px solid ${COLOR.borderLight}`, overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
              {([
                { key: 'all' as const,              label: 'All',              dot: COLOR.green },
                { key: 'estimated' as const,        label: 'Estimated',        dot: '#38bdf8' },
                { key: 'quoted' as const,           label: 'Quoted',           dot: '#00c8ff' },
                { key: 'order_confirmed' as const,  label: 'Order Confirmed',  dot: '#00c8ff' },
                { key: 'in_production' as const,    label: 'In Production',    dot: '#fb923c' },
                { key: 'inspected' as const,        label: 'Inspected',        dot: '#22d3ee' },
                { key: 'shipped' as const,          label: 'Shipped',          dot: '#10b981' },
              ] as { key: ProjectStatus | 'all'; label: string; dot: string }[]).map(tab => {
                const active = statusFilter === tab.key;
                const count = tab.key === 'all' ? total : projects.filter(p => p.status === tab.key).length;
                return (
                  <Chip
                    key={tab.key}
                    icon={<Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: active ? '#fff' : tab.dot, ml: '4px !important', mr: '-2px !important', flexShrink: 0 }} />}
                    label={`${tab.label} (${count})`}
                    size="small"
                    onClick={() => { setStatusFilter(tab.key); setCurrentPage(1); }}
                    sx={{
                      fontSize: '12px', fontWeight: active ? 700 : 500,
                      borderRadius: '999px', px: '12px', height: 30,
                      bgcolor: active ? UI.primary : 'var(--bg-surface-2)',
                      color: active ? '#000' : 'var(--text-secondary)',
                      border: active ? '1px solid #00c8ff' : '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'all .2s cubic-bezier(.4,0,.2,1)',
                      '&:hover': active
                        ? { bgcolor: '#5ce0ff', color: '#000' }
                        : { bgcolor: 'var(--bg-canvas)', borderColor: 'var(--text-muted)', color: 'var(--text-primary)' },
                    }}
                  />
                );
              })}
            </Box>

            {/* Bulk selection bar — floating */}
            {selectedRows.length > 0 && (
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1, px: 2.5, py: 1.2, mx: 2, my: 1,
                bgcolor: 'rgba(0, 200, 255, 0.04)', borderRadius: '10px',
                border: '1px solid rgba(0, 200, 255, 0.10)',
                boxShadow: 'none',
              }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: UI.primary, mr: .5 }} />
                <Typography sx={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', mr: 'auto' }}>
                  {selectedRows.length} project{selectedRows.length > 1 ? 's' : ''} selected
                </Typography>
                <Button size="small" variant="outlined" color="error" startIcon={<DeleteSweepIcon sx={{ fontSize: 14 }} />}
                  onClick={() => setConfirmDeleteOpen(true)}
                  sx={{ fontSize: 11.5, textTransform: 'none', borderRadius: '8px', py: .5, px: 1.5, fontWeight: 600 }}>Delete</Button>
                <Button size="small" variant="outlined" startIcon={<ExportIcon sx={{ fontSize: 14 }} />}
                  onClick={handleExportCSV}
                  sx={{ fontSize: 11.5, textTransform: 'none', borderRadius: '8px', py: .5, px: 1.5, fontWeight: 600, borderColor: 'var(--border)', color: 'var(--text-secondary)', '&:hover': { bgcolor: 'var(--bg-canvas)', borderColor: '#cbd5e1' } }}>Export</Button>
                <Button size="small" variant="text" startIcon={<CloseIcon sx={{ fontSize: 13 }} />}
                  onClick={() => setSelectedRows([])}
                  sx={{ fontSize: 11.5, textTransform: 'none', color: '#94a3b8', minWidth: 0, px: 1, fontWeight: 600 }}>Clear</Button>
              </Box>
            )}

            {/* -- Project Table -- */}
            <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>

              {/* Column definitions for fixed widths */}
              <colgroup>
                <col style={{ width: '40px' }} />
                <col style={{ width: '50px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '25%', minWidth: '150px' }} />
                <col style={{ width: '20%', minWidth: '120px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '130px' }} />
              </colgroup>

              {/* Header */}
              <thead>
                <tr style={{ backgroundColor: 'transparent' }}>
                  <th style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', fontWeight: 'normal' }}>
                    <Tooltip title={allSel ? 'Deselect all' : 'Select all'}>
                      <IconButton size="small" onClick={toggleAll} sx={{ p: .3, color: 'var(--text-muted)' }}>
                        {allSel ? <CheckBoxIcon sx={{ fontSize: 17, color: 'var(--text-primary)' }} />
                          : someSel ? <IndeterminateIcon sx={{ fontSize: 17, color: 'var(--text-primary)' }} />
                          : <CheckBoxBlankIcon sx={{ fontSize: 17 }} />}
                      </IconButton>
                    </Tooltip>
                  </th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', fontWeight: 'normal' }}>
                    <Typography sx={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>S.No.</Typography>
                  </th>
                  <th style={{ padding: '8px 8px', textAlign: 'left', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', fontWeight: 'normal' }}>
                    <SortHeader label="Project ID" {...sh('project_number')} />
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', fontWeight: 'normal' }}>
                    <SortHeader label="Project Name" {...sh('project_name')} />
                  </th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', fontWeight: 'normal' }}>
                    <SortHeader label="Client" {...sh('client')} />
                  </th>
                  <th style={{ padding: '8px 8px', textAlign: 'left', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', fontWeight: 'normal' }}>
                    <SortHeader label="Status" {...sh('status')} />
                  </th>
                  <th style={{ padding: '8px 8px', textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', fontWeight: 'normal' }}>
                    <SortHeader label="Updated" {...sh('updated_at')} />
                  </th>
                  <th style={{ padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', fontWeight: 'normal' }}>
                    <Typography sx={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Actions</Typography>
                  </th>
                </tr>
              </thead>

              {/* Body */}
              <tbody>
                {loading
                  ? Array.from({ length: rowsPerPage }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={8} style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
                          <Box sx={{ height: 18, bgcolor: 'var(--bg-surface-2)', borderRadius: '6px', width: `${70 + (i * 7) % 25}%` }} />
                        </td>
                      </tr>
                    ))
                  : processed.length === 0
                    ? <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: '48px 0' }}>
                          <Box sx={{ fontSize: 42, mb: 1.5, opacity: 0.5 }}>📋</Box>
                          <Typography sx={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600 }}>No projects found</Typography>
                          <Typography sx={{ color: '#94a3b8', fontSize: 12, mt: .5 }}>Try adjusting your search or filter</Typography>
                        </td>
                      </tr>
                    : displayed.map((project, idx) => {
                        const selected = selectedRows.includes(project.id);
                        const rowNum = (currentPage - 1) * rowsPerPage + idx + 1;
                        return (
                          <Box component="tr" key={project.id}
                            sx={{
                              height: 44, cursor: 'pointer',
                              bgcolor: selected ? 'rgba(0, 200, 255, 0.06)' : idx % 2 === 1 ? 'rgba(255,255,255,0.025)' : 'transparent',
                              transition: 'all .15s',
                              borderLeft: '3px solid transparent',
                              '&:hover': { 
                                bgcolor: selected ? 'rgba(0, 200, 255, 0.08)' : alpha(COLOR.green, 0.04),
                                borderLeftColor: UI.primary,
                              },
                            }}
                            onClick={() => navigate(`/projects/${project.id}`)}>
                            {/* Checkbox */}
                            <td style={{ padding: '4px 6px', textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid var(--border-subtle)' }}
                              onClick={(e) => { e.stopPropagation(); toggleRow(project.id); }}>
                              <Checkbox size="small" checked={selected} sx={{ p: 0, color: 'var(--text-muted)', '&.Mui-checked': { color: 'var(--text-primary)' } }} />
                            </td>
                            {/* S.No */}
                            <td style={{ padding: '4px 6px', textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid var(--border-subtle)' }}>
                              <Typography sx={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>{rowNum}</Typography>
                            </td>
                            {/* Project ID */}
                            <td style={{ padding: '4px 8px', verticalAlign: 'middle', borderBottom: '1px solid var(--border-subtle)' }}>
                              <Typography sx={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'monospace' }}>{project.project_number || '—'}</Typography>
                            </td>
                            {/* Project Name */}
                            <td style={{ padding: '4px 12px', verticalAlign: 'middle', borderBottom: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                              <Box sx={{ '&:hover .proj-name': { color: UI.primary }, minWidth: 0, maxWidth: '100%' }}>
                                <Typography className="proj-name" sx={{ 
                                  fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', 
                                  transition: 'color .15s', lineHeight: 1.3,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  display: 'block', maxWidth: '100%'
                                }}>{project.project_name}</Typography>
                              </Box>
                            </td>
                            {/* Client */}
                            <td style={{ padding: '4px 12px', verticalAlign: 'middle', borderBottom: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                              <Typography sx={{ 
                                fontSize: '12px', color: '#6B7280', fontWeight: 400,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                display: 'block', maxWidth: '100%'
                              }}>
                                {project.client?.client_name || '\u2014'}
                              </Typography>
                            </td>
                            {/* Status */}
                            <td style={{ padding: '4px 8px', textAlign: 'left', verticalAlign: 'middle', borderBottom: '1px solid var(--border-subtle)' }}>
                              {(() => {
                                const estimates: any[] = Array.isArray(project.estimate) ? project.estimate : (project.estimate ? [project.estimate] : []);
                                const maxRev = estimates.length > 0 ? Math.max(...estimates.map((e: any) => e.revision ?? 0)) : null;
                                return <StatusBadge status={project.status} revision={maxRev} />;
                              })()}
                            </td>
                            {/* Updated */}
                            <td style={{ padding: '4px 8px', textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid var(--border-subtle)' }}>
                              <Typography sx={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dayjs(project.updated_at).format('MMM D, YYYY')}</Typography>
                            </td>
                            {/* Actions */}
                            <td style={{ padding: '4px 6px', textAlign: 'center', verticalAlign: 'middle', borderBottom: '1px solid var(--border-subtle)' }}
                              onClick={(e) => e.stopPropagation()}>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                <Tooltip title="View" arrow><IconButton size="small" onClick={() => setPreviewProject(project)}
                                  sx={{ color: 'var(--text-muted)', p: '4px', borderRadius: '6px', '&:hover': { bgcolor: 'var(--border-subtle)', color: 'var(--text-primary)' } }}><ViewIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                                <Tooltip title="Edit" arrow><IconButton size="small" onClick={() => navigate(`/projects/${project.id}`)}
                                  sx={{ color: 'var(--text-muted)', p: '4px', borderRadius: '6px', '&:hover': { bgcolor: 'var(--border-subtle)', color: 'var(--text-primary)' } }}><EditIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                                <Tooltip title="Duplicate" arrow><IconButton size="small" onClick={() => setCopyProject(project)}
                                  sx={{ color: 'var(--text-muted)', p: '4px', borderRadius: '6px', '&:hover': { bgcolor: 'var(--border-subtle)', color: 'var(--text-primary)' } }}><CopyIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                                <Tooltip title="Delete" arrow><IconButton size="small" onClick={() => setSingleDeleteProject(project)}
                                  sx={{ color: 'var(--text-muted)', p: '4px', borderRadius: '6px', '&:hover': { bgcolor: 'rgba(220, 38, 38, 0.10)', color: '#EF4444' } }}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                              </Box>
                            </td>
                          </Box>
                        );
                      })
                }
              </tbody>
            </Box>
            </Box>

            {/* Footer with pagination */}
            {!loading && processed.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: '20px', py: '12px', borderTop: '1px solid var(--border)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography sx={{ fontSize: '13px', color: '#6B7280', fontWeight: 400 }}>
                    Showing {startIdx}–{endIdx} of {processed.length}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Rows:</Typography>
                    <Select
                      size="small"
                      value={rowsPerPage}
                      onChange={e => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                      sx={{
                        fontSize: 12, height: 28, minWidth: 52,
                        borderRadius: '6px',
                        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--border)' },
                        '& .MuiSelect-select': { py: '3px', px: '8px' },
                      }}
                    >
                      {ROWS_OPTIONS.map(n => <MenuItem key={n} value={n} sx={{ fontSize: 12 }}>{n}</MenuItem>)}
                    </Select>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <IconButton size="small" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}
                    sx={{ color: '#6B7280', borderRadius: '8px', border: '1px solid var(--border)', width: 32, height: 32, '&.Mui-disabled': { color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' } }}><PrevIcon sx={{ fontSize: 18 }} /></IconButton>
                  {pageNumbers.map((pg, i) =>
                    pg === '...'
                      ? <Typography key={`d${i}`} sx={{ fontSize: '12px', color: 'var(--text-muted)', px: '4px' }}>...</Typography>
                      : <Box key={pg} onClick={() => setCurrentPage(pg as number)}
                          sx={{
                            width: 32, height: 32, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '13px', fontWeight: currentPage === pg ? 600 : 400, cursor: 'pointer',
                            transition: 'all .15s ease',
                            bgcolor: currentPage === pg ? UI.primary : 'var(--bg-surface-2)',
                            color: currentPage === pg ? '#fff' : 'var(--text-secondary)',
                            border: currentPage === pg ? '1px solid #00c8ff' : '1px solid var(--border)',
                            '&:hover': currentPage === pg ? {} : { bgcolor: 'var(--border-subtle)' },
                          }}>{pg}</Box>
                  )}
                  <IconButton size="small" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}
                    sx={{ color: '#6B7280', borderRadius: '8px', border: '1px solid var(--border)', width: 32, height: 32, '&.Mui-disabled': { color: 'var(--text-muted)', borderColor: 'var(--border-subtle)' } }}><NextIcon sx={{ fontSize: 18 }} /></IconButton>
                </Box>
              </Box>
            )}

          </Card>
        </Grid>

        {/* Removed right-side Overview panel and sidebar cards */}
      </Grid>

      {/* â”€â”€ Preview Drawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Drawer anchor="right" open={!!previewProject} onClose={() => setPreviewProject(null)}
        PaperProps={{ sx: { width: 400, p: 0, boxShadow: '-8px 0 32px rgba(37,99,235,.08)', borderRadius: '16px 0 0 16px' } }}>
        {previewProject && (() => {
          const m = statusMeta(previewProject.status);
          return (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ px: 3, py: 2.5, bgcolor: UI.primary, color: '#fff', display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontSize: 11, opacity: .75, textTransform: 'uppercase', letterSpacing: .5, mb: .4 }}>Project Preview</Typography>
                  <Typography sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{previewProject.project_name}</Typography>
                  {previewProject.client && <Typography sx={{ fontSize: 13, opacity: .8, mt: .4 }}>{previewProject.client.client_name}</Typography>}
                </Box>
                <IconButton size="small" onClick={() => setPreviewProject(null)}
                  sx={{ color: '#fff', opacity: .8, mt: -.5, mr: -.5, '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,.15)' } }}>
                  <CloseIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Box>
              <Box sx={{ px: 3, py: 1.5, bgcolor: `${m.color}12`, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: m.color }} />
                <Typography sx={{ fontSize: 13, fontWeight: 600, color: m.color }}>{m.label}</Typography>
              </Box>
              <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2.5 }}>
                {(() => {
                  const estimates = Array.isArray(previewProject.estimate) ? previewProject.estimate : (previewProject.estimate ? [previewProject.estimate] : []);
                  const maxRev = estimates.length > 0 ? Math.max(...estimates.map((e: any) => e.revision ?? 0)) : 0;
                  const revCount = estimates.length;
                  return [
                    { label: 'Revision',       value: `R${maxRev}` },
                    { label: 'Total Revisions', value: `${revCount} revision${revCount !== 1 ? 's' : ''}` },
                    { label: 'Last Updated',    value: dayjs(previewProject.updated_at).format('MMM D, YYYY HH:mm') },
                    { label: 'Created',         value: dayjs((previewProject as any).created_at).format('MMM D, YYYY') },
                    { label: 'Status',          value: m.label },
                  ];
                })().map(r => (
                    <Box key={r.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.2, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <Typography sx={{ fontSize: 12.5, color: '#6B7280' }}>{r.label}</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: UI.primary }}>{r.value}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ px: 3, py: 2, borderTop: '1px solid var(--border)', display: 'flex', gap: 1.5 }}>
                <Button fullWidth variant="contained"
                  onClick={() => { navigate(`/projects/${previewProject.id}`); setPreviewProject(null); }}
                  sx={{ bgcolor: UI.primary, '&:hover': { bgcolor: '#0099cc' }, textTransform: 'none', fontWeight: 600, borderRadius: '10px', boxShadow: 'none' }}>
                  Open Project
                </Button>
                <Button fullWidth variant="outlined" onClick={() => setPreviewProject(null)}
                  sx={{ textTransform: 'none', color: '#6B7280', borderColor: 'var(--border)', borderRadius: '10px', '&:hover': { bgcolor: 'var(--border)' } }}>
                  Close
                </Button>
              </Box>
            </Box>
          );
        })()}
      </Drawer>

      {/* â”€â”€ Bulk Delete Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '16px', p: .5 } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', pb: .5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ bgcolor: '#FEE2E2', borderRadius: '10px', p: .7, display: 'flex' }}><DeleteSweepIcon sx={{ fontSize: 18, color: '#EF4444' }} /></Box>
          Delete {selectedRows.length} Project{selectedRows.length > 1 ? 's' : ''}
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Typography sx={{ fontSize: 13.5, color: '#6B7280' }}>
            You are about to permanently delete <strong>{selectedRows.length}</strong> project{selectedRows.length > 1 ? 's' : ''}. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setConfirmDeleteOpen(false)} variant="outlined"
            sx={{ textTransform: 'none', fontSize: 13, color: '#6B7280', borderColor: 'var(--border)', borderRadius: '10px', px: 2 }}>Cancel</Button>
          <Button variant="contained" onClick={handleBulkDelete}
            sx={{ textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: '10px', px: 2, boxShadow: 'none', bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' }, color: '#fff' }}>Confirm Delete</Button>
        </DialogActions>
      </Dialog>

      {/* â”€â”€ Single Delete Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Dialog open={!!singleDeleteProject} onClose={() => setSingleDeleteProject(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '16px', p: .5 } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', pb: .5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ bgcolor: '#FEE2E2', borderRadius: '10px', p: .7, display: 'flex' }}><DeleteIcon sx={{ fontSize: 18, color: '#DC2626' }} /></Box>
          Delete Project
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {singleDeleteProject && (() => {
            const m = statusMeta(singleDeleteProject.status as ProjectStatus);
            return (<>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, px: 1.5, py: 1, bgcolor: `${m.color}10`, borderRadius: '10px', border: `1px solid ${m.color}25` }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: m.color, flexShrink: 0 }} />
                <Typography sx={{ fontSize: 12.5, color: m.color, fontWeight: 600 }}>This project is currently in <strong>{m.label}</strong> status.</Typography>
              </Box>
              <Typography sx={{ fontSize: 13.5, color: '#6B7280' }}>
                Are you sure you want to delete <strong>&ldquo;{singleDeleteProject.project_name}&rdquo;</strong>? This action cannot be undone.
              </Typography>
            </>);
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setSingleDeleteProject(null)} variant="outlined"
            sx={{ textTransform: 'none', fontSize: 13, color: '#6B7280', borderColor: 'var(--border)', borderRadius: '10px', px: 2 }}>Cancel</Button>
          <Button variant="contained" onClick={handleSingleDelete}
            sx={{ textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: '10px', px: 2, boxShadow: 'none', bgcolor: '#EF4444', '&:hover': { bgcolor: '#DC2626' }, color: '#fff' }}>Confirm Delete</Button>
        </DialogActions>
      </Dialog>

      {/* â”€â”€ Create Project Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <form onSubmit={handleSubmit(handleCreateProject)}>
          <DialogTitle sx={{ fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>Create New Project</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <Controller name="project_name" control={control} rules={{ required: 'Project name is required' }}
                  render={({ field }) => (
                    <TextField {...field} fullWidth label="Project Name" error={!!errors.project_name} helperText={errors.project_name?.message}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
                  )} />
              </Grid>
              <Grid item xs={12}>
                <Controller name="client_id" control={control} rules={{ required: 'Client is required' }}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.client_id} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}>
                      <InputLabel>Client</InputLabel>
                      <Select {...field} label="Client">
                        {clients.map(c => <MenuItem key={c.id} value={c.id}>{c.client_name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  )} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Project Number" value={nextPrjNumber || 'Generating...'} disabled
                  helperText="Auto-generated on save." sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
            <Button onClick={() => setOpenDialog(false)} variant="outlined"
              sx={{ textTransform: 'none', borderRadius: '10px', color: '#6B7280', borderColor: 'var(--border)' }}>Cancel</Button>
            <Button type="submit" variant="contained"
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '10px', bgcolor: UI.primary, '&:hover': { bgcolor: '#0099cc' }, boxShadow: 'none' }}>
              Create Project
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* â”€â”€ Copy Project Confirmation Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Dialog open={!!copyProject} onClose={() => !copyLoading && setCopyProject(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '16px', p: .5 } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', pb: .5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ bgcolor: 'rgba(0, 200, 255, 0.10)', borderRadius: '10px', p: .7, display: 'flex' }}><CopyIcon sx={{ fontSize: 18, color: UI.primary }} /></Box>
          Copy Project
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {copyProject && (() => {
            const rootName = copyProject.project_name.replace(/_\d+$/, '');
            const existingCopies = projects.filter(p => new RegExp(`^${rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_(\\d+)$`).test(p.project_name));
            const maxNum = existingCopies.reduce((max, p) => {
              const m = p.project_name.match(/_(\d+)$/);
              return m ? Math.max(max, parseInt(m[1], 10)) : max;
            }, 0);
            const newName = `${rootName}_${String(maxNum + 1).padStart(2, '0')}`;
            return (
              <>
                <Typography sx={{ fontSize: 13.5, color: '#6B7280', mb: 2 }}>
                  A new project will be created with all data copied from
                  <strong> &ldquo;{copyProject.project_name}&rdquo;</strong>.
                </Typography>
                <Box sx={{ bgcolor: 'var(--border-subtle)', border: '1px solid var(--border)', borderRadius: '14px', p: 2 }}>
                  {[
                    { label: 'New Name', value: newName, color: UI.primary, bold: true },
                    { label: 'Status', value: 'Draft', color: '#94a3b8', bold: false },
                    { label: 'Revision', value: 'R0', color: '#6B7280', bold: false },
                    { label: 'Date', value: dayjs().format('MMM D, YYYY'), color: '#6B7280', bold: false },
                  ].map(r => (
                    <Box key={r.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: .8, borderBottom: '1px solid var(--border-subtle)', '&:last-child': { borderBottom: 'none' } }}>
                      <Typography sx={{ fontSize: 12.5, color: '#6B7280' }}>{r.label}</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: r.bold ? 700 : 600, color: r.color }}>{r.value}</Typography>
                    </Box>
                  ))}
                </Box>
                <Typography sx={{ fontSize: 12, color: '#6B7280', mt: 1.5, fontStyle: 'italic' }}>
                  Only Project Info and Estimation will be copied.
                </Typography>
              </>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setCopyProject(null)} variant="outlined" disabled={copyLoading}
            sx={{ textTransform: 'none', fontSize: 13, color: '#6B7280', borderColor: 'var(--border)', borderRadius: '10px', px: 2 }}>Cancel</Button>
          <Button variant="contained" onClick={handleCopyProject} disabled={copyLoading}
            startIcon={<CopyIcon sx={{ fontSize: 16 }} />}
            sx={{ textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: '10px', px: 2, boxShadow: 'none',
              bgcolor: UI.primary, '&:hover': { bgcolor: '#0099cc', color: '#000' }, color: '#000' }}>
            {copyLoading ? 'Copying...' : 'Confirm Copy'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* â”€â”€ Success Snackbar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Snackbar open={!!successMsg} autoHideDuration={4000} onClose={() => setSuccessMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" onClose={() => setSuccessMsg(null)}
          sx={{ borderRadius: '14px', fontWeight: 600, boxShadow: '0 4px 16px rgba(37,99,235,.12)' }}>
          {successMsg}
        </Alert>
      </Snackbar>

    </Box>
  );
}

export default ProjectsPage;
