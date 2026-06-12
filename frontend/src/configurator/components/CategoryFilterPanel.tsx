/**
 * CategoryFilterPanel — generic spec-driven cascading filter for catalog rows.
 *
 * Mirrors CbFilterPanel mechanics but is config-driven: callers supply a
 * list of FilterFieldDef descriptors that map a display label to either a
 * spec key (item.specifications[key]) or a top-level key ((item as any)[key]).
 *
 * Derivation fallback: when an item lacks a spec key AND the field carries a
 * deriveFromName regex, the component tries item.name.match(regex)?.[1] and
 * caches the result (uppercased/trimmed) so downstream rendering is O(1).
 *
 * Skip-render rule: a field with 0 or 1 options is hidden unless it currently
 * has an active selection (keeps the grid compact for sparse data).
 *
 * New categories need only a config entry in CATEGORY_FILTERS (CatalogManagerPanel) —
 * no code changes here.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { ConfiguratorComponent } from '../../services/configuratorService';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', title: '#F0F6FF',
};

/** Numeric-aware sort so "100 / 630 / 800" don't sort lexicographically. */
const sortOpts = (vals: string[]): string[] =>
  [...vals].sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    const aNum = !isNaN(na) && /^[\d.]/.test(a);
    const bNum = !isNaN(nb) && /^[\d.]/.test(b);
    if (aNum && bNum) return na - nb;
    return a.localeCompare(b);
  });

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FilterFieldDef {
  key: string;
  label: string;
  /** 'spec' → item.specifications[key]; 'top' → (item as any)[key] */
  source: 'spec' | 'top';
  /**
   * Optional fallback regex applied to item.name when the primary spec/top
   * key is missing or empty. Capture group 1 is used; result is uppercased
   * and trimmed.
   */
  deriveFromName?: RegExp;
}

interface Props {
  title: string;
  fields: FilterFieldDef[];
  items: ConfiguratorComponent[];
  onFiltered: (rows: ConfiguratorComponent[]) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Filters = Record<string, string>;

const makeEmpty = (fields: FilterFieldDef[]): Filters =>
  fields.reduce<Filters>((acc, f) => { acc[f.key] = ''; return acc; }, {});

// ─── Component ────────────────────────────────────────────────────────────────

const CategoryFilterPanel: React.FC<Props> = ({ title, fields, items, onFiltered }) => {
  const [filters, setFilters] = useState<Filters>(() => makeEmpty(fields));

  // Reset when source list identity or field config changes.
  useEffect(() => { setFilters(makeEmpty(fields)); }, [items, fields]);

  /**
   * Derived value cache: for each item id, pre-compute all field values
   * (spec lookup + name-regex fallback) once per items/fields identity change.
   */
  const derivedCache = useMemo<Map<string, Record<string, string>>>(() => {
    const cache = new Map<string, Record<string, string>>();
    for (const item of items) {
      const record: Record<string, string> = {};
      for (const f of fields) {
        let raw: unknown;
        if (f.source === 'spec') {
          raw = (item as any)?.specifications?.[f.key];
        } else {
          raw = (item as any)[f.key];
        }
        let v = raw == null || raw === '' ? '' : String(raw).trim();
        if (!v && f.deriveFromName) {
          const name = item.name ?? '';
          const m = name.match(f.deriveFromName);
          if (m?.[1]) v = m[1].toUpperCase().trim();
        }
        record[f.key] = v;
      }
      cache.set(item.id, record);
    }
    return cache;
  }, [items, fields]);

  /** Return the cached field value for an item. */
  const getVal = (item: ConfiguratorComponent, key: string): string =>
    derivedCache.get(item.id)?.[key] ?? '';

  /** Items passing every active filter. */
  const filtered = useMemo(
    () =>
      items.filter((item) =>
        fields.every((f) => !filters[f.key] || getVal(item, f.key) === filters[f.key])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, fields, filters, derivedCache]
  );

  // Propagate filtered set to parent.
  useEffect(() => { onFiltered(filtered); }, [filtered, onFiltered]);

  /**
   * Cascading option sets: for each field, options come from items that pass
   * ALL OTHER active filters (ignoring this field's own constraint), so
   * selecting one value narrows the others.
   */
  const optionSets = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const f of fields) {
      const others = fields.filter((o) => o.key !== f.key);
      const subset = items.filter((item) =>
        others.every((o) => !filters[o.key] || getVal(item, o.key) === filters[o.key])
      );
      const set = new Set<string>();
      for (const item of subset) {
        const v = getVal(item, f.key);
        if (v) set.add(v);
      }
      out[f.key] = sortOpts(Array.from(set));
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, fields, filters, derivedCache]);

  const handleChange = (key: string, value: string | null) => {
    const chosen = value ?? '';
    setFilters((prev) => {
      const next = { ...prev, [key]: chosen };
      // Clear any downstream selection that is no longer valid.
      for (const f of fields) {
        if (!next[f.key]) continue;
        const others = fields.filter((o) => o.key !== f.key);
        const subset = items.filter((item) =>
          others.every((o) => !next[o.key] || getVal(item, o.key) === next[o.key])
        );
        const stillValid = subset.some((item) => getVal(item, f.key) === next[f.key]);
        if (!stillValid) next[f.key] = '';
      }
      return next;
    });
  };

  const activeCount = fields.filter((f) => filters[f.key]).length;
  const empty = makeEmpty(fields);

  // Visible fields: skip those with ≤1 option unless they have an active selection.
  const visibleFields = fields.filter(
    (f) => (optionSets[f.key]?.length ?? 0) > 1 || !!filters[f.key]
  );

  const acSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: C.surface, color: C.text, fontSize: 11.5, py: 0,
      '& fieldset': { borderColor: C.border },
      '&:hover fieldset': { borderColor: C.border },
      '&.Mui-focused fieldset': { borderColor: C.blue },
    },
    '& .MuiInputLabel-root': { color: C.sub, fontSize: 11 },
    '& .MuiInputLabel-root.Mui-focused': { color: C.blue },
    '& .MuiAutocomplete-endAdornment .MuiSvgIcon-root': { color: C.sub, fontSize: 16 },
    '& input': { fontSize: 11.5, color: C.text },
  };

  return (
    <Box
      sx={{
        bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px',
        p: 1.5, mb: 1.5,
      }}
    >
      {/* Header row */}
      <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
        <Typography sx={{ color: C.title, fontSize: 12, fontWeight: 700, flex: 1 }}>
          {title}
          <Typography
            component="span"
            sx={{ color: C.sub, fontSize: 11, fontWeight: 400, ml: 1 }}
          >
            {filtered.length} of {items.length} match
          </Typography>
        </Typography>
        {activeCount > 0 && (
          <Button
            size="small"
            onClick={() => setFilters(empty)}
            sx={{ color: C.blue, textTransform: 'none', fontSize: 11.5, minWidth: 0, p: '2px 8px' }}
          >
            Clear ({activeCount})
          </Button>
        )}
      </Stack>

      {/* Filter grid */}
      {visibleFields.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 0.75,
          }}
        >
          {visibleFields.map((f) => {
            const opts = optionSets[f.key] ?? [];
            return (
              <Box key={f.key} sx={{ minWidth: 0 }}>
                <Autocomplete
                  size="small"
                  options={opts}
                  value={filters[f.key] || null}
                  onChange={(_e, v) => handleChange(f.key, v)}
                  clearOnEscape
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={f.label}
                      size="small"
                      sx={acSx}
                    />
                  )}
                  slotProps={{
                    paper: {
                      sx: {
                        bgcolor: C.surface,
                        color: C.text,
                        border: '1px solid ' + C.border,
                        '& .MuiAutocomplete-option': { fontSize: 12.5 },
                      },
                    },
                  }}
                  sx={{ width: '100%' }}
                />
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default CategoryFilterPanel;
