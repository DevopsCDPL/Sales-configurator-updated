import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box, Typography, Button, TextField, InputAdornment, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Drawer, Select, MenuItem,
  FormControl, InputLabel, Grid, ToggleButton, ToggleButtonGroup, Tooltip, alpha,
  Skeleton, Alert, Snackbar, Divider, FormHelperText, Chip, Checkbox,
  Dialog, DialogTitle, DialogContent, DialogActions, Menu,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  ViewList as ViewListIcon, GridView as GridViewIcon, Close as CloseIcon,
  FileDownload as ExportIcon, Refresh as RefreshIcon, Clear as ClearIcon,
  Build as BuildIcon, Inventory as InventoryIcon, ContentCopy as CopyIcon,
  ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
  CloudUpload as UploadIcon, PictureAsPdf as PdfIcon, CheckCircle as CheckIcon,
  DeleteSweep as BulkDeleteIcon, WarningAmber as WarningIcon,
  MoreVert as MoreVertIcon, PowerSettingsNew as ToggleStatusIcon,
} from '@mui/icons-material';
import { partService, PartData } from '../services/partService';
import { rawMaterialService, RawMaterialData } from '../services/rawMaterialService';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';
// import './PartsMasterPage.module.css';

/* ═══════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════ */
const ROWS_PER_PAGE = 15;

/* ─── Dimension display format based on form ───────────────────────── */
const formatDimensions = (form: string, dimensions: Record<string, string> | null, unitSystem?: string | null): string => {
  if (!dimensions || !form) return '—';
  const d = dimensions;
  const isImperial = unitSystem === 'imperial';
  const v = (val: string | undefined) => isImperial ? `${val || '?'}"` : (val || '?');
  const suffix = isImperial ? '' : ' mm';
  switch (form) {
    case 'Plate':
    case 'Sheet':
      return `${v(d.length)} x ${v(d.width)} x ${v(d.thickness)}${suffix}`;
    case 'Rod':
      if (d.shape === 'Hex' || form.includes('Hex')) {
        return `AF ${v(d.across_flats)} x ${v(d.length)}${suffix}`;
      }
      return `Ø${v(d.diameter)} x ${v(d.length)}${suffix}`;
    case 'Hex Bar':
      return `AF ${v(d.across_flats)} x ${v(d.length)}${suffix}`;
    case 'Pipe':
      return `OD ${v(d.outer_diameter)} x ID ${v(d.inner_diameter)} x ${v(d.length)}${suffix}`;
    case 'Square Tube':
      return `${v(d.width)} x ${v(d.thickness)} x ${v(d.length)}${suffix}`;
    case 'Rectangular Tube':
      return `${v(d.width)} x ${v(d.height)} x ${v(d.thickness)} x ${v(d.length)}${suffix}`;
    case 'Flat Bar':
    case 'Flat':
      return `${v(d.width)} x ${v(d.thickness)} x ${v(d.length)}${suffix}`;
    case 'Square Bar':
      return `${v(d.side)} x ${v(d.length)}${suffix}`;
    default: {
      const vals = Object.values(d).filter(Boolean);
      if (!vals.length) return '—';
      if (isImperial) return vals.map(x => `${x}"`).join(' x ');
      return vals.join(' x ') + ' mm';
    }
  }
};

/* ─── helpers ─────────────────────────────────────────────────────── */
const COLORS = ['#1F7A63', '#3B82F6', '#16A34A', '#86efac', '#F59E0B', '#0EA5E9', '#EC4899', '#EF4444'];
const getColor = (i: number) => COLORS[i % COLORS.length];
const getInitials = (name: string) => {
  const w = (name || 'N').trim().split(' ');
  return (w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase();
};

/* ─── sub-components ──────────────────────────────────────────────── */
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

const StatusBadge: React.FC<{ active: boolean }> = ({ active }) => (
  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', px: '7px', py: '2px',
    borderRadius: 'var(--radius-sm)', bgcolor: active ? alpha('#16A34A', 0.06) : alpha('#94a3b8', 0.06) }}>
    <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: active ? '#16A34A' : 'var(--text-muted)' }} />
    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: active ? '#16A34A' : 'var(--text-muted)', lineHeight: 1 }}>
      {active ? 'Active' : 'Inactive'}
    </Typography>
  </Box>
);

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

const readOnlyFieldSx = {
  ...fieldSx,
  '& .MuiOutlinedInput-root': {
    ...fieldSx['& .MuiOutlinedInput-root'],
    bgcolor: alpha('#64748b', 0.04),
    '& input': { color: 'var(--muted-foreground)' },
  },
};

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
const PartsMasterPage: React.FC = () => {
  const { user } = useAuth();
  const canWrite = user?.role === 'main_admin' || user?.role === 'admin' || user?.role === 'platform_admin';

  /* ─── State ────────────────────────────────────────────────── */
  const [parts, setParts] = useState<PartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [page, setPage] = useState(1);
  const [operatorOptions, setOperatorOptions] = useState<string[]>([]);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<PartData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<PartData | null>(null);

  // Multi-select + bulk delete
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // 3-dot row menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuPart, setMenuPart] = useState<PartData | null>(null);

  // Lookups
  const [clients, setClients] = useState<any[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialData[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);

  // Raw material cascading filters (drawer)
  const [rmCategoryFilter, setRmCategoryFilter] = useState('');
  const [rmGradeFilter, setRmGradeFilter] = useState('');
  const [rmConditionFilter, setRmConditionFilter] = useState('');
  const [rmFormFilter, setRmFormFilter] = useState('');
  const [rmDimensionFilter, setRmDimensionFilter] = useState('');

  // File upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDrawing, setUploadingDrawing] = useState(false);

  // ─── Form fields (per specification) ──────────────────────────
  const [f, setF] = useState({
    // Section 1: Basic Part Information
    part_name: '',
    part_number: '',
    revision: 'R0',
    drawing_given_by_client: false,
    drawing_url: '',
    drawing_filename: '',
    client_id: '',
    vendor_id: '',
    description: '',
    // Section 2: Raw Material Specification (MANDATORY)
    raw_material_id: '',
    // Section 3: Auto-filled Material Details (READ-ONLY - populated from raw material)
    material_category: '',
    material_grade: '',
    condition: '',
    density: '',
    form: '',
    shape: '',
    dimensions: {} as Record<string, string>,
    unit_system: '',
    // User-editable field
    cost_per_unit: '',
    // Manufacturing Details
    manufacturing_type: '',
    operator_initials: '',
    cut_method: '',
    cut_length: '',
    lathe_ops_required: 'Yes',
    mill_ops_required: 'Yes',
    deburr_required: 'Yes',
    heat_treat_required: 'Yes',
    marking_required: 'Yes',
    final_qc_inspection_required: 'Yes',
    final_acceptance_required: 'Yes',
    anodize_type: '',
    anodize_thickness_spec: '',
    anodize_class: '',
    anodize_dye_color: '',
    anodize_seal: false,
    anodize_mask_threads: false,
    anodize_tumbled: false,
    anodize_scotch_brite: false,
    anodize_visual_inspection: 'Yes',
    anodize_alkaline_wash: 'Yes',
    anodize_masking: 'Yes',
    anodize_racking: 'Yes',
    anodize_secondary_cleaning: 'Yes',
    anodize_caustic_etch: 'Yes',
    anodize_acid_etch: 'Yes',
    anodize_deox_rinse: 'Yes',
    anodize_anodize_rinse: 'Yes',
    anodize_neutralize: 'Yes',
    anodize_dye: 'Yes',
    anodize_seal_rinse: 'Yes',
    anodize_dry: 'Yes',
    anodize_un_rack: 'Yes',
    anodize_technical_inspect: 'Yes',
    anodize_commercial_inspection: 'Yes',
    anodize_package: 'Yes',
    anodize_final_acceptance: 'Yes',
    anodize_product_release: 'Yes',
    // Hidden/future fields
    notes: '',
  });

  /* ─── Load data ────────────────────────────────────────────── */
  useEffect(() => { loadParts(); loadLookups(); }, []);
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter]);

  const loadParts = async () => {
    try { setLoading(true); setError(null); const data = await partService.getAll(); setParts(data || []); }
    catch (err: any) { setError(err.response?.data?.message || 'Error loading parts'); }
    finally { setLoading(false); }
  };

  const loadLookups = async () => {
    try {
      const cRes = await api.get('/clients').catch(() => ({ data: { data: [] } }));
      const clientData = cRes?.data?.data || cRes?.data || [];
      setClients(Array.isArray(clientData) ? clientData : []);
    } catch { /* non-critical */ }
    try {
      const rmData = await rawMaterialService.getAll();
      setRawMaterials(Array.isArray(rmData) ? rmData.filter((rm: RawMaterialData) => rm.is_active) : []);
    } catch { /* non-critical */ }
    try {
      const vRes = await api.get('/vendors').catch(() => ({ data: { data: [] } }));
      const vendorData = vRes?.data?.data || vRes?.data || [];
      setVendors(Array.isArray(vendorData) ? vendorData : []);
    } catch { /* non-critical */ }
    try {
      const sysRes = await api.get('/settings/system').catch(() => ({ data: {} }));
      const sysSettings = sysRes?.data?.settings || sysRes?.data?.data || sysRes?.data || {};
      const operatorSrc = sysSettings.productionOperator || '';
      const opts = operatorSrc ? operatorSrc.split('\n').map((s: string) => s.trim()).filter(Boolean).slice(0, 5) : [];
      setOperatorOptions(opts);
    } catch { /* non-critical */ }
  };

  /* ─── Metrics ──────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const total = parts.length;
    const active = parts.filter(p => p.is_active).length;
    const withClient = parts.filter(p => p.client_id).length;
    const withDrawing = parts.filter(p => p.drawing_url).length;
    return { total, active, withClient, withDrawing };
  }, [parts]);

  /* ─── Filters ──────────────────────────────────────────────── */
  const hasFilters = searchQuery || statusFilter !== 'all';
  const clearFilters = useCallback(() => {
    setSearchQuery(''); setStatusFilter('all'); setPage(1);
  }, []);

  const filtered = useMemo(() => {
    return parts.filter(p => {
      const q = searchQuery.toLowerCase();
      const ms = !q || (p.part_name || '').toLowerCase().includes(q) ||
        (p.part_number || '').toLowerCase().includes(q) || (p.material_grade || '').toLowerCase().includes(q) ||
        (p.part_id_seq || '').toLowerCase().includes(q);
      const mS = statusFilter === 'all' || (statusFilter === 'active' ? p.is_active : !p.is_active);
      return ms && mS;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [parts, searchQuery, statusFilter]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, page]);

  /* ─── Format Raw Material dropdown display ─────────────────── */
  const formatRawMaterialOption = (rm: RawMaterialData): string => {
    // Format: "Material Category | Grade | Form | Dimensions | Condition"
    const dimStr = formatDimensions(rm.form || '', rm.dimensions || null, rm.unit_system);
    return `${rm.material_category} | ${rm.material_grade} | ${rm.form || 'N/A'} | ${dimStr} | ${rm.condition || 'N/A'}`;
  };

  /* ─── Form handlers ────────────────────────────────────────── */
  const resetForm = () => {
    setF({
      part_name: '', part_number: '', revision: 'R0',
      drawing_given_by_client: false, drawing_url: '', drawing_filename: '',
      client_id: '', vendor_id: '', description: '', raw_material_id: '',
      material_category: '', material_grade: '', condition: '',
      density: '', form: '', shape: '', dimensions: {}, unit_system: '',
      cost_per_unit: '', notes: '',
      manufacturing_type: '', operator_initials: '', cut_method: '', cut_length: '',
      lathe_ops_required: 'Yes', mill_ops_required: 'Yes', deburr_required: 'Yes',
      heat_treat_required: 'Yes', marking_required: 'Yes',
      final_qc_inspection_required: 'Yes', final_acceptance_required: 'Yes',
      anodize_type: '', anodize_thickness_spec: '', anodize_class: '', anodize_dye_color: '',
      anodize_seal: false, anodize_mask_threads: false, anodize_tumbled: false, anodize_scotch_brite: false,
      anodize_visual_inspection: 'Yes', anodize_alkaline_wash: 'Yes', anodize_masking: 'Yes',
      anodize_racking: 'Yes', anodize_secondary_cleaning: 'Yes', anodize_caustic_etch: 'Yes',
      anodize_acid_etch: 'Yes', anodize_deox_rinse: 'Yes', anodize_anodize_rinse: 'Yes',
      anodize_neutralize: 'Yes', anodize_dye: 'Yes', anodize_seal_rinse: 'Yes',
      anodize_dry: 'Yes', anodize_un_rack: 'Yes', anodize_technical_inspect: 'Yes',
      anodize_commercial_inspection: 'Yes', anodize_package: 'Yes', anodize_final_acceptance: 'Yes',
      anodize_product_release: 'Yes',
    });
    setFormErrors({});
  };

  const handleOpenAdd = () => {
    setEditingPart(null);
    resetForm();
    setRmCategoryFilter('');
    setRmGradeFilter('');
    setRmConditionFilter('');
    setRmFormFilter('');
    setRmDimensionFilter('');
    setDrawerOpen(true);
  };

  const handleOpenEdit = (p: PartData) => {
    setEditingPart(p);
    setF({
      part_name: p.part_name || '',
      part_number: p.part_number || '',
      revision: p.revision || 'R0',
      drawing_given_by_client: p.drawing_given_by_client || false,
      drawing_url: p.drawing_url || '',
      drawing_filename: p.drawing_url ? p.drawing_url.split('/').pop() || '' : '',
      client_id: p.client_id || '',
      vendor_id: p.vendor_id || '',
      description: p.description || '',
      raw_material_id: p.raw_material_id || '',
      material_category: p.material_category || '',
      material_grade: p.material_grade || '',
      condition: p.condition || '',
      density: p.density ? String(p.density) : '',
      form: p.form || '',
      shape: p.shape || '',
      dimensions: p.dimensions || {},
      unit_system: (p.raw_material_id ? rawMaterials.find(r => r.id === p.raw_material_id)?.unit_system : '') || '',
      cost_per_unit: p.cost_per_unit ? String(p.cost_per_unit) : '',
      notes: p.notes || '',
      manufacturing_type: (p as any).manufacturing_type || '',
      operator_initials: (p as any).operator_initials || '',
      cut_method: (p as any).cut_method || '',
      cut_length: (p as any).cut_length || '',
      lathe_ops_required: (p as any).lathe_ops_required || 'Yes',
      mill_ops_required: (p as any).mill_ops_required || 'Yes',
      deburr_required: (p as any).deburr_required || 'Yes',
      heat_treat_required: (p as any).heat_treat_required || 'Yes',
      marking_required: (p as any).marking_required || 'Yes',
      final_qc_inspection_required: (p as any).final_qc_inspection_required || 'Yes',
      final_acceptance_required: (p as any).final_acceptance_required || 'Yes',
      anodize_type: (p as any).anodize_type || '',
      anodize_thickness_spec: (p as any).anodize_thickness_spec || '',
      anodize_class: (p as any).anodize_class || '',
      anodize_dye_color: (p as any).anodize_dye_color || '',
      anodize_seal: (p as any).anodize_seal || false,
      anodize_mask_threads: (p as any).anodize_mask_threads || false,
      anodize_tumbled: (p as any).anodize_tumbled || false,
      anodize_scotch_brite: (p as any).anodize_scotch_brite || false,
      anodize_visual_inspection: (p as any).anodize_visual_inspection || 'Yes',
      anodize_alkaline_wash: (p as any).anodize_alkaline_wash || 'Yes',
      anodize_masking: (p as any).anodize_masking || 'Yes',
      anodize_racking: (p as any).anodize_racking || 'Yes',
      anodize_secondary_cleaning: (p as any).anodize_secondary_cleaning || 'Yes',
      anodize_caustic_etch: (p as any).anodize_caustic_etch || 'Yes',
      anodize_acid_etch: (p as any).anodize_acid_etch || 'Yes',
      anodize_deox_rinse: (p as any).anodize_deox_rinse || 'Yes',
      anodize_anodize_rinse: (p as any).anodize_anodize_rinse || 'Yes',
      anodize_neutralize: (p as any).anodize_neutralize || 'Yes',
      anodize_dye: (p as any).anodize_dye || 'Yes',
      anodize_seal_rinse: (p as any).anodize_seal_rinse || 'Yes',
      anodize_dry: (p as any).anodize_dry || 'Yes',
      anodize_un_rack: (p as any).anodize_un_rack || 'Yes',
      anodize_technical_inspect: (p as any).anodize_technical_inspect || 'Yes',
      anodize_commercial_inspection: (p as any).anodize_commercial_inspection || 'Yes',
      anodize_package: (p as any).anodize_package || 'Yes',
      anodize_final_acceptance: (p as any).anodize_final_acceptance || 'Yes',
      anodize_product_release: (p as any).anodize_product_release || 'Yes',
    });
    setFormErrors({});
    // Pre-populate cascading filters from the existing raw material
    if (p.raw_material_id) {
      setRmCategoryFilter(p.material_category || '');
      setRmGradeFilter(p.material_grade  || '');
      setRmConditionFilter(p.condition || '');
      setRmFormFilter(p.form || '');
      // Convert dimensions object to a string (e.g., JSON or custom format)
      const dimensionsString = p.dimensions
        ? Object.entries(p.dimensions)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ') // Format as "key: value, key: value"
      : '';

      setRmDimensionFilter(dimensionsString); // Set the formatted dimensions string
    } else {
      setRmCategoryFilter('');
      setRmGradeFilter('');
      setRmConditionFilter('');
      setRmFormFilter('');
      setRmDimensionFilter('');
    }
    setDrawerOpen(true);
  };

  // ─── CRITICAL: Handle Raw Material Selection ──────────────────
  // When raw material is selected, ALL material fields are auto-populated
  // and become READ-ONLY. User CANNOT edit these fields.
  const handleRawMaterialChange = (rmId: string) => {
    if (!rmId) {
      // Clear all material fields if no raw material selected
      setF(prev => ({
        ...prev,
        raw_material_id: '',
        material_category: '',
        material_grade: '',
        condition: '',
        density: '',
        form: '',
        shape: '',
        dimensions: {},
        unit_system: '',
      }));
      return;
    }

    const rm = rawMaterials.find(r => r.id === rmId);
    if (!rm) return;

    // Auto-populate ALL material fields from Raw Material (READ-ONLY)
    setF(prev => ({
      ...prev,
      raw_material_id: rmId,
      material_category: rm.material_category || '',
      material_grade: rm.material_grade || '',
      condition: rm.condition || '',
      density: rm.density ? String(rm.density) : '',
      form: rm.form || '',
      shape: rm.shape || '',
      dimensions: rm.dimensions || {},
      unit_system: rm.unit_system || '',
    }));
  };

  // ─── File Upload Handler ──────────────────────────────────────
  const handleDrawingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setFormErrors(prev => ({ ...prev, drawing: 'Only PDF files are allowed' }));
      return;
    }

    setUploadingDrawing(true);
    try {
      const result = await partService.uploadDrawing(file, editingPart?.id);
      setF(prev => ({
        ...prev,
        drawing_url: result.url,
        drawing_filename: result.filename,
      }));
      setFormErrors(prev => {
        const { drawing, ...rest } = prev;
        return rest;
      });
    } catch (err: any) {
      setFormErrors(prev => ({ ...prev, drawing: err.response?.data?.message || 'Upload failed' }));
    } finally {
      setUploadingDrawing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── Save Handler with Validation ─────────────────────────────
  const handleSave = async () => {
    const errors: Record<string, string> = {};

    // SECTION 7: VALIDATION RULES
    // 1. Raw Material must be selected
    if (!f.raw_material_id) errors.raw_material_id = 'Raw Material must be selected';
    // 2. Part Name mandatory
    if (!f.part_name.trim()) errors.part_name = 'Part Name is required';
    // 3. Part Number, Revision, Drawing Given by Client, Client - all optional
    // 4. Drawing optional - no validation needed

    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        part_name: f.part_name.trim(),
        part_number: f.part_number.trim() || null,
        revision: f.revision || null,
        drawing_given_by_client: f.drawing_given_by_client,
        drawing_url: f.drawing_url || null,
        client_id: f.client_id || null,
        vendor_id: f.vendor_id || null,
        description: f.description || null,
        raw_material_id: f.raw_material_id,
        // Material fields are populated server-side from raw_material_id
        notes: f.notes || null,
        cost_per_unit: f.cost_per_unit ? parseFloat(f.cost_per_unit) : null,
        // Default values for weight/cost (can be enhanced later)
        quantity: 1,
        weight_unit: 'Kg',
        cost_type: 'Per Kg',
        cost_rate: 0,
        manufacturing_type: f.manufacturing_type || null,
        operator_initials: f.operator_initials || null,
        cut_method: f.cut_method || null,
        cut_length: f.cut_length || null,
        lathe_ops_required: f.lathe_ops_required,
        mill_ops_required: f.mill_ops_required,
        deburr_required: f.deburr_required,
        heat_treat_required: f.heat_treat_required,
        marking_required: f.marking_required,
        final_qc_inspection_required: f.final_qc_inspection_required,
        final_acceptance_required: f.final_acceptance_required,
        anodize_type: f.anodize_type,
        anodize_thickness_spec: f.anodize_thickness_spec,
        anodize_class: f.anodize_class,
        anodize_dye_color: f.anodize_dye_color,
        anodize_seal: f.anodize_seal,
        anodize_mask_threads: f.anodize_mask_threads,
        anodize_tumbled: f.anodize_tumbled,
        anodize_scotch_brite: f.anodize_scotch_brite,
        anodize_visual_inspection: f.anodize_visual_inspection,
        anodize_alkaline_wash: f.anodize_alkaline_wash,
        anodize_masking: f.anodize_masking,
        anodize_racking: f.anodize_racking,
        anodize_secondary_cleaning: f.anodize_secondary_cleaning,
        anodize_caustic_etch: f.anodize_caustic_etch,
        anodize_acid_etch: f.anodize_acid_etch,
        anodize_deox_rinse: f.anodize_deox_rinse,
        anodize_anodize_rinse: f.anodize_anodize_rinse,
        anodize_neutralize: f.anodize_neutralize,
        anodize_dye: f.anodize_dye,
        anodize_seal_rinse: f.anodize_seal_rinse,
        anodize_dry: f.anodize_dry,
        anodize_un_rack: f.anodize_un_rack,
        anodize_technical_inspect: f.anodize_technical_inspect,
        anodize_commercial_inspection: f.anodize_commercial_inspection,
        anodize_package: f.anodize_package,
        anodize_final_acceptance: f.anodize_final_acceptance,
        anodize_product_release: f.anodize_product_release,
      };

      if (editingPart) {
        await partService.update(editingPart.id, payload);
        setSuccessMsg('Part updated successfully');
      } else {
        await partService.create(payload);
        setSuccessMsg('Part created successfully');
      }
      setDrawerOpen(false);
      setEditingPart(null);
      loadParts();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Error saving part';
      setFormErrors({ _server: msg });
    } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await partService.delete(deleteTarget.id);
      setSuccessMsg('Part deleted');
      setDeleteTarget(null);
      loadParts();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error deleting');
      setDeleteTarget(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    try { await partService.duplicate(id); setSuccessMsg('Part duplicated'); loadParts(); }
    catch (err: any) { setError(err.response?.data?.message || 'Error duplicating'); }
  };

  /* ─── Multi-select helpers ─────────────────────────────────── */
  const toggleSelect = (id: string) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (paginated.every(p => prev.has(p.id))) { paginated.forEach(p => next.delete(p.id)); }
      else { paginated.forEach(p => next.add(p.id)); }
      return next;
    });
  };
  const allPageSelected = paginated.length > 0 && paginated.every(p => selected.has(p.id));
  const somePageSelected = paginated.some(p => selected.has(p.id));

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    let success = 0;
    let fail = 0;
    for (const id of selected) {
      try { await partService.delete(id); success++; } catch { fail++; }
    }
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelected(new Set());
    if (fail === 0) setSuccessMsg(`${success} part${success > 1 ? 's' : ''} deleted`);
    else setError(`Deleted ${success}, failed ${fail}`);
    loadParts();
  };

  const handleToggleStatus = async (id: string) => {
    try { await partService.toggleStatus(id); loadParts(); }
    catch (err: any) { setError(err.response?.data?.message || 'Error toggling status'); }
  };

  const handleExport = () => {
    const headers = ['Part ID', 'Part Name', 'Part Number', 'Drawing Revision', 'Client', 'Category', 'Grade', 'Form', 'Dimensions', 'Drawing', 'Status'];
    const rows = filtered.map(p => [
      p.part_id_seq || '', p.part_name, p.part_number || '', p.revision || 'R0',
      p.client?.client_name || '', p.material_category || '', p.material_grade || '',
      p.form || '', formatDimensions(p.form || '', p.dimensions),
      p.drawing_url ? 'Yes' : 'No', p.is_active ? 'Active' : 'Inactive',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `parts_master_${dayjs().format('YYYY-MM-DD')}.csv`; a.click();
  };

  /* ═══ RENDER ════════════════════════════════════════════════════ */
  return (
    <Box sx={{ pb: 4 }} className="animate-fadeIn">

      {/* ═══ HEADER ═══════════════════════════════════════════════ */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '20px', flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--foreground)', letterSpacing: '-0.025em', lineHeight: 1.2 }}>
            Parts Master
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'var(--muted)', mt: '2px' }}>
            Manage parts linked to Raw Material Master
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {selected.size > 0 && canWrite && (
            <Button variant="outlined" size="small" color="error" startIcon={<BulkDeleteIcon sx={{ fontSize: 15 }} />}
              onClick={() => setBulkDeleteOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', height: 34, borderRadius: 'var(--radius-sm)',
                borderColor: '#EF4444', color: '#EF4444',
                '&:hover': { bgcolor: alpha('#EF4444', 0.06), borderColor: '#DC2626' } }}>
              Delete {selected.size} selected
            </Button>
          )}
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={loadParts}
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
          {canWrite && (
            <Button variant="contained" startIcon={<AddIcon sx={{ fontSize: 17 }} />} onClick={handleOpenAdd}
              sx={{ bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-light)' }, textTransform: 'none',
                fontWeight: 700, borderRadius: 'var(--radius-sm)', px: 2, height: 34, boxShadow: 'none', fontSize: '0.78rem' }}>
              Create Part
            </Button>
          )}
        </Box>
      </Box>

      {/* ═══ STAT CARDS ══════════════════════════════════════════ */}
      <Box sx={{ display: 'flex', gap: '14px', mb: '20px', flexWrap: 'wrap' }}>
        <MiniStatCard icon={<BuildIcon sx={{ fontSize: 20, color: '#0EA5E9' }} />} label="Total Parts" value={stats.total} borderColor="#0EA5E9" />
        <MiniStatCard icon={<InventoryIcon sx={{ fontSize: 20, color: '#16A34A' }} />} label="Active Parts" value={stats.active} borderColor="#16A34A" />
        <MiniStatCard icon={<CheckIcon sx={{ fontSize: 20, color: '#3B82F6' }} />} label="With Client" value={stats.withClient} borderColor="#3B82F6" />
        <MiniStatCard icon={<PdfIcon sx={{ fontSize: 20, color: '#F59E0B' }} />} label="With Drawing" value={stats.withDrawing} borderColor="#F59E0B" />
      </Box>

      {error && <Alert severity="error" sx={{ mb: '20px', borderRadius: 'var(--radius-sm)' }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ═══ FILTER TOOLBAR ══════════════════════════════════════ */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '20px', flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="Search name, part #, grade, ID…"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          sx={{ flex: '1 1 320px', maxWidth: 400,
            '& .MuiOutlinedInput-root': { borderRadius: 'var(--radius)', fontSize: '0.8rem', height: 38, bgcolor: 'var(--card)',
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' } } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 17, color: 'var(--muted)' }} /></InputAdornment> }} />
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
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
          <ToggleButtonGroup size="small" value={viewMode} exclusive onChange={(_, v) => v && setViewMode(v)}
            sx={{ '& .MuiToggleButton-root': { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm) !important', width: 38, height: 38, p: 0,
              transition: 'all 0.15s',
              '&.Mui-selected': { bgcolor: 'var(--primary)', color: '#fff', borderColor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-light)' } },
              '&:not(.Mui-selected):hover': { bgcolor: 'var(--accent)' },
              '&:not(:first-of-type)': { ml: '6px' } } }}>
            <ToggleButton value="table"><ViewListIcon sx={{ fontSize: 17 }} /></ToggleButton>
            <ToggleButton value="grid"><GridViewIcon sx={{ fontSize: 17 }} /></ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* ═══ TABLE VIEW ════════════════════════════════════════════ */}
      {viewMode === 'table' && (
        <TableContainer sx={{ borderRadius: 'var(--radius)', border: '1px solid var(--border)', bgcolor: 'var(--card)',
          boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          {loading ? (
            <Table size="small"><TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => (
                  <TableCell key={j} sx={{ px: '14px' }}><Skeleton height={22} /></TableCell>
                ))}</TableRow>
              ))}
            </TableBody></Table>
          ) : filtered.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: 'var(--accent)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 1.5 }}>
                <BuildIcon sx={{ fontSize: 28, color: 'var(--muted)' }} />
              </Box>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--secondary-foreground)', mb: 0.5 }}>
                {hasFilters ? 'No parts match your filters' : 'No parts yet'}
              </Typography>
              <Typography sx={{ fontSize: '0.78rem', color: 'var(--muted)', mb: 2 }}>
                {hasFilters ? 'Try adjusting your filter criteria.' : 'Add your first part to get started.'}
              </Typography>
              {hasFilters ? (
                <Button size="small" variant="outlined" onClick={clearFilters}
                  sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 'var(--radius-sm)', borderColor: 'var(--border)', color: 'var(--secondary-foreground)' }}>Clear Filters</Button>
              ) : canWrite ? (
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}
                  sx={{ bgcolor: 'var(--primary)', textTransform: 'none', fontWeight: 700, fontSize: '0.78rem',
                    borderRadius: 'var(--radius-sm)', boxShadow: 'none', '&:hover': { bgcolor: 'var(--primary-light)' } }}>Create Part</Button>
              ) : null}
            </Box>
          ) : (
            <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: '44px' }} />
                <col style={{ width: '52px' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '52px' }} />
              </colgroup>
              <TableHead>
                <TableRow sx={{ bgcolor: 'var(--accent)',
                  '& th': { fontWeight: 700, fontSize: '0.65rem', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.08em',
                    borderBottom: '1px solid var(--border)', py: '10px', px: '10px', height: 48, verticalAlign: 'middle', position: 'sticky', top: 0, bgcolor: 'var(--accent)', zIndex: 1 } }}>
                  <TableCell padding="checkbox" sx={{ width: 44, px: '10px' }}>
                    <Checkbox size="small" checked={allPageSelected} indeterminate={!allPageSelected && somePageSelected}
                      onChange={toggleSelectAll}
                      sx={{ color: 'var(--muted)', '&.Mui-checked': { color: 'var(--primary)' }, '&.MuiCheckbox-indeterminate': { color: 'var(--primary)' } }} />
                  </TableCell>
                  <TableCell sx={{ width: 52, textAlign: 'center', px: '6px' }}>S.No</TableCell>
                  <TableCell sx={{ width: '22%' }}>Part</TableCell>
                  <TableCell sx={{ width: '10%' }}>Part ID</TableCell>
                  <TableCell sx={{ width: '10%' }}>Raw MID</TableCell>
                  <TableCell sx={{ width: '14%' }}>Material</TableCell>
                  <TableCell sx={{ width: '8%' }}>Form</TableCell>
                  <TableCell sx={{ width: '18%' }}>Client</TableCell>
                  <TableCell sx={{ width: 52, textAlign: 'center', px: '6px' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.map((p, idx) => {
                  const color = getColor(idx);
                  const isSelected = selected.has(p.id);
                  return (
                    <TableRow key={p.id} hover selected={isSelected}
                      sx={{ cursor: 'pointer',
                        bgcolor: idx % 2 === 1 ? alpha('#F1F5F9', 0.5) : 'transparent',
                        borderLeft: '3px solid transparent', transition: 'all 0.15s ease',
                        '&:hover': { bgcolor: alpha('#1F7A63', 0.03), borderLeftColor: 'var(--primary)' },
                        '&.Mui-selected': { bgcolor: alpha('#1F7A63', 0.03) },
                        '& td': { fontSize: '0.8rem', color: 'var(--card-foreground)', py: '8px', px: '10px', borderBottom: '1px solid var(--border-light)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' } }}
                      onClick={() => handleOpenEdit(p)}>
                      <TableCell padding="checkbox" onClick={e => e.stopPropagation()} sx={{ px: '10px' }}>
                        <Checkbox size="small" checked={isSelected} onChange={() => toggleSelect(p.id)}
                          sx={{ color: 'var(--muted)', '&.Mui-checked': { color: 'var(--primary)' } }} />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'center', px: '6px' }}>
                        <Typography sx={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {(page - 1) * ROWS_PER_PAGE + idx + 1}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ overflow: 'hidden' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                          <Box sx={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, bgcolor: color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography sx={{ color: '#fff', fontSize: '0.7rem', fontWeight: 700, lineHeight: 1 }}>{getInitials(p.part_name)}</Typography>
                          </Box>
                          <Box sx={{ minWidth: 0, overflow: 'hidden', flex: 1 }}>
                            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.part_name}</Typography>
                            <Typography sx={{ fontSize: '0.68rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.part_number || '—'}</Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.part_id_seq || '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--primary)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.rawMaterial?.material_id || '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.material_category || '—'}</Typography>
                        <Typography sx={{ fontSize: '0.65rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.material_grade || ''}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.form || '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.client?.client_name || '—'}</Typography>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()} sx={{ textAlign: 'center', px: '6px !important' }}>
                        <IconButton size="small"
                          onClick={e => { setMenuAnchor(e.currentTarget); setMenuPart(p); }}
                          sx={{ color: 'var(--muted)', width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                            '&:hover': { bgcolor: 'var(--accent)', color: 'var(--foreground)' } }}>
                          <MoreVertIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      )}

      {/* ═══ ROW ACTION MENU ════════════════════════════════════ */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => { setMenuAnchor(null); setMenuPart(null); }}
        PaperProps={{ sx: { minWidth: 160, borderRadius: 'var(--radius)', border: '1px solid var(--border)',
          boxShadow: 'var(--shadow)', py: '4px' } }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
        <MenuItem onClick={() => { if (menuPart) handleOpenEdit(menuPart); setMenuAnchor(null); setMenuPart(null); }}
          sx={{ fontSize: '0.8rem', gap: '10px', py: '8px', color: 'var(--foreground)' }}>
          <EditIcon sx={{ fontSize: 16, color: 'var(--muted)' }} /> Edit
        </MenuItem>
        <MenuItem onClick={() => { if (menuPart) handleDuplicate(menuPart.id); setMenuAnchor(null); setMenuPart(null); }}
          sx={{ fontSize: '0.8rem', gap: '10px', py: '8px', color: 'var(--foreground)' }}>
          <CopyIcon sx={{ fontSize: 16, color: 'var(--muted)' }} /> Duplicate
        </MenuItem>
        <MenuItem onClick={() => { if (menuPart) handleToggleStatus(menuPart.id); setMenuAnchor(null); setMenuPart(null); }}
          sx={{ fontSize: '0.8rem', gap: '10px', py: '8px', color: 'var(--foreground)' }}>
          <ToggleStatusIcon sx={{ fontSize: 16, color: 'var(--muted)' }} />
          {menuPart?.is_active ? 'Set Inactive' : 'Set Active'}
        </MenuItem>
        <Divider sx={{ my: '4px' }} />
        <MenuItem onClick={() => { if (menuPart) setDeleteTarget(menuPart); setMenuAnchor(null); setMenuPart(null); }}
          sx={{ fontSize: '0.8rem', gap: '10px', py: '8px', color: '#DC2626' }}>
          <DeleteIcon sx={{ fontSize: 16, color: '#DC2626' }} /> Delete
        </MenuItem>
      </Menu>

      {/* ═══ GRID VIEW ═════════════════════════════════════════════ */}
      {viewMode === 'grid' && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
          {loading ? Array.from({ length: 6 }).map((_, i) => (
            <Box key={i} sx={{ flex: '1 1 280px', maxWidth: 340, p: '16px', bgcolor: 'var(--card)', borderRadius: 'var(--radius)',
              border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
              <Skeleton height={28} width="60%" /><Skeleton height={18} /><Skeleton height={18} width="80%" />
            </Box>
          )) : filtered.length === 0 ? (
            <Box sx={{ width: '100%', py: 8, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--secondary-foreground)' }}>No parts found</Typography>
            </Box>
          ) : paginated.map((p, idx) => {
            const color = getColor(idx);
            return (
              <Box key={p.id} onClick={() => handleOpenEdit(p)}
                sx={{ flex: '1 1 280px', maxWidth: 340, p: '16px', bgcolor: 'var(--card)', borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)', borderLeft: `3px solid ${color}`,
                  boxShadow: 'var(--shadow-sm)', cursor: 'pointer', transition: 'all 0.2s',
                  '&:hover': { boxShadow: 'var(--shadow)', borderLeftColor: 'var(--primary)' } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '10px' }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Typography sx={{ color: '#fff', fontSize: '0.72rem', fontWeight: 700 }}>{getInitials(p.part_name)}</Typography>
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.part_name}</Typography>
                    <Typography sx={{ fontSize: '0.68rem', color: 'var(--muted)' }}>{p.part_id_seq || p.part_number || 'No ID'}</Typography>
                  </Box>
                  <StatusBadge active={p.is_active} />
                </Box>
                <Box sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap', mb: '8px' }}>
                  <Chip label={p.revision || 'R0'} size="small" sx={{ fontWeight: 600, fontSize: '0.6rem', height: 20 }} />
                  {p.material_grade && (
                    <Chip label={p.material_grade} size="small" sx={{ fontWeight: 600, fontSize: '0.6rem', height: 20, bgcolor: alpha('#3B82F6', 0.08), color: '#3B82F6' }} />
                  )}
                  {p.drawing_url && (
                    <Chip icon={<PdfIcon sx={{ fontSize: 12 }} />} label="Drawing" size="small" sx={{ fontWeight: 600, fontSize: '0.6rem', height: 20, bgcolor: alpha('#16A34A', 0.08), color: '#16A34A' }} />
                  )}
                </Box>
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                  {p.client?.client_name || 'No client'} · {p.form || 'No form'}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ═══ PAGINATION ═══════════════════════════════════════════ */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: '16px', px: '4px' }}>
          <Typography sx={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            Showing {((page - 1) * ROWS_PER_PAGE) + 1}–{Math.min(page * ROWS_PER_PAGE, filtered.length)} of {filtered.length}
          </Typography>
          <Box sx={{ display: 'flex', gap: '4px' }}>
            <IconButton size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              sx={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', '&:hover': { borderColor: 'var(--primary)' } }}>
              <ChevronLeftIcon sx={{ fontSize: 16 }} />
            </IconButton>
            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, page - 3), Math.min(totalPages, page + 2)).map(pg => (
              <Button key={pg} size="small" onClick={() => setPage(pg)}
                sx={{ minWidth: 32, height: 32, borderRadius: 'var(--radius-sm)', fontSize: '0.72rem', fontWeight: 700,
                  ...(pg === page ? { bgcolor: 'var(--primary)', color: '#fff', '&:hover': { bgcolor: 'var(--primary-light)' } }
                    : { color: 'var(--muted)', border: '1px solid var(--border)', '&:hover': { borderColor: 'var(--primary)' } }) }}>
                {pg}
              </Button>
            ))}
            <IconButton size="small" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              sx={{ width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', '&:hover': { borderColor: 'var(--primary)' } }}>
              <ChevronRightIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        </Box>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          ADD/EDIT DRAWER - Per Specification
          ═══════════════════════════════════════════════════════════════ */}
      <Drawer anchor="right" open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditingPart(null); }}
        sx={{ zIndex: 1300 }}
        PaperProps={{ sx: { width: { xs: '100%', sm: 640, md: 720 }, bgcolor: 'var(--bg-surface)', borderLeft: '1px solid var(--border)' } }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <Box sx={{ p: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--foreground)' }}>
                {editingPart ? 'Edit Part' : 'Add New Part'}
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                {editingPart?.part_id_seq ? `Part ID: ${editingPart.part_id_seq}` : 'Part ID will be auto-generated (PRT-XXXXX)'}
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => { setDrawerOpen(false); setEditingPart(null); }}
              sx={{ color: 'var(--muted)', '&:hover': { color: 'var(--foreground)' } }}>
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>

          {/* Body */}
          <Box sx={{ flex: 1, overflowY: 'auto', p: '20px' }}>
            {formErrors._server && <Alert severity="error" sx={{ mb: '16px', borderRadius: 'var(--radius-sm)' }}>{formErrors._server}</Alert>}

            {/* ══════════════════════════════════════════════════════════
                SECTION 1: BASIC PART INFORMATION
                ══════════════════════════════════════════════════════════ */}
            <Box sx={{ mb: '24px' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em', mb: '12px', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>1</Box>
                Basic Part Information
              </Typography>

              <Grid container spacing={1.5}>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Part Name *" value={f.part_name}
                    onChange={e => setF(p => ({ ...p, part_name: e.target.value }))}
                    error={!!formErrors.part_name} helperText={formErrors.part_name} sx={fieldSx} />
                </Grid>
                <Grid item xs={7}>
                  <TextField fullWidth size="small" label="Part Number / Drawing No" value={f.part_number}
                    onChange={e => setF(p => ({ ...p, part_number: e.target.value }))}
                    sx={fieldSx} />
                </Grid>
                <Grid item xs={5}>
                  <TextField fullWidth size="small" label="Drawing Revision" value={f.revision}
                    onChange={e => setF(p => ({ ...p, revision: e.target.value }))}
                    sx={fieldSx} />
                </Grid>
                <Grid item xs={6}>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel>Drawing Given by Client</InputLabel>
                    <Select value={f.drawing_given_by_client ? 'yes' : 'no'} label="Drawing Given by Client"
                      onChange={e => setF(p => ({ ...p, drawing_given_by_client: e.target.value === 'yes' }))}>
                      <MenuItem value="yes">Yes</MenuItem>
                      <MenuItem value="no">No</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf"
                    onChange={handleDrawingUpload}
                    hidden
                    aria-label="Upload Drawing PDF"
                  />
                  {f.drawing_url ? (
                    <Box
                      sx={{
                        ...fieldSx,
                        display: 'flex', alignItems: 'center', gap: 1,
                        height: 40, px: '14px',
                        bgcolor: alpha('#16A34A', 0.05),
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${alpha('#16A34A', 0.3)}`,
                      }}
                    >
                      <PdfIcon sx={{ fontSize: 18, color: '#DC2626' }} />
                      <Typography sx={{ fontSize: '0.8rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--foreground)' }}>
                        {f.drawing_filename || 'Drawing uploaded'}
                      </Typography>
                      <IconButton size="small" onClick={() => setF(p => ({ ...p, drawing_url: '', drawing_filename: '' }))}
                        sx={{ width: 24, height: 24, color: 'var(--muted)', p: 0 }}>
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  ) : (
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={uploadingDrawing ? null : <UploadIcon sx={{ fontSize: 16 }} />}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingDrawing}
                      sx={{
                        textTransform: 'none',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        height: 40,
                        borderColor: 'var(--border)',
                        color: 'var(--muted)',
                        bgcolor: 'var(--accent)',
                        borderRadius: 'var(--radius-sm)',
                        justifyContent: 'flex-start',
                        px: '14px',
                        '&:hover': { borderColor: 'var(--primary)', color: 'var(--primary)', bgcolor: 'var(--accent)' },
                      }}
                    >
                      {uploadingDrawing ? 'Uploading...' : 'Upload Drawing (PDF)'}
                    </Button>
                  )}
                  {formErrors.drawing && <Typography sx={{ color: '#DC2626', fontSize: '0.68rem', mt: 0.5 }}>{formErrors.drawing}</Typography>}
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel>Client</InputLabel>
                    <Select value={f.client_id} label="Client"
                      onChange={e => setF(p => ({ ...p, client_id: e.target.value as string }))}>
                      <MenuItem value="">— Select Client —</MenuItem>
                      {clients.map((c: any) => (
                        <MenuItem key={c.id ?? ''} value={c.id ?? ''} sx={{ fontSize: '0.78rem' }}>
                          {c.client_name ?? ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel>Vendor (Optional)</InputLabel>
                    <Select value={f.vendor_id} label="Vendor (Optional)"
                      onChange={e => setF(p => ({ ...p, vendor_id: e.target.value as string }))}>
                      <MenuItem value="">— None —</MenuItem>
                      {vendors.map((v: any) => (
                        <MenuItem key={v.id ?? ''} value={v.id ?? ''} sx={{ fontSize: '0.78rem' }}>
                          {v.vendor_name ?? ''}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Description / Notes" multiline minRows={2} value={f.description}
                    onChange={e => setF(p => ({ ...p, description: e.target.value }))} sx={fieldSx} />
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ mb: '24px', borderColor: 'var(--border)' }} />

            {/* ══════════════════════════════════════════════════════════
                SECTION 2: RAW MATERIAL SPECIFICATION (CRITICAL)
                ══════════════════════════════════════════════════════════ */}
            <Box sx={{ mb: '24px' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em', mb: '4px', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>2</Box>
                Raw Material Specification
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: 'var(--muted)', mb: '12px' }}>
                Filter by Category then Form, then select the exact specification.
              </Typography>

              <Grid container spacing={1.5}>
                {/* Step 1: Category filter */}
                <Grid item xs={6}>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel>1. Category</InputLabel>
                    <Select
                      value={rmCategoryFilter}
                      label="1. Category"
                      onChange={e => {
                        setRmCategoryFilter(e.target.value);
                        setRmGradeFilter('');
                        setRmConditionFilter('');
                        setRmFormFilter('');
                        setRmDimensionFilter('');
                        handleRawMaterialChange('');
                      }}
                    >
                      <MenuItem value="">— All —</MenuItem>
                      {[...new Set(rawMaterials.map(rm => rm.material_category).filter(Boolean))]
                        .sort()
                        .map(cat => <MenuItem key={cat} value={cat} sx={{ fontSize: '0.78rem' }}>{cat}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Step 2: Grade filter */}
                <Grid item xs={6}>
                  <FormControl fullWidth size="small" sx={fieldSx} disabled={!rmCategoryFilter}>
                    <InputLabel>2. Grade</InputLabel>
                    <Select
                      value={rmGradeFilter}
                      label="2. Grade"
                      onChange={e => {
                        setRmGradeFilter(e.target.value);
                        setRmConditionFilter('');
                        setRmFormFilter('');
                        setRmDimensionFilter('');
                        handleRawMaterialChange('');
                      }}
                    >
                      <MenuItem value="">— All —</MenuItem>
                      {[...new Set(
                        rawMaterials
                          .filter(rm => !rmCategoryFilter || rm.material_category === rmCategoryFilter)
                          .map(rm => rm.material_grade)
                          .filter(Boolean) as string[]
                      )].sort().map(grade => <MenuItem key={grade} value={grade} sx={{ fontSize: '0.78rem' }}>{grade}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Step 3: Condition filter */}
                <Grid item xs={6}>
                  <FormControl fullWidth size="small" sx={fieldSx} disabled={!rmGradeFilter}>
                    <InputLabel>3. Condition</InputLabel>
                    <Select
                      value={rmConditionFilter}
                      label="3. Condition"
                      onChange={e => {
                        setRmConditionFilter(e.target.value);
                        setRmFormFilter('');
                        setRmDimensionFilter('');
                        handleRawMaterialChange('');
                      }}
                    >
                      <MenuItem value="">— All —</MenuItem>
                      {[...new Set(
                        rawMaterials
                          .filter(rm =>
                            (!rmCategoryFilter || rm.material_category === rmCategoryFilter) &&
                            (!rmGradeFilter || rm.material_grade === rmGradeFilter)
                          )
                          .map(rm => rm.condition)
                          .filter(Boolean) as string[]
                      )].sort().map(cond => <MenuItem key={cond} value={cond} sx={{ fontSize: '0.78rem' }}>{cond}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Step 4: Form / Size filter */}
                <Grid item xs={6}>
                  <FormControl fullWidth size="small" sx={fieldSx} disabled={!rmConditionFilter}>
                    <InputLabel>4. Form / Size</InputLabel>
                    <Select
                      value={rmFormFilter}
                      label="4. Form / Size"
                      onChange={e => {
                        setRmFormFilter(e.target.value);
                        setRmDimensionFilter('');
                        handleRawMaterialChange('');
                      }}
                    >
                      <MenuItem value="">— All —</MenuItem>
                      {[...new Set(
                        rawMaterials
                          .filter(rm =>
                            (!rmCategoryFilter || rm.material_category === rmCategoryFilter) &&
                            (!rmGradeFilter || rm.material_grade === rmGradeFilter) &&
                            (!rmConditionFilter || rm.condition === rmConditionFilter)
                          )
                          .map(rm => rm.form)
                          .filter(Boolean) as string[]
                      )].sort().map(form => <MenuItem key={form} value={form} sx={{ fontSize: '0.78rem' }}>{form}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>

                {/* Step 5: Dimensions — auto-selects raw material */}
                <Grid item xs={12}>
                  <FormControl fullWidth size="small" sx={fieldSx} disabled={!rmFormFilter} error={!!formErrors.raw_material_id}>
                    <InputLabel>5. Dimensions *</InputLabel>
                    <Select
                      value={rmDimensionFilter}
                      label="5. Dimensions *"
                      onChange={e => {
                        const selectedDim = e.target.value;
                        setRmDimensionFilter(selectedDim);

                        // ✅ Auto-select the matching raw material
                        const match = rawMaterials.find(rm =>
                          (!rmCategoryFilter || rm.material_category === rmCategoryFilter) &&
                          (!rmGradeFilter || rm.material_grade === rmGradeFilter) &&
                          (!rmConditionFilter || rm.condition === rmConditionFilter) &&
                          (!rmFormFilter || rm.form === rmFormFilter) &&
                          formatDimensions(rm.form ?? '', rm.dimensions ?? null, rm.unit_system) === selectedDim
                        );
                        handleRawMaterialChange(match?.id ?? '');
                      }}
                    >
                      <MenuItem value="">— Select Dimensions —</MenuItem>
                      {[...new Set(
                        rawMaterials
                          .filter(rm =>
                            (!rmCategoryFilter || rm.material_category === rmCategoryFilter) &&
                            (!rmGradeFilter || rm.material_grade === rmGradeFilter) &&
                            (!rmConditionFilter || rm.condition === rmConditionFilter) &&
                            (!rmFormFilter || rm.form === rmFormFilter)
                          )
                          .map(rm => formatDimensions(rm.form ?? '', rm.dimensions ?? null, rm.unit_system))
                          .filter(d => d && d !== '—')
                      )].sort().map(dim => <MenuItem key={dim} value={dim} sx={{ fontSize: '0.78rem' }}>{dim}</MenuItem>)}
                    </Select>
                    {formErrors.raw_material_id && <FormHelperText>{formErrors.raw_material_id}</FormHelperText>}
                  </FormControl>
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ mb: '24px', borderColor: 'var(--border)' }} />

            {/* ══════════════════════════════════════════════════════════
                SECTION 3: AUTO-FILLED MATERIAL DETAILS (READ-ONLY)
                ══════════════════════════════════════════════════════════ */}
            <Box sx={{ mb: '16px' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em', mb: '4px', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700 }}>3</Box>
                Auto-Filled Material Details
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', color: 'var(--muted)', mb: '12px' }}>
                These fields are automatically populated from the selected Raw Material and cannot be edited.
              </Typography>

              {!f.raw_material_id ? (
                <Box sx={{ p: '16px', bgcolor: alpha('#64748b', 0.04), borderRadius: 'var(--radius-sm)', border: '1px dashed var(--border)', textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
                    Select a Raw Material above to auto-fill these details
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ p: '16px', bgcolor: alpha('#1F7A63', 0.03), borderRadius: 'var(--radius-sm)', border: `1px solid ${alpha('#1F7A63', 0.12)}` }}>
                  <Grid container spacing={1.5}>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" label="Material Category" value={f.material_category}
                        InputProps={{ readOnly: true }} sx={readOnlyFieldSx} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" label="Material Grade" value={f.material_grade}
                        InputProps={{ readOnly: true }} sx={readOnlyFieldSx} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" label="Condition" value={f.condition || '—'}
                        InputProps={{ readOnly: true }} sx={readOnlyFieldSx} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" label="Density (g/cm³)" value={f.density || '—'}
                        InputProps={{ readOnly: true }} sx={readOnlyFieldSx} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" label="Form" value={f.form || '—'}
                        InputProps={{ readOnly: true }} sx={readOnlyFieldSx} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" label="Shape" value={f.shape || '—'}
                        InputProps={{ readOnly: true }} sx={readOnlyFieldSx} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" label="Dimensions" value={formatDimensions(f.form, f.dimensions, f.unit_system)}
                        InputProps={{ readOnly: true }} sx={readOnlyFieldSx} />
                    </Grid>
                  </Grid>
                </Box>
              )}
            </Box>

            <Divider sx={{ mb: '24px', borderColor: 'var(--border)' }} />

            {/* ══════════════════════════════════════════════════════════
                SECTION 4: COST PER UNIT (EDITABLE)
                ══════════════════════════════════════════════════════════ */}
            <Box sx={{ mb: '16px' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em', mb: '12px', display: 'flex', alignItems: 'center', gap: 1 }}>
                Cost Per Unit
              </Typography>
              <TextField fullWidth size="small" label="Cost Per Unit" type="number"
                value={f.cost_per_unit} onChange={e => setF(prev => ({ ...prev, cost_per_unit: e.target.value }))}
                placeholder="Enter cost per unit"
                sx={fieldSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }} />
            </Box>

            <Divider sx={{ mb: '24px', borderColor: 'var(--border)' }} />

            {/* ══════════════════════════════════════════════════════════
                SECTION 5: MANUFACTURING DETAILS
                ══════════════════════════════════════════════════════════ */}
            <Box sx={{ mb: '32px' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '.08em', mb: '12px', display: 'flex', alignItems: 'center', gap: 1 }}>
                Manufacturing Details
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel>Manufacturing Type</InputLabel>
                    <Select
                      value={f.manufacturing_type}
                      label="Manufacturing Type"
                      onChange={e => setF(prev => ({ ...prev, manufacturing_type: e.target.value as string }))}
                    >
                      <MenuItem value="">— None Selected —</MenuItem>
                      <MenuItem value="Machining">Machining</MenuItem>
                      <MenuItem value="Anodizing">Anodizing</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12}>
                  <FormControl fullWidth size="small" sx={fieldSx}>
                    <InputLabel>Operator Initials</InputLabel>
                    <Select
                      value={f.operator_initials || ''}
                      label="Operator Initials"
                      onChange={e => setF(prev => ({ ...prev, operator_initials: e.target.value as string }))}
                    >
                      <MenuItem value="">— None Selected —</MenuItem>
                      {operatorOptions.map(opt => (
                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {f.manufacturing_type === 'Machining' && (
                  <>
                    <Grid item xs={12}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--secondary-foreground)', mt: 1, mb: 1 }}>
                        Section A: Material Details
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small" sx={fieldSx}>
                        <InputLabel>Cut Method</InputLabel>
                        <Select
                          value={f.cut_method}
                          label="Cut Method"
                          onChange={e => setF(prev => ({ ...prev, cut_method: e.target.value as string }))}
                        >
                          <MenuItem value="">— None Selected —</MenuItem>
                          <MenuItem value="Saw Cut">Saw Cut</MenuItem>
                          <MenuItem value="Bar Fed">Bar Fed</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth size="small" label="Cut Length"
                        value={f.cut_length} onChange={e => setF(prev => ({ ...prev, cut_length: e.target.value }))}
                        sx={fieldSx} />
                    </Grid>

                    <Grid item xs={12}>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--secondary-foreground)', mt: 1, mb: 1 }}>
                        Section B: Operations
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small" sx={fieldSx}>
                        <InputLabel>Lathe Ops Required</InputLabel>
                        <Select value={f.lathe_ops_required} label="Lathe Ops Required" onChange={e => setF(prev => ({ ...prev, lathe_ops_required: e.target.value as string }))}>
                          <MenuItem value="Yes">Yes</MenuItem>
                          <MenuItem value="No">No</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small" sx={fieldSx}>
                        <InputLabel>Mill Ops Required</InputLabel>
                        <Select value={f.mill_ops_required} label="Mill Ops Required" onChange={e => setF(prev => ({ ...prev, mill_ops_required: e.target.value as string }))}>
                          <MenuItem value="Yes">Yes</MenuItem>
                          <MenuItem value="No">No</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small" sx={fieldSx}>
                        <InputLabel>Deburr Required</InputLabel>
                        <Select value={f.deburr_required} label="Deburr Required" onChange={e => setF(prev => ({ ...prev, deburr_required: e.target.value as string }))}>
                          <MenuItem value="Yes">Yes</MenuItem>
                          <MenuItem value="No">No</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small" sx={fieldSx}>
                        <InputLabel>Heat Treat Required</InputLabel>
                        <Select value={f.heat_treat_required} label="Heat Treat Required" onChange={e => setF(prev => ({ ...prev, heat_treat_required: e.target.value as string }))}>
                          <MenuItem value="Yes">Yes</MenuItem>
                          <MenuItem value="No">No</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small" sx={fieldSx}>
                        <InputLabel>Marking Required</InputLabel>
                        <Select value={f.marking_required} label="Marking Required" onChange={e => setF(prev => ({ ...prev, marking_required: e.target.value as string }))}>
                          <MenuItem value="Yes">Yes</MenuItem>
                          <MenuItem value="No">No</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small" sx={fieldSx}>
                        <InputLabel>Final QC/Inspection</InputLabel>
                        <Select value={f.final_qc_inspection_required} label="Final QC/Inspection" onChange={e => setF(prev => ({ ...prev, final_qc_inspection_required: e.target.value as string }))}>
                          <MenuItem value="Yes">Yes</MenuItem>
                          <MenuItem value="No">No</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth size="small" sx={fieldSx}>
                        <InputLabel>Final Acceptance</InputLabel>
                        <Select value={f.final_acceptance_required} label="Final Acceptance" onChange={e => setF(prev => ({ ...prev, final_acceptance_required: e.target.value as string }))}>
                          <MenuItem value="Yes">Yes</MenuItem>
                          <MenuItem value="No">No</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    </>
                  )}

                  {f.manufacturing_type === 'Anodizing' && (
                    <>
                      <Grid item xs={12}>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--secondary-foreground)', mt: 1, mb: 1 }}>
                          Anodizing Specifications
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <TextField fullWidth size="small" label="Type" type="number" sx={fieldSx}
                          value={f.anodize_type} onChange={e => setF(prev => ({ ...prev, anodize_type: e.target.value }))} />
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <TextField fullWidth size="small" label="Thickness Spec" sx={fieldSx}
                          value={f.anodize_thickness_spec} onChange={e => setF(prev => ({ ...prev, anodize_thickness_spec: e.target.value }))} />
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <TextField fullWidth size="small" label="Class" type="number" sx={fieldSx}
                          value={f.anodize_class} onChange={e => setF(prev => ({ ...prev, anodize_class: e.target.value }))} />
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <TextField fullWidth size="small" label="Dye Color" sx={fieldSx}
                          value={f.anodize_dye_color} onChange={e => setF(prev => ({ ...prev, anodize_dye_color: e.target.value }))} />
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox size="small" sx={{ color: 'var(--primary)', '&.Mui-checked': { color: 'var(--primary)' } }}
                            checked={f.anodize_seal} onChange={e => setF(prev => ({ ...prev, anodize_seal: e.target.checked }))} />
                          <Typography variant="body2">Seal</Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox size="small" sx={{ color: 'var(--primary)', '&.Mui-checked': { color: 'var(--primary)' } }}
                            checked={f.anodize_mask_threads} onChange={e => setF(prev => ({ ...prev, anodize_mask_threads: e.target.checked }))} />
                          <Typography variant="body2">Mask Threads</Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox size="small" sx={{ color: 'var(--primary)', '&.Mui-checked': { color: 'var(--primary)' } }}
                            checked={f.anodize_tumbled} onChange={e => setF(prev => ({ ...prev, anodize_tumbled: e.target.checked }))} />
                          <Typography variant="body2">Tumbled</Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6} sm={4}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Checkbox size="small" sx={{ color: 'var(--primary)', '&.Mui-checked': { color: 'var(--primary)' } }}
                            checked={f.anodize_scotch_brite} onChange={e => setF(prev => ({ ...prev, anodize_scotch_brite: e.target.checked }))} />
                          <Typography variant="body2">Scotch Brite</Typography>
                        </Box>
                      </Grid>

                      <Grid item xs={12}>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--secondary-foreground)', mt: 1, mb: 1 }}>
                          Section B: Anodizing Operations
                        </Typography>
                      </Grid>
                      {[
                        { label: 'Visual Inspection', field: 'anodize_visual_inspection' },
                        { label: 'Initial Cleaning Alkaline Wash', field: 'anodize_alkaline_wash' },
                        { label: 'Masking', field: 'anodize_masking' },
                        { label: 'Racking', field: 'anodize_racking' },
                        { label: 'Secondary Cleaning Alkaline Immersion', field: 'anodize_secondary_cleaning' },
                        { label: 'Caustic Etch Rinse', field: 'anodize_caustic_etch' },
                        { label: 'Acid Etch Rinse', field: 'anodize_acid_etch' },
                        { label: 'DeOx Rinse', field: 'anodize_deox_rinse' },
                        { label: 'Anodize Rinse', field: 'anodize_anodize_rinse' },
                        { label: 'Neutralize Rinse', field: 'anodize_neutralize' },
                        { label: 'Dye Rinse', field: 'anodize_dye' },
                        { label: 'Seal Rinse', field: 'anodize_seal_rinse' },
                        { label: 'Dry', field: 'anodize_dry' },
                        { label: 'Un-Rack', field: 'anodize_un_rack' },
                        { label: 'Technical Inspect', field: 'anodize_technical_inspect' },
                        { label: 'Commercial Inspection', field: 'anodize_commercial_inspection' },
                        { label: 'Package', field: 'anodize_package' },
                        { label: 'Final Acceptance', field: 'anodize_final_acceptance' },
                        { label: 'Product Release', field: 'anodize_product_release' },
                      ].map(op => (
                        <Grid item xs={12} sm={4} key={op.field}>
                          <FormControl fullWidth size="small" sx={fieldSx}>
                            <InputLabel>{op.label}</InputLabel>
                            <Select value={(f as any)[op.field]} label={op.label} onChange={e => setF(prev => ({ ...prev, [op.field]: e.target.value as string }))}>
                              <MenuItem value="Yes">Yes</MenuItem>
                              <MenuItem value="No">No</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                      ))}
                    </>
                  )}
                  </Grid>
                  </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, p: '20px', borderTop: '1px solid var(--border)' }}>
                <Button
                  variant="outlined"
                  onClick={() => { setDrawerOpen(false); setEditingPart(null); }}
                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', borderRadius: 'var(--radius-sm)' }}
                >
                  Cancel
                </Button>
                <Button variant="contained" onClick={handleSave} disabled={submitting}
                  sx={{ bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-light)' }, textTransform: 'none',
                    fontWeight: 700, fontSize: '0.78rem', borderRadius: 'var(--radius-sm)', px: 3, boxShadow: 'none' }}>
                  {submitting ? 'Saving…' : editingPart ? 'Update Part' : 'Create Part'}
                </Button>
              </Box>
            </Box>
          </Drawer>

      {/* ═══ DELETE CONFIRMATION ════════════════════════════════════ */}
      {deleteTarget && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'rgba(0,0,0,0.35)' }} onClick={() => setDeleteTarget(null)}>
          <Box onClick={e => e.stopPropagation()}
            sx={{ bgcolor: 'var(--card)', borderRadius: 'var(--radius)', p: '24px', maxWidth: 400, width: '90%',
              boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' }}>
            <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: 'var(--foreground)', mb: '8px' }}>Delete Part</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: 'var(--muted)', mb: '20px' }}>
              Are you sure you want to delete <strong>{deleteTarget.part_name}</strong>? This action cannot be undone.
            </Typography>
            <Box sx={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <Button variant="outlined" onClick={() => setDeleteTarget(null)}
                sx={{ textTransform: 'none', borderColor: 'var(--border)', color: 'var(--secondary-foreground)',
                  fontWeight: 600, fontSize: '0.78rem', borderRadius: 'var(--radius-sm)' }}>
                Cancel
              </Button>
              <Button variant="contained" onClick={handleDelete}
                sx={{ bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' }, textTransform: 'none',
                  fontWeight: 700, fontSize: '0.78rem', borderRadius: 'var(--radius-sm)', boxShadow: 'none' }}>
                Delete
              </Button>
            </Box>
          </Box>
        </Box>
      )}

      {/* ═══ BULK DELETE CONFIRMATION ═══════════════════════════════ */}
      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, fontSize: '0.9rem',
          borderBottom: '1px solid var(--border)' }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', bgcolor: alpha('#EF4444', 0.08) }}>
            <WarningIcon sx={{ fontSize: 18, color: '#EF4444' }} />
          </Box>
          Delete {selected.size} Part{selected.size > 1 ? 's' : ''}
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <Typography sx={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
            Are you sure you want to delete <strong>{selected.size} selected part{selected.size > 1 ? 's' : ''}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid var(--border)', px: 3, py: 1.5 }}>
          <Button onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}
            sx={{ textTransform: 'none', fontSize: '0.78rem', fontWeight: 600, borderRadius: 'var(--radius-sm)', color: 'var(--secondary-foreground)' }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleBulkDelete} disabled={bulkDeleting}
            sx={{ bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' }, textTransform: 'none',
              fontWeight: 700, fontSize: '0.78rem', borderRadius: 'var(--radius-sm)', boxShadow: 'none' }}>
            {bulkDeleting ? 'Deleting…' : 'Delete All'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ SUCCESS SNACKBAR ══════════════════════════════════════ */}
      <Snackbar open={!!successMsg} autoHideDuration={3000} onClose={() => setSuccessMsg('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity="success" onClose={() => setSuccessMsg('')}
          sx={{ borderRadius: 'var(--radius-sm)', fontWeight: 600 }}>
          {successMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PartsMasterPage;
