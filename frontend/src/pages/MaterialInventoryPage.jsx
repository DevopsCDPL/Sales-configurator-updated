import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  alpha,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  Clear as ClearIcon,
  Dashboard as DashboardIcon,
  Download as DownloadIcon,
  Inventory as InventoryIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { DataGrid } from '@mui/x-data-grid';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../services/api';
import { materialService } from '../services/materialService';

dayjs.extend(relativeTime);

const CATEGORY_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Raw Material', value: 'raw_material' },
  { label: 'Component', value: 'component' },
  { label: 'Consumable', value: 'consumable' },
];

const CATEGORY_STYLES = {
  raw_material: { label: 'Raw', bg: '#eff6ff', color: '#0D3D2F', border: '#bfdbfe' },
  component:    { label: 'Component', bg: '#E8F7F2', color: '#1F7A63', border: '#99f6e4' },
  consumable:   { label: 'Consumable', bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff' },
};

const STATUS_CFG = {
  in_stock:     { label: 'In Stock',     bg: '#ecfdf5', fg: '#059669', border: '#a7f3d0' },
  low_stock:    { label: 'Low Stock',    bg: '#fffbeb', fg: '#d97706', border: '#fde68a' },
  out_of_stock: { label: 'Out of Stock', bg: '#fef2f2', fg: '#dc2626', border: '#fecaca' },
};

const normalizeCategory = (cat) => {
  if (!cat) return 'component';
  const lower = String(cat).toLowerCase().replace(/[\s-]+/g, '_');
  if (['raw_material', 'raw', 'rawmaterial'].includes(lower)) return 'raw_material';
  if (['consumable', 'consumables'].includes(lower)) return 'consumable';
  return 'component';
};

const getStatus = (qty, threshold) => {
  if (qty <= 0) return 'out_of_stock';
  if (qty <= threshold) return 'low_stock';
  return 'in_stock';
};

const StatCard = ({ title, value, icon, color, delay = 0 }) => (
  <Paper
    elevation={0}
    sx={{
      p: 3,
      borderRadius: '12px',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${color}`,
      boxShadow: 'var(--shadow-sm)',
      transition: 'all .2s ease',
      animation: `matInvFadeIn .5s cubic-bezier(0.16,1,0.3,1) ${delay}ms both`,
      '&:hover': { boxShadow: 'var(--shadow-md)', transform: 'translateY(-1px)' },
    }}
  >
    <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
      <Box>
        <Typography sx={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.1em' }}>
          {title}
        </Typography>
        <Typography sx={{ mt: .8, fontSize: '1.85rem', fontWeight: 700, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </Typography>
      </Box>
      <Box sx={{ width: 40, height: 40, borderRadius: '50%', bgcolor: alpha(color, .1), color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {icon}
      </Box>
    </Stack>
  </Paper>
);

const MaterialInventoryPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim().toLowerCase()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [materialsRes, stockRes] = await Promise.allSettled([
        materialService.getAll(),
        api.get('/material-stock').then(r => r.data?.data || r.data || []),
      ]);

      setMaterials(materialsRes.status === 'fulfilled' ? (materialsRes.value || []) : []);
      setStocks(stockRes.status === 'fulfilled' ? (stockRes.value || []) : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const rows = useMemo(() => {
    const stockMap = new Map((stocks || []).map(s => [s.material_id, s]));
    return (materials || []).map(m => {
      const s = stockMap.get(m.id);
      const qty = Number(s?.current_quantity ?? 0);
      const threshold = Number(m.low_stock_threshold || m.reorder_level || 20);
      return {
        id: m.id,
        materialName: m.material_name || m.name || 'Unnamed',
        category: normalizeCategory(m.category),
        unit: m.unit || s?.unit || 'Kg',
        currentQuantity: qty,
        threshold,
        status: getStatus(qty, threshold),
        lastUpdated: s?.last_updated || m.updated_at || m.created_at || new Date().toISOString(),
      };
    });
  }, [materials, stocks]);

  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      if (activeTab !== 'all' && r.category !== activeTab) return false;
      if (!debouncedSearch) return true;
      return r.materialName.toLowerCase().includes(debouncedSearch) || r.unit.toLowerCase().includes(debouncedSearch);
    });
  }, [rows, activeTab, debouncedSearch]);

  const stats = useMemo(() => ({
    total: rows.length,
    inStock: rows.filter(r => r.status === 'in_stock').length,
    lowStock: rows.filter(r => r.status === 'low_stock').length,
    outOfStock: rows.filter(r => r.status === 'out_of_stock').length,
  }), [rows]);

  const columns = useMemo(() => [
    {
      field: 'materialName', headerName: 'Material Name', flex: 1.4, minWidth: 200,
      renderCell: p => <Typography sx={{ fontWeight: 500, fontSize: '0.875rem' }}>{p.value}</Typography>,
    },
    {
      field: 'category', headerName: 'Category', flex: .8, minWidth: 130, align: 'center', headerAlign: 'center',
      renderCell: p => {
        const s = CATEGORY_STYLES[p.value] || CATEGORY_STYLES.component;
        return (
          <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Chip size="small" label={s.label}
              sx={{ bgcolor: s.bg, color: s.color, border: `1px solid ${s.border}`, fontWeight: 500, fontSize: '0.75rem', borderRadius: '6px', px: 0.5, height: 24 }} />
          </Box>
        );
      },
    },
    {
      field: 'currentQuantity', headerName: 'Quantity', flex: .8, minWidth: 120, align: 'center', headerAlign: 'center',
      renderCell: p => (
        <Box sx={{ width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: '"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace', fontSize: '0.875rem' }}>
            {Number(p.value).toLocaleString()}
          </Typography>
          <Typography component="span" sx={{ color: 'var(--muted)', fontSize: '0.7rem', ml: 0.5 }}>{p.row.unit}</Typography>
        </Box>
      ),
    },
    {
      field: 'stockLevel', headerName: 'Stock Level', sortable: false, flex: 1, minWidth: 200, align: 'center', headerAlign: 'center',
      renderCell: p => {
        const level = Math.min(100, Math.round((p.row.currentQuantity / Math.max(1, p.row.threshold)) * 100));
        const barColor = level >= 60 ? '#10b981' : level >= 20 ? '#f59e0b' : '#ef4444';
        return (
          <Box sx={{ width: '100%', maxWidth: 170, mx: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ flex: 1, height: 8, borderRadius: '9999px', bgcolor: alpha('#94a3b8', 0.15), overflow: 'hidden' }}>
              <Box sx={{ width: `${level}%`, height: '100%', borderRadius: '9999px', bgcolor: barColor, transition: 'width 0.4s ease' }} />
            </Box>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: barColor, minWidth: 32, textAlign: 'right' }}>{level}%</Typography>
          </Box>
        );
      },
    },
    {
      field: 'lastUpdated', headerName: 'Last Updated', flex: .9, minWidth: 170, align: 'center', headerAlign: 'center',
      valueGetter: p => dayjs(p.value).format('DD MMM YYYY, HH:mm'),
      renderCell: p => (
        <Tooltip title={dayjs(p.row.lastUpdated).fromNow()} arrow placement="top">
          <Box sx={{ width: '100%', textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.75rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{p.value}</Typography>
          </Box>
        </Tooltip>
      ),
    },
    {
      field: 'status', headerName: 'Status', flex: .85, minWidth: 150, align: 'center', headerAlign: 'center',
      renderCell: p => {
        const cfg = STATUS_CFG[p.value] || STATUS_CFG.low_stock;
        return (
          <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Box sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.75,
              px: 1.5, py: 0.25, borderRadius: '9999px',
              bgcolor: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.border}`,
              fontWeight: 500, fontSize: '0.75rem',
            }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: cfg.fg }} />
              {cfg.label}
            </Box>
          </Box>
        );
      },
    },
  ], []);

  const hasFilters = activeTab !== 'all' || debouncedSearch;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, px: { md: 3 }, maxWidth: 1600, mx: 'auto' }}>
      <style>{`
        @keyframes matInvFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* === PAGE HEADER === */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: '1.4rem', fontWeight: 800 }}>Material Inventory</Typography>
          <Typography sx={{ fontSize: '0.84rem', color: 'var(--muted)', mt: 0.25 }}>Track real-time stock levels across all materials</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
            sx={{ textTransform: 'none', borderRadius: 2, borderColor: 'var(--border)', color: 'var(--muted-foreground)', fontWeight: 600, fontSize: '0.82rem' }}>
            Export
          </Button>
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => navigate('/material-master?action=add')}
            sx={{ bgcolor: '#1F7A63', '&:hover': { bgcolor: '#166354' }, textTransform: 'none', fontWeight: 700, borderRadius: 2, px: 2.5, boxShadow: 'none' }}>
            Add Material
          </Button>
        </Box>
      </Box>

      {/* === STATS === */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard title="Total Materials" value={stats.total} icon={<InventoryIcon fontSize="small" />} color="#1F7A63" />
        <StatCard title="In Stock" value={stats.inStock} icon={<InventoryIcon fontSize="small" />} color="#16A34A" delay={60} />
        <StatCard title="Low Stock" value={stats.lowStock} icon={<InventoryIcon fontSize="small" />} color="#F59E0B" delay={120} />
        <StatCard title="Out of Stock" value={stats.outOfStock} icon={<InventoryIcon fontSize="small" />} color="#DC2626" delay={180} />
      </Box>

      {/* === SEARCH + CATEGORY TABS === */}
      <Paper elevation={0} sx={{ px: 2.5, py: 1.5, mb: 2, borderRadius: '10px', border: '1px solid var(--border)', bgcolor: 'var(--card, #fff)' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
          <TextField
            size="small"
            placeholder="Search materials..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: 'var(--muted)', fontSize: 20 }} /></InputAdornment> }}
            sx={{
              width: 320,
              '& .MuiOutlinedInput-root': {
                height: 40, borderRadius: '8px', bgcolor: alpha('#94a3b8', 0.06),
                transition: 'background-color 0.2s ease',
                '&.Mui-focused': { bgcolor: 'var(--bg-input)', boxShadow: '0 0 0 2px rgba(0,200,255,0.15)' },
              },
              '& input::placeholder': { color: alpha('#94a3b8', 0.6), opacity: 1 },
            }}
          />
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}
            sx={{
              minHeight: 36,
              '& .MuiTabs-indicator': { height: 2 },
              '& .MuiTab-root': {
                minHeight: 36, textTransform: 'none', fontWeight: 500, fontSize: '0.84rem',
                pb: 1, px: 1, color: 'var(--muted)',
                transition: 'color 0.2s ease',
                '&:hover': { color: 'var(--foreground)' },
                '&.Mui-selected': { color: '#1F7A63', fontWeight: 600 },
              },
            }}>
            {CATEGORY_TABS.map(t => <Tab key={t.value} value={t.value} label={t.label} />)}
          </Tabs>
        </Stack>
      </Paper>

      {/* === DATA GRID === */}
      <Paper elevation={0} sx={{ borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        {loading ? (
          <Box sx={{ p: 3 }}>{[...Array(5)].map((_, i) => <Skeleton key={i} height={48} sx={{ mb: 1 }} />)}</Box>
        ) : filteredRows.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <Box sx={{ width: 72, height: 72, borderRadius: '50%', bgcolor: alpha('#94a3b8', 0.08), display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
              <InventoryIcon sx={{ fontSize: 36, color: 'var(--muted)' }} />
            </Box>
            <Typography sx={{ fontWeight: 700, mb: .5, fontSize: '1.05rem' }}>
              {hasFilters ? 'No materials match your filters' : 'No materials found'}
            </Typography>
            <Typography sx={{ fontSize: '0.84rem', color: 'var(--muted)', mb: 3, maxWidth: 340, mx: 'auto' }}>
              {hasFilters ? 'Try adjusting your search or filter criteria.' : 'Add your first material to start tracking inventory.'}
            </Typography>
            {hasFilters && (
              <Button variant="outlined" startIcon={<ClearIcon sx={{ fontSize: 14 }} />}
                onClick={() => { setSearchInput(''); setActiveTab('all'); }}
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                Clear Filters
              </Button>
            )}
          </Box>
        ) : (
          <DataGrid
            rows={filteredRows}
            columns={columns}
            autoHeight
            disableRowSelectionOnClick
            rowHeight={56}
            columnHeaderHeight={44}
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
            sx={{
              border: 'none',
              '& .MuiDataGrid-columnHeaders': {
                bgcolor: alpha('#94a3b8', 0.08),
                borderBottom: '2px solid var(--border)',
              },
              '& .MuiDataGrid-columnHeaderTitle': {
                fontWeight: 600, fontSize: '11px', textTransform: 'uppercase',
                letterSpacing: '.06em', color: 'var(--muted)',
              },
              '& .MuiDataGrid-cell': {
                borderBottom: '1px solid var(--border-light)',
                display: 'flex', alignItems: 'center',
              },
              '& .MuiDataGrid-row': {
                transition: 'background-color 150ms ease',
                '&:nth-of-type(even)': { bgcolor: alpha('#94a3b8', 0.03) },
                '&:hover': { bgcolor: alpha('#94a3b8', 0.06) },
              },
              '& .MuiDataGrid-footerContainer': {
                minHeight: 48, px: 1.5, borderTop: '1px solid var(--border)',
                justifyContent: 'space-between',
              },
              '& .MuiTablePagination-root': { width: '100%', fontSize: '0.84rem', color: 'var(--muted)' },
              '& .MuiTablePagination-toolbar': {
                minHeight: 48, px: 0.5, display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 1,
              },
              '& .MuiTablePagination-select': {
                height: 32, borderRadius: '6px', border: '1px solid var(--border)',
                fontSize: '0.75rem',
              },
              '& .MuiTablePagination-displayedRows': {
                fontSize: '0.84rem', color: 'var(--muted)',
              },
              '& .MuiTablePagination-actions button': {
                width: 32, height: 32, borderRadius: '6px',
                transition: 'background-color 150ms ease',
                '&:hover': { bgcolor: alpha('#94a3b8', 0.12) },
              },
            }}
          />
        )}
      </Paper>
    </Box>
  );
};

export default MaterialInventoryPage;
