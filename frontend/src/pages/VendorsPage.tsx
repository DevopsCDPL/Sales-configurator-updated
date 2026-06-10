import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Grid, IconButton, Alert, InputAdornment, Snackbar,
  Tooltip, Chip, alpha, Skeleton, ToggleButtonGroup, ToggleButton, Switch,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Menu, MenuItem, ListItemIcon, ListItemText, Divider,
  Select, FormControl, InputLabel,
  Checkbox, Collapse, TableSortLabel,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import Rating from '@mui/material/Rating';
import {
  Add as AddIcon, Search as SearchIcon, Download as DownloadIcon, Upload as UploadIcon,
  Email as EmailIcon, Phone as PhoneIcon, LocationOn as LocationIcon,
  Business as BusinessIcon, Edit as EditIcon,
  Delete as DeleteIcon, ViewModule as GridViewIcon, ViewList as ListViewIcon,
  OpenInNew as OpenIcon, TrendingUp as TrendIcon,
  MoreVert as MoreIcon, Star as StarIcon,
  Refresh as RefreshIcon, Clear as ClearIcon,
  AccessTime as TimeIcon,
  Warning as WarningIcon,
  LocalShipping as ShipIcon,
  Block as BlockIcon, History as HistoryIcon,
  VerifiedUser as VerifiedIcon,
  Favorite as HealthIcon, Visibility as ViewIcon,
  ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon,
  ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import { vendorService } from '../services/vendorService';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import VendorFormModal from '../components/VendorFormModal';
import dayjs from 'dayjs';

/* --- Design Tokens ------------------------------------------------ */
const C = {
  primary: '#1F6F5C',
  primaryBg: '#E9F5F1',
  dark: '#1F2937',
  textSec: '#6B7280',
  textMuted: 'var(--text-muted)',
  border: 'var(--border)',
  bg: 'var(--bg-canvas)',
  white: '#FFFFFF',
};

/* --- helpers ------------------------------------------------------ */
const ROWS_PER_PAGE = 10;
const TIER_COLORS: Record<string, { bg: string; fg: string; border: string; label: string }> = {
  gold:   { bg: '#fef3c7', fg: '#92400e', label: 'Gold', border: '#F59E0B' },
  silver: { bg: '#f1f5f9', fg: '#6B7280', label: 'Silver', border: '#6B7280' },
  bronze: { bg: '#fed7aa', fg: '#9a3412', label: 'Bronze', border: '#EA580C' },
};
const RISK_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  low:    { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
  medium: { bg: '#fffbeb', fg: '#b45309', border: '#fde68a' },
  high:   { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
};

const PAL = [C.primary, '#0891b2', '#ea580c', '#166354', '#dc2626', '#1F7A63', '#d97706', '#059669'];
const hashColor = (s: string) => PAL[Math.abs([...(s || 'N')].reduce((a, c) => a + c.charCodeAt(0), 0)) % PAL.length];
const initials = (s: string) => (s || 'N').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
const n = (v: any) => Number(v) || 0;

/* --- enrich vendor with field-name mapping ----------------------- */
function enrich(v: any): any {
  const cats = v.service_categories && v.service_categories.length > 0
    ? v.service_categories
    : [];

  const risk = v.risk || 'low';
  const perf_score = n(v.perf_score);
  const on_time_pct = n(v.on_time_delivery) || n(v.on_time_pct);
  const rating = n(v.rating);

  const riskVal = risk === 'low' ? 100 : risk === 'medium' ? 50 : 10;
  const health_score = n(v.health_score) || (rating || perf_score || on_time_pct ? Math.round(
    (rating / 5) * 40 +
    (perf_score / 100) * 35 +
    (riskVal / 100) * 15 +
    (on_time_pct / 100) * 10
  ) : 0);

  return {
    ...v,
    company_name: v.vendor_name || v.company_name || '',
    contact_person: v.contact_person || v.contact_name || v.poc_name || '',
    contact_position: v.contact_position || v.position || '',
    email: v.contact_email || v.email || v.poc_email || '',
    phone: v.contact_phone || v.phone || v.poc_phone || '',
    address: v.address || v.location || '',
    location: v.location || v.address || '',
    status: v.status || (v.is_active === false ? 'Inactive' : 'Active'),
    tier: v.tier || '',
    risk,
    rating,
    total_orders: n(v.total_orders) || n(v.orders_done),
    orders_done: n(v.orders_done) || n(v.total_orders),
    on_time_delivery: on_time_pct,
    on_time_pct,
    perf_score,
    service_categories: cats,
    last_order_date: v.last_order_date || '',
    verified: v.verified ?? false,
    avg_response_hrs: n(v.avg_response_hrs),
    health_score,
    manager: v.manager || '',
    last_activity: v.last_activity || v.updated_at || v.created_at || '',
  };
}

/* --- sub-components ----------------------------------------------- */
const KPI: React.FC<{ label: string; value: string | number; sub?: string; icon: React.ReactElement<any>; color: string }> =
  ({ label, value, sub, icon, color }) => (
    <Box sx={{
      flex: '1 1 0', minWidth: 170, p: '14px 16px', bgcolor: 'var(--card)', borderRadius: 'var(--radius)',
      border: '1px solid var(--border)', borderLeft: `3px solid ${color}`,
      boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: '12px',
      transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 'var(--shadow)' },
    }}>
      <Box sx={{
        width: 38, height: 38, borderRadius: 'var(--radius-sm)', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: alpha(color, 0.08),
      }}>
        {React.cloneElement(icon, { sx: { fontSize: 20, color } })}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{
          fontSize: '0.65rem', fontWeight: 600, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '.06em', lineHeight: 1, mb: '4px', whiteSpace: 'nowrap',
        }}>
          {label}
        </Typography>
        <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>
          {value}
        </Typography>
        {sub && <Typography sx={{ fontSize: '0.6rem', fontWeight: 500, color: 'var(--muted)', mt: '2px' }}>{sub}</Typography>}
      </Box>
    </Box>
  );

const MiniBar: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color = C.primary }) => (
  <Box sx={{ mb: 0.75 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
      <Typography sx={{ fontSize: '0.68rem', color: C.textSec, fontWeight: 500 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color }}>{value}%</Typography>
    </Box>
    <LinearProgress variant="determinate" value={Math.min(value, 100)}
      sx={{ height: 4, borderRadius: 2, bgcolor: alpha(color, 0.1), '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 2 } }} />
  </Box>
);

const TierBadge: React.FC<{ tier: string }> = ({ tier }) => {
  const t = TIER_COLORS[tier] || TIER_COLORS.silver;
  return (
    <Box sx={{ display:'inline-flex', alignItems:'center', gap:'4px', px:'8px', py:'2px',
      borderRadius:'var(--radius-sm)', bgcolor:t.bg, border:`1px solid ${alpha(t.fg,0.12)}` }}>
      <Box sx={{ width:5, height:5, borderRadius:'50%', bgcolor:t.fg }} />
      <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:t.fg, lineHeight:1 }}>{t.label}</Typography>
    </Box>
  );
};

const RiskBadge: React.FC<{ risk: string }> = ({ risk }) => {
  const r = RISK_COLORS[risk] || RISK_COLORS.low;
  return (
    <Box sx={{ display:'inline-flex', alignItems:'center', gap:'4px', px:'8px', py:'2px',
      borderRadius:'var(--radius-sm)', bgcolor:r.bg, border:`1px solid ${alpha(r.fg,0.12)}` }}>
      <Box sx={{ width:5, height:5, borderRadius:'50%', bgcolor:r.fg }} />
      <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:r.fg, lineHeight:1 }}>{risk.charAt(0).toUpperCase() + risk.slice(1)} Risk</Typography>
    </Box>
  );
};

const HealthBadge: React.FC<{ score: number }> = ({ score }) => {
  const color = score >= 70 ? '#059669' : score >= 40 ? '#d97706' : '#dc2626';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <Box sx={{ width: 40, height: 8, borderRadius: '9999px', bgcolor: alpha(color, 0.15), overflow: 'hidden' }}>
        <Box sx={{ width: `${Math.min(score, 100)}%`, height: '100%', borderRadius: '9999px', bgcolor: color, transition: 'width 0.4s ease' }} />
      </Box>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, fontFamily: '"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace', color, fontVariantNumeric: 'tabular-nums' }}>{score}</Typography>
    </Box>
  );
};

/* ================================================================== */
const VendorsPage: React.FC = () => {
  const { user } = useAuth();
  const canWrite = user?.role === 'main_admin' || user?.role === 'admin' || user?.role === 'platform_admin';

  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  /* search & filter */
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [_tierFilter, _setTierFilter] = useState<string>('all');
  const [capFilter, setCapFilter] = useState<string>('all');
  const [_riskFilter, _setRiskFilter] = useState<string>('all');
  const [ratingMin, setRatingMin] = useState<number>(0);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [page, setPage] = useState(1);

  /* sorting */
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  /* bulk selection */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAnchor, setBulkAnchor] = useState<null | HTMLElement>(null);

  /* add/edit modal */
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();

  /* action menu */
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuVendor, setMenuVendor] = useState<any>(null);

  useEffect(() => { loadVendors(); }, []);

  const loadVendors = async () => {
    try {
      setLoading(true);
      const data = await vendorService.getAll();
      setVendors((data || []).map(enrich));
    } catch {
      setError('Error loading vendors');
    } finally {
      setLoading(false);
    }
  };

  /* metrics */
  const total = vendors.length;
  const active = vendors.filter(v => v.status?.toLowerCase() === 'active').length;
  const highRisk = vendors.filter(v => v.risk === 'high').length;
  const avgRating = total ? (vendors.reduce((s: number, v: any) => s + n(v.rating), 0) / total).toFixed(1) : '0.0';
  const newMonth = vendors.filter(v => dayjs(v.created_at).isSame(dayjs(), 'month')).length;

  /* all capability tags across vendors */
  const _allCaps = useMemo(() => {
    const set = new Set<string>();
    vendors.forEach(v => (v.service_categories || []).forEach((c: string) => set.add(c)));
    return Array.from(set).sort();
  }, [vendors]);

  /* all unique raw materials across vendors */
  const allMaterials = useMemo(() => {
    const set = new Set<string>();
    vendors.forEach(v => (v.vendorMaterials || []).forEach((m: any) => {
      const desc = (m.part_description || '').trim();
      if (desc) set.add(desc);
    }));
    return Array.from(set).sort();
  }, [vendors]);

  /* filters */
  const clearFilters = useCallback(() => {
    setSearchQuery(''); setStatusFilter('all'); setCapFilter('all');
    setRatingMin(0); setVerifiedOnly(false); setSelectedIds(new Set()); setPage(1);
  }, []);
  const hasFilters = searchQuery || statusFilter !== 'all' || capFilter !== 'all'
    || ratingMin > 0 || verifiedOnly;

  const filtered = useMemo(() => {
    let result = vendors.filter(v => {
      const q = searchQuery.toLowerCase();
      const ms = !q ||
        (v.company_name || '').toLowerCase().includes(q) ||
        (v.contact_person || '').toLowerCase().includes(q) ||
        (v.email || '').toLowerCase().includes(q) ||
        (v.address || '').toLowerCase().includes(q);
      const mSt = statusFilter === 'all' || v.status?.toLowerCase() === statusFilter;
      const mC = capFilter === 'all' || (v.vendorMaterials || []).some((m: any) => (m.part_description || '').trim() === capFilter);
      const mRa = n(v.rating) >= ratingMin;
      const mV = !verifiedOnly || v.verified;
      return ms && mSt && mC && mRa && mV;
    });
    // Sort
    const tierOrder: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };
    const riskOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
    result.sort((a: any, b: any) => {
      let av: any, bv: any;
      switch (sortBy) {
        case 'rating': av = n(a.rating); bv = n(b.rating); break;
        case 'risk': av = riskOrder[a.risk] || 0; bv = riskOrder[b.risk] || 0; break;
        case 'perf_score': av = n(a.perf_score); bv = n(b.perf_score); break;
        case 'on_time_pct': av = n(a.on_time_pct); bv = n(b.on_time_pct); break;
        case 'tier': av = tierOrder[a.tier] || 0; bv = tierOrder[b.tier] || 0; break;
        case 'health_score': av = n(a.health_score); bv = n(b.health_score); break;
        case 'orders_done': av = n(a.orders_done); bv = n(b.orders_done); break;
        case 'last_activity': av = a.last_activity || ''; bv = b.last_activity || ''; break;
        case 'created_at': av = a.created_at || ''; bv = b.created_at || ''; break;
        default: av = (a.company_name || '').toLowerCase(); bv = (b.company_name || '').toLowerCase();
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [vendors, searchQuery, statusFilter, capFilter, ratingMin, verifiedOnly, sortBy, sortDir]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, page]);

  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, capFilter, ratingMin, verifiedOnly]);

  /* sorting handlers */
  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  /* bulk selection */
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(v => v.id)));
  };

  const handleBulkAction = async (action: string) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setBulkAnchor(null);
    try {
      for (const id of ids) {
        if (action === 'activate') await vendorService.update(id, { status: 'Active' } as any);
        else if (action === 'suspend') await vendorService.update(id, { status: 'Suspended' } as any);
        else if (action === 'delete') await vendorService.delete(id);
        else if (action.startsWith('tier:')) await vendorService.update(id, { tier: action.split(':')[1] } as any);
      }
      setSuccessMsg(`Bulk ${action} applied to ${ids.length} vendor(s)`);
      setSelectedIds(new Set());
      loadVendors();
    } catch { setSuccessMsg('Bulk action failed'); }
  };

  /* CRUD actions */
  const handleOpenModal = (vendor?: any) => {
    if (vendor) {
      setEditingVendor({
        id: vendor.id,
        company_name: vendor.company_name || vendor.vendor_name || '',
        contact_person: vendor.contact_person || '',
        tax_id: vendor.tax_id || '',
        position: vendor.position || vendor.contact_position || '',
        email: vendor.email || vendor.contact_email || '',
        phone: vendor.phone || vendor.contact_phone || '',
        address: vendor.address || '',
        payment_terms: vendor.payment_terms || '',
        notes: vendor.notes || '',
        service_categories: vendor.service_categories || [],
        rating: vendor.rating || 0,
        status: vendor.status || 'Active',
        materials: (vendor.vendorMaterials || []).map((m: any) => ({
          part_description: m.part_description || '',
          material_grade: m.material_grade || '',
          dimension: m.dimension || '',
        })),
        cc_list: vendor.cc_list || [],
      });
    } else {
      setEditingVendor(null);
    }
    setModalOpen(true);
  };

  const handleSaveVendor = async (formData: any) => {
    try {
      const payload: any = {
        vendor_name: formData.company_name?.trim(),
        contact_person: formData.contact_person,
        contact_position: formData.position,
        contact_email: formData.email,
        contact_phone: formData.phone,
        address: formData.address,
        tax_id: formData.tax_id,
        notes: formData.notes,
        payment_terms: formData.payment_terms,
        service_categories: formData.service_categories,
        rating: formData.rating,
        is_active: formData.status === 'Active',
        materials: (formData.materials || []).filter(
          (m: any) => m.part_description || m.material_grade || m.dimension
        ),
        cc_list: formData.cc_list || [],
      };
      if (editingVendor?.id) {
        await vendorService.update(editingVendor.id, payload);
        setSuccessMsg('Vendor updated');
      } else {
        await vendorService.create(payload);
        setSuccessMsg('Vendor added');
      }
      setModalOpen(false);
      setEditingVendor(null);
      loadVendors();
    } catch (err: any) {
      throw err;
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const handleDelete = (id: string) => {
    const v = vendors.find((vn: any) => vn.id === id);
    if (v) setDeleteTarget(v);
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await vendorService.delete(deleteTarget.id); setSuccessMsg('Vendor deleted'); setDeleteTarget(null); loadVendors(); }
    catch (err: any) { setError(err.response?.data?.message || 'Error deleting vendor'); setDeleteTarget(null); }
    finally { setDeleting(false); }
  };

  const handleToggleStatus = async (vendor: any) => {
    const ns = vendor.status?.toLowerCase() === 'active' ? 'Inactive' : 'Active';
    try { await vendorService.update(vendor.id, { status: ns } as any); loadVendors(); }
    catch { setSuccessMsg('Failed to update status'); }
  };

  const handleSuspend = async (vendor: any) => {
    try { await vendorService.update(vendor.id, { status: 'Suspended' } as any); setSuccessMsg('Vendor suspended'); loadVendors(); }
    catch { setSuccessMsg('Failed to suspend vendor'); }
  };

  const exportToExcel = () => {
    const rows = filtered.map((v: any, i: number) => ({
      'S.No': i + 1,
      'Vendor ID': (v.id || '').substring(0, 8).toUpperCase(),
      'Vendor Name': v.company_name || '',
      'Contact Person': v.contact_person || '',
      'Email': v.email || '',
      'Phone': v.phone || '',
      'Address': v.address || '',
      'No of Orders': v.orders_done,
      'Status': v.status || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vendors');
    XLSX.writeFile(wb, `vendors-${dayjs().format('YYYY-MM-DD')}.xlsx`);
    setSuccessMsg(`Exported ${filtered.length} vendor(s)`);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      let added = 0, skipped = 0;
      for (const row of rows) {
        const name = row['Vendor Name'] || row['vendor_name'] || row['Company'] || row['company_name'] || '';
        if (!name.toString().trim()) { skipped++; continue; }
        try {
          await vendorService.create({
            vendor_name: name.toString().trim(),
            contact_person: (row['Contact Person'] || row['contact_person'] || '').toString(),
            contact_email: (row['Email'] || row['email'] || row['contact_email'] || '').toString(),
            contact_phone: (row['Phone'] || row['phone'] || row['contact_phone'] || '').toString(),
            address: (row['Address'] || row['address'] || '').toString(),
          } as any);
          added++;
        } catch { skipped++; }
      }
      setSuccessMsg(`Imported ${added} vendor(s)${skipped ? `, ${skipped} skipped` : ''}`);
      loadVendors();
    } catch { setError('Failed to read Excel file'); }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  return (
    <Box sx={{ pb: 4 }} className="animate-fadeIn">

      {/* === HEADER ==================================================== */}
      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:'20px', flexWrap:'wrap', gap:1.5 }}>
        <Box>
          <Typography sx={{ fontSize:'1.35rem', fontWeight:800, color:'var(--foreground)', letterSpacing:'-0.025em', lineHeight:1.2 }}>
            Vendor Management
          </Typography>
          <Typography sx={{ fontSize:'0.78rem', color:'var(--muted)', mt:'2px' }}>
            Manage your vendors, track performance, and monitor risk
          </Typography>
        </Box>
        <Box sx={{ display:'flex', gap:'8px', alignItems:'center' }}>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={loadVendors}
              sx={{ color:'var(--muted)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', width:34, height:34,
                transition:'all 0.15s', '&:hover':{ borderColor:'var(--primary)', color:'var(--primary)', bgcolor:'var(--primary-bg)' } }}>
              <RefreshIcon sx={{ fontSize:17 }} />
            </IconButton>
          </Tooltip>
          <Button variant="outlined" startIcon={<UploadIcon sx={{ fontSize:15 }} />}
            onClick={() => fileInputRef.current?.click()} disabled={importing}
            sx={{ textTransform:'none', borderRadius:'var(--radius-sm)', borderColor:'var(--border)', color:'var(--secondary-foreground)',
              fontWeight:600, fontSize:'0.78rem', height:34, transition:'all 0.15s',
              '&:hover':{ borderColor:'var(--primary)', color:'var(--primary)', bgcolor:'var(--primary-bg)' } }}>
            {importing ? 'Importing…' : 'Import'}
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImportExcel} />
          <Button variant="outlined" startIcon={<DownloadIcon sx={{ fontSize:15 }} />} onClick={exportToExcel}
            sx={{ textTransform:'none', borderRadius:'var(--radius-sm)', borderColor:'var(--border)', color:'var(--secondary-foreground)',
              fontWeight:600, fontSize:'0.78rem', height:34, transition:'all 0.15s',
              '&:hover':{ borderColor:'var(--primary)', color:'var(--primary)', bgcolor:'var(--primary-bg)' } }}>
            Export
          </Button>
          {canWrite && (
            <Button variant="contained" startIcon={<AddIcon sx={{ fontSize:17 }} />} onClick={() => handleOpenModal()}
              sx={{ bgcolor:'var(--primary)', '&:hover':{ bgcolor:'var(--primary-light)' }, textTransform:'none',
                fontWeight:700, borderRadius:'var(--radius-sm)', px:2, height:34, boxShadow:'none', fontSize:'0.78rem' }}>
              Create Vendor
            </Button>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb:'20px', borderRadius:'var(--radius-sm)' }} onClose={() => setError(null)}>{error}</Alert>}

      {/* === STATISTICS CARDS ========================================== */}
      <Box sx={{ display: 'flex', gap: '14px', mb: '20px', flexWrap: 'wrap' }}>
        <KPI label="Total Vendors" value={total} sub={newMonth ? `+${newMonth} this mo` : undefined} icon={<BusinessIcon />} color={C.primary} />
        <KPI label="Active Vendors" value={active} icon={<TrendIcon />} color={C.primary} />
        <KPI label="High Risk" value={highRisk} icon={<WarningIcon />} color="#dc2626" />
        <KPI label="Avg Rating" value={avgRating} icon={<StarIcon />} color="#d97706" />
      </Box>

      {/* === FILTER TOOLBAR ============================================ */}
      <Box sx={{ display:'flex', alignItems:'center', gap:'10px', mb:'20px', flexWrap:'wrap' }}>
        <TextField size="small" placeholder="Search name, contact, email…"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          sx={{ flex:'1 1 320px', maxWidth:400,
            '& .MuiOutlinedInput-root':{ borderRadius:'var(--radius)', fontSize:'0.8rem', height:38, bgcolor:'var(--card)',
              '&:hover .MuiOutlinedInput-notchedOutline':{ borderColor:'var(--primary)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor:'var(--primary)' } } }}
          InputProps={{ startAdornment:<InputAdornment position="start"><SearchIcon sx={{ fontSize:17, color:'var(--muted)' }} /></InputAdornment> }} />

        <FormControl size="small" sx={{ minWidth:110 }}>
          <InputLabel sx={{ fontSize:'0.78rem' }}>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value as string)}
            sx={{ borderRadius:'var(--radius)', fontSize:'0.78rem', height:38, bgcolor:'var(--card)' }}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
            <MenuItem value="suspended">Suspended</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth:110 }}>
          <InputLabel sx={{ fontSize:'0.78rem' }}>Rating</InputLabel>
          <Select value={ratingMin} label="Rating" onChange={e => setRatingMin(Number(e.target.value))}
            sx={{ borderRadius:'var(--radius)', fontSize:'0.78rem', height:38, bgcolor:'var(--card)' }}>
            <MenuItem value={0}>All Ratings</MenuItem>
            <MenuItem value={1}>1+ Stars</MenuItem>
            <MenuItem value={2}>2+ Stars</MenuItem>
            <MenuItem value={3}>3+ Stars</MenuItem>
            <MenuItem value={4}>4+ Stars</MenuItem>
            <MenuItem value={5}>5 Stars</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth:140 }}>
          <InputLabel sx={{ fontSize:'0.78rem' }}>Materials</InputLabel>
          <Select value={capFilter} label="Materials" onChange={e => setCapFilter(e.target.value as string)}
            sx={{ borderRadius:'var(--radius)', fontSize:'0.78rem', height:38, bgcolor:'var(--card)' }}>
            <MenuItem value="all">All Materials</MenuItem>
            {allMaterials.map(mat => <MenuItem key={mat} value={mat}>{mat}</MenuItem>)}
          </Select>
        </FormControl>

        <Button size="small" variant="text"
          endIcon={showAdvanced ? <ExpandLessIcon sx={{ fontSize:14 }} /> : <ExpandMoreIcon sx={{ fontSize:14 }} />}
          onClick={() => setShowAdvanced(v => !v)}
          sx={{ textTransform:'none', fontSize:'0.72rem', fontWeight:600, color:'var(--muted)', borderRadius:'var(--radius-sm)', height:38 }}>
          Advanced
        </Button>

        {hasFilters && (
          <Button size="small" startIcon={<ClearIcon sx={{ fontSize:14 }} />} onClick={clearFilters}
            sx={{ textTransform:'none', fontSize:'0.72rem', fontWeight:600, color:'var(--muted)', borderRadius:'var(--radius-sm)', height:38 }}>Clear</Button>
        )}

        <Box sx={{ ml:'auto', display:'flex', alignItems:'center' }}>
          <ToggleButtonGroup size="small" value={viewMode} exclusive onChange={(_,v) => v && setViewMode(v)}
            sx={{ '& .MuiToggleButton-root':{ border:'1px solid var(--border)', borderRadius:'var(--radius-sm) !important', width:38, height:38, p:0,
              transition:'all 0.15s',
              '&.Mui-selected':{ bgcolor:'var(--primary)', color:'#000', borderColor:'var(--primary)',
                '&:hover':{ bgcolor:'var(--primary-light)', color:'#000' } },
              '&:not(.Mui-selected):hover':{ bgcolor:'var(--accent)' },
              '&:not(:first-of-type)':{ ml:'6px' } } }}>
            <ToggleButton value="grid"><GridViewIcon sx={{ fontSize:17 }} /></ToggleButton>
            <ToggleButton value="table"><ListViewIcon sx={{ fontSize:17 }} /></ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* Advanced Filters */}
      <Collapse in={showAdvanced}>
        <Box sx={{ display:'flex', alignItems:'center', gap:2, mb:'20px', flexWrap:'wrap' }}>
          <Chip label="Verified Only" size="small" variant={verifiedOnly ? 'filled' : 'outlined'}
            icon={<VerifiedIcon sx={{ fontSize:'14px !important' }} />}
            onClick={() => setVerifiedOnly(!verifiedOnly)}
            sx={{
              borderRadius:'var(--radius-sm)', fontWeight:600, fontSize:'0.72rem', height:32,
              ...(verifiedOnly ? { bgcolor:'var(--primary)', color:'#000', '& .MuiChip-icon':{ color:'#000' } }
                               : { borderColor:'var(--border)', color:'var(--muted)' }),
            }} />
        </Box>
      </Collapse>

      {/* === BULK SELECTION BAR ======================================== */}
      {selectedIds.size > 0 && (
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 2, mb: 2, p: 1.5, borderRadius: 2.5,
          bgcolor: alpha(C.primary, 0.04), border: `1px solid ${alpha(C.primary, 0.12)}`,
        }}>
          <Checkbox size="small" checked={selectedIds.size === filtered.length} indeterminate={selectedIds.size > 0 && selectedIds.size < filtered.length}
            onChange={toggleSelectAll} sx={{ color: C.primary, '&.Mui-checked': { color: C.primary }, '&.MuiCheckbox-indeterminate': { color: C.primary } }} />
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: C.primary }}>{selectedIds.size} selected</Typography>
          <Box sx={{ ml: 'auto', display: 'flex', gap: 0.75 }}>
            <Button size="small" variant="outlined" onClick={() => handleBulkAction('activate')}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', borderRadius: 2, borderColor: alpha(C.primary, 0.3), color: C.primary }}>Activate</Button>
            <Button size="small" variant="outlined" onClick={() => handleBulkAction('suspend')}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', borderRadius: 2, borderColor: alpha('#f59e0b', 0.3), color: '#ca8a04' }}>Suspend</Button>
            <Button size="small" variant="outlined" onClick={e => setBulkAnchor(e.currentTarget)}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', borderRadius: 2, borderColor: alpha(C.primary, 0.3), color: C.primary }}>Change Tier</Button>
            <Menu anchorEl={bulkAnchor} open={!!bulkAnchor} onClose={() => setBulkAnchor(null)}
              PaperProps={{ sx: { borderRadius: 2, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', minWidth: 120 } }}>
              <MenuItem onClick={() => handleBulkAction('tier:gold')} sx={{ fontSize: '0.82rem' }}>Gold</MenuItem>
              <MenuItem onClick={() => handleBulkAction('tier:silver')} sx={{ fontSize: '0.82rem' }}>Silver</MenuItem>
              <MenuItem onClick={() => handleBulkAction('tier:bronze')} sx={{ fontSize: '0.82rem' }}>Bronze</MenuItem>
            </Menu>
            <Button size="small" variant="outlined" onClick={() => { if (window.confirm(`Delete ${selectedIds.size} vendor(s)?`)) handleBulkAction('delete'); }}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', borderRadius: 2, borderColor: alpha('#dc2626', 0.3), color: '#dc2626' }}>Delete</Button>
            <Button size="small" onClick={() => setSelectedIds(new Set())}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', borderRadius: 2, color: C.textMuted }}>Cancel</Button>
          </Box>
        </Box>
      )}

      {/* === GRID VIEW ================================================= */}
      {viewMode === 'grid' && (
        <Grid container spacing={2}>
          {loading ? Array.from({ length: 6 }).map((_, i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rounded" height={340} sx={{ borderRadius: 3 }} />
            </Grid>
          )) : filtered.length === 0 ? (
            <Grid item xs={12}>
              <Box sx={{ textAlign: 'center', py: 12 }}>
                <Box sx={{
                  width: 80, height: 80, borderRadius: '50%', bgcolor: alpha(C.primary, 0.06),
                  display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
                }}>
                  <BusinessIcon sx={{ fontSize: 40, color: '#cbd5e1' }} />
                </Box>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: C.textSec, mb: 0.5 }}>
                  {hasFilters ? 'No vendors match your filters' : 'Add your first vendor'}
                </Typography>
                <Typography sx={{ fontSize: '0.85rem', color: C.textMuted, mb: 3, maxWidth: 340, mx: 'auto' }}>
                  {hasFilters ? 'Try adjusting your filter criteria.' : 'Start tracking your supplier base to manage orders, materials, and performance.'}
                </Typography>
                {!hasFilters && canWrite && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenModal()}
                    sx={{ bgcolor: C.primary, '&:hover': { bgcolor: C.primary }, textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 3, boxShadow: 'none' }}>
                    Create Vendor
                  </Button>
                )}
                {hasFilters && (
                  <Button variant="outlined" onClick={clearFilters}
                    sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, borderColor: alpha('#000', 0.1), color: C.textSec }}>
                    Clear Filters
                  </Button>
                )}
              </Box>
            </Grid>
          ) : filtered.map((vendor: any, cardIdx: number) => {
            const c = hashColor(vendor.company_name);
            const isActive = vendor.status?.toLowerCase() === 'active';
            return (
              <Grid item xs={12} sm={6} md={4} key={vendor.id}>
                <Box sx={{
                  borderRadius: '12px', bgcolor: C.white, overflow: 'hidden',
                  border: `1px solid ${alpha('#000', 0.06)}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                  '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.06)', transform: 'translateY(-1px)' },
                  '&:hover .vendor-actions': { opacity: 1 },
                  animation: 'vendorFadeIn 500ms ease-out both',
                  animationDelay: `${cardIdx * 60}ms`,
                }}>
                  {/* accent strip */}
                  <Box sx={{ height: 3, bgcolor: c }} />
                  <Box sx={{ p: 2.5 }}>

                    {/* -- HEADER -- */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
                      <Box sx={{ position: 'relative' }}>
                        <Box sx={{
                          width: 46, height: 46, borderRadius: '10px', flexShrink: 0,
                          bgcolor: c,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Typography sx={{ color: '#fff', fontSize: '0.88rem', fontWeight: 700 }}>
                            {initials(vendor.company_name)}
                          </Typography>
                        </Box>
                        {vendor.verified && (
                          <VerifiedIcon sx={{ position: 'absolute', bottom: -3, right: -3, fontSize: 16, color: C.primary,
                            bgcolor: 'var(--bg-surface)', borderRadius: '50%', border: '1.5px solid var(--bg-surface)' }} />
                        )}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{
                          fontSize: '0.95rem', fontWeight: 700, color: C.dark,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          cursor: 'pointer', '&:hover': { color: c },
                        }}
                          onClick={() => handleOpenModal(vendor)}>
                          {vendor.company_name || 'N/A'}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
                          <TierBadge tier={vendor.tier} />
                          <RiskBadge risk={vendor.risk} />
                        </Box>
                      </Box>
                      {canWrite && (
                        <Tooltip title={isActive ? 'Active' : 'Inactive'}>
                          <Switch size="small" checked={isActive} onChange={() => handleToggleStatus(vendor)}
                            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: C.primary },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: C.primary } }} />
                        </Tooltip>
                      )}
                    </Box>

                    {/* -- CONTACT -- */}
                    <Box sx={{ mb: 1.5 }}>
                      <Typography sx={{ fontSize: '0.78rem', color: C.textSec, mb: 0.25 }}>
                        {vendor.contact_person || '\u2014'}
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                        {vendor.email && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <EmailIcon sx={{ fontSize: 12, color: '#cbd5e1' }} />
                            <Typography component="a" href={`mailto:${vendor.email}`}
                              sx={{
                                fontSize: '0.72rem', color: C.primary, textDecoration: 'none',
                                '&:hover': { textDecoration: 'underline' },
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}>
                              {vendor.email}
                            </Typography>
                          </Box>
                        )}
                        {vendor.phone && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <PhoneIcon sx={{ fontSize: 12, color: '#cbd5e1' }} />
                            <Typography sx={{ fontSize: '0.72rem', color: C.textSec }}>{vendor.phone}</Typography>
                          </Box>
                        )}
                        {vendor.address && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <LocationIcon sx={{ fontSize: 12, color: '#cbd5e1' }} />
                            <Typography sx={{ fontSize: '0.7rem', color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {vendor.address}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Box>

                    {/* -- METRICS -- */}
                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha('#000', 0.015), mb: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                        <Rating value={n(vendor.rating)} precision={0.5} readOnly size="small"
                          sx={{ '& .MuiRating-iconFilled': { color: '#f59e0b' }, fontSize: '0.95rem' }} />
                        <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: C.dark }}>{n(vendor.rating).toFixed(1)}</Typography>
                        <Chip size="small" label={`${vendor.orders_done} orders`}
                          sx={{ height: 18, fontSize: '0.6rem', fontWeight: 600, bgcolor: alpha('#000', 0.04), color: C.textSec, ml: 'auto' }} />
                      </Box>
                      <MiniBar label="On-time Delivery" value={vendor.on_time_pct} color={C.primary} />
                      <MiniBar label="Performance Score" value={vendor.perf_score} color={C.primary} />
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.75 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <HealthIcon sx={{ fontSize: 12, color: vendor.health_score >= 75 ? C.primary : vendor.health_score >= 55 ? '#ca8a04' : '#dc2626' }} />
                          <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: vendor.health_score >= 75 ? C.primary : vendor.health_score >= 55 ? '#ca8a04' : '#dc2626' }}>
                            Health: {vendor.health_score}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <TimeIcon sx={{ fontSize: 11, color: C.textMuted }} />
                          <Typography sx={{ fontSize: '0.65rem', color: C.textMuted }}>Resp: {vendor.avg_response_hrs}h</Typography>
                        </Box>
                      </Box>
                    </Box>

                    {/* -- SERVICE TAGS -- */}
                    {vendor.service_categories?.length > 0 && (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                        {vendor.service_categories.slice(0, 4).map((cap: string) => (
                          <Chip key={cap} label={cap} size="small"
                            sx={{
                              height: 22, fontSize: '0.65rem', fontWeight: 500,
                              bgcolor: 'var(--border-subtle)', color: C.textSec, borderRadius: '12px',
                            }} />
                        ))}
                        {vendor.service_categories.length > 4 && (
                          <Chip label={`+${vendor.service_categories.length - 4}`} size="small"
                            sx={{ height: 22, fontSize: '0.65rem', fontWeight: 600, bgcolor: C.primaryBg, color: C.primary, borderRadius: '12px' }} />
                        )}
                      </Box>
                    )}

                    {/* -- FOOTER -- */}
                    <Box sx={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      pt: 1.5, borderTop: `1px solid ${alpha('#000', 0.04)}`,
                    }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <TimeIcon sx={{ fontSize: 11, color: C.textMuted }} />
                        <Typography sx={{ fontSize: '0.65rem', color: C.textMuted }}>
                          Last order: {vendor.last_order_date ? dayjs(vendor.last_order_date).format('MMM D') : 'None'}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.25, alignItems: 'center' }}>
                        <Box className="vendor-actions" sx={{ display: 'flex', gap: 0.5, opacity: 0, transition: 'opacity 0.2s' }}>
                          <Tooltip title="View Profile">
                            <IconButton size="small" onClick={() => navigate(`/vendors/${vendor.id}`)}
                              sx={{ width: 32, height: 32, borderRadius: '6px', color: C.textMuted, transition: 'all 150ms ease', '&:hover': { bgcolor: alpha('#000', 0.06), color: C.primary } }}>
                              <OpenIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          {canWrite && (
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => handleOpenModal(vendor)}
                                sx={{ width: 32, height: 32, borderRadius: '6px', color: C.textMuted, transition: 'all 150ms ease', '&:hover': { bgcolor: alpha('#000', 0.06), color: C.primary } }}>
                                <EditIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                        <Tooltip title="More">
                          <IconButton size="small" onClick={e => { setMenuAnchor(e.currentTarget); setMenuVendor(vendor); }}
                            sx={{ width: 32, height: 32, borderRadius: '6px', color: C.textMuted, transition: 'all 150ms ease', '&:hover': { bgcolor: alpha('#000', 0.06) } }}>
                            <MoreIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* === TABLE VIEW ================================================ */}
      {viewMode === 'table' && (
        <TableContainer sx={{ borderRadius:'var(--radius)', border:'1px solid var(--border)', bgcolor:'var(--card)', boxShadow:'var(--shadow-sm)', overflow:'hidden' }}>
          <Table size="small" sx={{ tableLayout:'fixed', minWidth:640 }}>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 44 }} />
              <col style={{ width: 96 }} />
              <col />{/* vendor name — takes remaining space */}
              <col style={{ width: 120 }} />
              <col style={{ width: 148 }} />
              <col style={{ width: 108 }} />
            </colgroup>
            <TableHead>
              <TableRow sx={{ bgcolor:'var(--accent)',
                '& th':{ fontWeight:700, fontSize:'0.65rem', color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'.08em',
                  borderBottom:'1px solid var(--border)', py:'8px', px:'10px', position:'sticky', top:0, bgcolor:'var(--accent)', zIndex:1 } }}>
                <TableCell padding="checkbox" sx={{ width:36, px:'8px' }}>
                  <Checkbox size="small" checked={selectedIds.size === filtered.length && filtered.length > 0}
                    indeterminate={selectedIds.size > 0 && selectedIds.size < filtered.length}
                    onChange={toggleSelectAll}
                    sx={{ color:'var(--muted)', '&.Mui-checked':{ color:'var(--primary)' }, '&.MuiCheckbox-indeterminate':{ color:'var(--primary)' } }} />
                </TableCell>
                <TableCell>S.No</TableCell>
                <TableCell>Vendor ID</TableCell>
                <TableCell align="center">
                  <TableSortLabel active={sortBy === 'company_name'} direction={sortBy === 'company_name' ? sortDir : 'asc'} onClick={() => handleSort('company_name')}>Vendor Name</TableSortLabel>
                </TableCell>
                <TableCell align="center">
                  <TableSortLabel active={sortBy === 'orders_done'} direction={sortBy === 'orders_done' ? sortDir : 'asc'} onClick={() => handleSort('orders_done')}>No of Orders</TableSortLabel>
                </TableCell>
                <TableCell align="center">Total Purchase Value</TableCell>
                <TableCell align="center">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => (<TableCell key={j} sx={{ px:'14px' }}><Skeleton height={22} /></TableCell>))}</TableRow>
              )) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} sx={{ textAlign:'center', py:8, borderBottom:'none' }}>
                    <Box sx={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                      <Box sx={{ width:64, height:64, borderRadius:'50%', bgcolor:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', mb:1.5 }}>
                        <BusinessIcon sx={{ fontSize:28, color:'var(--muted)' }} />
                      </Box>
                      <Typography sx={{ fontSize:'0.9rem', fontWeight:700, color:'var(--secondary-foreground)', mb:0.5 }}>
                        {hasFilters ? 'No vendors match your filters' : 'No vendors yet'}
                      </Typography>
                      <Typography sx={{ fontSize:'0.78rem', color:'var(--muted)', mb:2 }}>
                        {hasFilters ? 'Try adjusting your filter criteria.' : 'Add your first vendor to get started.'}
                      </Typography>
                      {hasFilters && (
                        <Button size="small" variant="outlined" onClick={clearFilters}
                          sx={{ textTransform:'none', fontWeight:600, borderRadius:'var(--radius-sm)', borderColor:'var(--border)', color:'var(--secondary-foreground)' }}>
                          Clear Filters
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ) : paginated.map((vendor: any, idx: number) => {
                const c = hashColor(vendor.company_name);
                const isActive = vendor.status?.toLowerCase() === 'active';
                const isSelected = selectedIds.has(vendor.id);
                return (
                  <TableRow key={vendor.id} hover selected={isSelected}
                    sx={{ cursor:'pointer',
                      bgcolor: idx % 2 === 1 ? alpha('#F1F5F9', 0.5) : 'transparent',
                      borderLeft:'3px solid transparent',
                      transition:'all 0.15s ease',
                      '&:hover':{ bgcolor: alpha('#1F7A63', 0.03), borderLeftColor:'var(--primary)' },
                      '&.Mui-selected':{ bgcolor: alpha('#1F7A63', 0.03) },
                      '& td':{ fontSize:'0.8rem', color:'var(--card-foreground)', py:'6px', px:'10px', borderBottom:'1px solid var(--border-light)' } }}
                    onClick={() => handleOpenModal(vendor)}>
                    <TableCell padding="checkbox" onClick={e => e.stopPropagation()} sx={{ px:'8px' }}>
                      <Checkbox size="small" checked={isSelected} onChange={() => toggleSelect(vendor.id)}
                        sx={{ color:'var(--muted)', '&.Mui-checked':{ color:'var(--primary)' } }} />
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>
                        {(page - 1) * ROWS_PER_PAGE + idx + 1}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize:'0.75rem', fontWeight:700, color:'var(--muted)', fontFamily:'"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace', letterSpacing:'.04em' }}>
                        {(vendor.id || '').substring(0, 8).toUpperCase()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display:'flex', alignItems:'center', gap:'8px', overflow:'hidden' }}>
                        <Box sx={{ width:28, height:28, borderRadius:'50%', flexShrink:0, bgcolor: c,
                          display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <Typography sx={{ color:'#fff', fontSize:'0.62rem', fontWeight:700, lineHeight:1 }}>{initials(vendor.company_name)}</Typography>
                        </Box>
                        <Box sx={{ minWidth:0 }}>
                          <Typography sx={{ fontSize:'0.78rem', fontWeight:600, color:'var(--foreground)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {vendor.company_name}
                          </Typography>
                          <Typography sx={{ fontSize:'0.66rem', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{vendor.contact_person || '\u2014'}</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Typography sx={{ fontSize:'0.78rem', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{vendor.orders_done}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography sx={{ fontSize:'0.78rem', fontWeight:600, fontVariantNumeric:'tabular-nums', color:'var(--foreground)' }}>—</Typography>
                    </TableCell>
                    <TableCell align="center" onClick={e => e.stopPropagation()}>
                      <Box sx={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'2px' }}>
                        <Tooltip title="View">
                          <IconButton size="small" onClick={() => navigate(`/vendors/${vendor.id}`)}
                            sx={{ color:'var(--muted)', width:26, height:26, borderRadius:'6px',
                              '&:hover':{ bgcolor: alpha('#1F7A63', 0.08), color:'var(--primary)' } }}>
                            <ViewIcon sx={{ fontSize:15 }} />
                          </IconButton>
                        </Tooltip>
                        {canWrite && (
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => handleOpenModal(vendor)}
                              sx={{ color:'var(--muted)', width:26, height:26, borderRadius:'6px',
                                '&:hover':{ bgcolor: alpha('#1F7A63', 0.08), color:'var(--primary)' } }}>
                              <EditIcon sx={{ fontSize:15 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {canWrite && (
                          <Tooltip title="Delete">
                            <IconButton size="small" onClick={() => handleDelete(vendor.id)}
                              sx={{ color:'var(--muted)', width:26, height:26, borderRadius:'6px',
                                '&:hover':{ bgcolor: alpha('#dc2626', 0.08), color:'#dc2626' } }}>
                              <DeleteIcon sx={{ fontSize:15 }} />
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
      )}

      {/* === PAGINATION ================================================ */}
      {!loading && filtered.length > ROWS_PER_PAGE && (
        <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mt:'16px', px:'4px' }}>
          <Typography sx={{ fontSize:'0.75rem', color:'var(--muted)' }}>
            Showing {((page - 1) * ROWS_PER_PAGE) + 1}–{Math.min(page * ROWS_PER_PAGE, filtered.length)} of {filtered.length} vendors
          </Typography>
          <Box sx={{ display:'flex', alignItems:'center', gap:'4px' }}>
            <IconButton size="small" disabled={page === 1} onClick={() => setPage(p => p - 1)}
              sx={{ width:28, height:28, border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
                color:'var(--muted-foreground)', '&:hover':{ bgcolor:'var(--accent)' }, '&.Mui-disabled':{ opacity:0.4 } }}>
              <ChevronLeftIcon sx={{ fontSize:16 }} />
            </IconButton>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | string)[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                typeof p === 'string' ? (
                  <Typography key={`e${idx}`} sx={{ fontSize:'0.7rem', color:'var(--muted)', px:'4px' }}>…</Typography>
                ) : (
                  <Button key={p} size="small" onClick={() => setPage(p as number)}
                    sx={{ minWidth:28, height:28, p:0, fontSize:'0.7rem', fontWeight: page === p ? 700 : 500, borderRadius:'var(--radius-sm)',
                      bgcolor: page === p ? 'var(--primary)' : 'transparent', color: page === p ? '#fff' : 'var(--muted-foreground)',
                      border: page === p ? 'none' : '1px solid var(--border)',
                      '&:hover':{ bgcolor: page === p ? 'var(--primary)' : 'var(--accent)' } }}>
                    {p}
                  </Button>
                )
            )}
            <IconButton size="small" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
              sx={{ width:28, height:28, border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
                color:'var(--muted-foreground)', '&:hover':{ bgcolor:'var(--accent)' }, '&.Mui-disabled':{ opacity:0.4 } }}>
              <ChevronRightIcon sx={{ fontSize:16 }} />
            </IconButton>
          </Box>
        </Box>
      )}

      {/* === ACTIONS MENU ============================================== */}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}
        PaperProps={{ sx: { borderRadius: 2, boxShadow: '0 8px 24px rgba(0,0,0,0.08)', minWidth: 160 } }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
        <MenuItem onClick={() => { navigate(`/vendors/${menuVendor?.id}`); setMenuAnchor(null); }} sx={{ fontSize: '0.82rem', gap: 1.5, py: 1 }}>
          <ListItemIcon><OpenIcon sx={{ fontSize: 16 }} /></ListItemIcon><ListItemText>View</ListItemText>
        </MenuItem>
        {canWrite && (
          <MenuItem onClick={() => { handleOpenModal(menuVendor); setMenuAnchor(null); }} sx={{ fontSize: '0.82rem', gap: 1.5, py: 1 }}>
            <ListItemIcon><EditIcon sx={{ fontSize: 16 }} /></ListItemIcon><ListItemText>Edit</ListItemText>
          </MenuItem>
        )}
        {canWrite && (
          <MenuItem onClick={() => { handleDelete(menuVendor?.id); setMenuAnchor(null); }} sx={{ fontSize: '0.82rem', color: '#dc2626', gap: 1.5, py: 1 }}>
            <ListItemIcon><DeleteIcon sx={{ fontSize: 16, color: '#dc2626' }} /></ListItemIcon><ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* === ADD/EDIT VENDOR MODAL ===================================== */}
      <VendorFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingVendor(null); }}
        onSave={handleSaveVendor}
        initialData={editingVendor}
      />

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '16px', p: .5 } }}>
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700, color: '#1F2937', pb: .5, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ bgcolor: '#FEE2E2', borderRadius: '10px', p: .7, display: 'flex' }}><DeleteIcon sx={{ fontSize: 18, color: '#DC2626' }} /></Box>
          Delete Vendor
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Typography sx={{ fontSize: 13.5, color: '#6B7280' }}>
            Are you sure you want to delete <strong>&ldquo;{deleteTarget?.vendor_name}&rdquo;</strong>?
            All RFQs and purchase orders associated with this vendor will also be deleted. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} variant="outlined" disabled={deleting}
            sx={{ textTransform: 'none', fontSize: 13, color: '#6B7280', borderColor: 'var(--border)', borderRadius: '10px', px: 2 }}>Cancel</Button>
          <Button variant="contained" onClick={confirmDelete} disabled={deleting}
            sx={{ textTransform: 'none', fontSize: 13, fontWeight: 600, borderRadius: '10px', px: 2, boxShadow: 'none', bgcolor: '#EF4444', '&:hover': { bgcolor: '#DC2626' }, color: '#fff' }}>
            {deleting ? 'Deleting...' : 'Confirm Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!successMsg} autoHideDuration={3000} onClose={() => setSuccessMsg('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={() => setSuccessMsg('')} severity="success" variant="filled" sx={{ borderRadius: 2 }}>
          {successMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default VendorsPage;
