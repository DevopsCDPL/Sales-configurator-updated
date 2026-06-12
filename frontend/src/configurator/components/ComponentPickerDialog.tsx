/**
 * ComponentPickerDialog — shared catalog picker for both "swap" and "add" flows.
 *
 * swap mode  → locked to the swapped line's category; closes after pick.
 * add mode   → full category select; stays open for multiple additions.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { configuratorService, ConfiguratorComponent } from '../../services/configuratorService';
import { displayCase, compactSku } from '../lib/displayCase';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

/** Engine-managed categories excluded from add mode */
const EXCLUDED = new Set(['CIRCUIT BREAKER']);

const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.6 };
const headSx = { color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderBottom: '1px solid ' + C.border, py: 0.7, whiteSpace: 'nowrap' };

const usd = (n: number) =>
  Math.ceil(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.surface, color: C.text, fontSize: 12.5,
    '& fieldset': { borderColor: C.border },
    '&.Mui-focused fieldset': { borderColor: C.blue },
  },
  '& input': { color: C.text },
};

export interface ComponentPickerDialogProps {
  open: boolean;
  mode: 'swap' | 'add';
  /** swap mode: locked to this category */
  lockedCategory?: string | null;
  onClose: () => void;
  onPick: (c: ConfiguratorComponent, qty: number) => void | Promise<void>;
  /**
   * pickOnly mode — when true the dialog behaves like swap (closes immediately
   * after pick, no qty column) but calls onPick without performing any add/swap
   * side-effect itself. Action button label is "Select". Default: undefined ->
   * existing add/swap behaviour unchanged.
   */
  pickOnly?: boolean;
}

const ComponentPickerDialog: React.FC<ComponentPickerDialogProps> = ({
  open, mode, lockedCategory, onClose, onPick, pickOnly,
}) => {
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [category, setCategory] = useState<string>('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ConfiguratorComponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addedNote, setAddedNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ratingSort, setRatingSort] = useState<'price' | 'rating'>('price');

  // Load category counts (add mode only)
  useEffect(() => {
    if (mode !== 'add') return;
    configuratorService.componentCategoryCounts()
      .then((rows) => setCategories(
        (rows ?? []).filter((r) => !EXCLUDED.has((r.category || '').toUpperCase()) && r.count > 0)
      ))
      .catch(() => setCategories([]));
  }, [mode]);

  // Active category — locked in swap mode, or in add mode when a
  // lockedCategory is supplied (e.g. Section Editor adds CIRCUIT BREAKER).
  const addLocked = mode === 'add' && !!lockedCategory;
  const activeCategory = (mode === 'swap' || addLocked) ? (lockedCategory ?? '') : category;

  const search = useCallback(async (cat: string, qStr: string) => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (cat) params.category = cat;
      if (qStr.trim()) params.q = qStr.trim();
      let rows = await configuratorService.listComponents(params);
      // In add mode exclude engine-managed categories — UNLESS a lockedCategory
      // explicitly targets one (Section Editor adds breakers into a section).
      if (mode === 'add' && !lockedCategory) {
        rows = rows.filter((r) => !EXCLUDED.has((r.category || '').toUpperCase()));
      }
      // Swap mode: sort cheapest first; treat 0/null price as Infinity (sort last)
      if (mode === 'swap') {
        rows.sort((a, b) => {
          const pa = Number(a.price) || 0;
          const pb = Number(b.price) || 0;
          const sa = pa <= 0 ? Infinity : pa;
          const sb = pb <= 0 ? Infinity : pb;
          return sa - sb;
        });
      }
      setResults(rows);
      setRatingSort('price'); // reset to price on each new search
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  // Auto-search on open and when category changes
  useEffect(() => {
    if (!open) return;
    search(activeCategory, q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeCategory]);

  // Reset state when dialog opens
  useEffect(() => {
    if (!open) return;
    setQ('');
    setResults([]);
    setQtyMap({});
    setAddedNote(null);
    if (mode === 'add') setCategory(lockedCategory ?? '');
  }, [open, mode, lockedCategory]);

  const handlePick = async (c: ConfiguratorComponent) => {
    const qty = Math.max(1, Number(qtyMap[c.id]) || 1);
    setBusyId(c.id);
    try {
      await onPick(c, qty);
      if (pickOnly) {
        // pickOnly: caller takes over; dialog stays open until caller closes it
      } else if (mode === 'add') {
        // Stay open; show transient confirmation note
        if (noteTimer.current) clearTimeout(noteTimer.current);
        setAddedNote(displayCase(c.name));
        noteTimer.current = setTimeout(() => setAddedNote(null), 3000);
      }
      // swap mode: caller closes dialog via onPick handler
    } finally {
      setBusyId(null);
    }
  };

  const handleCategoryChange = (val: string) => {
    setCategory(val);
    // search will fire via useEffect on activeCategory
  };

  const title = mode === 'swap'
    ? `Swap — pick a replacement (${displayCase(lockedCategory ?? '')})`
    : 'Add components from the catalog';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { bgcolor: C.surface, border: '1px solid ' + C.border, backgroundImage: 'none' } }}
    >
      <DialogTitle sx={{ color: C.text, fontSize: 14, fontWeight: 700, pb: 1 }}>
        {title}
        {addedNote && (
          <Typography component="span" sx={{ ml: 2, color: C.green, fontSize: 12, fontWeight: 500 }}>
            Added ✓ — {addedNote}
          </Typography>
        )}
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        {/* Controls row */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, pt: 1 }} flexWrap="wrap" useFlexGap>
          <Select
            size="small"
            value={activeCategory}
            displayEmpty
            disabled={mode === 'swap' || addLocked}
            onChange={(e) => handleCategoryChange(e.target.value)}
            sx={{ minWidth: 200, bgcolor: C.bg, color: C.text, fontSize: 12.5, '& fieldset': { borderColor: C.border } }}
          >
            {!addLocked && <MenuItem value="" sx={{ fontSize: 12.5 }}>All categories</MenuItem>}
            {addLocked
              ? <MenuItem value={lockedCategory!} sx={{ fontSize: 12.5 }}>{displayCase(lockedCategory!)}</MenuItem>
              : mode === 'add'
              ? categories.map((c) => (
                  <MenuItem key={c.category} value={c.category} sx={{ fontSize: 12.5 }}>
                    {displayCase(c.category)} ({c.count})
                  </MenuItem>
                ))
              : lockedCategory
                ? <MenuItem value={lockedCategory} sx={{ fontSize: 12.5 }}>{displayCase(lockedCategory)}</MenuItem>
                : null
            }
          </Select>
          <TextField
            size="small"
            placeholder="Search part #, name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(activeCategory, q); }}
            sx={{ ...inputSx, flex: 1, minWidth: 180 }}
          />
          <Button
            startIcon={<SearchRoundedIcon sx={{ fontSize: 16 }} />}
            disabled={loading}
            onClick={() => search(activeCategory, q)}
            sx={{ bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontWeight: 600, fontSize: 12.5, '&:hover': { bgcolor: '#33d4ff' } }}
          >
            Search
          </Button>
        </Stack>

        {/* Sort toggle (add mode, when any result has a rating) */}
        {mode === 'add' && !pickOnly && results.some((r) => (r as any).specifications?.qualityRating != null) && (
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
            <Typography sx={{ color: C.sub, fontSize: 11 }}>Sort:</Typography>
            {(['price', 'rating'] as const).map((s) => (
              <Chip
                key={s}
                label={s === 'price' ? 'Price' : 'Rating'}
                size="small"
                onClick={() => setRatingSort(s)}
                sx={{
                  height: 20, fontSize: 11,
                  bgcolor: ratingSort === s ? 'rgba(0,200,255,0.15)' : 'transparent',
                  color: ratingSort === s ? C.blue : C.sub,
                  border: '1px solid ' + (ratingSort === s ? C.blue : C.border),
                  cursor: 'pointer',
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            ))}
          </Stack>
        )}
        {/* Results */}
        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={22} sx={{ color: C.blue }} />
          </Stack>
        ) : (() => {
          const displayResults = mode === 'add' && !pickOnly && ratingSort === 'rating'
            ? [...results].sort((a, b) => {
                const ra = (a as any).specifications?.qualityRating ?? 0;
                const rb = (b as any).specifications?.qualityRating ?? 0;
                if (rb !== ra) return rb - ra;
                const pa = Number(a.price) || Infinity;
                const pb = Number(b.price) || Infinity;
                return pa - pb;
              })
            : results;
          return !displayResults.length ? (
          <Box sx={{ bgcolor: C.bg, border: '1px dashed ' + C.border, borderRadius: '10px', p: 3, textAlign: 'center' }}>
            <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
              No catalog items match — adjust search or add it in Database → Components.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'auto', maxHeight: 440 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...headSx, bgcolor: C.bg }}>Part #</TableCell>
                  <TableCell sx={{ ...headSx, bgcolor: C.bg }}>Name</TableCell>
                  <TableCell sx={{ ...headSx, bgcolor: C.bg }} align="right">Price</TableCell>
                  <TableCell sx={{ ...headSx, bgcolor: C.bg, width: 56 }} align="center">Rating</TableCell>
                  {mode === 'add' && !pickOnly && (
                    <TableCell sx={{ ...headSx, bgcolor: C.bg, width: 72 }}>Qty</TableCell>
                  )}
                  <TableCell sx={{ ...headSx, bgcolor: C.bg, width: 90 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {displayResults.map((r) => {
                  const price = Number(r.price ?? (r as any).mat_cost ?? (r as any).material_cost) || 0;
                  return (
                    <TableRow key={r.id} hover>
                      <TableCell sx={cellSx}>
                        <Tooltip title={r.part_number ?? ''}>
                          <span>{compactSku(r.part_number) || '—'}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={cellSx}>{displayCase(r.name)}</TableCell>
                      <TableCell sx={cellSx} align="right">
                        {price > 0 ? (
                          usd(price)
                        ) : (
                          <Typography component="span" sx={{ color: C.red, fontSize: 12, fontWeight: 800 }}>
                            RFQ $
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={cellSx} align="center">
                        {(r as any).specifications?.qualityRating != null ? (
                          <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.2}>
                            <StarRoundedIcon sx={{ fontSize: 10, color: C.amber }} />
                            <Typography sx={{ fontSize: 10.5, color: C.amber }}>{(r as any).specifications.qualityRating}</Typography>
                          </Stack>
                        ) : null}
                      </TableCell>
                      {mode === 'add' && !pickOnly && (
                        <TableCell sx={cellSx}>
                          <TextField
                            size="small"
                            value={qtyMap[r.id] ?? '1'}
                            onChange={(e) => setQtyMap((m) => ({ ...m, [r.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                            inputProps={{ style: { textAlign: 'center', padding: '3px 6px', fontSize: 12 } }}
                            sx={{ width: 56, '& .MuiOutlinedInput-root': { bgcolor: C.surface, color: C.text, '& fieldset': { borderColor: C.border } } }}
                          />
                        </TableCell>
                      )}
                      <TableCell sx={cellSx} align="right">
                        {pickOnly ? (
                          <Button
                            size="small"
                            disabled={busyId === r.id}
                            onClick={() => handlePick(r)}
                            sx={{ color: C.blue, textTransform: 'none', fontSize: 11, border: '1px solid ' + C.border }}
                          >
                            Select
                          </Button>
                        ) : mode === 'swap' ? (
                          <Button
                            size="small"
                            disabled={busyId === r.id}
                            onClick={() => handlePick(r)}
                            sx={{ color: C.green, textTransform: 'none', fontSize: 11, border: '1px solid ' + C.border }}
                          >
                            Use this
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            variant="contained"
                            disabled={busyId === r.id}
                            onClick={() => handlePick(r)}
                            sx={{ bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontSize: 11.5, fontWeight: 600, '&:hover': { bgcolor: '#33d4ff' } }}
                          >
                            + Add
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
          );
        })()}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} sx={{ color: C.sub, textTransform: 'none' }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ComponentPickerDialog;
