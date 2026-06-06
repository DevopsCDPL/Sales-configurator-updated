import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Grid, IconButton, alpha,
  CircularProgress, Alert, Breadcrumbs, Link, Snackbar, Divider,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Business as BusinessIcon,
  Home as HomeIcon,
  NavigateNext as NavNextIcon,
  Save as SaveIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { clientService } from '../services/clientService';
import { useAuth } from '../contexts/AuthContext';

/* ══════ Design Tokens ══════ */
const T = {
  primary:    '#1F7A63',
  primaryBg:  '#E8F7F2',
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

const defaultForm = {
  company_name: '',
  contact_person: '',
  position: '',
  email: '',
  phone: '',
  address: '',
  tax_id: '',
  payment_terms: 'Net 30',
  notes: '',
};

/* ================================================================== */
const ClientEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === 'main_admin' || user?.role === 'admin';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [form, setForm] = useState<any>(defaultForm);
  const [ccList, setCcList] = useState<{name:string; position:string; email:string}[]>([]);

  useEffect(() => {
    const loadClient = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data: any = await clientService.getById(id);
        setForm({
          company_name: data.client_name || data.company_name || '',
          contact_person: data.poc_name || data.contact_person || '',
          position: data.position || '',
          email: data.poc_email || data.email || '',
          phone: data.poc_phone || data.phone || '',
          address: data.address || '',
          tax_id: data.tax_id || '',
          payment_terms: data.payment_terms || 'Net 30',
          notes: data.notes || '',
        });
        setCcList(Array.isArray(data.cc_list) ? data.cc_list.map((c: any) => ({ name: c.name||'', position: c.position||'', email: c.email||'' })) : []);
      } catch {
        setError('Client not found');
      } finally {
        setLoading(false);
      }
    };
    loadClient();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((f: any) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    if (!form.company_name?.trim()) { setError('Company name is required'); return; }
    // Validate CC rows
    for (let i = 0; i < ccList.length; i++) {
      const cc = ccList[i];
      if (!cc.email.trim()) { setError(`CC row ${i + 1}: Email is required`); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cc.email.trim())) { setError(`CC row ${i + 1}: Invalid email address`); return; }
    }
    try {
      setSaving(true);
      const payload: any = {
        client_name: form.company_name?.trim(),
        poc_name: form.contact_person,
        position: form.position || undefined,
        poc_email: form.email || undefined,
        poc_phone: form.phone,
        address: form.address,
        tax_id: form.tax_id,
        payment_terms: form.payment_terms,
        notes: form.notes,
        cc_list: ccList.filter(cc => cc.email.trim()),
      };
      await clientService.update(id, payload);
      setSuccessMsg('Client updated successfully');
      setTimeout(() => navigate(`/clients/${id}`), 800);
    } catch (err: any) {
      setError(err.response?.data?.errors?.map((e: any) => e.message).join(', ') || err.response?.data?.message || 'Failed to save');
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
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/clients')}
          sx={{ textTransform: 'none', fontWeight: 600, color: T.textSec }}>
          Back to Clients
        </Button>
      </Box>
    );
  }

  if (!canWrite) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>You do not have permission to edit clients.</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/clients/${id}`)}
          sx={{ textTransform: 'none', fontWeight: 600, color: T.textSec }}>
          Back to Client
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 4 }} className="animate-fadeIn">
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton onClick={() => navigate(`/clients/${id}`)} sx={{ color: T.textSec }}>
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
              Edit Client
            </Typography>
            <Typography sx={{ fontSize: 12, color: T.textSec }}>
              Update client information
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button onClick={() => navigate(`/clients/${id}`)} disabled={saving}
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
        <Box sx={{ p: 3.5 }}>
          {error && <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}
          <form onSubmit={handleSubmit}>

            {/* ── SECTION 1: Company Information ─────────────────────────── */}
            <Box sx={{ mb: 3 }}>
              <Typography sx={{
                fontSize: '0.85rem', fontWeight: 700, color: T.textSec,
                textTransform: 'uppercase', letterSpacing: '0.05em', mb: 2,
              }}>
                Company Information
              </Typography>
              <Grid container spacing={2.5}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Company Name"
                    name="company_name"
                    value={form.company_name}
                    onChange={handleChange}
                    fullWidth
                    required
                    size="small"
                    placeholder="e.g. ABC Industries Ltd."
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Tax ID / GST"
                    name="tax_id"
                    value={form.tax_id}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    placeholder="Tax registration number"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Address"
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={2}
                    size="small"
                    placeholder="Street address, city, state, country"
                    sx={fieldSx}
                  />
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 3, borderColor: T.border, opacity: 0.8 }} />

            {/* ── SECTION 2: Contact Details ─────────────────────────────── */}
            <Box sx={{ mb: 3 }}>
              <Typography sx={{
                fontSize: '0.85rem', fontWeight: 700, color: T.textSec,
                textTransform: 'uppercase', letterSpacing: '0.05em', mb: 2,
              }}>
                Contact Details
              </Typography>
              <Grid container spacing={2.5}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Contact Person"
                    name="contact_person"
                    value={form.contact_person}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    placeholder="Full name"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Position"
                    name="position"
                    value={form.position}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    placeholder="Job title"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    fullWidth
                    type="email"
                    size="small"
                    placeholder="email@example.com"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Phone"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    placeholder="Phone number"
                    sx={fieldSx}
                  />
                </Grid>
              </Grid>

            </Box>

            <Divider sx={{ my: 3, borderColor: T.border, opacity: 0.8 }} />

            {/* ── SECTION 3: Business Terms ──────────────────────────────── */}
            <Box sx={{ mb: 2 }}>
              <Typography sx={{
                fontSize: '0.85rem', fontWeight: 700, color: T.textSec,
                textTransform: 'uppercase', letterSpacing: '0.05em', mb: 2,
              }}>
                Business Terms & Notes
              </Typography>
              <Grid container spacing={2.5}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Payment Terms"
                    name="payment_terms"
                    value={form.payment_terms}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    placeholder="e.g. Net 30"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Notes"
                    name="notes"
                    value={form.notes}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={1}
                    size="small"
                    placeholder="Additional notes or remarks"
                    sx={fieldSx}
                  />
                </Grid>
              </Grid>
            </Box>

            <Divider sx={{ my: 3, borderColor: T.border, opacity: 0.8 }} />

            {/* ── Email CC Section ── */}
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography sx={{
                  fontSize: '0.85rem', fontWeight: 700, color: T.textSec,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Email CC
                </Typography>
                <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                  onClick={() => setCcList(prev => [...prev, { name: '', position: '', email: '' }])}
                  sx={{
                    textTransform: 'none', fontWeight: 600, fontSize: 12,
                    color: T.primary, borderRadius: T.radiusXs,
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
                  <IconButton size="small" onClick={() => setCcList(prev => prev.filter((_, i) => i !== idx))}
                    sx={{ color: T.textSec, '&:hover': { color: '#EF4444', bgcolor: '#FEF2F2' } }}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>

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

export default ClientEditPage;
