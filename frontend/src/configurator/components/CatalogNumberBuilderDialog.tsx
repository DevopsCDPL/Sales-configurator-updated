/**
 * CatalogNumberBuilderDialog — Schneider Masterpact NT/NW catalog-number builder.
 * Uses the decoding engine from ../data/schneiderDecoderData.ts (do not modify that file).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
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

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
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

interface Props {
  open: boolean;
  component: ConfiguratorComponent | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function CatalogNumberBuilderDialog({ open, component, onClose, onSaved }: Props) {
  const [std, setStd] = useState<string>('UL AC');
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset state when dialog opens for a new component
  useEffect(() => {
    if (open) {
      setStd('UL AC');
      setSelections({});
      setError(null);
      setSaving(false);
    }
  }, [open, component?.id]);

  // When std changes, drop selections whose code is no longer valid for the new std
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
      // Keep special positions as-is (they are std-independent)
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

  const generated = buildCatalogNumber(selections);
  const charCount = generated.length;

  // Completeness: every DECODER_POSITION whose options are non-empty for current std must be filled
  const complete = DECODER_POSITIONS.every((def) => {
    const opts = getOptions(def.key);
    if (opts.length === 0) return true; // skip empty positions
    return !!selections[def.key];
  });

  // Current special selections as an array of CodeOption (for the Autocomplete value)
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
      // Clear all special slots first
      for (const n of DECODER_SPECIAL_POSITIONS) {
        delete next[String(n)];
      }
      // Set chosen codes into slots 19..25 in order
      capped.forEach((opt, i) => {
        next[String(DECODER_SPECIAL_POSITIONS[i])] = opt.code;
      });
      return next;
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generated).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleApply = async () => {
    if (!component || !complete) return;
    setSaving(true);
    setError(null);
    try {
      const spec = { ...((component as any).specifications ?? {}), catalogNumber: generated };
      await configuratorService.updateComponent(component.id, { specifications: spec } as any);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
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
        <Typography sx={{ color: '#F0F6FF', fontSize: 14, fontWeight: 800 }}>
          Catalog Number Builder — Masterpact NT/NW
        </Typography>
        <Typography sx={{ color: C.sub, fontSize: 11.5, mt: 0.25 }}>
          Schneider position-by-position part number (positions 1–25)
        </Typography>
        {component && (
          <Typography sx={{ color: C.sub, fontSize: 12, mt: 0.75 }} noWrap>
            {component.name ?? ''}
          </Typography>
        )}
      </DialogTitle>

      <Divider sx={{ borderColor: C.border, mt: 1 }} />

      {/* Live preview bar — sticky */}
      <Box
        sx={{
          position: 'sticky', top: 0, zIndex: 10,
          bgcolor: C.surface, borderBottom: '1px solid ' + C.border,
          px: 2, py: 1,
          display: 'flex', alignItems: 'center', gap: 1,
        }}
      >
        <Stack flex={1} spacing={0.25}>
          <Typography
            sx={{
              fontFamily: 'monospace', fontSize: 16, fontWeight: 800,
              color: C.blue, letterSpacing: 1, wordBreak: 'break-all',
            }}
          >
            {generated || '—'}
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: 10 }}>
            {charCount} character{charCount !== 1 ? 's' : ''}
          </Typography>
        </Stack>
        <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
          <IconButton size="small" onClick={handleCopy} sx={{ color: copied ? C.green : C.sub, '&:hover': { color: C.blue } }}>
            <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>

      <DialogContent dividers sx={{ borderColor: C.border, pt: 2 }}>
        {/* Standard selector */}
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          <Typography sx={{ color: C.sub, fontSize: 12, flexShrink: 0 }}>Standard:</Typography>
          <TextField
            select
            size="small"
            value={std}
            onChange={(e) => handleStdChange(e.target.value)}
            sx={{ ...inputSx, minWidth: 160 }}
          >
            {DECODER_STANDARDS.map((s) => (
              <MenuItem key={s} value={s} sx={{ fontSize: 12.5, color: C.text }}>
                {s}
              </MenuItem>
            ))}
          </TextField>
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

        {/* Position grid — 2 columns */}
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
                getOptionLabel={(o) => `${o.code} — ${o.label}`}
                value={currentOpt}
                onChange={(_e, v) => {
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
                    label={`${def.posLabel} · ${def.name}`}
                    sx={inputSx}
                  />
                )}
              />
            );
          })}
        </Box>

        {/* Special positions 19-25 */}
        <Box sx={{ mt: 1.5 }}>
          <Autocomplete
            multiple
            options={POS19_25_SPECIAL}
            getOptionLabel={(o) => `${o.code} — ${o.label}`}
            value={specialValue}
            onChange={handleSpecialChange}
            isOptionEqualToValue={(o, v) => o.code === v.code}
            componentsProps={{ paper: { sx: popperPaperSx } }}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label="Special options (Pos 19–25, optional)"
                sx={inputSx}
              />
            )}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5, borderTop: '1px solid ' + C.border }}>
        <Button onClick={onClose} sx={{ color: C.sub, textTransform: 'none' }}>Cancel</Button>
        <Tooltip title={complete ? '' : 'Select all positions first'}>
          <span>
            <Button
              disabled={!complete || saving}
              onClick={handleApply}
              variant="contained"
              sx={{
                bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontWeight: 700,
                '&:hover': { bgcolor: '#33d4ff' },
                '&.Mui-disabled': { bgcolor: 'rgba(0,200,255,0.25)', color: 'rgba(6,21,28,0.5)' },
              }}
            >
              {saving ? <CircularProgress size={14} sx={{ color: '#06151c' }} /> : 'Apply to component'}
            </Button>
          </span>
        </Tooltip>
      </DialogActions>
    </Dialog>
  );
}
