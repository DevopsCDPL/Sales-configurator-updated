/**
 * AddComponentPage — Create / Edit a configurator component.
 *
 * Adapted from `config/src/pages/AddComponent.tsx` into Forge:
 *   • MUI 5 + NotificationContext + Forge primary color
 *   • Reuses /api/configurator/components POST/PUT (admin-gated server-side)
 *   • Same conceptual flow: identity → costs → labour → specifications
 *   • Breaker-spec section conditionally shown for breaker categories
 *   • Pre-submit duplicate check (name + category)
 *   • Dirty-state guard (beforeunload + nav buttons confirm)
 *
 * Route variants:
 *   /components/new
 *   /components/:id/edit
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Paper, Typography, Button, TextField, Grid, Stack, Divider,
  FormControlLabel, Switch, Autocomplete, Alert, Chip, Skeleton,
  Accordion, AccordionSummary, AccordionDetails, MenuItem,
} from '@mui/material';
import {
  Save as SaveIcon, ArrowBack as BackIcon, ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import {
  configuratorService, NewComponentInput, ConfiguratorComponent,
  ConfiguratorCategory,
} from '../services/configuratorService';
import { useNotification } from '../contexts/NotificationContext';
import { useAuth } from '../contexts/AuthContext';
import { COMPONENT_CATEGORIES } from '../configurator/lib/component-categories';
import { STEP_CATEGORY_MAP } from '../configurator/steps/stepCategoryMap';

const PRIMARY = '#1F7A63';

const BREAKER_SPEC_FIELDS = [
  'sec1Desc', 'cbDesc', 'op', 'frameAmps', 'breakerVoltage', 'breakerKic',
  'poles', 'mechType', 'protectFunc', 'energyRed', 'tripMetering', 'tripComm',
  'auxContacts', 'bellAlarm', 'closingCoil', 'shuntTrip', 'chargingMotor',
  'kirkKey', 'interlockDesc', 'lineSide', 'loadSide',
] as const;
type BreakerSpecField = typeof BREAKER_SPEC_FIELDS[number];

const BREAKER_SPEC_LABELS: Record<BreakerSpecField, string> = {
  sec1Desc: 'Section Description',
  cbDesc: 'CB Description',
  op: 'Operation',
  frameAmps: 'Frame Amps',
  breakerVoltage: 'Voltage',
  breakerKic: 'KIC',
  poles: 'Poles',
  mechType: 'Mechanism Type',
  protectFunc: 'Protection Function',
  energyRed: 'Energy Reduction',
  tripMetering: 'Trip Metering',
  tripComm: 'Trip Comm',
  auxContacts: 'Aux Contacts',
  bellAlarm: 'Bell Alarm',
  closingCoil: 'Closing Coil',
  shuntTrip: 'Shunt Trip',
  chargingMotor: 'Charging Motor',
  kirkKey: 'Kirk Key',
  interlockDesc: 'Interlock Description',
  lineSide: 'Line Side',
  loadSide: 'Load Side',
};

const LABOUR_FIELDS: { key: keyof NewComponentInput; label: string }[] = [
  { key: 'lbr_cu', label: 'Copper (lbr_cu)' },
  { key: 'lbr_asm', label: 'Assembly (lbr_asm)' },
  { key: 'lbr_cnt', label: 'Control (lbr_cnt)' },
  { key: 'lbr_qc', label: 'QC (lbr_qc)' },
  { key: 'lbr_tst', label: 'Test (lbr_tst)' },
  { key: 'lbr_eng', label: 'Engineering (lbr_eng)' },
  { key: 'lbr_cad', label: 'CAD (lbr_cad)' },
];

function isBreakerCategory(cat?: string | null): boolean {
  if (!cat) return false;
  const upper = cat.toUpperCase();
  return upper.includes('CIRCUIT BREAKER') || upper === 'BREAKERS' || upper === 'BREAKER';
}

/**
 * Canonical runtime categories the configurator step engine actually queries.
 * Sourced from `frontend/src/configurator/lib/component-categories.ts`; this is
 * the authoritative set consumed by `stepCategoryMap.ts` chips. Components
 * stored under any other category will be persisted but never surface in the
 * Configuration tab. We surface this list in the autocomplete to prevent
 * silent mismatches (e.g. typing “BUSSING” when the engine asks for LUGS/HARDWARE).
 */
const CANONICAL_CATEGORIES: string[] = Object.values(COMPONENT_CATEGORIES);

/** Reverse index: category → list of step labels that consume it. */
const CATEGORY_TO_STEP_LABELS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const meta of Object.values(STEP_CATEGORY_MAP)) {
    if (!meta.categories) continue;
    for (const cat of meta.categories) {
      const key = String(cat).toUpperCase().trim();
      if (!out[key]) out[key] = [];
      if (!out[key].includes(meta.label)) out[key].push(meta.label);
    }
  }
  return out;
})();

const AddComponentPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const { showSuccess, showError } = useNotification();
  const { user } = useAuth();

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ConfiguratorCategory[]>([]);

  const [form, setForm] = useState<Partial<NewComponentInput>>({
    is_active: true,
    mat_cost: 0,
    labor_cost: 0,
    lbr_cu: 0, lbr_asm: 0, lbr_cnt: 0, lbr_qc: 0,
    lbr_tst: 0, lbr_eng: 0, lbr_cad: 0,
  });
  const [breakerSpecs, setBreakerSpecs] = useState<Record<BreakerSpecField, string>>(
    () => BREAKER_SPEC_FIELDS.reduce((a, k) => ({ ...a, [k]: '' }), {} as Record<BreakerSpecField, string>),
  );

  // Admin gate (UI; server-side enforces too)
  const canSubmit = useMemo(() => {
    const role = String(user?.role || '');
    return ['main_admin', 'platform_admin', 'super_admin', 'admin'].includes(role);
  }, [user]);

  // ── Load categories ──────────────────────────────────────────────
  useEffect(() => {
    configuratorService.listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // ── Load existing component (edit mode) ──────────────────────────
  useEffect(() => {
    if (!isEdit || !id) return;
    setLoading(true);
    configuratorService.getComponent(id)
      .then((c: ConfiguratorComponent | null) => {
        if (!c) {
          setError('Component not found');
          return;
        }
        setForm({
          name: c.name || '',
          part_number: c.part_number || '',
          category: c.category || '',
          subcategory: c.subcategory || '',
          type: c.type || '',
          description: c.description || '',
          mat_cost: Number(c.mat_cost ?? c.material_cost ?? 0),
          material_cost: Number(c.material_cost ?? c.mat_cost ?? 0),
          price: Number(c.price ?? 0),
          labor_cost: Number(c.labor_cost ?? 0),
          lbr_cu: Number(c.lbr_cu ?? 0),
          lbr_asm: Number(c.lbr_asm ?? 0),
          lbr_cnt: Number(c.lbr_cnt ?? 0),
          lbr_qc: Number(c.lbr_qc ?? 0),
          lbr_tst: Number(c.lbr_tst ?? 0),
          lbr_eng: Number(c.lbr_eng ?? 0),
          lbr_cad: Number(c.lbr_cad ?? 0),
          is_active: c.is_active !== false,
          image_url: c.image_url || '',
        });
        const specs = c.specifications || {};
        setBreakerSpecs(BREAKER_SPEC_FIELDS.reduce((a, k) => ({
          ...a, [k]: specs[k] != null ? String(specs[k]) : '',
        }), {} as Record<BreakerSpecField, string>));
      })
      .catch((err) => setError(err?.response?.data?.message || 'Failed to load component'))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  // ── Dirty guard (browser-level) ──────────────────────────────────
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const update = (patch: Partial<NewComponentInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };

  const updateSpec = (key: BreakerSpecField, value: string) => {
    setBreakerSpecs((s) => ({ ...s, [key]: value }));
    setDirty(true);
  };

  const showBreakerSpecs = isBreakerCategory(form.category);

  const handleBack = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    navigate('/components');
  };

  const handleSubmit = async () => {
    setError(null);

    if (!form.name || !form.name.trim()) {
      setError('Name is required.');
      return;
    }

    // Non-negative validation
    const numericKeys: (keyof NewComponentInput)[] = [
      'price', 'material_cost', 'labor_cost', 'mat_cost',
      'lbr_cu', 'lbr_asm', 'lbr_cnt', 'lbr_qc', 'lbr_tst', 'lbr_eng', 'lbr_cad',
    ];
    for (const k of numericKeys) {
      const v = form[k];
      if (v != null && Number(v) < 0) {
        setError(`${k} must be non-negative.`);
        return;
      }
    }

    // Build payload
    const payload: NewComponentInput = { name: form.name.trim() };
    payload.part_number = form.part_number?.trim() || undefined;
    payload.category = form.category?.trim().toUpperCase() || undefined;
    payload.subcategory = form.subcategory?.trim() || undefined;
    payload.type = form.type?.trim() || undefined;
    payload.description = form.description?.trim() || undefined;
    payload.is_active = form.is_active !== false;
    payload.image_url = form.image_url || undefined;

    // Pricing — mirror mat_cost → material_cost → price (parity with config app)
    const matCost = Number(form.mat_cost ?? 0);
    payload.mat_cost = matCost;
    payload.material_cost = Number(form.material_cost ?? matCost);
    payload.price = Number(form.price ?? matCost);

    // Labour
    let labourSum = 0;
    LABOUR_FIELDS.forEach(({ key }) => {
      const v = Number(form[key] ?? 0);
      (payload as any)[key] = v;
      labourSum += v;
    });
    payload.labor_cost = Number(form.labor_cost ?? 0) || labourSum;

    // Specifications (only persist for breaker categories)
    if (showBreakerSpecs) {
      const specs: Record<string, any> = {};
      BREAKER_SPEC_FIELDS.forEach((k) => {
        const v = breakerSpecs[k];
        if (v != null && v !== '') specs[k] = v;
      });
      payload.specifications = specs;
    }

    setSaving(true);
    try {
      // Pre-submit duplicate check (create mode only)
      if (!isEdit && payload.name) {
        try {
          const existing = await configuratorService.listComponents({
            search: payload.name,
            category: payload.category,
            limit: 10,
          });
          const dup = existing.find((c) =>
            (c.name || '').trim().toLowerCase() === payload.name.toLowerCase() &&
            (c.category || '').trim().toUpperCase() === (payload.category || '').toUpperCase(),
          );
          if (dup && !window.confirm(
            `A component named "${payload.name}" already exists in category "${payload.category || 'N/A'}". Create another?`,
          )) {
            setSaving(false);
            return;
          }
        } catch { /* non-fatal */ }
      }

      if (isEdit && id) {
        await configuratorService.updateComponent(id, payload);
        showSuccess('Component updated');
      } else {
        await configuratorService.createComponent(payload);
        showSuccess('Component created');
      }
      // Notify configurator runtime cache (componentCatalogCache listens) so the
      // chip pickers refetch on next mount instead of serving stale TTL data.
      try { window.dispatchEvent(new CustomEvent('tps:category-updated')); } catch { /* noop */ }
      setDirty(false);
      navigate('/components');
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Save failed';
      setError(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="text" width={200} height={40} />
        <Skeleton variant="rectangular" height={400} sx={{ mt: 2, borderRadius: 1 }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Button startIcon={<BackIcon />} onClick={handleBack} size="small">
              Back to Components
            </Button>
          </Stack>
          <Typography variant="h4" fontWeight={700} mt={1}>
            {isEdit ? 'Edit Component' : 'Add Component'}
          </Typography>
          {dirty && <Chip size="small" label="Unsaved changes" color="warning" sx={{ mt: 1 }} />}
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button onClick={handleBack} variant="outlined">Cancel</Button>
          <Button
            startIcon={<SaveIcon />}
            onClick={handleSubmit}
            variant="contained"
            disabled={saving || !canSubmit}
            sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#176650' } }}
          >
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Component')}
          </Button>
        </Stack>
      </Stack>

      {!canSubmit && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          You do not have permission to create or edit components. Contact a Super Admin.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Identity */}
      <Paper sx={{ p: 3, mb: 2 }} variant="outlined">
        <Typography variant="h6" fontWeight={600} mb={2}>Identity</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              label="Name *"
              fullWidth
              value={form.name || ''}
              onChange={(e) => update({ name: e.target.value })}
              required
              error={!!error && !form.name}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Part Number"
              fullWidth
              value={form.part_number || ''}
              onChange={(e) => update({ part_number: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Autocomplete
              freeSolo
              options={Array.from(new Set([
                ...CANONICAL_CATEGORIES,
                ...categories.map((c) => c.name),
              ])).sort()}
              groupBy={(opt) => CANONICAL_CATEGORIES.includes(opt) ? 'Configurator runtime categories' : 'Other'}
              value={form.category || ''}
              onChange={(_, v) => update({ category: (v || '').toString() })}
              onInputChange={(_, v) => update({ category: v })}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Category"
                  placeholder="e.g. LUGS, HARDWARE, CIRCUIT BREAKER"
                  helperText={(() => {
                    const cat = (form.category || '').toUpperCase().trim();
                    if (!cat) return 'Pick a runtime category so the component appears in the matching configuration step.';
                    const steps = CATEGORY_TO_STEP_LABELS[cat];
                    if (steps && steps.length) return `Will appear in: ${steps.join(', ')}`;
                    return 'Warning: this category is not consumed by any configuration step. The component will be saved but will not appear in the Configuration tab.';
                  })()}
                />
              )}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Subcategory"
              fullWidth
              value={form.subcategory || ''}
              onChange={(e) => update({ subcategory: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Type"
              fullWidth
              value={form.type || ''}
              onChange={(e) => update({ type: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.is_active !== false}
                  onChange={(e) => update({ is_active: e.target.checked })}
                />
              }
              label="Active"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Description"
              fullWidth multiline minRows={2}
              value={form.description || ''}
              onChange={(e) => update({ description: e.target.value })}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Costs */}
      <Paper sx={{ p: 3, mb: 2 }} variant="outlined">
        <Typography variant="h6" fontWeight={600} mb={2}>Pricing</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <TextField
              label="Material Cost (mat_cost)"
              fullWidth type="number" inputProps={{ min: 0, step: '0.01' }}
              value={form.mat_cost ?? 0}
              onChange={(e) => update({ mat_cost: Number(e.target.value) })}
              helperText="Mirrored to material_cost & price if those are blank"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Material Cost (override)"
              fullWidth type="number" inputProps={{ min: 0, step: '0.01' }}
              value={form.material_cost ?? ''}
              onChange={(e) => update({ material_cost: Number(e.target.value) })}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Price (override)"
              fullWidth type="number" inputProps={{ min: 0, step: '0.01' }}
              value={form.price ?? ''}
              onChange={(e) => update({ price: Number(e.target.value) })}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Labor Cost (override)"
              fullWidth type="number" inputProps={{ min: 0, step: '0.01' }}
              value={form.labor_cost ?? ''}
              onChange={(e) => update({ labor_cost: Number(e.target.value) })}
              helperText="Auto-derived from labour hours if blank"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Labour buckets */}
      <Paper sx={{ p: 3, mb: 2 }} variant="outlined">
        <Typography variant="h6" fontWeight={600} mb={2}>Labour Hours</Typography>
        <Grid container spacing={2}>
          {LABOUR_FIELDS.map(({ key, label }) => (
            <Grid item xs={12} sm={6} md={3} key={key}>
              <TextField
                label={label}
                fullWidth type="number" inputProps={{ min: 0, step: '0.01' }}
                value={(form[key] as any) ?? 0}
                onChange={(e) => update({ [key]: Number(e.target.value) } as any)}
              />
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Specifications */}
      <Accordion defaultExpanded={showBreakerSpecs} variant="outlined">
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography variant="h6" fontWeight={600}>
            Specifications {showBreakerSpecs ? '(Breaker)' : '(category-specific)'}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          {!showBreakerSpecs && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Specification fields are populated for breaker categories. Set the category to
              <strong> CIRCUIT BREAKERS / BREAKERS </strong> to enable them.
            </Alert>
          )}
          <Grid container spacing={2}>
            {BREAKER_SPEC_FIELDS.map((k) => (
              <Grid item xs={12} sm={6} md={4} key={k}>
                <TextField
                  label={BREAKER_SPEC_LABELS[k]}
                  fullWidth size="small"
                  disabled={!showBreakerSpecs}
                  value={breakerSpecs[k]}
                  onChange={(e) => updateSpec(k, e.target.value)}
                />
              </Grid>
            ))}
          </Grid>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default AddComponentPage;
