import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  IconButton,
  Drawer,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Card,
  CardContent,
  ToggleButton,
  ToggleButtonGroup,
  Tabs,
  Tab,
  Avatar,
  FormHelperText,
  Tooltip,
  alpha,
  Snackbar,
  Alert,
  Skeleton,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ViewList as ViewListIcon,
  GridView as GridViewIcon,
  Close as CloseIcon,
  FileDownload as ExportIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Inventory as InventoryIcon,
  People as PeopleIcon,
  CheckCircle as CheckCircleIcon,
  Assessment as AssessmentIcon,
  Clear as ClearIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { materialService } from '../services/materialService';
import { Material, MaterialVendorMapping } from '../types';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = ['#1F7A63', '#3B82F6', '#16A34A', '#86efac', '#F59E0B', '#0EA5E9', '#EC4899', '#EF4444'];

const GRADES = ['EN8', 'EN19', 'EN24', 'SS304', 'SS316', 'MS', 'Aluminium 6061', 'Aluminium 7075', 'Custom'];
const FORMS = ['Rod', 'Sheet', 'Plate', 'Pipe', 'Hex Bar', 'Square Bar', 'Flat'];
const UNITS = ['Kg', 'Ton', 'Meter', 'Nos'];

const SHAPE_MAP: Record<string, string[]> = {
  Rod: ['Round', 'Hex', 'Square'],
  Sheet: ['Flat'],
  Plate: ['Flat'],
  Pipe: ['Round Hollow'],
  'Hex Bar': ['Hex'],
  'Square Bar': ['Square'],
  Flat: ['Flat'],
};

const DENSITY_MAP: Record<string, number> = {
  EN8: 7.85,
  EN19: 7.85,
  EN24: 7.85,
  SS304: 7.93,
  SS316: 8.0,
  MS: 7.86,
  'Aluminium 6061': 2.70,
  'Aluminium 7075': 2.81,
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────
const getInitials = (name: string) => {
  const words = (name || 'N').trim().split(' ');
  return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
};

const getColor = (index: number) => COLORS[index % COLORS.length];

const calcCompleteness = (m: Material) => {
  const fields = [m.material_name, m.grade, m.form, m.shape, m.unit, m.density, m.default_cost].filter(Boolean).length;
  const vendors = (m.vendorMappings || []).length > 0 ? 1 : 0;
  return Math.min(100, Math.round((fields / 7 * 0.8 + vendors * 0.2) * 100));
};

const getCompletenessColor = (v: number) => (v >= 80 ? '#16A34A' : v >= 50 ? '#F59E0B' : '#EF4444');

// ─────────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────────

const MiniStatCard: React.FC<{
  icon: React.ReactNode; label: string; value: string | number; borderColor: string;
}> = ({ icon, label, value, borderColor }) => (
  <Box sx={{ flex:'1 1 0', minWidth:170, p:'14px 16px', bgcolor:'var(--card)', borderRadius:'var(--radius)',
    border:'1px solid var(--border)', borderLeft:`3px solid ${borderColor}`,
    boxShadow:'var(--shadow-sm)', display:'flex', alignItems:'center', gap:'12px',
    transition:'box-shadow 0.2s', '&:hover':{ boxShadow:'var(--shadow)' } }}>
    <Box sx={{ width:38, height:38, borderRadius:'var(--radius-sm)', bgcolor: alpha(borderColor, 0.08),
      display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      {icon}
    </Box>
    <Box sx={{ minWidth:0 }}>
      <Typography sx={{ fontSize:'0.65rem', color:'var(--muted)', fontWeight:600, textTransform:'uppercase',
        letterSpacing:'.06em', lineHeight:1, mb:'4px', whiteSpace:'nowrap' }}>{label}</Typography>
      <Typography sx={{ fontSize:'1.2rem', fontWeight:800, color:'var(--foreground)', lineHeight:1 }}>{value}</Typography>
    </Box>
  </Box>
);

const Badge: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = '#6B7280' }) => (
  <Box component="span" sx={{ display:'inline-flex', alignItems:'center', gap:'4px', px:'8px', py:'2px',
    borderRadius:'var(--radius-sm)', bgcolor: alpha(color, 0.06), border:`1px solid ${alpha(color, 0.12)}` }}>
    <Box sx={{ width:5, height:5, borderRadius:'50%', bgcolor: color }} />
    <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color, lineHeight:1 }}>{children}</Typography>
  </Box>
);

const VendorAvatars: React.FC<{ vendors: MaterialVendorMapping[] }> = ({ vendors }) => {
  if (!vendors || vendors.length === 0) {
    return <Typography sx={{ fontSize:'0.72rem', color:'var(--muted)' }}>— none</Typography>;
  }
  return (
    <Box sx={{ display:'flex', alignItems:'center' }}>
      {vendors.slice(0, 3).map((v, i) => (
        <Tooltip key={v.id} title={v.vendor?.vendor_name || 'Vendor'}>
          <Avatar
            sx={{
              width: 24, height: 24, fontSize: '9px', fontWeight: 700,
              ml: i > 0 ? '-5px' : 0,
              border: v.is_default ? '1.5px solid var(--primary)' : '1.5px solid var(--card)',
              bgcolor: v.is_default ? 'var(--primary-bg)' : 'var(--accent)',
              color: v.is_default ? 'var(--primary)' : 'var(--foreground)',
              zIndex: 3 - i,
            }}
          >
            {getInitials(v.vendor?.vendor_name || 'V')}
          </Avatar>
        </Tooltip>
      ))}
      {vendors.length > 3 && (
        <Avatar sx={{ width:24, height:24, fontSize:'9px', fontWeight:700, ml:'-5px', bgcolor:'var(--accent)', color:'var(--muted)', border:'1.5px solid var(--card)' }}>
          +{vendors.length - 3}
        </Avatar>
      )}
      <Typography sx={{ fontSize:'0.72rem', color:'var(--muted)', ml:0.75 }}>{vendors.length}</Typography>
    </Box>
  );
};

// BarChart for analytics
const BarChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <Box>
      {data.map((item, i) => (
        <Box key={item.label} sx={{ display:'flex', alignItems:'center', gap:'10px', mb:'8px' }}>
          <Typography sx={{ fontSize:'0.72rem', color:'var(--secondary-foreground)', width:64, textAlign:'right', flexShrink:0 }}>
            {item.label}
          </Typography>
          <Box sx={{ flex:1, height:4, bgcolor:'var(--accent)', borderRadius:'2px', overflow:'hidden' }}>
            <Box sx={{ height:'100%', width:`${Math.round((item.value / maxVal) * 100)}%`, bgcolor:COLORS[i % COLORS.length],
              borderRadius:'2px', transition:'width 1s cubic-bezier(.34,1.56,.64,1)' }} />
          </Box>
          <Typography sx={{ fontSize:'0.72rem', color:'var(--muted)', width:20, textAlign:'right', flexShrink:0 }}>{item.value}</Typography>
        </Box>
      ))}
      {data.length === 0 && <Typography sx={{ fontSize:'0.78rem', color:'var(--muted)' }}>No data</Typography>}
    </Box>
  );
};

// Drawer field styling
const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'var(--accent)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '0.8rem',
    '& fieldset': { borderColor: 'var(--border)' },
    '&:hover fieldset': { borderColor: 'var(--primary)' },
    '&.Mui-focused fieldset': { borderColor: 'var(--primary)', borderWidth: '1px' },
  },
  '& .MuiInputLabel-root': {
    fontSize: '0.65rem',
    fontWeight: 700,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
const MaterialMasterNewPage: React.FC = () => {
  const { user } = useAuth();
  const canWrite = user?.role === 'main_admin' || user?.role === 'admin';

  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [formFilter, setFormFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [tabIndex, setTabIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Vendor list from API
  const [allVendors, setAllVendors] = useState<any[]>([]);

  // Form state
  const [formName, setFormName] = useState('');
  const [formGrade, setFormGrade] = useState('');
  const [formForm, setFormForm] = useState('');
  const [formShape, setFormShape] = useState('');
  const [formUnit, setFormUnit] = useState('Kg');
  const [formDensity, setFormDensity] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formVendors, setFormVendors] = useState<{ vendor_id: string; price_per_unit: string; lead_time: string; is_default: boolean }[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Available shapes depend on form
  const availableShapes = useMemo(() => SHAPE_MAP[formForm] || [], [formForm]);

  // Auto-fill density when grade changes
  const handleGradeChange = (grade: string) => {
    setFormGrade(grade);
    if (grade !== 'Custom' && DENSITY_MAP[grade]) {
      setFormDensity(String(DENSITY_MAP[grade]));
    }
  };

  // Load data
  const loadMaterials = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await materialService.getAll({ search: searchQuery });
      setMaterials(data || []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error loading materials');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const loadVendors = useCallback(async () => {
    try {
      const res = await api.get('/vendors');
      setAllVendors(res.data.data || []);
    } catch {
      // supplementary
    }
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { loadMaterials(); }, [loadMaterials]);
  useEffect(() => { loadVendors(); }, [loadVendors]);

  // Auto-open add drawer when navigated with ?action=add
  useEffect(() => {
    if (searchParams.get('action') === 'add' && !drawerOpen) {
      handleOpenAdd();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  // Derived data
  const filteredMaterials = useMemo(() => {
    return materials.filter(m => {
      if (formFilter !== 'all' && m.form !== formFilter) return false;
      if (gradeFilter !== 'all' && m.grade !== gradeFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!(m.material_name || '').toLowerCase().includes(q) && !(m.grade || '').toLowerCase().includes(q) && !(m.form || '').toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [materials, formFilter, gradeFilter, searchQuery]);

  const hasFilters = searchQuery || formFilter !== 'all' || gradeFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setFormFilter('all');
    setGradeFilter('all');
  };

  const stats = useMemo(() => {
    const total = materials.length;
    const vendorCount = materials.reduce((s, m) => s + (m.vendorMappings || []).length, 0);
    const prefCount = materials.reduce((s, m) => s + (m.vendorMappings || []).filter(v => v.is_default).length, 0);
    const avgComp = total ? Math.round(materials.reduce((s, m) => s + calcCompleteness(m), 0) / total) : 0;
    return { total, vendorCount, prefCount, avgComp };
  }, [materials]);

  const analyticsData = useMemo(() => {
    const formMap: Record<string, number> = {};
    const gradeMap: Record<string, number> = {};
    const vendorMap: Record<string, number> = {};
    materials.forEach(m => {
      if (m.form) formMap[m.form] = (formMap[m.form] || 0) + 1;
      if (m.grade) gradeMap[m.grade] = (gradeMap[m.grade] || 0) + 1;
      (m.vendorMappings || []).forEach(v => {
        const name = v.vendor?.vendor_name || 'Unknown';
        vendorMap[name] = (vendorMap[name] || 0) + 1;
      });
    });
    const topCost = [...materials].filter(m => m.default_cost).sort((a, b) => (b.default_cost || 0) - (a.default_cost || 0)).slice(0, 6);
    return {
      byForm: Object.entries(formMap).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
      byGrade: Object.entries(gradeMap).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
      byVendor: Object.entries(vendorMap).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
      topCost,
    };
  }, [materials]);

  // Handlers
  const resetForm = () => {
    setFormName(''); setFormGrade(''); setFormForm(''); setFormShape('');
    setFormUnit('Kg'); setFormDensity(''); setFormCost(''); setFormDescription('');
    setFormVendors([]); setFormErrors({});
  };

  const handleOpenAdd = () => {
    setEditingMaterial(null);
    resetForm();
    setDrawerOpen(true);
  };

  const handleOpenEdit = (m: Material) => {
    setEditingMaterial(m);
    setFormName(m.material_name);
    setFormGrade(m.grade || '');
    setFormForm(m.form || '');
    setFormShape(m.shape || '');
    setFormUnit(m.unit || 'Kg');
    setFormDensity(m.density != null ? String(m.density) : '');
    setFormCost(m.default_cost != null ? String(m.default_cost) : '');
    setFormDescription(m.description || '');
    setFormVendors((m.vendorMappings || []).map(vm => ({
      vendor_id: vm.vendor_id,
      price_per_unit: String(vm.price_per_unit || ''),
      lead_time: String(vm.lead_time || ''),
      is_default: vm.is_default,
    })));
    setFormErrors({});
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setEditingMaterial(null);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formName.trim()) errors.name = 'Required';
    if (!formGrade) errors.grade = 'Required';
    if (!formForm) errors.form = 'Required';
    if (!formUnit) errors.unit = 'Required';
    const cost = parseFloat(formCost);
    if (!formCost || cost < 0) errors.cost = 'Must be >= 0';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const payload = {
        material_name: formName.trim(),
        category: 'raw_material' as const,
        grade: formGrade || undefined,
        form: formForm || undefined,
        shape: formShape || undefined,
        unit: formUnit || 'Kg',
        density: formDensity ? parseFloat(formDensity) : undefined,
        default_cost: formCost ? parseFloat(formCost) : 0,
        description: formDescription || undefined,
        vendors: formVendors.filter(v => v.vendor_id).map(v => ({
          vendor_id: v.vendor_id,
          price_per_unit: v.price_per_unit ? parseFloat(v.price_per_unit) : 0,
          lead_time: v.lead_time ? parseInt(v.lead_time) : null,
          is_default: v.is_default,
        })),
      };

      if (editingMaterial) {
        await materialService.update(editingMaterial.id, payload);
        setSuccessMsg('Material updated');
      } else {
        await materialService.create(payload);
        setSuccessMsg('Material created');
      }
      handleCloseDrawer();
      loadMaterials();
    } catch (err: any) {
      setFormErrors({ _server: err.response?.data?.message || 'Error saving material' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this material?')) return;
    try {
      await materialService.delete(id);
      setSuccessMsg('Material deleted');
      setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      loadMaterials();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error deleting');
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} material(s)?`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => materialService.delete(id)));
      setSuccessMsg(`${selectedIds.size} materials deleted`);
      setSelectedIds(new Set());
      loadMaterials();
    } catch {
      setError('Error during bulk delete');
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(filteredMaterials.map(m => m.id)));
    else setSelectedIds(new Set());
  };

  const handleExport = () => {
    const headers = ['Material Name', 'Grade', 'Form', 'Shape', 'Unit', 'Density', 'Default Cost', 'Vendor Count', 'Default Vendor'];
    const rows = materials.map(m => {
      const pref = (m.vendorMappings || []).find(v => v.is_default);
      return [m.material_name, m.grade || '', m.form || '', m.shape || '', m.unit, String(m.density || ''), String(m.default_cost || ''), String((m.vendorMappings || []).length), pref?.vendor?.vendor_name || ''];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `material_master_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const handleAddVendor = () => {
    setFormVendors(prev => [...prev, { vendor_id: '', price_per_unit: '', lead_time: '7', is_default: prev.length === 0 }]);
  };

  const handleRemoveVendor = (index: number) => {
    setFormVendors(prev => prev.filter((_, i) => i !== index));
  };

  const handleVendorFieldChange = (index: number, field: string, value: string | boolean) => {
    setFormVendors(prev => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const handleSetPreferred = (index: number) => {
    setFormVendors(prev => prev.map((v, i) => ({ ...v, is_default: i === index })));
  };

  return (
    <Box sx={{ pb:4 }} className="animate-fadeIn">

      {/* HEADER */}
      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:'20px', flexWrap:'wrap', gap:1.5 }}>
        <Box>
          <Typography sx={{ fontSize:'1.35rem', fontWeight:800, color:'var(--foreground)', letterSpacing:'-0.025em', lineHeight:1.2 }}>
            Material Master
          </Typography>
          <Typography sx={{ fontSize:'0.78rem', color:'var(--muted)', mt:'2px' }}>
            Manage grades, forms, vendor mapping &amp; cost analysis
          </Typography>
        </Box>
        <Box sx={{ display:'flex', gap:'8px', alignItems:'center' }}>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => loadMaterials()}
              sx={{ color:'var(--muted)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', width:34, height:34,
                transition:'all 0.15s', '&:hover':{ borderColor:'var(--primary)', color:'var(--primary)', bgcolor:'var(--primary-bg)' } }}>
              <RefreshIcon sx={{ fontSize:17 }} />
            </IconButton>
          </Tooltip>
          <Button variant="outlined" startIcon={<ExportIcon sx={{ fontSize:15 }} />} onClick={handleExport}
            sx={{ textTransform:'none', borderRadius:'var(--radius-sm)', borderColor:'var(--border)', color:'var(--secondary-foreground)',
              fontWeight:600, fontSize:'0.78rem', height:34, transition:'all 0.15s',
              '&:hover':{ borderColor:'var(--primary)', color:'var(--primary)', bgcolor:'var(--primary-bg)' } }}>
            Export
          </Button>
          {canWrite && (
            <Button variant="contained" startIcon={<AddIcon sx={{ fontSize:17 }} />} onClick={handleOpenAdd}
              sx={{ bgcolor:'var(--primary)', '&:hover':{ bgcolor:'var(--primary-light)' }, textTransform:'none',
                fontWeight:700, borderRadius:'var(--radius-sm)', px:2, height:34, boxShadow:'none', fontSize:'0.78rem' }}>
              Add Material
            </Button>
          )}
        </Box>
      </Box>

      {/* TABS */}
      <Tabs
        value={tabIndex}
        onChange={(_, v) => setTabIndex(v)}
        sx={{
          mb:'20px', minHeight:0,
          '& .MuiTabs-flexContainer': {
            bgcolor:'var(--accent)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
            p:'3px', width:'fit-content', gap:'2px',
          },
          '& .MuiTabs-indicator': { display:'none' },
          '& .MuiTab-root': {
            minHeight:0, py:'6px', px:'16px', fontSize:'0.78rem', fontWeight:600,
            color:'var(--muted)', textTransform:'none', borderRadius:'var(--radius-sm)',
            transition:'all 0.15s',
            '&.Mui-selected': { bgcolor:'var(--card)', color:'var(--foreground)', boxShadow:'var(--shadow-sm)' },
          },
        }}
      >
        <Tab label="Registry" />
        <Tab label="Analytics" />
      </Tabs>

      {error && <Alert severity="error" sx={{ mb:'14px', borderRadius:'var(--radius-sm)' }} onClose={() => setError(null)}>{error}</Alert>}

      {tabIndex === 0 && (
        <>
          {/* STAT CARDS */}
          <Box sx={{ display:'flex', gap:'14px', mb:'20px', flexWrap:'wrap' }}>
            <MiniStatCard icon={<InventoryIcon sx={{ fontSize:20, color:'#0EA5E9' }} />} label="Total Materials" value={stats.total} borderColor="#0EA5E9" />
            <MiniStatCard icon={<PeopleIcon sx={{ fontSize:20, color:'#3B82F6' }} />} label="Vendor Mappings" value={stats.vendorCount} borderColor="#3B82F6" />
            <MiniStatCard icon={<CheckCircleIcon sx={{ fontSize:20, color:'#16A34A' }} />} label="Default Vendors" value={stats.prefCount} borderColor="#16A34A" />
            <MiniStatCard icon={<AssessmentIcon sx={{ fontSize:20, color:'#F59E0B' }} />} label="Profile Completeness" value={`${stats.avgComp}%`} borderColor="#F59E0B" />
          </Box>

          {/* FILTER TOOLBAR */}
          <Box sx={{ display:'flex', alignItems:'center', gap:'10px', mb:'20px', flexWrap:'wrap' }}>
            <TextField size="small" placeholder="Search name, grade, form..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              sx={{ flex:'1 1 320px', maxWidth:400,
                '& .MuiOutlinedInput-root':{ borderRadius:'var(--radius)', fontSize:'0.8rem', height:38, bgcolor:'var(--card)',
                  '&:hover .MuiOutlinedInput-notchedOutline':{ borderColor:'var(--primary)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor:'var(--primary)' } } }}
              InputProps={{ startAdornment:<InputAdornment position="start"><SearchIcon sx={{ fontSize:17, color:'var(--muted)' }} /></InputAdornment> }}
            />

            <FormControl size="small" sx={{ minWidth:110 }}>
              <InputLabel sx={{ fontSize:'0.78rem' }}>Form</InputLabel>
              <Select value={formFilter} label="Form" onChange={e => setFormFilter(e.target.value)}
                sx={{ borderRadius:'var(--radius)', fontSize:'0.78rem', height:38, bgcolor:'var(--card)' }}>
                <MenuItem value="all">All Forms</MenuItem>
                {FORMS.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth:110 }}>
              <InputLabel sx={{ fontSize:'0.78rem' }}>Grade</InputLabel>
              <Select value={gradeFilter} label="Grade" onChange={e => setGradeFilter(e.target.value)}
                sx={{ borderRadius:'var(--radius)', fontSize:'0.78rem', height:38, bgcolor:'var(--card)' }}>
                <MenuItem value="all">All Grades</MenuItem>
                {GRADES.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </Select>
            </FormControl>

            {hasFilters && (
              <Button size="small" startIcon={<ClearIcon sx={{ fontSize:14 }} />} onClick={clearFilters}
                sx={{ textTransform:'none', fontSize:'0.72rem', fontWeight:600, color:'var(--muted)', borderRadius:'var(--radius-sm)', height:38 }}>
                Clear
              </Button>
            )}

            <Box sx={{ ml:'auto', display:'flex', alignItems:'center' }}>
              <ToggleButtonGroup size="small" value={viewMode} exclusive onChange={(_, v) => v && setViewMode(v)}
                sx={{ '& .MuiToggleButton-root':{ border:'1px solid var(--border)', borderRadius:'var(--radius-sm) !important', width:38, height:38, p:0,
                  transition:'all 0.15s',
                  '&.Mui-selected':{ bgcolor:'var(--primary)', color:'#000', borderColor:'var(--primary)',
                    '&:hover':{ bgcolor:'var(--primary-light)' } },
                  '&:not(.Mui-selected):hover':{ bgcolor:'var(--accent)' },
                  '&:not(:first-of-type)':{ ml:'6px' } } }}>
                <ToggleButton value="table"><ViewListIcon sx={{ fontSize:17 }} /></ToggleButton>
                <ToggleButton value="grid"><GridViewIcon sx={{ fontSize:17 }} /></ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>

          {/* Bulk Actions Bar */}
          {selectedIds.size > 0 && canWrite && (
            <Box sx={{ display:'flex', alignItems:'center', gap:'10px', bgcolor:'var(--primary-bg)',
              border:'1px solid', borderColor: alpha('#1F7A63', 0.20), borderRadius:'var(--radius-sm)', p:'8px 14px', mb:'14px' }}>
              <Typography sx={{ fontSize:'0.78rem', fontWeight:700, color:'var(--primary)' }}>{selectedIds.size}</Typography>
              <Typography sx={{ fontSize:'0.78rem', color:'var(--secondary-foreground)' }}>selected</Typography>
              <Box sx={{ ml:'auto', display:'flex', gap:'8px' }}>
                <Button size="small" onClick={() => setSelectedIds(new Set())}
                  sx={{ fontSize:'0.72rem', color:'var(--muted)', textTransform:'none', fontWeight:600 }}>Clear</Button>
                <Button size="small" onClick={handleBulkDelete} startIcon={<DeleteIcon sx={{ fontSize:12 }} />}
                  sx={{ fontSize:'0.72rem', color:'#DC2626', textTransform:'none', fontWeight:600 }}>Delete Selected</Button>
              </Box>
            </Box>
          )}

          {/* TABLE VIEW */}
          {viewMode === 'table' && (
            <TableContainer sx={{ borderRadius:'var(--radius)', border:'1px solid var(--border)', bgcolor:'var(--card)',
              boxShadow:'var(--shadow-sm)', overflow:'hidden' }}>
              {loading ? (
                <Table size="small">
                  <TableBody>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j} sx={{ px:'14px' }}><Skeleton height={22} /></TableCell>
                      ))}</TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : filteredMaterials.length === 0 ? (
                <Box sx={{ py:8, textAlign:'center' }}>
                  <Box sx={{ width:64, height:64, borderRadius:'50%', bgcolor:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', mx:'auto', mb:1.5 }}>
                    <InventoryIcon sx={{ fontSize:28, color:'var(--muted)' }} />
                  </Box>
                  <Typography sx={{ fontSize:'0.9rem', fontWeight:700, color:'var(--secondary-foreground)', mb:0.5 }}>
                    {materials.length ? 'No materials match your filters' : 'No materials yet'}
                  </Typography>
                  <Typography sx={{ fontSize:'0.78rem', color:'var(--muted)', mb:2 }}>
                    {materials.length ? 'Try adjusting your filter criteria.' : 'Add your first material to get started.'}
                  </Typography>
                  {hasFilters ? (
                    <Button size="small" variant="outlined" onClick={clearFilters}
                      sx={{ textTransform:'none', fontWeight:600, borderRadius:'var(--radius-sm)', borderColor:'var(--border)', color:'var(--secondary-foreground)' }}>
                      Clear Filters
                    </Button>
                  ) : canWrite ? (
                    <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}
                      sx={{ bgcolor:'var(--primary)', textTransform:'none', fontWeight:700, fontSize:'0.78rem',
                        borderRadius:'var(--radius-sm)', boxShadow:'none', '&:hover':{ bgcolor:'var(--primary-light)' } }}>
                      Add Material
                    </Button>
                  ) : null}
                </Box>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor:'var(--accent)',
                      '& th':{ fontWeight:700, fontSize:'0.65rem', color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'.08em',
                        borderBottom:'1px solid var(--border)', py:'10px', px:'14px', height:56, verticalAlign:'middle', position:'sticky', top:0, bgcolor:'var(--accent)', zIndex:1 } }}>
                      <TableCell sx={{ width:40, textAlign:'center' }}>
                        <Checkbox size="small"
                          checked={selectedIds.size === filteredMaterials.length && filteredMaterials.length > 0}
                          indeterminate={selectedIds.size > 0 && selectedIds.size < filteredMaterials.length}
                          onChange={e => handleSelectAll(e.target.checked)}
                          sx={{ p:0, color:'var(--muted)', '&.Mui-checked':{ color:'var(--primary)' }, '&.MuiCheckbox-indeterminate':{ color:'var(--primary)' } }}
                        />
                      </TableCell>
                      <TableCell sx={{ minWidth:190 }}>Material</TableCell>
                      <TableCell align="center">Grade</TableCell>
                      <TableCell align="center">Form / Shape</TableCell>
                      <TableCell align="center">Unit</TableCell>
                      <TableCell align="right">Default Cost</TableCell>
                      <TableCell align="center">Vendors</TableCell>
                      <TableCell align="center" sx={{ minWidth:110 }}>Completeness</TableCell>
                      <TableCell align="center" sx={{ minWidth:112 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredMaterials.map((m, idx) => {
                      const color = getColor(idx);
                      const comp = calcCompleteness(m);
                      const compColor = getCompletenessColor(comp);
                      const isSelected = selectedIds.has(m.id);
                      return (
                        <TableRow key={m.id}
                          sx={{ cursor:'pointer',
                            bgcolor: isSelected ? alpha('#1F7A63', 0.04) : idx % 2 === 1 ? alpha('#F1F5F9', 0.5) : 'transparent',
                            borderLeft:'3px solid transparent',
                            transition:'all 0.15s ease',
                            '@keyframes rowIn': { from:{ opacity:0 }, to:{ opacity:1 } },
                            animation: `rowIn 0.2s ease ${idx * 0.03}s both`,
                            '&:hover':{ bgcolor: alpha('#1F7A63', 0.03), borderLeftColor:'var(--primary)' },
                            '& td':{ fontSize:'0.8rem', color:'var(--card-foreground)', py:'10px', px:'14px', height:64, verticalAlign:'middle', borderBottom:'1px solid var(--border-light)' } }}
                          onClick={() => handleOpenEdit(m)}
                        >
                          <TableCell onClick={e => e.stopPropagation()} sx={{ textAlign:'center' }}>
                            <Checkbox size="small" checked={isSelected} onChange={() => handleToggleSelect(m.id)}
                              sx={{ p:0, color:'var(--muted)', '&.Mui-checked':{ color:'var(--primary)' } }} />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display:'flex', alignItems:'center', gap:'10px' }}>
                              <Box sx={{ width:34, height:34, borderRadius:'50%', flexShrink:0, bgcolor: color,
                                display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <Typography sx={{ color:'#fff', fontSize:'0.7rem', fontWeight:700, lineHeight:1 }}>{getInitials(m.material_name)}</Typography>
                              </Box>
                              <Box sx={{ minWidth:0 }}>
                                <Typography sx={{ fontSize:'0.8rem', fontWeight:600, color:'var(--foreground)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  {m.material_name}
                                </Typography>
                                <Typography sx={{ fontSize:'0.68rem', color:'var(--muted)' }}>density {m.density || '—'} g/cm3</Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell align="center"><Badge color="#475569">{m.grade || '—'}</Badge></TableCell>
                          <TableCell align="center">
                            <Box sx={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'4px' }}>
                              <Badge color="#3B82F6">{m.form || '—'}</Badge>
                              {m.shape && <Typography sx={{ fontSize:'0.65rem', color:'var(--muted)' }}>{m.shape}</Typography>}
                            </Box>
                          </TableCell>
                          <TableCell align="center"><Badge color="#16A34A">{m.unit}</Badge></TableCell>
                          <TableCell align="right">
                            <Typography sx={{ fontSize:'0.8rem', fontWeight:700, color:'var(--foreground)', fontVariantNumeric:'tabular-nums' }}>
                              {m.default_cost ? `₹${m.default_cost.toLocaleString()}` : '—'}
                            </Typography>
                          </TableCell>
                          <TableCell align="center"><Box sx={{ display:'inline-flex', alignItems:'center', justifyContent:'center' }}><VendorAvatars vendors={m.vendorMappings || []} /></Box></TableCell>
                          <TableCell align="center">
                            <Box sx={{ display:'inline-flex', alignItems:'center', gap:'6px', minWidth:110 }}>
                              <Box sx={{ flex:1, height:4, borderRadius:2, bgcolor: alpha('#1F7A63', 0.1), overflow:'hidden' }}>
                                <Box sx={{ width:`${comp}%`, height:'100%', borderRadius:2,
                                  background:`linear-gradient(90deg, ${compColor}, ${alpha(compColor, 0.7)})`, transition:'width 0.4s ease' }} />
                              </Box>
                              <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:'var(--foreground)', minWidth:24, textAlign:'right' }}>
                                {comp}%
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell align="center" onClick={e => e.stopPropagation()}>
                            {canWrite && (
                              <Box className="row-actions" sx={{ display:'inline-flex', gap:'6px', opacity:1, justifyContent:'center', alignItems:'center' }}>
                                <IconButton size="small" onClick={() => handleOpenEdit(m)}
                                  sx={{ color:'var(--foreground)', width:32, height:32, border:'1px solid var(--border)', bgcolor:'var(--card)',
                                    '&:hover':{ borderColor:'var(--primary)', bgcolor:alpha('#1F7A63', 0.08), color:'var(--primary)' } }}>
                                  <EditIcon sx={{ fontSize:16 }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDelete(m.id)}
                                  sx={{ color:'var(--foreground)', width:32, height:32, border:'1px solid var(--border)', bgcolor:'var(--card)',
                                    '&:hover':{ borderColor: alpha('#DC2626', 0.2), bgcolor:'#FEF2F2', color:'#DC2626' } }}>
                                  <DeleteIcon sx={{ fontSize:16 }} />
                                </IconButton>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TableContainer>
          )}

          {/* GRID VIEW */}
          {viewMode === 'grid' && (
            <Grid container spacing='14px'>
              {loading ? Array.from({ length: 6 }).map((_, i) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={i}>
                  <Box sx={{ p:'16px', bgcolor:'var(--card)', borderRadius:'var(--radius)', border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)' }}>
                    <Skeleton height={28} width="60%" /><Skeleton height={18} /><Skeleton height={18} width="80%" />
                  </Box>
                </Grid>
              )) : filteredMaterials.length === 0 ? (
                <Grid item xs={12}>
                  <Box sx={{ py:8, textAlign:'center', bgcolor:'var(--card)', borderRadius:'var(--radius)', border:'1px solid var(--border)' }}>
                    <Typography sx={{ fontSize:'0.9rem', fontWeight:700, color:'var(--secondary-foreground)', mb:0.5 }}>No materials found</Typography>
                    <Typography sx={{ fontSize:'0.78rem', color:'var(--muted)', mb:2 }}>Try different filters or add a new material</Typography>
                  </Box>
                </Grid>
              ) : (
                filteredMaterials.map((m, idx) => {
                  const color = getColor(idx);
                  const comp = calcCompleteness(m);
                  const compColor = getCompletenessColor(comp);
                  return (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={m.id}>
                      <Card onClick={() => handleOpenEdit(m)}
                        sx={{ cursor:'pointer', borderRadius:'var(--radius)', border:'1px solid var(--border)',
                          boxShadow:'var(--shadow-sm)', position:'relative', overflow:'hidden',
                          transition:'all 0.18s', '&:hover':{ boxShadow:'var(--shadow)', transform:'translateY(-1px)' } }}>
                        <Box sx={{ position:'absolute', top:0, left:0, right:0, height:3, bgcolor:color }} />
                        <CardContent sx={{ p:'18px' }}>
                          <Box sx={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', mb:'10px' }}>
                            <Box sx={{ width:34, height:34, borderRadius:'50%', bgcolor: color,
                              display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <Typography sx={{ color:'#fff', fontSize:'0.7rem', fontWeight:700, lineHeight:1 }}>{getInitials(m.material_name)}</Typography>
                            </Box>
                          </Box>
                          <Typography sx={{ fontSize:'0.85rem', fontWeight:700, color:'var(--foreground)', letterSpacing:'-0.01em', mb:'2px' }}>{m.material_name}</Typography>
                          <Typography sx={{ fontSize:'0.68rem', color:'var(--muted)' }}>{m.grade || '—'} · density {m.density || '—'} g/cm3</Typography>
                          <Box sx={{ display:'flex', gap:'4px', my:'10px', flexWrap:'wrap' }}>
                            {m.form && <Badge color="#3B82F6">{m.form}</Badge>}
                            <Badge color="#16A34A">{m.unit}</Badge>
                            {m.shape && <Badge>{m.shape}</Badge>}
                          </Box>
                          <Box sx={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', py:'10px', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)', mb:'10px' }}>
                            <Box>
                              <Typography sx={{ fontSize:'0.58rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', mb:'2px', fontWeight:600 }}>Default Cost</Typography>
                              <Typography sx={{ fontSize:'0.8rem', fontWeight:700, color:'var(--primary)' }}>{m.default_cost ? `₹${m.default_cost.toLocaleString()}` : '—'}</Typography>
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize:'0.58rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', mb:'2px', fontWeight:600 }}>Unit</Typography>
                              <Typography sx={{ fontSize:'0.72rem', fontWeight:700, color:'var(--foreground)' }}>{m.unit}</Typography>
                            </Box>
                          </Box>
                          <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <VendorAvatars vendors={m.vendorMappings || []} />
                            <Box sx={{ textAlign:'right' }}>
                              <Typography sx={{ fontSize:'0.58rem', color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em', fontWeight:600 }}>{comp}%</Typography>
                              <Box sx={{ width:64, height:4, bgcolor: alpha('#1F7A63', 0.1), borderRadius:'2px', overflow:'hidden', mt:'2px' }}>
                                <Box sx={{ height:'100%', width:`${comp}%`, bgcolor:compColor, borderRadius:'2px' }} />
                              </Box>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })
              )}
            </Grid>
          )}
        </>
      )}

      {/* ANALYTICS TAB */}
      {tabIndex === 1 && (
        <Grid container spacing='14px'>
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius:'var(--radius)', border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)' }}>
              <CardContent sx={{ p:'20px' }}>
                <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase',
                  letterSpacing:'.06em', mb:'14px' }}>Materials by Form</Typography>
                <BarChart data={analyticsData.byForm} />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius:'var(--radius)', border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)' }}>
              <CardContent sx={{ p:'20px' }}>
                <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase',
                  letterSpacing:'.06em', mb:'14px' }}>Materials by Grade</Typography>
                <BarChart data={analyticsData.byGrade} />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius:'var(--radius)', border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)' }}>
              <CardContent sx={{ p:'20px' }}>
                <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase',
                  letterSpacing:'.06em', mb:'14px' }}>Top Cost Materials</Typography>
                <Box>
                  {analyticsData.topCost.map(m => (
                    <Box key={m.id} sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', p:'9px 11px',
                      bgcolor:'var(--accent)', borderRadius:'var(--radius-sm)', mb:'6px' }}>
                      <Typography sx={{ fontSize:'0.78rem', color:'var(--foreground)', fontWeight:600 }}>{m.material_name}</Typography>
                      <Typography sx={{ fontSize:'0.78rem', color:'var(--primary)', fontWeight:700 }}>₹{(m.default_cost || 0).toLocaleString()}</Typography>
                    </Box>
                  ))}
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card sx={{ borderRadius:'var(--radius)', border:'1px solid var(--border)', boxShadow:'var(--shadow-sm)' }}>
              <CardContent sx={{ p:'20px' }}>
                <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase',
                  letterSpacing:'.06em', mb:'14px' }}>Vendor Coverage</Typography>
                <BarChart data={analyticsData.byVendor} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ADD/EDIT DRAWER */}
      <Drawer anchor="right" open={drawerOpen} onClose={handleCloseDrawer}
        PaperProps={{ sx:{ width:560, maxWidth:'96vw', borderLeft:'1px solid var(--border)', boxShadow:'-8px 0 30px rgba(0,0,0,0.08)' } }}>
        <Box sx={{ display:'flex', alignItems:'center', gap:'12px', p:'16px 20px', borderBottom:'1px solid var(--border)' }}>
          <Typography sx={{ flex:1, fontSize:'0.9rem', fontWeight:700, color:'var(--foreground)', letterSpacing:'-0.01em' }}>
            {editingMaterial ? `Edit · ${editingMaterial.material_name}` : 'Add Material'}
          </Typography>
          <IconButton onClick={handleCloseDrawer} size="small"
            sx={{ color:'var(--muted)', width:30, height:30, '&:hover':{ bgcolor:'var(--accent)' } }}>
            <CloseIcon sx={{ fontSize:18 }} />
          </IconButton>
        </Box>

        <Box sx={{ flex:1, overflowY:'auto', p:'20px' }}>

          {formErrors._server && (
            <Alert severity="error" sx={{ mb:'16px', borderRadius:'var(--radius-sm)' }}>{formErrors._server}</Alert>
          )}

          {/* 01 Basic Info */}
          <Box sx={{ mb:'22px' }}>
            <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:'var(--primary)', letterSpacing:'.08em', textTransform:'uppercase', mb:'12px',
              display:'flex', alignItems:'center', gap:'8px',
              '&::after':{ content:'""', flex:1, height:1, bgcolor:'var(--border)' } }}>01  Basic Info</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12}>
                <TextField fullWidth label="Material Name *" placeholder="e.g. EN8 Steel Rod"
                  value={formName} onChange={e => setFormName(e.target.value)}
                  error={!!formErrors.name} helperText={formErrors.name} sx={fieldSx} size="small" />
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small" error={!!formErrors.grade} sx={fieldSx}>
                  <InputLabel>Grade *</InputLabel>
                  <Select value={formGrade} onChange={e => handleGradeChange(e.target.value as string)} label="Grade *">
                    {GRADES.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                  </Select>
                  {formErrors.grade && <FormHelperText>{formErrors.grade}</FormHelperText>}
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small" error={!!formErrors.form} sx={fieldSx}>
                  <InputLabel>Form *</InputLabel>
                  <Select value={formForm} onChange={e => { setFormForm(e.target.value as string); setFormShape(''); }} label="Form *">
                    {FORMS.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                  </Select>
                  {formErrors.form && <FormHelperText>{formErrors.form}</FormHelperText>}
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small" sx={fieldSx}>
                  <InputLabel>Shape</InputLabel>
                  <Select value={formShape} onChange={e => setFormShape(e.target.value as string)} label="Shape">
                    <MenuItem value="">Select...</MenuItem>
                    {availableShapes.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small" error={!!formErrors.unit} sx={fieldSx}>
                  <InputLabel>Unit *</InputLabel>
                  <Select value={formUnit} onChange={e => setFormUnit(e.target.value as string)} label="Unit *">
                    {UNITS.map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                  </Select>
                  {formErrors.unit && <FormHelperText>{formErrors.unit}</FormHelperText>}
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Density (g/cm3)" placeholder="7.85" type="number"
                  value={formDensity} onChange={e => setFormDensity(e.target.value)}
                  disabled={formGrade !== 'Custom' && formGrade !== '' && !!DENSITY_MAP[formGrade]}
                  helperText={formGrade && formGrade !== 'Custom' && DENSITY_MAP[formGrade] ? 'Auto-filled from grade' : formGrade === 'Custom' ? 'Editable for custom grade' : ''}
                  sx={fieldSx} size="small" inputProps={{ step: 0.01, min: 0 }} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Description" placeholder="Optional description" multiline minRows={2}
                  value={formDescription} onChange={e => setFormDescription(e.target.value)}
                  sx={fieldSx} size="small" />
              </Grid>
            </Grid>
          </Box>

          {/* 02 Cost */}
          <Box sx={{ mb:'22px' }}>
            <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:'var(--primary)', letterSpacing:'.08em', textTransform:'uppercase', mb:'12px',
              display:'flex', alignItems:'center', gap:'8px',
              '&::after':{ content:'""', flex:1, height:1, bgcolor:'var(--border)' } }}>02  Default Cost</Typography>
            <Grid container spacing={1.5}>
              <Grid item xs={12}>
                <TextField fullWidth label="Default Cost *" placeholder="0.00" type="number"
                  value={formCost} onChange={e => setFormCost(e.target.value)}
                  error={!!formErrors.cost} helperText={formErrors.cost}
                  sx={fieldSx} size="small" inputProps={{ step: 0.01, min: 0 }} />
              </Grid>
            </Grid>
          </Box>

          {/* 03 Vendor Mapping */}
          <Box>
            <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:'var(--primary)', letterSpacing:'.08em', textTransform:'uppercase', mb:'12px',
              display:'flex', alignItems:'center', gap:'8px',
              '&::after':{ content:'""', flex:1, height:1, bgcolor:'var(--border)' } }}>03  Vendor Mapping</Typography>

            {/* Header */}
            <Box sx={{ display:'grid', gridTemplateColumns:'1fr 88px 68px 32px 32px', gap:'8px', pb:'8px', mb:'6px', borderBottom:'1px solid var(--border)' }}>
              <Typography sx={{ fontSize:'0.58rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>Vendor</Typography>
              <Typography sx={{ fontSize:'0.58rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>Price/Unit</Typography>
              <Typography sx={{ fontSize:'0.58rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>Lead (d)</Typography>
              <Typography sx={{ fontSize:'0.58rem', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.05em' }}>Def</Typography>
              <Typography></Typography>
            </Box>

            {formVendors.map((v, i) => (
              <Box key={i} sx={{ display:'grid', gridTemplateColumns:'1fr 88px 68px 32px 32px', gap:'8px', alignItems:'center', py:'6px', borderBottom:'1px solid var(--border)' }}>
                <FormControl size="small" sx={{ '& .MuiOutlinedInput-root': { fontSize:'0.72rem', bgcolor:'var(--accent)', borderRadius:'var(--radius-sm)' } }}>
                  <Select value={v.vendor_id} onChange={e => handleVendorFieldChange(i, 'vendor_id', e.target.value)}
                    displayEmpty sx={{ fontSize:'0.72rem' }}>
                    <MenuItem value="" sx={{ fontSize:'0.72rem' }}>Select...</MenuItem>
                    {allVendors.map((vn: any) => <MenuItem key={vn.id} value={vn.id} sx={{ fontSize:'0.72rem' }}>{vn.vendor_name}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField size="small" type="number" placeholder="0.00" value={v.price_per_unit}
                  onChange={e => handleVendorFieldChange(i, 'price_per_unit', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root':{ fontSize:'0.72rem', bgcolor:'var(--accent)', borderRadius:'var(--radius-sm)' }, '& .MuiOutlinedInput-notchedOutline':{ borderColor:'var(--border)' } }}
                  inputProps={{ min: 0, step: 0.01 }} />
                <TextField size="small" type="number" placeholder="7" value={v.lead_time}
                  onChange={e => handleVendorFieldChange(i, 'lead_time', e.target.value)}
                  sx={{ '& .MuiOutlinedInput-root':{ fontSize:'0.72rem', bgcolor:'var(--accent)', borderRadius:'var(--radius-sm)' }, '& .MuiOutlinedInput-notchedOutline':{ borderColor:'var(--border)' } }}
                  inputProps={{ min: 1 }} />
                <IconButton size="small" onClick={() => handleSetPreferred(i)}
                  sx={{ width:28, height:28, bgcolor: v.is_default ? 'var(--primary-bg)' : 'var(--accent)',
                    border: v.is_default ? '1px solid' : '1px solid var(--border)',
                    borderColor: v.is_default ? alpha('#1F7A63', 0.20) : 'var(--border)',
                    borderRadius:'var(--radius-sm)', '&:hover':{ borderColor:'var(--primary)' } }}>
                  {v.is_default ? <StarIcon sx={{ fontSize:14, color:'var(--primary)' }} /> : <StarBorderIcon sx={{ fontSize:14, color:'var(--muted)' }} />}
                </IconButton>
                <IconButton size="small" onClick={() => handleRemoveVendor(i)}
                  sx={{ width:28, height:28, color:'var(--muted)',
                    '&:hover':{ bgcolor:'#FEF2F2', color:'#DC2626' } }}>
                  <CloseIcon sx={{ fontSize:14 }} />
                </IconButton>
              </Box>
            ))}

            <Button fullWidth onClick={handleAddVendor}
              sx={{ mt:'8px', py:'8px', border:'1px dashed var(--border)', borderRadius:'var(--radius-sm)',
                color:'#3B82F6', fontSize:'0.78rem', fontWeight:600, textTransform:'none',
                '&:hover':{ bgcolor: alpha('#3B82F6', 0.04), borderColor: alpha('#3B82F6', 0.3) } }}>
              + Add Vendor
            </Button>
          </Box>
        </Box>

        <Box sx={{ display:'flex', gap:'8px', p:'14px 20px', borderTop:'1px solid var(--border)', justifyContent:'flex-end' }}>
          <Button onClick={handleCloseDrawer}
            sx={{ color:'var(--secondary-foreground)', textTransform:'none', fontWeight:600, fontSize:'0.78rem' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={submitting}
            sx={{ bgcolor:'var(--primary)', textTransform:'none', fontWeight:700, fontSize:'0.78rem',
              borderRadius:'var(--radius-sm)', boxShadow:'none', '&:hover':{ bgcolor:'var(--primary-light)' } }}>
            {submitting ? 'Saving...' : editingMaterial ? 'Update Material' : 'Save Material'}
          </Button>
        </Box>
      </Drawer>

      {/* SUCCESS SNACKBAR */}
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

export default MaterialMasterNewPage;
