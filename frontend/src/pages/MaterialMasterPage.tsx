import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Select, MenuItem, Chip,
  Table, TableHead, TableRow, TableCell, TableBody, IconButton,
  Dialog, DialogContent, DialogActions, InputAdornment,
  alpha, FormControl, InputLabel, Fade, Tooltip, SelectChangeEvent,
  Checkbox, Snackbar, Alert, Divider, TableContainer,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Inventory2 as InventoryIcon,
  Category as CategoryIcon,
  Close as CloseIcon,
  Description as DescIcon,
  Straighten as UnitIcon,
  ContentCopy as CopyIcon,
  ArrowUpward as SortUpIcon,
  ArrowDownward as SortDownIcon,
  Build as BuildIcon,
  Block as BlockIcon,
  Save as SaveIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { materialService } from '../services/materialService';
import { stockService } from '../services/stockService';
import { Material, MaterialCategory, StockItem } from '../types';
import dayjs from 'dayjs';

/* ========================================================================
   DESIGN TOKENS  (Uses CSS variables for consistency with rest of system)
   ======================================================================== */
const T = {
  primary: '#1F7A63',
  primaryLight: '#2A9D7E',
  primaryBg: '#E8F7F2',
  bg: '#F0F2F5',
  card: '#FFFFFF',
  border: 'var(--border)',
  borderLight: 'var(--border-subtle)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  textFaint: 'var(--text-muted)',
  red: '#EF4444',
  redBg: '#FEF2F2',
  orange: '#F59E0B',
  orangeBg: '#FFFBEB',
  blue: '#3B82F6',
  blueBg: '#EFF6FF',
  shadow: '0 1px 2px rgba(0,0,0,0.04)',
  shadowSm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd: '0 4px 12px rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.03)',
  shadowLg: '0 12px 24px -4px rgba(0,0,0,.08), 0 4px 8px -2px rgba(0,0,0,.03)',
  radius: '12px',
  radiusLg: '16px',
  radiusSm: '8px',
};

const CATEGORY_OPTIONS: MaterialCategory[] = ['raw_material', 'consumable', 'safety_equipment', 'tools'];
const UNIT_OPTIONS = ['Kg', 'Pieces', 'Liters', 'Meters'];

const fmtCategory = (c: string) =>
  c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

const fmtDate = (d: string) => {
  if (!d) return '\u2014';
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
};

/* -- Column header styles ------------------------------------------------- */
const thSx = {
  fontWeight: 700, fontSize: '0.65rem', color: T.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: '.08em',
  borderBottom: `1px solid ${T.border}`,
  py: '10px', px: '14px',
  height: 44,
  verticalAlign: 'middle' as const,
  whiteSpace: 'nowrap' as const,
  position: 'sticky' as const, top: 0, bgcolor: T.borderLight, zIndex: 1,
};

const thSortSx = {
  ...thSx,
  cursor: 'pointer', userSelect: 'none' as const,
  transition: 'color 0.15s',
  '&:hover': { color: T.textSecondary },
};

/* -- Shared input styles -------------------------------------------------- */
const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: T.radiusSm, fontSize: '0.85rem', bgcolor: T.card, transition: 'all .2s',
    '& fieldset': { borderColor: T.border },
    '&:hover fieldset': { borderColor: T.textMuted },
    '&.Mui-focused fieldset': { borderColor: T.primary, borderWidth: '1.5px' },
  },
  '& .MuiInputLabel-root': {
    fontSize: '0.82rem', fontWeight: 500, color: T.textSecondary,
    '&.Mui-focused': { color: T.primary, fontWeight: 600 },
  },
};

/* ========================================================================
   MAIN COMPONENT
   ======================================================================== */
const MaterialMasterPage: React.FC = () => {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [_editMaterial, setEditMaterial] = useState<Material | null>(null);
  const [form, setForm] = useState<Partial<Material>>({
    category: 'raw_material', unit: 'Kg', is_active: true,
  });

  /* Filters, Sorting & Selection */
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('material_name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  /* ---- Stock section state ---- */
  const defaultStockRow = { part_description: '', material_grade: '', dimension: '', quantity: '' };
  const [stockRows, setStockRows] = useState<any[]>([{ ...defaultStockRow }]);
  const [existingStock, setExistingStock] = useState<StockItem[]>([]);
  const [stockMsg, setStockMsg] = useState('');
  const [stockMsgSeverity, setStockMsgSeverity] = useState<'success' | 'error'>('success');
  const [savingStock, setSavingStock] = useState(false);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editingStockQty, setEditingStockQty] = useState<string>('');

  /* ---- Data fetch ---- */
  const fetchMaterials = async () => {
    const data = await materialService.getAll({ search });
    setMaterials(data);
  };

  const fetchStock = useCallback(async () => {
    try {
      const data = await stockService.getAll();
      setExistingStock(data);
    } catch {}
  }, []);

  useEffect(() => { fetchMaterials(); }, [search]); // eslint-disable-line
  useEffect(() => { setSelectedIds([]); }, [categoryFilter, search]);
  useEffect(() => { fetchStock(); }, [fetchStock]);

  /* ---- Stock handlers ---- */
  const handleStockRowChange = (idx: number, field: string, value: string) => {
    setStockRows(rows => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };
  const handleAddStockRow = () => setStockRows(rows => [...rows, { ...defaultStockRow }]);
  const handleRemoveStockRow = (idx: number) => setStockRows(rows => rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows);

  const handleSaveStock = async () => {
    const valid = stockRows.filter(r => r.part_description.trim() && r.material_grade.trim() && Number(r.quantity) > 0);
    if (valid.length === 0) {
      setStockMsgSeverity('error');
      setStockMsg('Please fill in at least one complete row (Part Description, Material & Grade, Quantity > 0)');
      return;
    }
    setSavingStock(true);
    try {
      await stockService.bulkCreate(valid.map(r => ({
        part_description: r.part_description,
        material_grade: r.material_grade,
        dimension: r.dimension,
        quantity: Number(r.quantity),
      })));
      setStockMsgSeverity('success');
      setStockMsg(`${valid.length} stock item(s) saved successfully`);
      setStockRows([{ ...defaultStockRow }]);
      fetchStock();
    } catch {
      setStockMsgSeverity('error');
      setStockMsg('Failed to save stock');
    } finally { setSavingStock(false); }
  };

  const handleUpdateStockQty = async (id: string) => {
    const qty = Number(editingStockQty);
    if (isNaN(qty) || qty < 0) {
      setStockMsgSeverity('error');
      setStockMsg('Please enter a valid quantity');
      return;
    }
    try {
      await stockService.update(id, { quantity: qty });
      setStockMsgSeverity('success');
      setStockMsg('Stock quantity updated');
      setEditingStockId(null);
      setEditingStockQty('');
      fetchStock();
    } catch {
      setStockMsgSeverity('error');
      setStockMsg('Failed to update stock quantity');
    }
  };

  const handleDeleteExistingStock = async (id: string) => {
    if (!window.confirm('Delete this stock item?')) return;
    try {
      await stockService.delete(id);
      setStockMsgSeverity('success');
      setStockMsg('Stock item deleted');
      fetchStock();
    } catch {
      setStockMsgSeverity('error');
      setStockMsg('Failed to delete stock item');
    }
  };

  /* Build dropdown options from materials */
  const partOptions = useMemo(() => {
    const names = new Set(materials.map(m => m.material_name));
    return Array.from(names).sort();
  }, [materials]);

  const gradeOptions = useMemo(() => {
    const cats = materials.map(m => `${fmtCategory(m.category)} - ${m.unit}`);
    const unique = new Set(cats);
    return Array.from(unique).sort();
  }, [materials]);

  /* ---- Sorting ---- */
  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  /* ---- Computed ---- */
  const summaryStats = useMemo(() => ({
    total: materials.length,
    rawMaterials: materials.filter(m => m.category === 'raw_material').length,
    consumables: materials.filter(m => m.category === 'consumable').length,
    inactive: materials.filter(m => !m.is_active).length,
  }), [materials]);

  const displayMaterials = useMemo(() => {
    let list = [...materials];
    if (categoryFilter !== 'all') list = list.filter(m => m.category === categoryFilter);
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'material_name') cmp = (a.material_name || '').localeCompare(b.material_name || '');
      else if (sortField === 'category') cmp = (a.category || '').localeCompare(b.category || '');
      else if (sortField === 'status') cmp = (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1);
      else if (sortField === 'updated_at') cmp = (a.updated_at || '').localeCompare(b.updated_at || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [materials, categoryFilter, sortField, sortDir]);

  /* ---- CRUD Handlers ---- */
  const handleOpen = () => {
    setEditMaterial(null);
    setForm({ category: 'raw_material', unit: 'Kg', is_active: true });
    setOpen(true);
  };

  const handleClose = () => { setOpen(false); setEditMaterial(null); };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = async () => {
    const nameExists = materials.some(m =>
      m.material_name.toLowerCase().trim() === (form.material_name || '').toLowerCase().trim()
    );
    if (nameExists) { alert('Material with this name already exists.'); return; }
    await materialService.create(form);
    handleClose();
    fetchMaterials();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this material?')) return;
    await materialService.delete(id);
    fetchMaterials();
  };

  const handleToggleStatus = async (id: string) => {
    await materialService.toggleStatus(id);
    fetchMaterials();
  };

  const handleCopy = (m: Material) => {
    setEditMaterial(null);
    setForm({
      material_name: `${m.material_name} (Copy)`,
      category: m.category,
      unit: m.unit,
      description: m.description || '',
      is_active: true,
    });
    setOpen(true);
  };

  /* ---- Bulk Selection ---- */
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === displayMaterials.length && displayMaterials.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayMaterials.map(m => m.id));
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(` Delete ${selectedIds.length} selected materials?`)) return;
    await Promise.all(selectedIds.map(id => materialService.delete(id)));
    setSelectedIds([]);
    fetchMaterials();
  };

  const handleBulkActivate = async () => {
    const toActivate = materials.filter(m => selectedIds.includes(m.id) && !m.is_active);
    if (toActivate.length === 0) { alert('All selected materials are already active.'); return; }
    await Promise.all(toActivate.map(m => materialService.toggleStatus(m.id)));
    setSelectedIds([]);
    fetchMaterials();
  };

  const handleBulkDeactivate = async () => {
    const toDeactivate = materials.filter(m => selectedIds.includes(m.id) && m.is_active);
    if (toDeactivate.length === 0) { alert('All selected materials are already inactive.'); return; }
    await Promise.all(toDeactivate.map(m => materialService.toggleStatus(m.id)));
    setSelectedIds([]);
    fetchMaterials();
  };

  /* ---- Export CSV ---- */
  const exportToCSV = () => {
    const headers = ['Material Name','Category','Unit','Status','Last Updated'];
    const rows = displayMaterials.map(m => [
      m.material_name || '', fmtCategory(m.category), m.unit || '',
      m.is_active ? 'Active' : 'Inactive', m.updated_at || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `materials-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
  };

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <Box sx={{ pb: 4 }} className="animate-fadeIn">

      {/* ================================================================
          HEADER  — matches Client Management layout
          ================================================================ */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        mb: '20px', flexWrap: 'wrap', gap: 1.5,
      }}>
        <Box>
          <Typography sx={{
            fontSize: '1.35rem', fontWeight: 800, color: 'var(--foreground)',
            letterSpacing: '-0.025em', lineHeight: 1.2,
          }}>
            Material Stock
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: 'var(--muted)', mt: '2px' }}>
            Manage raw materials, consumables, tools &amp; equipment
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={() => fetchMaterials()}
              sx={{ color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                width: 34, height: 34, transition: 'all 0.15s',
                '&:hover': { borderColor: 'var(--primary)', color: 'var(--primary)', bgcolor: 'var(--primary-bg)' } }}>
              <RefreshIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Button variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 15 }} />} onClick={exportToCSV}
            sx={{ textTransform: 'none', borderRadius: 'var(--radius-sm)', borderColor: 'var(--border)',
              color: 'var(--secondary-foreground)', fontWeight: 600, fontSize: '0.78rem', height: 34,
              transition: 'all 0.15s',
              '&:hover': { borderColor: 'var(--primary)', color: 'var(--primary)', bgcolor: 'var(--primary-bg)' } }}>
            Export
          </Button>
          <Button variant="contained" startIcon={<AddIcon sx={{ fontSize: 17 }} />} onClick={() => handleOpen()}
            sx={{ bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-light)' },
              textTransform: 'none', fontWeight: 700, borderRadius: 'var(--radius-sm)',
              px: 2, height: 34, boxShadow: 'none', fontSize: '0.78rem' }}>
            Add Material
          </Button>
        </Box>
      </Box>

      {/* ================================================================
          SUMMARY CARDS  — matches MiniStatCard pattern from Client Management
          ================================================================ */}
      <Box sx={{ display: 'flex', gap: '14px', mb: '16px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total Materials', count: summaryStats.total, Icon: InventoryIcon, color: '#0EA5E9' },
          { label: 'Raw Materials', count: summaryStats.rawMaterials, Icon: CategoryIcon, color: T.primary },
          { label: 'Consumables', count: summaryStats.consumables, Icon: BuildIcon, color: T.orange },
          { label: 'Inactive', count: summaryStats.inactive, Icon: BlockIcon, color: T.red },
        ].map(card => (
          <Box key={card.label} sx={{
            flex: '1 1 0', minWidth: 170, p: '14px 16px', bgcolor: 'var(--card)',
            borderRadius: 'var(--radius)', border: '1px solid var(--border)',
            borderLeft: `3px solid ${card.color}`,
            boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: '12px',
            transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 'var(--shadow)' },
          }}>
            <Box sx={{
              width: 38, height: 38, borderRadius: 'var(--radius-sm)',
              bgcolor: alpha(card.color, 0.08),
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <card.Icon sx={{ fontSize: 20, color: card.color }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{
                fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '.06em', lineHeight: 1,
                mb: '4px', whiteSpace: 'nowrap',
              }}>
                {card.label}
              </Typography>
              <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>
                {card.count}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* ================================================================
          FILTER TOOLBAR  — search + filters in one aligned row
          ================================================================ */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '16px', flexWrap: 'wrap' }}>
        <TextField
          placeholder="Search materials\u2026"
          value={search}
          onChange={e => setSearch(e.target.value)}
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 17, color: 'var(--muted)' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            flex: '1 1 280px', maxWidth: 400,
            '& .MuiOutlinedInput-root': {
              borderRadius: 'var(--radius)', fontSize: '0.8rem', height: 38, bgcolor: 'var(--card)',
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--primary)' },
            },
          }}
        />

        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel sx={{ fontSize: '0.78rem' }}>Category</InputLabel>
          <Select
            value={categoryFilter}
            label="Category"
            onChange={(e: SelectChangeEvent) => setCategoryFilter(e.target.value)}
            sx={{ borderRadius: 'var(--radius)', fontSize: '0.78rem', height: 38, bgcolor: 'var(--card)' }}
          >
            <MenuItem value="all">All Categories</MenuItem>
            {CATEGORY_OPTIONS.map(c => (
              <MenuItem key={c} value={c}>{fmtCategory(c)}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {categoryFilter !== 'all' && (
          <Button size="small" onClick={() => setCategoryFilter('all')}
            sx={{ textTransform: 'none', fontSize: '0.72rem', fontWeight: 600,
              color: 'var(--muted)', borderRadius: 'var(--radius-sm)', height: 38 }}>
            Clear
          </Button>
        )}

        {/* Bulk Action Bar */}
        {selectedIds.length > 0 && (
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1, ml: 'auto',
            px: 2, py: 0.8, borderRadius: 'var(--radius-sm)',
            bgcolor: 'var(--primary-bg)',
            border: `1px solid ${alpha(T.primary, .2)}`,
          }}>
            <Chip
              label={`${selectedIds.length} selected`}
              size="small"
              sx={{
                fontWeight: 700, fontSize: '0.72rem', borderRadius: '7px',
                bgcolor: T.primary, color: '#fff', height: 24,
              }}
            />
            <Button size="small" onClick={handleBulkActivate} sx={{
              fontSize: '0.75rem', textTransform: 'none', fontWeight: 600,
              color: T.primary, minWidth: 'auto', px: 1.5, borderRadius: '7px',
              '&:hover': { bgcolor: alpha(T.primary, .08) },
            }}>
              Activate
            </Button>
            <Button size="small" onClick={handleBulkDeactivate} sx={{
              fontSize: '0.75rem', textTransform: 'none', fontWeight: 600,
              color: T.orange, minWidth: 'auto', px: 1.5, borderRadius: '7px',
              '&:hover': { bgcolor: alpha(T.orange, .08) },
            }}>
              Deactivate
            </Button>
            <Button size="small" onClick={handleBulkDelete} sx={{
              fontSize: '0.75rem', textTransform: 'none', fontWeight: 600,
              color: T.red, minWidth: 'auto', px: 1.5, borderRadius: '7px',
              '&:hover': { bgcolor: alpha(T.red, .08) },
            }}>
              Delete
            </Button>
            <Button size="small" onClick={() => setSelectedIds([])} sx={{
              fontSize: '0.72rem', textTransform: 'none', fontWeight: 500,
              color: T.textMuted, minWidth: 'auto', px: 1, borderRadius: '7px',
            }}>
              Clear
            </Button>
          </Box>
        )}
      </Box>

      {/* ================================================================
          TABLE CARD  — matches Client Management table patterns
          ================================================================ */}
      <TableContainer sx={{
        borderRadius: 'var(--radius)', border: '1px solid var(--border)',
        bgcolor: 'var(--card)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
      }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{
              bgcolor: 'var(--accent)',
              '& th': { ...thSx },
            }}>
              {/* Checkbox */}
              <TableCell padding="checkbox" sx={{
                ...thSx, px: '10px', width: 48,
              }}>
                <Checkbox
                  size="small"
                  checked={selectedIds.length === displayMaterials.length && displayMaterials.length > 0}
                  indeterminate={selectedIds.length > 0 && selectedIds.length < displayMaterials.length}
                  onChange={handleToggleSelectAll}
                  sx={{
                    color: T.textFaint, p: 0.5,
                    '&.Mui-checked': { color: T.primary },
                    '&.MuiCheckbox-indeterminate': { color: T.primary },
                  }}
                />
              </TableCell>

              {/* Material Name — sortable */}
              <TableCell onClick={() => toggleSort('material_name')} sx={{ ...thSortSx, px: '14px', minWidth: 200 }}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  Material Name
                  {sortField === 'material_name' && (sortDir === 'asc'
                    ? <SortUpIcon sx={{ fontSize: 14 }} />
                    : <SortDownIcon sx={{ fontSize: 14 }} />)}
                </Box>
              </TableCell>

              {/* Category — sortable */}
              <TableCell align="center" onClick={() => toggleSort('category')} sx={{ ...thSortSx, width: 130 }}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  Category
                  {sortField === 'category' && (sortDir === 'asc'
                    ? <SortUpIcon sx={{ fontSize: 14 }} />
                    : <SortDownIcon sx={{ fontSize: 14 }} />)}
                </Box>
              </TableCell>

              {/* Unit */}
              <TableCell align="center" sx={{ ...thSx, width: 80 }}>Unit</TableCell>

              {/* Status — sortable */}
              <TableCell align="center" onClick={() => toggleSort('status')} sx={{ ...thSortSx, width: 90 }}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  Status
                  {sortField === 'status' && (sortDir === 'asc'
                    ? <SortUpIcon sx={{ fontSize: 14 }} />
                    : <SortDownIcon sx={{ fontSize: 14 }} />)}
                </Box>
              </TableCell>

              {/* Last Updated — sortable */}
              <TableCell align="center" onClick={() => toggleSort('updated_at')} sx={{ ...thSortSx, width: 110 }}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  Updated
                  {sortField === 'updated_at' && (sortDir === 'asc'
                    ? <SortUpIcon sx={{ fontSize: 14 }} />
                    : <SortDownIcon sx={{ fontSize: 14 }} />)}
                </Box>
              </TableCell>

              {/* Used In */}
              <TableCell align="center" sx={{ ...thSx, width: 80 }}>Used In</TableCell>

              {/* Actions */}
              <TableCell align="center" sx={{ ...thSx, width: 130 }}>Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {/* ---- Empty state ---- */}
            {displayMaterials.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: 'center', py: 8, borderBottom: 'none' }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Box sx={{
                      width: 64, height: 64, borderRadius: '50%', bgcolor: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5,
                    }}>
                      <InventoryIcon sx={{ fontSize: 28, color: 'var(--muted)' }} />
                    </Box>
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--secondary-foreground)', mb: 0.5 }}>
                      {search ? 'No materials match your search' : 'No materials found'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'var(--muted)', mb: 2, maxWidth: 320 }}>
                      {search
                        ? 'Try a different search term or clear filters'
                        : 'Click "Add Material" to create your first material.'}
                    </Typography>
                    {!search && (
                      <Button
                        variant="outlined" size="small"
                        startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                        onClick={() => handleOpen()}
                        sx={{
                          borderRadius: 'var(--radius-sm)', textTransform: 'none',
                          fontWeight: 600, fontSize: '0.82rem', px: 3,
                          borderColor: T.primary, color: T.primary,
                          '&:hover': { bgcolor: T.primaryBg, borderColor: T.primary },
                        }}
                      >
                        Add Material
                      </Button>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            )}

            {/* ---- Data rows ---- */}
            {displayMaterials.map((m, idx) => (
              <TableRow
                key={m.id}
                sx={{
                  bgcolor: selectedIds.includes(m.id)
                    ? alpha(T.primary, .04)
                    : idx % 2 === 1 ? alpha('#F1F5F9', 0.5) : 'transparent',
                  borderLeft: '3px solid transparent',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    bgcolor: selectedIds.includes(m.id)
                      ? alpha(T.primary, .06)
                      : alpha('#1F7A63', 0.03),
                    borderLeftColor: 'var(--primary)',
                  },
                  '&:last-child td': { borderBottom: 'none' },
                  '& td': {
                    fontSize: '0.8rem', color: 'var(--card-foreground)',
                    py: '10px', px: '14px',
                    height: 52, verticalAlign: 'middle',
                    borderBottom: '1px solid var(--border-light)',
                  },
                }}
              >
                {/* Checkbox */}
                <TableCell padding="checkbox" sx={{ px: '10px !important' }}>
                  <Checkbox
                    size="small"
                    checked={selectedIds.includes(m.id)}
                    onChange={() => handleToggleSelect(m.id)}
                    sx={{
                      color: T.textFaint, p: 0.5,
                      '&.Mui-checked': { color: T.primary },
                    }}
                  />
                </TableCell>

                {/* Material Name */}
                <TableCell sx={{ px: '14px !important' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Box sx={{
                      width: 34, height: 34, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                      background: `linear-gradient(135deg, ${alpha(T.primary, .1)}, ${alpha(T.primary, .04)})`,
                      border: `1px solid ${alpha(T.primary, .1)}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <InventoryIcon sx={{ fontSize: 16, color: T.primary }} />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{
                        fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {m.material_name}
                      </Typography>
                      {m.description && (
                        <Typography sx={{ fontSize: '0.68rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                          {m.description}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </TableCell>

                {/* Category */}
                <TableCell align="center">
                  <Box sx={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    px: '8px', py: '3px', borderRadius: 'var(--radius-sm)',
                    bgcolor: 'var(--accent)', border: '1px solid var(--border)',
                  }}>
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--secondary-foreground)', lineHeight: 1 }}>
                      {fmtCategory(m.category)}
                    </Typography>
                  </Box>
                </TableCell>

                {/* Unit */}
                <TableCell align="center">
                  <Box sx={{
                    display: 'inline-flex', alignItems: 'center',
                    px: '8px', py: '3px', borderRadius: 'var(--radius-sm)',
                    bgcolor: alpha(T.blue, 0.06), border: `1px solid ${alpha(T.blue, 0.12)}`,
                  }}>
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: T.blue, lineHeight: 1 }}>
                      {m.unit}
                    </Typography>
                  </Box>
                </TableCell>

                {/* Status */}
                <TableCell align="center">
                  <Box
                    onClick={() => handleToggleStatus(m.id)}
                    sx={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      px: '8px', py: '3px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      bgcolor: m.is_active ? alpha('#16A34A', 0.06) : alpha('#94a3b8', 0.06),
                      transition: 'all 0.15s',
                      '&:hover': {
                        bgcolor: m.is_active ? alpha('#16A34A', 0.12) : alpha('#94a3b8', 0.12),
                      },
                    }}
                  >
                    <Box sx={{
                      width: 5, height: 5, borderRadius: '50%',
                      bgcolor: m.is_active ? '#16A34A' : 'var(--text-muted)',
                    }} />
                    <Typography sx={{
                      fontSize: '0.65rem', fontWeight: 700, lineHeight: 1,
                      color: m.is_active ? '#16A34A' : 'var(--text-muted)',
                    }}>
                      {m.is_active ? 'Active' : 'Inactive'}
                    </Typography>
                  </Box>
                </TableCell>

                {/* Last Updated */}
                <TableCell align="center">
                  <Typography sx={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {fmtDate(m.updated_at)}
                  </Typography>
                </TableCell>

                {/* Used In Projects */}
                <TableCell align="center">
                  <Tooltip title="Project usage tracking coming soon" arrow>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: T.textFaint }}>
                      {'\u2014'}
                    </Typography>
                  </Tooltip>
                </TableCell>

                {/* Actions */}
                <TableCell align="center" onClick={e => e.stopPropagation()}>
                  <Box sx={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'center' }}>
                    <Tooltip title="Edit" arrow>
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/materials/${m.id}/edit`)}
                        sx={{
                          color: 'var(--muted)', width: 30, height: 30,
                          border: '1px solid transparent', borderRadius: 'var(--radius-sm)',
                          transition: 'all 0.15s',
                          '&:hover': { borderColor: 'var(--border)', bgcolor: 'var(--accent)', color: 'var(--foreground)' },
                        }}
                      >
                        <EditIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Copy" arrow>
                      <IconButton
                        size="small"
                        onClick={() => handleCopy(m)}
                        sx={{
                          color: 'var(--muted)', width: 30, height: 30,
                          border: '1px solid transparent', borderRadius: 'var(--radius-sm)',
                          transition: 'all 0.15s',
                          '&:hover': { borderColor: alpha(T.primary, .2), bgcolor: 'var(--primary-bg)', color: T.primary },
                        }}
                      >
                        <CopyIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete" arrow>
                      <IconButton
                        size="small"
                        onClick={() => handleDelete(m.id)}
                        sx={{
                          color: 'var(--muted)', width: 30, height: 30,
                          border: '1px solid transparent', borderRadius: 'var(--radius-sm)',
                          transition: 'all 0.15s',
                          '&:hover': { borderColor: alpha(T.red, .2), bgcolor: T.redBg, color: T.red },
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ================================================================
          ADD NEW STOCK SECTION
          ================================================================ */}
      <Box sx={{
        mt: '16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
        bgcolor: 'var(--card)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
      }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 3, py: '14px', borderBottom: '1px solid var(--border)',
        }}>
          <Box>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
              Add New Stock
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'var(--muted)', mt: '2px' }}>
              Maintain warehouse inventory — stocks update automatically when projects are commissioned
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<SaveIcon sx={{ fontSize: 15 }} />}
            disabled={savingStock}
            onClick={handleSaveStock}
            sx={{
              bgcolor: 'var(--primary)', '&:hover': { bgcolor: 'var(--primary-light)' },
              textTransform: 'none', fontWeight: 700, fontSize: '0.78rem',
              borderRadius: 'var(--radius-sm)', px: 2, height: 34, boxShadow: 'none',
            }}
          >
            {savingStock ? 'Saving\u2026' : 'Save Stock'}
          </Button>
        </Box>

        {/* Stock entry table */}
        <Box sx={{ px: 3, py: 2 }}>
          <Table size="small" sx={{ tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow sx={{
                '& th': {
                  fontSize: '0.65rem', fontWeight: 700, color: T.textMuted,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  borderBottom: `2px solid ${T.border}`, py: '10px', bgcolor: T.borderLight,
                  height: 44, verticalAlign: 'middle',
                },
              }}>
                <TableCell sx={{ width: '6%' }}>S.No</TableCell>
                <TableCell sx={{ width: '26%' }}>Part Description</TableCell>
                <TableCell sx={{ width: '26%' }}>Material &amp; Grade</TableCell>
                <TableCell sx={{ width: '18%' }}>Dimension</TableCell>
                <TableCell sx={{ width: '14%' }}>Quantity</TableCell>
                <TableCell sx={{ width: '10%' }} align="center">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stockRows.map((row, idx) => (
                <TableRow key={idx} sx={{
                  '& td': { py: '10px', borderBottom: `1px solid ${T.borderLight}`, height: 56, verticalAlign: 'middle' },
                  '&:hover': { bgcolor: alpha(T.primary, 0.02) },
                  transition: 'background 0.15s',
                }}>
                  <TableCell>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: T.textSecondary }}>{idx + 1}</Typography>
                  </TableCell>
                  <TableCell>
                    <FormControl fullWidth size="small">
                      <Select
                        displayEmpty
                        value={row.part_description}
                        onChange={e => handleStockRowChange(idx, 'part_description', e.target.value)}
                        sx={{ borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', height: 38, bgcolor: 'var(--bg-input)', '& fieldset': { borderColor: T.border } }}
                        MenuProps={{ PaperProps: { sx: { borderRadius: 'var(--radius-sm)', maxHeight: 250 } } }}
                      >
                        <MenuItem value="" disabled>Drop Down</MenuItem>
                        {partOptions.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    <FormControl fullWidth size="small">
                      <Select
                        displayEmpty
                        value={row.material_grade}
                        onChange={e => handleStockRowChange(idx, 'material_grade', e.target.value)}
                        sx={{ borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', height: 38, bgcolor: 'var(--bg-input)', '& fieldset': { borderColor: T.border } }}
                        MenuProps={{ PaperProps: { sx: { borderRadius: 'var(--radius-sm)', maxHeight: 250 } } }}
                      >
                        <MenuItem value="" disabled>Drop Down</MenuItem>
                        {gradeOptions.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small" fullWidth placeholder="Enter Dimension"
                      value={row.dimension}
                      onChange={e => handleStockRowChange(idx, 'dimension', e.target.value)}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', height: 38, bgcolor: 'var(--bg-input)', '& fieldset': { borderColor: T.border } } }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small" fullWidth placeholder="Enter Value" type="number"
                      value={row.quantity}
                      onChange={e => handleStockRowChange(idx, 'quantity', e.target.value)}
                      inputProps={{ min: 0 }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', height: 38, bgcolor: 'var(--bg-input)', '& fieldset': { borderColor: T.border } } }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Remove row">
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveStockRow(idx)}
                        disabled={stockRows.length === 1}
                        sx={{
                          width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                          color: T.textMuted, transition: 'all 0.15s',
                          '&:hover': { bgcolor: T.redBg, color: T.red },
                        }}
                      >
                        <DeleteIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Button
              variant="outlined" startIcon={<AddIcon sx={{ fontSize: 15 }} />}
              onClick={handleAddStockRow}
              sx={{
                textTransform: 'none', fontWeight: 600, fontSize: '0.78rem',
                borderRadius: 'var(--radius-sm)', borderColor: 'var(--border)', color: 'var(--secondary-foreground)',
                height: 34, px: 3,
                '&:hover': { borderColor: 'var(--primary)', color: 'var(--primary)', bgcolor: 'var(--primary-bg)' },
              }}
            >
              Add New Part
            </Button>
          </Box>
        </Box>

        {/* Existing stock items */}
        {existingStock.length > 0 && (
          <Box sx={{ px: 3, pb: 2 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 1 }}>
              Current Warehouse Stock ({existingStock.length} items)
            </Typography>
            <Table size="small" sx={{ tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow sx={{
                  '& th': { fontSize: '0.65rem', fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${T.border}`, py: '10px', bgcolor: T.borderLight, height: 44, verticalAlign: 'middle' },
                }}>
                  <TableCell sx={{ width: '6%' }}>#</TableCell>
                  <TableCell sx={{ width: '26%' }}>Part Description</TableCell>
                  <TableCell sx={{ width: '26%' }}>Material &amp; Grade</TableCell>
                  <TableCell sx={{ width: '18%' }}>Dimension</TableCell>
                  <TableCell sx={{ width: '14%' }}>Quantity</TableCell>
                  <TableCell align="center" sx={{ width: '10%' }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {existingStock.map((s, idx) => (
                  <TableRow key={s.id} sx={{
                    '& td': { py: '8px', fontSize: '0.8rem', color: T.textPrimary, borderBottom: `1px solid ${T.borderLight}`, height: 48, verticalAlign: 'middle' },
                    transition: 'background 0.15s',
                    '&:hover': { bgcolor: alpha(T.primary, 0.02) },
                  }}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{s.part_description}</TableCell>
                    <TableCell>{s.material_grade}</TableCell>
                    <TableCell>{s.dimension || '\u2014'}</TableCell>
                    <TableCell>
                      {editingStockId === s.id ? (
                        <TextField
                          size="small"
                          type="number"
                          value={editingStockQty}
                          onChange={e => setEditingStockQty(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleUpdateStockQty(s.id); if (e.key === 'Escape') { setEditingStockId(null); setEditingStockQty(''); } }}
                          autoFocus
                          sx={{ width: 90, '& .MuiOutlinedInput-root': { borderRadius: '6px', fontSize: '0.82rem', height: 32 } }}
                          inputProps={{ min: 0 }}
                        />
                      ) : (
                        <Chip size="small" label={s.quantity}
                          onClick={() => { setEditingStockId(s.id); setEditingStockQty(String(s.quantity)); }}
                          sx={{ fontWeight: 700, fontSize: '0.72rem', bgcolor: alpha(T.primary, 0.08), color: T.primary, cursor: 'pointer', height: 24, borderRadius: '6px' }} />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                        {editingStockId === s.id ? (
                          <Tooltip title="Save quantity">
                            <IconButton size="small" onClick={() => handleUpdateStockQty(s.id)}
                              sx={{ width: 28, height: 28, borderRadius: '6px', color: T.primary, '&:hover': { bgcolor: T.primaryBg } }}>
                              <SaveIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Edit quantity">
                            <IconButton size="small" onClick={() => { setEditingStockId(s.id); setEditingStockQty(String(s.quantity)); }}
                              sx={{ width: 28, height: 28, borderRadius: '6px', color: T.textMuted, '&:hover': { bgcolor: T.primaryBg, color: T.primary } }}>
                              <EditIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Delete stock">
                          <IconButton size="small" onClick={() => handleDeleteExistingStock(s.id)}
                            sx={{ width: 28, height: 28, borderRadius: '6px', color: T.textMuted, '&:hover': { bgcolor: T.redBg, color: T.red } }}>
                            <DeleteIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>

      {/* Stock snackbar */}
      <Snackbar open={!!stockMsg} autoHideDuration={3500} onClose={() => setStockMsg('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={() => setStockMsg('')} severity={stockMsgSeverity} variant="filled" sx={{ borderRadius: 'var(--radius-sm)' }}>
          {stockMsg}
        </Alert>
      </Snackbar>

      {/* ================================================================
          ADD / EDIT MODAL
          ================================================================ */}
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
        transitionDuration={250}
        PaperProps={{
          elevation: 0,
          sx: {
            borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
            boxShadow: T.shadowLg, overflow: 'hidden', maxWidth: 540,
          },
        }}
        slotProps={{
          backdrop: { sx: { bgcolor: 'rgba(15,23,42,.35)', backdropFilter: 'blur(4px)' } },
        }}
      >
        {/* Modal header */}
        <Box sx={{
          px: 3, pt: 2.5, pb: 2,
          borderBottom: '1px solid var(--border-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: 'var(--radius-sm)',
              background: `linear-gradient(135deg, ${alpha(T.primary, .12)}, ${alpha(T.primary, .04)})`,
              border: `1px solid ${alpha(T.primary, .1)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <InventoryIcon sx={{ fontSize: 18, color: T.primary }} />
            </Box>
            <Box>
              <Typography sx={{
                fontSize: '1rem', fontWeight: 700, color: T.textPrimary, lineHeight: 1.2,
              }}>
                Add New Material
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: T.textMuted, mt: 0.1 }}>
                Fill in the details below
              </Typography>
            </Box>
          </Box>
          <IconButton
            onClick={handleClose}
            size="small"
            sx={{
              width: 32, height: 32, borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              color: T.textMuted,
              '&:hover': { bgcolor: T.borderLight, color: T.textSecondary },
            }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>

        {/* Modal body */}
        <DialogContent sx={{ px: 3, py: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Material Name */}
          <TextField
            label="Material Name"
            name="material_name"
            value={form.material_name || ''}
            onChange={handleChange}
            required
            fullWidth
            size="small"
            placeholder="e.g. Copper Sheet, M8 Bolt"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <InventoryIcon sx={{ fontSize: 16, color: T.textMuted }} />
                </InputAdornment>
              ),
            }}
            sx={fieldSx}
          />

          {/* Category */}
          <FormControl fullWidth size="small">
            <InputLabel sx={{
              fontSize: '0.82rem', fontWeight: 500, color: T.textSecondary,
              '&.Mui-focused': { color: T.primary, fontWeight: 600 },
            }}>
              Category
            </InputLabel>
            <Select
              label="Category"
              name="category"
              value={form.category || 'raw_material'}
              onChange={handleSelectChange}
              startAdornment={
                <InputAdornment position="start">
                  <CategoryIcon sx={{ fontSize: 16, color: T.textMuted }} />
                </InputAdornment>
              }
              sx={{
                borderRadius: '10px', fontSize: '0.85rem',
                '& fieldset': { borderColor: T.border },
                '&:hover fieldset': { borderColor: T.textMuted },
                '&.Mui-focused fieldset': { borderColor: T.primary, borderWidth: '1.5px' },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    borderRadius: '10px', border: `1px solid ${T.border}`,
                    boxShadow: T.shadowMd, mt: 0.5,
                    '& .MuiMenuItem-root': {
                      fontSize: '0.85rem', fontWeight: 500, borderRadius: '6px',
                      mx: 0.5, px: 1.5, py: 1,
                      '&:hover': { bgcolor: T.borderLight },
                      '&.Mui-selected': {
                        bgcolor: T.primaryBg, color: T.primary, fontWeight: 600,
                        '&:hover': { bgcolor: alpha(T.primary, .1) },
                      },
                    },
                  },
                },
              }}
            >
              {CATEGORY_OPTIONS.map(c => (
                <MenuItem key={c} value={c}>{fmtCategory(c)}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Unit */}
          <FormControl fullWidth size="small">
            <InputLabel sx={{
              fontSize: '0.82rem', fontWeight: 500, color: T.textSecondary,
              '&.Mui-focused': { color: T.primary, fontWeight: 600 },
            }}>
              Unit
            </InputLabel>
            <Select
              label="Unit"
              name="unit"
              value={form.unit || 'Kg'}
              onChange={handleSelectChange}
              startAdornment={
                <InputAdornment position="start">
                  <UnitIcon sx={{ fontSize: 16, color: T.textMuted }} />
                </InputAdornment>
              }
              sx={{
                borderRadius: '10px', fontSize: '0.85rem',
                '& fieldset': { borderColor: T.border },
                '&:hover fieldset': { borderColor: T.textMuted },
                '&.Mui-focused fieldset': { borderColor: T.primary, borderWidth: '1.5px' },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    borderRadius: '10px', border: `1px solid ${T.border}`,
                    boxShadow: T.shadowMd, mt: 0.5,
                    '& .MuiMenuItem-root': {
                      fontSize: '0.85rem', fontWeight: 500, borderRadius: '6px',
                      mx: 0.5, px: 1.5, py: 1,
                      '&:hover': { bgcolor: T.borderLight },
                      '&.Mui-selected': {
                        bgcolor: T.primaryBg, color: T.primary, fontWeight: 600,
                        '&:hover': { bgcolor: alpha(T.primary, .1) },
                      },
                    },
                  },
                },
              }}
            >
              {UNIT_OPTIONS.map(u => (
                <MenuItem key={u} value={u}>{u}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Description */}
          <TextField
            label="Description"
            name="description"
            value={form.description || ''}
            onChange={handleChange}
            multiline
            minRows={3}
            fullWidth
            size="small"
            placeholder="Optional description or specifications\u2026"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                  <DescIcon sx={{ fontSize: 16, color: T.textMuted }} />
                </InputAdornment>
              ),
            }}
            sx={fieldSx}
          />
        </DialogContent>

        {/* Modal footer */}
        <DialogActions sx={{
          px: 3, py: 2, borderTop: '1px solid var(--border-light)',
          gap: 1.5,
        }}>
          <Button
            onClick={handleClose}
            sx={{
              borderRadius: 'var(--radius-sm)', height: 34, px: 2.5,
              textTransform: 'none', fontWeight: 600, fontSize: '0.78rem',
              color: 'var(--secondary-foreground)', border: '1px solid var(--border)',
              '&:hover': { bgcolor: 'var(--accent)', borderColor: T.textMuted },
              transition: 'all .2s',
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!form.material_name?.trim()}
            sx={{
              borderRadius: 'var(--radius-sm)', height: 34, px: 3,
              textTransform: 'none', fontWeight: 700, fontSize: '0.78rem',
              background: T.primary, boxShadow: 'none',
              '&:hover': { background: '#166354' },
              '&.Mui-disabled': { bgcolor: T.borderLight, color: T.textFaint },
              transition: 'all .2s',
            }}
          >
            Add Material
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MaterialMasterPage;
