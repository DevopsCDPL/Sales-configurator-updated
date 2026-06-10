import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Button, CircularProgress, alpha,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Select, FormControl, InputLabel,
  Autocomplete, Chip, IconButton, Tooltip, Paper, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  Snackbar, Alert, InputAdornment, Skeleton, Checkbox,
  Divider,
} from '@mui/material';
import {
  ShoppingCart as CartIcon,
  Add as AddIcon,
  Send as SendIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  CheckCircle as CheckIcon,
  LocalShipping as ShippingIcon,
  Search as SearchIcon,
  Inbox as InboxIcon,
  WarningAmber as WarningIcon,
  Receipt as ReceiptIcon,
  Description as DocIcon,
  ChevronLeft as ChevLeft,
  ChevronRight as ChevRight,
  ContentCopy as CopyIcon,
  Visibility as ViewIcon,
  Close as CloseIcon,
  DeleteSweep as BulkDeleteIcon,
  Replay as ResendIcon,
} from '@mui/icons-material';
import api from '../services/api';

/* ── Theme tokens (matched to Operations Dashboard) ────────────────────── */
const T = {
  primary:   '#33d6ff',
  primaryLt: '#5ce0ff',
  primaryBg: 'rgba(51, 214, 255, 0.10)',
  dark:      '#1F2937',
  textSec:   '#6B7280',
  textMuted: '#9CA3AF',
  border:    '#E5E7EB',
  borderLight: '#F3F4F6',
  bg:        '#F9FAFB',
  white:     '#FFFFFF',
  surface:   '#FFFFFF',
  zebraRow:  '#FAFBFD',
  hoverRow:  '#E8F7F2',
  blue:      '#166354',
  blueBg:    '#EFF6FF',
  orange:    '#F59E0B',
  orangeBg:  '#FFFBEB',
  red:       '#EF4444',
  redBg:     '#FEF2F2',
  green:     '#059669',
  greenBg:   '#ECFDF5',
  purple:    '#166354',
};

const statusColor: Record<string, string> = {
  Draft:    '#6B7280',
  Sent:     '#166354',
  Ordered:  '#D97706',
  Received: '#059669',
};

const ROWS_PER_PAGE = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 15, 25, 50];

/* ── Helper: format date ───────────────────────────────────────────────── */
const fmtDate = (d: string | null) => {
  if (!d) return '---';
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
};

/* ── Reusable: KPI stat card (dashboard-quality) ───────────────────────── */
type StatItem = { label: string; count: number; color: string; icon: React.ReactNode };
const StatCard = ({ label, count, color, icon }: {
  label: string; count: number; color: string; icon: React.ReactNode;
  active?: boolean; onClick?: () => void;
}) => (
  <Box
    sx={{
      flex: '1 1 0', minWidth: 170, p: '12px 16px', bgcolor: 'var(--card)', borderRadius: 'var(--radius)',
      border: '1px solid var(--border)', borderLeft: `3px solid ${color}`,
      boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: '12px',
      transition: 'box-shadow 0.2s', '&:hover': { boxShadow: 'var(--shadow)' },
    }}
  >
    <Box sx={{
      width: 38, height: 38, borderRadius: 'var(--radius-sm)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      bgcolor: alpha(color, 0.08),
    }}>
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.06em', lineHeight: 1, mb: '4px', whiteSpace: 'nowrap' }}>{label}</Typography>
      <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--foreground)', lineHeight: 1 }}>{count}</Typography>
    </Box>
  </Box>
);

/* ── Reusable: Search + status filter bar (dashboard-quality) ──────────── */
const FilterBar = ({ search, onSearch, statusFilter, onStatusFilter, statusCounts }: {
  search: string; onSearch: (v: string) => void;
  statusFilter: string; onStatusFilter: (v: string) => void;
  statusCounts: Record<string, number>;
}) => (
  <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center', mb: 0, flexWrap: 'wrap' }}>
    <TextField
      size="small"
      placeholder="Search..."
      value={search}
      onChange={(e: any) => onSearch(e.target.value)}
      sx={{
        minWidth: 200, flex: '0 1 260px',
        '& .MuiOutlinedInput-root': {
          borderRadius: '8px', fontSize: 12, bgcolor: T.bg, height: 34,
          '& fieldset': { borderColor: T.border },
          '&:hover fieldset': { borderColor: T.textSec },
          '&.Mui-focused fieldset': { borderColor: T.primary, borderWidth: 1.5 },
        },
      }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ fontSize: 15, color: T.textSec }} />
          </InputAdornment>
        ),
      }}
    />
    <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {Object.entries(statusCounts).map(([status, count]) => {
        const c = status === 'All' ? T.primary : (statusColor[status] || T.textSec);
        const isActive = statusFilter === status;
        return (
          <Chip
            key={status}
            label={`${status} (${count})`}
            size="small"
            onClick={() => onStatusFilter(isActive && status !== 'All' ? 'All' : status)}
            sx={{
              fontWeight: isActive ? 700 : 500, fontSize: 11, borderRadius: '999px',
              height: 26, px: '6px',
              bgcolor: isActive ? c : 'transparent',
              color: isActive ? '#FFFFFF' : T.textSec,
              border: isActive ? `1.5px solid ${c}` : `1.5px solid ${T.border}`,
              cursor: 'pointer',
              boxShadow: isActive ? `0 2px 8px ${alpha(c, 0.25)}` : 'none',
              transition: 'all 0.2s',
              '&:hover': isActive ? { bgcolor: alpha(c, 0.85) } : { bgcolor: T.bg, borderColor: alpha(c, 0.4), color: c },
            }}
          />
        );
      })}
    </Box>
  </Box>
);

/* ── Reusable: Empty state ─────────────────────────────────────────────── */
const EmptyState = ({ icon, title, subtitle, colSpan }: {
  icon: React.ReactNode; title: string; subtitle: string; colSpan: number;
}) => (
  <TableRow>
    <TableCell colSpan={colSpan} sx={{ py: 8, border: 'none' }}>
      <Box sx={{ textAlign: 'center' }}>
        <Box sx={{
          width: 64, height: 64, borderRadius: '18px', mx: 'auto', mb: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `linear-gradient(135deg, ${alpha(T.primary, 0.08)}, ${alpha(T.primary, 0.18)})`,
          border: `1.5px solid ${alpha(T.primary, 0.12)}`,
          boxShadow: `0 4px 16px ${alpha(T.primary, 0.08)}`,
        }}>
          {icon}
        </Box>
        <Typography fontWeight={700} fontSize={15} color={T.dark} sx={{ letterSpacing: '-0.01em' }}>{title}</Typography>
        <Typography fontSize={12} color={T.textMuted} mt={0.5}>{subtitle}</Typography>
      </Box>
    </TableCell>
  </TableRow>
);

/* ── Reusable: Delete confirmation dialog ──────────────────────────────── */
const DeleteConfirmDialog = ({ open, onClose, onConfirm, itemLabel }: {
  open: boolean; onClose: () => void; onConfirm: () => void; itemLabel: string;
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' } }}>
    <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, fontSize: 16, borderBottom: `1px solid ${T.border}`, letterSpacing: '-0.01em' }}>
      <Box sx={{
        width: 38, height: 38, borderRadius: '12px', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, ${alpha('#EF4444', 0.12)}, ${alpha('#EF4444', 0.06)})`,
        border: `1px solid ${alpha('#EF4444', 0.15)}`,
      }}>
        <WarningIcon sx={{ fontSize: 20, color: '#EF4444' }} />
      </Box>
      Confirm Delete
    </DialogTitle>
    <DialogContent sx={{ pt: '16px !important' }}>
      <Typography fontSize={13} color={T.textSec} lineHeight={1.6}>
        Are you sure you want to delete <strong>{itemLabel}</strong>? This action cannot be undone.
      </Typography>
    </DialogContent>
    <DialogActions sx={{ borderTop: `1px solid ${T.border}`, px: 3, py: 1.5 }}>
      <Button onClick={onClose} sx={{ textTransform: 'none', fontSize: 13, borderRadius: '8px', color: T.textSec }}>Cancel</Button>
      <Button variant="contained" onClick={onConfirm}
        sx={{ bgcolor: '#EF4444', textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '8px', boxShadow: `0 2px 8px ${alpha('#EF4444', 0.3)}`, '&:hover': { bgcolor: '#DC2626' } }}>
        Delete
      </Button>
    </DialogActions>
  </Dialog>
);

/* ── Reusable: Pagination controls with page size selector ──────────── */
const PaginationBar = ({ page, totalPages, totalItems, pageSize, onPageChange, onPageSizeChange }: {
  page: number; totalPages: number; totalItems: number;
  pageSize: number; onPageChange: (p: number) => void;
  onPageSizeChange?: (s: number) => void;
}) => {
  const [customOpen, setCustomOpen] = useState(false);
  const [customVal, setCustomVal] = useState('');

  if (totalItems === 0) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalItems);

  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography fontSize={12} color={T.textSec}>Showing {start}–{end} of {totalItems}</Typography>
        {onPageSizeChange && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
            <Typography fontSize={11} color={T.textSec}>Rows:</Typography>
            <FormControl size="small" sx={{ minWidth: 72 }}>
              <Select
                value={PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : 'custom'}
                onChange={(e: any) => {
                  const v = e.target.value;
                  if (v === 'custom') { setCustomOpen(true); return; }
                  onPageSizeChange(Number(v));
                }}
                sx={{ fontSize: 12, height: 28, borderRadius: '6px', '& .MuiSelect-select': { py: 0.3 } }}
              >
                {PAGE_SIZE_OPTIONS.map(s => <MenuItem key={s} value={s} sx={{ fontSize: 12 }}>{s}</MenuItem>)}
                <MenuItem value="custom" sx={{ fontSize: 12, fontStyle: 'italic' }}>Custom…</MenuItem>
              </Select>
            </FormControl>
            {!PAGE_SIZE_OPTIONS.includes(pageSize) && (
              <Chip label={`${pageSize}/page`} size="small" onDelete={() => onPageSizeChange(5)}
                sx={{ fontSize: 10, height: 22 }} />
            )}
          </Box>
        )}
      </Box>
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <IconButton size="small" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
            <ChevLeft fontSize="small" />
          </IconButton>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum = i;
            if (totalPages > 7) {
              if (page < 4) pageNum = i;
              else if (page > totalPages - 5) pageNum = totalPages - 7 + i;
              else pageNum = page - 3 + i;
            }
            return (
              <Box
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                sx={{
                  width: 28, height: 28, borderRadius: '8px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  fontSize: 12, fontWeight: page === pageNum ? 700 : 500,
                  bgcolor: page === pageNum ? T.primary : 'transparent',
                  color: page === pageNum ? T.white : T.textSec,
                  '&:hover': page === pageNum ? {} : { bgcolor: T.primaryBg },
                }}
              >
                {pageNum + 1}
              </Box>
            );
          })}
          <IconButton size="small" disabled={page === totalPages - 1} onClick={() => onPageChange(page + 1)}>
            <ChevRight fontSize="small" />
          </IconButton>
        </Box>
      )}
      {/* Custom page size dialog */}
      <Dialog open={customOpen} onClose={() => setCustomOpen(false)} maxWidth="xs"
        PaperProps={{ sx: { borderRadius: '12px', p: 1 } }}>
        <DialogTitle sx={{ fontSize: 14, fontWeight: 600, pb: 1 }}>Custom Page Size</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField size="small" type="number" label="Rows per page" value={customVal}
            onChange={(e: any) => setCustomVal(e.target.value)}
            inputProps={{ min: 1, max: 500 }}
            InputProps={{ sx: { fontSize: 13, borderRadius: '8px' } }}
            InputLabelProps={{ sx: { fontSize: 13 } }}
            helperText="Enter 1–500"
            fullWidth autoFocus />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCustomOpen(false)} sx={{ fontSize: 12, textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={() => {
            const n = parseInt(customVal, 10);
            if (n > 0 && n <= 500) { onPageSizeChange!(n); setCustomOpen(false); setCustomVal(''); }
          }} disabled={!customVal || parseInt(customVal, 10) <= 0 || parseInt(customVal, 10) > 500}
            sx={{ bgcolor: T.primary, fontSize: 12, textTransform: 'none', borderRadius: '8px', '&:hover': { bgcolor: alpha(T.primary, 0.9) } }}>
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   Main Page Component
   ══════════════════════════════════════════════════════════════════════════ */
const MgmtProcurementPage = () => {
  const [tab, setTab] = useState(0);
  const [pendingRfqId, setPendingRfqId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ open: boolean; msg: string; severity: 'success' | 'error' }>({ open: false, msg: '', severity: 'success' });
  const [sectionStats, setSectionStats] = useState<StatItem[]>([]);

  // Stable identity — child sections include `showToast` in their useCallback deps,
  // so an unstable reference causes a re-fetch loop on every parent render.
  const showToast = useCallback((msg: string, severity: 'success' | 'error' = 'success') => {
    setToast({ open: true, msg, severity });
  }, []);

  const handleCreatePoFromRfq = (rfqId: string) => {
    setPendingRfqId(rfqId);
    setTab(1);
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Page header + inline stat cards */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <Box sx={{
          width: 44, height: 44, borderRadius: '12px', display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          background: `linear-gradient(135deg, ${T.primary}, ${alpha(T.primary, 0.75)})`,
          boxShadow: `0 4px 14px ${alpha(T.primary, 0.25)}`,
        }}>
          <CartIcon sx={{ fontSize: 22, color: '#fff' }} />
        </Box>
        <Box sx={{ flexShrink: 0 }}>
          <Typography fontWeight={800} fontSize={23} color={T.dark} sx={{ letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            Procurement
          </Typography>
          <Typography fontSize={12.5} color={T.textMuted} fontWeight={500}>
            Buy materials independently — RFQ → PO → Track
          </Typography>
        </Box>
        {sectionStats.length > 0 && (
          <Box sx={{ display: 'flex', gap: '12px', flex: 1, minWidth: 0, ml: 2 }}>
            {sectionStats.map(s => (
              <StatCard key={s.label} label={s.label} count={s.count} color={s.color} icon={s.icon} />
            ))}
          </Box>
        )}
      </Box>

      {/* Pill-style tabs */}
      <Box sx={{ display: 'flex', gap: 0.5, p: 0.5, bgcolor: alpha(T.primary, 0.04), borderRadius: '12px', border: `1px solid ${T.border}`, mb: 1.5, width: 'fit-content' }}>
        {[
          { label: 'RFQ', icon: <DocIcon sx={{ fontSize: 15 }} /> },
          { label: 'PO to Vendor', icon: <ReceiptIcon sx={{ fontSize: 15 }} /> },
          { label: 'Purchased Material', icon: <ShippingIcon sx={{ fontSize: 15 }} /> },
        ].map((t, i) => (
          <Button
            key={t.label}
            size="small"
            startIcon={t.icon}
            onClick={() => setTab(i)}
            sx={{
              textTransform: 'none', fontWeight: 600, fontSize: '0.82rem', borderRadius: '10px',
              px: 2, py: 0.8, minWidth: 'auto',
              ...(tab === i
                ? { bgcolor: T.primary, color: '#fff', boxShadow: `0 2px 6px ${alpha(T.primary, 0.3)}`, '&:hover': { bgcolor: alpha(T.primary, 0.9) } }
                : { color: T.textMuted, '&:hover': { bgcolor: alpha(T.primary, 0.08), color: T.dark } }),
            }}
          >
            {t.label}
          </Button>
        ))}
      </Box>

      {tab === 0 && <RFQSection showToast={showToast} onStats={setSectionStats} onCreatePO={handleCreatePoFromRfq} />}
      {tab === 1 && <POSection showToast={showToast} onStats={setSectionStats} initialRfqId={pendingRfqId} onClearInitialRfqId={() => setPendingRfqId(null)} />}
      {tab === 2 && <PurchasedMaterialSection showToast={showToast} onStats={setSectionStats} />}

      {/* Errors stay until dismissed; success messages auto-hide. Without this
          the user could miss the real failure reason and assume the dialog
          is "still loading". */}
      <Snackbar
        open={toast.open}
        autoHideDuration={toast.severity === 'error' ? null : 5000}
        onClose={(_, reason) => {
          // Don't close on outside click for errors — force user to acknowledge.
          if (toast.severity === 'error' && reason === 'clickaway') return;
          setToast(p => ({ ...p, open: false }));
        }}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ zIndex: 99999 }}
      >
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast(p => ({ ...p, open: false }))} sx={{ minWidth: 320, maxWidth: 600, fontSize: 14, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', borderRadius: '12px' }}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 1 — RFQ
   ══════════════════════════════════════════════════════════════════════════ */
interface RFQ { id: string; rfq_number: string; date: string; need_materials_before: string | null; instructions: string | null; status: string; part_id: string; part_name: string; material_category: string; material_grade: string; density: number; form: string; shape: string; weight_per_piece: number; quantity: number; vendor: any; creator: any; dimensions?: any; purchaseOrders?: { id: string; po_number: string; status: string }[]; line_items?: { part_id: string; part_name: string; material_category: string; material_grade: string; density: number; form: string; shape: string; dimensions: any; weight_per_piece: number; quantity: number }[]; }
interface PartOption { id: string; part_name: string; material_category: string; material_grade: string; condition: string; density: number; form: string; shape: string; weight_per_piece: number; dimensions: any; }
interface VendorOption { id: string; vendor_name: string; contact_email: string; }

const rfqDimStr = (dims: any) => {
  if (!dims || typeof dims !== 'object') return '';
  const vals: string[] = [];
  if (dims.length) vals.push(`${dims.length}`);
  if (dims.width) vals.push(`${dims.width}`);
  if (dims.height) vals.push(`${dims.height}`);
  if (dims.thickness) vals.push(`${dims.thickness}`);
  if (dims.diameter) vals.push(`${dims.diameter}`);
  if (dims.outer_diameter) vals.push(`${dims.outer_diameter}`);
  if (dims.inner_diameter) vals.push(`${dims.inner_diameter}`);
  if (dims.across_flats) vals.push(`${dims.across_flats}`);
  if (dims.side) vals.push(`${dims.side}`);
  if (vals.length === 0) return '';
  return vals.join(' x ') + ' mm';
};

const RFQSection = ({ showToast, onStats, onCreatePO }: { showToast: (m: string, s?: 'success' | 'error') => void; onStats: (s: StatItem[]) => void; onCreatePO?: (rfqId: string) => void }) => {
  const [rfqs, setRfqs] = useState<RFQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const DEFAULT_RFQ_INSTRUCTIONS = 'Please provide your best quotation for the above items.\nNeed materials before: As soon as possible.\nFreight Not Included: Freight charges are not included.';
  const emptyLineItem = () => ({ part_id: '', quantity: '', selectedPart: null as PartOption | null });
  const [form, setForm] = useState({
    items: [emptyLineItem()],
    vendor_ids: [] as string[],
    date: new Date().toISOString().slice(0, 10),
    need_materials_before: '',
    instructions: DEFAULT_RFQ_INSTRUCTIONS,
  });
  const [sysSettings, setSysSettings] = useState<any>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [deleteTarget, setDeleteTarget] = useState<RFQ | null>(null);
  /* New feature states */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailRFQ, setDetailRFQ] = useState<RFQ | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<string>('Draft');
  const [editRfqNumber, setEditRfqNumber] = useState('');
  const [editForm, setEditForm] = useState<{ items: { part_id: string; quantity: string; selectedPart: PartOption | null }[]; date: string; need_materials_before: string; instructions: string; vendor_id: string }>({ items: [emptyLineItem()], date: '', need_materials_before: '', instructions: '', vendor_id: '' });
  const [sending, setSending] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const fetchRFQs = useCallback(async () => {
    try {
      const res = await api.get('/mgmt-procurement/rfqs');
      setRfqs(res.data?.data || []);
    } catch (err: any) {
      // Surface list-refresh failures so user isn't silently left with stale data.
      const msg = err?.response?.data?.message || err?.message || 'Failed to load RFQs';
      showToast(msg, 'error');
    }
    setLoading(false);
    // showToast intentionally omitted: it is stable (useCallback) at the parent
    // level, and re-binding fetchRFQs would re-trigger the mount-effect loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchParts = useCallback(async () => {
    try {
      const res = await api.get('/raw-materials');
      const raw = Array.isArray(res.data) ? res.data : res.data?.data || [];
      const list = raw.filter((m: any) => m.is_active !== false).map((m: any) => ({
        id: m.id,
        part_name: `${m.material_category} — ${m.material_grade}`,
        material_category: m.material_category,
        material_grade: m.material_grade,
        condition: m.condition || '',
        density: m.density,
        form: m.form,
        shape: m.shape,
        weight_per_piece: null,
        dimensions: m.dimensions,
      }));
      setParts(list);
    } catch { /* ignore */ }
  }, []);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await api.get('/vendors');
      const list = Array.isArray(res.data) ? res.data : res.data?.data || [];
      setVendors(list);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { 
    fetchRFQs(); fetchParts(); fetchVendors(); 
    api.get('/settings/system').then(res => {
      const s = res.data?.data || {};
      setSysSettings(s);
      if (s.rfqInstructions) {
        setForm(f => ({ ...f, instructions: s.rfqInstructions }));
      }
    }).catch(() => {});
  }, [fetchRFQs, fetchParts, fetchVendors]);

  /* ── Filtered + paginated data ── */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: rfqs.length };
    rfqs.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return counts;
  }, [rfqs]);

  useEffect(() => {
    onStats([
      { label: 'Total RFQs', count: rfqs.length, color: T.primary, icon: <DocIcon sx={{ fontSize: 20 }} /> },
      { label: 'Draft', count: statusCounts['Draft'] || 0, color: '#6B7280', icon: <EditIcon sx={{ fontSize: 20 }} /> },
      { label: 'Sent', count: statusCounts['Sent'] || 0, color: '#166354', icon: <SendIcon sx={{ fontSize: 20 }} /> },
    ]);
  }, [rfqs, statusCounts, onStats]);

  const filtered = useMemo(() => {
    let list = rfqs;
    if (statusFilter !== 'All') list = list.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.rfq_number?.toLowerCase().includes(q) ||
        r.part_name?.toLowerCase().includes(q) ||
        r.vendor?.vendor_name?.toLowerCase().includes(q) ||
        r.material_category?.toLowerCase().includes(q) ||
        (r.line_items || []).some(li => li.part_name?.toLowerCase().includes(q) || li.material_category?.toLowerCase().includes(q) || li.material_grade?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [rfqs, statusFilter, search]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => { setPage(0); }, [search, statusFilter, pageSize]);

  /* ── Selection helpers ── */
  const allPageSelected = paged.length > 0 && paged.every(r => selected.has(r.id));
  const somePageSelected = paged.some(r => selected.has(r.id));
  const toggleSelectAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allPageSelected) { paged.forEach(r => next.delete(r.id)); }
      else { paged.forEach(r => next.add(r.id)); }
      return next;
    });
  };
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /* ── Bulk delete categorization ── */
  const bulkCategories = useMemo(() => {
    const draftCount = rfqs.filter(r => selected.has(r.id) && r.status === 'Draft').length;
    const sentCount = rfqs.filter(r => selected.has(r.id) && r.status === 'Sent').length;
    const withPOsCount = rfqs.filter(r => selected.has(r.id) && r.purchaseOrders && r.purchaseOrders.length > 0).length;
    return { draftCount, sentCount, withPOsCount, total: selected.size };
  }, [rfqs, selected]);

  const resetForm = () => {
    setForm({ items: [emptyLineItem()], vendor_ids: [], date: new Date().toISOString().slice(0, 10), need_materials_before: '', instructions: sysSettings.rfqInstructions || DEFAULT_RFQ_INSTRUCTIONS });
  };

  /* ── Line item handlers ── */
  const handleItemPartChange = (idx: number, part: PartOption | null) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], part_id: part?.id || '', selectedPart: part };
      return { ...f, items };
    });
  };
  const handleItemQtyChange = (idx: number, qty: string) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], quantity: qty };
      return { ...f, items };
    });
  };
  const addLineItem = () => {
    setForm(f => ({ ...f, items: [...f.items, emptyLineItem()] }));
  };
  const removeLineItem = (idx: number) => {
    setForm(f => {
      const items = f.items.filter((_, i) => i !== idx);
      return { ...f, items: items.length === 0 ? [emptyLineItem()] : items };
    });
  };

  const itemsValid = form.items.length > 0 && form.items.every(it => it.part_id && it.quantity && Number(it.quantity) > 0);

  const handleCreate = async () => {
    setCreateError(null);
    // Pre-validation with user feedback
    if (!itemsValid) {
      const msg = 'Please add at least one part with a valid quantity';
      setCreateError(msg);
      showToast(msg, 'error');
      return;
    }
    if (form.vendor_ids.length === 0) {
      const msg = 'Please select at least one vendor';
      setCreateError(msg);
      showToast(msg, 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        items: form.items
          .filter(it => it.part_id && it.quantity) // Filter out empty items
          .map(it => ({ part_id: it.part_id, quantity: Number(it.quantity) })),
        vendor_ids: form.vendor_ids,
        date: form.date || new Date().toISOString().slice(0, 10),
        need_materials_before: form.need_materials_before || null,
        instructions: form.instructions || '',
      };

      // Validate payload before sending
      if (payload.items.length === 0) {
        const msg = 'No valid items to save. Please add at least one part.';
        setCreateError(msg);
        showToast(msg, 'error');
        setSaving(false);
        return;
      }

      // eslint-disable-next-line no-console
      console.log('[RFQ Save] POST /mgmt-procurement/rfqs', payload);
      const response = await api.post('/mgmt-procurement/rfqs', payload);
      // eslint-disable-next-line no-console
      console.log('[RFQ Save] success', response.status, response.data);

      // Backend returns { success, data: RFQ[], message }. Prepend new RFQs so the
      // list updates immediately, before the authoritative re-fetch completes.
      const created: RFQ[] = Array.isArray(response.data?.data) ? response.data.data : [];
      if (created.length > 0) {
        setRfqs(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const fresh = created.filter(r => r && r.id && !existingIds.has(r.id));
          return [...fresh, ...prev];
        });
      }

      const successMsg = response.data?.message
        || `${created.length || form.vendor_ids.length} RFQ(s) created successfully as Draft`;
      showToast(successMsg, 'success');
      resetForm();
      setOpen(false);
      // Authoritative refresh (includes associations like vendor / purchaseOrders)
      fetchRFQs();
    } catch (err: any) {
      // Logged so the real failure shows up in DevTools → Console even when
      // the toast text alone is not enough to diagnose (CORS, 401, 500, etc).
      // eslint-disable-next-line no-console
      console.error('[RFQ Save] failed', {
        code: err?.code,
        status: err?.response?.status,
        data: err?.response?.data,
        message: err?.message,
        url: err?.config?.url,
        baseURL: err?.config?.baseURL,
      });

      // Distinguish timeout / network / server errors so the user sees a real reason.
      let errorMessage = 'Failed to create RFQ. Please try again.';
      if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) {
        errorMessage = 'Request timed out. The server took too long to respond — please retry.';
      } else if (err?.message === 'Network Error' || err?.code === 'ERR_NETWORK') {
        errorMessage = 'Network error: cannot reach the server. Check your connection or contact admin (likely CORS / API URL).';
      } else if (err?.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err?.response?.status) {
        errorMessage = `Server error (${err.response.status}). Please try again.`;
      } else if (err?.message) {
        errorMessage = err.message;
      }
      // Persistent inline alert inside the dialog so the user can never miss it,
      // plus the (now non-auto-hiding) toast at the top.
      setCreateError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (id: string) => {
    setSending(prev => new Set(prev).add(id));
    try {
      await api.post(`/mgmt-procurement/rfqs/${id}/email`);
      showToast('RFQ sent to vendor via email');
      fetchRFQs();
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || '';
      // Fallback to mailto if email service is not configured
      if (errMsg.toLowerCase().includes('not configured') || errMsg.toLowerCase().includes('email service')) {
        try {
          // Mark RFQ as sent
          await api.patch(`/mgmt-procurement/rfqs/${id}/send`);
          // Download PDF
          const rfq = rfqs.find(r => r.id === id);
          const rfqNumber = rfq?.rfq_number || `RFQ-${id}`;
          const res = await api.get(`/mgmt-procurement/rfqs/${id}/pdf`, { responseType: 'blob' });
          const url = window.URL.createObjectURL(new Blob([res.data]));
          const a = document.createElement('a'); a.href = url; a.download = `${rfqNumber}.pdf`; a.click();
          window.URL.revokeObjectURL(url);
          // Build mailto link
          const vendorEmail = rfq?.vendor?.contact_email || rfq?.vendor?.email || '';
          const subject = encodeURIComponent(`Request for Quotation: ${rfqNumber}`);
          const body = encodeURIComponent(
            `Dear ${rfq?.vendor?.contact_person || rfq?.vendor?.vendor_name || 'Vendor'},\n\n` +
            `Please find attached the Request for Quotation (${rfqNumber}).\n\n` +
            `Kindly review and provide your best quotation at the earliest.\n\nBest regards`
          );
          if (vendorEmail) window.open(`mailto:${vendorEmail}?subject=${subject}&body=${body}`, '_blank');
          showToast('RFQ downloaded. Please attach it to the email.', 'success');
          fetchRFQs();
        } catch {
          showToast('Failed to download RFQ PDF', 'error');
        }
      } else {
        showToast(errMsg || 'Failed to send RFQ', 'error');
      }
    } finally {
      setSending(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleDownload = async (id: string, rfqNumber: string) => {
    try {
      const res = await api.get(`/mgmt-procurement/rfqs/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `${rfqNumber}.pdf`; a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      showToast('Failed to download PDF', 'error');
    }
  };

  const handleDelete = async (forceDelete = false) => {
    if (!deleteTarget) return;
    try {
      const url = forceDelete
        ? `/mgmt-procurement/rfqs/${deleteTarget.id}?force=true`
        : `/mgmt-procurement/rfqs/${deleteTarget.id}`;
      const res = await api.delete(url);
      const deletedPOs = res.data?.data?.deletedPOs || 0;
      showToast(deletedPOs > 0 ? `RFQ deleted along with ${deletedPOs} linked PO(s)` : 'RFQ deleted');
      setDeleteTarget(null);
      setSelected(prev => { const next = new Set(prev); next.delete(deleteTarget.id); return next; });
      fetchRFQs();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to delete', 'error');
    }
  };

  const handleCopy = async (id: string) => {
    try {
      await api.post(`/mgmt-procurement/rfqs/${id}/copy`);
      showToast('RFQ duplicated as Draft');
      fetchRFQs();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to copy RFQ', 'error');
    }
  };

  const handleBulkDelete = async (forceDelete = false) => {
    try {
      await api.post('/mgmt-procurement/rfqs/bulk-delete', { ids: Array.from(selected), force: forceDelete });
      showToast(forceDelete ? `${selected.size} RFQ(s) and linked PO(s) deleted` : `${selected.size} RFQ(s) deleted`);
      setSelected(new Set());
      setBulkDeleteOpen(false);
      fetchRFQs();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to delete selected RFQs', 'error');
    }
  };

  const openEdit = (r: RFQ) => {
    setEditId(r.id);
    setEditStatus(r.status);
    setEditRfqNumber(r.rfq_number);

    // Build items from line_items or legacy single part
    let items: { part_id: string; quantity: string; selectedPart: PartOption | null }[];
    const li = r.line_items;
    if (li && li.length > 0) {
      items = li.map(l => {
        const matched = parts.find(p => p.id === l.part_id);
        const selectedPart: PartOption = matched || {
          id: l.part_id, part_name: l.part_name,
          material_category: l.material_category, material_grade: l.material_grade,
          condition: (l as any).condition || '',
          density: l.density, form: l.form, shape: l.shape,
          weight_per_piece: l.weight_per_piece, dimensions: l.dimensions,
        };
        return { part_id: l.part_id, quantity: String(l.quantity), selectedPart };
      });
    } else if (r.part_id) {
      const matched = parts.find(p => p.id === r.part_id);
      const selectedPart: PartOption = matched || {
        id: r.part_id, part_name: r.part_name,
        material_category: r.material_category, material_grade: r.material_grade,
        condition: (r as any).condition || '',
        density: r.density, form: r.form, shape: r.shape,
        weight_per_piece: r.weight_per_piece, dimensions: r.dimensions,
      };
      items = [{ part_id: r.part_id, quantity: String(r.quantity), selectedPart }];
    } else {
      items = [emptyLineItem()];
    }

    setEditForm({
      items,
      date: r.date?.slice(0, 10) || '',
      need_materials_before: r.need_materials_before?.slice(0, 10) || '',
      instructions: r.instructions || '',
      vendor_id: r.vendor?.id || '',
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      const payload = {
        items: editForm.items.map(it => ({ part_id: it.part_id, quantity: Number(it.quantity) })),
        vendor_id: editForm.vendor_id,
        date: editForm.date,
        need_materials_before: editForm.need_materials_before,
        instructions: editForm.instructions,
      };
      await api.put(`/mgmt-procurement/rfqs/${editId}`, payload);
      showToast('RFQ updated successfully');
      setEditOpen(false);
      setEditId(null);
      fetchRFQs();
    } catch (err: any) {
      console.error('Update RFQ failed:', err.response?.data || err.message || err);
      showToast(err.response?.data?.message || 'Failed to update RFQ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditAndResend = async () => {
    if (!editId) return;
    setSaving(true);
    try {
      const payload = {
        items: editForm.items.map(it => ({ part_id: it.part_id, quantity: Number(it.quantity) })),
        vendor_id: editForm.vendor_id,
        date: editForm.date,
        need_materials_before: editForm.need_materials_before,
        instructions: editForm.instructions,
      };
      await api.put(`/mgmt-procurement/rfqs/${editId}`, payload);
      await api.post(`/mgmt-procurement/rfqs/${editId}/email`);
      showToast('RFQ updated & revised version sent to vendor');
      setEditOpen(false);
      setEditId(null);
      fetchRFQs();
    } catch (err: any) {
      console.error('Update & resend RFQ failed:', err.response?.data || err.message || err);
      showToast(err.response?.data?.message || 'Failed to update & re-send RFQ', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── Edit line item handlers ── */
  const handleEditItemPartChange = (idx: number, part: PartOption | null) => {
    setEditForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], part_id: part?.id || '', selectedPart: part };
      return { ...f, items };
    });
  };
  const handleEditItemQtyChange = (idx: number, qty: string) => {
    setEditForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], quantity: qty };
      return { ...f, items };
    });
  };
  const addEditLineItem = () => {
    setEditForm(f => ({ ...f, items: [...f.items, emptyLineItem()] }));
  };
  const removeEditLineItem = (idx: number) => {
    setEditForm(f => {
      const items = f.items.filter((_, i) => i !== idx);
      return { ...f, items: items.length === 0 ? [emptyLineItem()] : items };
    });
  };

  const editItemsValid = editForm.items.length > 0 && editForm.items.every(it => it.part_id && it.quantity && Number(it.quantity) > 0);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(0);
  };

  if (loading) return (
    <Box>
      <Skeleton variant="rounded" height={300} sx={{ borderRadius: '10px' }} />
    </Box>
  );

  return (
    <Box>
      {/* Search + Filters + Actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <FilterBar search={search} onSearch={setSearch} statusFilter={statusFilter}
            onStatusFilter={setStatusFilter} statusCounts={statusCounts} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {selected.size > 0 && (
            <Button variant="outlined" size="small" color="error" startIcon={<BulkDeleteIcon />}
              onClick={() => setBulkDeleteOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12, borderRadius: '10px', borderColor: '#EF4444', color: '#EF4444', '&:hover': { bgcolor: alpha('#EF4444', 0.06), borderColor: '#DC2626' } }}>
              Delete {selected.size} selected
            </Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { resetForm(); setOpen(true); }}
            sx={{ bgcolor: T.primary, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '10px', px: 2.5, boxShadow: `0 2px 8px ${alpha(T.primary, 0.25)}`, '&:hover': { bgcolor: alpha(T.primary, 0.9) } }}>
            Create New RFQ
          </Button>
        </Box>
      </Box>

      {/* RFQ Table */}
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '14px', border: `1px solid ${T.border}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#FAFBFD' }}>
              <TableCell padding="checkbox" sx={{ py: 1.4, borderBottom: `1.5px solid ${T.border}` }}>
                <Checkbox size="small" checked={allPageSelected} indeterminate={somePageSelected && !allPageSelected}
                  onChange={toggleSelectAll} sx={{ '& .MuiSvgIcon-root': { fontSize: 18 } }} />
              </TableCell>
              {['S.No', 'RFQ No', 'Description', 'Quantity', 'Vendor', 'Status', 'Action'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 9.5, color: T.textMuted, py: 1.4, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1.5px solid ${T.border}` }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.length === 0 ? (
              <EmptyState colSpan={8}
                icon={<DocIcon sx={{ fontSize: 24, color: T.primary }} />}
                title={search || statusFilter !== 'All' ? 'No matching RFQs' : 'No RFQs yet'}
                subtitle={search || statusFilter !== 'All' ? 'Try adjusting your search or filter' : 'Create your first RFQ to get started'} />
            ) : paged.map((r, idx) => (
              <TableRow key={r.id} hover sx={{
                bgcolor: selected.has(r.id) ? alpha(T.primary, 0.04) : idx % 2 === 0 ? T.white : T.zebraRow,
                borderLeft: '3px solid transparent',
                '&:hover': { bgcolor: T.hoverRow, borderLeftColor: T.primary },
                transition: 'all 0.15s',
                cursor: 'pointer',
              }} onClick={() => setDetailRFQ(r)}>
                <TableCell padding="checkbox" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <Checkbox size="small" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)}
                    sx={{ '& .MuiSvgIcon-root': { fontSize: 18 } }} />
                </TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 500, color: T.textSec }}>{page * pageSize + idx + 1}</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 12, color: T.primary, whiteSpace: 'nowrap' }}>{r.rfq_number}</TableCell>
                <TableCell sx={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(() => {
                    const src = r.line_items && r.line_items.length > 0 ? r.line_items[0] : r;
                    return [src.material_category, src.material_grade, (src as any).condition, src.form, rfqDimStr(src.dimensions)].filter(Boolean).join(' | ') || '---';
                  })()}
                </TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>
                  {r.line_items && r.line_items.length > 1
                    ? r.line_items.map(li => li.quantity).join(', ')
                    : r.quantity}
                </TableCell>
                <TableCell sx={{ fontSize: 12 }}>{r.vendor?.vendor_name || '---'}</TableCell>
                <TableCell>
                  <Chip label={r.status} size="small" sx={{
                    fontWeight: 600, fontSize: 10, px: 0.8, height: 22, borderRadius: '999px',
                    bgcolor: alpha(statusColor[r.status] || '#6B7280', 0.1),
                    color: statusColor[r.status] || '#6B7280',
                    border: `1px solid ${alpha(statusColor[r.status] || '#6B7280', 0.2)}`,
                  }} />
                </TableCell>
                <TableCell onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <Box sx={{ display: 'flex', gap: 0.3 }}>
                    <Tooltip title="View Details" arrow>
                      <IconButton size="small" onClick={() => setDetailRFQ(r)}
                        sx={{ '&:hover': { bgcolor: alpha(T.primary, 0.08) } }}>
                        <ViewIcon sx={{ fontSize: 17 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit RFQ" arrow>
                      <IconButton size="small" onClick={() => openEdit(r)}
                        sx={{ '&:hover': { bgcolor: alpha('#D97706', 0.08) } }}>
                        <EditIcon sx={{ fontSize: 17, color: '#D97706' }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Duplicate RFQ" arrow>
                      <IconButton size="small" onClick={() => handleCopy(r.id)}
                        sx={{ '&:hover': { bgcolor: alpha('#2A9D7E', 0.08) } }}>
                        <CopyIcon sx={{ fontSize: 17, color: '#2A9D7E' }} />
                      </IconButton>
                    </Tooltip>
                    {r.status === 'Draft' && (
                      <Tooltip title="Send to Vendor" arrow>
                        <IconButton size="small" color="primary"
                          onClick={() => handleSend(r.id)} disabled={sending.has(r.id)}
                          sx={{ '&:hover': { bgcolor: alpha('#166354', 0.08) } }}>
                          {sending.has(r.id) ? <CircularProgress size={16} /> : <SendIcon sx={{ fontSize: 17 }} />}
                        </IconButton>
                      </Tooltip>
                    )}
                    {r.status === 'Sent' && (
                      <Tooltip title="Re-send to Vendor (Revised)" arrow>
                        <IconButton size="small"
                          onClick={() => handleSend(r.id)} disabled={sending.has(r.id)}
                          sx={{ '&:hover': { bgcolor: alpha('#059669', 0.08) } }}>
                          {sending.has(r.id) ? <CircularProgress size={16} /> : <ResendIcon sx={{ fontSize: 17, color: '#059669' }} />}
                        </IconButton>
                      </Tooltip>
                    )}
                    {r.status === 'Sent' && (!r.purchaseOrders || r.purchaseOrders.length === 0) && onCreatePO && (
                      <Tooltip title="Create Purchase Order" arrow>
                        <IconButton size="small" onClick={() => onCreatePO(r.id)}
                          sx={{ color: T.primary, '&:hover': { bgcolor: alpha(T.primary, 0.08) } }}>
                          <ReceiptIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Download PDF" arrow>
                      <IconButton size="small" onClick={() => handleDownload(r.id, r.rfq_number)}
                        sx={{ '&:hover': { bgcolor: alpha(T.primary, 0.08) } }}>
                        <DownloadIcon sx={{ fontSize: 17 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete" arrow>
                      <IconButton size="small" color="error" onClick={() => setDeleteTarget(r)}
                        sx={{ '&:hover': { bgcolor: alpha('#EF4444', 0.08) } }}>
                        <DeleteIcon sx={{ fontSize: 17 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination with page size selector */}
      <PaginationBar page={page} totalPages={totalPages} totalItems={filtered.length}
        pageSize={pageSize} onPageChange={setPage} onPageSizeChange={handlePageSizeChange} />

      {/* ── Delete Confirmation (context-aware) ── */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, fontSize: 16, borderBottom: `1px solid ${T.border}`, letterSpacing: '-0.01em' }}>
          <Box sx={{ width: 38, height: 38, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${alpha('#EF4444', 0.12)}, ${alpha('#EF4444', 0.06)})`, border: `1px solid ${alpha('#EF4444', 0.15)}` }}>
            <WarningIcon sx={{ fontSize: 20, color: '#EF4444' }} />
          </Box>
          Confirm Delete
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <Typography fontSize={13} color={T.textSec} lineHeight={1.6}>
            Are you sure you want to delete <strong>{deleteTarget?.rfq_number}</strong>?
            {deleteTarget?.status === 'Sent' && (
              <Box component="span" sx={{ display: 'block', mt: 1, color: '#D97706', fontWeight: 600 }}>
                ⚠️ This RFQ has already been sent to the vendor. Deleting it will NOT recall the email.
              </Box>
            )}
            {deleteTarget?.purchaseOrders && deleteTarget.purchaseOrders.length > 0 && (
              <Box component="span" sx={{ display: 'block', mt: 1, p: 1.5, borderRadius: '8px', bgcolor: alpha('#EF4444', 0.06), border: `1px solid ${alpha('#EF4444', 0.15)}` }}>
                <Typography fontSize={12} fontWeight={600} color="#EF4444" mb={0.5}>
                  ⚠️ This RFQ has {deleteTarget.purchaseOrders.length} linked Purchase Order(s):
                </Typography>
                {deleteTarget.purchaseOrders.map((po: any) => (
                  <Chip key={po.id} label={`${po.po_number} (${po.status})`} size="small"
                    sx={{ mr: 0.5, mb: 0.5, fontSize: 10, fontWeight: 600, bgcolor: alpha('#EF4444', 0.1), color: '#EF4444' }} />
                ))}
                <Typography fontSize={11} color={T.textSec} mt={0.5}>
                  Use "Force Delete" to remove this RFQ and all linked POs.
                </Typography>
              </Box>
            )}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${T.border}`, px: 3, py: 1.5 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ textTransform: 'none', fontSize: 13, borderRadius: '8px', color: T.textSec }}>Cancel</Button>
          {deleteTarget?.purchaseOrders && deleteTarget.purchaseOrders.length > 0 ? (
            <Button variant="contained" onClick={() => handleDelete(true)}
              sx={{ bgcolor: '#EF4444', textTransform: 'none', fontWeight: 600, fontSize: 12, borderRadius: '8px', boxShadow: `0 2px 8px ${alpha('#EF4444', 0.3)}`, '&:hover': { bgcolor: '#DC2626' } }}>
              Force Delete (with {deleteTarget.purchaseOrders.length} PO{deleteTarget.purchaseOrders.length > 1 ? 's' : ''})
            </Button>
          ) : (
            <Button variant="contained" onClick={() => handleDelete()}
              sx={{ bgcolor: '#EF4444', textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '8px', boxShadow: `0 2px 8px ${alpha('#EF4444', 0.3)}`, '&:hover': { bgcolor: '#DC2626' } }}>
              Delete
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Bulk Delete Confirmation (categorized) ── */}
      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, fontSize: 16, borderBottom: `1px solid ${T.border}`, letterSpacing: '-0.01em' }}>
          <Box sx={{ width: 38, height: 38, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${alpha('#EF4444', 0.12)}, ${alpha('#EF4444', 0.06)})`, border: `1px solid ${alpha('#EF4444', 0.15)}` }}>
            <BulkDeleteIcon sx={{ fontSize: 20, color: '#EF4444' }} />
          </Box>
          Bulk Delete — {bulkCategories.total} RFQ(s)
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <Typography fontSize={13} color={T.textSec} mb={1.5}>
            You are about to delete <strong>{bulkCategories.total}</strong> RFQ(s). This cannot be undone.
          </Typography>
          {bulkCategories.draftCount > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.8 }}>
              <Chip label="Draft" size="small" sx={{ fontSize: 10, fontWeight: 600, bgcolor: alpha('#6B7280', 0.1), color: '#6B7280' }} />
              <Typography fontSize={12}>{bulkCategories.draftCount} RFQ(s)</Typography>
            </Box>
          )}
          {bulkCategories.sentCount > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.8 }}>
              <Chip label="Sent" size="small" sx={{ fontSize: 10, fontWeight: 600, bgcolor: alpha('#166354', 0.1), color: '#166354' }} />
              <Typography fontSize={12}>{bulkCategories.sentCount} RFQ(s)</Typography>
            </Box>
          )}
          {bulkCategories.sentCount > 0 && (
            <Typography fontSize={12} color="#D97706" fontWeight={600} mt={1}>
              ⚠️ {bulkCategories.sentCount} sent RFQ(s) — deleting will NOT recall emails already sent to vendors.
            </Typography>
          )}
          {bulkCategories.withPOsCount > 0 && (
            <Box sx={{ mt: 1.5, p: 1.5, borderRadius: '8px', bgcolor: alpha('#EF4444', 0.06), border: `1px solid ${alpha('#EF4444', 0.15)}` }}>
              <Typography fontSize={12} fontWeight={600} color="#EF4444">
                ⚠️ {bulkCategories.withPOsCount} RFQ(s) have linked Purchase Orders.
              </Typography>
              <Typography fontSize={11} color={T.textSec} mt={0.5}>
                Use &quot;Force Delete All&quot; to remove these RFQs along with their linked POs.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${T.border}`, px: 3, py: 1.5 }}>
          <Button onClick={() => setBulkDeleteOpen(false)} sx={{ textTransform: 'none', fontSize: 13, borderRadius: '8px', color: T.textSec }}>Cancel</Button>
          {bulkCategories.withPOsCount > 0 ? (
            <Button variant="contained" onClick={() => handleBulkDelete(true)}
              sx={{ bgcolor: '#EF4444', textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '8px', boxShadow: `0 2px 8px ${alpha('#EF4444', 0.3)}`, '&:hover': { bgcolor: '#DC2626' } }}>
              Force Delete All {bulkCategories.total} (with POs)
            </Button>
          ) : (
            <Button variant="contained" onClick={() => handleBulkDelete()}
              sx={{ bgcolor: '#EF4444', textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '8px', boxShadow: `0 2px 8px ${alpha('#EF4444', 0.3)}`, '&:hover': { bgcolor: '#DC2626' } }}>
              Delete All {bulkCategories.total}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Detail View Modal ── */}
      <Dialog open={!!detailRFQ} onClose={() => setDetailRFQ(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '14px' } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 16, borderBottom: `1px solid ${T.border}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ width: 38, height: 38, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${alpha(T.primary, 0.12)}, ${alpha(T.primary, 0.06)})`, border: `1px solid ${alpha(T.primary, 0.15)}` }}>
              <DocIcon sx={{ fontSize: 20, color: T.primary }} />
            </Box>
            {detailRFQ?.rfq_number}
          </Box>
          <IconButton size="small" onClick={() => setDetailRFQ(null)}><CloseIcon fontSize="small" /></IconButton>
        </DialogTitle>
        {detailRFQ && (
          <DialogContent sx={{ pt: '16px !important' }}>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Chip label={detailRFQ.status} size="small" sx={{ fontWeight: 600, fontSize: 11, bgcolor: alpha(statusColor[detailRFQ.status] || '#6B7280', 0.1), color: statusColor[detailRFQ.status] || '#6B7280' }} />
              <Typography fontSize={12} color={T.textSec} sx={{ ml: 'auto' }}>Created by: {detailRFQ.creator?.name || detailRFQ.creator?.email || '---'}</Typography>
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Typography fontWeight={700} fontSize={13} color={T.dark} mb={1}>Dates</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}>
              <Box><Typography fontSize={11} color={T.textSec}>RFQ Date</Typography><Typography fontSize={13} fontWeight={600}>{fmtDate(detailRFQ.date)}</Typography></Box>
              <Box><Typography fontSize={11} color={T.textSec}>Need Material Before</Typography><Typography fontSize={13} fontWeight={600}>{fmtDate(detailRFQ.need_materials_before)}</Typography></Box>
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Typography fontWeight={700} fontSize={13} color={T.dark} mb={1}>
              {detailRFQ.line_items && detailRFQ.line_items.length > 1 ? `Line Items (${detailRFQ.line_items.length} parts)` : 'Part Details (Snapshot)'}
            </Typography>
            {detailRFQ.line_items && detailRFQ.line_items.length > 0 ? (
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '10px', border: `1px solid ${alpha(T.primary, 0.12)}`, mb: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: alpha(T.primary, 0.06) }}>
                      {['S.No', 'Part Name', 'Category / Grade', 'Qty'].map(h => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: 10, color: T.primary, py: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detailRFQ.line_items.map((li, idx) => (
                      <TableRow key={idx} sx={{ bgcolor: idx % 2 === 0 ? T.white : '#FAFBFD' }}>
                        <TableCell sx={{ fontSize: 12, color: T.textSec }}>{idx + 1}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{li.part_name || '---'}</TableCell>
                        <TableCell sx={{ fontSize: 12, color: T.textSec }}>{[li.material_category, li.material_grade].filter(Boolean).join(' / ') || '---'}</TableCell>
                        <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{li.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '12px', background: `linear-gradient(135deg, ${alpha(T.primary, 0.04)}, ${alpha(T.primary, 0.08)})`, borderColor: alpha(T.primary, 0.12), mb: 2 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                  {[
                    ['Part Name', detailRFQ.part_name],
                    ['Category', detailRFQ.material_category],
                    ['Grade', detailRFQ.material_grade],
                    ['Density', detailRFQ.density],
                    ['Form', detailRFQ.form],
                    ['Shape', detailRFQ.shape],
                    ['Weight/Pc', detailRFQ.weight_per_piece],
                    ['Quantity', detailRFQ.quantity],
                  ].map(([k, v]) => (
                    <Typography key={String(k)} fontSize={12} color={T.textSec}><strong>{k}:</strong> {v || '---'}</Typography>
                  ))}
                </Box>
              </Paper>
            )}
            <Divider sx={{ mb: 2 }} />
            <Typography fontWeight={700} fontSize={13} color={T.dark} mb={1}>Vendor</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, mb: 2 }}>
              <Typography fontSize={12} color={T.textSec}><strong>Name:</strong> {detailRFQ.vendor?.vendor_name || '---'}</Typography>
              <Typography fontSize={12} color={T.textSec}><strong>Email:</strong> {detailRFQ.vendor?.contact_email || '---'}</Typography>
            </Box>
            {detailRFQ.instructions && (
              <>
                <Divider sx={{ mb: 2 }} />
                <Typography fontWeight={700} fontSize={13} color={T.dark} mb={0.5}>Instructions</Typography>
                <Typography fontSize={12} color={T.textSec} whiteSpace="pre-wrap">{detailRFQ.instructions}</Typography>
              </>
            )}
          </DialogContent>
        )}
        <DialogActions sx={{ borderTop: `1px solid ${T.border}`, px: 3, py: 1.5, justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Button size="small" startIcon={<EditIcon sx={{ fontSize: 15 }} />}
              onClick={() => { if (detailRFQ) { openEdit(detailRFQ); setDetailRFQ(null); } }}
              sx={{ textTransform: 'none', fontSize: 12 }}>Edit</Button>
            {detailRFQ?.status === 'Sent' && (
              <Button size="small" startIcon={<ResendIcon sx={{ fontSize: 15 }} />}
                onClick={() => { if (detailRFQ) { handleSend(detailRFQ.id); setDetailRFQ(null); } }}
                sx={{ textTransform: 'none', fontSize: 12, color: '#059669' }}>Re-send</Button>
            )}
            <Button size="small" startIcon={<CopyIcon sx={{ fontSize: 15 }} />}
              onClick={() => { if (detailRFQ) { handleCopy(detailRFQ.id); setDetailRFQ(null); } }}
              sx={{ textTransform: 'none', fontSize: 12 }}>Duplicate</Button>
            <Button size="small" startIcon={<DownloadIcon sx={{ fontSize: 15 }} />}
              onClick={() => { if (detailRFQ) handleDownload(detailRFQ.id, detailRFQ.rfq_number); }}
              sx={{ textTransform: 'none', fontSize: 12 }}>PDF</Button>
          </Box>
          <Button onClick={() => setDetailRFQ(null)} sx={{ textTransform: 'none', fontSize: 13 }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit RFQ Dialog ── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)', maxHeight: '90vh' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, fontSize: 16, borderBottom: `1px solid ${T.border}`, letterSpacing: '-0.01em' }}>
          <Box sx={{ width: 38, height: 38, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${alpha('#D97706', 0.12)}, ${alpha('#D97706', 0.06)})`, border: `1px solid ${alpha('#D97706', 0.15)}` }}>
            <EditIcon sx={{ fontSize: 20, color: '#D97706' }} />
          </Box>
          {editStatus === 'Sent' ? 'Edit RFQ (Sent)' : 'Edit RFQ'}
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="RFQ Number" value={editRfqNumber} disabled size="small"
            InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} InputLabelProps={{ sx: { fontSize: 13 } }} />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Date" type="date" value={editForm.date}
              onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
              size="small" fullWidth InputLabelProps={{ shrink: true, sx: { fontSize: 13 } }}
              InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} />
            <TextField label="Need Material Before" type="date" value={editForm.need_materials_before}
              onChange={e => setEditForm(f => ({ ...f, need_materials_before: e.target.value }))}
              size="small" fullWidth InputLabelProps={{ shrink: true, sx: { fontSize: 13 } }}
              InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} />
          </Box>

          <Divider />

          {/* ── Line Items Table ── */}
          <Typography fontWeight={700} fontSize={13} color={T.dark}>Line Items</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '10px', border: `1px solid ${T.border}`, overflow: 'visible', maxHeight: 'none' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#FAFBFD' }}>
                  {['S.No', 'Select Part (from Raw Material Master)', 'Quantity', ''].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 10, color: T.textMuted, py: 1, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1.5px solid ${T.border}`, ...(h === '' ? { width: 40 } : {}), ...(h === 'S.No' ? { width: 50 } : {}), ...(h === 'Quantity' ? { width: 100 } : {}) }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {editForm.items.map((item, idx) => (
                  <TableRow key={idx} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell sx={{ fontSize: 13, fontWeight: 600, color: T.textSec, textAlign: 'center' }}>{idx + 1}</TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      <Autocomplete
                        options={parts}
                        getOptionLabel={(o) => [o.material_category || '', o.material_grade || '', o.condition || '', o.form || '', rfqDimStr(o.dimensions)].join(' | ')}
                        value={item.selectedPart}
                        onChange={(_, part) => handleEditItemPartChange(idx, part)}
                        isOptionEqualToValue={(opt, val) => opt.id === val.id}
                        renderInput={(params) => <TextField {...params} placeholder="Select part..." size="small" InputLabelProps={{ sx: { fontSize: 12 } }} />}
                        sx={{ '& .MuiInputBase-root': { fontSize: 12, borderRadius: '8px' } }}
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      <TextField
                        type="number" value={item.quantity}
                        onChange={e => handleEditItemQtyChange(idx, e.target.value)}
                        size="small" fullWidth
                        inputProps={{ min: 1 }}
                        InputProps={{ sx: { fontSize: 12, borderRadius: '8px' } }}
                        placeholder="Qty"
                      />
                    </TableCell>
                    <TableCell sx={{ py: 0.8, textAlign: 'center' }}>
                      <IconButton size="small" onClick={() => removeEditLineItem(idx)}
                        disabled={editForm.items.length === 1}
                        sx={{ color: T.red, '&:hover': { bgcolor: alpha(T.red, 0.08) } }}>
                        <DeleteIcon sx={{ fontSize: 17 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Button startIcon={<AddIcon />} onClick={addEditLineItem} size="small"
            sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 600, fontSize: 12, color: T.primary, borderRadius: '8px', '&:hover': { bgcolor: alpha(T.primary, 0.06) } }}>
            Add New Part
          </Button>

          <Divider />

          <Autocomplete
            options={vendors}
            getOptionLabel={(o: VendorOption) => o.vendor_name}
            value={vendors.find(v => v.id === editForm.vendor_id) || null}
            onChange={(_, val) => setEditForm(f => ({ ...f, vendor_id: val?.id || '' }))}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => <TextField {...params} label="Select Vendor" size="small" InputLabelProps={{ sx: { fontSize: 13 } }} />}
            sx={{ '& .MuiInputBase-root': { fontSize: 13, borderRadius: '10px' } }}
          />

          <Divider />

          <TextField label="Instructions" multiline rows={3} value={editForm.instructions}
            onChange={e => setEditForm(f => ({ ...f, instructions: e.target.value }))}
            size="small" InputLabelProps={{ sx: { fontSize: 13 } }}
            InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} placeholder="Shown in RFQ PDF" />
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${T.border}`, px: 3, py: 1.5 }}>
          <Button onClick={() => setEditOpen(false)} disabled={saving} sx={{ textTransform: 'none', fontSize: 13, borderRadius: '8px' }}>Cancel</Button>
          <Button variant="contained" onClick={handleEditSave}
            disabled={saving || !editItemsValid || !editForm.vendor_id}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ bgcolor: T.primary, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '10px', px: 3, boxShadow: `0 2px 8px ${alpha(T.primary, 0.25)}`, '&:hover': { bgcolor: alpha(T.primary, 0.9) } }}>
            {saving ? 'Updating...' : 'Update RFQ'}
          </Button>
          {editStatus === 'Sent' && (
            <Button variant="contained" onClick={handleEditAndResend}
              disabled={saving || !editItemsValid || !editForm.vendor_id}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <ResendIcon sx={{ fontSize: 16 }} />}
              sx={{ bgcolor: '#059669', textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '10px', px: 2.5, '&:hover': { bgcolor: '#047857' } }}>
              {saving ? 'Sending...' : 'Update & Re-send'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Create RFQ Dialog ── */}
      <Dialog open={open} onClose={() => { setOpen(false); setCreateError(null); }} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)', maxHeight: '90vh' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, fontSize: 16, borderBottom: `1px solid ${T.border}`, letterSpacing: '-0.01em' }}>
          <Box sx={{
            width: 38, height: 38, borderRadius: '12px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${alpha(T.primary, 0.12)}, ${alpha(T.primary, 0.06)})`,
            border: `1px solid ${alpha(T.primary, 0.15)}`,
          }}>
            <AddIcon sx={{ fontSize: 20, color: T.primary }} />
          </Box>
          Create New RFQ
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {createError && (
            <Alert severity="error" onClose={() => setCreateError(null)} sx={{ borderRadius: '10px', fontSize: 13, fontWeight: 500, '& .MuiAlert-message': { wordBreak: 'break-word' } }}>
              <strong>Save failed:</strong> {createError}
            </Alert>
          )}
          <TextField label="RFQ Number" value="Auto-generated (RFQ-P-#####)" disabled size="small" InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} InputLabelProps={{ sx: { fontSize: 13 } }} />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} size="small" fullWidth InputLabelProps={{ shrink: true, sx: { fontSize: 13 } }} InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} />
            <TextField label="Need Material Before" type="date" value={form.need_materials_before} onChange={e => setForm(f => ({ ...f, need_materials_before: e.target.value }))} size="small" fullWidth InputLabelProps={{ shrink: true, sx: { fontSize: 13 } }} InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} />
          </Box>

          <Divider />

          {/* ── Line Items Table ── */}
          <Typography fontWeight={700} fontSize={13} color={T.dark}>Line Items</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '10px', border: `1px solid ${T.border}`, overflow: 'visible', maxHeight: 'none' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#FAFBFD' }}>
                  {['S.No', 'Select Part (from Raw Material Master)', 'Quantity', ''].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 10, color: T.textMuted, py: 1, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1.5px solid ${T.border}`, ...(h === '' ? { width: 40 } : {}), ...(h === 'S.No' ? { width: 50 } : {}), ...(h === 'Quantity' ? { width: 100 } : {}) }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {form.items.map((item, idx) => (
                  <TableRow key={idx} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                    <TableCell sx={{ fontSize: 13, fontWeight: 600, color: T.textSec, textAlign: 'center' }}>{idx + 1}</TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      <Autocomplete
                        options={parts}
                        getOptionLabel={(o) => [o.material_category || '', o.material_grade || '', o.condition || '', o.form || '', rfqDimStr(o.dimensions)].join(' | ')}
                        value={item.selectedPart}
                        onChange={(_, part) => handleItemPartChange(idx, part)}
                        isOptionEqualToValue={(opt, val) => opt.id === val.id}
                        renderInput={(params) => <TextField {...params} placeholder="Select part..." size="small" InputLabelProps={{ sx: { fontSize: 12 } }} />}
                        sx={{ '& .MuiInputBase-root': { fontSize: 12, borderRadius: '8px' } }}
                        size="small"
                      />
                    </TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      <TextField
                        type="number" value={item.quantity}
                        onChange={e => handleItemQtyChange(idx, e.target.value)}
                        size="small" fullWidth
                        inputProps={{ min: 1 }}
                        InputProps={{ sx: { fontSize: 12, borderRadius: '8px' } }}
                        placeholder="Qty"
                      />
                    </TableCell>
                    <TableCell sx={{ py: 0.8, textAlign: 'center' }}>
                      <IconButton size="small" onClick={() => removeLineItem(idx)}
                        disabled={form.items.length === 1}
                        sx={{ color: T.red, '&:hover': { bgcolor: alpha(T.red, 0.08) } }}>
                        <DeleteIcon sx={{ fontSize: 17 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <Button startIcon={<AddIcon />} onClick={addLineItem} size="small"
            sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 600, fontSize: 12, color: T.primary, borderRadius: '8px', '&:hover': { bgcolor: alpha(T.primary, 0.06) } }}>
            Add New Part
          </Button>

          <Divider />

          {/* ── Vendor Selection ── */}
          <Autocomplete
            multiple
            options={vendors}
            getOptionLabel={(o) => o.vendor_name}
            value={vendors.filter(v => form.vendor_ids.includes(v.id))}
            onChange={(_, vals) => setForm(f => ({ ...f, vendor_ids: vals.map(v => v.id) }))}
            renderInput={(params) => <TextField {...params} label="Select Vendor(s)" size="small" InputLabelProps={{ sx: { fontSize: 13 } }} />}
            renderTags={(value, getProps) =>
              value.map((o, i) => <Chip {...getProps({ index: i })} key={o.id} label={o.vendor_name} size="small" sx={{ fontSize: 11, borderRadius: '6px' }} />)
            }
            sx={{ '& .MuiInputBase-root': { fontSize: 13, borderRadius: '10px' } }}
          />
          {form.vendor_ids.length > 1 && (
            <Alert severity="info" sx={{ borderRadius: '10px', py: 0.5, '& .MuiAlert-message': { fontSize: 12 } }}>
              {form.vendor_ids.length} separate RFQs will be created — one per vendor, each containing all {form.items.length} line item(s)
            </Alert>
          )}

          <Divider />

          <TextField label="Instructions" multiline rows={3} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} size="small" InputLabelProps={{ sx: { fontSize: 13 } }} InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} placeholder="Shown in RFQ PDF" />
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${T.border}`, px: 3, py: 1.5 }}>
          <Button onClick={() => { setOpen(false); setCreateError(null); }} disabled={saving} sx={{ textTransform: 'none', fontSize: 13, borderRadius: '8px' }}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !itemsValid || form.vendor_ids.length === 0}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ bgcolor: T.primary, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '10px', px: 3, boxShadow: `0 2px 8px ${alpha(T.primary, 0.25)}`, '&:hover': { bgcolor: alpha(T.primary, 0.9) } }}>
            {saving ? 'Saving...' : 'Save as Draft'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 2 — PO to Vendor
   ══════════════════════════════════════════════════════════════════════════ */
const POSection = ({ showToast, onStats, initialRfqId, onClearInitialRfqId }: { showToast: (m: string, s?: 'success' | 'error') => void; onStats: (s: StatItem[]) => void; initialRfqId?: string | null; onClearInitialRfqId?: () => void }) => {
  const [pos, setPOs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sentRFQs, setSentRFQs] = useState<any[]>([]);

  type LineItem = {
    part_id?: string; part_name: string; material_category: string; material_grade: string;
    condition: string; form: string; dimensions: any; unit_system: string;
    quantity: number; weight: string; unit_cost: string; cost_per_weight: string;
    weight_unit: string; line_total: string;
  };

  const emptyForm = (s?: any) => ({
    rfq_id: '', po_date: new Date().toISOString().slice(0, 10), tax_type: 'Exempt',
    notes: s?.poNotes || '', cost_mode: 'unit' as 'unit' | 'weight', weight_unit: 'KG',
    terms_conditions: s?.poTerms || '', items: [] as LineItem[],
  });

  const [sysSettings, setSysSettings] = useState<any>({});
  const [form, setForm] = useState(emptyForm());
  const [selectedRFQ, setSelectedRFQ] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [editPoOpen, setEditPoOpen] = useState(false);
  const [editPoId, setEditPoId] = useState<string | null>(null);
  const [editPoForm, setEditPoForm] = useState({
    po_date: '', tax_type: 'Exempt', notes: '', cost_mode: 'unit' as 'unit' | 'weight',
    weight_unit: 'KG', terms_conditions: '', items: [] as LineItem[],
  });

  const fetchPOs = useCallback(async () => {
    try {
      const res = await api.get('/mgmt-procurement/pos');
      setPOs(res.data?.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const fetchSentRFQs = useCallback(async () => {
    try {
      const res = await api.get('/mgmt-procurement/rfqs?status=Sent');
      setSentRFQs(res.data?.data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { 
    fetchPOs(); 
    fetchSentRFQs(); 
    api.get('/settings/system').then(res => {
      const s = res.data?.data || {};
      setSysSettings(s);
      setForm(f => ({ ...f, notes: s.poNotes || f.notes, terms_conditions: s.poTerms || f.terms_conditions }));
    }).catch(() => {});
  }, [fetchPOs, fetchSentRFQs]);

  // Auto-open Create PO dialog when navigated from RFQ tab
  useEffect(() => {
    if (initialRfqId && sentRFQs.length > 0) {
      handleRFQSelect(initialRfqId);
      setOpen(true);
      if (onClearInitialRfqId) onClearInitialRfqId();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRfqId, sentRFQs]);

  /* ── Filtered + paginated data ── */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: pos.length };
    pos.forEach((p: any) => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return counts;
  }, [pos]);

  const sentRFQsWithoutPO = useMemo(() =>
    sentRFQs.filter((r: any) => !r.purchaseOrders || r.purchaseOrders.length === 0),
  [sentRFQs]);

  useEffect(() => {
    onStats([
      { label: 'Total POs', count: pos.length, color: T.primary, icon: <ReceiptIcon sx={{ fontSize: 20 }} /> },
      { label: 'Draft', count: statusCounts['Draft'] || 0, color: '#6B7280', icon: <EditIcon sx={{ fontSize: 20 }} /> },
      { label: 'Sent', count: statusCounts['Sent'] || 0, color: '#166354', icon: <SendIcon sx={{ fontSize: 20 }} /> },
      { label: 'Ordered', count: statusCounts['Ordered'] || 0, color: '#D97706', icon: <ShippingIcon sx={{ fontSize: 20 }} /> },
    ]);
  }, [pos, statusCounts, onStats]);

  const filtered = useMemo(() => {
    let list = pos;
    if (statusFilter !== 'All') list = list.filter((p: any) => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p: any) =>
        p.po_number?.toLowerCase().includes(q) ||
        p.part_name?.toLowerCase().includes(q) ||
        p.vendor?.vendor_name?.toLowerCase().includes(q) ||
        p.rfq?.rfq_number?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [pos, statusFilter, search]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paged = filtered.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  useEffect(() => { setPage(0); }, [search, statusFilter]);

  const handleRFQSelect = (rfqId: string) => {
    const rfq = sentRFQs.find((r: any) => r.id === rfqId) || null;
    setSelectedRFQ(rfq);
    if (!rfq) {
      setForm(f => ({ ...f, rfq_id: rfqId, items: [] }));
      return;
    }
    // Build items array from RFQ line_items or fallback to single-item RFQ
    const rawItems = Array.isArray(rfq.line_items) && rfq.line_items.length > 0
      ? rfq.line_items
      : [{
          part_id: rfq.part_id,
          part_name: rfq.part_name,
          material_category: rfq.material_category || '',
          material_grade: rfq.material_grade || '',
          quantity: parseFloat(rfq.quantity) || 0,
        }];
    const items: LineItem[] = rawItems.map((li: any) => ({
      part_id: li.part_id || undefined,
      part_name: li.part_name || '',
      material_category: li.material_category || '',
      material_grade: li.material_grade || '',
      condition: li.condition || '',
      form: li.form || '',
      dimensions: li.dimensions || null,
      unit_system: li.unit_system || 'imperial',
      quantity: parseFloat(li.quantity) || 0,
      weight: '',
      unit_cost: '',
      cost_per_weight: '',
      weight_unit: 'KG',
      line_total: '',
    }));
    setForm(f => ({ ...f, rfq_id: rfqId, items }));
  };

  // Recalculate a single line item's total
  const calcItemTotal = (item: LineItem, costMode: string) => {
    if (costMode === 'weight') {
      return (parseFloat(String(item.quantity)) || 0) * (parseFloat(item.weight) || 0) * (parseFloat(item.cost_per_weight) || 0);
    }
    return (parseFloat(String(item.quantity)) || 0) * (parseFloat(item.unit_cost) || 0);
  };

  // Update a field on a specific line item (Create form)
  const updateItem = (idx: number, field: string, value: string) => {
    setForm(prev => {
      const items = prev.items.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: field === 'quantity' ? (parseFloat(value) || 0) : value };
        updated.line_total = calcItemTotal(updated, prev.cost_mode).toFixed(2);
        return updated;
      });
      return { ...prev, items };
    });
  };

  // Toggle cost mode and recalculate all items (Create form)
  const toggleCostMode = (mode: 'unit' | 'weight') => {
    setForm(prev => {
      const items = prev.items.map(item => {
        const updated = { ...item };
        updated.line_total = calcItemTotal(updated, mode).toFixed(2);
        return updated;
      });
      return { ...prev, cost_mode: mode, items };
    });
  };

  // Subtotal for create form
  const formSubtotal = form.items.reduce((s, li) => s + (parseFloat(li.line_total) || 0), 0);

  // Build dimension string from JSONB
  const buildDimStr = (dims: any, unitSystem?: string) => {
    if (!dims || typeof dims !== 'object') return '';
    const isImperial = unitSystem === 'imperial';
    const vals: string[] = [];
    if (dims.length) vals.push(`${dims.length}`);
    if (dims.width) vals.push(`${dims.width}`);
    if (dims.height) vals.push(`${dims.height}`);
    if (dims.thickness) vals.push(`${dims.thickness}`);
    if (dims.diameter) vals.push(`${dims.diameter}`);
    if (dims.outer_diameter) vals.push(`${dims.outer_diameter}`);
    if (dims.inner_diameter) vals.push(`${dims.inner_diameter}`);
    if (dims.across_flats) vals.push(`${dims.across_flats}`);
    if (dims.side) vals.push(`${dims.side}`);
    if (vals.length === 0) return '';
    if (isImperial) return vals.map(v => `${v}"`).join(' x ');
    return vals.join(' x ') + ' mm';
  };

  // Build description from RFQ
  const buildDescription = (rfq: any) => {
    if (!rfq) return '---';
    const dimStr = buildDimStr(rfq.dimensions);
    return [rfq.material_category, rfq.material_grade, rfq.condition, dimStr].filter(Boolean).join(' | ');
  };

  const handleCreate = async () => {
    if (!form.rfq_id) { showToast('Please select an RFQ', 'error'); return; }
    if (form.items.length === 0) { showToast('No line items found. Select an RFQ.', 'error'); return; }
    const emptyUnitCost = form.items.some(li => form.cost_mode === 'unit' ? !li.unit_cost || parseFloat(li.unit_cost) <= 0 : !li.cost_per_weight || parseFloat(li.cost_per_weight) <= 0);
    if (emptyUnitCost) { showToast(`Please fill ${form.cost_mode === 'unit' ? 'Unit Cost' : 'Cost per ' + form.weight_unit.toLowerCase()} for all line items`, 'error'); return; }
    if (form.cost_mode === 'weight' && form.items.some(li => !li.weight || parseFloat(li.weight) <= 0)) {
      showToast('Unit Weight is required for all items in Per Weight mode', 'error'); return;
    }
    setSaving(true);
    try {
      await api.post('/mgmt-procurement/pos', {
        rfq_id: form.rfq_id,
        po_date: form.po_date,
        tax_type: form.tax_type,
        cost_mode: form.cost_mode,
        weight_unit: form.weight_unit,
        notes: form.notes,
        terms_conditions: form.terms_conditions,
        items: form.items.map(li => ({
          part_id: li.part_id,
          part_name: li.part_name,
          material_category: li.material_category,
          material_grade: li.material_grade,
          condition: li.condition,
          form: li.form,
          dimensions: li.dimensions,
          unit_system: li.unit_system,
          quantity: li.quantity,
          weight: li.weight,
          unit_cost: li.unit_cost,
          cost_per_weight: li.cost_per_weight,
          weight_unit: li.weight_unit,
        })),
      });
      showToast('PO saved as draft successfully', 'success');
      setForm(emptyForm(sysSettings));
      setSelectedRFQ(null);
      setOpen(false);
      fetchPOs();
      fetchSentRFQs();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to create PO', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (id: string) => {
    try {
      const res = await api.post(`/mgmt-procurement/pos/${id}/email`);
      if (res.data?.data?.sent === false) {
        showToast('PO marked as Sent (email not configured)');
      } else {
        showToast('PO sent to vendor');
      }
      fetchPOs();
    } catch (err: any) {
      try {
        await api.patch(`/mgmt-procurement/pos/${id}/send`);
        showToast('PO marked as Sent');
        fetchPOs();
      } catch (fallbackErr: any) {
        showToast(err.response?.data?.message || 'Failed to send', 'error');
      }
    }
  };

  const handleDownload = async (id: string, poNumber: string) => {
    try {
      const res = await api.get(`/mgmt-procurement/pos/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url; a.download = `${poNumber}.pdf`; a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      showToast('Failed to download PDF', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/mgmt-procurement/pos/${deleteTarget.id}`);
      showToast('PO deleted');
      setDeleteTarget(null);
      fetchPOs();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to delete', 'error');
    }
  };

  const handleMarkOrdered = async (id: string) => {
    try {
      await api.patch(`/mgmt-procurement/pos/${id}/ordered`);
      showToast('PO marked as Ordered');
      fetchPOs();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to mark as ordered', 'error');
    }
  };

  const handleMarkReceived = async (id: string) => {
    try {
      await api.patch(`/mgmt-procurement/pos/${id}/received`);
      showToast('Material marked as Received');
      fetchPOs();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to mark as received', 'error');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await api.post(`/mgmt-procurement/pos/${id}/copy`);
      showToast('PO duplicated as Draft');
      fetchPOs();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to duplicate PO', 'error');
    }
  };

  const handleEditPO = (po: any) => {
    setEditPoId(po.id);
    // Build items from line_items JSONB or fallback to single-item fields
    const rawItems = Array.isArray(po.line_items) && po.line_items.length > 0
      ? po.line_items
      : [{
          part_id: null, part_name: po.part_name || '', material_category: po.material_category || '',
          material_grade: po.material_grade || '', quantity: parseFloat(po.quantity) || 0,
          weight: po.total_weight != null ? String(po.total_weight) : '',
          unit_cost: po.unit_cost != null ? String(po.unit_cost) : '',
          cost_per_weight: po.cost_per_weight != null ? String(po.cost_per_weight) : '',
          weight_unit: po.weight_unit || 'KG', line_total: po.line_total != null ? String(po.line_total) : '',
        }];
    const items: LineItem[] = rawItems.map((li: any) => ({
      part_id: li.part_id || undefined,
      part_name: li.part_name || '',
      material_category: li.material_category || '',
      material_grade: li.material_grade || '',
      condition: li.condition || po.condition || '',
      form: li.form || po.form || '',
      dimensions: li.dimensions || po.dimensions || null,
      unit_system: li.unit_system || 'imperial',
      quantity: parseFloat(li.quantity) || 0,
      weight: li.weight != null ? String(li.weight) : '',
      unit_cost: li.unit_cost != null ? String(li.unit_cost) : '',
      cost_per_weight: li.cost_per_weight != null ? String(li.cost_per_weight) : '',
      weight_unit: li.weight_unit || 'KG',
      line_total: li.line_total != null ? String(li.line_total) : '',
    }));
    setEditPoForm({
      po_date: po.po_date ? new Date(po.po_date).toISOString().slice(0, 10) : '',
      tax_type: po.tax_type || 'Exempt',
      notes: po.notes || '',
      cost_mode: po.cost_mode || 'unit',
      weight_unit: po.weight_unit || 'KG',
      terms_conditions: po.terms_conditions || '',
      items,
    });
    setEditPoOpen(true);
  };

  // Update a field on a specific line item (Edit form)
  const updateEditItem = (idx: number, field: string, value: string) => {
    setEditPoForm(prev => {
      const items = prev.items.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: field === 'quantity' ? (parseFloat(value) || 0) : value };
        updated.line_total = calcItemTotal(updated, prev.cost_mode).toFixed(2);
        return updated;
      });
      return { ...prev, items };
    });
  };

  // Toggle cost mode and recalculate all items (Edit form)
  const toggleEditCostMode = (mode: 'unit' | 'weight') => {
    setEditPoForm(prev => {
      const items = prev.items.map(item => {
        const updated = { ...item };
        updated.line_total = calcItemTotal(updated, mode).toFixed(2);
        return updated;
      });
      return { ...prev, cost_mode: mode, items };
    });
  };

  // Subtotal for edit form
  const editSubtotal = editPoForm.items.reduce((s, li) => s + (parseFloat(li.line_total) || 0), 0);

  const handleSaveEditPO = async () => {
    if (!editPoId) return;
    if (editPoForm.items.length === 0) { showToast('No line items to save', 'error'); return; }
    const emptyUnitCost = editPoForm.items.some(li => editPoForm.cost_mode === 'unit' ? !li.unit_cost || parseFloat(li.unit_cost) <= 0 : !li.cost_per_weight || parseFloat(li.cost_per_weight) <= 0);
    if (emptyUnitCost) { showToast(`Please fill ${editPoForm.cost_mode === 'unit' ? 'Unit Cost' : 'Cost per ' + editPoForm.weight_unit.toLowerCase()} for all line items`, 'error'); return; }
    if (editPoForm.cost_mode === 'weight' && editPoForm.items.some(li => !li.weight || parseFloat(li.weight) <= 0)) {
      showToast('Unit Weight is required for all items in Per Weight mode', 'error'); return;
    }
    try {
      await api.put(`/mgmt-procurement/pos/${editPoId}`, {
        po_date: editPoForm.po_date,
        tax_type: editPoForm.tax_type,
        cost_mode: editPoForm.cost_mode,
        weight_unit: editPoForm.weight_unit,
        notes: editPoForm.notes,
        terms_conditions: editPoForm.terms_conditions,
        items: editPoForm.items.map(li => ({
          part_id: li.part_id,
          part_name: li.part_name,
          material_category: li.material_category,
          material_grade: li.material_grade,
          condition: li.condition,
          form: li.form,
          dimensions: li.dimensions,
          unit_system: li.unit_system,
          quantity: li.quantity,
          weight: li.weight,
          unit_cost: li.unit_cost,
          cost_per_weight: li.cost_per_weight,
          weight_unit: li.weight_unit,
        })),
      });
      showToast('PO updated');
      setEditPoOpen(false);
      setEditPoId(null);
      fetchPOs();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update PO', 'error');
    }
  };

  if (loading) return (
    <Box>
      <Skeleton variant="rounded" height={300} sx={{ borderRadius: '10px' }} />
    </Box>
  );

  return (
    <Box>
      {/* Pending POs Banner — Sent RFQs without a PO */}
      {sentRFQsWithoutPO.length > 0 && (
        <Box sx={{ mb: 1.5, p: '10px 14px', borderRadius: '12px', bgcolor: alpha('#166354', 0.04), border: `1px solid ${alpha('#166354', 0.2)}`, display: 'flex', flexDirection: 'column', gap: 0.8 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
            <WarningIcon sx={{ fontSize: 16, color: '#166354' }} />
            <Typography fontSize={12} fontWeight={700} color="#166354">
              {sentRFQsWithoutPO.length} Sent RFQ{sentRFQsWithoutPO.length > 1 ? 's' : ''} pending PO creation
            </Typography>
          </Box>
          {sentRFQsWithoutPO.map((rfq: any) => (
            <Box key={rfq.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6, px: 1.2, borderRadius: '8px', bgcolor: alpha('#166354', 0.04), border: `1px solid ${alpha('#166354', 0.1)}` }}>
              <Chip label="Sent" size="small" sx={{ fontSize: 10, fontWeight: 700, bgcolor: alpha('#166354', 0.1), color: '#166354', height: 20 }} />
              <Typography fontSize={12} fontWeight={600}>{rfq.rfq_number}</Typography>
              <Typography fontSize={11} color={T.textSec} sx={{ flex: 1 }}>
                {Array.isArray(rfq.line_items) && rfq.line_items.length > 1
                  ? `${rfq.line_items.length} line items`
                  : rfq.part_name || '---'}
                {rfq.vendor?.vendor_name ? ` — ${rfq.vendor.vendor_name}` : ''}
              </Typography>
              <Button size="small" variant="outlined"
                onClick={() => { handleRFQSelect(rfq.id); setOpen(true); }}
                sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600, borderRadius: '8px', px: 1.5, py: 0.4, borderColor: '#166354', color: '#166354', minWidth: 80, '&:hover': { bgcolor: alpha('#166354', 0.06) } }}>
                Create PO
              </Button>
            </Box>
          ))}
        </Box>
      )}

      {/* Search + Filters + Create */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <FilterBar search={search} onSearch={setSearch} statusFilter={statusFilter}
            onStatusFilter={setStatusFilter} statusCounts={statusCounts} />
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm(emptyForm()); setSelectedRFQ(null); setOpen(true); }}
          sx={{ bgcolor: T.primary, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '10px', px: 2.5, boxShadow: `0 2px 8px ${alpha(T.primary, 0.25)}`, '&:hover': { bgcolor: alpha(T.primary, 0.9) } }}>
          Create New PO
        </Button>
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '14px', border: `1px solid ${T.border}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#FAFBFD' }}>
              {['PO Number', 'PO Date', 'Material', 'Quantity', 'Grand Total', 'Vendor', 'Status', 'Actions'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 9.5, color: T.textMuted, py: 1.4, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1.5px solid ${T.border}` }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.length === 0 ? (
              <EmptyState colSpan={8}
                icon={<ReceiptIcon sx={{ fontSize: 24, color: T.primary }} />}
                title={search || statusFilter !== 'All' ? 'No matching POs' : 'No Purchase Orders yet'}
                subtitle={search || statusFilter !== 'All' ? 'Try adjusting your search or filter' : 'Create a PO from a sent RFQ to get started'} />
            ) : paged.map((p: any, idx: number) => (
              <TableRow key={p.id} hover sx={{
                bgcolor: idx % 2 === 0 ? T.white : T.zebraRow,
                borderLeft: '3px solid transparent',
                '&:hover': { bgcolor: T.hoverRow, borderLeftColor: T.primary },
                transition: 'all 0.15s',
              }}>
                <TableCell sx={{ fontWeight: 600, fontSize: 12, color: T.primary, whiteSpace: 'nowrap' }}>{p.po_number}</TableCell>
                <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(p.po_date)}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{[p.material_category, buildDimStr(p.dimensions, p.unit_system)].filter(Boolean).join(' | ') || '---'}</TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{p.quantity}</TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 700 }}>{parseFloat(p.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{p.vendor?.vendor_name || '---'}</TableCell>
                <TableCell>
                  <Chip label={p.status} size="small" sx={{
                    fontWeight: 600, fontSize: 10, px: 0.8, height: 22, borderRadius: '999px',
                    bgcolor: alpha(statusColor[p.status] || '#6B7280', 0.1),
                    color: statusColor[p.status] || '#6B7280',
                    border: `1px solid ${alpha(statusColor[p.status] || '#6B7280', 0.2)}`,
                  }} />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.3 }}>
                    <Tooltip title="Download PDF" arrow>
                      <IconButton size="small" onClick={() => handleDownload(p.id, p.po_number)}
                        sx={{ '&:hover': { bgcolor: alpha(T.primary, 0.08) } }}>
                        <DownloadIcon sx={{ fontSize: 17 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Duplicate" arrow>
                      <IconButton size='small' onClick={() => handleDuplicate(p.id)}
                        sx={{ color: '#7C3AED', '&hover': { bgcolor: alpha('#7C3AED', 0.08) } }}
                        >
                          <CopyIcon sx={{ fontSize:17 }} />
                      </IconButton>
                    </Tooltip>
                    {p.status === 'Draft' && (
                      <>
                        <Tooltip title="Edit" arrow>
                          <IconButton size="small" onClick={() => handleEditPO(p)}
                            sx={{ '&:hover': { bgcolor: alpha(T.primary, 0.08) } }}>
                            <EditIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Send to Vendor" arrow>
                          <IconButton size="small" color="primary" onClick={() => handleSend(p.id)}
                            sx={{ '&:hover': { bgcolor: alpha('#166354', 0.08) } }}>
                            <SendIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete" arrow>
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(p)}
                            sx={{ '&:hover': { bgcolor: alpha('#EF4444', 0.08) } }}>
                            <DeleteIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    {p.status === 'Sent' && (
                      <>
                        <Tooltip title="Mark as Ordered" arrow>
                          <IconButton size="small" onClick={() => handleMarkOrdered(p.id)}
                            sx={{ color: '#D97706', '&:hover': { bgcolor: alpha('#D97706', 0.08) } }}>
                            <CartIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Mark as Received" arrow>
                          <IconButton size="small" onClick={() => handleMarkReceived(p.id)}
                            sx={{ color: '#059669', '&:hover': { bgcolor: alpha('#059669', 0.08) } }}>
                            <CheckIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete" arrow>
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(p)}
                            sx={{ '&:hover': { bgcolor: alpha('#EF4444', 0.08) } }}>
                            <DeleteIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    {p.status === 'Ordered' && (
                      <>
                        <Tooltip title="Mark as Received" arrow>
                          <IconButton size="small" onClick={() => handleMarkReceived(p.id)}
                            sx={{ color: '#059669', '&:hover': { bgcolor: alpha('#059669', 0.08) } }}>
                            <CheckIcon sx={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <PaginationBar page={page} totalPages={totalPages} totalItems={filtered.length}
        pageSize={ROWS_PER_PAGE} onPageChange={setPage} />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete} itemLabel={deleteTarget?.po_number || ''} />

      {/* Create PO Dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth scroll="body" PaperProps={{ sx: { borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, fontSize: 16, borderBottom: `1px solid ${T.border}`, letterSpacing: '-0.01em' }}>
          <Box sx={{
            width: 38, height: 38, borderRadius: '12px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${alpha(T.primary, 0.12)}, ${alpha(T.primary, 0.06)})`,
            border: `1px solid ${alpha(T.primary, 0.15)}`,
          }}>
            <AddIcon sx={{ fontSize: 20, color: T.primary }} />
          </Box>
          Create New PO
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'visible' }}>
          {/* Row 1: PO Number | PO Date | Tax */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="PO Number" value="Auto-generated (PO-P-#####)" disabled size="small" fullWidth InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
            <TextField label="PO Date" type="date" value={form.po_date} onChange={e => setForm(f => ({ ...f, po_date: e.target.value }))} size="small" fullWidth InputLabelProps={{ shrink: true, sx: { fontSize: 13 } }} InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} />
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: 13 }}>Tax</InputLabel>
              <Select value={form.tax_type} label="Tax" onChange={e => setForm(f => ({ ...f, tax_type: e.target.value }))} sx={{ fontSize: 13, borderRadius: '10px' }}>
                {['Exempt', '5%', '12%', '18%'].map(t => <MenuItem key={t} value={t} sx={{ fontSize: 13 }}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>

          {/* Row 2: Cost Mode | Unit | Select RFQ */}
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
              <Typography fontSize={12} fontWeight={600} color={T.textSec} sx={{ whiteSpace: 'nowrap' }}>Cost Mode:</Typography>
              <Box sx={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
                {(['unit', 'weight'] as const).map(mode => (
                  <Box key={mode} onClick={() => toggleCostMode(mode)}
                    sx={{ px: 2, py: 0.5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      bgcolor: form.cost_mode === mode ? T.primary : 'transparent',
                      color: form.cost_mode === mode ? '#fff' : T.textSec,
                      transition: 'all 0.2s' }}>
                    {mode === 'unit' ? 'Per Unit' : 'Per Weight'}
                  </Box>
                ))}
              </Box>
            </Box>
            <FormControl size="small" sx={{ minWidth: 80 }}>
              <InputLabel sx={{ fontSize: 13 }}>Unit</InputLabel>
              <Select value={form.weight_unit} label="Unit" onChange={e => setForm(f => ({ ...f, weight_unit: e.target.value }))} sx={{ fontSize: 13, borderRadius: '10px' }}>
                {['KG', 'LBS'].map(u => <MenuItem key={u} value={u} sx={{ fontSize: 13 }}>{u}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel sx={{ fontSize: 13 }}>Select RFQ (Sent only)</InputLabel>
              <Select value={form.rfq_id} label="Select RFQ (Sent only)" onChange={e => handleRFQSelect(e.target.value)} sx={{ fontSize: 13, borderRadius: '10px' }}>
                {sentRFQs.filter((r: any) => !r.purchaseOrders || r.purchaseOrders.length === 0).map((r: any) => (
                  <MenuItem key={r.id} value={r.id} sx={{ fontSize: 13 }}>
                    {r.rfq_number} — {Array.isArray(r.line_items) && r.line_items.length > 1 ? `${r.line_items.length} items` : r.part_name} ({r.vendor?.vendor_name})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Line Items (Expanding Block — No Internal Scroll) */}
          <Box sx={{ borderRadius: '10px', border: `1px solid ${T.border}`, overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#FAFBFD' }}>
                  {['S.No', 'Description', 'Quantity', 'Unit Weight', form.cost_mode === 'unit' ? 'Unit Cost' : `Cost per ${form.weight_unit.toLowerCase()}`, 'Line Total (Subtotal)'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 10, color: T.textMuted, py: 1, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1.5px solid ${T.border}`,
                      ...(h === 'S.No' ? { width: 50 } : {}),
                      ...(h === 'Quantity' ? { width: 100 } : {}),
                      ...(h === 'Unit Weight' || h === 'Unit Cost' || h.startsWith('Cost per') ? { width: 120 } : {}),
                      ...(h === 'Line Total (Subtotal)' ? { width: 110 } : {}) }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {form.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 3, color: T.textMuted, fontSize: 12, fontStyle: 'italic' }}>
                      Select an RFQ above to auto-load line items
                    </TableCell>
                  </TableRow>
                ) : form.items.map((item, idx) => (
                  <TableRow key={idx} sx={{ '&:last-child td': { borderBottom: 0 }, bgcolor: idx % 2 === 0 ? T.white : T.zebraRow }}>
                    <TableCell sx={{ fontSize: 12, fontWeight: 600, color: T.textSec, textAlign: 'center' }}>{idx + 1}</TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <Typography fontSize={12} fontWeight={600}>{[item.material_category, item.material_grade, item.condition].filter(Boolean).join(' — ') || item.part_name || '---'}</Typography>
                      <Typography fontSize={10} color={T.textMuted}>{[item.form, item.dimensions ? buildDimStr(item.dimensions, item.unit_system) : ''].filter(Boolean).join(' / ')}</Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      <TextField type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} size="small" fullWidth placeholder="0"
                        inputProps={{ min: 0, step: 1, style: { padding: '6px 8px', fontSize: 12 } }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                    </TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      <TextField type="number" value={item.weight} onChange={e => updateItem(idx, 'weight', e.target.value)} size="small" fullWidth placeholder="0.00"
                        inputProps={{ min: 0, step: 0.01, style: { padding: '6px 8px', fontSize: 12 } }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                    </TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      {form.cost_mode === 'unit' ? (
                        <TextField type="number" value={item.unit_cost} onChange={e => updateItem(idx, 'unit_cost', e.target.value)} size="small" fullWidth placeholder="0.00"
                          inputProps={{ min: 0, step: 0.01, style: { padding: '6px 8px', fontSize: 12 } }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                      ) : (
                        <TextField type="number" value={item.cost_per_weight} onChange={e => updateItem(idx, 'cost_per_weight', e.target.value)} size="small" fullWidth placeholder="0.00"
                          inputProps={{ min: 0, step: 0.01, style: { padding: '6px 8px', fontSize: 12 } }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      ${parseFloat(item.line_total || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {form.items.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', px: 1.5, py: 0.75, bgcolor: alpha(T.primary, 0.04), borderRadius: '10px', border: `1px solid ${alpha(T.primary, 0.12)}` }}>
              <Typography fontSize={12} fontWeight={700} sx={{ mr: 2 }}>Subtotal</Typography>
              <Typography fontSize={14} fontWeight={700} color={T.primary}>
                ${formSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </Typography>
            </Box>
          )}

          <TextField label="Notes" multiline rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} size="small" InputLabelProps={{ sx: { fontSize: 13 } }} InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} />

          <TextField label="Terms & Conditions" multiline rows={2} value={form.terms_conditions} onChange={e => setForm(f => ({ ...f, terms_conditions: e.target.value }))} size="small" InputLabelProps={{ sx: { fontSize: 13 } }} InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} />
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${T.border}`, px: 3, py: 1.5 }}>
          <Button onClick={() => setOpen(false)} disabled={saving} sx={{ textTransform: 'none', fontSize: 13, borderRadius: '8px' }}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !form.rfq_id}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ bgcolor: T.primary, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '10px', px: 3, boxShadow: `0 2px 8px ${alpha(T.primary, 0.25)}`, '&:hover': { bgcolor: alpha(T.primary, 0.9) }, '&.Mui-disabled': { bgcolor: alpha(T.primary, 0.4), color: '#fff' } }}>
            {saving ? 'Saving...' : 'Save as Draft'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit PO Dialog */}
      <Dialog open={editPoOpen} onClose={() => setEditPoOpen(false)} maxWidth="md" fullWidth scroll="body" PaperProps={{ sx: { borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.12)' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontWeight: 700, fontSize: 16, borderBottom: `1px solid ${T.border}`, letterSpacing: '-0.01em' }}>
          <Box sx={{
            width: 38, height: 38, borderRadius: '12px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: `linear-gradient(135deg, ${alpha(T.primary, 0.12)}, ${alpha(T.primary, 0.06)})`,
            border: `1px solid ${alpha(T.primary, 0.15)}`,
          }}>
            <EditIcon sx={{ fontSize: 20, color: T.primary }} />
          </Box>
          Edit Purchase Order
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important', display: 'flex', flexDirection: 'column', gap: 2, overflow: 'visible' }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="PO Date" type="date" value={editPoForm.po_date} onChange={e => setEditPoForm(f => ({ ...f, po_date: e.target.value }))} size="small" fullWidth InputLabelProps={{ shrink: true, sx: { fontSize: 13 } }} InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} />
            <FormControl size="small" fullWidth>
              <InputLabel sx={{ fontSize: 13 }}>Tax</InputLabel>
              <Select value={editPoForm.tax_type} label="Tax" onChange={e => setEditPoForm(f => ({ ...f, tax_type: e.target.value }))} sx={{ fontSize: 13, borderRadius: '10px' }}>
                {['Exempt', '5%', '12%', '18%'].map(t => <MenuItem key={t} value={t} sx={{ fontSize: 13 }}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>

          {/* Cost Mode Toggle + Unit */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
              <Typography fontSize={12} fontWeight={600} color={T.textSec} sx={{ whiteSpace: 'nowrap' }}>Cost Mode:</Typography>
              <Box sx={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
                {(['unit', 'weight'] as const).map(mode => (
                  <Box key={mode} onClick={() => toggleEditCostMode(mode)}
                    sx={{ px: 2, py: 0.5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      bgcolor: editPoForm.cost_mode === mode ? T.primary : 'transparent',
                      color: editPoForm.cost_mode === mode ? '#fff' : T.textSec,
                      transition: 'all 0.2s' }}>
                    {mode === 'unit' ? 'Per Unit' : 'Per Weight'}
                  </Box>
                ))}
              </Box>
            </Box>
            <FormControl size="small" sx={{ minWidth: 80 }}>
              <InputLabel sx={{ fontSize: 13 }}>Unit</InputLabel>
              <Select value={editPoForm.weight_unit} label="Unit" onChange={e => setEditPoForm(f => ({ ...f, weight_unit: e.target.value }))} sx={{ fontSize: 13, borderRadius: '10px' }}>
                {['KG', 'LBS'].map(u => <MenuItem key={u} value={u} sx={{ fontSize: 13 }}>{u}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>

          {/* Line Items (Expanding Block — No Internal Scroll) */}
          <Box sx={{ borderRadius: '10px', border: `1px solid ${T.border}`, overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#FAFBFD' }}>
                  {['S.No', 'Description', 'Quantity', 'Unit Weight', editPoForm.cost_mode === 'unit' ? 'Unit Cost' : `Cost per ${editPoForm.weight_unit.toLowerCase()}`, 'Line Total (Subtotal)'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: 10, color: T.textMuted, py: 1, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1.5px solid ${T.border}`,
                      ...(h === 'S.No' ? { width: 50 } : {}),
                      ...(h === 'Quantity' ? { width: 100 } : {}),
                      ...(h === 'Unit Weight' || h === 'Unit Cost' || h.startsWith('Cost per') ? { width: 120 } : {}),
                      ...(h === 'Line Total (Subtotal)' ? { width: 110 } : {}) }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {editPoForm.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ textAlign: 'center', py: 3, color: T.textMuted, fontSize: 12, fontStyle: 'italic' }}>
                      No line items
                    </TableCell>
                  </TableRow>
                ) : editPoForm.items.map((item, idx) => (
                  <TableRow key={idx} sx={{ '&:last-child td': { borderBottom: 0 }, bgcolor: idx % 2 === 0 ? T.white : T.zebraRow }}>
                    <TableCell sx={{ fontSize: 12, fontWeight: 600, color: T.textSec, textAlign: 'center' }}>{idx + 1}</TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <Typography fontSize={12} fontWeight={600}>{[item.material_category, item.material_grade, item.condition].filter(Boolean).join(' — ') || item.part_name || '---'}</Typography>
                      <Typography fontSize={10} color={T.textMuted}>{[item.form, item.dimensions ? buildDimStr(item.dimensions, item.unit_system) : ''].filter(Boolean).join(' / ')}</Typography>
                    </TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      <TextField type="number" value={item.quantity} onChange={e => updateEditItem(idx, 'quantity', e.target.value)} size="small" fullWidth placeholder="0"
                        inputProps={{ min: 0, step: 1, style: { padding: '6px 8px', fontSize: 12 } }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                    </TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      <TextField type="number" value={item.weight} onChange={e => updateEditItem(idx, 'weight', e.target.value)} size="small" fullWidth placeholder="0.00"
                        inputProps={{ min: 0, step: 0.01, style: { padding: '6px 8px', fontSize: 12 } }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                    </TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      {editPoForm.cost_mode === 'unit' ? (
                        <TextField type="number" value={item.unit_cost} onChange={e => updateEditItem(idx, 'unit_cost', e.target.value)} size="small" fullWidth placeholder="0.00"
                          inputProps={{ min: 0, step: 0.01, style: { padding: '6px 8px', fontSize: 12 } }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                      ) : (
                        <TextField type="number" value={item.cost_per_weight} onChange={e => updateEditItem(idx, 'cost_per_weight', e.target.value)} size="small" fullWidth placeholder="0.00"
                          inputProps={{ min: 0, step: 0.01, style: { padding: '6px 8px', fontSize: 12 } }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      ${parseFloat(item.line_total || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {editPoForm.items.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', px: 1.5, py: 0.75, bgcolor: alpha(T.primary, 0.04), borderRadius: '10px', border: `1px solid ${alpha(T.primary, 0.12)}` }}>
              <Typography fontSize={12} fontWeight={700} sx={{ mr: 2 }}>Subtotal</Typography>
              <Typography fontSize={14} fontWeight={700} color={T.primary}>
                ${editSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </Typography>
            </Box>
          )}

          <TextField label="Notes" multiline rows={2} value={editPoForm.notes} onChange={e => setEditPoForm(f => ({ ...f, notes: e.target.value }))} size="small" InputLabelProps={{ sx: { fontSize: 13 } }} InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} />

          <TextField label="Terms & Conditions" multiline rows={2} value={editPoForm.terms_conditions} onChange={e => setEditPoForm(f => ({ ...f, terms_conditions: e.target.value }))} size="small" InputLabelProps={{ sx: { fontSize: 13 } }} InputProps={{ sx: { fontSize: 13, borderRadius: '10px' } }} />
        </DialogContent>
        <DialogActions sx={{ borderTop: `1px solid ${T.border}`, px: 3, py: 1.5 }}>
          <Button onClick={() => setEditPoOpen(false)} sx={{ textTransform: 'none', fontSize: 13, borderRadius: '8px' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEditPO}
            sx={{ bgcolor: T.primary, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '10px', px: 3, boxShadow: `0 2px 8px ${alpha(T.primary, 0.25)}`, '&:hover': { bgcolor: alpha(T.primary, 0.9) } }}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   SECTION 3 — Purchased Material
   ══════════════════════════════════════════════════════════════════════════ */
const PurchasedMaterialSection = ({ showToast, onStats }: { showToast: (m: string, s?: 'success' | 'error') => void; onStats: (s: StatItem[]) => void }) => {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(0);

  const fetchMaterials = useCallback(async () => {
    try {
      const res = await api.get('/mgmt-procurement/purchased-materials');
      setMaterials(res.data?.data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  /* ── Filtered + paginated data ── */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: materials.length };
    materials.forEach((m: any) => { counts[m.status] = (counts[m.status] || 0) + 1; });
    return counts;
  }, [materials]);

  useEffect(() => {
    onStats([
      { label: 'Total Materials', count: materials.length, color: T.primary, icon: <ShippingIcon sx={{ fontSize: 20 }} /> },
      { label: 'Ordered', count: statusCounts['Ordered'] || 0, color: '#D97706', icon: <CartIcon sx={{ fontSize: 20 }} /> },
      { label: 'Received', count: statusCounts['Received'] || 0, color: '#059669', icon: <CheckIcon sx={{ fontSize: 20 }} /> },
    ]);
  }, [materials, statusCounts, onStats]);

  const filtered = useMemo(() => {
    let list = materials;
    if (statusFilter !== 'All') list = list.filter((m: any) => m.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m: any) =>
        m.po_number?.toLowerCase().includes(q) ||
        m.part_name?.toLowerCase().includes(q) ||
        m.vendor?.vendor_name?.toLowerCase().includes(q) ||
        m.rfq?.rfq_number?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [materials, statusFilter, search]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paged = filtered.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  useEffect(() => { setPage(0); }, [search, statusFilter]);

  const handleReceived = async (id: string) => {
    try {
      await api.patch(`/mgmt-procurement/pos/${id}/received`);
      showToast('Material marked as Received');
      fetchMaterials();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed', 'error');
    }
  };

  if (loading) return (
    <Box>
      <Skeleton variant="rounded" height={300} sx={{ borderRadius: '10px' }} />
    </Box>
  );

  return (
    <Box>
      {/* Search + Filters */}
      <Box sx={{ mb: 1.5 }}>
        <FilterBar search={search} onSearch={setSearch} statusFilter={statusFilter}
          onStatusFilter={setStatusFilter} statusCounts={statusCounts} />
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '14px', border: `1px solid ${T.border}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#FAFBFD' }}>
              {['S.No', 'PO No', 'RFQ No', 'Description', 'Quantity', 'Vendor', 'Status', 'Action'].map(h => (
                <TableCell key={h} sx={{ fontWeight: 700, fontSize: 9.5, color: T.textMuted, py: 1.4, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1.5px solid ${T.border}` }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.length === 0 ? (
              <EmptyState colSpan={8}
                icon={<ShippingIcon sx={{ fontSize: 24, color: T.primary }} />}
                title={search || statusFilter !== 'All' ? 'No matching materials' : 'No purchased materials yet'}
                subtitle={search || statusFilter !== 'All' ? 'Try adjusting your search or filter' : 'Create and send POs to track purchased materials'} />
            ) : paged.map((m: any, idx: number) => (
              <TableRow key={m.id} hover sx={{
                bgcolor: idx % 2 === 0 ? T.white : T.zebraRow,
                borderLeft: '3px solid transparent',
                '&:hover': { bgcolor: T.hoverRow, borderLeftColor: T.primary },
                transition: 'all 0.15s',
              }}>
                <TableCell sx={{ fontSize: 12, fontWeight: 500, color: T.textSec }}>{page * ROWS_PER_PAGE + idx + 1}</TableCell>
                <TableCell sx={{ fontWeight: 600, fontSize: 12, color: T.primary, whiteSpace: 'nowrap' }}>{m.po_number}</TableCell>
                <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{m.rfq?.rfq_number || '---'}</TableCell>
                <TableCell sx={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[m.material_category, m.material_grade, rfqDimStr(m.dimensions)].filter(Boolean).join(' / ') || '---'}</TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 600 }}>{m.quantity}</TableCell>
                <TableCell sx={{ fontSize: 12 }}>{m.vendor?.vendor_name || '---'}</TableCell>
                <TableCell>
                  <Chip label={m.status} size="small" sx={{
                    fontWeight: 600, fontSize: 10, px: 0.8, height: 22, borderRadius: '999px',
                    bgcolor: alpha(statusColor[m.status] || '#6B7280', 0.1),
                    color: statusColor[m.status] || '#6B7280',
                    border: `1px solid ${alpha(statusColor[m.status] || '#6B7280', 0.2)}`,
                  }} />
                </TableCell>
                <TableCell>
                  {m.status === 'Sent' && (
                    <Button size="small" variant="outlined" startIcon={<CheckIcon sx={{ fontSize: 14 }} />} onClick={() => handleReceived(m.id)}
                      sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600, borderRadius: '8px', borderColor: '#059669', color: '#059669', whiteSpace: 'nowrap', '&:hover': { bgcolor: alpha('#059669', 0.08), borderColor: '#059669' } }}>
                      Order Received
                    </Button>
                  )}
                  {m.status === 'Ordered' && (
                    <Button size="small" variant="outlined" startIcon={<CheckIcon sx={{ fontSize: 14 }} />} onClick={() => handleReceived(m.id)}
                      sx={{ textTransform: 'none', fontSize: 11, fontWeight: 600, borderRadius: '8px', borderColor: '#059669', color: '#059669', whiteSpace: 'nowrap', '&:hover': { bgcolor: alpha('#059669', 0.08), borderColor: '#059669' } }}>
                      Order Received
                    </Button>
                  )}
                  {m.status === 'Received' && (
                    <Chip icon={<CheckIcon sx={{ fontSize: 14 }} />} label="Received" size="small" sx={{ fontWeight: 600, fontSize: 11, bgcolor: alpha('#059669', 0.12), color: '#059669' }} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      <PaginationBar page={page} totalPages={totalPages} totalItems={filtered.length}
        pageSize={ROWS_PER_PAGE} onPageChange={setPage} />
    </Box>
  );
};

export default MgmtProcurementPage;
