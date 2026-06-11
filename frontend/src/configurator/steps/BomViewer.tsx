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
  bg: '#0D0D14', surface: '#13131E', border: '#1E2235', blue: '#1976D2',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const color = status === 'FIRM' ? C.green : status === 'ESTIMATED' ? C.amber : C.red;
  return (
    <Chip
      label={status === 'PENDING_RFQ' ? 'RFQ' : status}
      size="small"
      sx={{ bgcolor: 'transparent', border: '1px solid ' + color, color, fontSize: 9.5, height: 18 }}
    />
  );
};

const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.7 };
const headSx = { color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderBottom: '1px solid ' + C.border, py: 0.7 };

const Stat: React.FC<{ label: string; value: string; accent?: string }> = ({ label, value, accent }) => (
  <Box sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', px: 2, py: 1.25, minWidth: 130 }}>
    <Typography sx={{ color: C.sub, fontSize: 10.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Typography>
    <Typography sx={{ color: accent ?? C.text, fontSize: 17, fontWeight: 700 }}>{value}</Typography>
  </Box>
);

export interface BomViewerProps { switchboardId: string }

const BomViewer: React.FC<BomViewerProps> = ({ switchboardId }) => {
  const [bom, setBom] = useState<BomResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'ebom' | 'mbom'>('ebom');

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

  return (
    <Box sx={{ px: 3, pb: 4 }}>
      {/* Totals strip */}
      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Stat label="Material total" value={usd(totals.materialTotal)} accent={C.green} />
        <Stat label="Copper (est.)" value={totals.copperEstLbs + ' lb'} />
        <Stat label="Copper cost" value={usd(copper.costUsd)} />
        <Stat label="BOM rows" value={String(totals.rowCount)} />
        <Stat
          label="Awaiting price"
          value={String(totals.nonFirmCount)}
          accent={totals.nonFirmCount > 0 ? C.amber : C.green}
        />
        <Stat label="Labour hours" value={laborTotal.toFixed(1) + ' h'} accent={laborTotal === 0 ? C.amber : undefined} />
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          startIcon={<RefreshRoundedIcon sx={{ fontSize: 15 }} />}
          onClick={load}
          sx={{ color: C.sub, textTransform: 'none', fontSize: 12, border: '1px solid ' + C.border, alignSelf: 'center' }}
        >
          Recompile
        </Button>
      </Stack>

      {laborTotal === 0 && (
        <Alert severity="warning" sx={{ mb: 2, bgcolor: 'rgba(217,119,6,0.08)', color: '#FCD34D', border: '1px solid ' + C.border, fontSize: 12 }}>
          Labour hours are 0 — part-level hour buckets are not loaded yet. A quotation cannot be issued at zero labour (hard block).
        </Alert>
      )}

      {/* Copper estimate breakdown */}
      <Box sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', p: 2, mb: 2 }}>
        <Typography sx={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, mb: 1 }}>
          Copper estimate — pass 1 (parametric) · {usd(bom.copperPricePerLb)}/lb · SolidWorks trues up at pass 2
        </Typography>
        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
          {[
            ['Main bus', copper.mainBusLbs], ['Neutral', copper.neutralLbs], ['Ground', copper.groundLbs],
            ['Risers', copper.riserLbs], ['Device stubs', copper.stubLbs], ['Raw', copper.rawLbs],
            ['× fab factor', copper.estimatedLbs],
          ].map(([k, v]) => (
            <Box key={String(k)}>
              <Typography sx={{ color: C.sub, fontSize: 10.5 }}>{k}</Typography>
              <Typography sx={{ color: C.text, fontSize: 13.5, fontWeight: 600 }}>{v} lb</Typography>
            </Box>
          ))}
          <Box>
            <Typography sx={{ color: C.sub, fontSize: 10.5 }}>Glastic supports</Typography>
            <Typography sx={{ color: C.text, fontSize: 13.5, fontWeight: 600 }}>{copper.supports}</Typography>
          </Box>
        </Stack>
        {copper.notes.map((n) => (
          <Typography key={n} sx={{ color: C.amber, fontSize: 11, mt: 1 }}>⚠ {n}</Typography>
        ))}
      </Box>

      {/* eBOM / mBOM toggle */}
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        {(['ebom', 'mbom'] as const).map((v) => (
          <Button
            key={v}
            size="small"
            onClick={() => setView(v)}
            sx={{
              textTransform: 'none', fontSize: 12, px: 1.5,
              color: view === v ? '#fff' : C.sub,
              bgcolor: view === v ? C.blue : 'transparent',
              border: '1px solid ' + (view === v ? C.blue : C.border),
              '&:hover': { bgcolor: view === v ? '#1565C0' : 'rgba(255,255,255,0.04)' },
            }}
          >
            {v === 'ebom' ? 'eBOM — by section' : 'mBOM — by part (where-used)'}
          </Button>
        ))}
      </Stack>

      {view === 'ebom' ? (
        Object.entries(bom.ebom).map(([secName, cats]) => (
          <Box key={secName} sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', mb: 1.5, overflow: 'hidden' }}>
            <Typography sx={{ color: '#CBD5E1', fontSize: 12.5, fontWeight: 700, px: 2, py: 1, borderBottom: '1px solid ' + C.border }}>
              {secName}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>CATEGORY</TableCell>
                  <TableCell sx={headSx}>DESCRIPTION</TableCell>
                  <TableCell sx={headSx}>PART #</TableCell>
                  <TableCell sx={headSx} align="right">QTY</TableCell>
                  <TableCell sx={headSx}>UNIT</TableCell>
                  <TableCell sx={headSx} align="right">UNIT COST</TableCell>
                  <TableCell sx={headSx} align="right">EXT.</TableCell>
                  <TableCell sx={headSx}>PRICE</TableCell>
                  <TableCell sx={headSx}>SOURCE</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(cats).flatMap(([cat, rows]) =>
                  rows.map((r: BomRow, i: number) => (
                    <TableRow key={cat + i}>
                      <TableCell sx={{ ...cellSx, color: C.sub }}>{cat}</TableCell>
                      <TableCell sx={cellSx}>
                        {r.description}
                        {r.copper_weight_lbs ? (
                          <Typography component="span" sx={{ color: C.sub, fontSize: 11 }}> · {r.copper_weight_lbs} lb Cu</Typography>
                        ) : null}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, color: C.sub }}>{r.part_number ?? '—'}</TableCell>
                      <TableCell sx={cellSx} align="right">{r.quantity}</TableCell>
                      <TableCell sx={{ ...cellSx, color: C.sub }}>{r.unit}</TableCell>
                      <TableCell sx={cellSx} align="right">{r.unit_cost ? usd(r.unit_cost) : '—'}</TableCell>
                      <TableCell sx={cellSx} align="right">{r.unit_cost ? usd(r.unit_cost * r.quantity) : '—'}</TableCell>
                      <TableCell sx={cellSx}><StatusChip status={r.price_status} /></TableCell>
                      <TableCell sx={cellSx}>
                        {r.source === 'generator' ? (
                          <Tooltip title={'Auto-generated (' + (r.generator_id ?? '') + ') — recomputed from the design, cannot drift'}>
                            <Chip label={r.generator_id ?? 'GEN'} size="small" sx={{ bgcolor: 'rgba(25,118,210,0.12)', color: '#60A5FA', fontSize: 9.5, height: 18 }} />
                          </Tooltip>
                        ) : (
                          <Typography sx={{ color: C.sub, fontSize: 11 }}>{r.source}</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Box>
        ))
      ) : (
        <Box sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>PART #</TableCell>
                <TableCell sx={headSx}>CATEGORY</TableCell>
                <TableCell sx={headSx}>DESCRIPTION</TableCell>
                <TableCell sx={headSx} align="right">TOTAL QTY</TableCell>
                <TableCell sx={headSx}>UNIT</TableCell>
                <TableCell sx={headSx} align="right">UNIT COST</TableCell>
                <TableCell sx={headSx}>PRICE</TableCell>
                <TableCell sx={headSx}>WHERE USED</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bom.mbom.map((m, i) => (
                <TableRow key={i}>
                  <TableCell sx={cellSx}>{m.part_number ?? '—'}</TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{m.category}</TableCell>
                  <TableCell sx={cellSx}>{m.description}</TableCell>
                  <TableCell sx={cellSx} align="right">{m.quantity}</TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{m.unit}</TableCell>
                  <TableCell sx={cellSx} align="right">{m.unit_cost ? usd(m.unit_cost) : '—'}</TableCell>
                  <TableCell sx={cellSx}><StatusChip status={m.price_status} /></TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub, fontSize: 11 }}>{[...new Set(m.whereUsed)].join(', ')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
};

export default BomViewer;
