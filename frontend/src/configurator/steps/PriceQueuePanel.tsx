/**
 * PriceQueuePanel — RFQ procurement loop.
 *
 *  A) Awaiting price — PENDING_RFQ / ESTIMATED components grouped by
 *     assigned vendor (falling back to manufacturer, then Unassigned).
 *     Select lines -> Create RFQ -> pick vendor -> batch ConfiguratorPriceRfq
 *     rows + RFQ xlsx + prefilled email draft.
 *  B) RFQ batches — open -> sent -> received status tracking. The
 *     receive-price flow (one entry flips every dependent line to FIRM)
 *     stays reachable per part in panel A.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Alert, CircularProgress, TextField,
  Table, TableHead, TableRow, TableCell, TableBody, Checkbox, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete, IconButton,
} from '@mui/material';
import PriceCheckRoundedIcon from '@mui/icons-material/PriceCheckRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RequestQuoteRoundedIcon from '@mui/icons-material/RequestQuoteRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import configuratorV2Service, { PendingPriceGroup, RfqBatch } from '../../services/configuratorV2Service';
import { vendorService } from '../../services/vendorService';
import { Vendor } from '../../types';
import { displayCase, compactSku } from '../lib/displayCase';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', title: '#F0F6FF', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.7 };
const headSx = { color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderBottom: '1px solid ' + C.border, py: 0.7 };

const input = {
  '& .MuiOutlinedInput-root': {
    bgcolor: C.surface, color: C.text, fontSize: 12,
    '& fieldset': { borderColor: C.border },
    '&.Mui-focused fieldset': { borderColor: C.blue },
  },
  '& input': { color: C.text, py: 0.6 },
  '& .MuiInputLabel-root': { color: C.sub, fontSize: 12 },
  '& .MuiInputLabel-root.Mui-focused': { color: C.blue },
};

const checkboxSx = { color: C.sub, p: 0.4, '&.Mui-checked': { color: C.blue }, '&.MuiCheckbox-indeterminate': { color: C.blue } };

const UNASSIGNED = 'Unassigned';

function groupKeyOf(g: PendingPriceGroup): string {
  return (g.vendorName && g.vendorName.trim()) || (g.manufacturer && g.manufacturer.trim()) || UNASSIGNED;
}

function StatusDot({ status }: { status: RfqBatch['status'] }) {
  const color = status === 'complete' ? C.green : status === 'partial' ? C.blue : C.amber;
  return (
    <Box component="span" sx={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      bgcolor: color, boxShadow: `0 0 6px ${color}`, mr: 0.8, verticalAlign: 'middle',
    }} />
  );
}

const PriceQueuePanel: React.FC = () => {
  const [pending, setPending] = useState<PendingPriceGroup[]>([]);
  const [batches, setBatches] = useState<RfqBatch[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Create-RFQ dialog
  const [dlgOpen, setDlgOpen] = useState(false);
  const [dlgVendor, setDlgVendor] = useState<Vendor | null>(null);
  const [dlgNeededBy, setDlgNeededBy] = useState('');
  const [dlgNotes, setDlgNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [lastBatch, setLastBatch] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [out, bs] = await Promise.all([
        configuratorV2Service.priceQueue(),
        configuratorV2Service.listRfqBatches(),
      ]);
      setPending(out.pending);
      setBatches(bs);
      setSelected(new Set());
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to load price queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    vendorService.getAll().then(setVendors).catch(() => setVendors([]));
  }, []);

  // Group pending by vendor -> manufacturer -> Unassigned.
  const groups = useMemo(() => {
    const m = new Map<string, PendingPriceGroup[]>();
    for (const g of pending) {
      const k = groupKeyOf(g);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(g);
    }
    return [...m.entries()].sort(([a], [b]) => {
      if (a === UNASSIGNED) return 1;
      if (b === UNASSIGNED) return -1;
      return a.localeCompare(b);
    });
  }, [pending]);

  const selectablePart = (g: PendingPriceGroup) => !!g.partNumber;
  const partKey = (g: PendingPriceGroup) => g.partNumber ?? g.name ?? '';

  const toggleOne = (g: PendingPriceGroup) => {
    const pn = g.partNumber;
    if (!pn) return;
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(pn)) next.delete(pn); else next.add(pn);
      return next;
    });
  };

  const groupSelectState = (rows: PendingPriceGroup[]) => {
    const parts = rows.filter(selectablePart).map((r) => r.partNumber!) as string[];
    const sel = parts.filter((p) => selected.has(p));
    return { all: parts.length > 0 && sel.length === parts.length, some: sel.length > 0 && sel.length < parts.length, parts };
  };

  const toggleGroup = (rows: PendingPriceGroup[]) => {
    const { all, parts } = groupSelectState(rows);
    setSelected((s) => {
      const next = new Set(s);
      if (all) parts.forEach((p) => next.delete(p));
      else parts.forEach((p) => next.add(p));
      return next;
    });
  };

  const receive = async (g: PendingPriceGroup) => {
    const key = partKey(g);
    const p = Number(prices[key]);
    if (!g.partNumber || !Number.isFinite(p) || p <= 0) {
      setError('Enter a positive price for ' + (g.partNumber ?? g.name));
      return;
    }
    setBusyKey(key);
    setError(null);
    try {
      const out = await configuratorV2Service.receivePrice(g.partNumber, p);
      setInfo(`${g.partNumber}: ${out.linesUpdated} line(s) updated to firm and flagged for re-quote review.`);
      setPrices((m) => ({ ...m, [key]: '' }));
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to record price');
    } finally {
      setBusyKey(null);
    }
  };

  // Open the create-RFQ dialog; preselect vendor if all selected share one.
  const openCreate = () => {
    const selRows = pending.filter((g) => g.partNumber && selected.has(g.partNumber));
    const vIds = new Set(selRows.map((r) => r.vendorId).filter(Boolean));
    let preset: Vendor | null = null;
    if (vIds.size === 1) {
      const vid = [...vIds][0];
      preset = vendors.find((v) => v.id === vid) ?? null;
    }
    if (!preset) {
      const vNames = new Set(selRows.map((r) => r.vendorName).filter(Boolean));
      if (vNames.size === 1) preset = vendors.find((v) => v.vendor_name === [...vNames][0]) ?? null;
    }
    setDlgVendor(preset);
    setDlgNeededBy('');
    setDlgNotes('');
    setDlgOpen(true);
  };

  const submitCreate = async () => {
    const partNumbers = [...selected];
    if (!partNumbers.length) return;
    setCreating(true);
    setError(null);
    try {
      const out = await configuratorV2Service.createRfqBatch({
        vendorId: dlgVendor?.id,
        vendorName: dlgVendor?.vendor_name,
        partNumbers,
        neededBy: dlgNeededBy || undefined,
        notes: dlgNotes || undefined,
      });
      setLastBatch(out.batchCode);
      setInfo(`Created ${out.batchCode} — ${out.count} item(s). Downloading the RFQ spreadsheet…`);
      setDlgOpen(false);
      await configuratorV2Service.downloadRfqXlsx(out.batchCode).catch(() => {});
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to create RFQ batch');
    } finally {
      setCreating(false);
    }
  };

  const openEmail = async (batchCode: string) => {
    try {
      const d = await configuratorV2Service.rfqEmailDraft(batchCode);
      const mailto = `mailto:${encodeURIComponent(d.to)}?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
      window.location.href = mailto;
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to build email draft');
    }
  };

  const selectedCount = selected.size;

  return (
    <Box sx={{ px: 3, pb: 4, pt: 2 }}>
      {/* Panel A: Awaiting price */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Box>
          <Typography sx={{ color: C.title, fontWeight: 700, fontSize: 15 }}>Awaiting price</Typography>
          <Typography sx={{ color: C.sub, fontSize: 12 }}>
            Parts without firm vendor pricing, grouped by vendor. Select lines and raise a request for quotation.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            size="small" variant="contained" startIcon={<RequestQuoteRoundedIcon sx={{ fontSize: 16 }} />}
            disabled={selectedCount === 0} onClick={openCreate}
            sx={{
              bgcolor: C.blue, color: '#001016', textTransform: 'none', fontSize: 12, fontWeight: 700,
              '&:hover': { bgcolor: '#33d4ff' }, '&.Mui-disabled': { bgcolor: C.surface, color: C.sub, border: '1px solid ' + C.border },
            }}
          >
            Create RFQ{selectedCount ? ` (${selectedCount})` : ''}
          </Button>
          <Button
            size="small" startIcon={<RefreshRoundedIcon sx={{ fontSize: 15 }} />} onClick={load}
            sx={{ color: C.sub, textTransform: 'none', fontSize: 12, border: '1px solid ' + C.border }}
          >
            Refresh
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert
          severity="success" onClose={() => setInfo(null)}
          sx={{ mb: 1.5, bgcolor: 'rgba(34,197,94,0.08)', color: '#86EFAC', border: '1px solid ' + C.border, fontSize: 12 }}
          action={lastBatch ? (
            <Button size="small" onClick={() => openEmail(lastBatch)} sx={{ color: C.blue, textTransform: 'none', fontSize: 11.5 }}>
              Open email draft
            </Button>
          ) : undefined}
        >
          {info}{lastBatch ? ' Download the xlsx and attach it to the email.' : ''}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={24} sx={{ color: C.blue }} />
        </Stack>
      ) : !pending.length ? (
        <Box sx={{ bgcolor: C.bg, border: '1px dashed ' + C.border, borderRadius: '10px', p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: C.green, fontSize: 13, fontWeight: 600 }}>
            Nothing awaiting price — every BOM line is firm.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...headSx, width: 40 }} />
                <TableCell sx={headSx}>SKU</TableCell>
                <TableCell sx={headSx}>NAME</TableCell>
                <TableCell sx={headSx}>CATEGORY</TableCell>
                <TableCell sx={headSx}>MANUFACTURER</TableCell>
                <TableCell sx={headSx} align="right">QTY</TableCell>
                <TableCell sx={headSx}>STATUS</TableCell>
                <TableCell sx={headSx}>RECEIVED PRICE ($)</TableCell>
                <TableCell sx={headSx} />
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map(([groupName, rows]) => {
                const gs = groupSelectState(rows);
                return (
                  <React.Fragment key={groupName}>
                    <TableRow sx={{ bgcolor: 'rgba(0,200,255,0.05)' }}>
                      <TableCell sx={{ ...cellSx, borderBottom: '1px solid ' + C.border, py: 0.4 }}>
                        <Checkbox
                          size="small" sx={checkboxSx}
                          checked={gs.all} indeterminate={gs.some}
                          disabled={gs.parts.length === 0}
                          onChange={() => toggleGroup(rows)}
                        />
                      </TableCell>
                      <TableCell colSpan={8} sx={{ ...cellSx, color: '#A9B6C9', fontWeight: 700, fontSize: 11.5, py: 0.4 }}>
                        {displayCase(groupName)}
                        <Typography component="span" sx={{ color: C.sub, fontSize: 10.5, ml: 1 }}>
                          {rows.length} part{rows.length === 1 ? '' : 's'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                    {rows.map((g) => {
                      const key = partKey(g);
                      const checked = !!g.partNumber && selected.has(g.partNumber);
                      return (
                        <TableRow key={key} hover>
                          <TableCell sx={{ ...cellSx, py: 0.4 }}>
                            <Checkbox
                              size="small" sx={checkboxSx}
                              checked={checked} disabled={!g.partNumber}
                              onChange={() => toggleOne(g)}
                            />
                          </TableCell>
                          <TableCell sx={cellSx}>
                            <Tooltip title={g.partNumber ?? ''} arrow>
                              <span>{compactSku(g.partNumber) || '—'}</span>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={cellSx}>{displayCase(g.name ?? '') || '—'}</TableCell>
                          <TableCell sx={{ ...cellSx, color: C.sub }}>{displayCase(g.category ?? '') || '—'}</TableCell>
                          <TableCell sx={{ ...cellSx, color: C.sub }}>{displayCase(g.manufacturer ?? '') || '—'}</TableCell>
                          <TableCell sx={cellSx} align="right">{g.totalQty}</TableCell>
                          <TableCell sx={cellSx}>
                            {g.openRfq ? (
                              <Chip
                                label={g.openRfq.batchCode ?? 'In RFQ'}
                                size="small"
                                sx={{ bgcolor: 'transparent', border: '1px solid ' + C.sub, color: C.sub, fontSize: 9.5, height: 18 }}
                              />
                            ) : (
                              <Chip
                                label={g.priceStatus === 'PENDING_RFQ' ? 'RFQ' : 'EST'}
                                size="small"
                                sx={{ bgcolor: 'transparent', border: '1px solid ' + (g.priceStatus === 'PENDING_RFQ' ? C.red : C.amber), color: g.priceStatus === 'PENDING_RFQ' ? C.red : C.amber, fontSize: 9.5, height: 18 }}
                              />
                            )}
                          </TableCell>
                          <TableCell sx={cellSx}>
                            <TextField
                              size="small" placeholder="0.00" value={prices[key] ?? ''}
                              onChange={(e) => setPrices((m) => ({ ...m, [key]: e.target.value.replace(/[^0-9.]/g, '') }))}
                              sx={{ ...input, width: 110 }}
                              disabled={!g.partNumber}
                            />
                          </TableCell>
                          <TableCell sx={cellSx}>
                            <Button
                              size="small"
                              startIcon={<PriceCheckRoundedIcon sx={{ fontSize: 14 }} />}
                              disabled={busyKey === key || !g.partNumber || !Number(prices[key])}
                              onClick={() => receive(g)}
                              sx={{ color: C.green, textTransform: 'none', fontSize: 11.5, border: '1px solid ' + C.border }}
                            >
                              {busyKey === key ? 'Saving…' : 'Record'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Box>
      )}

      {/* Panel B: RFQ batches */}
      <Box sx={{ mt: 4 }}>
        <Typography sx={{ color: C.title, fontWeight: 700, fontSize: 15, mb: 0.3 }}>RFQ batches</Typography>
        <Typography sx={{ color: C.sub, fontSize: 12, mb: 1.5 }}>
          Quotation requests raised to vendors. Prices come back through the record action above.
        </Typography>

        {!batches.length ? (
          <Box sx={{ bgcolor: C.bg, border: '1px dashed ' + C.border, borderRadius: '10px', p: 3, textAlign: 'center' }}>
            <Typography sx={{ color: C.sub, fontSize: 12 }}>No RFQ batches yet.</Typography>
          </Box>
        ) : (
          <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={headSx}>BATCH CODE</TableCell>
                  <TableCell sx={headSx}>VENDOR</TableCell>
                  <TableCell sx={headSx} align="right">ITEMS</TableCell>
                  <TableCell sx={headSx} align="right">RECEIVED</TableCell>
                  <TableCell sx={headSx}>SENT</TableCell>
                  <TableCell sx={headSx}>STATUS</TableCell>
                  <TableCell sx={headSx} align="right">ACTIONS</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.batchCode} hover>
                    <TableCell sx={{ ...cellSx, fontFamily: 'monospace', color: C.text }}>{b.batchCode}</TableCell>
                    <TableCell sx={cellSx}>{b.vendorName ? displayCase(b.vendorName) : '—'}</TableCell>
                    <TableCell sx={cellSx} align="right">{b.count}</TableCell>
                    <TableCell sx={cellSx} align="right">{b.received}/{b.count}</TableCell>
                    <TableCell sx={{ ...cellSx, color: C.sub, fontSize: 11 }}>
                      {b.sentAt ? new Date(b.sentAt).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <StatusDot status={b.status} />
                      <Typography component="span" sx={{ fontSize: 11.5, color: C.text, textTransform: 'capitalize' }}>{b.status}</Typography>
                    </TableCell>
                    <TableCell sx={cellSx} align="right">
                      <Tooltip title="Download RFQ xlsx" arrow>
                        <IconButton size="small" onClick={() => configuratorV2Service.downloadRfqXlsx(b.batchCode).catch(() => {})} sx={{ color: C.sub, '&:hover': { color: C.blue } }}>
                          <DownloadRoundedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Email draft" arrow>
                        <IconButton size="small" onClick={() => openEmail(b.batchCode)} sx={{ color: C.sub, '&:hover': { color: C.blue } }}>
                          <MailOutlineRoundedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>

      {/* Create-RFQ dialog */}
      <Dialog open={dlgOpen} onClose={() => !creating && setDlgOpen(false)} PaperProps={{ sx: { bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '12px', minWidth: 420 } }}>
        <DialogTitle sx={{ color: C.title, fontSize: 15, fontWeight: 700 }}>
          Create RFQ
          <Typography sx={{ color: C.sub, fontSize: 12, fontWeight: 400 }}>
            {selectedCount} part{selectedCount === 1 ? '' : 's'} selected
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Autocomplete
              options={vendors}
              value={dlgVendor}
              onChange={(_, v) => setDlgVendor(v)}
              getOptionLabel={(v) => v.vendor_name}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => <TextField {...params} label="Vendor" sx={input} />}
              componentsProps={{ paper: { sx: { bgcolor: C.surface, color: C.text, border: '1px solid ' + C.border } } }}
            />
            <TextField
              label="Needed by" type="date" value={dlgNeededBy}
              onChange={(e) => setDlgNeededBy(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={input}
            />
            <TextField
              label="Notes" multiline minRows={2} value={dlgNotes}
              onChange={(e) => setDlgNotes(e.target.value)} sx={input}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDlgOpen(false)} disabled={creating} sx={{ color: C.sub, textTransform: 'none', fontSize: 12 }}>
            Cancel
          </Button>
          <Button
            onClick={submitCreate} disabled={creating || selectedCount === 0} variant="contained"
            sx={{ bgcolor: C.blue, color: '#001016', textTransform: 'none', fontSize: 12, fontWeight: 700, '&:hover': { bgcolor: '#33d4ff' } }}
          >
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PriceQueuePanel;
