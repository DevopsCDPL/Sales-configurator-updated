/**
 * CbFilterPanel — standalone cascading filter for CIRCUIT BREAKER catalog rows.
 *
 * Extracted (logic only) from the legacy System Design "Circuit Breaker
 * Selection" UI (CircuitBreakerTab.tsx). That component was coupled to
 * ConfiguratorProvider/v1 state, field-intelligence directives and a static
 * dataset, so this is a clean rebuild that operates purely on props:
 *
 *   items     — ConfiguratorComponent rows; specs live in item.specifications
 *   onFiltered — called with the narrowed list whenever filters change
 *
 * Option sets for every dropdown are derived dynamically from the specs of the
 * CURRENTLY filtered items, so each selection narrows the others (true
 * cascading). 'All' / empty = no constraint on that field.
 *
 * No 'Generate Catalog No' button — that belongs to the part-number builder.
 * This is a per-category filter slot; other categories get their own later.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { Box, MenuItem, TextField, Typography, Button, Stack } from '@mui/material';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B',
};

const selectSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.surface, color: C.text, fontSize: 12.5,
    '& fieldset': { borderColor: C.border },
    '&:hover fieldset': { borderColor: C.border },
    '&.Mui-focused fieldset': { borderColor: C.blue },
  },
  '& .MuiSelect-icon': { color: C.sub },
  '& .MuiInputLabel-root': { color: C.sub, fontSize: 11.5 },
  '& .MuiInputLabel-root.Mui-focused': { color: C.blue },
};

const menuProps = {
  PaperProps: { sx: { bgcolor: C.surface, color: C.text, border: '1px solid ' + C.border, '& .MuiMenuItem-root': { fontSize: 12.5 } } },
};

/** Filterable spec fields, in display order. label + spec key. */
const FIELDS: { key: string; label: string; cascadesFrom?: string }[] = [
  { key: 'deviceClass', label: 'Breaker Class' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'series', label: 'Series / Family' },
  { key: 'frameModel', label: 'Frame / Model' },
  { key: 'ratedCurrentA', label: 'Rated Current (A)' },
  { key: 'poles', label: 'Poles' },
  { key: 'interruptingKA', label: 'Breaking Capacity (kA)' },
  { key: 'voltageRating', label: 'Rated Voltage' },
  { key: 'tripUnitType', label: 'Trip Unit Type' },
  { key: 'protectionFunctions', label: 'Protection Functions' },
  { key: 'mounting', label: 'Mounting Type' },
  { key: 'applicationType', label: 'Application Type' },
];

type Filters = Record<string, string>;
const EMPTY: Filters = FIELDS.reduce((a, f) => { a[f.key] = ''; return a; }, {} as Filters);

const specOf = (item: any) => (item && item.specifications) || {};
const val = (item: any, key: string): string => {
  const v = specOf(item)[key];
  return v == null || v === '' ? '' : String(v);
};

/** Numeric-aware sort so 100/630/800 don't sort as strings. */
const sortOpts = (vals: string[]): string[] =>
  [...vals].sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    const aNum = !isNaN(na) && /^[\d.]/.test(a);
    const bNum = !isNaN(nb) && /^[\d.]/.test(b);
    if (aNum && bNum) return na - nb;
    return a.localeCompare(b);
  });

export interface CbFilterPanelProps {
  items: any[];
  onFiltered: (items: any[]) => void;
}

const CbFilterPanel: React.FC<CbFilterPanelProps> = ({ items, onFiltered }) => {
  const [filters, setFilters] = useState<Filters>(EMPTY);

  // Reset when the source list identity changes (category switch / new search).
  useEffect(() => { setFilters(EMPTY); }, [items]);

  /** Items passing every selected filter. */
  const filtered = useMemo(() => {
    return items.filter((item) =>
      FIELDS.every((f) => !filters[f.key] || val(item, f.key) === filters[f.key])
    );
  }, [items, filters]);

  // Push filtered set up to parent.
  useEffect(() => { onFiltered(filtered); }, [filtered, onFiltered]);

  /**
   * Cascading option sets: for each field, options are the distinct values
   * present in the items that pass ALL OTHER active filters (i.e. ignoring
   * this field's own selection). That way picking a manufacturer narrows the
   * series list, picking a series narrows frames, etc.
   */
  const optionSets = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of FIELDS) {
      const others = FIELDS.filter((o) => o.key !== f.key);
      const subset = items.filter((item) =>
        others.every((o) => !filters[o.key] || val(item, o.key) === filters[o.key])
      );
      const set = new Set<string>();
      for (const item of subset) {
        const v = val(item, f.key);
        if (v) set.add(v);
      }
      out[f.key] = sortOpts(Array.from(set));
    }
    return out;
  }, [items, filters]);

  const handleChange = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // Clear downstream selections that are no longer valid for the new value.
      const recompute = (fs: Filters) => {
        for (const f of FIELDS) {
          if (!fs[f.key]) continue;
          const others = FIELDS.filter((o) => o.key !== f.key);
          const subset = items.filter((item) =>
            others.every((o) => !fs[o.key] || val(item, o.key) === fs[o.key])
          );
          const stillValid = subset.some((item) => val(item, f.key) === fs[f.key]);
          if (!stillValid) fs[f.key] = '';
        }
        return fs;
      };
      return recompute(next);
    });
  };

  const activeCount = FIELDS.filter((f) => filters[f.key]).length;

  return (
    <Box
      sx={{
        bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px',
        p: 1.5, mb: 1.5,
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ color: C.text, fontSize: 12.5, fontWeight: 700, flex: 1 }}>
          Circuit breaker filters
          <Typography component="span" sx={{ color: C.sub, fontSize: 11, fontWeight: 400, ml: 1 }}>
            {filtered.length} of {items.length} match
          </Typography>
        </Typography>
        {activeCount > 0 && (
          <Button
            size="small" onClick={() => setFilters(EMPTY)}
            sx={{ color: C.blue, textTransform: 'none', fontSize: 11.5, minWidth: 0, p: '2px 8px' }}
          >
            Clear ({activeCount})
          </Button>
        )}
      </Stack>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 1,
        }}
      >
        {FIELDS.map((f) => {
          const opts = optionSets[f.key] || [];
          const disabled = opts.length === 0 && !filters[f.key];
          return (
            <TextField
              key={f.key}
              select
              size="small"
              label={f.label}
              value={filters[f.key]}
              disabled={disabled}
              onChange={(e) => handleChange(f.key, e.target.value)}
              SelectProps={{ MenuProps: menuProps }}
              sx={selectSx}
              fullWidth
            >
              <MenuItem value="">
                <em>All</em>
              </MenuItem>
              {opts.map((opt) => (
                <MenuItem key={opt} value={opt}>{opt}</MenuItem>
              ))}
            </TextField>
          );
        })}
      </Box>
    </Box>
  );
};

export default CbFilterPanel;
