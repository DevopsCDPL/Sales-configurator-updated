/**
 * BomViewer — Phase D on screen (Bill of Materials slice)
 *
 * Compiled LIVE by GET /switchboards/:id/bom from persisted sections +
 * lines + current Engineering Standards. Nothing here is hand-entered:
 * GEN-* rows and the parametric copper estimate recompute on every
 * design change. eBOM (by section) and mBOM (by part, where-used).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Alert, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody, Tooltip,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import configuratorV2Service, { BomResponse, BomRow } from '../../services/configuratorV2Service';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
  title: '#F0F6FF',
};

const usd = (n: number) =>
  Math.ceil(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const color = status === 'FIRM' ? C.green : status === 'ESTIMATED' ? C.amber : C.red;
  const tip = status === 'FIRM' ? 'Firm price' : status === 'ESTIMATED' ? 'Estimated price' : 'No firm price — RFQ required';
  return (
    <Tooltip title={tip} arrow>
      <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color, display: 'inline-block' }} />
    </Tooltip>
  );
};

const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.7 };
const headSx = { color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderBottom: '1px solid ' + C.border, py: 0.7 };

// Build-order ranking for category grouping; breakers FIRST, then the rest in
// build order. Unknown categories fall after these (alphabetical).
const CAT_ORDER = [
  'CIRCUIT BREAKER', 'ENCLOSURE', 'BUSSING', 'GLASTIC', 'LUGS', 'TERMINALS',
  'CONTROLS', 'WIRE CABLE', 'CONDUIT', 'HARDWARE', 'SAFETY',
];
const catRank = (cat: string) => {
  const i = CAT_ORDER.indexOf((cat || '').toUpperCase());
  return i === -1 ? CAT_ORDER.length : i;
};

type ConsRow = {
  cat: string;
  part_number: string | null;
  description: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  price_status: string;
  source: string;
  generator_id: string | null;
  copper_weight_lbs: number | null;
};

/**
 * Description for a BOM row. For CIRCUIT BREAKER rows the description is
 * composed as `manufacturer deviceClass — ratedA / interruptingKA / poles`
 * from the line meta (carried through bomEngineV2). Missing pieces are
 * omitted gracefully; if nothing composable, fall back to the raw description.
 * Non-breaker rows keep their existing description.
 */
const descOf = (r: BomRow): string | null => {
  if ((r.category || '').toUpperCase() !== 'CIRCUIT BREAKER') return r.description;
  const m: any = r.meta ?? {};
  const mfr = m.manufacturer ?? m?.specifications?.manufacturer ?? null;
  const cls = m.deviceClass ?? null;
  const rated = m.ratedA ? `${m.ratedA}A` : null;
  const ka = m.interruptingKA ? `${m.interruptingKA}kA` : null;
  const poles = m.poles ? `${m.poles}P` : null;
  const lead = [mfr, cls].filter(Boolean).join(' ');
  const tail = [rated, ka, poles].filter(Boolean).join(' / ');
  const composed = [lead, tail].filter(Boolean).join(' — ');
  return composed || r.description;
};

/**
 * Consolidate the full flat board rows into one category-grouped list.
 * Identical lines (same category + part_number + description + generator_id)
 * are merged: quantity + copper_weight_lbs summed, ext recomputed from qty×unit_cost.
 * Generator (GEN-*) rows stay distinct via their generator_id/part key.
 */
const consolidate = (rows: BomRow[]): ConsRow[] => {
  const map = new Map<string, ConsRow>();
  rows.forEach((r) => {
    const cat = (r.category || 'OTHER').toUpperCase();
    const key = cat + '|' + (r.part_number ?? '') + '|' + (r.description ?? '') + '|' + (r.generator_id ?? '');
    const existing = map.get(key);
    if (existing) {
      existing.quantity += r.quantity;
      if (r.copper_weight_lbs != null) existing.copper_weight_lbs = (existing.copper_weight_lbs ?? 0) + r.copper_weight_lbs;
    } else {
      map.set(key, {
        cat,
        part_number: r.part_number,
        description: descOf(r),
        quantity: r.quantity,
        unit: r.unit,
        unit_cost: r.unit_cost,
        price_status: r.price_status,
        source: r.source,
        generator_id: r.generator_id,
        copper_weight_lbs: r.copper_weight_lbs,
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    const rk = catRank(a.cat) - catRank(b.cat);
    if (rk !== 0) return rk;
    if (a.cat !== b.cat) return a.cat.localeCompare(b.cat);
    return String(a.description ?? '').localeCompare(String(b.description ?? ''));
  });
};

/** Compact stat row for the sticky right sidebar (label left, value right). */
const StatLine: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent }) => (
  <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ py: 0.6, borderBottom: '1px solid ' + C.border }}>
    <Typography sx={{ color: C.sub, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Typography>
    <Typography sx={{ color: accent ?? C.text, fontSize: 15, fontWeight: 700 }}>{value}</Typography>
  </Stack>
);

export interface BomViewerProps { switchboardId: string }

const BomViewer: React.FC<BomViewerProps> = ({ switchboardId }) => {
  const [bom, setBom] = useState<BomResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBom(await configuratorV2Service.getBom(switchboardId));
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to compile BOM');
    } finally {
      setLoading(false);
    }
  }, [switchboardId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 6 }}>
        <CircularProgress size={24} sx={{ color: C.blue }} />
        <Typography sx={{ color: C.sub, fontSize: 12, mt: 1.5 }}>Compiling bill of materials…</Typography>
      </Stack>
    );
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ m: 3, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}>
        {error}
      </Alert>
    );
  }
  if (!bom) return null;

  const { totals, copper } = bom;
  const laborTotal = Number(totals.laborHours?.total ?? 0);

  // Single consolidated, category-grouped view of the FULL board BOM
  // (every line incl. copper / bus / glastic generator rows).
  const consRows = consolidate(bom.rows);
  // Compute per-category rowSpan metadata + continuous S.No for merged Category cells.
  const groupCounts = new Map<string, number>();
  consRows.forEach((r) => groupCounts.set(r.cat, (groupCounts.get(r.cat) ?? 0) + 1));
  const seenCat = new Set<string>();
  const consFlat = consRows.map((r, i) => {
    const isFirstInGroup = !seenCat.has(r.cat);
    if (isFirstInGroup) seenCat.add(r.cat);
    return { r, isFirstInGroup, rowsInGroup: groupCounts.get(r.cat) ?? 1, sno: i + 1 };
  });

  return (
    <Box sx={{ px: 3, pb: 4 }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        {/* LEFT — consolidated board BOM table */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ color: C.title, fontSize: 16, fontWeight: 800, mt: 2.5, mb: 1.5 }}>
            Bill of materials — {bom.board?.name ?? 'Switchboard'}
          </Typography>
          <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'hidden' }}>
            <Box sx={{ maxHeight: '74vh', overflow: 'auto' }}>
              <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...headSx, width: 40, whiteSpace: 'nowrap', borderRight: '1px solid #1E2235', bgcolor: '#0B0B0D' }} align="center">S.No</TableCell>
                    <TableCell sx={{ ...headSx, width: 130, whiteSpace: 'nowrap', bgcolor: '#0B0B0D' }}>Category</TableCell>
                    <TableCell sx={{ ...headSx, whiteSpace: 'nowrap', bgcolor: '#0B0B0D' }}>Description</TableCell>
                    <TableCell sx={{ ...headSx, width: 100, whiteSpace: 'nowrap', bgcolor: '#0B0B0D' }} align="right">Unit price</TableCell>
                    <TableCell sx={{ ...headSx, width: 50, whiteSpace: 'nowrap', bgcolor: '#0B0B0D' }} align="right">Qty</TableCell>
                    <TableCell sx={{ ...headSx, width: 100, whiteSpace: 'nowrap', bgcolor: '#0B0B0D' }} align="right">Total price</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {consFlat.map(({ r, isFirstInGroup, rowsInGroup, sno: n }, idx) => {
                    const isGen = r.source === 'generator' || !!r.generator_id;
                    return (
                      <TableRow key={r.cat + '|' + idx}>
                        <TableCell align="center" sx={{ ...cellSx, width: 40, color: C.sub, fontSize: 11.5, textAlign: 'center', verticalAlign: 'middle', py: 0.5, borderRight: '1px solid #1E2235' }}>{n}</TableCell>
                        {isFirstInGroup && (
                          <TableCell rowSpan={rowsInGroup} sx={{ ...cellSx, width: 110, color: '#A9B6C9', fontWeight: 700, fontSize: 11, verticalAlign: 'middle', borderRight: '1px solid #1E2235' }}>
                            {r.cat}
                          </TableCell>
                        )}
                        <TableCell sx={{ ...cellSx, verticalAlign: 'middle', py: 0.5 }}>
                          <Tooltip title={String(r.description ?? '') + (r.copper_weight_lbs ? ' · ' + r.copper_weight_lbs + ' lb Cu' : '')} arrow>
                            <Box sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {r.description}
                              {r.copper_weight_lbs ? (
                                <Typography component="span" sx={{ color: C.sub, fontSize: 11 }}> · {r.copper_weight_lbs} lb Cu</Typography>
                              ) : null}
                              {isGen ? (
                                <Tooltip title={'Auto-computed from the design (' + (r.generator_id ?? 'GEN') + ') — recomputed, cannot drift'} arrow>
                                  <Chip label="GEN" size="small" sx={{ ml: 0.75, bgcolor: 'rgba(0,200,255,0.12)', color: '#60A5FA', fontSize: 8.5, height: 15, '& .MuiChip-label': { px: 0.6 } }} />
                                </Tooltip>
                              ) : null}
                            </Box>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ ...cellSx, verticalAlign: 'middle', py: 0.5, textAlign: 'right' }} align="right">
                          <Stack direction="row" spacing={0.6} alignItems="center" justifyContent="flex-end">
                            <StatusDot status={r.price_status} />
                            <Box component="span">{r.unit_cost ? usd(r.unit_cost) : '—'}</Box>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ ...cellSx, verticalAlign: 'middle', py: 0.5 }} align="right">{r.quantity}</TableCell>
                        <TableCell sx={{ ...cellSx, verticalAlign: 'middle', py: 0.5, textAlign: 'right' }} align="right">{r.unit_cost ? usd(r.unit_cost * r.quantity) : '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          </Box>
        </Box>

        {/* RIGHT — sticky sidebar: stat figures + copper breakdown + warning + recompile */}
        <Box sx={{ width: 300, flexShrink: 0, position: 'sticky', top: 8 }}>
          <Stack spacing={1.5}>
            {/* Stat figures */}
            <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', px: 2, py: 1.25 }}>
              <StatLine label="Material total" value={usd(totals.materialTotal)} accent={C.green} />
              <StatLine label="Copper (est.)" value={totals.copperEstLbs + ' lb'} />
              <StatLine label="Copper cost" value={usd(copper.costUsd)} />
              <StatLine label="BOM rows" value={String(consRows.length)} />
              <StatLine label="Awaiting price" value={String(totals.nonFirmCount)} accent={totals.nonFirmCount > 0 ? C.amber : C.green} />
              <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ py: 0.6 }}>
                <Typography sx={{ color: C.sub, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>Labour hours</Typography>
                <Typography sx={{ color: laborTotal === 0 ? C.amber : C.text, fontSize: 15, fontWeight: 700 }}>{laborTotal.toFixed(1) + ' h'}</Typography>
              </Stack>
            </Box>

            {/* Copper estimate breakdown */}
            <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', p: 2 }}>
              <Typography sx={{ color: '#CBD5E1', fontSize: 12, fontWeight: 600, mb: 1 }}>
                Copper estimate — pass 1 · {usd(bom.copperPricePerLb)}/lb
              </Typography>
              <Stack spacing={0.5}>
                {[
                  ['Main bus', copper.mainBusLbs], ['Neutral', copper.neutralLbs], ['Ground', copper.groundLbs],
                  ['Risers', copper.riserLbs], ['Device stubs', copper.stubLbs], ['Raw', copper.rawLbs],
                  ['x fab factor', copper.estimatedLbs],
                ].map(([k, v]) => (
                  <Stack key={String(k)} direction="row" justifyContent="space-between">
                    <Typography sx={{ color: C.sub, fontSize: 11 }}>{k}</Typography>
                    <Typography sx={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{v} lb</Typography>
                  </Stack>
                ))}
                <Stack direction="row" justifyContent="space-between">
                  <Typography sx={{ color: C.sub, fontSize: 11 }}>Glastic supports</Typography>
                  <Typography sx={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{copper.supports}</Typography>
                </Stack>
              </Stack>
              <Typography sx={{ color: C.sub, fontSize: 10, mt: 1 }}>SolidWorks trues up at pass 2</Typography>
              {copper.notes.map((n) => (
                <Typography key={n} sx={{ color: C.amber, fontSize: 11, mt: 1 }}>⚠ {n}</Typography>
              ))}
            </Box>

            {laborTotal === 0 && (
              <Alert severity="warning" sx={{ bgcolor: 'rgba(217,119,6,0.08)', color: '#FCD34D', border: '1px solid ' + C.border, fontSize: 11.5 }}>
                Labour hours are 0 — part-level hour buckets are not loaded yet. A quotation cannot be issued at zero labour (hard block).
              </Alert>
            )}

            <Button
              size="small"
              startIcon={<RefreshRoundedIcon sx={{ fontSize: 15 }} />}
              onClick={load}
              sx={{ color: C.sub, textTransform: 'none', fontSize: 12, border: '1px solid ' + C.border }}
            >
              Recompile
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
};

export default BomViewer;
