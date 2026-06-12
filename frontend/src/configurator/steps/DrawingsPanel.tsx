/**
 * DrawingsPanel — Phase E on screen (SolidWorks job queue per board)
 *
 * Enqueue GA/MFG/STEP/copper jobs against the persisted design (payload
 * built server-side, price fields stripped). Jobs are leased by the
 * pull-based Windows agent; status/artifacts stream back here. Until an
 * agent is connected, jobs simply wait in 'queued'.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box, Typography, Stack, Chip, Button, Alert, CircularProgress,
  Table, TableHead, TableRow, TableCell, TableBody, Tooltip,
} from '@mui/material';
import EngineeringRoundedIcon from '@mui/icons-material/EngineeringRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import configuratorV2Service, { SwJobRow } from '../../services/configuratorV2Service';

const C = {
  bg: '#000000', surface: '#13131E', border: '#1E2235', blue: '#00c8ff',
  text: '#E2E8F0', sub: '#64748B', green: '#22C55E', amber: '#D97706', red: '#EF4444',
};

const STATUS_COLOR: Record<string, string> = {
  queued: C.sub, leased: C.amber, running: C.blue,
  succeeded: C.green, failed: C.red, cancelled: C.sub,
};

const JOB_TYPES: { key: 'FULL' | 'DRAWINGS' | 'COPPER_ONLY'; label: string; hint: string }[] = [
  { key: 'DRAWINGS', label: 'Drawings (GA/MFG)', hint: 'General arrangement + manufacturing drawings' },
  { key: 'COPPER_ONLY', label: 'Copper true-up', hint: 'Exact copper weight from the 3D model (pass 2)' },
  { key: 'FULL', label: 'Full package', hint: 'GA + MFG + STEP + copper' },
];

const cellSx = { color: C.text, fontSize: 12, borderBottom: '1px solid ' + C.border, py: 0.7 };
const headSx = { color: C.sub, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, borderBottom: '1px solid ' + C.border, py: 0.7 };

export interface DrawingsPanelProps { switchboardId: string }

const DrawingsPanel: React.FC<DrawingsPanelProps> = ({ switchboardId }) => {
  const [jobs, setJobs] = useState<SwJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setJobs(await configuratorV2Service.listSwJobs(switchboardId));
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [switchboardId]);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 10000); // live-ish refresh
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  const enqueue = async (jobType: 'FULL' | 'DRAWINGS' | 'COPPER_ONLY') => {
    setBusyType(jobType);
    setError(null);
    try {
      const out = await configuratorV2Service.enqueueSwJob(switchboardId, jobType);
      setInfo(out.deduped
        ? 'Identical job already queued — reusing it (payload hash match).'
        : 'Job queued — the SolidWorks agent will pick it up.');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Enqueue failed — is the design accepted?');
    } finally {
      setBusyType(null);
    }
  };

  const cancel = async (id: string) => {
    try { await configuratorV2Service.cancelSwJob(id); await load(); } catch { /* noop */ }
  };

  const hasActive = jobs.some((j) => ['queued', 'leased', 'running'].includes(j.status));

  return (
    <Box sx={{ px: 3, pb: 4 }}>
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2, bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid ' + C.border, fontSize: 12 }}>
          {error}
        </Alert>
      )}
      {info && (
        <Alert severity="info" onClose={() => setInfo(null)} sx={{ mb: 2, bgcolor: 'rgba(0,200,255,0.08)', color: '#93C5FD', border: '1px solid ' + C.border, fontSize: 12 }}>
          {info}
        </Alert>
      )}

      <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {JOB_TYPES.map((t) => (
          <Tooltip key={t.key} title={t.hint}>
            <span>
              <Button
                startIcon={<EngineeringRoundedIcon sx={{ fontSize: 16 }} />}
                disabled={!!busyType}
                onClick={() => enqueue(t.key)}
                sx={{
                  color: C.text, textTransform: 'none', fontSize: 12.5, px: 1.75,
                  border: '1px solid ' + C.border, bgcolor: C.surface,
                  '&:hover': { borderColor: C.blue, bgcolor: 'rgba(0,200,255,0.08)' },
                }}
              >
                {busyType === t.key ? 'Queuing…' : t.label}
              </Button>
            </span>
          </Tooltip>
        ))}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small" startIcon={<RefreshRoundedIcon sx={{ fontSize: 15 }} />} onClick={load}
          sx={{ color: C.sub, textTransform: 'none', fontSize: 12, border: '1px solid ' + C.border }}
        >
          Refresh
        </Button>
      </Stack>

      {!jobs.length && !loading ? (
        <Box sx={{ bgcolor: C.surface, border: '1px dashed ' + C.border, borderRadius: '10px', p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: C.sub, fontSize: 13 }}>
            No drawing jobs yet. Queue one above — the payload is built from the saved design
            (pricing is stripped before anything reaches CAD).
          </Typography>
        </Box>
      ) : (
        <Box sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', overflow: 'hidden' }}>
          {hasActive && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 2, py: 0.75, borderBottom: '1px solid ' + C.border }}>
              <CircularProgress size={12} sx={{ color: C.blue }} />
              <Typography sx={{ color: C.sub, fontSize: 11.5 }}>
                Auto-refreshing every 10 s — waiting on the SolidWorks agent
              </Typography>
            </Stack>
          )}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={headSx}>TYPE</TableCell>
                <TableCell sx={headSx}>STATUS</TableCell>
                <TableCell sx={headSx}>ATTEMPTS</TableCell>
                <TableCell sx={headSx}>PROGRESS</TableCell>
                <TableCell sx={headSx}>ARTIFACTS</TableCell>
                <TableCell sx={headSx}>ERROR</TableCell>
                <TableCell sx={headSx}>QUEUED</TableCell>
                <TableCell sx={headSx} />
              </TableRow>
            </TableHead>
            <TableBody>
              {jobs.map((j) => (
                <TableRow key={j.id}>
                  <TableCell sx={cellSx}>{j.job_type}</TableCell>
                  <TableCell sx={cellSx}>
                    <Chip
                      label={j.status + (j.cancel_requested && ['queued', 'leased', 'running'].includes(j.status) ? ' (cancelling)' : '')}
                      size="small"
                      sx={{ bgcolor: 'transparent', border: '1px solid ' + (STATUS_COLOR[j.status] ?? C.sub), color: STATUS_COLOR[j.status] ?? C.sub, fontSize: 10, height: 18 }}
                    />
                  </TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>{j.attempts}/{j.max_attempts}</TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub }}>
                    {j.progress?.stage ? `${j.progress.stage} ${j.progress.pct != null ? j.progress.pct + '%' : ''}` : '—'}
                  </TableCell>
                  <TableCell sx={cellSx}>
                    {(j.artifacts ?? []).length
                      ? (j.artifacts ?? []).map((a, i) => (
                          <Chip key={i} label={a.type ?? a.name ?? 'file'} size="small" sx={{ mr: 0.5, bgcolor: 'rgba(34,197,94,0.12)', color: '#86EFAC', fontSize: 9.5, height: 18 }} />
                        ))
                      : <Typography component="span" sx={{ color: C.sub, fontSize: 11 }}>—</Typography>}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, color: '#FCA5A5', fontSize: 11, maxWidth: 200 }}>
                    {j.last_error_message ? `${j.last_error_code ?? ''} ${j.last_error_message}`.slice(0, 80) : '—'}
                  </TableCell>
                  <TableCell sx={{ ...cellSx, color: C.sub, whiteSpace: 'nowrap' }}>
                    {j.created_at ? new Date(j.created_at).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell sx={cellSx}>
                    {['queued', 'leased', 'running'].includes(j.status) && !j.cancel_requested && (
                      <Button size="small" onClick={() => cancel(j.id)} sx={{ color: C.red, textTransform: 'none', fontSize: 11, minWidth: 0 }}>
                        Cancel
                      </Button>
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

export default DrawingsPanel;
