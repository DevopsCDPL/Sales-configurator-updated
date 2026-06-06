import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableHead, TableRow,
  TableCell, TableBody, Chip, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem, FormControl,
  InputLabel, Tabs, Tab, Tooltip, Skeleton, alpha, SelectChangeEvent,
  InputAdornment, Stack, Fade,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as ApproveIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  ShoppingCart as CartIcon,
  RequestQuote as RFQIcon,
  LocalShipping as ShipIcon,
  Close as CloseIcon,
  FilterList as FilterIcon,
  Edit as EditIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { vendorProcurementService } from '../services/vendorProcurementService';
import { materialService } from '../services/materialService';
import { VendorRFQ, VendorPO, Material, VendorPOItemType, VendorPurchaseOrder, RFQBundle, RFQBundleItem } from '../types';
import api from '../services/api';
import { calculateLineTotal } from '../utils/calculations';

/* ══════ Design Tokens ══════ */
const T = {
  primary:      '#1F6F5C',
  primaryLight: '#2A9D7E',
  primaryBg:    '#E9F5F1',
  dark:         '#1F2937',
  textPrimary:  '#1F2937',
  textSecondary:'#6B7280',
  border:     'var(--border)',
  bg:         'var(--bg-canvas)',
  white:        '#ffffff',
  danger:       '#EF4444',
  dangerBg:     '#fef2f2',
  warning:      '#F59E0B',
  warningBg:    '#FFFBEB',
  success:      '#16A34A',
  successBg:    '#E9F5F1',
  info:         '#3B82F6',
  infoBg:       '#EFF6FF',
  radius:       '14px',
  radiusSm:     '10px',
  radiusXs:     '8px',
  shadow:       '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
  shadowMd:     '0 4px 12px rgba(0,0,0,0.06)',
  shadowLg:     '0 8px 24px rgba(0,0,0,0.08)',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: T.radiusXs,
    backgroundColor: T.white,
    fontSize: 13,
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(T.primary, 0.5) },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.primary, borderWidth: 2 },
  },
  '& .MuiInputLabel-root': { fontSize: 13 },
  '& .MuiInputLabel-root.Mui-focused': { color: T.primary },
};

const STATUS_BADGE: Record<string, { color: string; bg: string; label: string }> = {
  pending:    { color: '#92400E', bg: '#FFFBEB', label: 'Pending' },
  quoted:     { color: '#0D3D2F', bg: '#EFF6FF', label: 'Quoted' },
  accepted:   { color: '#166354', bg: '#E8F7F2', label: 'Approved' },
  rejected:   { color: '#991B1B', bg: '#FEF2F2', label: 'Rejected' },
  draft:      { color: '#6B7280', bg: 'var(--bg-surface-2)', label: 'Draft' },
  sent:       { color: '#0D3D2F', bg: '#EFF6FF', label: 'Sent' },
  acknowledged: { color: '#0D3D2F', bg: '#E8F7F2', label: 'Acknowledged' },
  delivered:  { color: '#166354', bg: '#E8F7F2', label: 'Delivered' },
  cancelled:  { color: '#991B1B', bg: '#FEF2F2', label: 'Cancelled' },
};

const thSx = {
  fontWeight: 600, fontSize: 11, color: T.textSecondary, textTransform: 'uppercase' as const,
  letterSpacing: 0.8, py: '14px', px: '18px', borderBottom: `2px solid ${T.border}`,
  bgcolor: T.bg, whiteSpace: 'nowrap' as const,
};

const tdSx = {
  py: '14px', px: '18px', verticalAlign: 'middle' as const, fontSize: 13,
  borderBottom: `1px solid ${T.border}`,
};

/* ══ StatusChip ══ */
const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const badge = STATUS_BADGE[status] || { color: '#6B7280', bg: 'var(--bg-surface-2)', label: status };
  return (
    <Chip label={badge.label} size="small" sx={{
      height: 24, fontSize: 11, fontWeight: 700, borderRadius: '12px',
      bgcolor: badge.bg, color: badge.color, px: 0.5,
      border: `1px solid ${alpha(badge.color, 0.15)}`,
      display: 'inline-flex', verticalAlign: 'middle',
    }} />
  );
};

/* ══════ Component ══════ */
const VendorProcurementPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rfqs, setRfqs] = useState<VendorRFQ[]>([]);
  const [pos, setPos] = useState<VendorPO[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  /* Filters */
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [vendorFilter, setVendorFilter] = useState<string>('all');

  /* RFQ form */
  const [rfqOpen, setRfqOpen] = useState(false);
  const [rfqForm, setRfqForm] = useState<any>({});
  const [suggestedVendors, setSuggestedVendors] = useState<any[]>([]);

  // PO form state
  const [poOpen, setPoOpen] = useState(false);
  const [poForm, setPoForm] = useState<any>({});
  const [poLineItems, setPoLineItems] = useState<VendorPOItemType[]>([]);
  const [poCostMode, setPoCostMode] = useState<'unit' | 'weight'>('unit');
  const [poRFQs, setPoRFQs] = useState<RFQBundle[]>([]);
  const [selectedRFQId, setSelectedRFQId] = useState<string>('');

  /* Edit RFQ modal */
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  /* Projects & vendors */
  const [projects, setProjects] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [procData, matData, projRes, vendRes] = await Promise.all([
        vendorProcurementService.getProcurementItems(),
        materialService.getAll(),
        api.get('/projects'),
        api.get('/vendors'),
      ]);
      setRfqs(procData.rfqs || []);
      setPos(procData.purchaseOrders || []);
      setMaterials(matData);
      setProjects(Array.isArray(projRes.data) ? projRes.data : projRes.data?.data || []);
      setVendors(Array.isArray(vendRes.data) ? vendRes.data : vendRes.data?.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Handlers */
  const openRFQForm = () => { setRfqForm({ status: 'pending' }); setSuggestedVendors([]); setRfqOpen(true); };

  const handleMaterialChange = async (materialId: string) => {
    const mat = materials.find(m => m.id === materialId);
    setRfqForm((f: any) => ({ ...f, material_id: materialId, unit: mat?.unit || f.unit || '' }));
    if (materialId) {
      try { const sv = await vendorProcurementService.getSuggestedVendors(materialId); setSuggestedVendors(sv); }
      catch { setSuggestedVendors([]); }
    }
  };

  const handleCreateRFQ = async () => {
    /* Duplicate check: Material + Project must be unique */
    if (rfqs.some(r => r.material_id === rfqForm.material_id && r.project_id === rfqForm.project_id)) {
      alert('RFQ already exists for this material in the selected project.');
      return;
    }
    try { await vendorProcurementService.createRFQ(rfqForm); setRfqOpen(false); fetchData(); }
    catch (e: any) { alert(e?.response?.data?.message || 'Error creating RFQ'); }
  };

  const handleSelectVendor = async (rfqId: string) => { await vendorProcurementService.selectVendor(rfqId); fetchData(); };
  const handleDeleteRFQ = async (rfqId: string) => { await vendorProcurementService.deleteRFQ(rfqId); fetchData(); };

  // Open PO modal and load available RFQs (sent only)
  const _openPOForm = async () => {
    // Fetch only sent/accepted RFQ bundles for selection
    const rfqBundles = await vendorProcurementService.getRFQBundles({ status: 'sent' });
    setPoRFQs(rfqBundles || []);
    setPoForm({
      project_id: '', vendor_id: '', rfq_bundle_id: '', po_date: '', tax_type: '', unit: '', notes: '',
    });
    setPoLineItems([]);
    setSelectedRFQId('');
    setPoCostMode('unit');
    setPoOpen(true);
  };

  // Handle RFQ selection and load line items
  const handleSelectRFQ = async (rfqId: string) => {
    setSelectedRFQId(rfqId);
    if (!rfqId) {
      setPoLineItems([]);
      setPoForm((f: any) => ({ ...f, rfq_bundle_id: '', project_id: '', vendor_id: '', unit: '' }));
      return;
    }
    const rfqBundle = await vendorProcurementService.getRFQBundleById(rfqId);
    setPoForm((f: any) => ({
      ...f,
      rfq_bundle_id: rfqBundle.id,
      project_id: rfqBundle.project_id,
      vendor_id: rfqBundle.vendor_id,
      unit: rfqBundle.items?.[0]?.unit || '',
    }));
    // Map RFQ line items to PO line items
    const items: VendorPOItemType[] = (rfqBundle.items || []).map((item, idx) => ({
      part_id: item.part_id,
      part_description: item.part_description,
      quantity: item.quantity,
      unit_cost: '',
      weight: '',
      weight_unit: item.unit || '',
      cost_per_weight: '',
      line_total: '',
      selected: true,
      notes: '',
    }));
    setPoLineItems(items);
  };

  // Handle line item field change
  const handleLineItemChange = (idx: number, field: keyof VendorPOItemType, value: any) => {
    setPoLineItems(items => {
      const updated = [...items];
      updated[idx] = { ...updated[idx], [field]: value };
      // Recalculate line total based on cost mode
      if (field === 'unit_cost' || field === 'weight' || field === 'quantity' || field === 'cost_per_weight') {
        if (poCostMode === 'weight') {
          const qty = Number(updated[idx].quantity) || 0;
          const w = Number(updated[idx].weight) || 0;
          const cpw = Number(updated[idx].cost_per_weight) || 0;
          updated[idx].line_total = String(qty * w * cpw);
        } else {
          const qty = Number(updated[idx].quantity) || 0;
          const uc = Number(updated[idx].unit_cost) || 0;
          updated[idx].line_total = String(qty * uc);
        }
      }
      return updated;
    });
  };

  // Handle cost mode toggle
  const handleCostModeChange = (mode: 'unit' | 'weight') => {
    setPoCostMode(mode);
    setPoLineItems(items => items.map(item => ({
      ...item,
      line_total: calculateLineTotal(item, mode),
    })));
  };

  // Validate and save PO
  const handleGeneratePO = async () => {
    // Validation
    if (!selectedRFQId) { alert('Please select an RFQ.'); return; }
    for (let i = 0; i < poLineItems.length; ++i) {
      const item = poLineItems[i];
      if (poCostMode === 'weight' && (!item.cost_per_weight || !item.weight || !item.quantity)) {
        alert(`Please enter all required fields for line item ${i + 1}`);
        return;
      }
      if (poCostMode === 'unit' && (!item.unit_cost || !item.quantity)) {
        alert(`Please enter all required fields for line item ${i + 1}`);
        return;
      }
    }
    try {
      const payload = {
        ...poForm,
        cost_mode: poCostMode,
        items: poLineItems.map(item => ({
          ...item,
          line_total: calculateLineTotal(item, poCostMode),
        })),
      };
      await vendorProcurementService.createVendorPurchaseOrder(payload);
      setPoOpen(false); fetchData();
    } catch (e: any) { alert(e?.response?.data?.message || 'Error generating PO'); }
  };

  /* Edit RFQ */
  const handleOpenEdit = (rfq: VendorRFQ) => {
    setEditForm({
      id: rfq.id,
      vendor_id: rfq.vendor_id,
      quoted_price: rfq.quoted_price || '',
      lead_time: rfq.lead_time || '',
      status: rfq.status || 'pending',
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      await vendorProcurementService.updateRFQ(editForm.id, {
        vendor_id: editForm.vendor_id,
        quoted_price: editForm.quoted_price,
        lead_time: editForm.lead_time,
        status: editForm.status,
      });
      setEditOpen(false);
      fetchData();
    } catch (e: any) { alert(e?.response?.data?.message || 'Error updating RFQ'); }
  };

  /* Copy RFQ: pre-fill New RFQ form */
  const handleCopyRFQ = (rfq: VendorRFQ) => {
    setRfqForm({
      project_id: rfq.project_id,
      material_id: rfq.material_id,
      vendor_id: rfq.vendor_id,
      required_quantity: rfq.required_quantity,
      unit: rfq.unit || rfq.material?.unit || '',
      quoted_price: rfq.quoted_price || '',
      lead_time: rfq.lead_time || '',
      status: 'pending',
    });
    setSuggestedVendors([]);
    setRfqOpen(true);
  };

  /* Group & filter RFQs */
  const filteredRfqs = useMemo(() => rfqs.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (projectFilter !== 'all' && r.project_id !== projectFilter) return false;
    if (vendorFilter !== 'all' && r.vendor_id !== vendorFilter) return false;
    return true;
  }), [rfqs, statusFilter, projectFilter, vendorFilter]);

  /* Unique project / vendor lists for filter dropdowns */
  const uniqueProjects = useMemo(() => {
    const map = new Map<string, string>();
    rfqs.forEach(r => { if (r.project?.project_name) map.set(r.project_id, r.project.project_name); });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [rfqs]);

  const uniqueVendors = useMemo(() => {
    const map = new Map<string, string>();
    rfqs.forEach(r => { if (r.vendor?.vendor_name) map.set(r.vendor_id, r.vendor.vendor_name); });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [rfqs]);

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014';

  /* ══ Render ══ */
  return (
    <Box sx={{ pb: 2 }}>

      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{
          width: 44, height: 44, borderRadius: T.radiusSm, bgcolor: T.primaryBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${alpha(T.primary, 0.15)}`, '& svg': { fontSize: 22, color: T.primary },
        }}>
          <CartIcon />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 20, color: T.textPrimary, letterSpacing: -0.3 }}>
            PO to Vendor
          </Typography>
          <Typography sx={{ fontSize: 13, color: T.textSecondary }}>
            Manage RFQs, compare vendor quotes, and generate purchase orders
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData}
            sx={{
              borderColor: T.border, color: T.textSecondary, borderRadius: T.radiusSm,
              textTransform: 'none', fontWeight: 600, fontSize: 13, px: 2.5, py: 1,
              '&:hover': { borderColor: T.primary, color: T.primary, bgcolor: T.primaryBg },
            }}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openRFQForm}
            sx={{
              bgcolor: T.primary, borderRadius: T.radiusSm,
              textTransform: 'none', fontWeight: 700, fontSize: 13, px: 2.5, py: 1,
              boxShadow: 'none',
              '&:hover': { bgcolor: alpha(T.primary, 0.88), boxShadow: 'none' },
            }}>
            New RFQ
          </Button>
        </Stack>
      </Box>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2.5,
          '& .MuiTabs-indicator': { bgcolor: T.primary, height: 3, borderRadius: '3px 3px 0 0' },
          '& .MuiTab-root': {
            textTransform: 'none', fontWeight: 600, fontSize: 14, color: T.textSecondary,
            minHeight: 48, px: 2.5,
            '&.Mui-selected': { color: T.primary, fontWeight: 700 },
          },
        }}>
        <Tab icon={<RFQIcon sx={{ fontSize: 18 }} />} iconPosition="start"
          label={`RFQ & Quotations (${rfqs.length})`} />
        <Tab icon={<ShipIcon sx={{ fontSize: 18 }} />} iconPosition="start"
          label={`Purchase Orders (${pos.length})`} />
      </Tabs>

      {/* ══ TAB 0: RFQ & Comparison ══ */}
      {tab === 0 && (
        <Box>
          {/* Filters Row */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5, flexWrap: 'wrap',
          }}>
            <FilterIcon sx={{ fontSize: 18, color: T.textSecondary }} />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: 13 }}>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value as string)}
                sx={{ borderRadius: T.radiusXs, fontSize: 13, bgcolor: T.white,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.primaryLight },
                }}>
                <MenuItem value="all" sx={{ fontSize: 13 }}>All Statuses</MenuItem>
                <MenuItem value="pending" sx={{ fontSize: 13 }}>Pending</MenuItem>
                <MenuItem value="quoted" sx={{ fontSize: 13 }}>Quoted</MenuItem>
                <MenuItem value="accepted" sx={{ fontSize: 13 }}>Approved</MenuItem>
                <MenuItem value="rejected" sx={{ fontSize: 13 }}>Rejected</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel sx={{ fontSize: 13 }}>Project</InputLabel>
              <Select value={projectFilter} label="Project" onChange={(e) => setProjectFilter(e.target.value as string)}
                sx={{ borderRadius: T.radiusXs, fontSize: 13, bgcolor: T.white,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.primaryLight },
                }}>
                <MenuItem value="all" sx={{ fontSize: 13 }}>All Projects</MenuItem>
                {uniqueProjects.map(p => <MenuItem key={p.id} value={p.id} sx={{ fontSize: 13 }}>{p.name}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel sx={{ fontSize: 13 }}>Vendor</InputLabel>
              <Select value={vendorFilter} label="Vendor" onChange={(e) => setVendorFilter(e.target.value as string)}
                sx={{ borderRadius: T.radiusXs, fontSize: 13, bgcolor: T.white,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.primaryLight },
                }}>
                <MenuItem value="all" sx={{ fontSize: 13 }}>All Vendors</MenuItem>
                {uniqueVendors.map(v => <MenuItem key={v.id} value={v.id} sx={{ fontSize: 13 }}>{v.name}</MenuItem>)}
              </Select>
            </FormControl>
            {(statusFilter !== 'all' || projectFilter !== 'all' || vendorFilter !== 'all') && (
              <Button size="small"
                onClick={() => { setStatusFilter('all'); setProjectFilter('all'); setVendorFilter('all'); }}
                sx={{ fontSize: 12, textTransform: 'none', color: T.danger, fontWeight: 600 }}>
                Clear Filters
              </Button>
            )}
          </Box>

          {loading ? (
            <Stack spacing={2}>
              {[0, 1].map(i => <Skeleton key={i} variant="rounded" height={160} sx={{ borderRadius: T.radius }} />)}
            </Stack>
          ) : filteredRfqs.length === 0 ? (
            /* Empty State */
            <Card elevation={0} sx={{
              borderRadius: T.radius, border: `1px solid ${T.border}`,
              boxShadow: T.shadow, textAlign: 'center', py: 4, overflow: 'hidden',
            }}>
              <Box sx={{ height: 3, bgcolor: T.primary, mb: 3, mt: -4 }} />
              <CardContent>
                <Box sx={{
                  width: 72, height: 72, borderRadius: '50%', bgcolor: T.primaryBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2.5,
                }}>
                  <RFQIcon sx={{ fontSize: 34, color: T.primaryLight }} />
                </Box>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: T.textPrimary, mb: 0.5 }}>
                  No RFQs created yet
                </Typography>
                <Typography sx={{ fontSize: 13, color: T.textSecondary, mb: 3, maxWidth: 360, mx: 'auto' }}>
                  Click "New RFQ" to request vendor quotations.
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openRFQForm}
                  sx={{
                    bgcolor: T.primary, borderRadius: T.radiusSm,
                    textTransform: 'none', fontWeight: 700, fontSize: 13, px: 3, py: 1,
                    boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd },
                  }}>
                  Create First RFQ
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card elevation={0} sx={{
              borderRadius: T.radius, border: `1px solid ${T.border}`,
              boxShadow: T.shadow, overflow: 'hidden',
            }}>
              <Box sx={{ height: 3, bgcolor: T.primary }} />
              <Box sx={{ overflow: 'auto' }}>
                <Table size="small" sx={{ minWidth: 900 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={thSx}>Material</TableCell>
                      <TableCell sx={thSx}>Project</TableCell>
                      <TableCell sx={thSx}>Qty</TableCell>
                      <TableCell sx={thSx}>Vendor</TableCell>
                      <TableCell sx={{ ...thSx, textAlign: 'right' }}>Price</TableCell>
                      <TableCell sx={{ ...thSx, textAlign: 'center' }}>Lead Time</TableCell>
                      <TableCell sx={{ ...thSx, textAlign: 'center' }}>Status</TableCell>
                      <TableCell sx={{ ...thSx, textAlign: 'center' }}>Created</TableCell>
                      <TableCell sx={{ ...thSx, textAlign: 'right' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredRfqs.map((rfq, idx) => (
                      <TableRow key={rfq.id} sx={{
                        bgcolor: idx % 2 === 0 ? T.white : T.bg,
                        '&:hover': { bgcolor: 'var(--bg-surface-2)' },
                        transition: 'background 0.15s',
                        '&:last-child td': { borderBottom: 0 },
                      }}>
                        <TableCell sx={{ ...tdSx, fontWeight: 600, color: T.textPrimary, whiteSpace: 'nowrap' }}>
                          {rfq.material?.material_name || '\u2014'}
                        </TableCell>
                        <TableCell sx={{ ...tdSx, color: T.textSecondary, whiteSpace: 'nowrap' }}>
                          {rfq.project?.project_name || '\u2014'}
                        </TableCell>
                        <TableCell sx={{ ...tdSx, whiteSpace: 'nowrap' }}>
                          {rfq.required_quantity} {rfq.unit || rfq.material?.unit || ''}
                        </TableCell>
                        <TableCell sx={{ ...tdSx, whiteSpace: 'nowrap' }}>
                          {rfq.vendor?.vendor_name || '\u2014'}
                          {rfq.is_selected && (
                            <Chip label="Selected" size="small" sx={{
                              ml: 1, height: 18, fontSize: 10, fontWeight: 700,
                              bgcolor: alpha(T.primary, 0.1), color: T.primary, borderRadius: '10px',
                            }} />
                          )}
                        </TableCell>
                        <TableCell sx={{ ...tdSx, fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {rfq.quoted_price ? `\u20B9${Number(rfq.quoted_price).toLocaleString('en-IN')}` : '\u2014'}
                        </TableCell>
                        <TableCell sx={{ ...tdSx, textAlign: 'center' }}>
                          {rfq.lead_time ? `${rfq.lead_time} day${parseInt(rfq.lead_time) !== 1 ? 's' : ''}` : '\u2014'}
                        </TableCell>
                        <TableCell sx={{ ...tdSx, textAlign: 'center' }}>
                          <StatusChip status={rfq.status} />
                        </TableCell>
                        <TableCell sx={{ ...tdSx, fontSize: 12, textAlign: 'center', color: T.textSecondary }}>
                          {fmtDate(rfq.created_at)}
                        </TableCell>
                        <TableCell align="right" sx={{ ...tdSx, whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            <Tooltip title="Edit" arrow>
                              <IconButton size="small" onClick={() => handleOpenEdit(rfq)}
                                sx={{ color: T.textSecondary, '&:hover': { color: T.info, bgcolor: T.infoBg } }}>
                                <EditIcon sx={{ fontSize: 17 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Copy" arrow>
                              <IconButton size="small" onClick={() => handleCopyRFQ(rfq)}
                                sx={{ color: T.textSecondary, '&:hover': { color: '#2A9D7E', bgcolor: '#E8F7F2' } }}>
                                <CopyIcon sx={{ fontSize: 17 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Approve" arrow>
                              <span>
                              <IconButton size="small" onClick={() => handleSelectVendor(rfq.id)}
                                disabled={rfq.is_selected}
                                sx={{ color: T.textSecondary, '&:hover': { color: T.primary, bgcolor: T.primaryBg } }}>
                                <ApproveIcon sx={{ fontSize: 17 }} />
                              </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Delete" arrow>
                              <IconButton size="small" onClick={() => handleDeleteRFQ(rfq.id)}
                                sx={{ color: T.textSecondary, '&:hover': { color: T.danger, bgcolor: T.dangerBg } }}>
                                <DeleteIcon sx={{ fontSize: 17 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Card>
          )}
        </Box>
      )}

      {/* ══ TAB 1: Purchase Orders ══ */}
      {tab === 1 && (
        <Card elevation={0} sx={{
          borderRadius: T.radius, border: `1px solid ${T.border}`,
          boxShadow: T.shadow, overflow: 'hidden',
        }}>
          <Box sx={{ height: 3, bgcolor: T.primary }} />
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            {pos.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 10 }}>
                <Box sx={{
                  width: 72, height: 72, borderRadius: '50%', bgcolor: T.primaryBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2.5,
                }}>
                  <ShipIcon sx={{ fontSize: 34, color: T.primaryLight }} />
                </Box>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: T.textPrimary, mb: 0.5 }}>
                  No purchase orders yet
                </Typography>
                <Typography sx={{ fontSize: 13, color: T.textSecondary, maxWidth: 380, mx: 'auto' }}>
                  Approve a quotation to generate a purchase order.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ overflow: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={thSx}>PO Number</TableCell>
                      <TableCell sx={thSx}>Vendor</TableCell>
                      <TableCell sx={thSx}>Material</TableCell>
                      <TableCell sx={thSx}>Project</TableCell>
                      <TableCell sx={{ ...thSx, textAlign: 'right' }}>Qty</TableCell>
                      <TableCell sx={{ ...thSx, textAlign: 'right' }}>Total</TableCell>
                      <TableCell sx={thSx}>Status</TableCell>
                      <TableCell sx={thSx}>Created</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pos.map((po, idx) => (
                      <TableRow key={po.id} sx={{
                        bgcolor: idx % 2 === 0 ? T.white : T.bg,
                        '&:hover': { bgcolor: 'var(--bg-surface-2)' },
                        transition: 'background 0.15s',
                      }}>
                        <TableCell sx={{ fontSize: 13, fontWeight: 700, color: T.primary, py: 1.5 }}>
                          {po.po_number}
                        </TableCell>
                        <TableCell sx={{ fontSize: 13, py: 1.5 }}>{po.vendor?.vendor_name || '\u2014'}</TableCell>
                        <TableCell sx={{ fontSize: 13, py: 1.5 }}>{po.material?.material_name || '\u2014'}</TableCell>
                        <TableCell sx={{ fontSize: 13, py: 1.5 }}>{po.project?.project_name || '\u2014'}</TableCell>
                        <TableCell sx={{ fontSize: 13, textAlign: 'right', py: 1.5 }}>{po.quantity} {po.unit}</TableCell>
                        <TableCell sx={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, textAlign: 'right', py: 1.5 }}>
                          {`${'\u20B9'}${Number(po.total_price).toLocaleString('en-IN')}`}
                        </TableCell>
                        <TableCell sx={{ py: 1.5 }}><StatusChip status={po.status} /></TableCell>
                        <TableCell sx={{ fontSize: 12, color: T.textSecondary, py: 1.5 }}>
                          {fmtDate(po.created_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* ══ NEW RFQ MODAL ══ */}
      <Dialog open={rfqOpen} onClose={() => setRfqOpen(false)} maxWidth="sm" fullWidth
        TransitionComponent={Fade}
        PaperProps={{ sx: { borderRadius: T.radius, boxShadow: T.shadowLg, maxWidth: 560, overflow: 'hidden' } }}>
        <Box sx={{ height: 4, bgcolor: T.primary }} />
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 2.5, pb: 2, borderBottom: `1px solid ${T.border}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: T.radiusXs, bgcolor: T.primaryBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${alpha(T.primary, 0.15)}`,
              '& svg': { fontSize: 18, color: T.primary },
            }}>
              <RFQIcon />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 17, color: T.textPrimary, lineHeight: 1.2 }}>
                New Vendor Quotation Request
              </Typography>
              <Typography sx={{ fontSize: 12, color: T.textSecondary }}>
                Fill in the details to send an RFQ
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setRfqOpen(false)}
            sx={{ color: T.textSecondary, '&:hover': { bgcolor: T.bg } }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ px: 3, pt: 0, pb: 1 }}>
          <Stack spacing={2.5} sx={{ mt: 3 }}>
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>Project *</InputLabel>
              <Select value={rfqForm.project_id || ''} label="Project *"
                MenuProps={{ PaperProps: { sx: { borderRadius: T.radiusXs, boxShadow: T.shadowMd } } }}
                onChange={(e: SelectChangeEvent) => setRfqForm((f: any) => ({ ...f, project_id: e.target.value }))}>
                {projects.map((p: any) => (
                  <MenuItem key={p.id} value={p.id} sx={{ fontSize: 13, py: 1 }}>{p.project_name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>Material *</InputLabel>
              <Select value={rfqForm.material_id || ''} label="Material *"
                MenuProps={{ PaperProps: { sx: { borderRadius: T.radiusXs, boxShadow: T.shadowMd } } }}
                onChange={(e: SelectChangeEvent) => handleMaterialChange(e.target.value)}>
                {materials.map(m => (
                  <MenuItem key={m.id} value={m.id} sx={{ fontSize: 13, py: 1 }}>
                    {m.material_name} ({m.unit})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {suggestedVendors.length > 0 && (
              <Box sx={{
                p: 2, borderRadius: T.radiusXs, bgcolor: T.primaryBg,
                border: `1px solid ${alpha(T.primary, 0.12)}`,
              }}>
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: T.primary, mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Suggested Vendors
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {suggestedVendors.map((v: any) => (
                    <Chip key={v.id} label={v.vendor_name} size="small" clickable
                      onClick={() => setRfqForm((f: any) => ({ ...f, vendor_id: v.id }))}
                      sx={{
                        fontSize: 12, fontWeight: 600, borderRadius: '6px', height: 28,
                        ...(rfqForm.vendor_id === v.id
                          ? { bgcolor: T.primary, color: T.white }
                          : { bgcolor: T.white, color: T.textPrimary, border: `1px solid ${T.border}`,
                              '&:hover': { borderColor: T.primary, bgcolor: T.primaryBg } }),
                        transition: 'all 0.15s',
                      }}
                    />
                  ))}
                </Box>
              </Box>
            )}

            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>Vendor *</InputLabel>
              <Select value={rfqForm.vendor_id || ''} label="Vendor *"
                MenuProps={{ PaperProps: { sx: { borderRadius: T.radiusXs, boxShadow: T.shadowMd } } }}
                onChange={(e: SelectChangeEvent) => setRfqForm((f: any) => ({ ...f, vendor_id: e.target.value }))}>
                {vendors.map((v: any) => (
                  <MenuItem key={v.id} value={v.id} sx={{ fontSize: 13, py: 1 }}>{v.vendor_name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField fullWidth size="small" label="Required Quantity *" type="number" sx={inputSx}
                value={rfqForm.required_quantity || ''}
                onChange={e => setRfqForm((f: any) => ({ ...f, required_quantity: e.target.value }))}
              />
              <TextField sx={{ ...inputSx, width: 160 }} size="small" label="Unit"
                value={rfqForm.unit || ''}
                onChange={e => setRfqForm((f: any) => ({ ...f, unit: e.target.value }))}
                InputProps={{
                  readOnly: !!rfqForm.material_id,
                  sx: rfqForm.material_id ? { bgcolor: T.bg } : {},
                }}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField fullWidth size="small" label="Quoted Price" type="number" sx={inputSx}
                value={rfqForm.quoted_price || ''}
                onChange={e => setRfqForm((f: any) => ({ ...f, quoted_price: e.target.value }))}
                InputProps={{
                  startAdornment: <InputAdornment position="start" sx={{ '& .MuiTypography-root': { color: T.textSecondary, fontSize: 14 } }}>{'\u20B9'}</InputAdornment>,
                }}
              />
              <TextField fullWidth size="small" label="Lead Time" sx={inputSx}
                placeholder="Enter Value"
                value={rfqForm.lead_time || ''}
                onChange={e => setRfqForm((f: any) => ({ ...f, lead_time: e.target.value }))}
                InputProps={{
                  endAdornment: <InputAdornment position="end" sx={{ '& .MuiTypography-root': { color: T.textSecondary, fontSize: 12 } }}>days</InputAdornment>,
                }}
              />
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2.5, borderTop: `1px solid ${T.border}`, gap: 1.5 }}>
          <Button onClick={() => setRfqOpen(false)}
            sx={{ borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 600, fontSize: 13, color: T.textSecondary, px: 2.5, '&:hover': { bgcolor: T.bg } }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreateRFQ}
            sx={{ bgcolor: T.primary, borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 700, fontSize: 13, px: 3, boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd } }}>
            Create RFQ
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══ EDIT RFQ MODAL ══ */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth
        TransitionComponent={Fade}
        PaperProps={{ sx: { borderRadius: T.radius, boxShadow: T.shadowLg, maxWidth: 480, overflow: 'hidden' } }}>
        <Box sx={{ height: 4, bgcolor: T.primary }} />
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 2.5, pb: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: T.radiusXs, bgcolor: T.primaryBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${alpha(T.primary, 0.15)}`,
              '& svg': { fontSize: 18, color: T.primary },
            }}>
              <EditIcon />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 17, color: T.textPrimary, lineHeight: 1.2 }}>
                Edit RFQ
              </Typography>
              <Typography sx={{ fontSize: 12, color: T.textSecondary }}>
                Update vendor quotation details
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setEditOpen(false)}
            sx={{ color: T.textSecondary, '&:hover': { bgcolor: T.bg } }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ px: 3, pt: 3, pb: 1 }}>
          <Stack spacing={2.5}>
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>Vendor</InputLabel>
              <Select value={editForm.vendor_id || ''} label="Vendor"
                MenuProps={{ PaperProps: { sx: { borderRadius: T.radiusXs, boxShadow: T.shadowMd } } }}
                onChange={(e: SelectChangeEvent) => setEditForm((f: any) => ({ ...f, vendor_id: e.target.value }))}>
                {vendors.map((v: any) => (
                  <MenuItem key={v.id} value={v.id} sx={{ fontSize: 13, py: 1 }}>{v.vendor_name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField fullWidth size="small" label="Quoted Price" type="number" sx={inputSx}
              value={editForm.quoted_price || ''}
              onChange={e => setEditForm((f: any) => ({ ...f, quoted_price: e.target.value }))}
              InputProps={{
                startAdornment: <InputAdornment position="start" sx={{ '& .MuiTypography-root': { color: T.textSecondary, fontSize: 14 } }}>{'\u20B9'}</InputAdornment>,
              }}
            />

            <TextField fullWidth size="small" label="Lead Time" sx={inputSx}
              placeholder="Enter Value"
              value={editForm.lead_time || ''}
              onChange={e => setEditForm((f: any) => ({ ...f, lead_time: e.target.value }))}
              InputProps={{
                endAdornment: <InputAdornment position="end" sx={{ '& .MuiTypography-root': { color: T.textSecondary, fontSize: 12 } }}>days</InputAdornment>,
              }}
            />

            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>Status</InputLabel>
              <Select value={editForm.status || 'pending'} label="Status"
                MenuProps={{ PaperProps: { sx: { borderRadius: T.radiusXs, boxShadow: T.shadowMd } } }}
                onChange={(e: SelectChangeEvent) => setEditForm((f: any) => ({ ...f, status: e.target.value }))}>
                <MenuItem value="pending" sx={{ fontSize: 13 }}>Pending</MenuItem>
                <MenuItem value="quoted" sx={{ fontSize: 13 }}>Quoted</MenuItem>
                <MenuItem value="accepted" sx={{ fontSize: 13 }}>Approved</MenuItem>
                <MenuItem value="rejected" sx={{ fontSize: 13 }}>Rejected</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2.5, borderTop: `1px solid ${T.border}`, gap: 1.5 }}>
          <Button onClick={() => setEditOpen(false)}
            sx={{ borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 600, fontSize: 13, color: T.textSecondary, px: 2.5, '&:hover': { bgcolor: T.bg } }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSaveEdit}
            sx={{ bgcolor: T.primary, borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 700, fontSize: 13, px: 3, boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd } }}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══ GENERATE PO MODAL ══ */}
      {/* ══ GENERATE PO MODAL (MULTI-LINE) ══ */}
      <Dialog open={poOpen} onClose={() => setPoOpen(false)} maxWidth="md" fullWidth
        TransitionComponent={Fade}
        PaperProps={{ sx: { borderRadius: T.radius, boxShadow: T.shadowLg, maxWidth: 900, overflow: 'hidden' } }}>
        <Box sx={{ height: 4, bgcolor: T.primary }} />
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 2.5, pb: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: T.radiusXs, bgcolor: T.primaryBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${alpha(T.primary, 0.15)}`,
              '& svg': { fontSize: 18, color: T.primary },
            }}>
              <ShipIcon />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 17, color: T.textPrimary, lineHeight: 1.2 }}>
                Create New Purchase Order
              </Typography>
              <Typography sx={{ fontSize: 12, color: T.textSecondary }}>
                Select an RFQ to load line items and enter per-line costs
              </Typography>
            </Box>
          </Box>
          <IconButton size="small" onClick={() => setPoOpen(false)}
            sx={{ color: T.textSecondary, '&:hover': { bgcolor: T.bg } }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ px: 3, pt: 3, pb: 1 }}>
          <Stack spacing={2.5}>
            {/* PO Header Fields */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField size="small" label="PO Number" sx={inputSx} value={poForm.po_number || ''} InputProps={{ readOnly: true }} fullWidth />
              <TextField size="small" label="PO Date" type="date" sx={inputSx} value={poForm.po_date || ''} onChange={e => setPoForm((f: any) => ({ ...f, po_date: e.target.value }))} InputLabelProps={{ shrink: true }} />
              <TextField size="small" label="Tax" sx={inputSx} value={poForm.tax_type || ''} onChange={e => setPoForm((f: any) => ({ ...f, tax_type: e.target.value }))} fullWidth />
              <TextField size="small" label="Unit" sx={inputSx} value={poForm.unit || ''} InputProps={{ readOnly: true }} fullWidth />
              <FormControl size="small" sx={{ minWidth: 220, ...inputSx }}>
                <InputLabel>Select RFQ (Sent only)</InputLabel>
                <Select value={selectedRFQId} label="Select RFQ (Sent only)" onChange={e => handleSelectRFQ(e.target.value)}>
                  <MenuItem value="">-- Select --</MenuItem>
                  {poRFQs.map(rfq => (
                    <MenuItem key={rfq.id} value={rfq.id}>{rfq.rfq_number} ({rfq.vendor?.vendor_name})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* Cost Mode Toggle */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography fontSize={12} fontWeight={600} color={T.textSecondary}>Cost Mode:</Typography>
              <Box sx={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
                {(['unit', 'weight'] as const).map(mode => (
                  <Box key={mode} onClick={() => handleCostModeChange(mode)}
                    sx={{ px: 2, py: 0.5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      bgcolor: poCostMode === mode ? T.primary : 'transparent',
                      color: poCostMode === mode ? '#fff' : T.textSecondary,
                      transition: 'all 0.2s',
                      '&:hover': { bgcolor: poCostMode === mode ? T.primary : alpha(T.primary, 0.05) } }}>
                    {mode === 'unit' ? 'Cost/Unit' : 'Cost/Weight (kg or lbs)'}
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Line Items Table */}
            {poLineItems.length > 0 && (
            <Box sx={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radiusXs }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={thSx}>S.No</TableCell>
                    <TableCell sx={thSx}>Description</TableCell>
                    <TableCell sx={thSx}>Quantity</TableCell>
                    {poCostMode === 'weight' && (
                      <TableCell sx={thSx}>Unit Weight (KG)</TableCell>
                    )}
                    <TableCell sx={thSx}>{poCostMode === 'unit' ? 'Unit Cost' : 'Cost per KG'}</TableCell>
                    <TableCell sx={thSx}>Line Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {poLineItems.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={tdSx}>{idx + 1}</TableCell>
                      <TableCell sx={tdSx}>{item.part_description || '\u2014'}</TableCell>
                      <TableCell sx={tdSx}>
                        <TextField size="small" type="number" sx={{ width: 120 }}
                          value={item.quantity || ''}
                          onChange={e => handleLineItemChange(idx, 'quantity', e.target.value)}
                        />
                      </TableCell>
                      {poCostMode === 'weight' && (
                        <TableCell sx={tdSx}>
                          <TextField size="small" type="number" sx={{ width: 120 }}
                            value={item.weight || ''}
                            onChange={e => handleLineItemChange(idx, 'weight', e.target.value)}
                          />
                        </TableCell>
                      )}
                      <TableCell sx={tdSx}>
                        {poCostMode === 'unit' ? (
                          <TextField size="small" type="number" sx={{ width: 120 }}
                            value={item.unit_cost || ''}
                            onChange={e => handleLineItemChange(idx, 'unit_cost', e.target.value)}
                          />
                        ) : (
                          <TextField size="small" type="number" sx={{ width: 120 }}
                            value={item.cost_per_weight || ''}
                            onChange={e => handleLineItemChange(idx, 'cost_per_weight', e.target.value)}
                          />
                        )}
                      </TableCell>
                      <TableCell sx={{ ...tdSx, fontWeight: 600, color: T.primary }}>
                        {poCostMode === 'unit'
                          ? ((Number(item.quantity) || 0) * (Number(item.unit_cost) || 0)).toLocaleString('en-IN') || '\u2014'
                          : ((Number(item.quantity) || 0) * (Number(item.weight) || 0) * (Number(item.cost_per_weight) || 0)).toLocaleString('en-IN') || '\u2014'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            )}

            {/* Notes */}
            <TextField fullWidth size="small" label="Notes" multiline minRows={2} sx={inputSx}
              value={poForm.notes || ''}
              onChange={e => setPoForm((f: any) => ({ ...f, notes: e.target.value }))}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2.5, borderTop: `1px solid ${T.border}`, gap: 1.5 }}>
          <Button onClick={() => setPoOpen(false)}
            sx={{ borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 600, fontSize: 13, color: T.textSecondary, px: 2.5, '&:hover': { bgcolor: T.bg } }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleGeneratePO}
            sx={{ bgcolor: T.primary, borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 700, fontSize: 13, px: 3, boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd } }}>
            Save as Draft
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VendorProcurementPage;
