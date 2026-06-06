import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, Button, IconButton, TextField, Select, MenuItem,
  FormControl, Tooltip, alpha, Checkbox, Stack, Divider, Switch,
  CircularProgress, Menu, Chip, Table, TableHead, TableRow, TableCell, TableBody,
  Snackbar, Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Save as SaveIcon,
  Download as DownloadIcon,
  Send as SendIcon,
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  MoreVert as MoreIcon,
  CloudUpload as UploadIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
  CheckCircle as CheckCircleIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { ShoppingCart } from 'lucide-react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { vendorProcurementService } from '../../services/vendorProcurementService';
import {
  RFQBundle, VendorSuppliedPart, VendorPurchaseOrder, Project,
} from '../../types';
import api, { getBackendBaseUrl } from '../../services/api';
import { UI, TabContainer, EnhancedNavFooter, AnimatedSection } from '../UIComponents';
import { viewFileByPath } from '../../utils/documentUtils';

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Design Tokens
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
const T = {
  primary:      UI.primary,
  primaryLight: UI.primaryLight,
  primaryBg:    UI.primaryBg,
  dark:         UI.textPrimary,
  text:         UI.textPrimary,
  textSec:      UI.textMuted,
  border:       UI.border,
  bg:           UI.bgSubtle,
  white:        UI.bgCard,
  danger:       UI.danger,
  dangerBg:     UI.dangerBg,
  r:            UI.radiusSm,
  rSm:          UI.radiusXs,
  shadow:       UI.shadow,
  shadowMd:     UI.shadowMd,
};

const DEFAULT_PO_TERMS = `1. Delivery Timeline:
As per purchase order requirements. Seller will notify Buyer of any delays.

2. Payment Terms:
Net 30 days from invoice date unless otherwise agreed in writing.

3. Taxation:
All prices are exclusive of applicable taxes unless stated otherwise. Buyer is responsible for all applicable taxes.

4. Confidentiality:
Both parties agree to maintain confidentiality of all proprietary information exchanged in connection with this purchase order.`;

const STATUS: Record<string, { color: string; bg: string; label: string }> = {
  draft:        { color: '#6B7280', bg: 'var(--bg-surface-2)', label: 'Draft' },
  sent:         { color: '#006699', bg: 'rgba(0, 200, 255, 0.06)', label: 'Sent' },
  quoted:       { color: '#006699', bg: 'rgba(0, 200, 255, 0.08)', label: 'Quoted' },
  accepted:     { color: '#0099cc', bg: 'rgba(0, 200, 255, 0.08)', label: 'Accepted' },
  rejected:     { color: '#991B1B', bg: '#FEF2F2', label: 'Rejected' },
  acknowledged: { color: '#006699', bg: 'rgba(0, 200, 255, 0.08)', label: 'Acknowledged' },
  delivered:    { color: '#0099cc', bg: 'rgba(0, 200, 255, 0.08)', label: 'Delivered' },
  cancelled:    { color: '#991B1B', bg: '#FEF2F2', label: 'Cancelled' },
};

const Badge: React.FC<{ status: string }> = ({ status }) => {
  const s = STATUS[status] || { color: '#6B7280', bg: 'var(--bg-surface-2)', label: status };
  return (
    <Chip label={s.label} size="small" sx={{
      height: 22, fontSize: 11, fontWeight: 600, borderRadius: '6px',
      bgcolor: s.bg, color: s.color, border: `1px solid ${alpha(s.color, 0.15)}`,
    }} />
  );
};

const fld = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '6px', bgcolor: 'var(--bg-input)', fontSize: 13,
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: T.primaryLight },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.primary, borderWidth: 2 },
  },
  '& .MuiInputLabel-root': { fontSize: 13 },
};

const lbl = { fontSize: 11.5, fontWeight: 400, color: 'var(--text-secondary)', mb: 0.5, letterSpacing: 0.1 } as const;

const SectionBtn: React.FC<{
  icon: React.ReactNode; label: string; color?: string; bg?: string;
  onClick: () => void; disabled?: boolean; loading?: boolean;
}> = ({ icon, label, color = '#fff', bg = T.primary, onClick, disabled, loading }) => (
  <Button
    variant="contained" size="small" startIcon={loading ? <CircularProgress size={14} color="inherit" /> : icon}
    disabled={disabled || loading}
    onClick={onClick}
    sx={{
      bgcolor: bg, color, fontWeight: 600, fontSize: 11.5, textTransform: 'none',
      borderRadius: '6px', px: 1.5, py: 0.6, boxShadow: 'none',
      '&:hover': { bgcolor: bg, filter: 'brightness(0.9)', boxShadow: 'none' },
    }}
  >
    {label}
  </Button>
);

const ReadOnlyField: React.FC<{ value: string }> = ({ value }) => (
  <Box sx={{ py: 1, px: 1.25, borderRadius: '6px', border: `1px solid ${T.border}`, bgcolor: T.bg, minHeight: 38, display: 'flex', alignItems: 'center' }}>
    <Typography fontSize={13} color={T.text}>{value}</Typography>
  </Box>
);

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   RFQ Card
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
interface RFQFormItem {
  part_id: string;
  part_description: string;
  material?: string;
  material_grade?: string;
  quantity: number | string;
  selected: boolean;
}

interface RFQCardProps {
  bundle: RFQBundle;
  index: number;
  vendors: any[];
  vendorParts: VendorSuppliedPart[];
  expanded: boolean;
  onToggle: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onToast: (msg: string, severity: 'success' | 'error' | 'warning') => void;
}

const RFQCard: React.FC<RFQCardProps> = ({
  bundle, index, vendors, vendorParts, expanded, onToggle, onSaved, onDeleted, onToast,
}) => {
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const isSent = sentSuccess || ['sent', 'quoted', 'accepted'].includes(bundle.status || '');

  const DEFAULT_RFQ_INSTRUCTIONS = [
    'Please provide your best quotation for the above items.',
    'Need materials before: As soon as possible.',
    'Freight Not Included: Freight charges are not included. Any freight costs will be calculated and billed separately.',
  ];

  const [vendorId, setVendorId] = useState(bundle.vendor_id || '');
  const [needBefore, setNeedBefore] = useState<Date | null>(
    bundle.need_materials_before ? new Date(bundle.need_materials_before) : null,
  );
  const [instructions, setInstructions] = useState<string[]>(
    () => Array.isArray(bundle.instructions) && bundle.instructions.length > 0
      ? bundle.instructions
      : DEFAULT_RFQ_INSTRUCTIONS,
  );
  const [items, setItems] = useState<RFQFormItem[]>(() => {
    if (bundle.items && bundle.items.length > 0) {
      return bundle.items.map(it => ({
        part_id: it.part_id, part_description: it.part_description,
        material: it.material || '', material_grade: it.material_grade || '',
        quantity: it.quantity || '',
        selected: true,
      }));
    }
    return vendorParts.map(vp => ({
      part_id: vp.id,
      part_description: [vp.material, vp.material_grade, vp.form, vp.shape, vp.raw_material_dimension, vp.condition].filter(Boolean).join(' | ') || vp.job_description,
      material: vp.material, material_grade: vp.material_grade,
      quantity: vp.quantity || '', selected: true,
    }));
  });

  const toggleItem = (idx: number) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));
  const updateRFQQuantity = (idx: number, val: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it));
  };

  const handleSave = async () => {
    if (!vendorId) { onToast('Please select a vendor', 'error'); return; }
    const selectedItems = items.filter(i => i.selected);
    if (selectedItems.length === 0) { onToast('Please select at least one raw material', 'error'); return; }
    const missingQty = selectedItems.some(i => !i.quantity || Number(i.quantity) <= 0);
    if (missingQty) { onToast('Please enter quantity for all selected parts', 'error'); return; }
    setSaving(true);
    try {
      const payload: any = {
        project_id: bundle.project_id,
        vendor_id: vendorId,
        need_materials_before: needBefore ? needBefore.toISOString().slice(0, 10) : undefined,
        instructions: instructions.filter(s => s.trim()),
        items: selectedItems.map(i => ({
          part_id: i.part_id,
          part_description: i.part_description,
          material: i.material,
          material_grade: i.material_grade,
          quantity: Number(i.quantity) || 0,
        })),
      };
      if (bundle.id) {
        await vendorProcurementService.updateRFQBundle(bundle.id, payload);
      } else {
        await vendorProcurementService.createRFQBundle(payload);
      }
      onSaved();
      setSaved(true);
      onToast('RFQ saved successfully', 'success');
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { onToast(e?.response?.data?.message || 'Error saving RFQ', 'error'); }
    setSaving(false);
  };

  const handleSend = async () => {
    if (!bundle.id) { onToast('Save the RFQ first', 'error'); return; }
    if (!vendorId) { onToast('Please select a vendor', 'error'); return; }
    const vendor = vendors.find((v: any) => v.id === vendorId);
    const vendorEmail = (vendor?.contact_email || '').trim();
    if (!vendorEmail) { onToast('Email ID not available', 'error'); return; }
    const selectedItems = items.filter(i => i.selected);
    if (selectedItems.length === 0) { onToast('Please select at least one raw material', 'error'); return; }
    const missingQty = selectedItems.some(i => !i.quantity || Number(i.quantity) <= 0);
    if (missingQty) { onToast('Quantity is mandatory for all selected parts', 'error'); return; }
    setSending(true);
    try {
      const { emailSent } = await vendorProcurementService.sendRFQToVendor(bundle.id);
      if (!emailSent) {
        onToast('Failed to send RFQ email', 'error');
        return;
      }
      setSentSuccess(true);
      onToast('RFQ sent to vendor successfully', 'success');
      onSaved();
    }
    catch (e: any) {
      const errMsg = e?.response?.data?.message || '';
      // Fallback to mailto if email service is not configured
      if (errMsg.toLowerCase().includes('not configured') || errMsg.toLowerCase().includes('email service')) {
        try {
          // Mark RFQ as sent FIRST so it appears in PO dropdown
          await vendorProcurementService.updateRFQBundle(bundle.id, { status: 'sent' });
          // Download PDF
          await vendorProcurementService.downloadRFQBundlePdf(bundle.id);
          // Build mailto link
          const vendorCc = (vendor?.cc_email || '').trim();
          const rfqNumber = bundle.rfq_number || `RFQ-${bundle.id}`;
          const subject = encodeURIComponent(`Request for Quotation: ${rfqNumber}`);
          const body = encodeURIComponent(
            `Dear ${vendor?.contact_name || 'Vendor'},\n\n` +
            `Please find attached the Request for Quotation (${rfqNumber}).\n\n` +
            `Kindly review and provide your best quotation at the earliest.\n\n` +
            `Best regards`
          );
          let mailto = `mailto:${vendorEmail}?subject=${subject}&body=${body}`;
          if (vendorCc) mailto += `&cc=${encodeURIComponent(vendorCc)}`;
          window.open(mailto, '_blank');
          setSentSuccess(true);
          onToast('RFQ downloaded. Please attach it to the email that just opened.', 'success');
          onSaved();
        } catch (fallbackErr: any) {
          onToast(fallbackErr?.response?.data?.message || 'Error downloading RFQ PDF', 'error');
        }
      } else {
        onToast(errMsg || 'Error sending RFQ', 'error');
      }
    }
    setSending(false);
  };

  const handleDuplicate = async () => {
    if (!bundle.id) return;
    try { await vendorProcurementService.duplicateRFQBundle(bundle.id); onToast('RFQ duplicated', 'success'); onSaved(); }
    catch (e: any) { onToast(e?.response?.data?.message || 'Error duplicating', 'error'); }
    setAnchorEl(null);
  };

  const handleDelete = async () => {
    if (!bundle.id) { onDeleted(); return; }
    if (!window.confirm('Delete this RFQ?')) return;
    try { await vendorProcurementService.deleteRFQBundle(bundle.id); onToast('RFQ deleted', 'success'); onDeleted(); }
    catch (e: any) { onToast(e?.response?.data?.message || 'Error deleting RFQ', 'error'); }
    setAnchorEl(null);
  };

  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    if (!bundle.id) { onToast('Save the RFQ first', 'error'); return; }
    setDownloading(true);
    try { await vendorProcurementService.downloadRFQBundlePdf(bundle.id); }
    catch (e: any) { onToast(e?.response?.data?.message || 'Error downloading RFQ PDF', 'error'); }
    setDownloading(false);
  };

  const rfqLabel = bundle.rfq_number || `RFQ #${index + 1}`;
  const dateStr = bundle.date
    ? new Date(bundle.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <Card elevation={0} sx={{ border: `1px solid ${T.border}`, borderRadius: T.r, mb: 2, overflow: 'hidden', boxShadow: T.shadow }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2.5, py: 1.5, bgcolor: T.bg,
        borderBottom: expanded ? `1px solid ${T.border}` : 'none', cursor: 'pointer',
      }} onClick={onToggle}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography fontWeight={700} fontSize={14} color={T.dark}>{rfqLabel}</Typography>
          <Badge status={bundle.status || 'draft'} />
        </Box>
        <Stack direction="row" spacing={0.5} alignItems="center" onClick={e => e.stopPropagation()}>
          <SectionBtn
            icon={saved ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : <SaveIcon sx={{ fontSize: 14 }} />}
            label={saving ? 'Savingâ€¦' : saved ? 'Saved' : 'Save'}
            bg={saved ? '#16A34A' : T.primary}
            onClick={handleSave}
            loading={saving}
            disabled={saved}
          />
          <SectionBtn icon={<DownloadIcon sx={{ fontSize: 14 }} />} label="Download" bg="#374151" onClick={handleDownload} loading={downloading} />
          <SectionBtn
            icon={isSent ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : <SendIcon sx={{ fontSize: 14 }} />}
            label={sending ? 'Sendingâ€¦' : isSent ? 'Sent to Vendor' : 'Send to Vendor'}
            bg={isSent ? '#16A34A' : '#006699'}
            onClick={handleSend}
            loading={sending}
            disabled={isSent}
          />
          <Tooltip title="More"><IconButton size="small" onClick={e => setAnchorEl(e.currentTarget)}><MoreIcon fontSize="small" /></IconButton></Tooltip>
          <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)} PaperProps={{ sx: { borderRadius: '8px', minWidth: 160 } }}>
            <MenuItem onClick={handleDuplicate} sx={{ fontSize: 13 }}><CopyIcon sx={{ fontSize: 16, mr: 1 }} /> Duplicate</MenuItem>
            <MenuItem onClick={handleDelete} sx={{ fontSize: 13, color: T.danger }}><DeleteIcon sx={{ fontSize: 16, mr: 1 }} /> Delete</MenuItem>
          </Menu>
          <IconButton size="small" onClick={onToggle}
            sx={{ color: T.textSec, border: `1px solid ${T.border}`, borderRadius: '8px', width: 30, height: 30, ml: 0.5, '&:hover': { bgcolor: 'var(--border-subtle)' } }}>
            {expanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
          </IconButton>
        </Stack>
      </Box>

      {/* Body */}
      {expanded && (
        <Box sx={{ px: 2.5, py: 2 }}>
          {/* Fields row */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2, mb: 2.5 }}>
            <Box>
              <Typography sx={lbl}>Project Name</Typography>
              <ReadOnlyField value={bundle.project?.project_name || 'Auto Filled'} />
            </Box>
            <Box>
              <Typography sx={lbl}>Vendor</Typography>
              <FormControl fullWidth size="small" sx={fld}>
                <Select value={vendorId} onChange={e => setVendorId(e.target.value as string)} displayEmpty sx={{ fontSize: 13 }}>
                  <MenuItem value="" disabled>Select Vendor</MenuItem>
                  {vendors.map((v: any) => <MenuItem key={v.id} value={v.id} sx={{ fontSize: 13 }}>{v.vendor_name}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
            <Box>
              <Typography sx={lbl}>Date</Typography>
              <ReadOnlyField value={dateStr} />
            </Box>
            <Box>
              <Typography sx={lbl}>Need Materials Before</Typography>
              <LocalizationProvider dateAdapter={AdapterDateFns}>
                <DatePicker value={needBefore} onChange={d => setNeedBefore(d)}
                  slotProps={{ textField: { fullWidth: true, size: 'small', sx: fld, placeholder: 'Select Date' } }} />
              </LocalizationProvider>
            </Box>
          </Box>

          {/* Parts table */}
          <Box sx={{ border: `1px solid ${T.border}`, borderRadius: T.rSm, overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: T.dark }}>
                  <TableCell sx={{ color: '#fff', fontWeight: 500, fontSize: 12, width: 60, py: 1 }}>S.NO.</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 500, fontSize: 12, width: 70, py: 1 }}>SELECT</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 500, fontSize: 12, py: 1 }}>PART DESCRIPTION</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 500, fontSize: 12, width: 140, py: 1 }}>QUANTITY</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: T.textSec, fontSize: 13 }}>
                    No vendor-supplied parts found in estimation
                  </TableCell></TableRow>
                ) : items.map((item, idx) => (
                  <TableRow key={idx} sx={{ '&:nth-of-type(even)': { bgcolor: 'var(--bg-canvas)' } }}>
                    <TableCell sx={{ fontSize: 13, py: 0.8 }}>{idx + 1}</TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      <Checkbox size="small" checked={item.selected} onChange={() => toggleItem(idx)}
                        sx={{ p: 0, color: T.border, '&.Mui-checked': { color: T.primary } }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 13, py: 0.8 }}>
                      {item.part_description || 'â€”'}
                      {item.material ? <Typography component="span" sx={{ fontSize: 11, color: T.textSec, ml: 1 }}>({item.material}{item.material_grade ? ` / ${item.material_grade}` : ''})</Typography> : null}
                    </TableCell>
                    <TableCell sx={{ py: 0.8 }}>
                      <TextField size="small" value={item.quantity} placeholder="Enter Quantity"
                        onChange={e => updateRFQQuantity(idx, e.target.value)}
                        type="number"
                        sx={{ ...fld, width: 120 }} inputProps={{ style: { fontSize: 13 }, min: 0 }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          {/* Instructions section */}
          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.dark, mb: 1 }}>Instructions (appears on RFQ PDF)</Typography>
            {instructions.map((instr, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                <Typography sx={{ fontSize: 13, color: T.textSec, mt: 0.8, minWidth: 16 }}>{idx + 1}.</Typography>
                <TextField
                  fullWidth size="small" multiline minRows={1} maxRows={3}
                  value={instr}
                  onChange={e => {
                    const updated = [...instructions];
                    updated[idx] = e.target.value;
                    setInstructions(updated);
                  }}
                  sx={{ ...fld, flex: 1 }}
                  inputProps={{ style: { fontSize: 13 } }}
                />
                <IconButton size="small" onClick={() => setInstructions(prev => prev.filter((_, i) => i !== idx))}
                  sx={{ mt: 0.3, color: T.danger, '&:hover': { bgcolor: T.dangerBg } }}>
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon sx={{ fontSize: 14 }} />}
              onClick={() => setInstructions(prev => [...prev, ''])}
              sx={{ fontSize: 12, textTransform: 'none', color: T.primary, fontWeight: 600, mt: 0.5 }}>
              Add Instruction
            </Button>
          </Box>
        </Box>
      )}
    </Card>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   PO Card â€” Professional Procurement Design
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
interface POFormItem {
  part_id?: string;
  part_description: string;
  quantity: string;
  unit_cost: string;
  weight: string;
  weight_unit: string;
  cost_per_weight: string;
  line_total: string;
  selected: boolean;
  // Structured description fields (for 2-line display)
  material?: string;
  material_grade?: string;
  condition?: string;
  form?: string;
  dimension?: string;
}

interface POCardProps {
  po: VendorPurchaseOrder;
  index: number;
  rfqBundles: RFQBundle[];
  vendors: any[];
  vendorParts: VendorSuppliedPart[];
  expanded: boolean;
  projectName: string;
  onToggle: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  onToast: (msg: string, severity: 'success' | 'error' | 'warning') => void;
}

const POCard: React.FC<POCardProps> = ({
  po, index, rfqBundles, vendors, vendorParts, expanded, projectName, onToggle, onSaved, onDeleted, onToast,
}) => {
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const isPOSent = sentSuccess || ['sent', 'acknowledged', 'delivered'].includes(po.status || '');

  const approvedRFQs = rfqBundles.filter(b => b.id && b.status === 'sent');

  const [rfqBundleId, setRfqBundleId] = useState(po.rfq_bundle_id || '');
  const [vendorId, setVendorId] = useState(po.vendor_id || '');
  const [taxType, setTaxType] = useState(po.tax_type || 'exempt');
  const [quotationFiles, setQuotationFiles] = useState<File[]>([]);
  const [costMode, setCostMode] = useState<'unit' | 'weight'>((po.cost_mode as 'unit' | 'weight') || 'unit');
  const [termsConditions, setTermsConditions] = useState(po.terms_conditions || DEFAULT_PO_TERMS);
  const [poDateState, setPoDateState] = useState(po.po_date ? po.po_date.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [notesState, setNotesState] = useState(po.notes || '');
  const [items, setItems] = useState<POFormItem[]>(() => {
    if (po.items && po.items.length > 0) {
      return po.items.map(it => {
        const vp = vendorParts.find(v => v.id === it.part_id);
        return {
          part_id: it.part_id || '',
          part_description: it.part_description,
          quantity: String(it.quantity || ''),
          unit_cost: String(it.unit_cost || ''),
          weight: String(it.weight || ''),
          weight_unit: it.weight_unit || 'KG',
          cost_per_weight: String(it.cost_per_weight || ''),
          line_total: String(it.line_total || ''),
          selected: it.selected !== false,
          material: vp?.material || '',
          material_grade: vp?.material_grade || '',
          condition: vp?.condition || '',
          form: vp?.form || '',
          dimension: vp?.raw_material_dimension || '',
        };
      });
    }
    return [];
  });

  /* â”€â”€ RFQ selection auto-fills vendor + parts â”€â”€ */
  const handleRFQChange = (bid: string) => {
    setRfqBundleId(bid);
    const b = rfqBundles.find(r => r.id === bid);
    if (b) {
      setVendorId(b.vendor_id);
      if (b.items && b.items.length > 0) {
        setItems(b.items.map(it => {
          const vp = vendorParts.find(v => v.id === it.part_id);
          return {
            part_id: it.part_id,
            part_description: it.part_description,
            quantity: String(it.quantity || ''),
            unit_cost: '',
            weight: '',
            weight_unit: 'KG',
            cost_per_weight: '',
            line_total: '',
            selected: true,
            material: vp?.material || it.material || '',
            material_grade: vp?.material_grade || it.material_grade || '',
            condition: vp?.condition || '',
            form: vp?.form || '',
            dimension: vp?.raw_material_dimension || '',
          };
        }));
      } else {
        setItems([]);
      }
    } else {
      setVendorId('');
      setItems([]);
    }
  };

  const toggleItem = (idx: number) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, selected: !it.selected } : it));

  const updateField = (idx: number, field: 'quantity' | 'unit_cost' | 'part_description' | 'weight' | 'cost_per_weight' | 'weight_unit', val: string) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const upd = { ...it, [field]: val };
      if (field === 'quantity' || field === 'weight' || field === 'unit_cost') {
        if (costMode === 'weight') {
          upd.line_total = String((Number(upd.weight) || 0) * (Number(upd.unit_cost) || 0));
        } else {
          upd.line_total = String((Number(upd.quantity) || 0) * (Number(upd.unit_cost) || 0));
        }
      }
      return upd;
    }));
  };

  const addBlankItem = () => {
    setItems(prev => [...prev, { part_description: '', quantity: '', unit_cost: '', weight: '', weight_unit: 'KG', cost_per_weight: '', line_total: '', selected: true }]);
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) {
      setItems([{ part_description: '', quantity: '', unit_cost: '', weight: '', weight_unit: 'KG', cost_per_weight: '', line_total: '', selected: true }]);
    } else {
      setItems(prev => prev.filter((_, i) => i !== idx));
    }
  };

  /* â”€â”€ Calculated totals â”€â”€ */
  const subtotal = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
  const taxRate = taxType === '18%' ? 0.18 : taxType === '10%' ? 0.10 : 0;
  const taxAmount = subtotal * taxRate;
  const grandTotal = subtotal + taxAmount;
  const vendorName = vendors.find(v => v.id === vendorId)?.vendor_name || 'â€”';
  const fmtCurrency = (n: number) => n ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : 'â€”';

  /* â”€â”€ Save handler â”€â”€ */
  const handleSave = async () => {
    if (!rfqBundleId) { onToast('Please select an Approved RFQ', 'error'); return; }
    if (!vendorId) { onToast('Vendor must be auto-filled from the selected RFQ', 'error'); return; }
    if (items.length === 0) { onToast('No line items to save', 'error'); return; }
    const invalidQty = items.some(i => !i.quantity || isNaN(Number(i.quantity)) || Number(i.quantity) <= 0);
    if (invalidQty) { onToast('Quantity must be a number greater than 0 for all items', 'error'); return; }
    setSaving(true);
    try {
      const payload: any = {
        project_id: po.project_id,
        rfq_bundle_id: rfqBundleId || null,
        vendor_id: vendorId,
        po_date: poDateState,
        tax_type: taxType,
        notes: notesState,
        terms_conditions: termsConditions,
        cost_mode: costMode,
        items: items.map(i => ({
          part_id: i.part_id || null,
          part_description: i.part_description,
          quantity: Number(i.quantity) || 0,
          unit_cost: Number(i.unit_cost) || 0,
          weight: Number(i.weight) || 0,
          weight_unit: i.weight_unit || 'KG',
          cost_per_weight: Number(i.unit_cost) || 0,
          selected: true,
        })),
      };

      if (quotationFiles.length > 0) {
        const fd = new FormData();
        quotationFiles.forEach((f, idx) => fd.append('quotation_file', f));
        Object.keys(payload).forEach(k => {
          if (k === 'items') fd.append(k, JSON.stringify(payload[k]));
          else if (payload[k] != null) fd.append(k, String(payload[k]));
        });
        if (po.id) await vendorProcurementService.updateVendorPurchaseOrder(po.id, fd);
        else await vendorProcurementService.createVendorPurchaseOrder(fd);
      } else {
        if (po.id) await vendorProcurementService.updateVendorPurchaseOrder(po.id, payload);
        else await vendorProcurementService.createVendorPurchaseOrder(payload);
      }
      onSaved();
      setSaved(true);
      onToast('PO saved successfully', 'success');
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) { onToast(e?.response?.data?.message || 'Error saving PO', 'error'); }
    setSaving(false);
  };

  /* â”€â”€ Send to Vendor handler â”€â”€ */
  const handleSend = async () => {
    if (!po.id) {
      if (!rfqBundleId) { onToast('Please select an Approved RFQ', 'error'); return; }
      if (!vendorId) { onToast('Vendor must be auto-filled from the selected RFQ', 'error'); return; }
      if (items.length === 0) { onToast('No line items', 'error'); return; }
      onToast('Please save the PO first, then send.', 'error');
      return;
    }
    if (!rfqBundleId) { onToast('Please select an Approved RFQ', 'error'); return; }
    if (!vendorId) { onToast('Vendor must be auto-filled from the selected RFQ', 'error'); return; }
    const vendor = vendors.find((v: any) => v.id === vendorId);
    const vendorEmail = (vendor?.contact_email || '').trim();
    if (!vendorEmail) { onToast('Email ID not available', 'error'); return; }
    if (items.length === 0) { onToast('No line items to send', 'error'); return; }

    setSending(true);
    try {
      // Save first to persist latest changes
      const payload: any = {
        project_id: po.project_id,
        rfq_bundle_id: rfqBundleId || null,
        vendor_id: vendorId,
        po_date: poDateState,
        tax_type: taxType,
        notes: notesState,
        terms_conditions: termsConditions,
        cost_mode: costMode,
        items: items.map(i => ({
          part_id: i.part_id || null,
          part_description: i.part_description,
          quantity: Number(i.quantity) || 0,
          unit_cost: Number(i.unit_cost) || 0,
          weight: Number(i.weight) || 0,
          weight_unit: i.weight_unit || 'KG',
          cost_per_weight: Number(i.unit_cost) || 0,
          selected: true,
        })),
      };
      if (po.id) await vendorProcurementService.updateVendorPurchaseOrder(po.id, payload);

      // Send email with PDF attachment via backend
      const { emailSent } = await vendorProcurementService.sendVendorPOToVendor(po.id);
      if (!emailSent) {
        onToast('Failed to send PO email', 'error');
        return;
      }
      setSentSuccess(true);
      onToast('PO sent to vendor successfully', 'success');
      onSaved();
    } catch (e: any) {
      const errMsg = e?.response?.data?.message || '';
      // Fallback to mailto if email service is not configured
      if (errMsg.toLowerCase().includes('not configured') || errMsg.toLowerCase().includes('email service')) {
        try {
          // Mark PO as sent on the backend
          await vendorProcurementService.updateVendorPurchaseOrder(po.id, { status: 'sent' });
          // Download PDF
          await vendorProcurementService.downloadVendorPOPdf(po.id);
          // Build mailto link
          const vendorCc = (vendor?.cc_email || '').trim();
          const poNumber = po.po_number || `PO-${po.id}`;
          const subject = encodeURIComponent(`Purchase Order: ${poNumber}`);
          const body = encodeURIComponent(
            `Dear ${vendor?.contact_name || 'Vendor'},\n\n` +
            `Please find attached the Purchase Order (${poNumber}).\n\n` +
            `Kindly acknowledge receipt and confirm the delivery schedule.\n\n` +
            `Best regards`
          );
          let mailto = `mailto:${vendorEmail}?subject=${subject}&body=${body}`;
          if (vendorCc) mailto += `&cc=${encodeURIComponent(vendorCc)}`;
          window.open(mailto, '_blank');
          setSentSuccess(true);
          onToast('PO downloaded. Please attach it to the email that just opened.', 'success');
          onSaved();
        } catch (fallbackErr: any) {
          onToast(fallbackErr?.response?.data?.message || 'Error downloading PO PDF', 'error');
        }
      } else {
        onToast(errMsg || 'Error sending PO to vendor', 'error');
      }
    }
    setSending(false);
  };

  const handleDelete = async () => {
    if (!po.id) { onDeleted(); return; }
    if (!window.confirm('Delete this Purchase Order? This action cannot be undone.')) return;
    try { await vendorProcurementService.deleteVendorPurchaseOrder(po.id); onToast('PO deleted', 'success'); onDeleted(); }
    catch (e: any) { onToast(e?.response?.data?.message || 'Error deleting PO', 'error'); }
    setAnchorEl(null);
  };

  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    if (!po.id) { onToast('Save the PO first before downloading', 'error'); return; }
    setDownloading(true);
    try { await vendorProcurementService.downloadVendorPOPdf(po.id); }
    catch (e: any) { onToast(e?.response?.data?.message || 'Error downloading PO PDF', 'error'); }
    setDownloading(false);
  };

  const poLabel = po.po_number || `PO #${index + 1}`;

  return (
    <Card elevation={0} sx={{
      border: `1.5px solid ${T.border}`, borderRadius: '10px', mb: 2.5,
      overflow: 'hidden', boxShadow: T.shadow,
      transition: 'box-shadow 0.2s ease',
      '&:hover': { boxShadow: T.shadowMd },
    }}>
      {/* â”€â”€ Card Header â”€â”€ */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2.5, py: 1.5, bgcolor: 'var(--bg-canvas)',
        borderBottom: expanded ? `1px solid ${T.border}` : 'none',
        cursor: 'pointer',
      }} onClick={onToggle}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography fontWeight={700} fontSize={15} color={T.dark}>{poLabel}</Typography>
          <Badge status={po.status || 'draft'} />
          {vendorId && vendorName !== 'â€”' && (
            <Typography fontSize={12} color={T.textSec} fontWeight={500}>â€” {vendorName}</Typography>
          )}
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center" onClick={e => e.stopPropagation()}>
          <SectionBtn
            icon={saved ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : <SaveIcon sx={{ fontSize: 14 }} />}
            label={saving ? 'Savingâ€¦' : saved ? 'Saved' : 'Save'}
            bg={saved ? '#16A34A' : T.primary}
            onClick={handleSave}
            loading={saving}
            disabled={saved}
          />
          <SectionBtn icon={<DownloadIcon sx={{ fontSize: 14 }} />} label="Download" bg="#374151" onClick={handleDownload} loading={downloading} />
          <SectionBtn
            icon={isPOSent ? <CheckCircleIcon sx={{ fontSize: 14 }} /> : <SendIcon sx={{ fontSize: 14 }} />}
            label={sending ? 'Sendingâ€¦' : isPOSent ? 'Sent to Vendor' : 'Send to Vendor'}
            bg={isPOSent ? '#16A34A' : '#006699'}
            onClick={handleSend}
            loading={sending}
            disabled={isPOSent}
          />
          <Tooltip title="More options">
            <IconButton size="small" onClick={e => setAnchorEl(e.currentTarget)}
              sx={{ border: `1px solid ${T.border}`, borderRadius: '8px', width: 30, height: 30 }}>
              <MoreIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}
            PaperProps={{ sx: { borderRadius: '8px', minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,.1)' } }}>
            <MenuItem onClick={handleDelete} sx={{ fontSize: 13, color: T.danger }}>
              <DeleteIcon sx={{ fontSize: 16, mr: 1 }} /> Delete PO
            </MenuItem>
          </Menu>
          <IconButton size="small" onClick={onToggle}
            sx={{ color: T.textSec, border: `1px solid ${T.border}`, borderRadius: '8px', width: 30, height: 30, '&:hover': { bgcolor: 'var(--border-subtle)' } }}>
            {expanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
          </IconButton>
        </Stack>
      </Box>

      {/* â”€â”€ Card Body â”€â”€ */}
      {expanded && (
        <Box sx={{ px: 3, py: 2.5 }}>

          {/* â”€â”€ 6-Column Fields Row â”€â”€ */}
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(3,1fr)', lg: 'repeat(6,1fr)' },
            gap: 2, mb: 3,
          }}>
            {/* Approved RFQ */}
            <Box>
              <Typography sx={lbl}>Approved RFQ</Typography>
              <FormControl fullWidth size="small" sx={fld}>
                <Select value={rfqBundleId} onChange={e => handleRFQChange(e.target.value as string)} displayEmpty sx={{ fontSize: 13 }}>
                  <MenuItem value="" disabled sx={{ fontSize: 13, color: '#9CA3AF' }}>Select RFQ</MenuItem>
                  {approvedRFQs.map((b, i) => (
                    <MenuItem key={b.id} value={b.id} sx={{ fontSize: 13 }}>
                      {b.rfq_number || `RFQ #${i + 1}`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {/* Vendor â€” auto-filled */}
            <Box>
              <Typography sx={lbl}>Vendor</Typography>
              <ReadOnlyField value={vendorName} />
            </Box>

            {/* Upload Quotation */}
            <Box>
              <Typography sx={lbl}>Upload Quotation</Typography>
              {quotationFiles.length === 0 && !po.quotation_file ? (
                <Button variant="outlined" size="small" component="label" startIcon={<UploadIcon sx={{ fontSize: 14 }} />}
                  sx={{
                    borderRadius: '6px', textTransform: 'none', fontSize: 12, fontWeight: 600,
                    borderColor: T.border, color: T.textSec,
                    py: 0.8, width: '100%', justifyContent: 'flex-start', minHeight: 38,
                    bgcolor: 'var(--bg-input)', '&:hover': { borderColor: T.primary, color: T.primary, bgcolor: alpha(T.primary, 0.10) },
                  }}>
                  Upload
                  <input type="file" hidden multiple accept=".pdf,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png"
                    onChange={e => {
                      const files = e.target.files;
                      if (files) setQuotationFiles(prev => [...prev, ...Array.from(files)]);
                      e.target.value = '';
                    }} />
                </Button>
              ) : (
                <Box sx={{ border: '1px solid #E2E8F0', borderRadius: '6px', overflow: 'hidden' }}>
                  <Box sx={{ maxHeight: 100, overflowY: 'auto', '&::-webkit-scrollbar': { width: 3 }, '&::-webkit-scrollbar-thumb': { backgroundColor: 'var(--text-muted)', borderRadius: 2 } }}>
                    {po.quotation_file && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderBottom: quotationFiles.length > 0 ? '1px solid var(--border-subtle)' : 'none', bgcolor: alpha(T.primary, 0.03), cursor: 'pointer' }} onClick={() => viewFileByPath(`${getBackendBaseUrl()}${po.quotation_file}`)}>
                        <Typography sx={{ fontSize: 11, color: T.primary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {typeof po.quotation_file === 'string' ? (po.quotation_file.split('/').pop() || '').slice(0, 18) + (po.quotation_file.length > 20 ? '..' : '') : 'Uploaded'}
                        </Typography>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); viewFileByPath(`${getBackendBaseUrl()}${po.quotation_file}`); }} sx={{ p: 0.3, color: '#64748B', '&:hover': { color: T.primary } }}>
                          <VisibilityIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Box>
                    )}
                    {quotationFiles.map((f, idx) => (
                      <Box key={`${f.name}-${idx}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderBottom: idx < quotationFiles.length - 1 ? '1px solid var(--border-subtle)' : 'none', '&:hover': { backgroundColor: 'var(--bg-surface-2)' } }}>
                        <Typography sx={{ fontSize: 11, color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                          {f.name.length > 18 ? f.name.slice(0, 15) + '...' : f.name}
                        </Typography>
                        <IconButton size="small" onClick={() => setQuotationFiles(prev => prev.filter((_, i) => i !== idx))} sx={{ p: 0.3, color: 'var(--text-muted)', '&:hover': { color: '#EF4444' } }}>
                          <DeleteIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                  <Box
                    component="label"
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, py: 0.5, cursor: 'pointer', borderTop: '1px solid #E2E8F0', backgroundColor: '#FAFAFA', '&:hover': { backgroundColor: alpha(T.primary, 0.05) }, transition: 'all 0.2s' }}
                  >
                    <AddIcon sx={{ fontSize: 13, color: T.primary }} />
                    <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: T.primary }}>Add More</Typography>
                    <input type="file" hidden multiple accept=".pdf,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png"
                      onChange={e => {
                        const files = e.target.files;
                        if (files) setQuotationFiles(prev => [...prev, ...Array.from(files)]);
                        e.target.value = '';
                      }} />
                  </Box>
                </Box>
              )}
            </Box>

            {/* PO Number â€” auto-generated */}
            <Box>
              <Typography sx={lbl}>PO Number</Typography>
              <ReadOnlyField value={po.po_number || 'Auto Generated'} />
            </Box>

            {/* PO Date â€” editable, default today */}
            <Box>
              <Typography sx={lbl}>PO Date</Typography>
              <TextField size="small" type="date" fullWidth value={poDateState}
                onChange={e => setPoDateState(e.target.value)}
                sx={{ ...fld }} inputProps={{ style: { fontSize: 13 } }} />
            </Box>

            {/* Tax */}
            <Box>
              <Typography sx={lbl}>Tax</Typography>
              <FormControl fullWidth size="small" sx={fld}>
                <Select value={taxType} onChange={e => setTaxType(e.target.value)} sx={{ fontSize: 13 }}>
                  <MenuItem value="exempt" sx={{ fontSize: 13 }}>Exempt</MenuItem>
                  <MenuItem value="18%" sx={{ fontSize: 13 }}>18%</MenuItem>
                  <MenuItem value="10%" sx={{ fontSize: 13 }}>10%</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>

          {/* â”€â”€ Cost Mode Toggle â”€â”€ */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <Typography fontSize={12} fontWeight={600} color={T.textSec}>Cost Mode:</Typography>
            <Box sx={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
              {(['unit', 'weight'] as const).map(mode => (
                <Box key={mode} onClick={() => setCostMode(mode)}
                  sx={{ px: 2, py: 0.5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    bgcolor: costMode === mode ? T.primary : 'transparent',
                    color: costMode === mode ? '#fff' : T.textSec,
                    transition: 'all 0.2s',
                    '&:hover': { bgcolor: costMode === mode ? T.primary : alpha(T.primary, 0.05) } }}>
                  {mode === 'unit' ? 'Cost/Unit' : 'Cost/Weight (kg or lbs)'}
                </Box>
              ))}
            </Box>
          </Box>

          {/* â”€â”€ Line Items Table â”€â”€ */}
          {items.length > 0 && (
          <Box sx={{
            border: `1px solid ${T.border}`, borderRadius: '8px',
            overflow: 'hidden', mb: 2,
          }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: T.dark }}>
                  {['S.NO', 'DESCRIPTION', 'QUANTITY', 'UNIT WEIGHT', costMode === 'unit' ? 'UNIT COST' : 'COST/WEIGHT', 'LINE TOTAL'].map((h) => (
                    <TableCell key={h} sx={{
                      color: T.primaryBg, fontWeight: 600, fontSize: 11, letterSpacing: 0.5,
                      py: 1.2, textTransform: 'uppercase',
                      ...(h === 'S.NO' && { width: 60 }),
                      ...(h === 'QUANTITY' && { width: 120 }),
                      ...(h === 'UNIT WEIGHT' && { width: 140 }),
                      ...(h === 'UNIT COST' && { width: 140 }),
                      ...(h === 'LINE TOTAL' && { width: 140 }),
                    }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx} sx={{
                    '&:nth-of-type(even)': { bgcolor: 'var(--bg-canvas)' },
                    '&:hover': { bgcolor: alpha(T.primary, 0.03) },
                    transition: 'background 0.15s',
                  }}>
                    <TableCell sx={{ fontSize: 13, py: 1, fontWeight: 500, color: T.textSec, textAlign: 'center' }}>{idx + 1}</TableCell>
                    <TableCell sx={{ py: 1 }}>
                      {item.material ? (
                        <>
                          <Typography fontSize={13} fontWeight={500} lineHeight={1.4}>
                            {[item.material, item.material_grade, item.condition].filter(Boolean).join(' | ')}
                          </Typography>
                          <Typography fontSize={12} color={T.textSec} lineHeight={1.4}>
                            {[item.form, item.dimension].filter(Boolean).join(' | ')}
                          </Typography>
                        </>
                      ) : (
                        <Typography fontSize={13} fontWeight={500}>{item.part_description || 'â€”'}</Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <TextField size="small" value={item.quantity} placeholder="Qty"
                        onChange={e => updateField(idx, 'quantity', e.target.value)}
                        type="number"
                        sx={{ ...fld, width: '100%' }} inputProps={{ style: { fontSize: 13 }, min: 1 }} />
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <TextField size="small" value={item.weight} placeholder="Unit Weight"
                        onChange={e => updateField(idx, 'weight', e.target.value)}
                        type="number"
                        sx={{ ...fld, width: '100%' }} inputProps={{ style: { fontSize: 13 }, min: 0 }} />
                    </TableCell>
                    <TableCell sx={{ py: 1 }}>
                      <TextField size="small" value={item.unit_cost} placeholder="Unit Cost"
                        onChange={e => updateField(idx, 'unit_cost', e.target.value)}
                        type="number"
                        sx={{ ...fld, width: '100%' }} inputProps={{ style: { fontSize: 13 }, min: 0 }} />
                    </TableCell>
                    <TableCell sx={{
                      fontSize: 13, fontWeight: 600, py: 1,
                      color: Number(item.line_total) > 0 ? T.primary : T.textSec,
                    }}>
                      {Number(item.line_total) ? fmtCurrency(Number(item.line_total)) : 'â€”'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          )}

          {/* â”€â”€ Totals row â”€â”€ */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', mt: 1 }}>
            {/* Totals summary */}
            <Box sx={{
              minWidth: 240, p: 1.5, bgcolor: 'var(--bg-surface-2)', borderRadius: '8px',
              border: `1px solid ${T.border}`,
            }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography fontSize={12.5} color={T.textSec}>Subtotal:</Typography>
                <Typography fontSize={12.5} fontWeight={500} color={T.text}>{fmtCurrency(subtotal)}</Typography>
              </Box>
              {taxRate > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography fontSize={12.5} color={T.textSec}>Tax ({taxType}):</Typography>
                  <Typography fontSize={12.5} fontWeight={500} color={T.text}>{fmtCurrency(taxAmount)}</Typography>
                </Box>
              )}
              <Divider sx={{ my: 0.75 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography fontSize={14} fontWeight={700} color={T.dark}>Grand Total:</Typography>
                <Typography fontSize={14} fontWeight={700} color={T.primary}>{fmtCurrency(grandTotal)}</Typography>
              </Box>
            </Box>
          </Box>

          {/* â”€â”€ Notes â”€â”€ */}
          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ ...lbl, mb: 0.5 }}>Notes</Typography>
            <TextField
              fullWidth multiline minRows={3} maxRows={6}
              value={notesState} onChange={e => setNotesState(e.target.value)}
              placeholder="Enter notes (will appear in the PO PDF)"
              sx={{ ...fld }}
              inputProps={{ style: { fontSize: 13 } }}
            />
          </Box>

          {/* â”€â”€ Terms and Conditions â”€â”€ */}
          <Box sx={{ mt: 2.5 }}>
            <Typography sx={{ ...lbl, mb: 0.5 }}>Terms and Conditions</Typography>
            <TextField
              fullWidth multiline minRows={3} maxRows={8}
              value={termsConditions} onChange={e => setTermsConditions(e.target.value)}
              placeholder="Enter terms and conditions (will appear in the PO PDF)"
              sx={{ ...fld }}
              inputProps={{ style: { fontSize: 13 } }}
            />
          </Box>
        </Box>
      )}
    </Card>
  );
};

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Main Component
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
interface Props {
  project: Project;
  onUpdate: () => void;
  onBack?: () => void;
  onNext?: () => void;
}

const VendorPOTab: React.FC<Props> = ({ project, onUpdate, onBack, onNext }) => {
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorParts, setVendorParts] = useState<VendorSuppliedPart[]>([]);
  const [rfqBundles, setRfqBundles] = useState<RFQBundle[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<VendorPurchaseOrder[]>([]);
  const [expandedRFQ, setExpandedRFQ] = useState<number>(0);
  const [expandedPO, setExpandedPO] = useState<number>(0);
  const [newRFQs, setNewRFQs] = useState<RFQBundle[]>([]);
  const [newPOs, setNewPOs] = useState<VendorPurchaseOrder[]>([]);

  // Toast notification state
  const [toast, setToast] = useState<{ msg: string; severity: 'success' | 'error' | 'warning' } | null>(null);
  const handleToast = useCallback((msg: string, severity: 'success' | 'error' | 'warning') => {
    setToast({ msg, severity });
  }, []);

  const fetchAll = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [vRes, parts, bundles, pos] = await Promise.all([
        api.get('/vendors'),
        vendorProcurementService.getVendorSuppliedParts(project.id).catch(() => []),
        vendorProcurementService.getRFQBundles({ project_id: project.id }),
        vendorProcurementService.getVendorPurchaseOrders({ project_id: project.id }),
      ]);
      setVendors(Array.isArray(vRes.data) ? vRes.data : vRes.data?.data || []);
      setVendorParts(parts);
      setRfqBundles(bundles);
      setPurchaseOrders(pos);
      setNewRFQs([]);
      setNewPOs([]);
    } catch (e) { console.error('Failed to fetch data:', e); }
    setLoading(false);
  }, [project.id]);

  useEffect(() => { fetchAll(true); }, [fetchAll]);

  const allRFQs = [...rfqBundles, ...newRFQs];
  const allPOs = [...purchaseOrders, ...newPOs];
  const hasVendorParts = vendorParts.length > 0 || rfqBundles.length > 0 || purchaseOrders.length > 0;

  // Ensure at least one default RFQ
  useEffect(() => {
    if (!loading && allRFQs.length === 0) {
      setNewRFQs([{
        id: '', rfq_number: '', project_id: project.id, vendor_id: '',
        date: new Date().toISOString().slice(0, 10), status: 'draft',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        project: { id: project.id, project_name: project.project_name }, items: [],
      }]);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const addNewRFQ = () => {
    setNewRFQs(prev => [...prev, {
      id: '', rfq_number: '', project_id: project.id, vendor_id: '',
      date: new Date().toISOString().slice(0, 10), status: 'draft',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      project: { id: project.id, project_name: project.project_name }, items: [],
    }]);
    setExpandedRFQ(allRFQs.length);
  };

  const addNewPO = () => {
    setNewPOs(prev => [...prev, {
      id: '', po_number: '', project_id: project.id, vendor_id: '',
      po_date: new Date().toISOString().slice(0, 10), tax_type: 'exempt',
      subtotal: 0, tax_amount: 0, grand_total: 0,
      terms_conditions: DEFAULT_PO_TERMS,
      status: 'draft', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      items: [],
    }]);
    setExpandedPO(allPOs.length);
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress sx={{ color: T.primary }} /></Box>;
  }

  return (
    <TabContainer>

      {/* â•â•â• PAGE HEADER â•â•â• */}
      <AnimatedSection>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2, mb: 3,
      }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: '12px',
          backgroundColor: 'rgba(0,200,255,0.10)',
          border: '1px solid rgba(0,200,255,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ShoppingCart size={22} color="#00c8ff" />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 22, fontWeight: 800, color: T.dark, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Vendor Procurement
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: T.textSec }}>
            Manage RFQs and purchase orders to vendors
          </Typography>
        </Box>
      </Box>
      </AnimatedSection>

      {/* â•â•â• RFQ SECTION â•â•â• */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" fontWeight={700} color={T.dark} fontSize={16} mb={2}>
          RFQ â€” Request for Quotation
        </Typography>

        {allRFQs.map((bundle, idx) => (
          <RFQCard
            key={bundle.id || `new-rfq-${idx}`}
            bundle={bundle} index={idx}
            vendors={vendors} vendorParts={vendorParts}
            expanded={expandedRFQ === idx}
            onToggle={() => setExpandedRFQ(expandedRFQ === idx ? -1 : idx)}
            onSaved={() => { fetchAll(false); onUpdate(); }}
            onDeleted={() => {
              if (!bundle.id) setNewRFQs(prev => prev.filter((_, i) => i !== idx - rfqBundles.length));
              else { fetchAll(false); onUpdate(); }
            }}
            onToast={handleToast}
          />
        ))}

        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={addNewRFQ}
          sx={{
            bgcolor: T.primary, fontWeight: 600, fontSize: 12.5, textTransform: 'none',
            borderRadius: '8px', px: 2.5, py: 1, boxShadow: 'none',
            '&:hover': { bgcolor: T.primaryLight, boxShadow: 'none' },
          }}>
          Create New RFQ
        </Button>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* â•â•â• PO TO VENDOR SECTION â•â•â• */}
      <Box sx={{ mb: 4, opacity: hasVendorParts ? 1 : 0.45, pointerEvents: hasVendorParts ? 'auto' : 'none' }}>
        <Typography variant="h6" fontWeight={700} color={T.dark} fontSize={17} mb={2.5}
          sx={{ letterSpacing: '-0.01em' }}>
          PO to Vendor â€” Purchase Orders
          {!hasVendorParts && (
            <Typography component="span" sx={{ fontSize: 12, color: T.textSec, ml: 1.5, fontWeight: 400 }}>
              (No vendor-supplied materials in estimation)
            </Typography>
          )}
        </Typography>

        {allPOs.map((po, idx) => (
          <POCard
            key={po.id || `new-po-${idx}`}
            po={po} index={idx}
            rfqBundles={rfqBundles} vendors={vendors}
            vendorParts={vendorParts}
            projectName={project.project_name}
            expanded={expandedPO === idx}
            onToggle={() => setExpandedPO(expandedPO === idx ? -1 : idx)}
            onSaved={() => { fetchAll(false); onUpdate(); }}
            onDeleted={() => {
              if (!po.id) setNewPOs(prev => prev.filter((_, i) => i !== idx - purchaseOrders.length));
              else { fetchAll(false); onUpdate(); }
            }}
            onToast={handleToast}
          />
        ))}

        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={addNewPO}
          sx={{
            bgcolor: T.primary, fontWeight: 600, fontSize: 13, textTransform: 'none',
            borderRadius: '8px', px: 3, py: 1.1, boxShadow: 'none',
            '&:hover': { bgcolor: T.primaryLight, boxShadow: 'none' },
          }}>
          Create New PO
        </Button>
      </Box>

      {/* â•â•â• TOAST â•â•â• */}
      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert onClose={() => setToast(null)} severity={toast?.severity || 'success'}
          variant="filled" sx={{ width: '100%', fontWeight: 600 }}>
          {toast?.msg}
        </Alert>
      </Snackbar>

      <EnhancedNavFooter onBack={onBack} onNext={onNext} backLabel="Back to PO from Client" nextLabel="Next: Work Order" />
    </TabContainer>
  );
};

export default VendorPOTab;

