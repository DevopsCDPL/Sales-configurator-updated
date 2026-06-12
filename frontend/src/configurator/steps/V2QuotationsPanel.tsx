/**
 * V2QuotationsPanel — Designer quotations at PROJECT level.
 *
 * Lives at the top of the Quotation step: every configuration of the
 * project -> its switchboards -> the immutable revision chain, with
 * client Proposal (config-level), internal cost-sheet PDF, Epicor
 * export and Accept & hand off. The sales flow no longer requires
 * opening the Designer to act on an issued quote.
 *
 * Change orders: each board section shows pending COs with Approve &
 * apply / Reject actions. Approve unlocks the board; reject leaves it
 * frozen. Status chips: amber = pending_approval, green = applied,
 * red = rejected.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Alert, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Tooltip,
} from '@mui/material';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { configuratorService } from '../../services/configuratorService';
import configuratorV2Service, { ChangeOrderRow, QuoteRevisionRow, SwitchboardRow } from '../../services/configuratorV2Service';

const C = {
  bg: '#000000', surface: '#0B0B0D', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};
const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.6 };
const headSx = { color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderBottom: '1px solid ' + C.border, py: 0.7 };
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

interface BoardQuotes {
  board: SwitchboardRow;
  configurationId: string;
  configCode: string;
  revisions: QuoteRevisionRow[];
  changeOrders: ChangeOrderRow[];
}

/** Status chip for change orders. */
const CoStatusChip: React.FC<{ co: ChangeOrderRow }> = ({ co }) => {
  if (co.status === 'pending_approval') {
    return (
      <Chip
        label="Pending approval"
        size="small"
        sx={{ bgcolor: 'rgba(217,119,6,0.15)', border: '1px solid ' + C.amber, color: C.amber, fontSize: 9.5, height: 17 }}
      />
    );
  }
  if (co.status === 'applied') {
    return (
      <Chip
        label="Applied"
        size="small"
        sx={{ bgcolor: 'rgba(34,197,94,0.12)', border: '1px solid ' + C.green, color: C.green, fontSize: 9.5, height: 17 }}
      />
    );
  }
  if (co.status === 'rejected') {
    return (
      <Tooltip title={co.rejected_reason ? 'Reason: ' + co.rejected_reason : 'No reason provided'} arrow>
        <Chip
          label="Rejected"
          size="small"
          sx={{ bgcolor: 'rgba(239,68,68,0.12)', border: '1px solid ' + C.red, color: C.red, fontSize: 9.5, height: 17, cursor: 'help' }}
        />
      </Tooltip>
    );
  }
  return (
    <Chip
      label={co.status}
      size="small"
      sx={{ bgcolor: 'transparent', border: '1px solid ' + C.border, color: C.sub, fontSize: 9.5, height: 17 }}
    />
  );
};

const V2QuotationsPanel: React.FC<{ projectId: string; onChanged?: () => void }> = ({ projectId, onChanged }) => {
  const [groups, setGroups] = useState<BoardQuotes[]>([]);
  const [configIds, setConfigIds] = useState<{ id: string; code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Approve confirm dialog
  const [approveTarget, setApproveTarget] = useState<ChangeOrderRow | null>(null);
  // Reject dialog
  const [rejectTarget, setRejectTarget] = useState<ChangeOrderRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');

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
          const changeOrders = await configuratorV2Service.listChangeOrders(b.id).catch(() => []);
          if (revisions.length || changeOrders.length) {
            out.push({ board: b, configurationId: cfg.id, configCode: (cfg as any).code ?? '', revisions, changeOrders });
          }
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

  const handleApprove = async () => {
    if (!approveTarget) return;
    setBusy(approveTarget.id);
    setApproveTarget(null);
    try {
      await configuratorV2Service.approveChangeOrder(approveTarget.id);
      setInfo('Change order approved — board unlocked for re-engineering.');
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Approval failed');
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    setBusy(id);
    setRejectTarget(null);
    try {
      await configuratorV2Service.rejectChangeOrder(id, rejectReason.trim());
      setInfo('Change order rejected — board remains frozen.');
      setRejectReason('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Rejection failed');
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
          No Designer quotations issued yet — open Configuration -&gt; Designer, design a board and issue a quote.
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

          {g.revisions.length > 0 && (
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
                          {busy === r.id ? 'Confirming...' : 'Accept & hand off'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Change order list */}
          {g.changeOrders.length > 0 && (
            <Box sx={{ borderTop: g.revisions.length > 0 ? '1px solid ' + C.border : undefined }}>
              <Typography sx={{ color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, px: 2, pt: 1, pb: 0.5 }}>
                CHANGE ORDERS
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={headSx}>REASON</TableCell>
                    <TableCell sx={headSx}>ORIGIN</TableCell>
                    <TableCell sx={headSx}>STATUS</TableCell>
                    <TableCell sx={headSx}>DATE</TableCell>
                    <TableCell sx={headSx} align="right">ACTIONS</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {g.changeOrders.map((co) => (
                    <TableRow key={co.id}>
                      <TableCell sx={{ ...cellSx, maxWidth: 260 }}>
                        <Typography sx={{ color: C.text, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {co.reason}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, color: C.sub }}>{co.originator}</TableCell>
                      <TableCell sx={cellSx}><CoStatusChip co={co} /></TableCell>
                      <TableCell sx={{ ...cellSx, color: C.sub }}>{new Date(co.created_at).toLocaleDateString()}</TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: 'nowrap' }} align="right">
                        {co.status === 'pending_approval' && (
                          <>
                            <Button
                              size="small"
                              disabled={busy === co.id}
                              variant="contained"
                              onClick={() => setApproveTarget(co)}
                              sx={{
                                bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontSize: 10.5,
                                fontWeight: 700, mr: 0.75,
                                '&:hover': { bgcolor: '#00a8d4' },
                              }}
                            >
                              Approve &amp; apply
                            </Button>
                            <Button
                              size="small"
                              disabled={busy === co.id}
                              variant="outlined"
                              onClick={() => { setRejectTarget(co); setRejectReason(''); }}
                              sx={{
                                color: C.red, borderColor: C.red, textTransform: 'none', fontSize: 10.5,
                                '&:hover': { bgcolor: 'rgba(239,68,68,0.08)', borderColor: C.red },
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>
      ))}

      {/* Approve confirm dialog */}
      <Dialog open={Boolean(approveTarget)} onClose={() => setApproveTarget(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: C.surface, border: '1px solid ' + C.border, backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: C.text, fontSize: 15, fontWeight: 700 }}>Approve change order</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: C.sub, fontSize: 12.5 }}>
            This unlocks the board for re-engineering and links the revision chain. The design can be
            re-quoted once updated.
          </Typography>
          {approveTarget && (
            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: C.bg, borderRadius: '8px', border: '1px solid ' + C.border }}>
              <Typography sx={{ color: C.text, fontSize: 12 }}>{approveTarget.reason}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApproveTarget(null)} sx={{ color: C.sub, textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleApprove}
            sx={{ bgcolor: C.blue, color: '#06151c', textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: '#00a8d4' } }}
          >
            Approve &amp; apply
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { bgcolor: C.surface, border: '1px solid ' + C.border, backgroundImage: 'none' } }}>
        <DialogTitle sx={{ color: C.text, fontSize: 15, fontWeight: 700 }}>Reject change order</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: C.sub, fontSize: 12, mb: 1.5 }}>
            The board will remain frozen. Optionally provide a reason.
          </Typography>
          <TextField
            autoFocus fullWidth multiline minRows={2} placeholder="Reason (optional)"
            value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { bgcolor: C.bg, color: C.text, fontSize: 13, '& fieldset': { borderColor: C.border } }, '& textarea': { color: C.text } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectTarget(null)} sx={{ color: C.sub, textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="outlined"
            onClick={handleReject}
            sx={{ color: C.red, borderColor: C.red, textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: 'rgba(239,68,68,0.08)', borderColor: C.red } }}
          >
            Confirm reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default V2QuotationsPanel;
