import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Grid, IconButton, alpha, Switch,
  FormControlLabel, Divider, Table, TableHead, TableRow, TableCell,
  TableBody, Tooltip, CircularProgress, Alert, Breadcrumbs, Link, Snackbar,
} from '@mui/material';
import Rating from '@mui/material/Rating';
import {
  ArrowBack as ArrowBackIcon,
  Business as BusinessIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Home as HomeIcon,
  NavigateNext as NavNextIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { vendorService } from '../services/vendorService';
import { useAuth } from '../contexts/AuthContext';

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
  '& .MuiOutlinedInput-root': {
    borderRadius: T.radiusXs, bgcolor: T.white, fontSize: 13,
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(T.primary, 0.5) },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: T.primary, borderWidth: 2 },
  },
  '& .MuiInputLabel-root': { fontSize: 13 },
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

const defaultMaterial = { part_description: '', material_grade: '', dimension: '' };

/* ================================================================== */
const VendorEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === 'main_admin' || user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [form, setForm] = useState<any>(defaultForm);
  const [materials, setMaterials] = useState<any[]>([{ ...defaultMaterial }]);
  const [ccList, setCcList] = useState<{name:string; position:string; email:string}[]>([]);

  useEffect(() => {
    const loadVendor = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data: any = await vendorService.getById(id);
        setForm({
          company_name: data.vendor_name || data.company_name || '',
          contact_person: data.contact_person || data.contact_name || data.poc_name || '',
          tax_id: data.tax_id || '',
          position: data.contact_position || data.position || '',
          email: data.contact_email || data.email || data.poc_email || '',
          phone: data.contact_phone || data.phone || data.poc_phone || '',
          address: data.address || '',
          payment_terms: data.payment_terms || '',
          notes: data.notes || '',
          service_categories: data.service_categories || [],
          rating: data.rating || 0,
          status: data.status || (data.is_active === false ? 'Inactive' : 'Active'),
        });
        setCcList(Array.isArray(data.cc_list) ? data.cc_list.map((c: any) => ({ name: c.name||'', position: c.position||'', email: c.email||'' })) : []);
        if (data.vendorMaterials && data.vendorMaterials.length > 0) {
          setMaterials(data.vendorMaterials.map((m: any) => ({
            part_description: m.part_description || '',
            material_grade: m.material_grade || '',
            dimension: m.dimension || '',
          })));
        } else {
          setMaterials([{ ...defaultMaterial }]);
        }
      } catch {
        setError('Vendor not found');
      } finally {
        setLoading(false);
      }
    };
    loadVendor();
  }, [id]);

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
    if (!id) return;
    // Validate CC rows
    for (let i = 0; i < ccList.length; i++) {
      const cc = ccList[i];
      if (!cc.email.trim()) { setError(`CC row ${i + 1}: Email is required`); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cc.email.trim())) { setError(`CC row ${i + 1}: Invalid email address`); return; }
    }
    try {
      setSaving(true);
      const payload: any = {
        vendor_name: form.company_name?.trim(),
        contact_person: form.contact_person,
        position: form.position,
        contact_email: form.email,
        contact_phone: form.phone,
        address: form.address,
        tax_id: form.tax_id,
        notes: form.notes,
        payment_terms: form.payment_terms,
        service_categories: form.service_categories,
        rating: form.rating,
        is_active: form.status === 'Active',
        materials: materials.filter(
          (m: any) => m.part_description || m.material_grade || m.dimension
        ),
        cc_list: ccList.filter(cc => cc.email.trim()),
      };
      await vendorService.update(id, payload);
      setSuccessMsg('Vendor updated successfully');
      setTimeout(() => navigate(`/vendors/${id}`), 800);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress sx={{ color: T.primary }} />
      </Box>
    );
  }

  if (error && !form.company_name) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/vendors')}
          sx={{ textTransform: 'none', fontWeight: 600, color: T.textSec }}>
          Back to Vendors
        </Button>
      </Box>
    );
  }

  if (!canWrite) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>You do not have permission to edit vendors.</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/vendors/${id}`)}
          sx={{ textTransform: 'none', fontWeight: 600, color: T.textSec }}>
          Back to Vendor
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 2 }} className="animate-fadeIn">
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton onClick={() => navigate(`/vendors/${id}`)} sx={{ color: T.textSec }}>
            <ArrowBackIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <Box sx={{
            width: 38, height: 38, borderRadius: T.radiusXs, bgcolor: T.primaryBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${alpha(T.primary, 0.15)}`,
          }}>
            <BusinessIcon sx={{ fontSize: 18, color: T.primary }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 17, color: T.dark, lineHeight: 1.2 }}>
              Edit Vendor
            </Typography>
            <Typography sx={{ fontSize: 12, color: T.textSec }}>
              Update vendor information
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button onClick={() => navigate(`/vendors/${id}`)} disabled={saving}
            sx={{ fontWeight: 600, borderRadius: T.radiusXs, px: 2.5, fontSize: 13, color: T.textSec, textTransform: 'none', '&:hover': { bgcolor: T.bg } }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving} startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
            sx={{
              bgcolor: T.primary, fontWeight: 700, borderRadius: T.radiusXs, px: 3, fontSize: 13,
              textTransform: 'none', boxShadow: 'none',
              '&:hover': { bgcolor: alpha(T.primary, 0.88), boxShadow: 'none' },
            }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </Box>
      </Box>

      {/* Form Card */}
      <Box sx={{ bgcolor: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <Box sx={{ height: 3, bgcolor: T.primary }} />
        <Box sx={{ p: 3 }}>
          <form onSubmit={handleSubmit}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField label="Company Name" name="company_name" value={form.company_name} onChange={handleChange} fullWidth required size="small" sx={fieldSx} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Contact Person" name="contact_person" value={form.contact_person} onChange={handleChange} fullWidth required size="small" sx={fieldSx} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Tax ID" name="tax_id" value={form.tax_id || ''} onChange={handleChange} fullWidth size="small" placeholder="e.g. GST / TIN" sx={fieldSx} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Position" name="position" value={form.position} onChange={handleChange} fullWidth size="small" sx={fieldSx} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Phone" name="phone" value={form.phone} onChange={handleChange} fullWidth size="small" sx={fieldSx} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Email" name="email" value={form.email} onChange={handleChange} fullWidth required type="email" size="small" sx={fieldSx} />
              </Grid>

              {/* Email CC */}
              <Grid item xs={12}>
                <Box sx={{ mt: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.textSec }}>Email CC</Typography>
                    <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                      onClick={() => setCcList(prev => [...prev, { name: '', position: '', email: '' }])}
                      sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12, color: T.primary, borderRadius: T.radiusXs, '&:hover': { bgcolor: T.primaryBg } }}>
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
                      <IconButton size="small" onClick={() => setCcList(prev => prev.filter((_, i) => i !== idx))}
                        sx={{ color: T.textSec, '&:hover': { color: '#EF4444', bgcolor: '#FEF2F2' } }}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              </Grid>
              <Grid item xs={12}>
                <TextField label="Address" name="address" value={form.address} onChange={handleChange} fullWidth size="small" multiline minRows={2} placeholder="Street address, city, country" sx={fieldSx} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Payment Terms" name="payment_terms" value={form.payment_terms || ''} onChange={handleChange} fullWidth size="small" placeholder="e.g. Net 30" sx={fieldSx} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Notes" name="notes" value={form.notes || ''} onChange={handleChange} fullWidth size="small" placeholder="Additional notes about this vendor" sx={fieldSx} />
              </Grid>
              <Grid item xs={12} md={6} display="flex" alignItems="center">
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
                  sx={{ ml: 0 }}
                />
              </Grid>
              <Grid item xs={12} md={6} display="flex" alignItems="center">
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

            <Divider sx={{ my: 2, borderColor: T.border }} />

            <Typography sx={{ fontSize: 14, fontWeight: 700, color: T.dark, mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Materials Supply Table
            </Typography>
            <Box sx={{ border: `1px solid ${T.border}`, borderRadius: T.radiusSm, overflow: 'hidden', mb: 1.5 }}>
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
        </Box>
      </Box>

      <Snackbar open={!!successMsg} autoHideDuration={3000} onClose={() => setSuccessMsg('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={() => setSuccessMsg('')} severity="success" variant="filled" sx={{ borderRadius: 2 }}>
          {successMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default VendorEditPage;
