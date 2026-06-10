import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, TextField, InputAdornment, Alert, Snackbar,
  Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, alpha, Skeleton, Badge, Checkbox,
} from '@mui/material';
import {
  Search as SearchIcon, RestoreFromTrash as RestoreIcon,
  DeleteForever as DeleteForeverIcon, Delete as DeleteIcon,
  Person as PersonIcon, Business as BusinessIcon,
  Folder as FolderIcon, Store as StoreIcon,
  Domain as DomainIcon, Refresh as RefreshIcon,
  ShoppingCart as ProcurementIcon,
  Description as RFQIcon,
  Receipt as POIcon,
  Memory as ComponentsIcon,
  ChevronLeft as ChevLeft, ChevronRight as ChevRight,
} from '@mui/icons-material';
import { recycleBinService, RecycleBinData, RecycleBinItem } from '../services/recycleBinService';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

const PRIMARY = '#1F7A63';
const ROWS_PER_PAGE = 15;

const MODULE_CONFIG: Record<string, { label: string; icon: React.ReactElement<any>; nameField: string }> = {
  clients:          { label: 'Clients',          icon: <BusinessIcon fontSize="small" />,    nameField: 'client_name' },
  vendors:          { label: 'Vendors',          icon: <StoreIcon fontSize="small" />,       nameField: 'vendor_name' },
  projects:         { label: 'Projects',         icon: <FolderIcon fontSize="small" />,      nameField: 'project_name' },
  users:            { label: 'Users',            icon: <PersonIcon fontSize="small" />,      nameField: 'name' },
  companies:        { label: 'Companies',        icon: <DomainIcon fontSize="small" />,      nameField: 'name' },
  procurement_rfqs: { label: 'RFQs',             icon: <RFQIcon fontSize="small" />,         nameField: 'rfq_number' },
  procurement_pos:  { label: 'Purchase Orders',  icon: <POIcon fontSize="small" />,          nameField: 'po_number' },
  configurator_components: { label: 'Components', icon: <ComponentsIcon fontSize="small" />, nameField: 'name' },
};

const PROCUREMENT_MODULES = ['procurement_rfqs', 'procurement_pos'];

const RecycleBinPage: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<RecycleBinData>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; type: 'restore' | 'delete'; item: RecycleBinItem | null;
  }>({ open: false, type: 'restore', item: null });
  const [bulkDialog, setBulkDialog] = useState<{
    open: boolean; type: 'restore' | 'delete';
  }>({ open: false, type: 'restore' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const module = activeTab === 'all' || activeTab === 'procurement' ? undefined : activeTab;
      const result = await recycleBinService.getAll({ module, search: search || undefined });
      setData(result);
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.message || 'Failed to load recycle bin', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [activeTab, search]);

  const handleRestore = async () => {
    if (!confirmDialog.item) return;
    try {
      const result = await recycleBinService.restore(confirmDialog.item._module, confirmDialog.item.id);
      setSnackbar({ open: true, message: result.message, severity: 'success' });
      if (confirmDialog.item._module === 'configurator_components') {
        try { window.dispatchEvent(new CustomEvent('tps:category-updated')); } catch { /* noop */ }
      }
      setConfirmDialog({ open: false, type: 'restore', item: null });
      setSelected(prev => { const n = new Set(prev); n.delete(confirmDialog.item!.id); return n; });
      fetchData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.message || 'Restore failed', severity: 'error' });
    }
  };

  const handlePermanentDelete = async () => {
    if (!confirmDialog.item) return;
    try {
      const result = await recycleBinService.permanentDelete(confirmDialog.item._module, confirmDialog.item.id);
      setSnackbar({ open: true, message: result.message, severity: 'success' });
      if (confirmDialog.item._module === 'configurator_components') {
        try { window.dispatchEvent(new CustomEvent('tps:category-updated')); } catch { /* noop */ }
      }
      setConfirmDialog({ open: false, type: 'delete', item: null });
      setSelected(prev => { const n = new Set(prev); n.delete(confirmDialog.item!.id); return n; });
      fetchData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.message || 'Delete failed', severity: 'error' });
    }
  };

  const handleBulkRestore = async () => {
    const items = displayItems.filter(i => selected.has(i.id)).map(i => ({ module: i._module, id: i.id }));
    if (items.length === 0) return;
    setBulkDialog({ open: false, type: 'restore' });
    try {
      const result = await recycleBinService.bulkRestore(items);
      setSnackbar({ open: true, message: result.message, severity: 'success' });
      if (items.some(i => i.module === 'configurator_components')) {
        try { window.dispatchEvent(new CustomEvent('tps:category-updated')); } catch { /* noop */ }
      }
      setSelected(new Set());
      fetchData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.message || 'Bulk restore failed', severity: 'error' });
    }
  };

  const handleBulkDelete = async () => {
    const items = displayItems.filter(i => selected.has(i.id)).map(i => ({ module: i._module, id: i.id }));
    if (items.length === 0) return;
    setBulkDialog({ open: false, type: 'delete' });
    try {
      const result = await recycleBinService.bulkPermanentDelete(items);
      setSnackbar({ open: true, message: result.message, severity: 'success' });
      if (items.some(i => i.module === 'configurator_components')) {
        try { window.dispatchEvent(new CustomEvent('tps:category-updated')); } catch { /* noop */ }
      }
      setSelected(new Set());
      fetchData();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.message || 'Bulk delete failed', severity: 'error' });
    }
  };

  // Flatten items based on active tab
  const allItems: RecycleBinItem[] = useMemo(() =>
    Object.values(data).flatMap(d => d.items || []).sort((a, b) =>
      new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()
    ), [data]);

  const procurementItems: RecycleBinItem[] = useMemo(() =>
    PROCUREMENT_MODULES.flatMap(mod => (data[mod]?.items || [])).sort((a, b) =>
      new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()
    ), [data]);

  const displayItems: RecycleBinItem[] = useMemo(() => {
    if (activeTab === 'all') return allItems;
    if (activeTab === 'procurement') return procurementItems;
    return data[activeTab]?.items || [];
  }, [activeTab, allItems, procurementItems, data]);

  const totalCount = Object.values(data).reduce((sum, d) => sum + (d.total || 0), 0);
  const procurementCount = PROCUREMENT_MODULES.reduce((sum, mod) => sum + (data[mod]?.total || 0), 0);
  const totalPages = Math.max(1, Math.ceil(displayItems.length / ROWS_PER_PAGE));
  const paged = displayItems.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const allPageSelected = paged.length > 0 && paged.every(r => selected.has(r.id));
  const somePageSelected = paged.some(r => selected.has(r.id));
  const togglePageSelect = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allPageSelected) { paged.forEach(r => next.delete(r.id)); }
      else { paged.forEach(r => next.add(r.id)); }
      return next;
    });
  };
  const toggleRow = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const thSx = { fontWeight: 700, fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' as const };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 44, height: 44, borderRadius: '12px', bgcolor: alpha(PRIMARY, 0.08),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <DeleteIcon sx={{ color: PRIMARY, fontSize: 24 }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Recycle Bin
            </Typography>
            <Typography sx={{ fontSize: '0.8rem', color: '#64748B' }}>
              {totalCount} deleted item{totalCount !== 1 ? 's' : ''} — restore or permanently remove
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          {selected.size > 0 && (
            <>
              <Button size="small" variant="outlined" startIcon={<RestoreIcon sx={{ fontSize: 16 }} />}
                onClick={() => setBulkDialog({ open: true, type: 'restore' })}
                sx={{ textTransform: 'none', fontSize: '0.8rem', borderRadius: '8px', borderColor: PRIMARY, color: PRIMARY,
                  '&:hover': { bgcolor: alpha(PRIMARY, 0.06), borderColor: PRIMARY } }}>
                Restore Selected ({selected.size})
              </Button>
              {user?.role === 'main_admin' && (
                <Button size="small" variant="outlined" startIcon={<DeleteForeverIcon sx={{ fontSize: 16 }} />}
                  onClick={() => setBulkDialog({ open: true, type: 'delete' })}
                  sx={{ textTransform: 'none', fontSize: '0.8rem', borderRadius: '8px', borderColor: '#DC2626', color: '#DC2626',
                    '&:hover': { bgcolor: alpha('#DC2626', 0.06), borderColor: '#DC2626' } }}>
                  Delete Selected ({selected.size})
                </Button>
              )}
            </>
          )}
          <TextField
            size="small"
            placeholder="Search deleted items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: 'var(--text-muted)' }} /></InputAdornment>,
            }}
            sx={{ width: 260, '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: '0.85rem' } }}
          />
          <Tooltip title="Refresh">
            <IconButton onClick={fetchData} sx={{ border: '1px solid var(--border)', borderRadius: '10px' }}>
              <RefreshIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2,
          '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.85rem', minHeight: 40 },
          '& .Mui-selected': { color: `${PRIMARY} !important` },
          '& .MuiTabs-indicator': { backgroundColor: PRIMARY },
        }}
      >
        <Tab value="all" label={
          <Badge badgeContent={totalCount} color="default" max={999}
            sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', height: 18, minWidth: 18 } }}>
            <span style={{ paddingRight: totalCount > 0 ? 12 : 0 }}>All</span>
          </Badge>
        } />
        {Object.entries(MODULE_CONFIG).filter(([k]) => !PROCUREMENT_MODULES.includes(k)).map(([key, cfg]) => {
          const count = data[key]?.total || 0;
          return (
            <Tab key={key} value={key} label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {cfg.icon}
                <span>{cfg.label}</span>
                {count > 0 && (
                  <Chip label={count} size="small"
                    sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', fontWeight: 700,
                      bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY }} />
                )}
              </Box>
            } />
          );
        })}
        <Tab value="procurement" label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ProcurementIcon fontSize="small" />
            <span>Procurement</span>
            {procurementCount > 0 && (
              <Chip label={procurementCount} size="small"
                sx={{ ml: 0.5, height: 18, fontSize: '0.65rem', fontWeight: 700,
                  bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY }} />
            )}
          </Box>
        } />
      </Tabs>

      {/* Table */}
      <TableContainer sx={{
        bgcolor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'var(--bg-surface-2)' }}>
              <TableCell padding="checkbox" sx={{ width: 42 }}>
                <Checkbox size="small" checked={allPageSelected} indeterminate={somePageSelected && !allPageSelected}
                  onChange={togglePageSelect} sx={{ color: '#94A3B8', '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: PRIMARY } }} />
              </TableCell>
              <TableCell sx={{ ...thSx, width: 52 }}>S.No</TableCell>
              <TableCell sx={thSx}>Name / Number</TableCell>
              <TableCell sx={thSx}>Type</TableCell>
              <TableCell sx={thSx}>Deleted</TableCell>
              <TableCell sx={thSx}>Deleted By</TableCell>
              <TableCell align="right" sx={thSx}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell padding="checkbox"><Skeleton variant="rectangular" width={18} height={18} /></TableCell>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton variant="text" width={j === 1 ? 180 : 100} /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                  <DeleteIcon sx={{ fontSize: 48, color: 'var(--border)', mb: 1 }} />
                  <Typography sx={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {search ? 'No matching deleted items found' : 'Recycle bin is empty'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              paged.map((item, idx) => {
                const cfg = MODULE_CONFIG[item._module] || { label: item._module, icon: <DeleteIcon fontSize="small" />, nameField: 'id' };
                const sno = (page - 1) * ROWS_PER_PAGE + idx + 1;
                const typeLabel = item._module === 'procurement_rfqs' ? 'RFQ'
                  : item._module === 'procurement_pos' ? 'Purchase Order'
                  : cfg.label.endsWith('s') ? cfg.label.slice(0, -1) : cfg.label;
                return (
                  <TableRow key={`${item._module}-${item.id}`} hover selected={selected.has(item.id)}
                    sx={{ '&:last-child td': { border: 0 }, transition: 'background 0.15s' }}>
                    <TableCell padding="checkbox">
                      <Checkbox size="small" checked={selected.has(item.id)} onChange={() => toggleRow(item.id)}
                        sx={{ color: '#94A3B8', '&.Mui-checked': { color: PRIMARY } }} />
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>{sno}</Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{
                          width: 36, height: 36, borderRadius: '10px', bgcolor: alpha(PRIMARY, 0.08),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: PRIMARY, fontSize: '0.75rem', fontWeight: 700,
                        }}>
                          {(item._displayName || '?').substring(0, 2).toUpperCase()}
                        </Box>
                        <Box>
                          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#1E293B', whiteSpace: 'nowrap' }}>
                            {item._displayName}
                          </Typography>
                          {item.email && item._module === 'users' && (
                            <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{item.email}</Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={cfg.icon}
                        label={typeLabel}
                        size="small"
                        sx={{
                          height: 24, fontSize: '0.72rem', fontWeight: 600,
                          bgcolor: alpha(PRIMARY, 0.06), color: PRIMARY, border: `1px solid ${alpha(PRIMARY, 0.12)}`,
                          '& .MuiChip-icon': { color: PRIMARY },
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title={dayjs(item.deleted_at).format('MMM D, YYYY h:mm A')}>
                        <Typography sx={{ fontSize: '0.82rem', color: '#64748B' }}>
                          {dayjs(item.deleted_at).fromNow()}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.82rem', color: '#64748B' }}>
                        {item._deletedByName || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title="Restore">
                          <IconButton size="small"
                            onClick={() => setConfirmDialog({ open: true, type: 'restore', item })}
                            sx={{
                              color: PRIMARY, bgcolor: alpha(PRIMARY, 0.06),
                              '&:hover': { bgcolor: alpha(PRIMARY, 0.12) },
                            }}>
                            <RestoreIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                        {user?.role === 'main_admin' && (
                          <Tooltip title="Delete permanently">
                            <IconButton size="small"
                              onClick={() => setConfirmDialog({ open: true, type: 'delete', item })}
                              sx={{
                                color: '#DC2626', bgcolor: alpha('#DC2626', 0.06),
                                '&:hover': { bgcolor: alpha('#DC2626', 0.12) },
                              }}>
                              <DeleteForeverIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {displayItems.length > ROWS_PER_PAGE && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, px: 1 }}>
          <Typography sx={{ fontSize: '0.8rem', color: '#64748B' }}>
            Showing {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, displayItems.length)} of {displayItems.length}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <IconButton size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              sx={{ border: '1px solid var(--border)', borderRadius: '8px' }}>
              <ChevLeft sx={{ fontSize: 18 }} />
            </IconButton>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, mx: 1, color: '#1E293B' }}>
              {page} / {totalPages}
            </Typography>
            <IconButton size="small" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              sx={{ border: '1px solid var(--border)', borderRadius: '8px' }}>
              <ChevRight sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </Box>
      )}

      {/* Single Item Confirm Dialog */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ ...confirmDialog, open: false })}
        PaperProps={{ sx: { borderRadius: '14px', maxWidth: 420 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem', pb: 0.5 }}>
          {confirmDialog.type === 'restore' ? 'Restore Item' : 'Permanently Delete'}
        </DialogTitle>
        <DialogContent>
          {confirmDialog.type === 'restore' ? (
            <Typography sx={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Restore <strong>{confirmDialog.item?._displayName}</strong> back to{' '}
              {MODULE_CONFIG[confirmDialog.item?._module || '']?.label || 'its module'}?
            </Typography>
          ) : (
            <Alert severity="warning" sx={{ fontSize: '0.85rem' }}>
              This will permanently delete <strong>{confirmDialog.item?._displayName}</strong> and all related data.
              This action cannot be undone.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setConfirmDialog({ ...confirmDialog, open: false })}
            sx={{ textTransform: 'none', color: '#64748B' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={confirmDialog.type === 'restore' ? handleRestore : handlePermanentDelete}
            sx={{
              textTransform: 'none', fontWeight: 600, borderRadius: '8px',
              bgcolor: confirmDialog.type === 'restore' ? PRIMARY : '#DC2626',
              '&:hover': { bgcolor: confirmDialog.type === 'restore' ? '#166653' : '#B91C1C' },
            }}
          >
            {confirmDialog.type === 'restore' ? 'Restore' : 'Delete Forever'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Confirm Dialog */}
      <Dialog open={bulkDialog.open} onClose={() => setBulkDialog({ ...bulkDialog, open: false })}
        PaperProps={{ sx: { borderRadius: '14px', maxWidth: 440 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem', pb: 0.5 }}>
          {bulkDialog.type === 'restore' ? `Restore ${selected.size} Item(s)` : `Permanently Delete ${selected.size} Item(s)`}
        </DialogTitle>
        <DialogContent>
          {bulkDialog.type === 'restore' ? (
            <Typography sx={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Are you sure you want to restore <strong>{selected.size}</strong> selected item(s) back to their original modules?
            </Typography>
          ) : (
            <Alert severity="warning" sx={{ fontSize: '0.85rem' }}>
              Are you sure you want to permanently delete <strong>{selected.size}</strong> selected item(s)?
              This action cannot be undone.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 0 }}>
          <Button onClick={() => setBulkDialog({ ...bulkDialog, open: false })}
            sx={{ textTransform: 'none', color: '#64748B' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={bulkDialog.type === 'restore' ? handleBulkRestore : handleBulkDelete}
            sx={{
              textTransform: 'none', fontWeight: 600, borderRadius: '8px',
              bgcolor: bulkDialog.type === 'restore' ? PRIMARY : '#DC2626',
              '&:hover': { bgcolor: bulkDialog.type === 'restore' ? '#166653' : '#B91C1C' },
            }}
          >
            {bulkDialog.type === 'restore' ? `Restore ${selected.size} Item(s)` : `Delete ${selected.size} Item(s) Forever`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%', borderRadius: '10px' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default RecycleBinPage;
