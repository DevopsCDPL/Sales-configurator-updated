import React, { useState } from 'react';
import {
  Box, Button, TextField, Typography, Grid, Card, CardContent, Alert, Snackbar,
  InputAdornment, IconButton, alpha,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  ArrowBack as ArrowBackIcon,
  Business as BusinessIcon,
  Save as SaveIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import api from '../services/api';

/* ═════════════════════════════════════════════════════════════════════ */
const T = {
  primary: '#1F7A63',
  primaryBg: '#E8F7F2',
  bg: 'var(--bg-surface-2)',
  card: '#FFFFFF',
  border: 'var(--border)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  shadow: '0 1px 2px rgba(0,0,0,0.04)',
  radius: '12px',
  radiusSm: '8px',
};

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: T.radiusSm, fontSize: '0.85rem', bgcolor: T.card, transition: 'all .2s',
    '& fieldset': { borderColor: T.border },
    '&:hover fieldset': { borderColor: T.textMuted },
    '&.Mui-focused fieldset': { borderColor: T.primary, borderWidth: '1.5px' },
  },
  '& .MuiInputLabel-root': {
    fontSize: '0.82rem', fontWeight: 500, color: T.textSecondary,
    '&.Mui-focused': { color: T.primary, fontWeight: 600 },
  },
};

/* ═════════════════════════════════════════════════════════════════════ */
const AddVendorPage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    companyName: '',
    contactPerson: '',
    taxId: '',
    position: '',
    phone: '',
    email: '',
    address: '',
    paymentTerms: '',
    notes: '',
    services: '',
    rating: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ccList, setCcList] = useState<{name:string; position:string; email:string}[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName.trim()) {
      setError('Company name is required');
      return;
    }
    // Validate CC rows
    for (let i = 0; i < ccList.length; i++) {
      const cc = ccList[i];
      if (!cc.email.trim()) { setError(`CC row ${i + 1}: Email is required`); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cc.email.trim())) { setError(`CC row ${i + 1}: Invalid email address`); return; }
    }
    setSubmitting(true);
    try {
      const payload = {
        vendor_name: formData.companyName.trim(),
        contact_person: formData.contactPerson || undefined,
        position: formData.position || undefined,
        contact_email: formData.email || undefined,
        contact_phone: formData.phone || undefined,
        address: formData.address || undefined,
        tax_id: formData.taxId || undefined,
        notes: formData.notes || undefined,
        payment_terms: formData.paymentTerms || undefined,
        service_categories: formData.services
          ? formData.services.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
        rating: formData.rating ? Number(formData.rating) : 0,
        cc_list: ccList.filter(cc => cc.email.trim()),
      };
      await api.post('/vendors', payload);
      navigate('/vendors');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add vendor. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ pb: 4 }} className="animate-fadeIn">
      {/* ═══ HEADER ════════════════════════════════════════════════════ */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <IconButton
          onClick={() => navigate('/vendors')}
          sx={{ color: T.textMuted, transition: 'all 0.15s' }}
        >
          <ArrowBackIcon sx={{ fontSize: 24 }} />
        </IconButton>
        <Box sx={{
          width: 44, height: 44, borderRadius: T.radius, bgcolor: T.primaryBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${alpha(T.primary, 0.15)}`,
        }}>
          <BusinessIcon sx={{ fontSize: 24, color: T.primary }} />
        </Box>
        <Box>
          <Typography sx={{
            fontSize: '1.35rem', fontWeight: 800, color: T.textPrimary,
            letterSpacing: '-0.02em', lineHeight: 1.2,
          }}>
            Add Vendor
          </Typography>
          <Typography sx={{ fontSize: '0.78rem', color: T.textMuted, mt: 0.3 }}>
            Register a new vendor in the system
          </Typography>
        </Box>
      </Box>

      {/* ═══ FORM CARD ═════════════════════════════════════════════════ */}
      <Card sx={{
        border: `1px solid ${T.border}`, borderRadius: T.radius,
        overflow: 'hidden', boxShadow: T.shadow, bgcolor: T.card,
      }}>
        {/* Section header with green top border */}
        <Box sx={{ height: 3, bgcolor: T.primary, borderRadius: `${T.radius} ${T.radius} 0 0` }} />

        <CardContent sx={{ p: 3 }}>
          {error && (
            <Alert
              severity="error"
              onClose={() => setError(null)}
              sx={{ mb: 2.5, borderRadius: T.radiusSm }}
            >
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            {/* ── Section 1: Company Information ──────────────────────── */}
            <Box sx={{ mb: 3 }}>
              <Typography sx={{
                fontSize: '0.85rem', fontWeight: 700, color: T.textSecondary,
                textTransform: 'uppercase', letterSpacing: '0.05em', mb: 2,
              }}>
                Company Information
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Company Name"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleChange}
                    fullWidth
                    required
                    size="small"
                    placeholder="e.g. ABC Manufacturing Ltd."
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Contact Person"
                    name="contactPerson"
                    value={formData.contactPerson}
                    onChange={handleChange}
                    fullWidth
                    required
                    size="small"
                    placeholder="Full name"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Tax ID"
                    name="taxId"
                    value={formData.taxId}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    placeholder="e.g. GST / TIN"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Position"
                    name="position"
                    value={formData.position}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    placeholder="e.g. Sales Manager"
                    sx={fieldSx}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* ── Section 2: Contact Details ──────────────────────────── */}
            <Box sx={{ mb: 3 }}>
              <Typography sx={{
                fontSize: '0.85rem', fontWeight: 700, color: T.textSecondary,
                textTransform: 'uppercase', letterSpacing: '0.05em', mb: 2,
              }}>
                Contact Details
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    placeholder="+1 (555) 000-0000"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    placeholder="vendor@example.com"
                    sx={fieldSx}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* ── Email CC Section ──────────────────────────────────── */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography sx={{
                  fontSize: '0.85rem', fontWeight: 700, color: T.textSecondary,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Email CC
                </Typography>
                <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                  onClick={() => setCcList(prev => [...prev, { name: '', position: '', email: '' }])}
                  sx={{
                    textTransform: 'none', fontWeight: 600, fontSize: '0.78rem',
                    color: T.primary, borderRadius: T.radiusSm,
                    '&:hover': { bgcolor: T.primaryBg },
                  }}>
                  + Add CC
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
                    sx={{ color: T.textMuted, '&:hover': { color: '#EF4444', bgcolor: '#FEF2F2' } }}>
                    <DeleteIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>

            {/* ── Section 3: Address & Additional ──────────────────────── */}
            <Box sx={{ mb: 3 }}>
              <Typography sx={{
                fontSize: '0.85rem', fontWeight: 700, color: T.textSecondary,
                textTransform: 'uppercase', letterSpacing: '0.05em', mb: 2,
              }}>
                Additional Information
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    label="Address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    multiline
                    minRows={2}
                    placeholder="Street address, city, country"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Payment Terms"
                    name="paymentTerms"
                    value={formData.paymentTerms}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    placeholder="e.g. Net 30"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Notes"
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    multiline
                    minRows={2}
                    placeholder="Additional notes about this vendor"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Services (comma-separated)"
                    name="services"
                    value={formData.services}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    placeholder="e.g. Metal Fabrication, Assembly"
                    sx={fieldSx}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Initial Rating"
                    name="rating"
                    type="number"
                    value={formData.rating}
                    onChange={handleChange}
                    fullWidth
                    size="small"
                    inputProps={{ min: 0, max: 5, step: 0.1 }}
                    sx={fieldSx}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* ── Actions ──────────────────────────────────────────────── */}
            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', mt: 3.5 }}>
              <Button
                onClick={() => navigate('/vendors')}
                disabled={submitting}
                sx={{
                  textTransform: 'none', fontWeight: 600, fontSize: '0.85rem',
                  borderRadius: T.radiusSm, px: 3, color: T.textMuted,
                  '&:hover': { bgcolor: T.bg },
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={submitting}
                startIcon={<SaveIcon sx={{ fontSize: 18 }} />}
                sx={{
                  textTransform: 'none', fontWeight: 700, fontSize: '0.85rem',
                  borderRadius: T.radiusSm, px: 3,
                  bgcolor: T.primary, '&:hover': { bgcolor: '#166354' },
                  boxShadow: T.shadow, transition: 'all 0.2s',
                }}
              >
                {submitting ? 'Adding...' : 'Add Vendor'}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default AddVendorPage;
