/**
 * CategoryComponentPicker
 * ════════════════════════════════════════════════════════════════════════
 * Generic substep panel used by every catalogue-driven step (enclosure,
 * bussing, glastic, …).
 *
 * Behaviour:
 *  • Loads components by category via configuratorService.listComponents
 *    (uses ?category= query form; the path-style /components/category/:c
 *    alias is also available but the query form is more flexible).
 *  • Renders responsive MUI cards with part-number, name, unit cost.
 *  • Quantity + add/remove writes through to ConfiguratorState.stepLines.
 *  • Search box filters in-memory (client-side) once the page is loaded.
 *
 * No mock data — empty array on API failure (notification fired).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import { useNotification } from '../../contexts/NotificationContext';
import type {
  ConfiguratorComponent,
  ConfiguratorStepKey,
} from '../../services/configuratorService';
import { useConfigurator } from '../state/ConfiguratorProvider';
import { getCategories } from '../../utils/componentCatalogCache';

const ACCENT = '#2563ff';
const BORDER = 'var(--border, #e4e8ee)';

interface Props {
  stepKey: ConfiguratorStepKey;
  categories: string[];
  /** Optional title above the picker (otherwise inherits from step header). */
  emptyLabel?: string;
}

const toFiniteNumber = (v: unknown): number | null => {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : null;
  }
  if (typeof v === 'string') {
    const cleaned = v.replace(/[$,\s]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (v instanceof Number) {
    const parsed = Number(v.valueOf());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const pickNumber = (...vals: Array<unknown>): number | null => {
  for (const v of vals) {
    const n = toFiniteNumber(v);
    if (n != null) return n;
  }
  return null;
};

const fmtMoney = (n: number | null | undefined): string => 
    n == null ? '-' : `$${Number(n).toFixed(2)}`;

const cleanText = (v: string | null | undefined): string => (v?.trim() ? v.trim() : '-');

const CategoryComponentPicker: React.FC<Props> = ({ stepKey, categories, emptyLabel }) => {
  const notify = useNotification();
  const { state, dispatch } = useConfigurator();
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<ConfiguratorComponent[]>([]);
  const [search, setSearch] = useState('');

  const selectedById = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of state.stepLines[stepKey] ?? []) map.set(line.componentId, line.quantity);
    return map;
  }, [state.stepLines, stepKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // Phase 6: TTL-cached, in-flight-coalesced catalog fetch.
        const merged = await getCategories(categories);
        if (cancelled) return;
        setComponents(merged);
      } catch (err: any) {
        if (!cancelled) {
          notify.showError(err?.response?.data?.message || 'Failed to load components');
          setComponents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categories.join(','), notify]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return components;
    return components.filter((c) => {
      const hay = `${c.part_number ?? ''} ${c.name ?? ''} ${c.category ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [components, search]);

  const handleAdd = useCallback(
    (c: ConfiguratorComponent) => {
      const existing = selectedById.get(c.id);
      dispatch({
        type: 'upsertStepLine',
        stepKey,
        payload: {
          componentId: c.id,
          partNumber: c.part_number ?? undefined,
          name: c.name ?? undefined,
          unitPrice: typeof c.unit_cost === 'number' ? c.unit_cost : undefined,
          quantity: (existing ?? 0) + 1,
        },
      });
    },
    [dispatch, selectedById, stepKey]
  );

  const handleDec = useCallback(
    (c: ConfiguratorComponent) => {
      const current = selectedById.get(c.id) ?? 0;
      if (current <= 1) {
        dispatch({ type: 'removeStepLine', stepKey, componentId: c.id });
        return;
      }
      dispatch({
        type: 'upsertStepLine',
        stepKey,
        payload: {
          componentId: c.id,
          partNumber: c.part_number ?? undefined,
          name: c.name ?? undefined,
          unitPrice: typeof c.unit_cost === 'number' ? c.unit_cost : undefined,
          quantity: current - 1,
        },
      });
    },
    [dispatch, selectedById, stepKey]
  );

  const handleRemove = useCallback(
    (c: ConfiguratorComponent) => {
      dispatch({ type: 'removeStepLine', stepKey, componentId: c.id });
    },
    [dispatch, stepKey]
  );

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ mb: 2, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <TextField
          placeholder="Search part number, name…"
          size="small"
          fullWidth
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'var(--text-secondary, #d9e4fb)' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            maxWidth: { sm: 420 },
            '& .MuiInputBase-input': { fontSize: '0.95rem', color: 'var(--text-primary, #f8fbff)' },
          }}
        />
        <Typography sx={{ fontSize: '0.9rem', color: 'var(--text-secondary, #d9e4fb)' }}>
          {loading
            ? 'Loading…'
            : `${filtered.length} component${filtered.length === 1 ? '' : 's'} · ${
                state.stepLines[stepKey]?.length ?? 0
              } selected`}
        </Typography>
      </Stack>

      {loading ? (
        <Stack spacing={1}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1.5 }} />
          ))}
        </Stack>
      ) : filtered.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.95rem', color: 'var(--text-secondary, #d9e4fb)' }}>
            {emptyLabel ?? 'No components in this category.'}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
            gap: 1.25,
          }}
        >
          {filtered.map((c) => {
            const qty = selectedById.get(c.id) ?? 0;
            const active = qty > 0;

            const specs = (c.specifications ?? {}) as Record<string, unknown>;

            const displayPrice = pickNumber(
              c.price,
              c.unit_cost,
              c.material_cost,
              c.mat_cost,
              specs.price,
              specs.unit_cost,
              specs.material_cost,
              specs.mat_cost
            );
            const materialCost = pickNumber(
              c.material_cost,
              c.mat_cost,
              c.unit_cost,
              c.price,
              specs.material_cost,
              specs.mat_cost,
              specs.unit_cost,
              specs.price
            );
            const title = cleanText(c.name ?? c.part_number ?? 'Unnamed');
            const description = cleanText(c.description ?? c.name ?? c.part_number);

            return (
              <Card
                key={c.id}
                variant="outlined"
                sx={{
                  borderColor: active ? ACCENT : BORDER,
                  borderRadius: '12px',
                  transition: 'all 0.15s ease',
                  bgcolor: active ? alpha(ACCENT, 0.06) : 'transparent',
                  '&:hover': { borderColor: ACCENT },
                }}
              >
                <CardContent sx={{ p: 1.6, '&:last-child': { pb: 1.6 } }}>
                  <Stack spacing={0.9}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Box
                        sx={{
                          px: 1,
                          py: 0.2,
                          borderRadius: '999px',
                          border: '1px solid rgba(255,255,255,0.18)',
                          bgcolor: 'rgba(255,255,255,0.02)',
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: '0.8rem',
                            fontWeight: 800,
                            letterSpacing: '0.03em',
                            color: 'var(--text-primary, #f8fbff)',
                            textTransform: 'uppercase',
                            lineHeight: 1.2,
                          }}
                        >
                          {cleanText(c.category)}
                        </Typography>
                      </Box>

                      <Typography
                        sx={{
                          fontSize: '2rem',
                          fontWeight: 800,
                          color: '#00c8ff',
                          lineHeight: 1,
                        }}
                      >
                        {fmtMoney(displayPrice)}
                      </Typography>
                    </Stack>

                    <Typography
                      sx={{
                        fontSize: '1.05rem',
                        fontWeight: 700,
                        color: 'var(--text-primary, #f8fbff)',
                        lineHeight: 1.3,
                        wordBreak: 'break-word',
                      }}
                    >
                      {title}
                    </Typography>

                    <Stack spacing={0.35} sx={{ mt: 0.2 }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Typography sx={{ fontSize: '0.95rem', color: 'var(--text-secondary, #d9e4fb)' }}>
                          Description:
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '0.95rem',
                            color: 'var(--text-secondary, #d9e4fb)',
                            textAlign: 'right',
                            maxWidth: '68%',
                          }}
                        >
                          {description}
                        </Typography>
                      </Stack>

                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Typography sx={{ fontSize: '0.95rem', color: 'var(--text-secondary, #d9e4fb)' }}>
                          Material Cost:
                        </Typography>
                        <Typography sx={{ fontSize: '0.95rem', color: 'var(--text-primary, #f8fbff)' }}>
                          {fmtMoney(materialCost)}
                        </Typography>
                      </Stack>
                    </Stack>

                    <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mt: 0.8 }}>
                      <Typography sx={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-primary, #f8fbff)' }}>
                        Qty
                      </Typography>

                      <Tooltip title="Decrease">
                        <span>
                          <IconButton
                            size="small"
                            disabled={qty === 0}
                            onClick={() => handleDec(c)}
                            sx={{ border: `1px solid ${BORDER}`, borderRadius: '7px', p: 0.3 }}
                          >
                            <RemoveIcon sx={{ fontSize: 16, color: 'var(--text-primary, #f8fbff)' }} />
                          </IconButton>
                        </span>
                      </Tooltip>

                      <Typography
                        sx={{
                          minWidth: 30,
                          textAlign: 'center',
                          fontSize: '0.95rem',
                          fontWeight: 800,
                          color: qty > 0 ? '#00c8ff' : 'var(--text-secondary, #d9e4fb)',
                        }}
                      >
                        {qty}
                      </Typography>

                      <Tooltip title="Add">
                        <IconButton
                          size="small"
                          onClick={() => handleAdd(c)}
                          sx={{
                            border: `1px solid ${active ? '#00c8ff' : BORDER}`,
                            borderRadius: '7px',
                            p: 0.3,
                            color: active ? '#00c8ff' : 'var(--text-primary, #f8fbff)',
                          }}
                        >
                          <AddIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>

                      {qty > 0 && (
                        <Tooltip title="Remove">
                          <IconButton
                            size="small"
                            onClick={() => handleRemove(c)}
                            sx={{ ml: 'auto', color: 'var(--text-secondary, #d9e4fb)' }}
                          >
                            <DeleteIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>

                    <Button
                      onClick={() => handleAdd(c)}
                      startIcon={<AddIcon sx={{ fontSize: 18 }} />}
                      sx={{
                        mt: 0.4,
                        bgcolor: '#00c8ff',
                        color: '#03121a',
                        textTransform: 'none',
                        fontWeight: 700,
                        fontSize: '1.05rem',
                        borderRadius: '8px',
                        '&:hover': { bgcolor: '#33d4ff' },
                      }}
                    >
                      Add to Config
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default CategoryComponentPicker;
