import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Button, TextField, InputAdornment, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Drawer, Select, MenuItem,
  FormControl, InputLabel, Grid, Tooltip, alpha, Skeleton, Alert, Snackbar,
  Divider, FormHelperText, ToggleButton, ToggleButtonGroup, Checkbox, Dialog,
  DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Close as CloseIcon, Refresh as RefreshIcon, Clear as ClearIcon,
  Science as ScienceIcon, Inventory as InventoryIcon,
  ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
  FileDownload as ExportIcon, ContentCopy as DuplicateIcon,
} from '@mui/icons-material';
import { rawMaterialService, RawMaterialData, RawMaterialCatalog } from '../services/rawMaterialService';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';

/* ═══════════════════════════════════════════════════════════════════
   STATIC CATALOG DATA (mirrors backend rawMaterialService)
   ═══════════════════════════════════════════════════════════════════ */
const RAW_MATERIAL_CATALOG: Record<string, Record<string, string[]>> = {
  'Stainless Steel': {
    '17-4': ['Annealed', 'H900', 'H1025'], '316L': ['Annealed'], '304L': ['Annealed'],
    '303': ['Annealed'], '410': ['Annealed'], '420': ['Annealed'], '430': ['Annealed'],
    'Nitronic 50': ['Annealed'], 'Nitronic 60': ['Annealed'],
  },
  'Carbon Steel': {
    '1018': ['Cold Drawn', 'Annealed'], '1020': ['Hot Rolled'], '1045': ['Normalized'], 'A36': ['Hot Rolled'],
  },
  'Alloy Steel': {
    '4140': ['Annealed', 'Pre-Hardened', 'Q&T'],
    '4340': ['Annealed', 'Q&T'], '8620': ['Carburized'],
  },
  'Tool Steel': { 'D2': ['Annealed', 'Hardened'], 'A2': ['Annealed', 'Hardened'], 'H13': ['Annealed', 'Hardened'] },
  'Aluminum': { '6061': ['T6', 'T651'], '7075': ['T6', 'T651'], '2024': ['T4'], '5052': ['H32'] },
  'Copper': { 'C110': ['Annealed'], 'C101': ['Annealed'], 'C360': ['Free Machining'], 'Beryllium Copper': ['Age Hardened'] },
  'Nickel Alloy': {
    'Inconel 718': ['Annealed', 'Age Hardened'], 'Inconel 625': ['Annealed'],
    'Monel 400': ['Annealed'], 'Hastelloy C276': ['Annealed'],
  },
  'Titanium': { 'Grade 2': ['Annealed'], 'Grade 5': ['Annealed'] },
  'Brass': { 'C360': ['Free Machining'], 'C260': ['Annealed'] },
  'Plastics': { 'Delrin': ['Natural'], 'Nylon 6': ['General'], 'PTFE': ['General'], 'PEEK': ['General'] },
};
const CATEGORIES = Object.keys(RAW_MATERIAL_CATALOG);

// Fixed density per category (g/cm³) — some plastics per grade
const DENSITY_MAP: Record<string, number | Record<string, number>> = {
  'Carbon Steel': 7.85, 'Alloy Steel': 7.85, 'Tool Steel': 7.85,
  'Stainless Steel': 7.9, 'Aluminum': 2.7, 'Copper': 8.96,
  'Brass': 8.5, 'Titanium': 4.5, 'Nickel Alloy': 8.4,
  'Plastics': { 'Delrin': 1.41, 'Nylon 6': 1.15, 'PTFE': 2.2, 'PEEK': 1.32 },
};

function getDensity(category: string, grade: string): number | null {
  const d = DENSITY_MAP[category];
  if (typeof d === 'number') return d;
  if (typeof d === 'object') return d[grade] ?? null;
  return null;
}

// Form → Shape (auto-derived, 1:1)
const FORM_SHAPE_MAP: Record<string, string> = {
  'Rod': 'Round', 'Sheet': 'Flat', 'Plate': 'Flat', 'Pipe': 'Hollow Round',
  'Hex Bar': 'Hex', 'Flat Bar': 'Flat', 'Square Tube': 'Hollow Square', 'Rectangular Tube': 'Hollow Rectangle',
};
const FORM_OPTIONS = ['Rod', 'Plate', 'Sheet', 'Pipe', 'Square Tube', 'Rectangular Tube', 'Flat Bar', 'Hex Bar'];

/* ─── dimension fields per form ───────────────────────────────── */
type DimField = { id: string; labelImperial: string; labelMetric: string };
const getDimFields = (form: string): DimField[] => {
  // Rod (Round shape) → Diameter + Length
  if (form === 'Rod') return [
    { id: 'diameter', labelImperial: 'Diameter (in)', labelMetric: 'Diameter (mm)' },
    { id: 'length', labelImperial: 'Length (ft)', labelMetric: 'Length (mm)' }
  ];
  // Plate / Sheet → Length + Width + Thickness
  if (form === 'Plate' || form === 'Sheet') return [
    { id: 'length', labelImperial: 'Length (in)', labelMetric: 'Length (mm)' },
    { id: 'width', labelImperial: 'Width (in)', labelMetric: 'Width (mm)' },
    { id: 'thickness', labelImperial: 'Thickness (in)', labelMetric: 'Thickness (mm)' }
  ];
  // Pipe → Outer Diameter + Inner Diameter/Thickness + Length
  if (form === 'Pipe') return [
    { id: 'outer_diameter', labelImperial: 'Outer Diameter (in)', labelMetric: 'Outer Diameter (mm)' },
    { id: 'inner_diameter', labelImperial: 'Inner Diameter (in)', labelMetric: 'Inner Diameter (mm)' },
    { id: 'length', labelImperial: 'Length (ft)', labelMetric: 'Length (mm)' }
  ];
  // Square Tube → Width + Thickness + Length
  if (form === 'Square Tube') return [
    { id: 'width', labelImperial: 'Width (in)', labelMetric: 'Width (mm)' },
    { id: 'thickness', labelImperial: 'Thickness (in)', labelMetric: 'Thickness (mm)' },
    { id: 'length', labelImperial: 'Length (ft)', labelMetric: 'Length (mm)' }
  ];
  // Rectangular Tube → Width + Height + Thickness + Length
  if (form === 'Rectangular Tube') return [
    { id: 'width', labelImperial: 'Width (in)', labelMetric: 'Width (mm)' },
    { id: 'height', labelImperial: 'Height (in)', labelMetric: 'Height (mm)' },
    { id: 'thickness', labelImperial: 'Thickness (in)', labelMetric: 'Thickness (mm)' },
    { id: 'length', labelImperial: 'Length (ft)', labelMetric: 'Length (mm)' }
  ];
  // Flat Bar → Width + Thickness + Length
  if (form === 'Flat Bar') return [
    { id: 'width', labelImperial: 'Width (in)', labelMetric: 'Width (mm)' },
    { id: 'thickness', labelImperial: 'Thickness (in)', labelMetric: 'Thickness (mm)' },
    { id: 'length', labelImperial: 'Length (ft)', labelMetric: 'Length (mm)' }
  ];
  // Hex Bar → Across Flat + Length
  if (form === 'Hex Bar') return [
    { id: 'across_flats', labelImperial: 'Across Flat (in)', labelMetric: 'Across Flat (mm)' },
    { id: 'length', labelImperial: 'Length (ft)', labelMetric: 'Length (mm)' }
  ];
  return [];
};

/* ─── format dimensions for display ───────────────────────────── */
const formatDimensions = (material: { form?: string | null; dimensions?: Record<string, string> | null }): string => {
  if (!material.form || !material.dimensions) return '—';
  const d = material.dimensions;
  const unit = '"';
  
  // Plate / Sheet → Length x Width x Thickness (L x W x T)
  if (material.form === 'Plate' || material.form === 'Sheet') {
    if (d.length && d.width && d.thickness) {
      return `${d.length}${unit} x ${d.width}${unit} x ${d.thickness}${unit} (L x W x T)`;
    }
  }
  
  // Rod (Round) → Diameter x Length (D x L)
  if (material.form === 'Rod') {
    if (d.diameter && d.length) {
      return `${d.diameter}${unit} x ${d.length}${unit} (D x L)`;
    }
  }
  
  // Pipe → OD x ID x Length
  if (material.form === 'Pipe') {
    if (d.outer_diameter && d.inner_diameter && d.length) {
      return `${d.outer_diameter}${unit} x ${d.inner_diameter}${unit} x ${d.length}${unit} (OD x ID x L)`;
    }
  }
  
  // Square Tube → Width x Thickness x Length
  if (material.form === 'Square Tube') {
    if (d.width && d.thickness && d.length) {
      return `${d.width}${unit} x ${d.thickness}${unit} x ${d.length}${unit} (W x T x L)`;
    }
  }
  
  // Rectangular Tube → Width x Height x Thickness x Length
  if (material.form === 'Rectangular Tube') {
    if (d.width && d.height && d.thickness && d.length) {
      return `${d.width}${unit} x ${d.height}${unit} x ${d.thickness}${unit} x ${d.length}${unit}`;
    }
  }
  
  // Flat Bar → Width x Thickness x Length
  if (material.form === 'Flat Bar') {
    if (d.width && d.thickness && d.length) {
      return `${d.width}${unit} x ${d.thickness}${unit} x ${d.length}${unit} (W x T x L)`;
    }
  }
  
  // Hex Bar → Across Flat x Length
  if (material.form === 'Hex Bar') {
    if (d.across_flats && d.length) {
      return `${d.across_flats}${unit} x ${d.length}${unit} (AF x L)`;
    }
  }
  
  return '—';
};

/* ─── helpers ─────────────────────────────────────────────────── */
const ROWS_PER_PAGE = 15;

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'var(--accent)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem',
    '& fieldset': { borderColor: 'var(--border)' },
    '&:hover fieldset': { borderColor: 'var(--primary)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--primary)', borderWidth: '1px' },
  },
  '& .MuiInputLabel-root': {
    fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
  },
};

const MiniStatCard: React.FC<{
  icon: React.ReactNode; label: string; value: string | number; borderColor: string;
}> = ({ icon, label, value, borderColor }) => (
  <Box sx={{ flex: '1 1 0', minWidth: 170, p: '14px 16px', bgcolor: 'var(--card)', borderRadius: 'var(--radius)',
    border: '1px solid var(--border)', borderLeft: `3px solid ${borderColor}`,
    boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: '12px',
    transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 'var(--shadow)' } }}>
    <Box sx={{ width: 38, height: 38, borderRadius: 'var(--radius-sm)', bgcolor: alpha(borderColor, 0.08),
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.06em', lineHeight: 1, mb: '4px', whiteSpace: 'nowrap' }}>{label}</Typography>
      <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>{value}</Typography>
    </Box>
  </Box>
);

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
const RawMaterialMasterPage: React.FC = () => {
  const { user } = useAuth();
  const canWrite = user?.role === 'main_admin' || user?.role === 'admin' || user?.role === 'platform_admin';

  const [materials, setMaterials] = useState<RawMaterialData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterialData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<RawMaterialData | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  // Form fields
  const [f, setF] = useState({
    material_category: '', material_grade: '', condition: '', density: '',
    form: '', shape: '', notes: '',
  });
  const [fDims, setFDims] = useState<Record<string, string>>({});
  const [unitSystem, setUnitSystem] = useState<'imperial' | 'metric'>('imperial');

  // Derived dropdown lists
  const gradesList = useMemo(() => {
    return RAW_MATERIAL_CATALOG[f.material_category] ? Object.keys(RAW_MATERIAL_CATALOG[f.material_category]) : [];
  }, [f.material_category]);

  const conditionsList = useMemo(() => {
    if (!f.material_category || !f.material_grade) return [];
    return RAW_MATERIAL_CATALOG[f.material_category]?.[f.material_grade] || [];
  }, [f.material_category, f.material_grade]);

  // Dimension fields based on selected form
  const dimFields = useMemo(() => {
    if (!f.form) return [];
    return getDimFields(f.form);
  }, [f.form]);

  /* ─── Load data ───────────────────────────────────────────── */
  useEffect(() => { loadMaterials(); }, []);
  useEffect(() => { setPage(1); }, [searchQuery, categoryFilter, statusFilter]);

  const loadMaterials = async () => {
    try {
      setLoading(true); setError(null);
      const data = await rawMaterialService.getAll();
      setMaterials(data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error loading raw materials');
    } finally { setLoading(false); }
  };

  /* ─── Stats ───────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const total = materials.length;
    const active = materials.filter(m => m.is_active).length;
    const cats = new Set(materials.map(m => m.material_category)).size;
    const withCost = materials.filter(m => m.cost_per_unit > 0).length;
    return { total, active, cats, withCost };
  }, [materials]);

  /* ─── Filters ─────────────────────────────────────────────── */
  const hasFilters = searchQuery || categoryFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = useCallback(() => {
    setSearchQuery(''); setCategoryFilter('all'); setStatusFilter('all'); setPage(1);
  }, []);

  const filtered = useMemo(() => {
    return materials.filter(m => {
      const q = searchQuery.toLowerCase();
      const ms = !q || 
        (m.material_id && m.material_id.toLowerCase().includes(q)) ||
        m.material_category.toLowerCase().includes(q) ||
        m.material_grade.toLowerCase().includes(q) || 
        m.condition.toLowerCase().includes(q);
      const mC = categoryFilter === 'all' || m.material_category === categoryFilter;
      const mS = statusFilter === 'all' || (statusFilter === 'active' ? m.is_active : !m.is_active);
      return ms && mC && mS;
    }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [materials, searchQuery, categoryFilter, statusFilter]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, page]);

  /* ─── Form handlers ───────────────────────────────────────── */
  const resetForm = () => {
    setF({ material_category: '', material_grade: '', condition: '', density: '',
      form: '', shape: '', notes: '' });
    setFDims({});
    setUnitSystem('imperial');
    setFormErrors({});
  };

  const handleOpenAdd = () => { setEditing(null); resetForm(); setDrawerOpen(true); };

  const handleOpenEdit = (m: RawMaterialData) => {
    setEditing(m);
    setF({
      material_category: m.material_category, material_grade: m.material_grade,
      condition: m.condition, density: m.density ? String(m.density) : '',
      form: m.form || '', shape: m.shape || '',
      notes: m.notes || '',
    });
    setFDims(m.dimensions || {});
    setUnitSystem((m.unit_system as 'imperial' | 'metric') || 'imperial');
    setFormErrors({});
    setDrawerOpen(true);
  };

  // Cascade handlers
  const handleCategoryChange = (cat: string) => {
    setF(prev => ({ ...prev, material_category: cat, material_grade: '', condition: '', density: '' }));
  };

  const handleGradeChange = (grade: string) => {
    const density = getDensity(f.material_category, grade);
    setF(prev => ({
      ...prev, material_grade: grade, condition: '',
      density: density ? String(density) : '',
    }));
  };

  const handleConditionChange = (cond: string) => {
    setF(prev => ({ ...prev, condition: cond }));
  };

  const handleFormChange = (form: string) => {
    const shape = FORM_SHAPE_MAP[form] || '';
    setF(prev => ({ ...prev, form, shape }));
    setFDims({});
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    if (!f.material_category) errors.material_category = 'Required';
    if (!f.material_grade) errors.material_grade = 'Required';
    if (!f.condition) errors.condition = 'Required';
    if (!f.density || parseFloat(f.density) <= 0) errors.density = 'Must be > 0';
    if (Object.keys(errors).length) { setFormErrors(errors); return; }

    setSubmitting(true);
    try {
      const payload: any = {
        material_category: f.material_category,
        material_grade: f.material_grade,
        condition: f.condition,
        form: f.form || null,
        dimensions: Object.keys(fDims).length > 0 ? fDims : null,
        unit_system: unitSystem,
        notes: f.notes || null,
      };
      if (editing) {
        await rawMaterialService.update(editing.id, payload);
        setSuccessMsg('Raw material updated');
      } else {
        await rawMaterialService.create(payload);
        setSuccessMsg('Raw material created');
      }
      setDrawerOpen(false); setEditing(null); loadMaterials();
    } catch (err: any) {
      setFormErrors({ _server: err.response?.data?.message || err.message || 'Error saving' });
    } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await rawMaterialService.delete(deleteTarget.id);
      setSuccessMsg('Raw material deleted'); setDeleteTarget(null); loadMaterials();
      // Remove from selection if was selected
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error deleting'); setDeleteTarget(null);
    }
  };

  const handleDuplicate = async (m: RawMaterialData) => {
    try {
      await rawMaterialService.duplicate(m.id);
      setSuccessMsg('Material duplicated with new ID');
      loadMaterials();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error duplicating material');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const result = await rawMaterialService.bulkDelete(Array.from(selectedIds));
      setSuccessMsg(`${result.count} material(s) deleted`);
      setSelectedIds(new Set());
      setBulkDeleteDialogOpen(false);
      loadMaterials();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error deleting materials');
      setBulkDeleteDialogOpen(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(paginated.map(m => m.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleToggleStatus = async (id: string) => {
    try { await rawMaterialService.toggleStatus(id); loadMaterials(); }
    catch (err: any) { setError(err.response?.data?.message || 'Error toggling status'); }
  };



  const handleExport = () => {
    const headers = ['Material ID', 'Category', 'Grade', 'Condition', 'Shape', 'Dimensions', 'Cost'];
    const rows = filtered.map(m => [
      m.material_id || '', m.material_category, m.material_grade, m.condition,
      m.shape || '', formatDimensions(m),
      m.cost_per_unit ? `${m.cost_per_unit.toFixed(2)} ${m.cost_unit || '$/lb'}` : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `raw_materials_${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
  };

  /* ═══ RENDER ══════════════════════════════════════════════════ */
  return (
    <Box sx={{ pb: 4 }} className="animate-fadeIn">

      {/* ═══ HEADER ═════════════════════════════════════════════ */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '20px', flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
            Raw Material Master
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'var(--muted)', mt: '2px' }}>
            Controlled material catalog — Category → Grade → Condition
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={loadMaterials}
              sx={{ color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', width: 34, height: 34,
                transition: 'all 0.15s', '&:hover': { borderColor: 'var(--primary)', color: 'var(--primary)', bgcolor: 'var(--primary-bg)' } }}>
              <RefreshIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Button variant="outlined" startIcon={<ExportIcon sx={{ fontSize: 15 }} />} onClick={handleExport}
            sx={{ textTransform: 'none', borderRadius: 'var(--radius-sm)', borderColor: 'var(--border)', color: 'var(--secondary-foreground)',
              fontWeight: 600, fontSize: '0.78rem', height: 34, transition: 'all 0.15s',
              '&:hover': { borderColor: 'var(--primary)', color: 'var(--primary)', bgcolor: 'var(--primary-bg)' } }}>
            Export
          </Button>
          {canWrite && selectedIds.size > 0 && (
            <Button variant="outlined" color="error" startIcon={<DeleteIcon sx={{ fontSize: 15 }} />}
              onClick={() => setBulkDeleteDialogOpen(true)}
              sx={{ textTransform: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: '0.78rem', height: 34 }}>
              Delete ({selectedIds.size})
            </Button>
          )}
          {canWrite && (
            <Button variant="contained" startIcon={<AddIcon sx={{ fontSize: 17 }} />} onClick={handleOpenAdd}
              sx={{ bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-light)' }, textTransform: 'none',
                fontWeight: 700, borderRadius: 'var(--radius-sm)', px: 2, height: 34, boxShadow: 'none', fontSize: '0.78rem' }}>
              Create Material
            </Button>
          )}
        </Box>
      </Box>

      {/* ═══ STAT CARDS ════════════════════════════════════════ */}
      <Box sx={{ display: 'flex', gap: '14px', mb: '20px', flexWrap: 'wrap' }}>
        <MiniStatCard icon={<ScienceIcon sx={{ fontSize: 20, color: '#0EA5E9' }} />} label="Total Materials" value={stats.total} borderColor="#0EA5E9" />
        <MiniStatCard icon={<InventoryIcon sx={{ fontSize: 20, color: '#16A34A' }} />} label="Active" value={stats.active} borderColor="#16A34A" />
        <MiniStatCard icon={<ScienceIcon sx={{ fontSize: 20, color: '#86efac' }} />} label="Categories" value={stats.cats} borderColor="#86efac" />
        <MiniStatCard icon={<ScienceIcon sx={{ fontSize: 20, color: '#F59E0B' }} />} label="With Cost" value={stats.withCost} borderColor="#F59E0B" />
      </Box>

      {error && <Alert severity="error" sx={{ mb: '20px', borderRadius: 'var(--radius-sm)' }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ═══ FILTER TOOLBAR ════════════════════════════════════ */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '20px', flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="Search ID, category, grade, condition…"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          sx={{ flex: '1 1 320px', maxWidth: 400,
            '& .MuiOutlinedInput-root': { borderRadius: 'var(--radius)', fontSize: '0.8rem', height: 38, bgcolor: 'var(--card)',
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' } } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 17, color: 'var(--muted)' }} /></InputAdornment> }} />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel sx={{ fontSize: '0.78rem' }}>Category</InputLabel>
          <Select value={categoryFilter} label="Category" onChange={e => setCategoryFilter(e.target.value)}
            sx={{ borderRadius: 'var(--radius)', fontSize: '0.78rem', height: 38, bgcolor: 'var(--card)' }}>
            <MenuItem value="all">All Categories</MenuItem>
            {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel sx={{ fontSize: '0.78rem' }}>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value)}
            sx={{ borderRadius: 'var(--radius)', fontSize: '0.78rem', height: 38, bgcolor: 'var(--card)' }}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </Select>
        </FormControl>
        {hasFilters && (
          <Button size="small" startIcon={<ClearIcon sx={{ fontSize: 14 }} />} onClick={clearFilters}
            sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted)', borderRadius: 'var(--radius-sm)', height: 38 }}>
            Clear
          </Button>
        )}
      </Box>

      {/* ═══ TABLE ═════════════════════════════════════════════ */}
      <TableContainer sx={{ bgcolor: 'var(--card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'var(--accent)' }}>
              {canWrite && (
                <TableCell padding="checkbox" sx={{ borderBottom: '1px solid var(--border)', width: 48 }}>
                  <Checkbox
                    size="small"
                    indeterminate={selectedIds.size > 0 && selectedIds.size < paginated.length}
                    checked={paginated.length > 0 && selectedIds.size === paginated.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 18 } }}
                  />
                </TableCell>
              )}
              {['S.No', 'Material ID', 'Category', 'Grade', 'Condition', 'Dimensions', 'Shape', 'Actions'].map(h => (
                <TableCell key={h} sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
                  letterSpacing: '0.05em', py: '10px', borderBottom: '1px solid var(--border)' }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>{[...Array(canWrite ? 9 : 8)].map((_, j) => (
                  <TableCell key={j}><Skeleton variant="text" sx={{ fontSize: '0.8rem' }} /></TableCell>
                ))}</TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canWrite ? 9 : 8} sx={{ textAlign: 'center', py: 6, color: 'var(--muted)' }}>
                  {materials.length === 0 ? (
                    <Box>
                      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, mb: 1 }}>No raw materials yet</Typography>
                      <Typography sx={{ fontSize: '0.78rem' }}>Click "Create Material" to create the first entry</Typography>
                    </Box>
                  ) : 'No materials match your filters'}
                </TableCell>
              </TableRow>
            ) : paginated.map((m, idx) => (
              <TableRow key={m.id} hover sx={{ 
                '&:hover': { bgcolor: alpha('#1F7A63', 0.02) },
                transition: 'background-color 0.15s',
                bgcolor: selectedIds.has(m.id) ? alpha('#1F7A63', 0.05) : 'transparent',
              }}>
                {canWrite && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selectedIds.has(m.id)}
                      onChange={(e) => handleSelectOne(m.id, e.target.checked)}
                      sx={{ '& .MuiSvgIcon-root': { fontSize: 18 } }}
                    />
                  </TableCell>
                )}
                <TableCell sx={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {(page - 1) * ROWS_PER_PAGE + idx + 1}
                </TableCell>
                <TableCell sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
                  {m.material_id || '—'}
                </TableCell>
                <TableCell sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--foreground)' }}>{m.material_category}</TableCell>
                <TableCell sx={{ fontSize: '0.78rem', color: 'var(--foreground)' }}>{m.material_grade}</TableCell>
                <TableCell sx={{ fontSize: '0.78rem', color: 'var(--foreground)' }}>{m.condition}</TableCell>
                <TableCell sx={{ fontSize: '0.75rem', color: 'var(--foreground)', fontFamily: 'monospace', maxWidth: 220 }}>
                  {formatDimensions(m)}
                </TableCell>
                <TableCell sx={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{m.shape || '—'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {canWrite && (
                    <>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => handleOpenEdit(m)}
                          sx={{ color: 'var(--muted)', '&:hover': { color: 'var(--primary)' } }}>
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Duplicate">
                        <IconButton size="small" onClick={() => handleDuplicate(m)}
                          sx={{ color: 'var(--muted)', '&:hover': { color: '#0EA5E9' } }}>
                          <DuplicateIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" onClick={() => setDeleteTarget(m)}
                          sx={{ color: 'var(--muted)', '&:hover': { color: '#EF4444' } }}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ═══ PAGINATION ════════════════════════════════════════ */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', mt: '16px' }}>
          <IconButton size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeftIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Typography sx={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            Page {page} of {totalPages} ({filtered.length} results)
          </Typography>
          <IconButton size="small" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRightIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      )}

      {/* ═══ DRAWER ════════════════════════════════════════════ */}
      <Drawer anchor="right" open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditing(null); }}
        PaperProps={{ sx: { width: { xs: '100%', sm: 480 }, bgcolor: 'var(--background)', borderLeft: '1px solid var(--border)' } }}>
        <Box sx={{ p: 3 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--foreground)' }}>
              {editing ? 'Edit Raw Material' : 'Add Raw Material'}
            </Typography>
            <IconButton size="small" onClick={() => { setDrawerOpen(false); setEditing(null); }}>
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>

          {formErrors._server && <Alert severity="error" sx={{ mb: 2, borderRadius: 'var(--radius-sm)' }}>{formErrors._server}</Alert>}

          {/* ── STEP 1: Category ──────────────────────────────── */}
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.5 }}>
            Material Selection (Dropdown Only)
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12}>
              <FormControl fullWidth size="small" sx={fieldSx} error={!!formErrors.material_category}>
                <InputLabel>Material Category *</InputLabel>
                <Select value={f.material_category} label="Material Category *" onChange={e => handleCategoryChange(e.target.value as string)}>
                  {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
                {formErrors.material_category && <FormHelperText error>{formErrors.material_category}</FormHelperText>}
              </FormControl>
            </Grid>

            {/* ── STEP 2: Grade ─────────────────────────────────── */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small" sx={fieldSx} error={!!formErrors.material_grade} disabled={!f.material_category}>
                <InputLabel>Grade *</InputLabel>
                <Select value={f.material_grade} label="Grade *" onChange={e => handleGradeChange(e.target.value as string)}>
                  {gradesList.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                </Select>
                {formErrors.material_grade && <FormHelperText error>{formErrors.material_grade}</FormHelperText>}
              </FormControl>
            </Grid>

            {/* ── STEP 3: Condition ─────────────────────────────── */}
            <Grid item xs={6}>
              <FormControl fullWidth size="small" sx={fieldSx} error={!!formErrors.condition} disabled={!f.material_grade}>
                <InputLabel>Condition *</InputLabel>
                <Select value={f.condition} label="Condition *" onChange={e => handleConditionChange(e.target.value as string)}>
                  {conditionsList.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
                {formErrors.condition && <FormHelperText error>{formErrors.condition}</FormHelperText>}
              </FormControl>
            </Grid>

            {/* ── Density (READ-ONLY, AUTO-FILLED) ────────────── */}
            <Grid item xs={6}>
              <TextField fullWidth size="small" label="Density (g/cm³)" value={f.density}
                InputProps={{ readOnly: true }}
                sx={{ ...fieldSx, '& .MuiOutlinedInput-root': { ...fieldSx['& .MuiOutlinedInput-root'], bgcolor: alpha('#94a3b8', 0.04) } }} />
            </Grid>
          </Grid>

          <Divider sx={{ my: 2, borderColor: 'var(--border)' }} />

          {/* ── Form & Shape ─────────────────────────────────── */}
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.5 }}>
            Form &amp; Shape
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6}>
              <FormControl fullWidth size="small" sx={fieldSx}>
                <InputLabel>Form</InputLabel>
                <Select value={f.form} label="Form" onChange={e => handleFormChange(e.target.value as string)}>
                  <MenuItem value="">None</MenuItem>
                  {FORM_OPTIONS.map(fo => <MenuItem key={fo} value={fo}>{fo}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <TextField fullWidth size="small" label="Shape (Auto)" value={f.shape}
                InputProps={{ readOnly: true }}
                sx={{ ...fieldSx, '& .MuiOutlinedInput-root': { ...fieldSx['& .MuiOutlinedInput-root'], bgcolor: alpha('#94a3b8', 0.04) } }} />
            </Grid>
          </Grid>

          {/* ── Dimensions (Dynamic based on Form) ────────────── */}
          {dimFields.length > 0 && (<>
            <Divider sx={{ my: 2, borderColor: 'var(--border)' }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Dimensions
              </Typography>
              <ToggleButtonGroup
                size="small" exclusive
                value={unitSystem}
                onChange={(_, val) => { if (val) { setUnitSystem(val); setFDims({}); } }}
                sx={{ '& .MuiToggleButton-root': { fontSize: '0.65rem', fontWeight: 700, px: 1.5, py: 0.3,
                  textTransform: 'none', borderColor: 'var(--border)', borderRadius: 'var(--radius-sm) !important',
                  '&.Mui-selected': { bgcolor: 'var(--primary)', color: '#000', borderColor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-light)', color: '#000' } },
                  '&:not(.Mui-selected)': { color: 'var(--muted)', '&:hover': { bgcolor: 'var(--accent)' } },
                  '&:not(:first-of-type)': { ml: '4px' } } }}>
                <ToggleButton value="imperial">Imperial (in/ft)</ToggleButton>
                <ToggleButton value="metric">Metric (mm)</ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              {dimFields.map(df => (
                <Grid item xs={6} key={df.id}>
                  <TextField fullWidth size="small"
                    label={unitSystem === 'imperial' ? df.labelImperial : df.labelMetric}
                    type="number" value={fDims[df.id] || ''}
                    onChange={e => setFDims(prev => ({ ...prev, [df.id]: e.target.value }))}
                    sx={fieldSx} inputProps={{ step: 'any', min: 0 }} />
                </Grid>
              ))}
            </Grid>
          </>)}

          <Divider sx={{ my: 2, borderColor: 'var(--border)' }} />

          {/* ── Notes ────────────────────────────────────────── */}
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1.5 }}>
            Notes
          </Typography>
          <TextField fullWidth size="small" label="Notes" multiline minRows={3} value={f.notes}
            onChange={e => setF(prev => ({ ...prev, notes: e.target.value }))} sx={{ ...fieldSx, mb: 2 }} />

          {/* ── Save Button ──────────────────────────────────── */}
          <Button fullWidth variant="contained" onClick={handleSave} disabled={submitting}
            sx={{ bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-light)' }, textTransform: 'none',
              fontWeight: 700, borderRadius: 'var(--radius-sm)', height: 42, boxShadow: 'none', fontSize: '0.85rem', mt: 1 }}>
            {submitting ? 'Saving…' : editing ? 'Update Material' : 'Create Material'}
          </Button>
        </Box>
      </Drawer>

      {/* ═══ DELETE DIALOG ═════════════════════════════════════ */}
      <Drawer anchor="bottom" open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        PaperProps={{ sx: { p: 3, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxWidth: 480, mx: 'auto' } }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, mb: 1 }}>Delete Raw Material?</Typography>
        <Typography sx={{ fontSize: '0.8rem', color: 'var(--muted)', mb: 2 }}>
          {deleteTarget && (
            <>
              {deleteTarget.material_id && <Box component="span" sx={{ fontWeight: 700, color: 'var(--primary)', mr: 1 }}>{deleteTarget.material_id}</Box>}
              {deleteTarget.material_category} → {deleteTarget.material_grade} → {deleteTarget.condition}
            </>
          )}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button variant="outlined" onClick={() => setDeleteTarget(null)}
            sx={{ textTransform: 'none', borderRadius: 'var(--radius-sm)' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}
            sx={{ textTransform: 'none', borderRadius: 'var(--radius-sm)' }}>Delete</Button>
        </Box>
      </Drawer>

      {/* ═══ BULK DELETE DIALOG ═════════════════════════════════ */}
      <Dialog open={bulkDeleteDialogOpen} onClose={() => setBulkDeleteDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 'var(--radius)', maxWidth: 400 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem' }}>Delete Selected Materials?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            You are about to delete {selectedIds.size} raw material(s). This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setBulkDeleteDialogOpen(false)}
            sx={{ textTransform: 'none', borderRadius: 'var(--radius-sm)' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleBulkDelete}
            sx={{ textTransform: 'none', borderRadius: 'var(--radius-sm)' }}>Delete All</Button>
        </DialogActions>
      </Dialog>

      {/* ═══ SUCCESS SNACKBAR ═════════════════════════════════ */}
      <Snackbar open={!!successMsg} autoHideDuration={3000} onClose={() => setSuccessMsg('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="success" sx={{ borderRadius: 'var(--radius-sm)' }}>{successMsg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default RawMaterialMasterPage;
