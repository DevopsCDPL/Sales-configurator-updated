
import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Grid, Box, Typography, Rating, Switch,
  FormControlLabel, Divider, alpha, IconButton, Table, TableHead, TableRow, TableCell,
  TableBody, Tooltip,
} from '@mui/material';
import {
  Close as CloseIcon,
  Business as BusinessIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';

/* ══════ Design Tokens ══════ */
const T = {
  primary:    '#1F6F5C',
  primaryBg:  '#E9F5F1',
  dark:       '#1F2937',
  textSec:    '#6B7280',
  border:     'var(--border)',
  bg:         'var(--bg-canvas)',
  white:      '#FFFFFF',
  radius:     '14px',
  radiusSm:   '10px',
  radiusXs:   '8px',
  shadow:     '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
};

const fieldSx = {
  overflow: 'visible',
  '& .MuiOutlinedInput-root': {
    borderRadius: T.radiusXs, 
    bgcolor: T.white, 
    fontSize: 13,
    overflow: 'visible',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: T.border },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(T.primary, 0.5) },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.primary, borderWidth: 2 },
    '& .MuiOutlinedInput-input': { 
      bgcolor: T.white,
      color: T.dark,
      '&::placeholder': { color: T.textSec, opacity: 1 },
    },
  },
  '& .MuiInputLabel-root': { 
    fontSize: 13,
    color: T.textSec,
    bgcolor: T.white,
    px: 0.5,
    zIndex: 1,
    '&.MuiInputLabel-shrink': {
      bgcolor: T.white,
      px: 0.5,
      color: T.textSec,
      transform: 'translate(14px, -9px) scale(0.75)',
    },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: T.primary },
};

const thSx = {
  fontWeight: 600, fontSize: 11, color: T.textSec, textTransform: 'uppercase' as const,
  letterSpacing: 0.8, py: 1.2, px: 2, bgcolor: T.bg, borderBottom: `2px solid ${T.border}`,
  whiteSpace: 'nowrap' as const,
};

const tdSx = {
  py: 1.2, px: 2, fontSize: 13, borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle' as const,
};

const defaultForm = {
  company_name: '',
  contact_person: '',
  tax_id: '',
  position: '',
  email: '',
  phone: '',
  address: '',
  payment_terms: '',
  notes: '',
  service_categories: [],
  rating: 0,
  status: 'Active',
};





interface VendorFormModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (form: any) => Promise<void>;
  initialData?: Partial<{
    id?: string;
    company_name?: string;
    contact_person?: string;
    tax_id?: string;
    position?: string;
    email?: string;
    phone?: string;
    address?: string;
    payment_terms?: string;
    notes?: string;
    service_categories?: string[];
    rating?: number;
    status?: string;
    created_at?: string;
  }> | null;
}

const defaultMaterial = { part_description: '', material_grade: '', dimension: '' };
const VendorFormModal: React.FC<VendorFormModalProps> = ({ open, onClose, onSave, initialData }) => {
  const [form, setForm] = useState<any>(defaultForm);
  const [materials, setMaterials] = useState<any[]>([{ ...defaultMaterial }]);
  const [ccList, setCcList] = useState<{name:string; position:string; email:string}[]>([]);
  const [saving, setSaving] = useState(false);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    // Only initialize form when modal OPENS (transitions from closed to open)
    // This prevents form reset when parent re-renders while modal is open
    if (open && !prevOpenRef.current) {
      setForm(initialData || defaultForm);
      // Load materials from initialData if editing, otherwise start with one empty row
      if (initialData && Array.isArray((initialData as any).materials) && (initialData as any).materials.length > 0) {
        setMaterials((initialData as any).materials.map((m: any) => ({
          part_description: m.part_description || '',
          material_grade: m.material_grade || '',
          dimension: m.dimension || '',
        })));
      } else {
        setMaterials([{ ...defaultMaterial }]);
      }
      // Load cc_list from initialData if editing
      if (initialData && Array.isArray((initialData as any).cc_list) && (initialData as any).cc_list.length > 0) {
        setCcList((initialData as any).cc_list.map((c: any) => ({ name: c.name||'', position: c.position||'', email: c.email||'' })));
      } else {
        setCcList([]);
      }
    }
    prevOpenRef.current = open;
  }, [open, initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((f: any) => ({ ...f, [name]: value }));
  };
  const handleStatus = (_: any, checked: boolean) => {
    setForm((f: any) => ({ ...f, status: checked ? 'Active' : 'Inactive' }));
  };
  const handleRating = (_: React.SyntheticEvent<Element, Event>, value: number | null) => {
    setForm((f: any) => ({ ...f, rating: value }));
  };
  const handleMaterialChange = (idx: number, field: string, value: string) => {
    setMaterials(mats => mats.map((mat, i) => i === idx ? { ...mat, [field]: value } : mat));
  };
  const handleAddMaterial = () => setMaterials(mats => [...mats, { ...defaultMaterial }]);
  const handleRemoveMaterial = (idx: number) => setMaterials(mats => mats.length > 1 ? mats.filter((_, i) => i !== idx) : mats);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate CC rows
    for (let i = 0; i < ccList.length; i++) {
      const cc = ccList[i];
      if (!cc.email.trim()) { return; }
    }
    setSaving(true);
    try {
      await onSave({ ...form, materials, cc_list: ccList.filter(cc => cc.email.trim()) });
    } catch (err: any) {
      // Error is handled by the parent; just ensure we reset saving state
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { borderRadius: T.radius, maxHeight: '90vh', display: 'flex', flexDirection: 'column' } }}>
      <Box sx={{ height: 3, bgcolor: T.primary }} />
      <DialogTitle sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 3.5, pt: 2.5, pb: 2, borderBottom: `1px solid ${T.border}`,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{
            width: 38, height: 38, borderRadius: T.radiusXs, bgcolor: T.primaryBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${alpha(T.primary, 0.15)}`,
          }}>
            <BusinessIcon sx={{ fontSize: 18, color: T.primary }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 17, color: T.dark, lineHeight: 1.2 }}>
              {initialData ? 'Edit Vendor' : 'Add Vendor'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: T.textSec }}>
              {initialData ? 'Update vendor information' : 'Register a new vendor'}
            </Typography>
          </Box>
        </Box>
        <IconButton size="small" onClick={onClose}
          sx={{ color: T.textSec, '&:hover': { bgcolor: T.bg } }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ px: 3.5, pt: 3.5, pb: 1, overflowY: 'auto', overflowX: 'visible' }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={2.5} sx={{ pt: 1 }}>
            <Grid item xs={12} md={6} sx={{ overflow: 'visible' }}>
              <TextField label="Company Name" name="company_name" value={form.company_name} onChange={handleChange} fullWidth required size="small" sx={fieldSx} InputLabelProps={{ shrink: !!form.company_name }} />
            </Grid>
            <Grid item xs={12} md={6} sx={{ overflow: 'visible' }}>
              <TextField label="Contact Person" name="contact_person" value={form.contact_person} onChange={handleChange} fullWidth required size="small" sx={fieldSx} InputLabelProps={{ shrink: !!form.contact_person }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Tax ID" name="tax_id" value={form.tax_id || ''} onChange={handleChange} fullWidth size="small" placeholder="e.g. GST / TIN" sx={fieldSx} InputLabelProps={{ shrink: !!(form.tax_id) }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Position" name="position" value={form.position || ''} onChange={handleChange} fullWidth size="small" placeholder="e.g. Sales Manager" sx={fieldSx} InputLabelProps={{ shrink: !!(form.position) }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Phone" name="phone" value={form.phone} onChange={handleChange} fullWidth size="small" sx={fieldSx} InputLabelProps={{ shrink: !!form.phone }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Email" name="email" value={form.email} onChange={handleChange} fullWidth required type="email" size="small" sx={fieldSx} InputLabelProps={{ shrink: !!form.email }} />
            </Grid>
            <Grid item xs={12}>
              <TextField label="Address" name="address" value={form.address || ''} onChange={handleChange} fullWidth size="small" multiline minRows={2} placeholder="Street address, city, country" sx={fieldSx} InputLabelProps={{ shrink: !!(form.address) }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Payment Terms" name="payment_terms" value={form.payment_terms || ''} onChange={handleChange} fullWidth size="small" placeholder="e.g. Net 30" sx={fieldSx} InputLabelProps={{ shrink: !!(form.payment_terms) }} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField label="Notes" name="notes" value={form.notes || ''} onChange={handleChange} fullWidth size="small" placeholder="Additional notes about this vendor" sx={fieldSx} InputLabelProps={{ shrink: !!(form.notes) }} />
            </Grid>
            <Grid item xs={12} md={3} display="flex" alignItems="center">
              <FormControlLabel
                control={
                  <Switch
                    checked={form.status === 'Active'}
                    onChange={handleStatus}
                    size="small"
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': { color: T.primary },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: T.primary },
                    }}
                  />
                }
                label={<span style={{ fontWeight: 600, fontSize: 13, color: form.status === 'Active' ? T.primary : T.textSec }}>Status</span>}
                sx={{ ml: 0, mt: 1 }}
              />
            </Grid>
            <Grid item xs={12} md={3} display="flex" alignItems="center">
              <Box display="flex" alignItems="center" gap={0.75}>
                <Typography sx={{ fontWeight: 600, fontSize: 12, color: T.textSec }}>Rating</Typography>
                <Rating
                  value={form.rating}
                  onChange={handleRating}
                  precision={0.5}
                  size="small"
                  sx={{ '& .MuiRating-iconFilled': { color: '#F59E0B' } }}
                />
                <Typography sx={{ fontWeight: 700, color: T.primary, fontSize: 13 }}>{typeof form.rating === 'number' ? form.rating.toFixed(1) : '0.0'}</Typography>
              </Box>
            </Grid>
          </Grid>

          {/* ── Email CC Section ── */}
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.dark, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Email CC
              </Typography>
              <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={() => setCcList(prev => [...prev, { name: '', position: '', email: '' }])}
                sx={{
                  textTransform: 'none', fontWeight: 600, fontSize: 12,
                  borderColor: alpha(T.primary, 0.3), color: T.primary,
                  '&:hover': { bgcolor: T.primaryBg },
                }}>
                Add CC
              </Button>
            </Box>
            {ccList.map((cc, idx) => (
              <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                <TextField size="small" placeholder="Name" value={cc.name}
                  onChange={e => setCcList(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                  sx={{ flex: 1, ...fieldSx }} />
                <TextField size="small" placeholder="Position" value={cc.position}
                  onChange={e => setCcList(prev => prev.map((c, i) => i === idx ? { ...c, position: e.target.value } : c))}
                  sx={{ flex: 1, ...fieldSx }} />
                <TextField size="small" placeholder="Email" type="email" required value={cc.email}
                  onChange={e => setCcList(prev => prev.map((c, i) => i === idx ? { ...c, email: e.target.value } : c))}
                  sx={{ flex: 1, ...fieldSx }} />
                <Tooltip title="Remove">
                  <IconButton size="small" onClick={() => setCcList(prev => prev.filter((_, i) => i !== idx))}
                    sx={{ color: T.textSec, '&:hover': { color: '#EF4444', bgcolor: '#FEF2F2' } }}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </Box>
            ))}
          </Box>

          <Divider sx={{ my: 3, borderColor: T.border }} />

          <Typography sx={{ fontSize: 14, fontWeight: 700, color: T.dark, mb: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Materials Supply Table
          </Typography>
          <Box sx={{ border: `1px solid ${T.border}`, borderRadius: T.radiusSm, overflow: 'hidden', mb: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...thSx, width: 60 }}>S.No</TableCell>
                  <TableCell sx={thSx}>Part Description</TableCell>
                  <TableCell sx={thSx}>Material & Grade</TableCell>
                  <TableCell sx={thSx}>Dimension</TableCell>
                  <TableCell sx={{ ...thSx, width: 60, textAlign: 'center' }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {materials.map((mat, idx) => (
                  <TableRow key={idx} sx={{ '&:nth-of-type(even)': { bgcolor: T.bg } }}>
                    <TableCell sx={{ ...tdSx, fontWeight: 600, color: T.textSec }}>{idx + 1}</TableCell>
                    <TableCell sx={tdSx}>
                      <TextField value={mat.part_description} onChange={e => handleMaterialChange(idx, 'part_description', e.target.value)}
                        placeholder="Enter Description" size="small" fullWidth sx={fieldSx} />
                    </TableCell>
                    <TableCell sx={tdSx}>
                      <TextField value={mat.material_grade} onChange={e => handleMaterialChange(idx, 'material_grade', e.target.value)}
                        placeholder="Enter Grade" size="small" fullWidth sx={fieldSx} />
                    </TableCell>
                    <TableCell sx={tdSx}>
                      <TextField value={mat.dimension} onChange={e => handleMaterialChange(idx, 'dimension', e.target.value)}
                        placeholder="Enter Dimension" size="small" fullWidth sx={fieldSx} />
                    </TableCell>
                    <TableCell sx={{ ...tdSx, textAlign: 'center' }}>
                      {materials.length > 1 && (
                        <Tooltip title="Remove row">
                          <IconButton size="small" onClick={() => handleRemoveMaterial(idx)}
                            sx={{ color: T.textSec, '&:hover': { color: '#EF4444', bgcolor: '#FEF2F2' } }}>
                            <DeleteIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Button variant="outlined" startIcon={<AddIcon sx={{ fontSize: 16 }} />} onClick={handleAddMaterial}
            sx={{
              borderRadius: T.radiusXs, textTransform: 'none', fontWeight: 600, fontSize: 12,
              borderColor: alpha(T.primary, 0.3), color: T.primary,
              '&:hover': { borderColor: T.primary, bgcolor: T.primaryBg },
            }}>
            Add New Part
          </Button>
        </form>
      </DialogContent>
      <DialogActions sx={{ px: 3.5, py: 2.5, borderTop: `1px solid ${T.border}`, gap: 1.5 }}>
        <Button onClick={onClose} disabled={saving}
          sx={{ fontWeight: 600, borderRadius: T.radiusXs, px: 2.5, fontSize: 13, color: T.textSec, textTransform: 'none', '&:hover': { bgcolor: T.bg } }}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} type="submit" variant="contained" disabled={saving}
          sx={{
            bgcolor: T.primary, fontWeight: 700, borderRadius: T.radiusXs, px: 3, fontSize: 13,
            textTransform: 'none', boxShadow: 'none',
            '&:hover': { bgcolor: alpha(T.primary, 0.88), boxShadow: 'none' },
          }}>
          {initialData ? 'Save Changes' : 'Add Vendor'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default VendorFormModal;
