#!/usr/bin/env python3
"""Write the new VendorPOTab.tsx with ERP master-detail layout."""
import os

path = os.path.join(os.path.dirname(__file__), 'frontend', 'src', 'components', 'ProjectTabs', 'VendorPOTab.tsx')

content = r"""import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent,
  Chip, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem, FormControl,
  InputLabel, Tooltip, alpha, SelectChangeEvent,
  InputAdornment, Stack, Fade, Grid, Divider, LinearProgress, Checkbox,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as ApproveIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  ShoppingCart as CartIcon,
  RequestQuote as RFQIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  ContentCopy as CopyIcon,
  ArrowBack as BackIcon,
  ArrowForward as ForwardIcon,
  Save as SaveIcon,
  PictureAsPdf as PdfIcon,
  Lock as LockIcon,
  Inventory as MaterialIcon,
} from '@mui/icons-material';
import { vendorProcurementService } from '../../services/vendorProcurementService';
import { materialService } from '../../services/materialService';
import { VendorRFQ, VendorPO, Material, Project } from '../../types';
import api from '../../services/api';

/* ══════════════════════════════════════════
   Design Tokens — ERP-clean palette
   ══════════════════════════════════════════ */
const T = {
  primary:      '#1F7A63',
  primaryLight: '#2A9D7E',
  primaryBg:    '#F0FAF7',
  text:         '#1F2937',
  textSec:      '#6B7280',
  border:       '#E5E7EB',
  bg:           '#F8FAFC',
  white:        '#ffffff',
  danger:       '#EF4444',
  dangerBg:     '#fef2f2',
  r:            '10px',
  rSm:          '8px',
  shadow:       '0 1px 3px rgba(0,0,0,0.04)',
  shadowMd:     '0 4px 12px rgba(0,0,0,0.06)',
};

const STATUS: Record<string, { color: string; bg: string; label: string }> = {
  pending:      { color: '#92400E', bg: '#FFFBEB', label: 'Pending' },
  quoted:       { color: '#1E40AF', bg: '#EFF6FF', label: 'Quoted' },
  accepted:     { color: '#166354', bg: '#F0FAF7', label: 'Approved' },
  rejected:     { color: '#991B1B', bg: '#FEF2F2', label: 'Rejected' },
  draft:        { color: '#6B7280', bg: '#F3F4F6', label: 'Draft' },
  sent:         { color: '#1E40AF', bg: '#EFF6FF', label: 'Sent' },
  acknowledged: { color: '#6D28D9', bg: '#F5F3FF', label: 'Acknowledged' },
  delivered:    { color: '#166354', bg: '#F0FAF7', label: 'Delivered' },
  cancelled:    { color: '#991B1B', bg: '#FEF2F2', label: 'Cancelled' },
};

/* ── Shared Styles ── */
const lbl = { fontSize: 11.5, fontWeight: 600, color: '#475569', mb: 0.5, letterSpacing: 0.1 } as const;
const fld = { '& .MuiOutlinedInput-root': { borderRadius: '6px', fontSize: 13, bgcolor: '#fff' } } as const;
const inp = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '6px', bgcolor: '#fff',
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.primaryLight },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.primary, borderWidth: 2 },
  },
} as const;

/* ── Helpers ── */
const Badge: React.FC<{ status: string }> = ({ status }) => {
  const s = STATUS[status] || { color: '#6B7280', bg: '#F3F4F6', label: status };
  return (
    <Chip label={s.label} size="small" sx={{
      height: 20, fontSize: 10, fontWeight: 700, borderRadius: 10,
      bgcolor: s.bg, color: s.color, border: `1px solid ${alpha(s.color, 0.15)}`,
    }} />
  );
};

const ROField: React.FC<{ value: string }> = ({ value }) => (
  <Box sx={{ py: 1, px: 1.25, borderRadius: '6px', border: `1px solid ${T.border}`, bgcolor: T.bg, minHeight: 36, display: 'flex', alignItems: 'center' }}>
    <Typography fontSize={13} color={T.textSec}>{value}</Typography>
  </Box>
);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014';

const fmtCurrency = (v?: string | number) =>
  v ? `\u20B9${Number(v).toLocaleString('en-IN')}` : '\u2014';

/* ══════════════════════════════════════════
   Local VPO type
   ══════════════════════════════════════════ */
interface VPOLocal {
  id?: string;
  rfqId: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  materialId: string;
  materialName: string;
  quantity: string;
  unit: string;
  issueDate: string;
  deliveryDate: string;
  preparedBy: string;
  approvedBy: string;
  quotedPrice: string;
  leadTime: string;
  notes: string;
  selectedMaterials: number[];
  detailLines: { quotedPrice: string; leadTime: string; notes: string }[];
  isSaving: boolean;
}

const blankRfq = (pid: string) => ({
  status: 'pending', project_id: pid,
  material_id: '', vendor_id: '', required_quantity: '', unit: '',
  quoted_price: '', lead_time: '',
});

/* ══════════════════════════════════════════
   Component
   ══════════════════════════════════════════ */
interface Props {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
}

const VendorPOTab: React.FC<Props> = ({ project, onUpdate, onBack, onNext }) => {
  const [loading, setLoading] = useState(true);
  const [rfqs, setRfqs] = useState<VendorRFQ[]>([]);
  const [, setPos] = useState<VendorPO[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);

  /* ── Selected RFQ (master-detail) ── */
  const [selectedRfqId, setSelectedRfqId] = useState<string | null>(null);

  /* ── Inline RFQ form ── */
  const [rfqForm, setRfqForm] = useState<any>(blankRfq(project.id));
  const [suggestedVendors, setSuggestedVendors] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  /* ── Edit RFQ dialog ── */
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  /* ── VPO data ── */
  const [vpoMap, setVpoMap] = useState<Record<string, VPOLocal>>({});
  const [approvedVpos, setApprovedVpos] = useState<Set<string>>(new Set());

  /* ── Derived ── */
  const clientName = project.client?.client_name ?? project.quote_info?.client_name ?? '\u2014';
  const projectName = project.project_name ?? '\u2014';
  const defaultPrepBy = project.quote_info?.seller_prepared_by ?? '';
  const customParts = project.estimate?.custom_parts ?? [];

  const selectedRfq = rfqs.find(r => r.id === selectedRfqId) || null;
  const selectedVpo = selectedRfqId ? vpoMap[selectedRfqId] : null;
  const isVpoApproved = !!(selectedVpo?.id && approvedVpos.has(selectedVpo.id));

  /* Build one VPO per RFQ */
  const buildVpo = useCallback((rfq: VendorRFQ, poL: VendorPO[]): VPOLocal => {
    const po = poL.find(p => p.vendor_id === rfq.vendor_id && p.project_id === project.id);
    return {
      id: po?.id, rfqId: rfq.id,
      poNumber: po?.po_number || 'Auto Generated',
      vendorId: rfq.vendor_id || '', vendorName: rfq.vendor?.vendor_name || '\u2014',
      materialId: rfq.material_id || '', materialName: rfq.material?.material_name || '\u2014',
      quantity: String(rfq.required_quantity || ''), unit: rfq.unit || rfq.material?.unit || '',
      issueDate: po?.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      deliveryDate: po?.delivery_date?.slice(0, 10) || '',
      preparedBy: defaultPrepBy, approvedBy: '',
      quotedPrice: String(rfq.quoted_price || po?.unit_price || ''),
      leadTime: String(rfq.lead_time || ''), notes: po?.notes || '',
      selectedMaterials: [],
      detailLines: [{ quotedPrice: String(rfq.quoted_price || ''), leadTime: String(rfq.lead_time || ''), notes: '' }],
      isSaving: false,
    };
  }, [project.id, defaultPrepBy]);

  /* ── Fetch ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [proc, matD, vRes] = await Promise.all([
        vendorProcurementService.getProcurementItems(),
        materialService.getAll(),
        api.get('/vendors'),
      ]);
      const aR = proc.rfqs || [], aP = proc.purchaseOrders || [];
      const pR = aR.filter((r: VendorRFQ) => r.project_id === project.id);
      const pP = aP.filter((p: VendorPO) => p.project_id === project.id);
      setRfqs(pR); setPos(pP);
      setMaterials(matD);
      setVendors(Array.isArray(vRes.data) ? vRes.data : vRes.data?.data || []);
      const m: Record<string, VPOLocal> = {};
      pR.forEach((r: VendorRFQ) => { m[r.id] = buildVpo(r, pP); });
      setVpoMap(m);
      const aSet = new Set<string>();
      pP.forEach((po: VendorPO) => { if ((po as any).status === 'approved') aSet.add(po.id); });
      setApprovedVpos(aSet);
      // auto-select first
      if (pR.length > 0 && !selectedRfqId) setSelectedRfqId(pR[0].id);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [project.id, buildVpo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ══════════════════════════════════════════
     RFQ Handlers
     ══════════════════════════════════════════ */
  const handleMatChange = async (mid: string) => {
    const mat = materials.find(m => m.id === mid);
    setRfqForm((f: any) => ({ ...f, material_id: mid, unit: mat?.unit || f.unit || '' }));
    if (mid) {
      try { setSuggestedVendors(await vendorProcurementService.getSuggestedVendors(mid)); }
      catch { setSuggestedVendors([]); }
    }
  };

  const handleCreate = async () => {
    if (!rfqForm.material_id || !rfqForm.vendor_id || !rfqForm.required_quantity) {
      alert('Please fill Material, Vendor, and Required Quantity.'); return;
    }
    if (rfqs.some(r => r.material_id === rfqForm.material_id && r.vendor_id === rfqForm.vendor_id)) {
      alert('RFQ already exists for this material + vendor combination.'); return;
    }
    setCreating(true);
    try {
      await vendorProcurementService.createRFQ({ ...rfqForm, project_id: project.id });
      setRfqForm(blankRfq(project.id)); setSuggestedVendors([]);
      fetchData(); onUpdate();
    } catch (e: any) { alert(e?.response?.data?.message || 'Error creating RFQ'); }
    finally { setCreating(false); }
  };

  const handleReset = () => { setRfqForm(blankRfq(project.id)); setSuggestedVendors([]); };

  const handleSelectVendor = async (id: string) => { await vendorProcurementService.selectVendor(id); fetchData(); };

  const handleDeleteRFQ = async (id: string) => {
    if (!window.confirm('Delete this RFQ?')) return;
    await vendorProcurementService.deleteRFQ(id);
    if (selectedRfqId === id) setSelectedRfqId(null);
    fetchData();
  };

  const handleOpenEdit = (rfq: VendorRFQ) => {
    setEditForm({ id: rfq.id, vendor_id: rfq.vendor_id, quoted_price: rfq.quoted_price || '', lead_time: rfq.lead_time || '', status: rfq.status || 'pending' });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      await vendorProcurementService.updateRFQ(editForm.id, {
        vendor_id: editForm.vendor_id, quoted_price: editForm.quoted_price,
        lead_time: editForm.lead_time, status: editForm.status,
      });
      setEditOpen(false); fetchData();
    } catch (e: any) { alert(e?.response?.data?.message || 'Error updating RFQ'); }
  };

  const handleCopy = (rfq: VendorRFQ) => {
    setRfqForm({ ...blankRfq(project.id), material_id: rfq.material_id, required_quantity: rfq.required_quantity, unit: rfq.unit || rfq.material?.unit || '' });
    setSuggestedVendors([]);
  };

  /* ══════════════════════════════════════════
     VPO Handlers
     ══════════════════════════════════════════ */
  const updateVPO = (rid: string, patch: Partial<VPOLocal>) => {
    setVpoMap(prev => ({ ...prev, [rid]: { ...prev[rid], ...patch } }));
  };

  const toggleMat = (rid: string, idx: number) => {
    const v = vpoMap[rid]; if (!v) return;
    updateVPO(rid, { selectedMaterials: v.selectedMaterials.includes(idx) ? v.selectedMaterials.filter(j => j !== idx) : [...v.selectedMaterials, idx] });
  };

  const addLine = (rid: string) => {
    const v = vpoMap[rid]; if (!v) return;
    updateVPO(rid, { detailLines: [...v.detailLines, { quotedPrice: '', leadTime: '', notes: '' }] });
  };

  const updateLine = (rid: string, li: number, patch: Partial<{ quotedPrice: string; leadTime: string; notes: string }>) => {
    const v = vpoMap[rid]; if (!v) return;
    updateVPO(rid, { detailLines: v.detailLines.map((l, i) => i === li ? { ...l, ...patch } : l) });
  };

  const handleSaveVPO = async (rid: string) => {
    const v = vpoMap[rid]; if (!v) return;
    if (v.id && approvedVpos.has(v.id)) { alert('This VPO is approved and locked.'); return; }
    updateVPO(rid, { isSaving: true });
    try {
      const pay = {
        project_id: project.id, vendor_id: v.vendorId, material_id: v.materialId,
        quantity: Number(v.quantity) || 1, unit: v.unit,
        unit_price: Number(v.quotedPrice) || 0,
        total_price: (Number(v.quantity) || 1) * (Number(v.quotedPrice) || 0),
        delivery_date: v.deliveryDate || undefined, payment_terms: '', notes: v.notes,
      };
      if (v.id) { await vendorProcurementService.updatePO(v.id, pay); }
      else {
        const res = await vendorProcurementService.generatePO(pay);
        if (res?.id) updateVPO(rid, { id: res.id, poNumber: res.po_number || 'VPO-Auto' });
      }
      fetchData();
    } catch (e: any) { alert(e?.response?.data?.message || 'Error saving VPO'); }
    finally { updateVPO(rid, { isSaving: false }); }
  };

  const handleApproveVPO = async (rid: string) => {
    const v = vpoMap[rid]; if (!v) return;
    if (!v.id) { await handleSaveVPO(rid); }
    const vpoId = vpoMap[rid]?.id;
    if (!vpoId) { alert('Save the VPO first.'); return; }
    try {
      await vendorProcurementService.updatePO(vpoId, { status: 'approved' } as any);
      setApprovedVpos(prev => new Set([...prev, vpoId])); fetchData();
    } catch (e: any) { alert(e?.response?.data?.message || 'Error approving VPO'); }
  };

  const handleDeleteVPO = async (rid: string) => {
    const v = vpoMap[rid];
    if (!v?.id) { alert('VPO not saved yet.'); return; }
    if (approvedVpos.has(v.id)) { alert('Cannot delete approved VPO.'); return; }
    if (!window.confirm('Delete this Vendor Purchase Order?')) return;
    try { await vendorProcurementService.updatePO(v.id, { status: 'cancelled' } as any); fetchData(); }
    catch (e: any) { alert(e?.response?.data?.message || 'Error deleting VPO'); }
  };

  /* ── icon button style ── */
  const ib = (clr = T.textSec) => ({
    p: 0.5, color: clr, borderRadius: '6px',
    '&:hover': { bgcolor: alpha(T.primary, 0.08), color: T.primary },
  });

  /* ══════════════════════════════════════════
     Render
     ══════════════════════════════════════════ */
  return (
    <Box sx={{ pb: 4, bgcolor: T.bg, minHeight: '60vh' }}>

      {/* ── Page Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5 }}>
        <Box sx={{ width: 40, height: 40, borderRadius: T.rSm, bgcolor: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CartIcon sx={{ fontSize: 22, color: '#fff' }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 20, color: T.text, letterSpacing: -0.3 }}>PO to Vendor</Typography>
          <Typography sx={{ fontSize: 12, color: T.textSec }}>Create RFQs, compare vendors, approve purchase orders</Typography>
        </Box>
        <Button size="small" startIcon={<RefreshIcon sx={{ fontSize: 16 }} />} onClick={fetchData}
          sx={{ borderRadius: '6px', textTransform: 'none', fontSize: 12, fontWeight: 600, color: T.textSec, border: `1px solid ${T.border}`, px: 1.5, '&:hover': { borderColor: T.primary, color: T.primary } }}>
          Refresh
        </Button>
      </Box>

      {loading && <LinearProgress sx={{ borderRadius: 1, mb: 2, '& .MuiLinearProgress-bar': { bgcolor: T.primary } }} />}

      {/* ══════════════════════════════════════════════════════════════
          COMPACT RFQ CREATION FORM
         ══════════════════════════════════════════════════════════════ */}
      <Card sx={{ mb: 2.5, borderRadius: T.r, border: `1px solid ${T.border}`, boxShadow: T.shadow, bgcolor: T.white }}>
        <Box sx={{ px: 2.5, py: 1.25, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddIcon sx={{ fontSize: 18, color: T.primary }} />
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.text }}>Create New RFQ</Typography>
        </Box>
        <CardContent sx={{ px: 2.5, py: 2, '&:last-child': { pb: 2 } }}>
          {/* Row 1 */}
          <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
            <Grid item xs={12} sm={4}>
              <Typography sx={lbl}>Project</Typography>
              <ROField value={project.project_name} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography sx={lbl}>Material *</Typography>
              <FormControl fullWidth size="small" sx={inp}>
                <Select value={rfqForm.material_id || ''} displayEmpty
                  onChange={(e: SelectChangeEvent) => handleMatChange(e.target.value)}
                  sx={{ fontSize: 13 }}>
                  <MenuItem value="" sx={{ fontSize: 13, color: T.textSec }}>Select Material</MenuItem>
                  {materials.map(m => <MenuItem key={m.id} value={m.id} sx={{ fontSize: 13 }}>{m.material_name} ({m.unit})</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography sx={lbl}>Vendor *</Typography>
              <FormControl fullWidth size="small" sx={inp}>
                <Select value={rfqForm.vendor_id || ''} displayEmpty
                  onChange={(e: SelectChangeEvent) => setRfqForm((f: any) => ({ ...f, vendor_id: e.target.value }))}
                  sx={{ fontSize: 13 }}>
                  <MenuItem value="" sx={{ fontSize: 13, color: T.textSec }}>Select Vendor</MenuItem>
                  {vendors.map((v: any) => <MenuItem key={v.id} value={v.id} sx={{ fontSize: 13 }}>{v.vendor_name}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* Suggested Vendors */}
          {suggestedVendors.length > 0 && (
            <Box sx={{ mb: 1.5, p: 1, borderRadius: '6px', bgcolor: T.primaryBg, border: `1px solid ${alpha(T.primary, 0.12)}` }}>
              <Typography sx={{ fontSize: 10, fontWeight: 600, color: T.primary, mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Suggested</Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {suggestedVendors.map((v: any) => (
                  <Chip key={v.id} label={v.vendor_name} size="small" clickable
                    onClick={() => setRfqForm((f: any) => ({ ...f, vendor_id: v.id }))}
                    sx={{ fontSize: 11, fontWeight: 600, borderRadius: '6px', height: 24,
                      ...(rfqForm.vendor_id === v.id
                        ? { bgcolor: T.primary, color: '#fff' }
                        : { bgcolor: '#fff', color: T.text, border: `1px solid ${T.border}`, '&:hover': { borderColor: T.primary } }) }} />
                ))}
              </Box>
            </Box>
          )}

          {/* Row 2 */}
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            <Grid item xs={6} sm={3}>
              <Typography sx={lbl}>Qty *</Typography>
              <TextField fullWidth size="small" type="number" placeholder="50" sx={fld}
                value={rfqForm.required_quantity || ''} onChange={e => setRfqForm((f: any) => ({ ...f, required_quantity: e.target.value }))} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography sx={lbl}>Unit</Typography>
              <TextField fullWidth size="small" placeholder="Kg" sx={fld}
                value={rfqForm.unit || ''} onChange={e => setRfqForm((f: any) => ({ ...f, unit: e.target.value }))}
                InputProps={{ readOnly: !!rfqForm.material_id }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography sx={lbl}>Quoted Price</Typography>
              <TextField fullWidth size="small" type="number" placeholder="Optional" sx={fld}
                value={rfqForm.quoted_price || ''} onChange={e => setRfqForm((f: any) => ({ ...f, quoted_price: e.target.value }))}
                InputProps={{ startAdornment: <InputAdornment position="start">{'\u20B9'}</InputAdornment> }} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography sx={lbl}>Lead Time</Typography>
              <TextField fullWidth size="small" placeholder="5" sx={fld}
                value={rfqForm.lead_time || ''} onChange={e => setRfqForm((f: any) => ({ ...f, lead_time: e.target.value }))}
                InputProps={{ endAdornment: <InputAdornment position="end">days</InputAdornment> }} />
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleCreate} disabled={creating}
              sx={{ bgcolor: T.primary, borderRadius: '6px', textTransform: 'none', fontWeight: 700, fontSize: 13, px: 2.5, py: 0.75, boxShadow: 'none', '&:hover': { bgcolor: T.primaryLight, boxShadow: T.shadow } }}>
              {creating ? 'Creating...' : 'Create RFQ'}
            </Button>
            <Button size="small" onClick={handleReset}
              sx={{ color: T.textSec, textTransform: 'none', fontWeight: 500, fontSize: 12, '&:hover': { bgcolor: '#F1F5F9' } }}>
              Reset
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* ══════════════════════════════════════════════════════════════
          MASTER – DETAIL LAYOUT
          Left: RFQ List (35%) | Right: Detail Panel (65%)
         ══════════════════════════════════════════════════════════════ */}
      {!loading && rfqs.length === 0 && (
        <Card sx={{ borderRadius: T.r, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
          <CardContent sx={{ textAlign: 'center', py: 5 }}>
            <RFQIcon sx={{ fontSize: 44, color: '#CBD5E1', mb: 1 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.textSec }}>
              No RFQs yet — create one above to get started
            </Typography>
          </CardContent>
        </Card>
      )}

      {!loading && rfqs.length > 0 && (
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>

          {/* ════════════════════════════════════
              LEFT PANEL — RFQ List (35%)
             ════════════════════════════════════ */}
          <Box sx={{ width: '35%', flexShrink: 0 }}>
            <Card sx={{ borderRadius: T.r, border: `1px solid ${T.border}`, boxShadow: T.shadow, bgcolor: T.white, overflow: 'hidden' }}>
              <Box sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${T.border}`, bgcolor: '#F8FAFC' }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: T.text, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  RFQ List ({rfqs.length})
                </Typography>
              </Box>

              <Box sx={{ maxHeight: 520, overflowY: 'auto' }}>
                {rfqs.map((rfq, idx) => {
                  const isActive = selectedRfqId === rfq.id;
                  const badge = STATUS[rfq.status] || STATUS.pending;
                  return (
                    <Box
                      key={rfq.id}
                      onClick={() => setSelectedRfqId(rfq.id)}
                      sx={{
                        px: 2, py: 1.5,
                        cursor: 'pointer',
                        borderBottom: `1px solid ${T.border}`,
                        borderLeft: isActive ? `3px solid ${T.primary}` : '3px solid transparent',
                        bgcolor: isActive ? T.primaryBg : 'transparent',
                        transition: 'all 0.15s',
                        '&:hover': { bgcolor: isActive ? T.primaryBg : '#F1F5F9' },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                          RFQ #{idx + 1}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }} onClick={e => e.stopPropagation()}>
                          <Tooltip title="Edit" arrow><IconButton size="small" onClick={() => handleOpenEdit(rfq)} sx={ib()}><EditIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                          <Tooltip title="Copy" arrow><IconButton size="small" onClick={() => handleCopy(rfq)} sx={ib()}><CopyIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                          <Tooltip title="Delete" arrow><IconButton size="small" onClick={() => handleDeleteRFQ(rfq.id)} sx={ib(T.danger)}><DeleteIcon sx={{ fontSize: 15 }} /></IconButton></Tooltip>
                        </Box>
                      </Box>
                      <Typography sx={{ fontSize: 12, color: T.textSec, mb: 0.5 }}>
                        {rfq.material?.material_name || 'Material'} &middot; Qty {rfq.required_quantity || '\u2014'} {rfq.unit || rfq.material?.unit || ''}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={badge.label} size="small" sx={{
                          height: 18, fontSize: 10, fontWeight: 700, borderRadius: 9,
                          bgcolor: badge.bg, color: badge.color, border: `1px solid ${alpha(badge.color, 0.15)}`,
                        }} />
                        {rfq.vendor?.vendor_name && (
                          <Typography sx={{ fontSize: 11, color: T.textSec }}>{rfq.vendor.vendor_name}</Typography>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Card>
          </Box>

          {/* ════════════════════════════════════
              RIGHT PANEL — Detail (65%)
             ════════════════════════════════════ */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {!selectedRfq ? (
              <Card sx={{ borderRadius: T.r, border: `1px solid ${T.border}`, boxShadow: T.shadow, bgcolor: T.white }}>
                <CardContent sx={{ textAlign: 'center', py: 8 }}>
                  <RFQIcon sx={{ fontSize: 40, color: '#CBD5E1', mb: 1 }} />
                  <Typography sx={{ fontSize: 14, color: T.textSec }}>Select an RFQ from the list to view details</Typography>
                </CardContent>
              </Card>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                {/* ──── RFQ DETAIL CARD ──── */}
                <Card sx={{ borderRadius: T.r, border: `1px solid ${T.border}`, boxShadow: T.shadow, bgcolor: T.white }}>
                  <Box sx={{ px: 2.5, py: 1.25, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#F8FAFC' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <RFQIcon sx={{ fontSize: 18, color: T.primary }} />
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                        RFQ #{rfqs.indexOf(selectedRfq) + 1} — {selectedRfq.material?.material_name || 'Material'}
                      </Typography>
                      <Badge status={selectedRfq.status} />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {!selectedRfq.is_selected && (
                        <Button size="small" variant="outlined" startIcon={<ApproveIcon sx={{ fontSize: 14 }} />}
                          onClick={() => handleSelectVendor(selectedRfq.id)}
                          sx={{ borderColor: T.primary, color: T.primary, borderRadius: '6px', textTransform: 'none', fontWeight: 600, fontSize: 11, py: 0.25, '&:hover': { bgcolor: T.primaryBg } }}>
                          Approve Quote
                        </Button>
                      )}
                      {selectedRfq.is_selected && (
                        <Chip icon={<ApproveIcon sx={{ fontSize: 14 }} />} label="Approved" size="small"
                          sx={{ bgcolor: T.primaryBg, color: T.primary, fontWeight: 700, fontSize: 11, height: 24 }} />
                      )}
                    </Box>
                  </Box>
                  <CardContent sx={{ px: 2.5, py: 2, '&:last-child': { pb: 2 } }}>
                    <Grid container spacing={2}>
                      <Grid item xs={6} md={3}>
                        <Typography sx={lbl}>Vendor</Typography>
                        <ROField value={selectedRfq.vendor?.vendor_name || '\u2014'} />
                      </Grid>
                      <Grid item xs={6} md={3}>
                        <Typography sx={lbl}>Material</Typography>
                        <ROField value={selectedRfq.material?.material_name || '\u2014'} />
                      </Grid>
                      <Grid item xs={6} md={2}>
                        <Typography sx={lbl}>Quantity</Typography>
                        <ROField value={`${selectedRfq.required_quantity || '\u2014'} ${selectedRfq.unit || selectedRfq.material?.unit || ''}`} />
                      </Grid>
                      <Grid item xs={6} md={2}>
                        <Typography sx={lbl}>Price</Typography>
                        <ROField value={fmtCurrency(selectedRfq.quoted_price)} />
                      </Grid>
                      <Grid item xs={6} md={2}>
                        <Typography sx={lbl}>Lead Time</Typography>
                        <ROField value={selectedRfq.lead_time ? `${selectedRfq.lead_time} days` : '\u2014'} />
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>

                {/* ──── MATERIAL TABLE (if custom_parts exist) ──── */}
                {customParts.length > 0 && selectedVpo && (
                  <Card sx={{ borderRadius: T.r, border: `1px solid ${T.border}`, boxShadow: T.shadow, bgcolor: T.white }}>
                    <Box sx={{ px: 2.5, py: 1.25, borderBottom: `1px solid ${T.border}`, bgcolor: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 1 }}>
                      <MaterialIcon sx={{ fontSize: 16, color: T.primary }} />
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.text }}>Materials</Typography>
                    </Box>
                    <Box sx={{ overflowX: 'auto' }}>
                      {/* Table header */}
                      <Box sx={{ display: 'flex', px: 2.5, py: 1, bgcolor: '#F8FAFC', borderBottom: `1px solid ${T.border}`, minWidth: 500 }}>
                        <Box sx={{ width: 36 }} />
                        <Typography sx={{ flex: 2, fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase' }}>Material</Typography>
                        <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase' }}>Quantity</Typography>
                        <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase' }}>Price</Typography>
                        <Typography sx={{ flex: 1, fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase' }}>Lead Time</Typography>
                      </Box>
                      {customParts.map((part: any, pi: number) => {
                        const isSel = selectedVpo.selectedMaterials.includes(pi);
                        return (
                          <Box key={pi} sx={{ display: 'flex', alignItems: 'center', px: 2.5, py: 1, borderBottom: `1px solid ${T.border}`, minWidth: 500, bgcolor: isSel ? T.primaryBg : 'transparent', '&:hover': { bgcolor: '#F1F5F9' } }}>
                            <Checkbox size="small" checked={isSel} disabled={isVpoApproved}
                              onChange={() => toggleMat(selectedRfq.id, pi)}
                              sx={{ p: 0.25, mr: 1, color: T.primary, '&.Mui-checked': { color: T.primary } }} />
                            <Typography sx={{ flex: 2, fontSize: 13, color: T.text }}>
                              {part.job_description || part.drawing_part_no || part.material || `Part #${pi + 1}`}
                            </Typography>
                            <Typography sx={{ flex: 1, fontSize: 13, color: T.textSec }}>
                              {part.required_quantity || '\u2014'} {part.unit || ''}
                            </Typography>
                            <Typography sx={{ flex: 1, fontSize: 13, color: T.textSec }}>
                              {part.rate ? fmtCurrency(part.rate) : '\u2014'}
                            </Typography>
                            <Typography sx={{ flex: 1, fontSize: 13, color: T.textSec }}>
                              {part.lead_time ? `${part.lead_time} days` : '\u2014'}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  </Card>
                )}

                {/* ──── VENDOR PURCHASE ORDER CARD ──── */}
                {selectedVpo && (
                  <Card sx={{ borderRadius: T.r, border: isVpoApproved ? '1px solid #A7F3D0' : `1px solid ${T.border}`, boxShadow: T.shadow, bgcolor: T.white }}>
                    <Box sx={{ px: 2.5, py: 1.25, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: '#F8FAFC' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {isVpoApproved ? <LockIcon sx={{ fontSize: 16, color: T.primary }} /> : <CartIcon sx={{ fontSize: 16, color: T.primary }} />}
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                          Vendor Purchase Order
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: T.textSec }}>
                          {selectedVpo.id && selectedVpo.poNumber !== 'Auto Generated' ? selectedVpo.poNumber : ''}
                        </Typography>
                        <Chip label={isVpoApproved ? 'Approved' : 'Pending Approval'} size="small" sx={{
                          height: 20, fontSize: 10, fontWeight: 700, borderRadius: 10,
                          bgcolor: isVpoApproved ? T.primaryBg : '#FFFBEB',
                          color: isVpoApproved ? '#166354' : '#92400E',
                          border: `1px solid ${isVpoApproved ? alpha('#166354', 0.15) : alpha('#92400E', 0.15)}`,
                        }} />
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {!isVpoApproved && (
                          <Tooltip title="Approve VPO" arrow>
                            <IconButton size="small" onClick={() => handleApproveVPO(selectedRfq.id)} sx={ib(T.primary)}>
                              <ApproveIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                        {!isVpoApproved && (
                          <Tooltip title="Delete VPO" arrow>
                            <IconButton size="small" onClick={() => handleDeleteVPO(selectedRfq.id)} sx={ib(T.danger)}>
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </Box>

                    <CardContent sx={{ px: 2.5, py: 2, '&:last-child': { pb: 2 } }}>
                      {/* Approved banner */}
                      {isVpoApproved && (
                        <Box sx={{ mb: 2, p: 1.25, borderRadius: '6px', bgcolor: T.primaryBg, border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LockIcon sx={{ fontSize: 16, color: T.primary }} />
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.primary }}>Approved and locked for editing</Typography>
                        </Box>
                      )}

                      <Box sx={{ opacity: isVpoApproved ? 0.7 : 1, pointerEvents: isVpoApproved ? 'none' : 'auto' }}>
                        {/* Row 1 */}
                        <Grid container spacing={1.5} sx={{ mb: 2 }}>
                          <Grid item xs={6} md={3}>
                            <Typography sx={lbl}>Vendor Name</Typography>
                            {isVpoApproved ? <ROField value={selectedVpo.vendorName || '\u2014'} /> : (
                              <FormControl fullWidth size="small" sx={inp}>
                                <Select value={selectedVpo.vendorId} displayEmpty
                                  onChange={(e) => {
                                    const vn = vendors.find((v: any) => v.id === e.target.value)?.vendor_name || '';
                                    updateVPO(selectedRfq.id, { vendorId: e.target.value as string, vendorName: vn });
                                  }} sx={{ fontSize: 13 }}>
                                  <MenuItem value="" sx={{ fontSize: 13, color: T.textSec }}>Select</MenuItem>
                                  {vendors.map((v: any) => <MenuItem key={v.id} value={v.id} sx={{ fontSize: 13 }}>{v.vendor_name}</MenuItem>)}
                                </Select>
                              </FormControl>
                            )}
                          </Grid>
                          <Grid item xs={6} md={3}>
                            <Typography sx={lbl}>PO Number</Typography>
                            <ROField value={selectedVpo.id ? selectedVpo.poNumber : 'Auto Generated'} />
                          </Grid>
                          <Grid item xs={6} md={3}>
                            <Typography sx={lbl}>Issue Date</Typography>
                            {isVpoApproved ? <ROField value={fmtDate(selectedVpo.issueDate)} /> : (
                              <TextField type="date" size="small" fullWidth value={selectedVpo.issueDate}
                                onChange={e => updateVPO(selectedRfq.id, { issueDate: e.target.value })}
                                InputLabelProps={{ shrink: true }} sx={fld} />
                            )}
                          </Grid>
                          <Grid item xs={6} md={3}>
                            <Typography sx={lbl}>Delivery Date</Typography>
                            {isVpoApproved ? <ROField value={fmtDate(selectedVpo.deliveryDate)} /> : (
                              <TextField type="date" size="small" fullWidth value={selectedVpo.deliveryDate}
                                onChange={e => updateVPO(selectedRfq.id, { deliveryDate: e.target.value })}
                                InputLabelProps={{ shrink: true }} sx={fld} />
                            )}
                          </Grid>
                        </Grid>

                        {/* Row 2 */}
                        <Grid container spacing={1.5} sx={{ mb: 2 }}>
                          <Grid item xs={6} md={3}>
                            <Typography sx={lbl}>Client</Typography>
                            <ROField value={clientName} />
                          </Grid>
                          <Grid item xs={6} md={3}>
                            <Typography sx={lbl}>Project</Typography>
                            <ROField value={projectName} />
                          </Grid>
                          <Grid item xs={6} md={3}>
                            <Typography sx={lbl}>Prepared By</Typography>
                            {isVpoApproved ? <ROField value={selectedVpo.preparedBy || '\u2014'} /> : (
                              <TextField size="small" fullWidth value={selectedVpo.preparedBy}
                                onChange={e => updateVPO(selectedRfq.id, { preparedBy: e.target.value })}
                                placeholder="Name" sx={fld} />
                            )}
                          </Grid>
                          <Grid item xs={6} md={3}>
                            <Typography sx={lbl}>Approved By</Typography>
                            {isVpoApproved ? <ROField value={selectedVpo.approvedBy || '\u2014'} /> : (
                              <TextField size="small" fullWidth value={selectedVpo.approvedBy}
                                onChange={e => updateVPO(selectedRfq.id, { approvedBy: e.target.value })}
                                placeholder="Name" sx={fld} />
                            )}
                          </Grid>
                        </Grid>

                        {/* Detail Lines */}
                        <Box sx={{ mb: 2 }}>
                          <Typography sx={{ ...lbl, mb: 1, fontSize: 12, fontWeight: 700 }}>Purchase Details</Typography>
                          <Box sx={{ border: `1px solid ${T.border}`, borderRadius: '6px', bgcolor: '#FAFAFA', p: 1.5 }}>
                            {selectedVpo.detailLines.map((line, li) => (
                              <Box key={`dl-${li}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: li < selectedVpo.detailLines.length - 1 ? 1 : 0 }}>
                                <Typography sx={{ minWidth: 20, fontSize: 12, fontWeight: 600, color: T.textSec }}>{li + 1}.</Typography>
                                <TextField size="small" placeholder="Price" type="number" value={line.quotedPrice}
                                  onChange={e => updateLine(selectedRfq.id, li, { quotedPrice: e.target.value })}
                                  InputProps={{ startAdornment: <InputAdornment position="start">{'\u20B9'}</InputAdornment> }}
                                  sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '6px', fontSize: 12, bgcolor: '#fff' }, '& .MuiInputBase-input': { py: 0.6 } }} />
                                <TextField size="small" placeholder="Lead" value={line.leadTime}
                                  onChange={e => updateLine(selectedRfq.id, li, { leadTime: e.target.value })}
                                  InputProps={{ endAdornment: <InputAdornment position="end">days</InputAdornment> }}
                                  sx={{ width: 120, '& .MuiOutlinedInput-root': { borderRadius: '6px', fontSize: 12, bgcolor: '#fff' }, '& .MuiInputBase-input': { py: 0.6 } }} />
                                <TextField size="small" placeholder="Notes" value={line.notes}
                                  onChange={e => updateLine(selectedRfq.id, li, { notes: e.target.value })}
                                  sx={{ flex: 1.5, '& .MuiOutlinedInput-root': { borderRadius: '6px', fontSize: 12, bgcolor: '#fff' }, '& .MuiInputBase-input': { py: 0.6 } }} />
                                {selectedVpo.detailLines.length > 1 && (
                                  <IconButton size="small"
                                    onClick={() => updateVPO(selectedRfq.id, { detailLines: selectedVpo.detailLines.filter((_, i) => i !== li) })}
                                    sx={{ p: 0.3, color: '#CBD5E1', '&:hover': { color: T.danger } }}>
                                    <CloseIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                )}
                              </Box>
                            ))}
                            <Button size="small" onClick={() => addLine(selectedRfq.id)}
                              sx={{ mt: 0.75, fontSize: 11, textTransform: 'none', color: T.primary, fontWeight: 600 }}>
                              + Add line
                            </Button>
                          </Box>
                        </Box>
                      </Box>

                      {/* Actions */}
                      <Divider sx={{ mb: 2 }} />
                      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                        {!isVpoApproved ? (
                          <>
                            <Button variant="contained" size="small" startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
                              onClick={() => handleSaveVPO(selectedRfq.id)} disabled={selectedVpo.isSaving}
                              sx={{ bgcolor: T.primary, borderRadius: '6px', textTransform: 'none', fontWeight: 700, fontSize: 13, px: 2.5, boxShadow: 'none', '&:hover': { bgcolor: T.primaryLight } }}>
                              {selectedVpo.isSaving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button variant="outlined" size="small" startIcon={<ApproveIcon sx={{ fontSize: 16 }} />}
                              onClick={() => handleApproveVPO(selectedRfq.id)}
                              sx={{ borderColor: T.primary, color: T.primary, borderRadius: '6px', textTransform: 'none', fontWeight: 600, fontSize: 13, '&:hover': { bgcolor: T.primaryBg } }}>
                              Approve
                            </Button>
                          </>
                        ) : (
                          <Chip icon={<LockIcon sx={{ fontSize: 14 }} />} label="Approved \u2014 Locked" size="small"
                            sx={{ bgcolor: T.primaryBg, color: T.primary, fontWeight: 700, fontSize: 12, height: 28, borderRadius: '6px', border: `1px solid ${alpha(T.primary, 0.2)}` }} />
                        )}
                        {selectedVpo.id && (
                          <Button variant="outlined" size="small" startIcon={<PdfIcon sx={{ fontSize: 16 }} />}
                            sx={{ borderColor: T.border, color: T.textSec, borderRadius: '6px', textTransform: 'none', fontWeight: 500, fontSize: 13, ml: 'auto', '&:hover': { borderColor: T.primary, color: T.primary } }}>
                            Download
                          </Button>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                )}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* ── Navigation ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 3, pt: 2, borderTop: `1px solid ${T.border}` }}>
        <Button size="small" startIcon={<BackIcon />} onClick={onBack} disabled={!onBack}
          sx={{ borderRadius: '6px', textTransform: 'none', fontWeight: 500, fontSize: 13, color: T.textSec, border: `1px solid ${T.border}`, px: 2, '&:hover': { borderColor: T.primary, color: T.primary } }}>
          Back to PO to Client
        </Button>
        <Button size="small" variant="contained" endIcon={<ForwardIcon />} onClick={onNext} disabled={!onNext}
          sx={{ bgcolor: T.primary, borderRadius: '6px', textTransform: 'none', fontWeight: 600, fontSize: 13, px: 2.5, boxShadow: 'none', '&:hover': { bgcolor: T.primaryLight } }}>
          Next: Work Order
        </Button>
      </Box>

      {/* ══════════════════════════════════════════
          EDIT RFQ DIALOG
         ══════════════════════════════════════════ */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="xs" fullWidth TransitionComponent={Fade}
        PaperProps={{ sx: { borderRadius: T.r, boxShadow: T.shadowMd, maxWidth: 440, overflow: 'hidden' } }}>
        <Box sx={{ height: 3, bgcolor: T.primary }} />
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, pt: 2, pb: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon sx={{ fontSize: 18, color: T.primary }} />
            <Typography sx={{ fontWeight: 700, fontSize: 15, color: T.text }}>Edit RFQ</Typography>
          </Box>
          <IconButton size="small" onClick={() => setEditOpen(false)} sx={{ color: T.textSec }}><CloseIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 2.5, pt: 2, pb: 1 }}>
          <Stack spacing={2}>
            <FormControl fullWidth size="small" sx={inp}>
              <InputLabel>Vendor</InputLabel>
              <Select value={editForm.vendor_id || ''} label="Vendor"
                onChange={(e: SelectChangeEvent) => setEditForm((f: any) => ({ ...f, vendor_id: e.target.value }))}>
                {vendors.map((v: any) => <MenuItem key={v.id} value={v.id} sx={{ fontSize: 13 }}>{v.vendor_name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField fullWidth size="small" label="Quoted Price" type="number" sx={inp}
              value={editForm.quoted_price || ''} onChange={e => setEditForm((f: any) => ({ ...f, quoted_price: e.target.value }))}
              InputProps={{ startAdornment: <InputAdornment position="start">{'\u20B9'}</InputAdornment> }} />
            <TextField fullWidth size="small" label="Lead Time" sx={inp} placeholder="5"
              value={editForm.lead_time || ''} onChange={e => setEditForm((f: any) => ({ ...f, lead_time: e.target.value }))}
              InputProps={{ endAdornment: <InputAdornment position="end">days</InputAdornment> }} />
            <FormControl fullWidth size="small" sx={inp}>
              <InputLabel>Status</InputLabel>
              <Select value={editForm.status || 'pending'} label="Status"
                onChange={(e: SelectChangeEvent) => setEditForm((f: any) => ({ ...f, status: e.target.value }))}>
                <MenuItem value="pending" sx={{ fontSize: 13 }}>Pending</MenuItem>
                <MenuItem value="quoted" sx={{ fontSize: 13 }}>Quoted</MenuItem>
                <MenuItem value="accepted" sx={{ fontSize: 13 }}>Approved</MenuItem>
                <MenuItem value="rejected" sx={{ fontSize: 13 }}>Rejected</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 2, borderTop: `1px solid ${T.border}`, gap: 1 }}>
          <Button onClick={() => setEditOpen(false)} sx={{ borderRadius: '6px', textTransform: 'none', fontWeight: 600, fontSize: 13, color: T.textSec }}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveEdit} sx={{ bgcolor: T.primary, borderRadius: '6px', textTransform: 'none', fontWeight: 700, fontSize: 13, px: 2.5, boxShadow: 'none', '&:hover': { bgcolor: T.primaryLight } }}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VendorPOTab;
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Written {len(content)} chars to {path}")
