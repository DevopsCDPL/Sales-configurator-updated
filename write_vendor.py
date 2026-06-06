import os

fp = os.path.join(os.path.dirname(__file__), 'frontend', 'src', 'pages', 'VendorProcurementPage.tsx')
BT = chr(96)

content = r"""import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Inventory2 as InventoryIcon,
  Close as CloseIcon,
  Assignment as AssignmentIcon,
  FilterList as FilterIcon,
  TrendingDown as LowPriceIcon,
  Speed as LeadIcon,
  People as VendorsIcon,
  CalendarToday as DateIcon,
} from '@mui/icons-material';
import { vendorProcurementService } from '../services/vendorProcurementService';
import { materialService } from '../services/materialService';
import { VendorRFQ, VendorPO, Material } from '../types';
import api from '../services/api';

/* ══════ Design Tokens ══════ */
const T = {
  primary:      '#1F7A63',
  primaryLight: '#2A9D7E',
  primaryBg:    '#F0FAF7',
  dark:         '#1F2937',
  textPrimary:  '#1F2937',
  textSecondary:'#6B7280',
  border:       '#E5E7EB',
  bg:           '#FAFBFC',
  white:        '#ffffff',
  danger:       '#EF4444',
  dangerBg:     '#fef2f2',
  warning:      '#F59E0B',
  warningBg:    '#FFFBEB',
  success:      '#16A34A',
  successBg:    '#F0FAF7',
  info:         '#3B82F6',
  infoBg:       '#EFF6FF',
  radius:       '14px',
  radiusSm:     '10px',
  radiusXs:     '8px',
  shadow:       '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
  shadowMd:     '0 4px 12px rgba(0,0,0,0.06)',
  shadowLg:     '0 8px 24px rgba(0,0,0,0.08)',
  gradient:     'linear-gradient(135deg, #1F7A63 0%, #2A9D7E 100%)',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: T.radiusXs,
    backgroundColor: T.white,
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.primaryLight },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.primary, borderWidth: 2 },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: T.primary },
};

const STATUS_BADGE: Record<string, { color: string; bg: string; label: string }> = {
  pending:    { color: '#92400E', bg: '#FFFBEB', label: 'Pending' },
  quoted:     { color: '#1E40AF', bg: '#EFF6FF', label: 'Quoted' },
  accepted:   { color: '#166354', bg: '#F0FAF7', label: 'Approved' },
  rejected:   { color: '#991B1B', bg: '#FEF2F2', label: 'Rejected' },
  draft:      { color: '#6B7280', bg: '#F3F4F6', label: 'Draft' },
  sent:       { color: '#1E40AF', bg: '#EFF6FF', label: 'Sent' },
  acknowledged: { color: '#6D28D9', bg: '#F5F3FF', label: 'Acknowledged' },
  delivered:  { color: '#166354', bg: '#F0FAF7', label: 'Delivered' },
  cancelled:  { color: '#991B1B', bg: '#FEF2F2', label: 'Cancelled' },
};

const thSx = {
  fontWeight: 700, fontSize: 11, color: T.textSecondary, textTransform: 'uppercase' as const,
  letterSpacing: 0.6, py: 1.5, borderBottom: BTICK2px solid ${T.border}BTICK,
  bgcolor: T.bg,
};

/* ══ StatusChip ══ */
const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const badge = STATUS_BADGE[status] || { color: '#6B7280', bg: '#F3F4F6', label: status };
  return (
    <Chip label={badge.label} size="small" sx={{
      height: 22, fontSize: 11, fontWeight: 700, borderRadius: '6px',
      bgcolor: badge.bg, color: badge.color,
      border: BTICK1px solid ${alpha(badge.color, 0.15)}BTICK,
    }} />
  );
};

/* ══ SummaryPill ══ */
const SummaryPill: React.FC<{ icon: React.ReactElement; label: string; value: string; color?: string }> = ({ icon, label, value, color = T.primary }) => (
  <Box sx={{
    display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.7,
    bgcolor: alpha(color, 0.05), borderRadius: T.radiusXs,
    border: BTICK1px solid ${alpha(color, 0.12)}BTICK,
  }}>
    {React.cloneElement(icon, { sx: { fontSize: 15, color } })}
    <Box>
      <Typography sx={{ fontSize: 10, color: T.textSecondary, fontWeight: 600, lineHeight: 1, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</Typography>
      <Typography sx={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.3 }}>{value}</Typography>
    </Box>
  </Box>
);

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

  /* PO form */
  const [poOpen, setPoOpen] = useState(false);
  const [poForm, setPoForm] = useState<any>({});

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
    try { await vendorProcurementService.createRFQ(rfqForm); setRfqOpen(false); fetchData(); }
    catch (e: any) { alert(e?.response?.data?.message || 'Error creating RFQ'); }
  };

  const handleSelectVendor = async (rfqId: string) => { await vendorProcurementService.selectVendor(rfqId); fetchData(); };
  const handleDeleteRFQ = async (rfqId: string) => { await vendorProcurementService.deleteRFQ(rfqId); fetchData(); };

  const openPOForm = (rfq?: VendorRFQ) => {
    setPoForm({
      project_id: rfq?.project_id || '', vendor_id: rfq?.vendor_id || '',
      material_id: rfq?.material_id || '', rfq_id: rfq?.id || '',
      quantity: rfq?.required_quantity || '', unit: rfq?.unit || rfq?.material?.unit || '',
      unit_price: rfq?.quoted_price || '',
      total_price: (Number(rfq?.required_quantity || 0) * Number(rfq?.quoted_price || 0)) || '',
      delivery_date: '', payment_terms: '', notes: '',
    });
    setPoOpen(true);
  };

  const handleGeneratePO = async () => {
    try {
      const total = Number(poForm.quantity || 0) * Number(poForm.unit_price || 0);
      await vendorProcurementService.generatePO({ ...poForm, total_price: total });
      setPoOpen(false); fetchData();
    } catch (e: any) { alert(e?.response?.data?.message || 'Error generating PO'); }
  };

  /* Group & filter RFQs */
  const filteredRfqs = useMemo(() => rfqs.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (projectFilter !== 'all' && r.project_id !== projectFilter) return false;
    if (vendorFilter !== 'all' && r.vendor_id !== vendorFilter) return false;
    return true;
  }), [rfqs, statusFilter, projectFilter, vendorFilter]);

  const rfqGroups: Record<string, VendorRFQ[]> = useMemo(() => {
    const g: Record<string, VendorRFQ[]> = {};
    filteredRfqs.forEach(r => { const k = BTICK${r.project_id}__${r.material_id}BTICK; if (!g[k]) g[k] = []; g[k].push(r); });
    return g;
  }, [filteredRfqs]);

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
          width: 48, height: 48, borderRadius: T.radius, background: T.gradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(31,122,99,0.18)', '& svg': { fontSize: 26, color: T.white },
        }}>
          <CartIcon />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 22, color: T.textPrimary, letterSpacing: -0.3 }}>
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
              background: T.gradient, borderRadius: T.radiusSm,
              textTransform: 'none', fontWeight: 700, fontSize: 13, px: 2.5, py: 1,
              boxShadow: '0 4px 14px rgba(31,122,99,0.15)',
              '&:hover': { boxShadow: '0 6px 20px rgba(31,122,99,0.25)', transform: 'translateY(-1px)' },
            }}>
            New RFQ
          </Button>
        </Stack>
      </Box>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2.5,
          '& .MuiTabs-indicator': { background: T.gradient, height: 3, borderRadius: '3px 3px 0 0' },
          '& .MuiTab-root': {
            textTransform: 'none', fontWeight: 600, fontSize: 14, color: T.textSecondary,
            minHeight: 48, px: 2.5,
            '&.Mui-selected': { color: T.primary, fontWeight: 700 },
          },
        }}>
        <Tab icon={<RFQIcon sx={{ fontSize: 18 }} />} iconPosition="start"
          label={BTICKRFQ & Quotations (${rfqs.length})BTICK} />
        <Tab icon={<ShipIcon sx={{ fontSize: 18 }} />} iconPosition="start"
          label={BTICKPurchase Orders (${pos.length})BTICK} />
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
          ) : Object.keys(rfqGroups).length === 0 ? (
            /* Empty State */
            <Card elevation={0} sx={{
              borderRadius: T.radius, border: BTICK1px solid ${T.border}BTICK,
              boxShadow: T.shadow, textAlign: 'center', py: 8, overflow: 'hidden',
            }}>
              <Box sx={{ height: 3, background: T.gradient, mb: 5, mt: -8 }} />
              <CardContent>
                <Box sx={{
                  width: 72, height: 72, borderRadius: '50%', bgcolor: T.primaryBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2.5,
                }}>
                  <RFQIcon sx={{ fontSize: 34, color: T.primaryLight }} />
                </Box>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: T.textPrimary, mb: 0.5 }}>
                  No vendor quotation requests yet
                </Typography>
                <Typography sx={{ fontSize: 13, color: T.textSecondary, mb: 3, maxWidth: 360, mx: 'auto' }}>
                  Create your first RFQ to start comparing vendor quotes and generating purchase orders.
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openRFQForm}
                  sx={{
                    background: T.gradient, borderRadius: T.radiusSm,
                    textTransform: 'none', fontWeight: 700, fontSize: 13, px: 3, py: 1,
                    boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd },
                  }}>
                  Create First RFQ
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={2.5}>
              {Object.entries(rfqGroups).map(([key, group]) => {
                const first = group[0];
                const prices = group.filter(r => r.quoted_price).map(r => Number(r.quoted_price));
                const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
                const leadTimes = group.filter(r => r.lead_time).map(r => parseInt(r.lead_time || '0', 10)).filter(n => n > 0);
                const bestLeadTime = leadTimes.length > 0 ? Math.min(...leadTimes) : null;
                const hasApproved = group.some(r => r.is_selected && r.status === 'accepted');

                return (
                  <Card key={key} elevation={0} sx={{
                    borderRadius: T.radius, bgcolor: T.white,
                    boxShadow: T.shadow, overflow: 'hidden',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                    '&:hover': { boxShadow: T.shadowMd },
                  }}>
                    {/* Thin top accent */}
                    <Box sx={{ height: 3, background: T.gradient }} />

                    <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                      {/* Card Header: Material info + Generate PO */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                          <Box sx={{
                            width: 40, height: 40, borderRadius: T.radiusXs, background: T.gradient,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            '& svg': { fontSize: 20, color: T.white },
                          }}>
                            <InventoryIcon />
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, lineHeight: 1.3 }}>
                              {first.material?.material_name || 'Material'}
                            </Typography>
                            <Stack spacing={0.4} sx={{ mt: 0.5 }}>
                              <Typography sx={{ fontSize: 12, color: T.textSecondary }}>
                                <Box component="span" sx={{ fontWeight: 600, color: T.textSecondary }}>Project:</Box>{' '}
                                {first.project?.project_name || '\u2014'}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: T.textSecondary }}>
                                <Box component="span" sx={{ fontWeight: 600, color: T.textSecondary }}>Quantity:</Box>{' '}
                                {first.required_quantity} {first.unit || first.material?.unit}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: T.textSecondary }}>
                                <Box component="span" sx={{ fontWeight: 600, color: T.textSecondary }}>Vendors Requested:</Box>{' '}
                                {group.length}
                              </Typography>
                            </Stack>
                          </Box>
                        </Box>
                        {hasApproved && (
                          <Button size="small" variant="contained" startIcon={<AssignmentIcon />}
                            onClick={() => openPOForm(group.find(r => r.is_selected)!)}
                            sx={{
                              background: T.gradient, borderRadius: T.radiusXs,
                              textTransform: 'none', fontWeight: 700, fontSize: 12, px: 2,
                              boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd },
                            }}>
                            Generate PO
                          </Button>
                        )}
                      </Box>

                      {/* Summary Indicators */}
                      <Box sx={{ display: 'flex', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
                        {lowestPrice !== null && (
                          <SummaryPill icon={<LowPriceIcon />} label="Lowest Quote"
                            value={BTICK${'\u20B9'}${lowestPrice.toLocaleString('en-IN')}BTICK}
                            color={T.primary} />
                        )}
                        {bestLeadTime !== null && (
                          <SummaryPill icon={<LeadIcon />} label="Best Lead Time"
                            value={BTICK${bestLeadTime} day${bestLeadTime !== 1 ? 's' : ''}BTICK}
                            color={T.info} />
                        )}
                        <SummaryPill icon={<VendorsIcon />} label="Vendors"
                          value={String(group.length)} color="#8B5CF6" />
                        <SummaryPill icon={<DateIcon />} label="Created"
                          value={fmtDate(first.created_at)} color={T.textSecondary} />
                      </Box>

                      {/* Vendor Comparison Table */}
                      <Box sx={{ borderRadius: T.radiusSm, border: BTICK1px solid ${T.border}BTICK, overflow: 'hidden' }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={thSx}>Vendor</TableCell>
                              <TableCell sx={{ ...thSx, textAlign: 'right' }}>Quoted Price</TableCell>
                              <TableCell sx={thSx}>Lead Time</TableCell>
                              <TableCell sx={thSx}>Status</TableCell>
                              <TableCell sx={{ ...thSx, textAlign: 'right' }}>Created</TableCell>
                              <TableCell sx={{ ...thSx, textAlign: 'center' }}>Actions</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {group.map((rfq, idx) => {
                              const isLowest = lowestPrice !== null && Number(rfq.quoted_price) === lowestPrice && prices.length > 1;
                              return (
                                <TableRow key={rfq.id} sx={{
                                  bgcolor: rfq.is_selected ? T.primaryBg : (idx % 2 === 0 ? T.white : T.bg),
                                  '&:hover': { bgcolor: rfq.is_selected ? alpha(T.primary, 0.08) : alpha(T.primary, 0.02) },
                                  transition: 'background 0.15s',
                                }}>
                                  <TableCell sx={{ fontSize: 13, fontWeight: rfq.is_selected ? 600 : 400, py: 1.5, whiteSpace: 'nowrap' }}>
                                    {rfq.vendor?.vendor_name || '\u2014'}
                                    {rfq.is_selected && (
                                      <Chip label="Selected" size="small" sx={{
                                        ml: 1, height: 18, fontSize: 10, fontWeight: 700,
                                        bgcolor: alpha(T.primary, 0.1), color: T.primary, borderRadius: '4px',
                                      }} />
                                    )}
                                  </TableCell>
                                  <TableCell sx={{ fontSize: 13, fontWeight: 600, textAlign: 'right', py: 1.5, whiteSpace: 'nowrap' }}>
                                    {rfq.quoted_price ? (
                                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                        {BTICK${'\u20B9'}${Number(rfq.quoted_price).toLocaleString('en-IN')}BTICK}
                                        {isLowest && (
                                          <Chip label="Lowest" size="small" sx={{
                                            height: 16, fontSize: 9, fontWeight: 700,
                                            bgcolor: alpha(T.primary, 0.1), color: T.primary, borderRadius: '4px',
                                          }} />
                                        )}
                                      </Box>
                                    ) : '\u2014'}
                                  </TableCell>
                                  <TableCell sx={{ fontSize: 13, py: 1.5 }}>
                                    {rfq.lead_time ? BTICK${rfq.lead_time} day${parseInt(rfq.lead_time) !== 1 ? 's' : ''}BTICK : '\u2014'}
                                  </TableCell>
                                  <TableCell sx={{ py: 1.5 }}>
                                    <StatusChip status={rfq.status} />
                                  </TableCell>
                                  <TableCell sx={{ fontSize: 12, textAlign: 'right', color: T.textSecondary, py: 1.5 }}>
                                    {fmtDate(rfq.created_at)}
                                  </TableCell>
                                  <TableCell align="center" sx={{ py: 1.5, whiteSpace: 'nowrap' }}>
                                    <Tooltip title="Approve Quotation" arrow>
                                      <span>
                                      <IconButton size="small" onClick={() => handleSelectVendor(rfq.id)}
                                        disabled={rfq.is_selected}
                                        sx={{ color: T.textSecondary, '&:hover': { color: T.primary, bgcolor: T.primaryBg } }}>
                                        <ApproveIcon sx={{ fontSize: 18 }} />
                                      </IconButton>
                                      </span>
                                    </Tooltip>
                                    <Tooltip title="Delete Quotation" arrow>
                                      <IconButton size="small" onClick={() => handleDeleteRFQ(rfq.id)}
                                        sx={{ color: T.textSecondary, '&:hover': { color: T.danger, bgcolor: T.dangerBg } }}>
                                        <DeleteIcon sx={{ fontSize: 18 }} />
                                      </IconButton>
                                    </Tooltip>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Box>
      )}

      {/* ══ TAB 1: Purchase Orders ══ */}
      {tab === 1 && (
        <Card elevation={0} sx={{
          borderRadius: T.radius, border: BTICK1px solid ${T.border}BTICK,
          boxShadow: T.shadow, overflow: 'hidden',
        }}>
          <Box sx={{ height: 3, background: T.gradient }} />
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
                        '&:hover': { bgcolor: alpha(T.primary, 0.02) },
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
                          {BTICK${'\u20B9'}${Number(po.total_price).toLocaleString('en-IN')}BTICK}
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
        <Box sx={{ height: 4, background: T.gradient }} />
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 2.5, pb: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: T.radiusXs, background: T.gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              '& svg': { fontSize: 18, color: T.white },
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

        <DialogContent sx={{ px: 3, pt: 3, pb: 1 }}>
          <Stack spacing={2.5}>
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
                border: BTICK1px solid ${alpha(T.primary, 0.12)}BTICK,
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
                          : { bgcolor: T.white, color: T.textPrimary, border: BTICK1px solid ${T.border}BTICK,
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
                placeholder="e.g. 5"
                value={rfqForm.lead_time || ''}
                onChange={e => setRfqForm((f: any) => ({ ...f, lead_time: e.target.value }))}
                InputProps={{
                  endAdornment: <InputAdornment position="end" sx={{ '& .MuiTypography-root': { color: T.textSecondary, fontSize: 12 } }}>days</InputAdornment>,
                }}
              />
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2.5, borderTop: BTICK1px solid ${T.border}BTICK, gap: 1.5 }}>
          <Button onClick={() => setRfqOpen(false)}
            sx={{ borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 600, fontSize: 13, color: T.textSecondary, px: 2.5, '&:hover': { bgcolor: T.bg } }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreateRFQ}
            sx={{ background: T.gradient, borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 700, fontSize: 13, px: 3, boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd } }}>
            Create RFQ
          </Button>
        </DialogActions>
      </Dialog>

      {/* ══ GENERATE PO MODAL ══ */}
      <Dialog open={poOpen} onClose={() => setPoOpen(false)} maxWidth="sm" fullWidth
        TransitionComponent={Fade}
        PaperProps={{ sx: { borderRadius: T.radius, boxShadow: T.shadowLg, maxWidth: 560, overflow: 'hidden' } }}>
        <Box sx={{ height: 4, background: T.gradient }} />
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 2.5, pb: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: T.radiusXs, background: T.gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              '& svg': { fontSize: 18, color: T.white },
            }}>
              <ShipIcon />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 17, color: T.textPrimary, lineHeight: 1.2 }}>
                Generate Vendor Purchase Order
              </Typography>
              <Typography sx={{ fontSize: 12, color: T.textSecondary }}>
                Review and confirm order details
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
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField fullWidth size="small" label="Quantity" type="number" sx={inputSx}
                value={poForm.quantity || ''}
                onChange={e => setPoForm((f: any) => ({ ...f, quantity: e.target.value }))}
              />
              <TextField sx={{ ...inputSx, width: 160 }} size="small" label="Unit"
                value={poForm.unit || ''}
                onChange={e => setPoForm((f: any) => ({ ...f, unit: e.target.value }))}
              />
            </Box>

            <TextField fullWidth size="small" label="Unit Price" type="number" sx={inputSx}
              value={poForm.unit_price || ''}
              onChange={e => setPoForm((f: any) => ({ ...f, unit_price: e.target.value }))}
              InputProps={{
                startAdornment: <InputAdornment position="start" sx={{ '& .MuiTypography-root': { color: T.textSecondary, fontSize: 14 } }}>{'\u20B9'}</InputAdornment>,
              }}
            />

            <Box sx={{
              p: 2, borderRadius: T.radiusXs, bgcolor: T.primaryBg,
              border: BTICK1px solid ${alpha(T.primary, 0.12)}BTICK,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.textSecondary }}>Total Price</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 800, color: T.primary }}>
                {BTICK${'\u20B9'}${(Number(poForm.quantity || 0) * Number(poForm.unit_price || 0)).toLocaleString('en-IN')}BTICK}
              </Typography>
            </Box>

            <TextField fullWidth size="small" label="Delivery Date" type="date" sx={inputSx}
              value={poForm.delivery_date || ''}
              onChange={e => setPoForm((f: any) => ({ ...f, delivery_date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />

            <TextField fullWidth size="small" label="Payment Terms" sx={inputSx}
              value={poForm.payment_terms || ''}
              onChange={e => setPoForm((f: any) => ({ ...f, payment_terms: e.target.value }))}
            />

            <TextField fullWidth size="small" label="Notes" multiline minRows={2} sx={inputSx}
              value={poForm.notes || ''}
              onChange={e => setPoForm((f: any) => ({ ...f, notes: e.target.value }))}
            />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2.5, borderTop: BTICK1px solid ${T.border}BTICK, gap: 1.5 }}>
          <Button onClick={() => setPoOpen(false)}
            sx={{ borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 600, fontSize: 13, color: T.textSecondary, px: 2.5, '&:hover': { bgcolor: T.bg } }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleGeneratePO}
            sx={{ background: T.gradient, borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 700, fontSize: 13, px: 3, boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd } }}>
            Generate PO
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VendorProcurementPage;
"""

# Replace BTICK with actual backtick
content = content.replace('BTICK', BT)

with open(fp, 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Done. {len(content)} chars written to {fp}')
