import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  alpha,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircleOutline as InStockIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ErrorOutline as OutOfStockIcon,
  FileDownload as DownloadIcon,
  FileUpload as UploadIcon,
  Inventory as InventoryIcon,
  Save as SaveIcon,
  Search as SearchIcon,
  Warehouse as WarehouseIcon,
  WarningAmber as LowStockIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../services/api';
import { materialService } from '../services/materialService';
import { rawMaterialService } from '../services/rawMaterialService';

dayjs.extend(relativeTime);

const PRIMARY = '#1F7A63';

/* ─── empty row template ─── */
const emptyRow = () => ({
  _key: Date.now() + Math.random(),
  part_description: '',
  material_grade: '',
  dimension: '',
  quantity: '',
});

/* ─── derive stock status from quantity ─── */
const getStockStatus = (quantity) => {
  if (quantity <= 0) return 'Out of Stock';
  if (quantity <= 10) return 'Low Stock';
  return 'In Stock';
};

const STATUS_TABS = ['All', 'In Stock', 'Low Stock', 'Out of Stock'];

/* ─── page ─── */
const MaterialStockPage = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState({ open: false, severity: 'success', message: '' });
  const [statusFilter, setStatusFilter] = useState('All');

  // Add-new-stock form rows
  const [newRows, setNewRows] = useState([emptyRow()]);

  // Edit dialog (stock)
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // Delete dialog (stock)
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);

  // Bulk delete dialog
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Material edit/delete dialogs
  const [matEditOpen, setMatEditOpen] = useState(false);
  const [matEditItem, setMatEditItem] = useState(null);
  const [matDeleteOpen, setMatDeleteOpen] = useState(false);
  const [matDeleteItem, setMatDeleteItem] = useState(null);

  // Inline quantity editing
  const [editingQty, setEditingQty] = useState({});
  const [savingQty, setSavingQty] = useState(null);

  // Bulk select
  const [selected, setSelected] = useState(new Set());

  // Raw materials (for Add Material dropdown)
  const [rawMaterials, setRawMaterials] = useState([]);
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const [addMaterialForm, setAddMaterialForm] = useState({
    selectedRawMaterial: null,
    part_description: '',
    material_grade: '',
    condition: '',
    shape: '',
    dimension: '',
    quantity: '',
    heat_number: '',
    certificate_file: null,
  });

  const showToast = (severity, message) => setToast({ open: true, severity, message });

  /* ─── data fetch (single load, no interval) ─── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [mats, stocksRes, rawMatsRes] = await Promise.allSettled([
        materialService.getAll(),
        api.get('/stocks'),
        rawMaterialService.getAll(),
      ]);
      setMaterials(mats.status === 'fulfilled' ? (mats.value || []) : []);
      const stockData = stocksRes.status === 'fulfilled'
        ? (stocksRes.value?.data?.data || stocksRes.value?.data || [])
        : [];
      setStocks(Array.isArray(stockData) ? stockData : []);
      setRawMaterials(rawMatsRes.status === 'fulfilled' ? (rawMatsRes.value || []) : []);
    } catch {
      showToast('error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── dropdown options from materials ─── */
  const partOptions = useMemo(() => {
    const set = new Set();
    materials.forEach(m => {
      const name = m.material_name || m.name;
      if (name) set.add(name);
    });
    stocks.forEach(s => { if (s.part_description) set.add(s.part_description); });
    return [...set].sort();
  }, [materials, stocks]);

  const gradeOptions = useMemo(() => {
    const set = new Set();
    materials.forEach(m => {
      if (m.grade) set.add(m.grade);
      const name = m.material_name || m.name;
      if (name) set.add(name);
    });
    stocks.forEach(s => { if (s.material_grade) set.add(s.material_grade); });
    return [...set].sort();
  }, [materials, stocks]);

  /* ─── filtered stocks ─── */
  const filteredStocks = useMemo(() => {
    let result = stocks;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s =>
        (s.part_description || '').toLowerCase().includes(q) ||
        (s.material_grade || '').toLowerCase().includes(q) ||
        (s.dimension || '').toLowerCase().includes(q) ||
        (s.stock_id || '').toLowerCase().includes(q) ||
        (s.heat_number || '').toLowerCase().includes(q) ||
        (s.condition || '').toLowerCase().includes(q) ||
        (s.shape || '').toLowerCase().includes(q) ||
        (s.rawMaterial?.material_id || '').toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'All') {
      result = result.filter(s => getStockStatus(s.quantity) === statusFilter);
    }
    return result;
  }, [stocks, search, statusFilter]);

  /* ─── new-row handlers ─── */
  const updateNewRow = (idx, field, value) => {
    setNewRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };
  const addNewRow = () => setNewRows(prev => [...prev, emptyRow()]);
  const removeNewRow = (idx) => {
    if (newRows.length <= 1) return;
    setNewRows(prev => prev.filter((_, i) => i !== idx));
  };

  /* ─── save stock ─── */
  const handleSaveStock = async () => {
    const valid = newRows.filter(r => r.part_description && r.material_grade);
    if (valid.length === 0) return showToast('error', 'Fill in at least one complete row');
    setSaving(true);
    try {
      const items = valid.map(r => ({
        part_description: r.part_description.trim(),
        material_grade: r.material_grade.trim(),
        dimension: (r.dimension || '').trim(),
        quantity: Number(r.quantity) || 0,
        condition: (r.condition || '').trim(),
        shape: (r.shape || '').trim(),
        heat_number: (r.heat_number || '').trim(),
      }));
      if (items.length === 1) {
        await api.post('/stocks', items[0]);
      } else {
        await api.post('/stocks/bulk', { items });
      }
      showToast('success', `${items.length} stock item(s) saved`);
      setNewRows([emptyRow()]);
      fetchData();
    } catch (err) {
      console.error('Save stock failed:', err);
      const serverMsg = err?.response?.data?.message || err?.message || 'Failed to save stock';
      showToast('error', serverMsg);
    } finally {
      setSaving(false);
    }
  };

  /* ─── add material from Raw Material Master ─── */
  const resetAddMaterialForm = () => setAddMaterialForm({
    selectedRawMaterial: null,
    part_description: '',
    material_grade: '',
    condition: '',
    shape: '',
    dimension: '',
    quantity: '',
    heat_number: '',
    certificate_file: null,
  });
  const handleAddMaterialFromRaw = async () => {
    const f = addMaterialForm;
    // Both part_description and material_grade are NOT NULL in the DB — require both
    const partDesc = (f.part_description || '').trim();
    const matGrade = (f.material_grade || '').trim();
    if (!partDesc || !matGrade) {
      return showToast('error', 'Select a raw material, or fill in Part Description and Material & Grade');
    }
    setSaving(true);
    try {
      const payload = {
        part_description: partDesc,
        material_grade: matGrade,
        condition: (f.condition || '').trim(),
        shape: (f.shape || '').trim(),
        dimension: (f.dimension || '').trim(),
        quantity: Number(f.quantity) || 0,
        heat_number: (f.heat_number || '').trim(),
      };
      // Only include raw_material_id if it's a valid value (avoid sending undefined/null FK)
      if (f.selectedRawMaterial?.id) {
        payload.raw_material_id = f.selectedRawMaterial.id;
      }
      const res = await api.post('/stocks', payload);

      // Upload certificate to File Manager → Inventory if provided
      const stockId = res?.data?.data?.id || res?.data?.id;
      let certFailed = false;
      if (f.certificate_file && stockId) {
        try {
          const formData = new FormData();
          formData.append('certificate', f.certificate_file);
          await api.post(`/stocks/${stockId}/upload-certificate`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (certErr) {
          console.error('Certificate upload failed:', certErr);
          certFailed = true;
        }
      }

      showToast(certFailed ? 'warning' : 'success', certFailed ? 'Material added but certificate upload failed' : 'Material added to warehouse stock');
      setAddMaterialOpen(false);
      resetAddMaterialForm();
      fetchData();
    } catch (err) {
      console.error('Add material failed:', err, err?.response?.data);
      const serverMsg = err?.response?.data?.message || err?.message || 'Failed to add material';
      showToast('error', serverMsg);
    } finally {
      setSaving(false);
    }
  };

  /* ─── inline quantity edit ─── */
  const startEditQty = (stock) => {
    setEditingQty(prev => ({ ...prev, [stock.id]: String(stock.quantity) }));
  };
  const cancelEditQty = (stockId) => {
    setEditingQty(prev => { const n = { ...prev }; delete n[stockId]; return n; });
  };
  const saveEditQty = async (stock) => {
    const newQty = Number(editingQty[stock.id]);
    if (isNaN(newQty) || newQty < 0) return showToast('error', 'Invalid quantity');
    if (newQty === stock.quantity) { cancelEditQty(stock.id); return; }
    setSavingQty(stock.id);
    try {
      await api.put(`/stocks/${stock.id}`, {
        part_description: stock.part_description,
        material_grade: stock.material_grade,
        dimension: stock.dimension,
        quantity: newQty,
        condition: stock.condition,
        shape: stock.shape,
        heat_number: stock.heat_number,
      });
      showToast('success', 'Quantity updated');
      cancelEditQty(stock.id);
      fetchData();
    } catch {
      showToast('error', 'Failed to update quantity');
    } finally {
      setSavingQty(null);
    }
  };

  /* ─── edit ─── */
  const editCertRef = React.useRef(null);
  const addCertRef = React.useRef(null);
  const openEdit = (item) => { setEditItem({ ...item, certificate_file: null }); setEditOpen(true); };
  const handleEditSave = async () => {
    if (!editItem) return;
    const certFile = editItem.certificate_file;
    setSaving(true);
    try {
      await api.put(`/stocks/${editItem.id}`, {
        part_description: editItem.part_description,
        material_grade: editItem.material_grade,
        dimension: editItem.dimension,
        quantity: Number(editItem.quantity) || 0,
        condition: editItem.condition,
        shape: editItem.shape,
        heat_number: editItem.heat_number,
      });

      // Upload certificate if provided
      let certFailed = false;
      if (certFile) {
        try {
          const formData = new FormData();
          formData.append('certificate', certFile);
          await api.post(`/stocks/${editItem.id}/upload-certificate`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch (certErr) {
          console.error('Certificate upload failed:', certErr);
          certFailed = true;
        }
      }

      showToast(certFailed ? 'warning' : 'success', certFailed ? 'Stock updated but certificate upload failed' : (certFile ? 'Stock & certificate updated' : 'Stock updated'));
      setEditOpen(false);
      setEditItem(null);
      fetchData();
    } catch {
      showToast('error', 'Failed to update stock');
    } finally {
      setSaving(false);
    }
  };

  /* ─── delete ─── */
  const openDelete = (item) => { setDeleteItem(item); setDeleteOpen(true); };
  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await api.delete(`/stocks/${deleteItem.id}`);
      showToast('success', 'Stock deleted');
      setDeleteOpen(false);
      setDeleteItem(null);
      setSelected(prev => { const n = new Set(prev); n.delete(deleteItem.id); return n; });
      fetchData();
    } catch {
      showToast('error', 'Failed to delete stock');
    }
  };

  /* ─── bulk delete selected stocks ─── */
  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    try {
      setBulkDeleting(true);
      const ids = [...selected];
      await Promise.all(ids.map(id => api.delete(`/stocks/${id}`)));
      showToast('success', `${ids.length} stock item(s) deleted`);
      setBulkDeleteOpen(false);
      setSelected(new Set());
      setStocks(prev => prev.filter(s => !ids.includes(s.id)));
    } catch {
      showToast('error', 'Failed to delete some stock items');
    } finally {
      setBulkDeleting(false);
    }
  };

  /* ─── duplicate stock ─── */
  const handleDuplicate = async (stock) => {
    try {
      await api.post('/stocks', {
        part_description: stock.part_description,
        material_grade: stock.material_grade,
        dimension: stock.dimension,
        quantity: stock.quantity,
        condition: stock.condition || '',
        shape: stock.shape || '',
        heat_number: '',
      });
      showToast('success', 'Stock item duplicated');
      fetchData();
    } catch {
      showToast('error', 'Failed to duplicate stock');
    }
  };

  /* ─── material edit ─── */
  const openMatEdit = (mat) => {
    setMatEditItem({
      id: mat.id,
      material_name: mat.material_name || mat.name || '',
      category: mat.category || '',
      unit: mat.unit || 'Kg',
      status: mat.status || 'active',
    });
    setMatEditOpen(true);
  };
  const handleMatEditSave = async () => {
    if (!matEditItem) return;
    setSaving(true);
    try {
      await materialService.update(matEditItem.id, {
        material_name: matEditItem.material_name,
        category: matEditItem.category,
        unit: matEditItem.unit,
        status: matEditItem.status,
      });
      showToast('success', 'Material updated');
      setMatEditOpen(false);
      setMatEditItem(null);
      fetchData();
    } catch {
      showToast('error', 'Failed to update material');
    } finally {
      setSaving(false);
    }
  };

  /* ─── material copy (duplicate) ─── */
  const handleMatCopy = async (mat) => {
    try {
      await materialService.create({
        material_name: `${mat.material_name || mat.name} (Copy)`,
        category: mat.category || '',
        unit: mat.unit || 'Kg',
        status: 'active',
      });
      showToast('success', 'Material duplicated');
      fetchData();
    } catch {
      showToast('error', 'Failed to duplicate material');
    }
  };

  /* ─── material delete ─── */
  const openMatDelete = (mat) => { setMatDeleteItem(mat); setMatDeleteOpen(true); };
  const handleMatDelete = async () => {
    if (!matDeleteItem) return;
    try {
      await materialService.delete(matDeleteItem.id);
      showToast('success', 'Material deleted');
      setMatDeleteOpen(false);
      setMatDeleteItem(null);
      fetchData();
    } catch {
      showToast('error', 'Failed to delete material');
    }
  };

  /* ─── bulk select ─── */
  const toggleSelect = (id) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleSelectAll = () => {
    if (selected.size === filteredStocks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredStocks.map(s => s.id)));
    }
  };

  /* ─── export ─── */
  const handleExport = () => {
    if (stocks.length === 0) return showToast('info', 'No data to export');
    const headers = ['Stock ID', 'Raw MID', 'Part Description', 'Material & Grade', 'Condition', 'Shape', 'Dimension', 'Quantity', 'Heat Number', 'Status', 'Last Updated'];
    const rows = stocks.map(s => [
      s.stock_id || '',
      s.rawMaterial?.material_id || '',
      s.part_description || '',
      s.material_grade || '',
      s.condition || '',
      s.shape || '',
      s.dimension || '',
      s.quantity ?? '',
      s.heat_number || '',
      getStockStatus(s.quantity),
      s.updated_at ? dayjs(s.updated_at).format('DD MMM YYYY HH:mm') : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `material-stock-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Exported successfully');
  };

  /* ─── import (Excel/CSV) ─── */
  const fileInputRef = React.useRef(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      return showToast('error', 'Please upload a .xlsx, .xls, or .csv file');
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/stocks/import', formData);
      const data = res.data || res;
      const created = data.created ?? 0;
      const errors = data.errors || [];
      if (errors.length > 0) {
        showToast('warning', `Imported ${created} item(s). ${errors.length} row(s) rejected.`);
      } else {
        showToast('success', `Imported ${created} item(s) successfully`);
      }
      fetchData();
    } catch (err) {
      const msg = err?.response?.data?.message || 'Import failed';
      showToast('error', msg);
    } finally {
      setImporting(false);
    }
  };

  /* ─── stat cards data ─── */
  const statCards = useMemo(() => {
    const total = materials.length;
    const inStock = stocks.filter(s => s.quantity > 10).length;
    const lowStock = stocks.filter(s => s.quantity > 0 && s.quantity <= 10).length;
    const outOfStock = stocks.filter(s => s.quantity <= 0).length;
    return [
      { label: 'Total Materials', value: total, icon: InventoryIcon, color: PRIMARY },
      { label: 'In Stock', value: inStock, icon: InStockIcon, color: '#16A34A' },
      { label: 'Low Stock', value: lowStock, icon: LowStockIcon, color: '#D97706' },
      { label: 'Out of Stock', value: outOfStock, icon: OutOfStockIcon, color: '#DC2626' },
    ];
  }, [materials, stocks]);

  /* ─── section header helper ─── */
  const SectionHeader = ({ icon, title, subtitle, action }) => (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0 }}>
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY, display: 'grid', placeItems: 'center' }}>
          {icon}
        </Box>
        <Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'var(--foreground)' }}>{title}</Typography>
          {subtitle && <Typography sx={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{subtitle}</Typography>}
        </Box>
      </Stack>
      {action}
    </Stack>
  );

  /* ─── status badge ─── */
  const StatusBadge = ({ status }) => {
    const cfg = {
      'In Stock':     { bgcolor: alpha('#16A34A', 0.1), color: '#16A34A' },
      'Low Stock':    { bgcolor: alpha('#D97706', 0.1), color: '#D97706' },
      'Out of Stock': { bgcolor: alpha('#DC2626', 0.1), color: '#DC2626' },
    }[status] || { bgcolor: alpha('#6B7280', 0.1), color: '#6B7280' };
    return (
      <Chip size="small" label={status} sx={{ fontWeight: 700, fontSize: '0.72rem', ...cfg }} />
    );
  };

  /* ─── table header cell style ─── */
  const thSx = {
    fontSize: '0.72rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    color: 'var(--muted)',
    bgcolor: alpha(PRIMARY, 0.04),
    borderBottom: '1px solid var(--border)',
    px: 2,
    py: 1.2,
    height: 44,
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 2,
    backgroundColor: '#fafbfc',
  };

  const tdSx = {
    px: 2,
    py: 1,
    height: 48,
    verticalAlign: 'middle',
    borderBottom: '1px solid',
    borderColor: alpha('#000', 0.06),
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  return (
    <Box sx={{ width: '100%' }}>

      {/* ═══════ PAGE HEADER ═══════ */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: '14px', flexWrap: 'wrap', gap: 1.5 }}>
        <Typography sx={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--foreground)', flexShrink: 0 }}>
          Inventory
        </Typography>

        <Stack direction="row" spacing={1.5} alignItems="center">
          {/* Hidden file input for import */}
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleImport}
          />
          <Button
            variant="outlined"
            startIcon={<UploadIcon sx={{ fontSize: 18 }} />}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: '10px',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
              px: 2,
              '&:hover': { borderColor: PRIMARY, color: PRIMARY, bgcolor: alpha(PRIMARY, 0.04) },
            }}
          >
            {importing ? 'Importing…' : 'Import'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon sx={{ fontSize: 18 }} />}
            onClick={handleExport}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: '10px',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
              px: 2,
              '&:hover': { borderColor: PRIMARY, color: PRIMARY, bgcolor: alpha(PRIMARY, 0.04) },
            }}
          >
            Export
          </Button>
        </Stack>
      </Stack>

      {/* ═══════ STAT CARDS ═══════ */}
      <Box sx={{ display: 'flex', gap: '14px', mb: '20px', flexWrap: 'wrap' }}>
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Box
              key={card.label}
              sx={{
                flex: '1 1 0',
                minWidth: 170,
                p: '14px 16px',
                bgcolor: 'var(--card)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                borderLeft: `3px solid ${card.color}`,
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'box-shadow 0.2s',
                '&:hover': { boxShadow: 'var(--shadow)' },
              }}
            >
              <Box sx={{ width: 38, height: 38, borderRadius: 'var(--radius-sm)', bgcolor: alpha(card.color, 0.08), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon sx={{ fontSize: 20, color: card.color }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', lineHeight: 1, mb: '4px', whiteSpace: 'nowrap' }}>
                  {card.label}
                </Typography>
                <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>
                  {card.value}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* ═══════ FILTER TABS + SEARCH ═══════ */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ p: 0.5, bgcolor: alpha(PRIMARY, 0.04), borderRadius: '12px', border: '1px solid var(--border)' }}
        >
          {STATUS_TABS.map((tab) => (
            <Button
              key={tab}
              size="small"
              onClick={() => setStatusFilter(tab)}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                fontSize: '0.82rem',
                borderRadius: '10px',
                px: 2,
                py: 0.8,
                minWidth: 'auto',
                ...(statusFilter === tab
                  ? {
                      bgcolor: PRIMARY,
                      color: '#fff',
                      boxShadow: `0 2px 6px ${alpha(PRIMARY, 0.3)}`,
                      '&:hover': { bgcolor: alpha(PRIMARY, 0.9) },
                    }
                  : {
                      color: 'var(--muted)',
                      '&:hover': { bgcolor: alpha(PRIMARY, 0.08), color: 'var(--foreground)' },
                    }),
              }}
            >
              {tab}
            </Button>
          ))}
        </Stack>

        <TextField
          size="small"
          placeholder="Search stock ID, material, grade, shape, heat number…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: 'var(--muted)', mr: 1, fontSize: 18 }} />,
          }}
          sx={{
            minWidth: 260,
            '& .MuiOutlinedInput-root': {
              borderRadius: '10px',
              bgcolor: 'var(--bg-input)',
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: PRIMARY },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: PRIMARY, boxShadow: `0 0 0 3px ${alpha(PRIMARY, 0.10)}` },
            },
          }}
        />
      </Stack>

      {/* ═══════ WAREHOUSE STOCK TABLE ═══════ */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          borderRadius: '14px',
          border: '1px solid var(--border)',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <Box sx={{ px: 3, py: 1.5, bgcolor: alpha(PRIMARY, 0.03), borderBottom: '1px solid var(--border)' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{ width: 32, height: 32, borderRadius: '8px', bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY, display: 'grid', placeItems: 'center' }}>
                <WarehouseIcon sx={{ fontSize: 16 }} />
              </Box>
              <Box>
                <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--foreground)' }}>
                  Warehouse Stock
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                  {filteredStocks.length} of {stocks.length} items
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              {selected.size > 1 && (
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setBulkDeleteOpen(true)}
                  sx={{
                    fontWeight: 700,
                    px: 2.5,
                    borderRadius: '10px',
                    textTransform: 'none',
                    fontSize: '0.85rem',
                  }}
                >
                  Delete Selected
                </Button>
              )}
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setAddMaterialOpen(true)}
                sx={{
                  bgcolor: PRIMARY,
                  fontWeight: 700,
                  px: 2.5,
                  borderRadius: '10px',
                  textTransform: 'none',
                  fontSize: '0.85rem',
                  boxShadow: `0 2px 8px ${alpha(PRIMARY, 0.3)}`,
                  '&:hover': { bgcolor: alpha(PRIMARY, 0.9), boxShadow: `0 4px 12px ${alpha(PRIMARY, 0.35)}` },
                }}
              >
                Add Material
              </Button>
            </Stack>
          </Stack>
        </Box>

        {loading ? (
          <Box sx={{ p: 3 }}>{[...Array(4)].map((_, i) => <Skeleton key={i} height={52} sx={{ mb: 0.5 }} />)}</Box>
        ) : filteredStocks.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <WarehouseIcon sx={{ fontSize: 48, color: alpha(PRIMARY, 0.2), mb: 1 }} />
            <Typography sx={{ fontWeight: 700, mb: 0.5, color: 'var(--foreground)' }}>No stock items found</Typography>
            <Typography variant="body2" color="text.secondary">Add new stock using the form below.</Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
            <Table stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...thSx, width: 50, textAlign: 'center' }}>
                    <Checkbox
                      size="small"
                      checked={selected.size === filteredStocks.length && filteredStocks.length > 0}
                      indeterminate={selected.size > 0 && selected.size < filteredStocks.length}
                      onChange={toggleSelectAll}
                      sx={{ color: 'var(--muted)', '&.Mui-checked': { color: PRIMARY } }}
                    />
                  </TableCell>
                  <TableCell sx={thSx}>Stock ID</TableCell>
                  <TableCell sx={thSx}>Raw MID</TableCell>
                  <TableCell sx={thSx}>Description</TableCell>
                  <TableCell sx={{ ...thSx, textAlign: 'center' }}>Current Stock</TableCell>
                  <TableCell sx={thSx}>Heat Number</TableCell>
                  <TableCell sx={{ ...thSx, textAlign: 'center' }}>Status</TableCell>
                  <TableCell sx={{ ...thSx, textAlign: 'center', minWidth: 140 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredStocks.map((stock) => {
                  const status = getStockStatus(stock.quantity);
                  const rawDim = stock.dimension || '-';
                  // Convert labeled dimension (e.g. "Length: 144, Width: 12, Thickness: 0.25")
                  // to compact format (e.g. '144" x 12" x 0.25"')
                  let compactDim = rawDim;
                  if (rawDim !== '-' && rawDim.includes(':')) {
                    const parts = rawDim.split(',').map(s => s.trim());
                    const dimMap = {};
                    let detectedUnit = '"';
                    const orderedKeys = [];
                    parts.forEach(p => {
                      const colonIdx = p.indexOf(':');
                      if (colonIdx === -1) return;
                      const label = p.substring(0, colonIdx).trim().toLowerCase();
                      let val = p.substring(colonIdx + 1).trim();
                      const unitMatch = val.match(/(mm|inch|in|"|')$/i);
                      if (unitMatch) {
                        const u = unitMatch[1].toLowerCase();
                        detectedUnit = (u === 'in' || u === 'inch') ? '"' : unitMatch[1];
                        val = val.substring(0, val.length - unitMatch[1].length).trim();
                      }
                      dimMap[label] = val;
                      orderedKeys.push(label);
                    });
                    const shape = (stock.shape || '').toLowerCase();
                    let orderedVals = [];
                    if (shape.includes('flat') || shape.includes('plate')) {
                      ['length', 'width', 'thickness'].forEach(k => { if (dimMap[k] != null) orderedVals.push(dimMap[k]); });
                    } else if (shape.includes('round') || shape.includes('rod')) {
                      ['diameter', 'length'].forEach(k => { if (dimMap[k] != null) orderedVals.push(dimMap[k]); });
                    } else {
                      orderedVals = orderedKeys.map(k => dimMap[k]).filter(Boolean);
                    }
                    if (orderedVals.length === 0) orderedVals = Object.values(dimMap);
                    if (orderedVals.length > 0) {
                      compactDim = orderedVals.map(v => `${v}${detectedUnit}`).join(' x ');
                    }
                  }
                  const descParts = [
                    stock.part_description || '-',
                    stock.material_grade || '-',
                    stock.condition || '-',
                    stock.shape || '-',
                    compactDim,
                  ];
                  const descLine1 = descParts.join(' | ');
                  return (
                    <TableRow
                      key={stock.id}
                      sx={{
                        '&:hover': { bgcolor: alpha(PRIMARY, 0.025) },
                        transition: 'background .15s',
                        ...(selected.has(stock.id) ? { bgcolor: alpha(PRIMARY, 0.05) } : {}),
                      }}
                    >
                      <TableCell sx={{ ...tdSx, textAlign: 'center' }}>
                        <Checkbox
                          size="small"
                          checked={selected.has(stock.id)}
                          onChange={() => toggleSelect(stock.id)}
                          sx={{ '&.Mui-checked': { color: PRIMARY } }}
                        />
                      </TableCell>

                      {/* Stock ID */}
                      <TableCell sx={tdSx}>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.8rem', color: PRIMARY }}>
                          {stock.stock_id || '—'}
                        </Typography>
                      </TableCell>

                      {/* Raw MID */}
                      <TableCell sx={tdSx}>
                        <Typography sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#16A34A', whiteSpace: 'nowrap' }}>
                          {stock.rawMaterial?.material_id || '—'}
                        </Typography>
                      </TableCell>

                      {/* Description */}
                      <TableCell sx={{ ...tdSx, minWidth: 350 }}>
                        <Typography sx={{ fontWeight: 500, fontSize: '0.75rem', color: 'var(--foreground)', lineHeight: 1.4, whiteSpace: 'nowrap' }}>
                          {descLine1}
                        </Typography>
                      </TableCell>

                      {/* Current Stock (inline editable) */}
                      <TableCell sx={{ ...tdSx, textAlign: 'center' }}>
                        {editingQty.hasOwnProperty(stock.id) ? (
                          <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                            <TextField
                              size="small"
                              type="number"
                              value={editingQty[stock.id]}
                              onChange={e => setEditingQty(prev => ({ ...prev, [stock.id]: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveEditQty(stock);
                                if (e.key === 'Escape') cancelEditQty(stock.id);
                              }}
                              autoFocus
                              disabled={savingQty === stock.id}
                              sx={{
                                width: 90,
                                '& .MuiOutlinedInput-root': {
                                  borderRadius: '8px',
                                  bgcolor: 'var(--bg-input)',
                                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: PRIMARY, boxShadow: `0 0 0 3px ${alpha(PRIMARY, 0.10)}` },
                                },
                                '& input': { textAlign: 'center', fontWeight: 700, fontSize: '0.8rem', py: 0.5 },
                              }}
                            />
                            <Tooltip title="Save">
                              <IconButton
                                size="small"
                                onClick={() => saveEditQty(stock)}
                                disabled={savingQty === stock.id}
                                sx={{ color: PRIMARY, bgcolor: alpha(PRIMARY, 0.08), '&:hover': { bgcolor: alpha(PRIMARY, 0.16) }, borderRadius: '8px', width: 28, height: 28 }}
                              >
                                <SaveIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        ) : (
                          <Tooltip title="Click to edit quantity">
                            <Chip
                              label={stock.quantity}
                              size="small"
                              onClick={() => startEditQty(stock)}
                              sx={{
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                minWidth: 40,
                                bgcolor: alpha('#16A34A', 0.1),
                                color: '#16A34A',
                                borderRadius: '999px',
                                cursor: 'pointer',
                                '&:hover': { bgcolor: alpha('#16A34A', 0.18), transform: 'scale(1.05)' },
                                transition: 'all 0.15s ease',
                              }}
                            />
                          </Tooltip>
                        )}
                      </TableCell>

                      {/* Heat Number */}
                      <TableCell sx={tdSx}>
                        <Typography sx={{ fontSize: '0.8rem', color: 'var(--foreground)', whiteSpace: 'nowrap' }}>
                          {stock.heat_number || '—'}
                        </Typography>
                      </TableCell>

                      {/* Status */}
                      <TableCell sx={{ ...tdSx, textAlign: 'center' }}>
                        <StatusBadge status={status} />
                      </TableCell>

                      {/* Actions: Edit, Duplicate, Delete */}
                      <TableCell sx={{ ...tdSx, textAlign: 'center' }}>
                        <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                          <Tooltip title="Edit">
                            <IconButton
                              size="small"
                              onClick={() => openEdit(stock)}
                              sx={{
                                color: PRIMARY,
                                bgcolor: alpha(PRIMARY, 0.06),
                                border: '1px solid',
                                borderColor: alpha(PRIMARY, 0.2),
                                '&:hover': { bgcolor: alpha(PRIMARY, 0.14) },
                                borderRadius: '8px',
                                width: 32,
                                height: 32,
                              }}
                            >
                              <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Duplicate">
                            <IconButton
                              size="small"
                              onClick={() => handleDuplicate(stock)}
                              sx={{
                                color: 'var(--foreground)',
                                bgcolor: alpha('#6B7280', 0.06),
                                border: '1px solid',
                                borderColor: alpha('#6B7280', 0.2),
                                '&:hover': { bgcolor: alpha(PRIMARY, 0.08), color: PRIMARY },
                                borderRadius: '8px',
                                width: 32,
                                height: 32,
                              }}
                            >
                              <CopyIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton
                              size="small"
                              onClick={() => openDelete(stock)}
                              sx={{
                                color: '#DC2626',
                                bgcolor: alpha('#DC2626', 0.06),
                                border: '1px solid',
                                borderColor: alpha('#DC2626', 0.2),
                                '&:hover': { bgcolor: alpha('#DC2626', 0.14) },
                                borderRadius: '8px',
                                width: 32,
                                height: 32,
                              }}
                            >
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>


      {/* ═══════ EDIT DIALOG ═══════ */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '14px' } }}>
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid var(--border)', pb: 2 }}>Edit Stock Item</DialogTitle>
        <DialogContent sx={{ pt: 2, pb: 1 }}>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Row 1: Part Description (full width) */}
            <TextField size="small" label="Part Description" fullWidth value={editItem?.part_description || ''} onChange={e => setEditItem(prev => ({ ...prev, part_description: e.target.value }))} />
            {/* Row 2: Material & Grade | Condition */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField size="small" label="Material & Grade" fullWidth value={editItem?.material_grade || ''} onChange={e => setEditItem(prev => ({ ...prev, material_grade: e.target.value }))} />
              <TextField size="small" label="Condition" fullWidth value={editItem?.condition || ''} onChange={e => setEditItem(prev => ({ ...prev, condition: e.target.value }))} />
            </Box>
            {/* Row 3: Shape | Dimension */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField size="small" label="Shape" fullWidth value={editItem?.shape || ''} onChange={e => setEditItem(prev => ({ ...prev, shape: e.target.value }))} />
              <TextField size="small" label="Dimension" fullWidth value={editItem?.dimension || ''} onChange={e => setEditItem(prev => ({ ...prev, dimension: e.target.value }))} />
            </Box>
            {/* Row 4: Quantity | Heat Number */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField size="small" label="Quantity" fullWidth type="number" value={editItem?.quantity || ''} onChange={e => setEditItem(prev => ({ ...prev, quantity: e.target.value }))} />
              <TextField size="small" label="Heat Number" fullWidth value={editItem?.heat_number || ''} onChange={e => setEditItem(prev => ({ ...prev, heat_number: e.target.value }))} />
            </Box>
            {/* Row 5: Certificate */}
            <input
              ref={editCertRef}
              type="file"
              hidden
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file) {
                  setEditItem(prev => ({ ...prev, certificate_file: file }));
                }
                e.target.value = '';
              }}
            />
            {editItem?.certificate_url && !editItem?.certificate_file && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={async () => {
                    try {
                      const res = await api.get(`/stocks/${editItem.id}/certificate`, { responseType: 'blob' });
                      const contentType = res.headers['content-type'] || '';
                      // If backend returned JSON error inside blob, parse it
                      if (contentType.includes('application/json')) {
                        const text = await res.data.text();
                        const json = JSON.parse(text);
                        throw new Error(json.message || 'Certificate not found');
                      }
                      const url = URL.createObjectURL(res.data);
                      window.open(url, '_blank');
                    } catch (err) {
                      // Extract message from Axios error response or Error object
                      const msg = err?.response?.data?.message
                        || err?.message
                        || 'Failed to open certificate';
                      if (msg.includes('not found on disk')) {
                        showToast('warning', 'Certificate file was lost after server restart. Please re-upload.');
                        setEditItem(prev => ({ ...prev, certificate_url: null }));
                      } else {
                        showToast('error', msg);
                      }
                    }
                  }}
                  startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
                  sx={{
                    height: 40,
                    borderRadius: '8px',
                    borderColor: '#0891B2',
                    color: '#0891B2',
                    textTransform: 'none',
                    justifyContent: 'flex-start',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    '&:hover': { borderColor: '#0891B2', bgcolor: alpha('#0891B2', 0.06) },
                  }}
                >
                  {editItem.certificate_url.split('/').pop()}
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => editCertRef.current?.click()}
                  sx={{
                    height: 40,
                    minWidth: 40,
                    borderRadius: '8px',
                    borderColor: 'rgba(0,0,0,0.23)',
                    color: 'var(--muted)',
                    '&:hover': { borderColor: PRIMARY, color: PRIMARY, bgcolor: alpha(PRIMARY, 0.04) },
                  }}
                >
                  <UploadIcon sx={{ fontSize: 18 }} />
                </Button>
              </Box>
            )}
            {(!editItem?.certificate_url || editItem?.certificate_file) && (
              <Button
                variant="outlined"
                fullWidth
                onClick={() => editCertRef.current?.click()}
                startIcon={<UploadIcon sx={{ fontSize: 16 }} />}
                sx={{
                  height: 40,
                  borderRadius: '8px',
                  borderColor: editItem?.certificate_file ? PRIMARY : 'rgba(0,0,0,0.23)',
                  color: editItem?.certificate_file ? PRIMARY : 'var(--muted)',
                  textTransform: 'none',
                  justifyContent: 'flex-start',
                  fontWeight: 500,
                  fontSize: '0.8rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  '&:hover': { borderColor: PRIMARY, bgcolor: alpha(PRIMARY, 0.04) },
                }}
              >
                {editItem?.certificate_file
                  ? editItem.certificate_file.name
                  : 'Upload Certificate'}
              </Button>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--border)' }}>
          <Button onClick={() => setEditOpen(false)} sx={{ color: 'var(--muted)', textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleEditSave} disabled={saving} sx={{ bgcolor: PRIMARY, textTransform: 'none', fontWeight: 700, borderRadius: '10px', '&:hover': { bgcolor: alpha(PRIMARY, 0.9) } }}>Save Changes</Button>
        </DialogActions>
      </Dialog>


      {/* ═══════ DELETE DIALOG ═══════ */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '14px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Stock Item?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete <strong>{deleteItem?.part_description}</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} sx={{ color: 'var(--muted)', textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px' }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* ═══════ BULK DELETE DIALOG ═══════ */}
      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '14px' } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Selected Items?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete the selected items?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setBulkDeleteOpen(false)} sx={{ color: 'var(--muted)', textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleBulkDelete} disabled={bulkDeleting} sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px' }}>
            {bulkDeleting ? 'Deleting...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══════ ADD MATERIAL DIALOG ═══════ */}
      <Dialog open={addMaterialOpen} onClose={() => { setAddMaterialOpen(false); resetAddMaterialForm(); }} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '14px' } }}>
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid var(--border)', pb: 2 }}>Add Material from Raw Material Master</DialogTitle>
        <DialogContent sx={{ pt: 2, pb: 1 }}>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Row 1: Full width - Select Raw Material */}
            <Autocomplete
              size="small"
              options={rawMaterials}
              getOptionLabel={(opt) => {
                const dims = opt.dimensions || {};
                const dimStr = Object.entries(dims).filter(([, v]) => v).map(([, v]) => v).join(' x ');
                return [opt.material_category, opt.material_grade, opt.condition, opt.shape || opt.form, dimStr].filter(Boolean).join(' | ');
              }}
              value={addMaterialForm.selectedRawMaterial}
              onChange={(_, val) => {
                if (val) {
                  const dims = val.dimensions || {};
                  const dimStr = Object.entries(dims).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ');
                  setAddMaterialForm({
                    selectedRawMaterial: val,
                    part_description: val.material_category || '',
                    material_grade: val.material_grade || '',
                    condition: val.condition || '',
                    shape: val.shape || val.form || '',
                    dimension: dimStr,
                    quantity: '',
                    heat_number: '',
                    certificate_file: null,
                  });
                } else {
                  resetAddMaterialForm();
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Raw Material"
                  placeholder="Search raw materials..."
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: PRIMARY },
                    },
                  }}
                />
              )}
              isOptionEqualToValue={(opt, val) => opt.id === val?.id}
            />
            {/* Row 2: Part Description | Material Grade */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField size="small" label="Part Description" fullWidth value={addMaterialForm.part_description} onChange={e => setAddMaterialForm(prev => ({ ...prev, part_description: e.target.value }))} />
              <TextField size="small" label="Material & Grade" fullWidth value={addMaterialForm.material_grade} onChange={e => setAddMaterialForm(prev => ({ ...prev, material_grade: e.target.value }))} />
            </Box>
            {/* Row 3: Condition | Shape */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField size="small" label="Condition" fullWidth value={addMaterialForm.condition} onChange={e => setAddMaterialForm(prev => ({ ...prev, condition: e.target.value }))} />
              <TextField size="small" label="Shape" fullWidth value={addMaterialForm.shape} onChange={e => setAddMaterialForm(prev => ({ ...prev, shape: e.target.value }))} />
            </Box>
            {/* Row 4: Dimension | Quantity */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField size="small" label="Dimension" fullWidth value={addMaterialForm.dimension} onChange={e => setAddMaterialForm(prev => ({ ...prev, dimension: e.target.value }))} />
              <TextField size="small" label="Quantity" fullWidth type="number" value={addMaterialForm.quantity} onChange={e => setAddMaterialForm(prev => ({ ...prev, quantity: e.target.value }))} />
            </Box>
            {/* Row 5: Heat Number | Upload Certificate */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TextField size="small" label="Heat Number" fullWidth value={addMaterialForm.heat_number} onChange={e => setAddMaterialForm(prev => ({ ...prev, heat_number: e.target.value }))} />
              <input
                ref={addCertRef}
                type="file"
                hidden
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file) {
                    setAddMaterialForm(prev => ({ ...prev, certificate_file: file }));
                  }
                  e.target.value = '';
                }}
              />
              <Button
                variant="outlined"
                fullWidth
                onClick={() => addCertRef.current?.click()}
                startIcon={<UploadIcon sx={{ fontSize: 16 }} />}
                sx={{
                  height: 40,
                  borderRadius: '8px',
                  borderColor: addMaterialForm.certificate_file ? PRIMARY : 'rgba(0,0,0,0.23)',
                  color: addMaterialForm.certificate_file ? PRIMARY : 'var(--muted)',
                  textTransform: 'none',
                  justifyContent: 'flex-start',
                  fontWeight: 500,
                  fontSize: '0.8rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  '&:hover': { borderColor: PRIMARY, bgcolor: alpha(PRIMARY, 0.04) },
                }}
              >
                {addMaterialForm.certificate_file ? addMaterialForm.certificate_file.name : 'Upload Certificate'}
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid var(--border)' }}>
          <Button onClick={() => { setAddMaterialOpen(false); resetAddMaterialForm(); }} sx={{ color: 'var(--muted)', textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={handleAddMaterialFromRaw} disabled={saving} sx={{ bgcolor: PRIMARY, textTransform: 'none', fontWeight: 700, borderRadius: '10px', '&:hover': { bgcolor: alpha(PRIMARY, 0.9) } }}>Add to Stock</Button>
        </DialogActions>
      </Dialog>

      {/* ── Toast ── */}
      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setToast(prev => ({ ...prev, open: false }))}
          severity={toast.severity}
          variant="filled"
          sx={{ borderRadius: '10px' }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MaterialStockPage;
