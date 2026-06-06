import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, TextField, Grid, IconButton, alpha,
  CircularProgress, Alert, Breadcrumbs, Link, Snackbar,
  FormControl, InputLabel, Select, MenuItem, SelectChangeEvent,
  InputAdornment,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Home as HomeIcon,
  NavigateNext as NavNextIcon,
  Save as SaveIcon,
  Inventory2 as InventoryIcon,
  Category as CategoryIcon,
  Straighten as UnitIcon,
  Description as DescIcon,
} from '@mui/icons-material';
import { materialService } from '../services/materialService';
import { MaterialCategory } from '../types';

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

const selectSx = {
  borderRadius: T.radiusXs, fontSize: '0.85rem',
  '& fieldset': { borderColor: T.border },
  '&:hover fieldset': { borderColor: alpha(T.primary, 0.5) },
  '&.Mui-focused fieldset': { borderColor: T.primary, borderWidth: '1.5px' },
};

const CATEGORY_OPTIONS: MaterialCategory[] = ['raw_material', 'consumable', 'safety_equipment', 'tools'];
const UNIT_OPTIONS = ['Kg', 'Pieces', 'Liters', 'Meters'];
const fmtCategory = (c: string) => c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

/* ================================================================== */
const MaterialEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [form, setForm] = useState<any>({
    material_name: '',
    category: 'raw_material',
    unit: 'Kg',
    description: '',
  });

  useEffect(() => {
    const loadMaterial = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data: any = await materialService.getById(id);
        setForm({
          material_name: data.material_name || '',
          category: data.category || 'raw_material',
          unit: data.unit || 'Kg',
          description: data.description || '',
        });
      } catch {
        setError('Material not found');
      } finally {
        setLoading(false);
      }
    };
    loadMaterial();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((f: any) => ({ ...f, [name]: value }));
  };

  const handleSelectChange = (e: SelectChangeEvent) => {
    const { name, value } = e.target;
    setForm((f: any) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!id) return;
    if (!form.material_name?.trim()) { setError('Material name is required'); return; }
    try {
      setSaving(true);
      await materialService.update(id, {
        material_name: form.material_name.trim(),
        category: form.category,
        unit: form.unit,
        description: form.description,
      });
      setSuccessMsg('Material updated successfully');
      setTimeout(() => navigate('/materials'), 800);
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

  if (error && !form.material_name) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/materials')}
          sx={{ textTransform: 'none', fontWeight: 600, color: T.textSec }}>
          Back to Material Stock
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 4 }} className="animate-fadeIn">
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton onClick={() => navigate('/materials')} sx={{ color: T.textSec }}>
            <ArrowBackIcon sx={{ fontSize: 20 }} />
          </IconButton>
          <Box sx={{
            width: 38, height: 38, borderRadius: T.radiusXs, bgcolor: T.primaryBg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${alpha(T.primary, 0.15)}`,
          }}>
            <InventoryIcon sx={{ fontSize: 18, color: T.primary }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 17, color: T.dark, lineHeight: 1.2 }}>
              Edit Material
            </Typography>
            <Typography sx={{ fontSize: 12, color: T.textSec }}>
              Update material information
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button onClick={() => navigate('/materials')} disabled={saving}
            sx={{ fontWeight: 600, borderRadius: T.radiusXs, px: 2.5, fontSize: 13, color: T.textSec, textTransform: 'none', '&:hover': { bgcolor: T.bg } }}>
            Cancel
          </Button>
          <Button onClick={() => handleSubmit()} variant="contained" disabled={saving} startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
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
      <Box sx={{ bgcolor: T.white, borderRadius: T.radius, border: `1px solid ${T.border}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <Box sx={{ height: 3, bgcolor: T.primary }} />
        <Box sx={{ p: 3.5 }}>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}
          <form onSubmit={handleSubmit}>
            <Grid container spacing={2.5}>
              <Grid item xs={12}>
                <TextField
                  label="Material Name" name="material_name"
                  value={form.material_name} onChange={handleChange}
                  fullWidth required size="small"
                  placeholder="e.g. Copper Sheet, M8 Bolt"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <InventoryIcon sx={{ fontSize: 16, color: T.textSec }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={fieldSx}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ fontSize: 13, '&.Mui-focused': { color: T.primary } }}>Category</InputLabel>
                  <Select
                    label="Category" name="category"
                    value={form.category || 'raw_material'}
                    onChange={handleSelectChange}
                    startAdornment={
                      <InputAdornment position="start">
                        <CategoryIcon sx={{ fontSize: 16, color: T.textSec }} />
                      </InputAdornment>
                    }
                    sx={selectSx}
                  >
                    {CATEGORY_OPTIONS.map(c => (
                      <MenuItem key={c} value={c}>{fmtCategory(c)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ fontSize: 13, '&.Mui-focused': { color: T.primary } }}>Unit</InputLabel>
                  <Select
                    label="Unit" name="unit"
                    value={form.unit || 'Kg'}
                    onChange={handleSelectChange}
                    startAdornment={
                      <InputAdornment position="start">
                        <UnitIcon sx={{ fontSize: 16, color: T.textSec }} />
                      </InputAdornment>
                    }
                    sx={selectSx}
                  >
                    {UNIT_OPTIONS.map(u => (
                      <MenuItem key={u} value={u}>{u}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Description" name="description"
                  value={form.description} onChange={handleChange}
                  fullWidth multiline rows={3} size="small"
                  placeholder="Optional description or specifications…"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1 }}>
                        <DescIcon sx={{ fontSize: 16, color: T.textSec }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={fieldSx}
                />
              </Grid>
            </Grid>
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

export default MaterialEditPage;
