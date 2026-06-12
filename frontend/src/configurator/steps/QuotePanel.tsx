/**
 * QuotePanel — Quote slice (Phase D §7 on screen)
 *
 * Pricing runs through the UNMODIFIED parity-proven v1 engine
 * (CALC_VERSION 1.1.0) over the live-compiled BOM. Margin enters HERE
 * and only here (GM%). Zero labour is a hard block — manual labour
 * adjustments are the auditable escape hatch until per-part hour
 * buckets are loaded. Issued quotes form an immutable revision chain.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Alert, CircularProgress, TextField,
  Table, TableHead, TableRow, TableCell, TableBody, MenuItem, Select, IconButton,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import RequestQuoteRoundedIcon from '@mui/icons-material/RequestQuoteRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import configuratorV2Service, {
  QuotePreviewResponse, QuoteRevisionRow, LaborAdjustment,
} from '../../services/configuratorV2Service';
import QuoteCharts from './QuoteCharts';

const C = {
  bg: '#000000', surface: '#13131E', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const BUCKETS = ['CU', 'ASM', 'CNT', 'QC', 'TST', 'ENG', 'CAD'] as const;
const BUCKET_LABEL: Record<string, string> = {
  CU: 'Copper fab', ASM: 'Assembly', CNT: 'Control wiring', QC: 'Quality',
  TST: 'Testing', ENG: 'Engineering', CAD: 'CAD/Drafting',
};

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

const input = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.surface, color: C.text, fontSize: 13,
    '& fieldset': { borderColor: C.border },
    '&:hover fieldset': { borderColor: '#2A3050' },
    '&.Mui-focused fieldset': { borderColor: C.blue },
  },
  '& input': { color: C.text },
};

const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.7 };
const headSx = { color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderBottom: '1px solid ' + C.border, py: 0.7 };

let adjSeq = 0;

export interface QuotePanelProps { switchboardId: string }

const QuotePanel: React.FC<QuotePanelProps> = ({ switchboardId }) => {
  const [gmPctInput, setGmPctInput] = useState('');
  const [unitsInput, setUnitsInput] = useState('1');
  const [prorateDesign, setProrateDesign] = useState(true);
  const [adjustments, setAdjustments] = useState<(LaborAdjustment & { _id: string })[]>([]);
  const [preview, setPreview] = useState<QuotePreviewResponse | null>(null);
  const [revisions, setRevisions] = useState<QuoteRevisionRow[]>([]);
  const [revisionReason, setRevisionReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  const body = useCallback(() => ({
    ...(gmPctInput !== '' ? { gmPct: (Number(gmPctInput) || 30) / 100 } : {}),
    units: Math.max(1, Number(unitsInput) || 1),
    prorateDesign,
    laborAdjustments: adjustments
      .filter((a) => Number(a.hours) > 0)
      .map(({ _id, ...a }) => ({ ...a, hours: Number(a.hours) })),
  }), [gmPctInput, adjustments, unitsInput, prorateDesign]);

  const runPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await configuratorV2Service.quotePreview(switchboardId, body());
      setPreview(p);
      setGmPctInput((g) => (g === '' ? String(Math.round(p.inputs.gmPct * 100)) : g));
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Quote preview failed');
    } finally {
      setLoading(false);
    }
  }, [switchboardId, body]);

  const loadRevisions = useCallback(async () => {
    try { setRevisions(await configuratorV2Service.listQuotes(switchboardId)); } catch { /* noop */ }
  }, [switchboardId]);

  useEffect(() => { runPreview(); loadRevisions(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [confirming, setConfirming] = useState<string | null>(null);

  const confirmOrder = async (quotationId: string) => {
    setConfirming(quotationId);
    setError(null);
    try {
      const out = await configuratorV2Service.confirmOrder(quotationId);
      const jobs = out.results?.swJobs?.result?.jobs?.length ?? 0;
      const demands = out.results?.demands?.result?.demandCount ?? 0;
      setIssued(out.stepErrors?.length
        ? 'Order recorded with ' + out.stepErrors.length + ' retryable step error(s) — see handoff events.'
        : 'Order confirmed — design frozen, ' + jobs + ' CAD job(s) queued, ' + demands + ' material demand(s) raised.');
      await loadRevisions();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Order confirmation failed');
    } finally {
      setConfirming(null);
    }
  };

  const issue = async () => {
    setIssuing(true);
    setError(null);
    try {
      const out = await configuratorV2Service.issueQuote(switchboardId, {
        ...body(),
        revisionReason: revisionReason || undefined,
      });
      setIssued('Quotation ' + out.quotation.quotation_number + ' issued (rev ' + out.quotation.revision + ')');
      setRevisionReason('');
      await loadRevisions();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Issue failed');
    } finally {
      setIssuing(false);
    }
  };

  const q = preview?.quote;
  const labourCost = q ? Object.values(q.labor_costs).reduce((a, b) => a + b, 0) : 0;

  return (
    <Box sx={{ px: 3, pb: 4 }}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}>
          {error}
        </Alert>
      )}
      {issued && (
        <Alert severity="success" onClose={() => setIssued(null)} sx={{ mb: 2, bgcolor: 'rgba(34,197,94,0.08)', color: '#86EFAC', border: '1px solid ' + C.border, fontSize: 12 }}>
          {issued}
        </Alert>
      )}

      <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap" useFlexGap>
        {/* Inputs column */}
        <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', p: 2, minWidth: 320, flex: '0 0 360px' }}>
          <Typography sx={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, mb: 1.5 }}>Pricing inputs</Typography>
          <Stack spacing={1.5}>
            <Box>
              <Typography sx={{ color: C.sub, fontSize: 11, mb: 0.5 }}>Desired gross margin %</Typography>
              <TextField
                size="small" value={gmPctInput} fullWidth
                onChange={(e) => setGmPctInput(e.target.value.replace(/[^0-9.]/g, ''))}
                sx={input}
                InputProps={{ endAdornment: <Typography sx={{ color: C.sub, fontSize: 12 }}>%</Typography> }}
              />
            </Box>

            <Stack direction="row" spacing={1.5} alignItems="flex-end">
              <Box>
                <Typography sx={{ color: C.sub, fontSize: 11, mb: 0.5 }}>Identical units</Typography>
                <TextField
                  size="small" value={unitsInput} sx={{ ...input, width: 90 }}
                  onChange={(e) => setUnitsInput(e.target.value.replace(/[^0-9]/g, ''))}
                />
              </Box>
              {Number(unitsInput) > 1 && (
                <Button
                  size="small" onClick={() => setProrateDesign((v) => !v)}
                  sx={{
                    textTransform: 'none', fontSize: 11, mb: 0.25,
                    color: prorateDesign ? C.green : C.sub,
                    border: '1px solid ' + (prorateDesign ? C.green : C.border),
                  }}
                >
                  {prorateDesign ? 'Design hours charged once ✓' : 'Design hours per unit'}
                </Button>
              )}
            </Stack>

            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                <Typography sx={{ color: C.sub, fontSize: 11 }}>
                  Manual labour adjustments (auditable — until part hour buckets load)
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setAdjustments((a) => [...a, { _id: 'adj-' + (adjSeq++), bucket: 'ASM', hours: 0, note: '' }])}
                  sx={{ color: C.blue }}
                >
                  <AddRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Stack>
              <Stack spacing={1}>
                {adjustments.map((a) => (
                  <Stack key={a._id} direction="row" spacing={1} alignItems="center">
                    <Select
                      size="small" value={a.bucket}
                      onChange={(e) => setAdjustments((arr) => arr.map((x) => (x._id === a._id ? { ...x, bucket: e.target.value as any } : x)))}
                      sx={{ ...input, minWidth: 110, '& .MuiSelect-select': { color: C.text, fontSize: 12, py: 0.75 }, bgcolor: C.surface, border: 'none' }}
                    >
                      {BUCKETS.map((b) => (
                        <MenuItem key={b} value={b} sx={{ fontSize: 12 }}>{b} — {BUCKET_LABEL[b]}</MenuItem>
                      ))}
                    </Select>
                    <TextField
                      size="small" value={a.hours || ''} placeholder="hrs"
                      onChange={(e) => setAdjustments((arr) => arr.map((x) => (x._id === a._id ? { ...x, hours: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 } : x)))}
                      sx={{ ...input, width: 70 }}
                    />
                    <TextField
                      size="small" value={a.note ?? ''} placeholder="reason"
                      onChange={(e) => setAdjustments((arr) => arr.map((x) => (x._id === a._id ? { ...x, note: e.target.value } : x)))}
                      sx={{ ...input, flex: 1 }}
                    />
                    <IconButton size="small" onClick={() => setAdjustments((arr) => arr.filter((x) => x._id !== a._id))} sx={{ color: C.sub }}>
                      <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Stack>
                ))}
                {!adjustments.length && (
                  <Typography sx={{ color: C.sub, fontSize: 11.5, fontStyle: 'italic' }}>
                    None — labour comes from part hour buckets only.
                  </Typography>
                )}
              </Stack>
            </Box>

            <Button
              onClick={runPreview} disabled={loading}
              sx={{ bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontWeight: 600, '&:hover': { bgcolor: '#33d4ff' } }}
            >
              {loading ? 'Computing…' : 'Recompute quote'}
            </Button>
          </Stack>
        </Box>

        {/* Result column */}
        <Box sx={{ flex: 1, minWidth: 340 }}>
          {loading && !preview ? (
            <Stack alignItems="center" sx={{ py: 6 }}>
              <CircularProgress size={24} sx={{ color: C.blue }} />
            </Stack>
          ) : q ? (
            <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', p: 2 }}>
              <Typography sx={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, mb: 1.5 }}>
                Cost build-up · engine v{q.calc_version}
              </Typography>
              {[
                ['Material (incl. copper est.)', usd(q.totals.material_total)],
                ['Labour (' + preview!.labourHoursTotal.toFixed(1) + ' h)', usd(labourCost)],
                ['Overhead (10%)', usd(q.totals.overhead_amount)],
              ].map(([k, v]) => (
                <Stack key={String(k)} direction="row" justifyContent="space-between" sx={{ py: 0.5, borderBottom: '1px solid ' + C.border }}>
                  <Typography sx={{ color: C.sub, fontSize: 12.5 }}>{k}</Typography>
                  <Typography sx={{ color: C.text, fontSize: 12.5, fontWeight: 600 }}>{v}</Typography>
                </Stack>
              ))}
              <Stack direction="row" justifyContent="space-between" sx={{ py: 0.75 }}>
                <Typography sx={{ color: C.text, fontSize: 13, fontWeight: 700 }}>Total cost</Typography>
                <Typography sx={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{usd(q.total_cost)}</Typography>
              </Stack>
              <Box sx={{ bgcolor: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.35)', borderRadius: '8px', p: 1.5, mt: 1 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography sx={{ color: C.sub, fontSize: 12 }}>Sell price (rounded)</Typography>
                  <Typography sx={{ color: '#60A5FA', fontSize: 18, fontWeight: 800 }}>{usd(q.pricing.rounded_price)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography sx={{ color: C.sub, fontSize: 11.5 }}>Actual GM {(q.pricing.actual_gm * 100).toFixed(2)}%</Typography>
                  <Typography sx={{ color: C.sub, fontSize: 11.5 }}>Profit {usd(q.pricing.actual_profit)}</Typography>
                </Stack>
              </Box>

              {preview!.multiUnit && (
                <Box sx={{ bgcolor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', p: 1.5, mt: 1 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography sx={{ color: C.sub, fontSize: 12 }}>
                      {preview!.multiUnit.units} units · {usd(preview!.multiUnit.perUnitPrice)}/unit
                      {preview!.multiUnit.prorateDesign ? ' · design charged once' : ''}
                    </Typography>
                    <Typography sx={{ color: '#86EFAC', fontSize: 16, fontWeight: 800 }}>
                      {usd(preview!.multiUnit.totalPrice)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography sx={{ color: C.sub, fontSize: 11 }}>
                      Total cost {usd(preview!.multiUnit.totalCost)}
                    </Typography>
                    <Typography sx={{ color: C.sub, fontSize: 11 }}>
                      GM {(preview!.multiUnit.actualGm * 100).toFixed(2)}% · profit {usd(preview!.multiUnit.profit)}
                    </Typography>
                  </Stack>
                </Box>
              )}

              {preview!.nonFirmCount > 0 && (
                <Alert severity="warning" sx={{ mt: 1.5, bgcolor: 'rgba(217,119,6,0.08)', color: '#FCD34D', border: '1px solid ' + C.border, fontSize: 11.5, py: 0.25 }}>
                  {preview!.nonFirmCount} BOM line(s) are ESTIMATED / awaiting RFQ price — quote may move.
                </Alert>
              )}
              {preview!.blockers.map((b) => (
                <Alert key={b} severity="error" sx={{ mt: 1, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 11.5, py: 0.25 }}>
                  {b}
                </Alert>
              ))}

              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <TextField
                  size="small" fullWidth placeholder={revisions.length ? 'Revision reason (required for rev ' + revisions.length + ')' : 'Reason (optional for first issue)'}
                  value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)}
                  sx={input}
                />
                <Button
                  startIcon={<RequestQuoteRoundedIcon sx={{ fontSize: 16 }} />}
                  disabled={issuing || !preview!.canIssue || (revisions.length > 0 && !revisionReason.trim())}
                  onClick={issue}
                  sx={{
                    bgcolor: C.green, color: '#06220F', textTransform: 'none', fontWeight: 700, px: 2, whiteSpace: 'nowrap',
                    '&:hover': { bgcolor: '#16A34A' },
                    '&.Mui-disabled': { bgcolor: 'rgba(34,197,94,0.15)', color: 'rgba(134,239,172,0.4)' },
                  }}
                >
                  {issuing ? 'Issuing…' : revisions.length ? 'Issue revision ' + revisions.length : 'Issue quote'}
                </Button>
              </Stack>
            </Box>
          ) : null}
        </Box>
      </Stack>

      {/* Visual review before issuing */}
      {preview && q && <QuoteCharts preview={preview} revisions={revisions} />}

      {/* Revision chain */}
      {revisions.length > 0 && (
        <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', mt: 2, overflow: 'hidden' }}>
          <Typography sx={{ color: '#CBD5E1', fontSize: 12.5, fontWeight: 700, px: 2, py: 1, borderBottom: '1px solid ' + C.border }}>
            Revision history (immutable)
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>NUMBER</TableCell>
                <TableCell sx={headSx}>REV</TableCell>
                <TableCell sx={headSx} align="right">MATERIAL</TableCell>
                <TableCell sx={headSx} align="right">LABOUR</TableCell>
                <TableCell sx={headSx} align="right">COST</TableCell>
                <TableCell sx={headSx} align="right">SELL</TableCell>
                <TableCell sx={headSx} align="right">GM</TableCell>
                <TableCell sx={headSx}>REASON</TableCell>
                <TableCell sx={headSx}>DATE</TableCell>
                <TableCell sx={headSx} />
              </TableRow>
            </TableHead>
            <TableBody>
              {revisions.map((r) => (
                <TableRow key={r.id}>
                  <TableCell sx={cellSx}>{r.quotation_number}</TableCell>
                  <TableCell sx={cellSx}>
                    <Chip label={'R' + r.revision} size="small" sx={{ bgcolor: 'rgba(0,200,255,0.12)', color: '#60A5FA', fontSize: 10, height: 18 }} />
                  </TableCell>
                  <TableCell sx={cellSx} align="right">{usd(r.material_total)}</TableCell>
                  <TableCell sx={cellSx} align="right">{usd(r.labour_total)}</TableCell>
                  <TableCell sx={cellSx} align="right">{usd(r.subtotal)}</TableCell>
                  <TableCell sx={{ ...cellSx, fontWeight: 700 }} align="right">{usd(r.grand_total)}</TableCell>
                  <TableCell sx={cellSx} align="right">{(r.margin_pct * 100).toFixed(1)}%</TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{r.revision_reason ?? '—'}</TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{new Date(r.created_at).toLocaleString()}</TableCell>
                  <TableCell sx={cellSx}>
                    <Button
                      size="small"
                      startIcon={<PictureAsPdfRoundedIcon sx={{ fontSize: 13 }} />}
                      onClick={() => configuratorV2Service.downloadQuotePdf(r.id, r.quotation_number + '.pdf')}
                      sx={{ color: C.sub, textTransform: 'none', fontSize: 11, minWidth: 0, mr: 0.5, '&:hover': { color: C.text } }}
                    >
                      PDF
                    </Button>
                    <Button
                      size="small"
                      onClick={() => configuratorV2Service.downloadEpicorExport(r.id, 'Epicor_' + r.quotation_number + '.xlsx')}
                      sx={{ color: C.sub, textTransform: 'none', fontSize: 11, minWidth: 0, mr: 0.5, '&:hover': { color: C.text } }}
                    >
                      Epicor
                    </Button>
                    {r.id === revisions[0].id && r.status === 'draft' && (
                      <Button
                        size="small"
                        disabled={confirming === r.id}
                        onClick={() => confirmOrder(r.id)}
                        sx={{ color: C.green, textTransform: 'none', fontSize: 11, border: '1px solid ' + C.border, whiteSpace: 'nowrap' }}
                      >
                        {confirming === r.id ? 'Confirming…' : 'Accept & hand off'}
                      </Button>
                    )}
                    {r.status !== 'draft' && (
                      <Chip label={r.status} size="small" sx={{ bgcolor: 'transparent', border: '1px solid ' + C.green, color: C.green, fontSize: 9.5, height: 18 }} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
};

export default QuotePanel;
