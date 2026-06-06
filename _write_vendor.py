content = r"""import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableHead, TableRow,
  TableCell, TableBody, Chip, Button, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem, FormControl,
  InputLabel, Tabs, Tab, Tooltip, Skeleton, alpha, SelectChangeEvent,
  InputAdornment, Stack, Fade,
} from '@mui/material';
import {
  Add as AddIcon,
  CheckCircle as SelectIcon,
  Download as DownloadIcon,
  Send as SendIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
  ShoppingCart as CartIcon,
  RequestQuote as RFQIcon,
  LocalShipping as ShipIcon,
  Inventory2 as InventoryIcon,
  Close as CloseIcon,
  CurrencyRupee as RupeeIcon,
  Schedule as ScheduleIcon,
  Assignment as AssignmentIcon,
} from '@mui/icons-material';
import { vendorProcurementService } from '../services/vendorProcurementService';
import { materialService } from '../services/materialService';
import { VendorRFQ, VendorPO, Material } from '../types';
import api from '../services/api';

/* ══════════════════════════════════════════════════════
   Design Tokens
   ══════════════════════════════════════════════════════ */
const T = {
  primary:      '#15803d',
  primaryLight: '#22c55e',
  primaryBg:    '#F0FDF4',
  dark:         '#1e293b',
  textPrimary:  '#1e293b',
  textSecondary:'#64748b',
  border:       '#e2e8f0',
  bg:           '#f8fafc',
  white:        '#ffffff',
  danger:       '#ef4444',
  dangerBg:     '#fef2f2',
  radius:       '14px',
  radiusSm:     '10px',
  radiusXs:     '8px',
  shadow:       '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd:     '0 4px 12px rgba(0,0,0,0.06)',
  shadowLg:     '0 8px 24px rgba(0,0,0,0.08)',
  gradient:     'linear-gradient(135deg, #15803d 0%, #22c55e 100%)',
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

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B', quoted: '#3B82F6', accepted: '#10B981', rejected: '#EF4444',
  draft: '#94A3B8', sent: '#3B82F6', acknowledged: '#8B5CF6', delivered: '#10B981', cancelled: '#EF4444',
};

const thSx = {
  fontWeight: 700, fontSize: 11, color: T.textSecondary, textTransform: 'uppercase' as const,
  letterSpacing: 0.6, py: 1.5, borderBottom: BTICK2px solid ${T.border}BTICK,
};

/* ══════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════ */
const VendorProcurementPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rfqs, setRfqs] = useState<VendorRFQ[]>([]);
  const [pos, setPos] = useState<VendorPO[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);

  // RFQ form
  const [rfqOpen, setRfqOpen] = useState(false);
  const [rfqForm, setRfqForm] = useState<any>({});
  const [suggestedVendors, setSuggestedVendors] = useState<any[]>([]);

  // PO form
  const [poOpen, setPoOpen] = useState(false);
  const [poForm, setPoForm] = useState<any>({});

  // Projects & vendors
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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── RFQ handlers ── */
  const openRFQForm = () => {
    setRfqForm({ status: 'pending' });
    setSuggestedVendors([]);
    setRfqOpen(true);
  };

  const handleMaterialChange = async (materialId: string) => {
    const mat = materials.find(m => m.id === materialId);
    setRfqForm((f: any) => ({ ...f, material_id: materialId, unit: mat?.unit || f.unit || '' }));
    if (materialId) {
      try {
        const sv = await vendorProcurementService.getSuggestedVendors(materialId);
        setSuggestedVendors(sv);
      } catch { setSuggestedVendors([]); }
    }
  };

  const handleCreateRFQ = async () => {
    try {
      await vendorProcurementService.createRFQ(rfqForm);
      setRfqOpen(false);
      fetchData();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Error creating RFQ');
    }
  };

  const handleSelectVendor = async (rfqId: string) => {
    await vendorProcurementService.selectVendor(rfqId);
    fetchData();
  };

  const handleDeleteRFQ = async (rfqId: string) => {
    await vendorProcurementService.deleteRFQ(rfqId);
    fetchData();
  };

  /* ── PO handlers ── */
  const openPOForm = (rfq?: VendorRFQ) => {
    setPoForm({
      project_id: rfq?.project_id || '',
      vendor_id: rfq?.vendor_id || '',
      material_id: rfq?.material_id || '',
      rfq_id: rfq?.id || '',
      quantity: rfq?.required_quantity || '',
      unit: rfq?.unit || rfq?.material?.unit || '',
      unit_price: rfq?.quoted_price || '',
      total_price: (Number(rfq?.required_quantity || 0) * Number(rfq?.quoted_price || 0)) || '',
      delivery_date: '',
      payment_terms: '',
      notes: '',
    });
    setPoOpen(true);
  };

  const handleGeneratePO = async () => {
    try {
      const total = Number(poForm.quantity || 0) * Number(poForm.unit_price || 0);
      await vendorProcurementService.generatePO({ ...poForm, total_price: total });
      setPoOpen(false);
      fetchData();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Error generating PO');
    }
  };

  /* ── Group RFQs ── */
  const rfqGroups: Record<string, VendorRFQ[]> = {};
  rfqs.forEach(r => {
    const key = BTICK${r.project_id}__${r.material_id}BTICK;
    if (!rfqGroups[key]) rfqGroups[key] = [];
    rfqGroups[key].push(r);
  });

  /* ══════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════ */
  return (
    <Box sx={{ pb: 2 }}>

      {/* ── Page Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: T.radius, background: T.gradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(21,128,61,0.18)',
          '& svg': { fontSize: 26, color: T.white },
        }}>
          <CartIcon />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 22, color: T.textPrimary, letterSpacing: -0.3 }}>
            PO to Vendor
          </Typography>
          <Typography sx={{ fontSize: 13, color: T.textSecondary }}>
            Manage vendor quotation requests and purchase orders
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={fetchData}
            sx={{
              borderColor: T.border, color: T.textSecondary, borderRadius: T.radiusSm,
              textTransform: 'none', fontWeight: 600, fontSize: 13, px: 2.5, py: 1,
              '&:hover': { borderColor: T.primary, color: T.primary, bgcolor: T.primaryBg },
              transition: 'all 0.2s',
            }}>
            Refresh
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openRFQForm}
            sx={{
              background: T.gradient, borderRadius: T.radiusSm,
              textTransform: 'none', fontWeight: 700, fontSize: 13, px: 2.5, py: 1,
              boxShadow: '0 4px 14px rgba(21,128,61,0.15)',
              '&:hover': { boxShadow: '0 6px 20px rgba(21,128,61,0.25)', transform: 'translateY(-1px)' },
              transition: 'all 0.2s',
            }}>
            New RFQ
          </Button>
        </Stack>
      </Box>

      {/* ── Tabs ── */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={{
          mb: 3,
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

      {/* ═══ TAB 0: RFQ & Comparison ═══ */}
      {tab === 0 && (
        <Box>
          {loading ? (
            <Stack spacing={2}>
              {[0, 1].map(i => <Skeleton key={i} variant="rounded" height={120} sx={{ borderRadius: T.radius }} />)}
            </Stack>
          ) : Object.keys(rfqGroups).length === 0 ? (
            /* Empty State */
            <Card sx={{
              borderRadius: T.radius, border: BTICK1px solid ${T.border}BTICK,
              boxShadow: T.shadow, textAlign: 'center', py: 8, overflow: 'hidden',
              '&::before': { content: '""', display: 'block', height: 4, background: T.gradient, mt: -8, mb: 5 },
            }}>
              <CardContent>
                <Box sx={{
                  width: 64, height: 64, borderRadius: '50%', bgcolor: T.primaryBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
                }}>
                  <RFQIcon sx={{ fontSize: 32, color: T.primaryLight }} />
                </Box>
                <Typography sx={{ fontSize: 16, fontWeight: 600, color: T.textPrimary, mb: 0.5 }}>
                  No vendor quotation requests yet
                </Typography>
                <Typography sx={{ fontSize: 13, color: T.textSecondary, mb: 3 }}>
                  Click "New RFQ" to start procurement.
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openRFQForm}
                  sx={{
                    background: T.gradient, borderRadius: T.radiusSm,
                    textTransform: 'none', fontWeight: 600, fontSize: 13, px: 3, py: 1,
                    boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd },
                  }}>
                  Create First RFQ
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={2}>
              {Object.entries(rfqGroups).map(([key, group]) => {
                const first = group[0];
                return (
                  <Card key={key} sx={{
                    borderRadius: T.radius, border: BTICK1px solid ${T.border}BTICK,
                    boxShadow: T.shadow, overflow: 'hidden', transition: 'all 0.2s',
                    '&:hover': { boxShadow: T.shadowMd, borderColor: T.primaryLight + '44' },
                    '&::before': { content: '""', display: 'block', height: 3, background: T.gradient },
                  }}>
                    <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{
                            width: 36, height: 36, borderRadius: T.radiusXs, background: T.gradient,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            '& svg': { fontSize: 18, color: T.white },
                          }}>
                            <InventoryIcon />
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>
                              {first.material?.material_name || 'Material'} — {first.project?.project_name || 'Project'}
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: T.textSecondary }}>
                              Qty: {first.required_quantity} {first.unit || first.material?.unit} · {group.length} vendor{group.length > 1 ? 's' : ''}
                            </Typography>
                          </Box>
                        </Box>
                        {group.some(r => r.is_selected && r.status === 'accepted') && (
                          <Button size="small" variant="contained" startIcon={<AssignmentIcon />}
                            onClick={() => openPOForm(group.find(r => r.is_selected)!)}
                            sx={{
                              background: T.gradient, borderRadius: T.radiusXs,
                              textTransform: 'none', fontWeight: 600, fontSize: 12, px: 2,
                              boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd },
                            }}>
                            Generate PO
                          </Button>
                        )}
                      </Box>

                      {/* Vendor Comparison Table */}
                      <Box sx={{
                        borderRadius: T.radiusSm, border: BTICK1px solid ${T.border}BTICK,
                        overflow: 'hidden',
                      }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: T.bg }}>
                              <TableCell sx={thSx}>Vendor</TableCell>
                              <TableCell sx={thSx} align="right">Quoted Price</TableCell>
                              <TableCell sx={thSx}>Lead Time</TableCell>
                              <TableCell sx={thSx}>Status</TableCell>
                              <TableCell sx={thSx} align="center">Actions</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {group.map(rfq => (
                              <TableRow key={rfq.id}
                                sx={{
                                  bgcolor: rfq.is_selected ? T.primaryBg : T.white,
                                  '&:hover': { bgcolor: rfq.is_selected ? T.primaryBg : T.bg },
                                  transition: 'background 0.15s',
                                }}>
                                <TableCell sx={{ fontSize: 13, fontWeight: rfq.is_selected ? 600 : 400, py: 1.5 }}>
                                  {rfq.vendor?.vendor_name || '\u2014'}
                                  {rfq.is_selected && (
                                    <Chip label="Selected" size="small" sx={{
                                      ml: 1, height: 20, fontSize: 10, fontWeight: 700,
                                      bgcolor: BTICK${T.primaryLight}22BTICK, color: T.primary, borderRadius: '6px',
                                    }} />
                                  )}
                                </TableCell>
                                <TableCell sx={{ fontSize: 13 }} align="right">
                                  {rfq.quoted_price ? BTICK\u20B9${Number(rfq.quoted_price).toLocaleString('en-IN')}BTICK : '\u2014'}
                                </TableCell>
                                <TableCell sx={{ fontSize: 13 }}>{rfq.lead_time || '\u2014'}</TableCell>
                                <TableCell sx={{ py: 1.5 }}>
                                  <Chip label={rfq.status} size="small" sx={{
                                    height: 22, fontSize: 11, fontWeight: 700, borderRadius: '6px',
                                    bgcolor: alpha(STATUS_COLORS[rfq.status] || '#94A3B8', 0.1),
                                    color: STATUS_COLORS[rfq.status] || '#64748B',
                                  }} />
                                </TableCell>
                                <TableCell align="center" sx={{ py: 1.5 }}>
                                  <Tooltip title="Select Vendor" arrow>
                                    <span>
                                    <IconButton size="small" onClick={() => handleSelectVendor(rfq.id)}
                                      disabled={rfq.is_selected}
                                      sx={{ color: T.textSecondary, '&:hover': { color: T.primary, bgcolor: T.primaryBg } }}>
                                      <SelectIcon sx={{ fontSize: 18 }} />
                                    </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Delete" arrow>
                                    <IconButton size="small" onClick={() => handleDeleteRFQ(rfq.id)}
                                      sx={{ color: T.textSecondary, '&:hover': { color: T.danger, bgcolor: T.dangerBg } }}>
                                      <DeleteIcon sx={{ fontSize: 18 }} />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                              </TableRow>
                            ))}
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

      {/* ═══ TAB 1: Purchase Orders ═══ */}
      {tab === 1 && (
        <Card sx={{
          borderRadius: T.radius, border: BTICK1px solid ${T.border}BTICK,
          boxShadow: T.shadow, overflow: 'hidden',
          '&::before': { content: '""', display: 'block', height: 3, background: T.gradient },
        }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            {pos.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Box sx={{
                  width: 64, height: 64, borderRadius: '50%', bgcolor: T.primaryBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
                }}>
                  <ShipIcon sx={{ fontSize: 32, color: T.primaryLight }} />
                </Box>
                <Typography sx={{ fontSize: 15, fontWeight: 600, color: T.textPrimary, mb: 0.5 }}>
                  No purchase orders generated yet
                </Typography>
                <Typography sx={{ fontSize: 13, color: T.textSecondary }}>
                  Accept a vendor quotation to generate a purchase order.
                </Typography>
              </Box>
            ) : (
              <Box sx={{ overflow: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: T.bg }}>
                      <TableCell sx={thSx}>PO Number</TableCell>
                      <TableCell sx={thSx}>Vendor</TableCell>
                      <TableCell sx={thSx}>Material</TableCell>
                      <TableCell sx={thSx}>Project</TableCell>
                      <TableCell sx={thSx} align="right">Qty</TableCell>
                      <TableCell sx={thSx} align="right">Total</TableCell>
                      <TableCell sx={thSx}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pos.map(po => (
                      <TableRow key={po.id} sx={{
                        '&:hover': { bgcolor: T.bg },
                        transition: 'background 0.15s',
                      }}>
                        <TableCell sx={{ fontSize: 13, fontWeight: 700, color: T.primary, py: 1.5 }}>
                          {po.po_number}
                        </TableCell>
                        <TableCell sx={{ fontSize: 13 }}>{po.vendor?.vendor_name || '\u2014'}</TableCell>
                        <TableCell sx={{ fontSize: 13 }}>{po.material?.material_name || '\u2014'}</TableCell>
                        <TableCell sx={{ fontSize: 13 }}>{po.project?.project_name || '\u2014'}</TableCell>
                        <TableCell sx={{ fontSize: 13 }} align="right">{po.quantity} {po.unit}</TableCell>
                        <TableCell sx={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }} align="right">
                          {BTICK\u20B9${Number(po.total_price).toLocaleString('en-IN')}BTICK}
                        </TableCell>
                        <TableCell sx={{ py: 1.5 }}>
                          <Chip label={po.status} size="small" sx={{
                            height: 22, fontSize: 11, fontWeight: 700, borderRadius: '6px',
                            bgcolor: alpha(STATUS_COLORS[po.status] || '#94A3B8', 0.1),
                            color: STATUS_COLORS[po.status] || '#64748B',
                          }} />
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

      {/* ═══ NEW RFQ MODAL ═══ */}
      <Dialog open={rfqOpen} onClose={() => setRfqOpen(false)} maxWidth="sm" fullWidth
        TransitionComponent={Fade}
        PaperProps={{
          sx: {
            borderRadius: T.radius, boxShadow: T.shadowLg,
            maxWidth: 560, overflow: 'hidden',
          },
        }}>
        {/* Modal Header with accent bar */}
        <Box sx={{ height: 4, background: T.gradient }} />
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 3, pt: 2.5, pb: 0,
        }}>
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
            {/* Project */}
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

            {/* Material */}
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

            {/* Suggested Vendors */}
            {suggestedVendors.length > 0 && (
              <Box sx={{
                p: 2, borderRadius: T.radiusXs, bgcolor: T.primaryBg,
                border: BTICK1px solid ${T.primaryLight}22BTICK,
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

            {/* Vendor */}
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

            {/* Quantity & Unit row */}
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

            {/* Price & Lead Time row */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField fullWidth size="small" label="Quoted Price" type="number" sx={inputSx}
                value={rfqForm.quoted_price || ''}
                onChange={e => setRfqForm((f: any) => ({ ...f, quoted_price: e.target.value }))}
                InputProps={{
                  startAdornment: <InputAdornment position="start" sx={{ '& .MuiTypography-root': { color: T.textSecondary, fontSize: 14 } }}>{'\u20B9'}</InputAdornment>,
                }}
              />
              <TextField fullWidth size="small" label="Lead Time" sx={inputSx}
                placeholder="e.g. 5 days"
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
            sx={{
              borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 600, fontSize: 13,
              color: T.textSecondary, px: 2.5,
              '&:hover': { bgcolor: T.bg },
            }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreateRFQ}
            sx={{
              background: T.gradient, borderRadius: T.radiusXs,
              textTransform: 'none', fontWeight: 700, fontSize: 13, px: 3,
              boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd },
            }}>
            Create RFQ
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ GENERATE PO MODAL ═══ */}
      <Dialog open={poOpen} onClose={() => setPoOpen(false)} maxWidth="sm" fullWidth
        TransitionComponent={Fade}
        PaperProps={{
          sx: {
            borderRadius: T.radius, boxShadow: T.shadowLg,
            maxWidth: 560, overflow: 'hidden',
          },
        }}>
        <Box sx={{ height: 4, background: T.gradient }} />
        <DialogTitle sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 3, pt: 2.5, pb: 0,
        }}>
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

            {/* Total Price Box */}
            <Box sx={{
              p: 2, borderRadius: T.radiusXs, bgcolor: T.primaryBg,
              border: BTICK1px solid ${T.primaryLight}22BTICK,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.textSecondary }}>Total Price</Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 800, color: T.primary }}>
                {BTICK\u20B9${(Number(poForm.quantity || 0) * Number(poForm.unit_price || 0)).toLocaleString('en-IN')}BTICK}
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
            sx={{
              borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 600, fontSize: 13,
              color: T.textSecondary, px: 2.5,
              '&:hover': { bgcolor: T.bg },
            }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleGeneratePO}
            sx={{
              background: T.gradient, borderRadius: T.radiusXs,
              textTransform: 'none', fontWeight: 700, fontSize: 13, px: 3,
              boxShadow: 'none', '&:hover': { boxShadow: T.shadowMd },
            }}>
            Generate PO
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default VendorProcurementPage;
"""

content = content.replace("BTICK", "`")

path = r"c:\Users\priya\Forged-Final\frontend\src\pages\VendorProcurementPage.tsx"
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print(f"Written {len(content)} chars to {path}")
