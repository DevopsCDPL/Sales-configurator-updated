/**
 * ComponentsPage — Configurator Component Catalogue (Admin)
 *
 * Adapted from `config/src/pages/Components.tsx` into Forge architecture:
 *   • Forge MUI 5 styling, NotificationContext, RBAC patterns
 *   • Reuses existing /api/configurator/components endpoint (no parallel API)
 *   • Soft-delete routes through existing Forge recycle-bin (paranoid model)
 *
 * Features: search (debounced), category + active filter, paginated table,
 * inline edit / delete (with confirm), add button, refresh.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, TextField, InputAdornment,
  MenuItem, Select, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, Tooltip, Chip, Skeleton, Stack, Pagination,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
  Add as AddIcon, Search as SearchIcon, Refresh as RefreshIcon,
  Edit as EditIcon, Delete as DeleteIcon,
} from '@mui/icons-material';
import {
  configuratorService,
  ConfiguratorComponent,
  ConfiguratorCategory,
} from '../services/configuratorService';
import { useNotification } from '../contexts/NotificationContext';

const PAGE_SIZE = 25;
const PRIMARY = '#1F7A63';

const ComponentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const [rows, setRows] = useState<ConfiguratorComponent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1); // 1-based for MUI Pagination
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [category, setCategory] = useState('');
  const [activeOnly, setActiveOnly] = useState<'' | 'true' | 'false'>('');
  const [categories, setCategories] = useState<ConfiguratorCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDel, setConfirmDel] = useState<ConfiguratorComponent | null>(null);

  // Debounce search input
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      };
      if (search) params.q = search;
      if (category) params.category = category;
      if (activeOnly) params.is_active = activeOnly;
      const res: any = await (await import('../services/api')).default.get('/configurator/components', { params });
      const data = res.data?.data ?? [];
      setRows(data);
      setTotal(Number(res.data?.total ?? data.length));
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to load components');
    } finally {
      setLoading(false);
    }
  }, [page, search, category, activeOnly, showError]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    configuratorService.listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const handleDelete = async () => {
    if (!confirmDel) return;
    const target = confirmDel;
    setConfirmDel(null);
    try {
      await configuratorService.deleteComponent(target.id);
      // Drop runtime catalog cache so the configurator picker reflects the deletion.
      try { window.dispatchEvent(new CustomEvent('tps:category-updated')); } catch { /* noop */ }
      showSuccess(`Component "${target.name}" moved to Recycle Bin`);
      load();
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Delete failed');
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight={700} color="text.primary">Components</Typography>
          <Typography variant="body2" color="text.secondary">
            Configurator component catalogue — {total.toLocaleString()} item{total === 1 ? '' : 's'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button startIcon={<RefreshIcon />} onClick={load} variant="outlined">Refresh</Button>
          <Button
            startIcon={<AddIcon />}
            onClick={() => navigate('/components/new')}
            variant="contained"
            sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#176650' } }}
          >
            Add Component
          </Button>
        </Stack>
      </Stack>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            placeholder="Search name, part number, description…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            size="small"
            sx={{ flex: 1, minWidth: 240 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
          />
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={category}
              label="Category"
              onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            >
              <MenuItem value=""><em>All categories</em></MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id || c.name} value={c.name}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={activeOnly}
              label="Status"
              onChange={(e) => { setActiveOnly(e.target.value as any); setPage(1); }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Active</MenuItem>
              <MenuItem value="false">Inactive</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Part #</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Category</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Material Cost</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Labour Hrs</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Updated</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={`sk-${i}`}>
                {Array.from({ length: 8 }).map((__, j) => (
                  <TableCell key={j}><Skeleton /></TableCell>
                ))}
              </TableRow>
            ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                  <Typography color="text.secondary">No components found.</Typography>
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.map((r) => {
              const labourHrs = (
                Number(r.lbr_cu || 0) + Number(r.lbr_asm || 0) + Number(r.lbr_cnt || 0) +
                Number(r.lbr_qc || 0) + Number(r.lbr_tst || 0) + Number(r.lbr_eng || 0) +
                Number(r.lbr_cad || 0)
              );
              return (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{r.name || '—'}</TableCell>
                  <TableCell><Typography variant="body2" color="text.secondary">{r.part_number || '—'}</Typography></TableCell>
                  <TableCell>{r.category ? <Chip size="small" label={r.category} /> : '—'}</TableCell>
                  <TableCell align="right">${Number(r.mat_cost ?? r.material_cost ?? 0).toFixed(2)}</TableCell>
                  <TableCell align="right">{labourHrs.toFixed(2)}</TableCell>
                  <TableCell>
                    {r.is_active === false
                      ? <Chip size="small" label="Inactive" color="default" />
                      : <Chip size="small" label="Active" color="success" variant="outlined" />}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => navigate(`/components/${r.id}/edit`)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Move to Recycle Bin">
                      <IconButton size="small" color="error" onClick={() => setConfirmDel(r)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {pageCount > 1 && (
        <Stack direction="row" justifyContent="center" mt={2}>
          <Pagination
            page={page}
            count={pageCount}
            onChange={(_, p) => setPage(p)}
            color="primary"
            shape="rounded"
          />
        </Stack>
      )}

      {/* Delete confirm */}
      <Dialog open={!!confirmDel} onClose={() => setConfirmDel(null)}>
        <DialogTitle>Delete component?</DialogTitle>
        <DialogContent>
          <Typography>
            "{confirmDel?.name}" will be moved to the Recycle Bin. Admins can restore it within the retention window.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDel(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ComponentsPage;
