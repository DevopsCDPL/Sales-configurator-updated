/**
 * ComponentPickerDialog — shared catalog picker for both "swap" and "add" flows.
 *
 * swap mode  -> locked to the swapped line's category; closes after pick.
 * add mode   -> full category select; stays open for multiple additions.
 *
 * When lockedCategory === 'CIRCUIT BREAKER' (or the active category is
 * CIRCUIT BREAKER), two extra layers are active:
 *   1. Suitability filter — toggle "Suitable only" (default ON) excludes
 *      definite misfits: kA < sccrKA when both known; height > remaining
 *      when both known. Parts with missing data are kept.
 *   2. CbFilterPanel — cascading spec filters above the results table.
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
import PriceSourceDot from './PriceSourceDot';
import CbFilterPanel from './CbFilterPanel';

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
  /**
   * Context from the parent board, used for CIRCUIT BREAKER suitability filter.
   * sccrKA: board short-circuit rating in kA (null = unknown, skip kA filter).
   * remainingHeightIn: remaining usable height in the target section (null = unknown).
   */
  boardContext?: { sccrKA?: number | null; remainingHeightIn?: number | null };
}

const ComponentPickerDialog: React.FC<ComponentPickerDialogProps> = ({
  open, mode, lockedCategory, onClose, onPick, pickOnly, boardContext,
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
  // CB suitability toggle (default ON)
  const [suitableOnly, setSuitableOnly] = useState(true);
  // CB filter panel output
  const [cbFiltered, setCbFiltered] = useState<ConfiguratorComponent[]>([]);

  // Load category counts (add mode only)
  useEffect(() => {
    if (mode !== 'add') return;
    configuratorService.componentCategoryCounts()
      .then((rows) => setCategories(
        (rows ?? []).filter((r) => !EXCLUDED.has((r.category || '').toUpperCase()) && r.count > 0)
      ))
      .catch(() => setCategories([]));
  }, [mode]);

  // Active category
  const addLocked = mode === 'add' && !!lockedCategory;
  const activeCategory = (mode === 'swap' || addLocked) ? (lockedCategory ?? '') : category;

  const isCbMode = activeCategory.toUpperCase() === 'CIRCUIT BREAKER';

  const search = useCallback(async (cat: string, qStr: string) => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (cat) params.category = cat;
      if (qStr.trim()) params.q = qStr.trim();
      let rows = await configuratorService.listComponents(params);
      if (mode === 'add' && !lockedCategory) {
        rows = rows.filter((r) => !EXCLUDED.has((r.category || '').toUpperCase()));
      }
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
      setRatingSort('price');
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [mode, lockedCategory]);

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
    setSuitableOnly(true);
    if (mode === 'add') setCategory(lockedCategory ?? '');
  }, [open, mode, lockedCategory]);

  /** Suitability filter: exclude only definite misfits when in CB mode. */
  const suitableRows = React.useMemo<ConfiguratorComponent[]>(() => {
    if (!isCbMode || !suitableOnly) return results;
    const sccrKA = boardContext?.sccrKA ?? null;
    const remaining = boardContext?.remainingHeightIn ?? null;
    return results.filter((r) => {
      const sp: any = (r as any).specifications ?? {};
      // kA check: exclude only when BOTH values are known and item fails
      const itemKA = sp.interruptingKA != null ? Number(sp.interruptingKA) : null;
      if (sccrKA != null && itemKA != null && itemKA < sccrKA) return false;
      // Height check: exclude only when BOTH heights are known and item fails
      const itemH = (r as any).dims_h_in != null
        ? Number((r as any).dims_h_in)
        : sp.height_in != null ? Number(sp.height_in) : null;
      if (remaining != null && itemH != null && itemH > remaining) return false;
      return true;
    });
  }, [results, isCbMode, suitableOnly, boardContext]);

  const excludedCount = results.length - suitableRows.length;

  const handlePick = async (c: ConfiguratorComponent) => {
    const qty = Math.max(1, Number(qtyMap[c.id]) || 1);
    setBusyId(c.id);
    try {
      await onPick(c, qty);
      if (pickOnly) {
        // pickOnly: caller takes over
      } else if (mode === 'add') {
        if (noteTimer.current) clearTimeout(noteTimer.current);
        setAddedNote(displayCase(c.name));
        noteTimer.current = setTimeout(() => setAddedNote(null), 3000);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleCategoryChange = (val: string) => {
    setCategory(val);
  };

  const title = mode === 'swap'
    ? 'Swap — pick a replacement (' + displayCase(lockedCategory ?? '') + ')'
    : 'Add components from the catalog';

  // Use lg maxWidth only when showing CB filters (6-col grid)
  const dialogMaxWidth: 'lg' | 'md' = isCbMode ? 'lg' : 'md';

  // Source rows for the CB filter panel (pre-suitability-filtered)
  const cbPanelSource: ConfiguratorComponent[] = isCbMode
    ? (suitableOnly ? suitableRows : results)
    : [];

  // Final display rows: CB mode uses cbFiltered (from CbFilterPanel), else results/sorted
  const displayRows: ConfiguratorComponent[] = (() => {
    if (isCbMode) return cbFiltered;
    if (mode === 'add' && !pickOnly && ratingSort === 'rating') {
      return [...results].sort((a, b) => {
        const ra = (a as any).specifications?.qualityRating ?? 0;
        const rb = (b as any).specifications?.qualityRating ?? 0;
        if (rb !== ra) return rb - ra;
        const pa = Number(a.price) || Infinity;
        const pb = Number(b.price) || Infinity;
        return pa - pb;
      });
    }
    return results;
  })();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={dialogMaxWidth}
      fullWidth
      PaperProps={{ sx: { bgcolor: C.surface, border: '1px solid ' + C.border, backgroundImage: 'none' } }}
    >
      <DialogTitle sx={{ color: C.text, fontSize: 14, fontWeight: 700, pb: 1 }}>
        {title}
        {addedNote && (
          <Typography component="span" sx={{ ml: 2, color: C.green, fontSize: 12, fontWeight: 500 }}>
            Added — {addedNote}
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
            placeholder="Search part #, name..."
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

        {/* CB suitability toggle */}
        {isCbMode && !loading && results.length > 0 && (
          <Box sx={{ mb: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
              <Typography sx={{ color: C.sub, fontSize: 11 }}>Suitability:</Typography>
              <Chip
                label="Suitable only"
                size="small"
                onClick={() => setSuitableOnly(true)}
                sx={{
                  height: 20, fontSize: 11,
                  bgcolor: suitableOnly ? 'rgba(0,200,255,0.15)' : 'transparent',
                  color: suitableOnly ? C.blue : C.sub,
                  border: '1px solid ' + (suitableOnly ? C.blue : C.border),
                  cursor: 'pointer',
                  '& .MuiChip-label': { px: 1 },
                }}
              />
              <Chip
                label={excludedCount > 0 ? 'All (+' + excludedCount + ' hidden)' : 'All'}
                size="small"
                onClick={() => setSuitableOnly(false)}
                sx={{
                  height: 20, fontSize: 11,
                  bgcolor: !suitableOnly ? 'rgba(0,200,255,0.15)' : 'transparent',
                  color: !suitableOnly ? C.blue : C.sub,
                  border: '1px solid ' + (!suitableOnly ? C.blue : C.border),
                  cursor: 'pointer',
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            </Stack>
            <Typography sx={{ color: C.sub, fontSize: 10.5, mt: 0.4 }}>
              Items without kA/size data are kept — verify before adding.
            </Typography>
          </Box>
        )}

        {/* Sort toggle (non-CB add mode only) */}
        {mode === 'add' && !pickOnly && !isCbMode && results.some((r) => (r as any).specifications?.qualityRating != null) && (
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

        {/* CB filter panel — above the results table, in CB mode */}
        {isCbMode && !loading && (
          <CbFilterPanel
            items={cbPanelSource}
            onFiltered={setCbFiltered}
          />
        )}

        {/* Results */}
        {loading ? (
          <Stack alignItems="center" sx={{ py: 4 }}>
            <CircularProgress size={22} sx={{ color: C.blue }} />
          </Stack>
        ) : !displayRows.length ? (
          <Box sx={{ bgcolor: C.bg, border: '1px dashed ' + C.border, borderRadius: '10px', p: 3, textAlign: 'center' }}>
            <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
              No catalog items match — adjust search or add it in Database &rarr; Components.
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
                {displayRows.map((r) => {
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
                        <PriceSourceDot source={(r as any).specifications?.priceSource} />
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
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} sx={{ color: C.sub, textTransform: 'none' }}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ComponentPickerDialog;
