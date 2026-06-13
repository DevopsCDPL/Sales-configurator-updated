/**
 * DeviceListPanel — persisted devices of the saved design, with SWAP.
 *
 * The engine proposes the cheapest passing breaker, but the engineer
 * has the final word: swap any device for a close alternative (same or
 * higher rating, adequate interrupting kA, role-appropriate class) from
 * the DB catalog. Swaps update cost immediately, flag the line for
 * re-quote review and keep an audit trail (swapped_from).
 */
import React, { useMemo, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, Table, TableHead, TableRow, TableCell, TableBody, Alert, Tooltip,
} from '@mui/material';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import configuratorV2Service, { ComponentLineRow, CatalogCb } from '../../services/configuratorV2Service';
import DesignSummaryCard from '../components/DesignSummaryCard';
import PriceSourceDot from '../components/PriceSourceDot';
import { displayCase, compactSku } from '../lib/displayCase';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.6 };
const headSx = {
  color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
  borderBottom: '1px solid ' + C.border, py: 0.7,
  bgcolor: '#0B0B0D', /* solid so rows don't bleed through stickyHeader */
};

const usd = (n: number) =>
  Math.ceil(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export interface DeviceListPanelProps {
  lines: ComponentLineRow[];
  /** Board intake — used to derive load names for designs accepted
   *  before loadDescription was persisted (display fallback only). */
  intake?: { feeders?: { description?: string; loadType?: string; qty?: number }[] } | null;
  catalogCbs: CatalogCb[] | null;
  sccrKA: number;
  locked: boolean;
  onSwapped: () => Promise<void>;
}

const DeviceListPanel: React.FC<DeviceListPanelProps> = ({ lines, intake, catalogCbs, sccrKA, locked, onSwapped }) => {
  const [swapLine, setSwapLine] = useState<ComponentLineRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deviceLines = useMemo(
    () => lines.filter((l) => (l.category || '').toUpperCase() === 'CIRCUIT BREAKER'),
    [lines]
  );

  /** Legacy fallback: engine assigns F1..Fn over the schedule rows
   *  (qty-expanded, Space rows skipped) in order — reproduce that. */
  const loadNameFor = useMemo(() => {
    const expanded: string[] = [];
    for (const f of intake?.feeders ?? []) {
      if (String(f.loadType) === 'Space') continue;
      const q = Math.max(1, Number(f.qty) || 1);
      for (let i = 0; i < q; i++) expanded.push(f.description || String(f.loadType || ''));
    }
    return (l: ComponentLineRow): string => {
      if (l.meta?.loadDescription) return String(l.meta.loadDescription);
      const role = String(l.meta?.role ?? '').toUpperCase();
      if (role === 'MAIN') return 'Incoming';
      if (role === 'TIE') return 'Bus tie';
      const m = String(l.meta?.designation ?? '').match(/^F(\d+)$/);
      if (m) return expanded[Number(m[1]) - 1] ?? '—';
      return '—';
    };
  }, [intake, deviceLines.length]);

  /** Section-first ordering for the "Section Review" table:
   *  group by sectionIndex (ascending); within a section, MAIN/M first,
   *  then feeders F1,F2… numeric, then anything else by designation. */
  const flatRows = useMemo(() => {
    const desigRank = (l: ComponentLineRow): [number, number, string] => {
      const d = String(l.meta?.designation ?? '');
      const role = String(l.meta?.role ?? '').toUpperCase();
      if (role === 'MAIN' || /^M\b/i.test(d)) return [0, 0, d];
      const fm = d.match(/^F(\d+)$/i);
      if (fm) return [1, Number(fm[1]), d];
      return [2, 0, d];
    };
    const sorted = [...deviceLines].sort((a, b) => {
      const sa = Number(a.meta?.sectionIndex ?? 9999);
      const sb = Number(b.meta?.sectionIndex ?? 9999);
      if (sa !== sb) return sa - sb;
      const ra = desigRank(a);
      const rb = desigRank(b);
      if (ra[0] !== rb[0]) return ra[0] - rb[0];
      if (ra[1] !== rb[1]) return ra[1] - rb[1];
      return ra[2].localeCompare(rb[2]);
    });
    // Count devices per section for rowSpan
    const counts = new Map<string, number>();
    for (const l of sorted) {
      const k = String(l.meta?.sectionIndex ?? '?');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let sno = 0;
    let prevSection: string | null = null;
    return sorted.map((l) => {
      sno++;
      const k = String(l.meta?.sectionIndex ?? '?');
      const isFirstInSection = k !== prevSection;
      prevSection = k;
      return { l, sno, sectionKey: k, rowsInSection: counts.get(k) ?? 1, isFirstInSection };
    });
  }, [deviceLines]);

  const candidatesFor = (line: ComponentLineRow): CatalogCb[] => {
    if (!catalogCbs) return [];
    const role = String(line.meta?.role ?? 'FEEDER').toUpperCase();
    const wantClass = role === 'FEEDER' ? ['MCCB', 'MCB'] : ['ACB', 'ICCB'];
    const ratedA = Number(line.meta?.ratedA) || 0;
    return catalogCbs
      .filter((c) =>
        wantClass.includes(c.deviceClass)
        && c.ratedA >= ratedA
        && c.interruptingKA >= sccrKA
        && c.partNumber !== line.part_number)
      .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.ratedA - b.ratedA)
      .slice(0, 12);
  };

  const doSwap = async (line: ComponentLineRow, c: CatalogCb) => {
    setBusy(true);
    setError(null);
    try {
      await configuratorV2Service.patchLine(line.id, {
        component_id: c.componentId && c.componentId.length === 36 ? c.componentId : null,
        part_number: c.partNumber,
        name: [c.manufacturer, c.frameModel].filter(Boolean).join(' ') || c.partNumber,
        unit_cost: c.price ?? 0,
        price_status: c.priceStatus,
        meta: {
          ratedA: c.ratedA,
          poles: c.poles,
          mounting: c.mounting,
          interruptingKA: c.interruptingKA,
          frameModel: c.frameModel,
          manufacturer: c.manufacturer,
        },
      });
      setSwapLine(null);
      await onSwapped();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Swap failed');
    } finally {
      setBusy(false);
    }
  };

  if (!deviceLines.length) return null;
  const cands = swapLine ? candidatesFor(swapLine) : [];

  // Summary values for DesignSummaryCard
  const summaryMains = deviceLines.filter((l) => String(l.meta?.role).toUpperCase() === 'MAIN').length;
  const summaryFeeders = deviceLines.filter((l) => String(l.meta?.role).toUpperCase() === 'FEEDER').length;
  const summaryDrawout = deviceLines.filter((l) => String(l.meta?.mounting || '').toLowerCase().includes('draw')).length;
  const summaryDeviceCost = deviceLines.reduce((a, l) => a + (Number(l.unit_cost) || 0) * (Number(l.quantity) || 1), 0);

  return (
    <Box sx={{ px: 3, pb: 2 }}>
      <Typography sx={{ color: '#F0F6FF', fontSize: 13.5, fontWeight: 800, mb: 1 }}>
        Devices (saved design) — engineer may swap any pick
      </Typography>
      <Stack direction="row" spacing={2} alignItems="flex-start">
        {/* Scrollable table with sticky header */}
        <Box
          sx={{
            flex: 1, minWidth: 0,
            maxHeight: '58vh', overflow: 'auto',
            bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px',
          }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...headSx, width: 40, whiteSpace: 'nowrap', borderRight: '1px solid ' + C.border }} align="center">S.No</TableCell>
                <TableCell sx={{ ...headSx, width: 64, whiteSpace: 'nowrap', borderRight: '1px solid ' + C.border }}>Section</TableCell>
                <TableCell sx={headSx}>Tag</TableCell>
                <TableCell sx={headSx}>Role</TableCell>
                <TableCell sx={headSx}>Connected load</TableCell>
                <TableCell sx={headSx}>SKU</TableCell>
                <TableCell sx={headSx}>Manufacturer</TableCell>
                <TableCell sx={headSx}>Poles</TableCell>
                <TableCell sx={headSx}>Mounting</TableCell>
                <TableCell sx={headSx}>Rating</TableCell>
                <TableCell sx={headSx} align="right">Cost</TableCell>
                <TableCell sx={headSx} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {flatRows.map(({ l, sno, sectionKey, rowsInSection, isFirstInSection }) => {
                const statusColor = l.price_status === 'FIRM' ? C.green : l.price_status === 'ESTIMATED' ? C.amber : C.red;
                const statusLabel = l.price_status === 'FIRM' ? 'Firm price' : l.price_status === 'ESTIMATED' ? 'Estimated price' : 'No firm price — RFQ required';
                return (
                  <TableRow key={l.id}>
                    {/* S.No */}
                    <TableCell align="center" sx={{ ...cellSx, width: 40, color: C.sub, fontSize: 11.5, verticalAlign: 'middle', borderRight: '1px solid ' + C.border }}>
                      {sno}
                    </TableCell>
                    {/* Section — merged rowSpan on first row of the group */}
                    {isFirstInSection && (
                      <TableCell rowSpan={rowsInSection} sx={{ ...cellSx, width: 64, color: '#A9B6C9', fontWeight: 700, verticalAlign: 'middle', borderRight: '1px solid ' + C.border }}>
                        {'S' + sectionKey}
                      </TableCell>
                    )}
                    {/* Tag — yellow chip + tooltip when swapped, else blue */}
                    <TableCell sx={{ ...cellSx, verticalAlign: 'middle' }}>
                      {l.meta?.swapped ? (
                        <Tooltip title={'Swapped — was ' + (l.meta?.swapped_from ?? l.meta?.swappedFrom ?? '—')} arrow>
                          <Chip label={l.meta?.designation ?? '?'} size="small" sx={{ bgcolor: 'rgba(251,191,36,0.14)', color: '#FBBF24', fontWeight: 700, fontSize: 10.5, height: 20 }} />
                        </Tooltip>
                      ) : (
                        <Chip label={l.meta?.designation ?? '?'} size="small" sx={{ bgcolor: 'rgba(0,200,255,0.12)', color: '#60A5FA', fontWeight: 700, fontSize: 10.5, height: 20 }} />
                      )}
                    </TableCell>
                    {/* Role */}
                    <TableCell sx={{ ...cellSx, color: C.sub, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{l.meta?.role ?? '—'}</TableCell>
                    {/* Connected load — ellipsis + tooltip */}
                    <TableCell sx={{ ...cellSx, verticalAlign: 'middle' }}>
                      <Tooltip title={loadNameFor(l)} arrow>
                        <Box sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{loadNameFor(l)}</Box>
                      </Tooltip>
                    </TableCell>
                    {/* SKU + stacked source/status dots beneath */}
                    <TableCell sx={{ ...cellSx, verticalAlign: 'middle' }}>
                      <Stack spacing={0.4} alignItems="flex-start">
                        <Tooltip title={(l.part_number ?? '') + (l.meta?.catalogNumber ? ' · ' + l.meta.catalogNumber : '')} arrow>
                          <Box sx={{ color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{compactSku(l.part_number) || '—'}</Box>
                        </Tooltip>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <PriceSourceDot source={(l.meta as any)?.priceSource} />
                          <Tooltip title={statusLabel} arrow>
                            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: statusColor, display: 'inline-block' }} />
                          </Tooltip>
                        </Stack>
                      </Stack>
                    </TableCell>
                    {/* Manufacturer */}
                    <TableCell sx={{ ...cellSx, verticalAlign: 'middle' }}>{displayCase(l.meta?.manufacturer ?? '') || '—'}</TableCell>
                    {/* Poles */}
                    <TableCell sx={{ ...cellSx, color: C.sub, verticalAlign: 'middle' }}>{String(l.meta?.poles ?? 3) + 'P'}</TableCell>
                    {/* Mounting */}
                    <TableCell sx={{ ...cellSx, color: C.sub, verticalAlign: 'middle' }}>{l.meta?.mounting ?? 'Fixed'}</TableCell>
                    {/* Rating — left */}
                    <TableCell sx={{ ...cellSx, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>{l.meta?.ratedA ?? '—'} A / {l.meta?.interruptingKA ?? '—'} kA</TableCell>
                    {/* Cost — right, no decimals */}
                    <TableCell sx={{ ...cellSx, verticalAlign: 'middle' }} align="right">{Number(l.unit_cost) ? usd(Number(l.unit_cost)) : '—'}</TableCell>
                    {/* Actions */}
                         <TableCell sx={{ ...cellSx, verticalAlign: 'middle' }} align="right">
                      <Button
                        size="small" startIcon={<SwapHorizRoundedIcon sx={{ fontSize: 14 }} />}
                        disabled={locked}
                        onClick={() => { setSwapLine(l); setError(null); }}
                        sx={{ color: C.blue, textTransform: 'none', fontSize: 11.5, border: '1px solid ' + C.border }}
                      >
                        Swap
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>

        {/* Sticky summary card */}
        <DesignSummaryCard
          devices={deviceLines.length}
          mains={summaryMains}
          feeders={summaryFeeders}
          drawout={summaryDrawout}
          deviceCost={summaryDeviceCost}
        />
      </Stack>

      <Dialog open={!!swapLine} onClose={() => setSwapLine(null)} maxWidth="md" fullWidth
        PaperProps={{ sx: { bgcolor: C.bg, border: '1px solid ' + C.border, backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: C.text, fontSize: 15, fontWeight: 700 }}>
          Swap {swapLine?.meta?.designation} — alternatives ≥ {swapLine?.meta?.ratedA} A, ≥ {sccrKA} kA
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 1.5, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}>
              {error}
            </Alert>
          )}
          {!cands.length ? (
            <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
              No alternative in the catalog meets the constraints (class, rating, interrupting kA).
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>Manufacturer</TableCell>
                  <TableCell sx={headSx}>Frame</TableCell>
                  <TableCell sx={headSx} align="right">Rating</TableCell>
                  <TableCell sx={headSx}>Mounting</TableCell>
                  <TableCell sx={headSx} align="right">Price</TableCell>
                  <TableCell sx={headSx} />
                </TableRow>
              </TableHead>
              <TableBody>
                {cands.map((c) => (
                  <TableRow key={c.partNumber}>
                    <TableCell sx={cellSx}>{c.manufacturer ?? '—'}</TableCell>
                    <TableCell sx={cellSx}>{c.frameModel ?? c.partNumber}</TableCell>
                    <TableCell sx={cellSx} align="right">{c.ratedA} A / {c.interruptingKA} kA</TableCell>
                    <TableCell sx={{ ...cellSx, color: C.sub }}>{c.mounting}</TableCell>
                    <TableCell sx={cellSx} align="right">
                      {c.price != null
                        ? usd(c.price)
                        : <Chip label="RFQ" size="small" sx={{ bgcolor: 'transparent', border: '1px solid ' + C.amber, color: C.amber, fontSize: 9.5, height: 18 }} />}
                    </TableCell>
                    <TableCell sx={cellSx} align="right">
                      <Button size="small" disabled={busy} onClick={() => swapLine && doSwap(swapLine, c)}
                        sx={{ color: C.green, textTransform: 'none', fontSize: 11.5, border: '1px solid ' + C.border }}>
                        Use this
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSwapLine(null)} sx={{ color: C.sub, textTransform: 'none' }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DeviceListPanel;
