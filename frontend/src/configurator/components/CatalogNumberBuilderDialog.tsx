/**
 * CatalogNumberBuilderDialog — Schneider Part Number Decoder.
 * Uses the decoding engine from ../data/schneiderDecoderData.ts (do not modify that file).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  DECODER_POSITIONS,
  DECODER_SPECIAL_POSITIONS,
  DECODER_STANDARDS,
  POS19_25_SPECIAL,
  buildCatalogNumber,
  getPos1Options,
  getPos2Options,
} from '../data/schneiderDecoderData';
import type { CodeOption } from '../data/schneiderDecoderData';
import { configuratorService, ConfiguratorComponent } from '../../services/configuratorService';
import configuratorV2Service from '../../services/configuratorV2Service';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
  title: '#F0F6FF',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.surface, color: C.text, fontSize: 12.5,
    '& fieldset': { borderColor: C.border },
    '&.Mui-focused fieldset': { borderColor: C.blue },
  },
  '& input': { color: C.text },
  '& .MuiInputLabel-root': { color: C.sub, fontSize: 12 },
};

const popperPaperSx = { bgcolor: C.surface, color: C.text, border: '1px solid ' + C.border };

// Detail field definitions: label -> spec key
const DETAIL_FIELDS: { label: string; key: string }[] = [
  { label: 'Breaker Type',            key: 'deviceClass' },
  { label: 'Manufacturer',            key: 'manufacturer' },
  { label: 'Series / Product Family', key: 'series' },
  { label: 'Frame / Model',           key: 'frameModel' },
  { label: 'Rated Current (A)',       key: 'ratedCurrentA' },
  { label: 'Breaking Capacity (kA)',  key: 'interruptingKA' },
  { label: 'Number of Poles',         key: 'poles' },
  { label: 'Rated Voltage',           key: 'voltageRating' },
  { label: 'Trip Unit Type',          key: 'tripUnitType' },
  { label: 'Protection Functions',    key: 'protectionFunctions' },
  { label: 'Mounting Type',           key: 'mounting' },
  { label: 'Application Type',        key: 'applicationType' },
  { label: 'Dimensions',              key: 'dimensions' },
];

const NUMERIC_KEYS = new Set(['ratedCurrentA', 'interruptingKA', 'poles']);

function coerceSpecValue(key: string, v: string): string | number | null {
  const trimmed = v.trim();
  if (trimmed === '') return null;
  if (NUMERIC_KEYS.has(key)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return v;
}

/** Pure helper: derive CB detail fields from currently selected position labels. */
function deriveDetailsFromSelections(
  selections: Record<string, string>,
  getOpts: (key: string) => { code: string; label: string }[],
): Partial<Record<string, string>> {
  const label = (key: string): string =>
    getOpts(key).find((o) => o.code === selections[key])?.label ?? '';

  const d: Partial<Record<string, string>> = {};

  if (Object.keys(selections).length === 0) return d;

  // deviceClass — constant for Masterpact (ACB)
  d.deviceClass = 'ACB';
  d.mounting = 'Drawout';

  // manufacturer from Pos 2 (Branding)
  const brandLabel = label('2');
  if (brandLabel) {
    if (/Schneider Electric/i.test(brandLabel)) d.manufacturer = 'Schneider Electric';
    else if (/Square D/i.test(brandLabel)) d.manufacturer = 'Square D';
  }

  // series / frameModel / poles from Pos 1 (Frame)
  const frameLabel = label('1');
  if (frameLabel) {
    const frameMatch = frameLabel.match(/\b(NT|NW)\b/);
    const frameType = frameMatch ? frameMatch[1] : null;
    if (frameType) {
      d.series = 'Masterpact ' + frameType;
      d.frameModel = frameType;
    } else {
      d.series = 'Masterpact NT/NW';
    }
    const polesMatch = frameLabel.match(/(\d)(?:\/\d)?-Pole/i);
    if (polesMatch) d.poles = polesMatch[1];
  }

  // ratedCurrentA from Pos 5 (Ampacity), fallback Pos 4 (Frame Rating)
  const ampLabel = label('5');
  if (ampLabel) {
    const aMatch = ampLabel.match(/(\d[\d,]*)\s*A/);
    if (aMatch) d.ratedCurrentA = aMatch[1].replace(/,/g, '');
  }
  if (!d.ratedCurrentA) {
    const frameRatingLabel = label('4');
    if (frameRatingLabel) {
      const aMatch = frameRatingLabel.match(/(\d[\d,]*)\s*A/);
      if (aMatch) d.ratedCurrentA = aMatch[1].replace(/,/g, '');
    }
  }

  // interruptingKA from Pos 3 (Air Code) — prefer explicit "N kA" else first value from NT:/NW: list
  const airLabel = label('3');
  if (airLabel) {
    const kaMatch = airLabel.match(/(\d+)\s*kA/i) ?? airLabel.match(/(?:NT|NW):(\d+)/i);
    if (kaMatch) d.interruptingKA = kaMatch[1];
  }

  // voltageRating from Pos 3 or Pos 6
  const termLabel = label('6');
  const voltSearch = airLabel + ' ' + termLabel;
  const voltMatch = voltSearch.match(/(\d{3,4})\s*V(?:ac|dc)?/i);
  if (voltMatch) d.voltageRating = voltMatch[1] + 'V';

  // tripUnitType and protectionFunctions from Pos 7_8
  const tripLabel = label('7_8');
  if (tripLabel) {
    d.tripUnitType = tripLabel.trim();
    const pfMatch = tripLabel.match(/\b(LSIG|LSIV|LSI|LI|LSO|LSG)\b/i);
    if (pfMatch) d.protectionFunctions = pfMatch[1].toUpperCase();
  }

  return d;
}

interface Props {
  open: boolean;
  component: ConfiguratorComponent | null;
  switchboardId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  onAdded?: () => void;
}

export default function CatalogNumberBuilderDialog({
  open, component, switchboardId, onClose, onSaved, onAdded,
}: Props) {
  const [std, setStd] = useState<string>('UL AC');
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [qty, setQty] = useState<number>(1);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  // Track which detail keys the user has manually edited — derived values won't clobber these.
  const touchedRef = useRef<Set<string>>(new Set());

  const prefillDetails = useCallback((comp: ConfiguratorComponent | null) => {
    if (!comp) { setDetails({}); return; }
    const spec = (comp as any).specifications ?? {};
    const d: Record<string, string> = {};
    for (const f of DETAIL_FIELDS) {
      const v = spec[f.key];
      d[f.key] = v != null ? String(v) : '';
    }
    setDetails(d);
  }, []);

  useEffect(() => {
    if (open && component?.id) {
      setStd('UL AC');
      setSelections({});
      setQty(1);
      setError(null);
      setSaving(false);
      setAdding(false);
      setSavedNote(false);
      touchedRef.current = new Set();
      prefillDetails(component);
    }
  }, [open, component?.id, prefillDetails]);

  const handleStdChange = useCallback((newStd: string) => {
    setStd(newStd);
    setSelections((prev) => {
      const next: Record<string, string> = {};
      for (const def of DECODER_POSITIONS) {
        const code = prev[def.key];
        if (!code) continue;
        const opts =
          def.key === '1' ? getPos1Options(newStd)
          : def.key === '2' ? getPos2Options(newStd)
          : def.getOptions(newStd);
        if (opts.some((o) => o.code === code)) {
          next[def.key] = code;
        }
      }
      for (const n of DECODER_SPECIAL_POSITIONS) {
        const k = String(n);
        if (prev[k]) next[k] = prev[k];
      }
      return next;
    });
  }, []);

  const getOptions = useCallback((key: string): CodeOption[] => {
    if (key === '1') return getPos1Options(std);
    if (key === '2') return getPos2Options(std);
    const def = DECODER_POSITIONS.find((d) => d.key === key);
    return def ? def.getOptions(std) : [];
  }, [std]);

  // Derive detail fields from selections and merge into details (untouched keys only).
  useEffect(() => {
    if (Object.keys(selections).length === 0) return;
    const derived = deriveDetailsFromSelections(selections, getOptions);
    setDetails((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const k of Object.keys(derived)) {
        const val = derived[k as keyof typeof derived];
        if (val && !touchedRef.current.has(k) && next[k] !== val) {
          next[k] = val;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, std]);

  const generated = buildCatalogNumber(selections);

  const complete = DECODER_POSITIONS.every((def) => {
    const opts = getOptions(def.key);
    if (opts.length === 0) return true;
    return !!selections[def.key];
  });

  // canSave: enabled when generated number is meaningful (>= 8 chars)
  const canSave = generated.trim().length >= 8;

  // Count positions with options but no selection (for partial-warning chip)
  const partialCount = DECODER_POSITIONS.filter((def) => {
    const opts = getOptions(def.key);
    return opts.length > 0 && !selections[def.key];
  }).length;

  const specialValue: CodeOption[] = DECODER_SPECIAL_POSITIONS
    .map((n) => {
      const code = selections[String(n)];
      if (!code) return null;
      return POS19_25_SPECIAL.find((o) => o.code === code) ?? null;
    })
    .filter(Boolean) as CodeOption[];

  const handleSpecialChange = (_e: React.SyntheticEvent, value: CodeOption[]) => {
    const capped = value.slice(0, 7);
    setSelections((prev) => {
      const next = { ...prev };
      for (const n of DECODER_SPECIAL_POSITIONS) delete next[String(n)];
      capped.forEach((opt, i) => { next[String(DECODER_SPECIAL_POSITIONS[i])] = opt.code; });
      return next;
    });
  };

  const handleCopy = () => {
    if (!generated) return;
    navigator.clipboard.writeText(generated).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const buildSpecEdits = () => {
    if (!component) return {};
    const origSpec = (component as any).specifications ?? {};
    const edits: Record<string, string | number | null> = {};
    for (const f of DETAIL_FIELDS) {
      const origRaw = origSpec[f.key];
      const origStr = origRaw != null ? String(origRaw) : '';
      const current = details[f.key] ?? '';
      if (current !== origStr) {
        edits[f.key] = coerceSpecValue(f.key, current);
      }
    }
    return edits;
  };

  const handleSaveCatalog = async () => {
    if (!component || !canSave) return;
    setSaving(true);
    setError(null);
    setSavedNote(false);
    try {
      const specEdits = buildSpecEdits();
      const spec = {
        ...((component as any).specifications ?? {}),
        ...specEdits,
        catalogNumber: generated,
      };
      await configuratorService.updateComponent(component.id, { specifications: spec } as any);
      setSavedNote(true);
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddToConfig = async () => {
    if (!component || !canSave || !switchboardId) return;
    setAdding(true);
    setError(null);
    try {
      await configuratorV2Service.addLine(switchboardId, {
        scope: 'board',
        component_id: component.id,
        category: component.category ?? 'CIRCUIT BREAKER',
        part_number: component.part_number ?? null,
        name: component.name ?? null,
        quantity: Math.max(1, Number(qty) || 1),
        unit_cost: Number(component.price) || 0,
        price_status: ((component as any).price_status ?? 'PENDING_RFQ') as 'FIRM' | 'ESTIMATED' | 'PENDING_RFQ',
        source: 'user',
        meta: { catalogNumber: generated },
      });
      onAdded?.();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Add to config failed');
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { bgcolor: '#000', border: '1px solid ' + C.border, borderRadius: '12px', backgroundImage: 'none' },
      }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>
        <Typography sx={{ color: C.title, fontSize: 14, fontWeight: 800 }}>
          Schneider Part Number Decoder
        </Typography>
        {component && (
          <Typography sx={{ color: C.sub, fontSize: 11.5, mt: 0.25 }}>
            Generate a catalog number for &quot;{component.name}&quot;, review full details, then save it to the catalog or add it to the configuration.
          </Typography>
        )}
      </DialogTitle>

      <Divider sx={{ borderColor: C.border, mt: 1 }} />

      <DialogContent dividers sx={{ borderColor: C.border, pt: 2 }}>
        <Stack direction="row" gap={1.5} alignItems="stretch" sx={{ mb: 2 }}>
          <Box
            sx={{
              flex: 1,
              border: '1px solid rgba(0,200,255,0.45)',
              borderRadius: '10px',
              p: 1.25,
              bgcolor: 'rgba(0,200,255,0.04)',
            }}
          >
            <Typography sx={{ color: C.title, fontSize: 11, fontWeight: 800, mb: 0.75 }}>
              Generated Catalog Number
            </Typography>
            <Box
              sx={{
                bgcolor: C.surface,
                border: '1px solid ' + C.border,
                borderRadius: '8px',
                px: 1.25,
                py: 0.9,
                mb: 1,
              }}
            >
              <Typography
                sx={{
                  fontFamily: 'monospace',
                  fontSize: 15,
                  fontWeight: 800,
                  color: generated ? C.title : C.sub,
                  letterSpacing: 3,
                  wordBreak: 'break-all',
                }}
              >
                {generated || '—'}
              </Typography>
            </Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography sx={{ color: C.sub, fontSize: 11 }}>Qty to add:</Typography>
              <TextField
                type="number"
                size="small"
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                inputProps={{ min: 1 }}
                sx={{
                  width: 64,
                  ...inputSx,
                  '& input[type=number]': { MozAppearance: 'textfield' },
                  '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                    WebkitAppearance: 'none',
                    margin: 0,
                  },
                }}
              />
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ color: C.blue, fontSize: 11 }}>
                {generated.length} chars
              </Typography>
              <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
                <span>
                  <IconButton
                    size="small"
                    onClick={handleCopy}
                    disabled={!generated}
                    sx={{ color: copied ? C.green : C.sub, '&:hover': { color: C.blue } }}
                  >
                    <ContentCopyRoundedIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Box>

          <Box
            sx={{
              flex: 1,
              border: '1px solid ' + C.border,
              borderRadius: '10px',
              p: 1.25,
            }}
          >
            <Typography sx={{ color: C.title, fontSize: 11, fontWeight: 800, mb: 0.75 }}>
              Standard
            </Typography>
            <TextField
              select
              size="small"
              fullWidth
              value={std}
              onChange={(e) => handleStdChange(e.target.value)}
              sx={inputSx}
            >
              {DECODER_STANDARDS.map((s) => (
                <MenuItem key={s} value={s} sx={{ fontSize: 12.5, color: C.text }}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <Typography sx={{ color: C.sub, fontSize: 10.5, mt: 0.75 }}>
              UL / ANSI / IEC and AC / DC determine which codes are available per position.
            </Typography>
          </Box>
        </Stack>

        {error && (
          <Alert
            severity="error"
            onClose={() => setError(null)}
            sx={{ mb: 2, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}
          >
            {error}
          </Alert>
        )}

        <Box
          sx={{
            border: '1px solid ' + C.border,
            borderRadius: '10px',
            p: 1.25,
            mb: 2,
          }}
        >
          <Typography sx={{ color: C.title, fontSize: 11, fontWeight: 800, mb: 1.25 }}>
            Part Number Decoder — Position Selection
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
            {DECODER_POSITIONS.map((def) => {
              const opts = getOptions(def.key);
              if (opts.length === 0) return null;
              const currentCode = selections[def.key] ?? null;
              const currentOpt = opts.find((o) => o.code === currentCode) ?? null;
              return (
                <Autocomplete
                  key={def.key}
                  options={opts}
                  getOptionLabel={(o) => o.code + ' — ' + o.label}
                  value={currentOpt}
                  onChange={(_e, v) => {
                    setSavedNote(false);
                    setSelections((prev) => {
                      const next = { ...prev };
                      if (v) next[def.key] = v.code;
                      else delete next[def.key];
                      return next;
                    });
                  }}
                  isOptionEqualToValue={(o, v) => o.code === v.code}
                  componentsProps={{ paper: { sx: popperPaperSx } }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      label={def.posLabel + ' · ' + def.name}
                      sx={inputSx}
                    />
                  )}
                />
              );
            })}
          </Box>

          <Box sx={{ mt: 1.5 }}>
            <Autocomplete
              multiple
              options={POS19_25_SPECIAL}
              getOptionLabel={(o) => o.code + ' — ' + o.label}
              value={specialValue}
              onChange={handleSpecialChange}
              isOptionEqualToValue={(o, v) => o.code === v.code}
              componentsProps={{ paper: { sx: popperPaperSx } }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  label="Special options (Pos 19-25, optional)"
                  sx={inputSx}
                />
              )}
            />
          </Box>
        </Box>

        <Accordion
          defaultExpanded={false}
          disableGutters
          elevation={0}
          sx={{
            bgcolor: 'transparent',
            border: '1px solid ' + C.border,
            borderRadius: '10px',
            '&:before': { display: 'none' },
          }}
        >
          <AccordionSummary
            expandIcon={<ExpandMoreIcon sx={{ color: C.sub, fontSize: 18 }} />}
            sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.75 } }}
          >
            <Typography sx={{ color: C.title, fontSize: 11, fontWeight: 800 }}>
              Circuit Breaker Details
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, pb: 1.5, px: 1.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
              {DETAIL_FIELDS.map((f) => (
                <TextField
                  key={f.key}
                  size="small"
                  label={f.label}
                  value={details[f.key] ?? ''}
                  onChange={(e) => {
                    setSavedNote(false);
                    touchedRef.current.add(f.key);
                    setDetails((prev) => ({ ...prev, [f.key]: e.target.value }));
                  }}
                  sx={{ ...inputSx, '& .MuiInputLabel-root': { color: C.sub, fontSize: 11 } }}
                />
              ))}
              <TextField
                size="small"
                label="Catalogue Number"
                value={generated || '—'}
                InputProps={{ readOnly: true }}
                sx={{
                  ...inputSx,
                  '& .MuiInputLabel-root': { color: C.sub, fontSize: 11 },
                  '& .MuiOutlinedInput-root': {
                    bgcolor: C.surface, color: C.blue, fontSize: 12.5,
                    '& fieldset': { borderColor: C.border },
                    '&.Mui-focused fieldset': { borderColor: C.border },
                  },
                }}
              />
            </Box>
          </AccordionDetails>
        </Accordion>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5, borderTop: '1px solid ' + C.border, gap: 1 }}>
        {savedNote && (
          <Typography sx={{ color: C.green, fontSize: 11, mr: 'auto' }}>
            Saved to catalog
          </Typography>
        )}
        {!savedNote && (
          <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, gap: 1 }}>
            {canSave && !complete && partialCount > 0 && (
              <Chip
                label={'Partial — ' + partialCount + ' position(s) unset'}
                size="small"
                sx={{
                  height: 20, fontSize: 10.5,
                  bgcolor: 'rgba(217,119,6,0.12)',
                  color: C.amber,
                  border: '1px solid rgba(217,119,6,0.35)',
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            )}
          </Box>
        )}

        <Button onClick={onClose} sx={{ color: C.sub, textTransform: 'none' }}>
          Cancel
        </Button>

        <Tooltip title={canSave ? '' : 'Build at least 8 positions to enable save'}>
          <span>
            <Button
              disabled={!canSave || saving}
              onClick={handleSaveCatalog}
              variant="outlined"
              startIcon={<SaveRoundedIcon sx={{ fontSize: 15 }} />}
              sx={{
                borderColor: C.blue,
                color: C.blue,
                textTransform: 'none',
                '&:hover': { bgcolor: 'rgba(0,200,255,0.08)', borderColor: C.blue },
                '&.Mui-disabled': { borderColor: 'rgba(0,200,255,0.25)', color: 'rgba(0,200,255,0.4)' },
              }}
            >
              {saving ? 'Saving...' : 'Save Catalog'}
            </Button>
          </span>
        </Tooltip>

        <Tooltip
          title={
            !switchboardId
              ? "Open this builder from a board's Components step to add directly to a configuration"
              : !canSave
              ? 'Build at least 8 positions to enable add'
              : ''
          }
        >
          <span>
            <Button
              disabled={!canSave || !switchboardId || adding}
              onClick={handleAddToConfig}
              variant="contained"
              startIcon={<AddRoundedIcon sx={{ fontSize: 15 }} />}
              sx={{
                bgcolor: C.blue,
                color: '#06151c',
                textTransform: 'none',
                fontWeight: 700,
                '&:hover': { bgcolor: '#33d4ff' },
                '&.Mui-disabled': { bgcolor: 'rgba(0,200,255,0.25)', color: 'rgba(6,21,28,0.5)' },
              }}
            >
              {adding ? 'Adding...' : '+ Add to Config'}
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
}
