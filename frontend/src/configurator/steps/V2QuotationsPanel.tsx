/**
 * V2QuotationsPanel — Designer quotations at PROJECT level.
 *
 * Lives at the top of the Quotation step: every configuration of the
 * project → its switchboards → the immutable revision chain, with
 * client Proposal (config-level), internal cost-sheet PDF, Epicor
 * export and Accept & hand off. The sales flow no longer requires
 * opening the Designer to act on an issued quote.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Alert, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody,
} from '@mui/material';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { configuratorService } from '../../services/configuratorService';
import configuratorV2Service, { QuoteRevisionRow, SwitchboardRow } from '../../services/configuratorV2Service';

const C = {
  bg: '#000000', surface: '#13131E', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};
const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.6 };
const headSx = { color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderBottom: '1px solid ' + C.border, py: 0.7 };
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface BoardQuotes { board: SwitchboardRow; configurationId: string; configCode: string; revisions: QuoteRevisionRow[] }

const V2QuotationsPanel: React.FC<{ projectId: string; onChanged?: () => void }> = ({ projectId, onChanged }) => {
  const [groups, setGroups] = useState<BoardQuotes[]>([]);
  const [configIds, setConfigIds] = useState<{ id: string; code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfgs = await configuratorService.listConfigurations({ project_id: projectId });
      setConfigIds(cfgs.map((c: any) => ({ id: c.id, code: c.code ?? c.name ?? '' })));
      const out: BoardQuotes[] = [];
      for (const cfg of cfgs) {
        const boards = await configuratorV2Service.listBoards(cfg.id).catch(() => []);
        for (const b of boards) {
          const revisions = await configuratorV2Service.listQuotes(b.id).catch(() => []);
          if (revisions.length) out.push({ board: b, configurationId: cfg.id, configCode: (cfg as any).code ?? '', revisions });
        }
      }
      setGroups(out);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to load Designer quotations');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const accept = async (q: QuoteRevisionRow) => {
    setBusy(q.id);
    setError(null);
    try {
      const out = await configuratorV2Service.confirmOrder(q.id);
      setInfo(out.stepErrors?.length
        ? 'Order recorded with retryable step error(s) — see handoff events.'
        : 'Order confirmed — design frozen, CAD job queued, material demands raised.');
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Order confirmation failed');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={20} sx={{ color: C.blue }} /></Stack>;
  }
  if (!groups.length) {
    return (
      <Box sx={{ bgcolor: C.bg, border: '1px dashed ' + C.border, borderRadius: '10px', p: 2.5, mb: 2 }}>
        <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
          No Designer quotations issued yet — open Configuration → Designer, design a board and issue a quote.
          They will appear here for proposal generation and order acceptance.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 14.5 }}>
          Designer quotations
        </Typography>
        <Chip label={groups.length + ' board(s)'} size="small" sx={{ bgcolor: 'rgba(0,200,255,0.12)', color: '#60A5FA', fontSize: 10, height: 18 }} />
        <Box sx={{ flex: 1 }} />
        {configIds.map((c) => (
          <Button
            key={c.id} size="small"
            onClick={() => configuratorV2Service.downloadProposalPdf(c.id).catch((e: any) =>
              setError(e?.response?.status === 422 ? 'No issued quotations in ' + (c.code || 'configuration') : 'Proposal failed'))}
            sx={{ bgcolor: C.green, color: '#fff', textTransform: 'none', fontSize: 11.5, fontWeight: 700, '&:hover': { bgcolor: '#16A34A' } }}
          >
            Client proposal {c.code ? '(' + c.code + ')' : ''}
          </Button>
        ))}
        <Button size="small" startIcon={<RefreshRoundedIcon sx={{ fontSize: 14 }} />} onClick={load}
          sx={{ color: C.sub, textTransform: 'none', fontSize: 11.5, border: '1px solid ' + C.border }}>
          Refresh
        </Button>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}>{error}</Alert>}
      {info && <Alert severity="success" onClose={() => setInfo(null)} sx={{ mb: 1, bgcolor: 'rgba(34,197,94,0.08)', color: '#86EFAC', border: '1px solid ' + C.border, fontSize: 12 }}>{info}</Alert>}

      {groups.map((g) => (
        <Box key={g.board.id} sx={{ bgcolor: C.bg, border: '1px solid ' + C.border, borderRadius: '10px', mb: 1.5, overflow: 'hidden' }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1, borderBottom: '1px solid ' + C.border }}>
            <Typography sx={{ color: '#CBD5E1', fontSize: 12.5, fontWeight: 700 }}>{g.board.name}</Typography>
            <Typography sx={{ color: C.sub, fontSize: 11 }}>{g.configCode}</Typography>
            {g.board.status === 'locked' && (
              <Chip label="design frozen" size="small" sx={{ bgcolor: 'transparent', border: '1px solid ' + C.green, color: C.green, fontSize: 9.5, height: 17 }} />
            )}
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>NUMBER</TableCell>
                <TableCell sx={headSx}>REV</TableCell>
                <TableCell sx={headSx} align="right">SELL</TableCell>
                <TableCell sx={headSx} align="right">GM</TableCell>
                <TableCell sx={headSx}>STATUS</TableCell>
                <TableCell sx={headSx}>DATE</TableCell>
                <TableCell sx={headSx} align="right">ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {g.revisions.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell sx={cellSx}>{r.quotation_number}</TableCell>
                  <TableCell sx={cellSx}>
                    <Chip label={'R' + r.revision} size="small" sx={{ bgcolor: 'rgba(0,200,255,0.12)', color: '#60A5FA', fontSize: 10, height: 18 }} />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, fontWeight: 700 }} align="right">{usd(r.grand_total)}</TableCell>
                  <TableCell sx={cellSx} align="right">{(r.margin_pct * 100).toFixed(1)}%</TableCell>
                  <TableCell sx={cellSx}>
                    <Chip label={r.status} size="small" sx={{ bgcolor: 'transparent', border: '1px solid ' + (r.status === 'accepted' ? C.green : C.border), color: r.status === 'accepted' ? C.green : C.sub, fontSize: 9.5, height: 17 }} />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                  <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }} align="right">
                    <Button size="small" startIcon={<PictureAsPdfRoundedIcon sx={{ fontSize: 12 }} />}
                      onClick={() => configuratorV2Service.downloadQuotePdf(r.id, r.quotation_number + '.pdf')}
                      sx={{ color: C.sub, textTransform: 'none', fontSize: 10.5, minWidth: 0, mr: 0.5 }}>
                      Cost sheet
                    </Button>
                    <Button size="small"
                      onClick={() => configuratorV2Service.downloadEpicorExport(r.id, 'Epicor_' + r.quotation_number + '.xlsx')}
                      sx={{ color: C.sub, textTransform: 'none', fontSize: 10.5, minWidth: 0, mr: 0.5 }}>
                      Epicor
                    </Button>
                    {i === 0 && r.status === 'draft' && (
                      <Button size="small" disabled={busy === r.id} onClick={() => accept(r)}
                        sx={{ color: C.green, textTransform: 'none', fontSize: 10.5, border: '1px solid ' + C.border }}>
                        {busy === r.id ? 'Confirming…' : 'Accept & hand off'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ))}
    </Box>
  );
};

export default V2QuotationsPanel;
