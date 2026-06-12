/**
 * PriceQueuePanel — Awaiting-Price loop (Phase A §4.1 on screen)
 *
 * Every BOM line priced PENDING_RFQ / ESTIMATED across all boards,
 * grouped by part number. Enter the manufacturer's returned price once:
 * catalog component flips FIRM, every dependent line updates and is
 * flagged for re-quote review.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Alert, CircularProgress, TextField,
  Table, TableHead, TableRow, TableCell, TableBody,
} from '@mui/material';
import PriceCheckRoundedIcon from '@mui/icons-material/PriceCheckRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import configuratorV2Service, { PendingPriceGroup } from '../../services/configuratorV2Service';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
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
};

const PriceQueuePanel: React.FC = () => {
  const [pending, setPending] = useState<PendingPriceGroup[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await configuratorV2Service.priceQueue();
      setPending(out.pending);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to load price queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const receive = async (g: PendingPriceGroup) => {
    const key = g.partNumber ?? g.name ?? '';
    const p = Number(prices[key]);
    if (!g.partNumber || !Number.isFinite(p) || p <= 0) {
      setError('Enter a positive price for ' + (g.partNumber ?? g.name));
      return;
    }
    setBusyKey(key);
    setError(null);
    try {
      const out = await configuratorV2Service.receivePrice(g.partNumber, p);
      setInfo(`${g.partNumber}: ${out.linesUpdated} line(s) updated to FIRM and flagged for re-quote review.`);
      setPrices((m) => ({ ...m, [key]: '' }));
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to record price');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <Box sx={{ px: 3, pb: 4, pt: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Box>
          <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 15 }}>Awaiting price</Typography>
          <Typography sx={{ color: C.sub, fontSize: 12 }}>
            Parts without firm vendor pricing, across all switchboards. One entry updates every dependent line.
          </Typography>
        </Box>
        <Button
          size="small" startIcon={<RefreshRoundedIcon sx={{ fontSize: 15 }} />} onClick={load}
          sx={{ color: C.sub, textTransform: 'none', fontSize: 12, border: '1px solid ' + C.border }}
        >
          Refresh
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1.5, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert severity="success" onClose={() => setInfo(null)} sx={{ mb: 1.5, bgcolor: 'rgba(34,197,94,0.08)', color: '#86EFAC', border: '1px solid ' + C.border, fontSize: 12 }}>
          {info}
        </Alert>
      )}

      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={24} sx={{ color: C.blue }} />
        </Stack>
      ) : !pending.length ? (
        <Box sx={{ bgcolor: C.bg, border: '1px dashed ' + C.border, borderRadius: '10px', p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: C.green, fontSize: 13, fontWeight: 600 }}>
            Nothing awaiting price — every BOM line is FIRM.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>PART #</TableCell>
                <TableCell sx={headSx}>DESCRIPTION</TableCell>
                <TableCell sx={headSx}>CATEGORY</TableCell>
                <TableCell sx={headSx}>STATUS</TableCell>
                <TableCell sx={headSx} align="right">QTY</TableCell>
                <TableCell sx={headSx}>USED ON</TableCell>
                <TableCell sx={headSx}>RECEIVED PRICE ($)</TableCell>
                <TableCell sx={headSx} />
              </TableRow>
            </TableHead>
            <TableBody>
              {pending.map((g) => {
                const key = g.partNumber ?? g.name ?? '';
                return (
                  <TableRow key={key}>
                    <TableCell sx={cellSx}>{g.partNumber ?? '—'}</TableCell>
                    <TableCell sx={cellSx}>{g.name ?? '—'}</TableCell>
                    <TableCell sx={{ ...cellSx, color: C.sub }}>{g.category}</TableCell>
                    <TableCell sx={cellSx}>
                      <Chip
                        label={g.priceStatus === 'PENDING_RFQ' ? 'RFQ' : 'EST'}
                        size="small"
                        sx={{ bgcolor: 'transparent', border: '1px solid ' + (g.priceStatus === 'PENDING_RFQ' ? C.red : C.amber), color: g.priceStatus === 'PENDING_RFQ' ? C.red : C.amber, fontSize: 9.5, height: 18 }}
                      />
                    </TableCell>
                    <TableCell sx={cellSx} align="right">{g.totalQty}</TableCell>
                    <TableCell sx={{ ...cellSx, color: C.sub, fontSize: 11 }}>{g.boards.join(', ') || '—'}</TableCell>
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
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  );
};

export default PriceQueuePanel;
