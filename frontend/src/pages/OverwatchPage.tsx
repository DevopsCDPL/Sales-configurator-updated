import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Grid, Chip, Table, TableHead, TableRow, TableCell,
  TableBody, IconButton, Tooltip, CircularProgress, Button,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { overwatchSummary, OverwatchSummary, overwatchNarrative, OverwatchNarrative, overwatchLlmStatus } from '../services/overwatchService';

/* ── Palette (Overwatch spec) ───────────────────────────── */
const C = {
  bg: '#000000',
  surface: '#0B0B0D',
  border: '#1E2235',
  blue: '#00c8ff',
  sub: '#64748B',
  text: '#E2E8F0',
  title: '#F0F6FF',
  green: '#22C55E',
  amber: '#D97706',
  red: '#EF4444',
};

const STAGE_LABELS: Record<string, string> = {
  draft: 'Draft', configured: 'Configured', drawing_generated: 'Drawing generated',
  estimated: 'Estimated', quoted: 'Quoted', order_confirmed: 'Order confirmed',
  in_production: 'In production', inspected: 'Inspected', shipped: 'Shipped',
  closed: 'Closed', unknown: 'Unknown',
};

const stageLabel = (s: string) => STAGE_LABELS[s] || s.replace(/_/g, ' ');

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtMoney(n: number, ccy: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: ccy || 'USD', maximumFractionDigits: 0,
    }).format(n || 0);
  } catch {
    return `${(n || 0).toLocaleString()} ${ccy || ''}`.trim();
  }
}

/* ── Card shell ─────────────────────────────────────────── */
const Card: React.FC<{ title?: string; children: React.ReactNode; sx?: any }> = ({ title, children, sx }) => (
  <Box sx={{ bgcolor: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', p: 2, height: '100%', ...sx }}>
    {title && (
      <Typography sx={{ color: C.title, fontWeight: 800, fontSize: '0.95rem', mb: 1.5, letterSpacing: '-0.01em' }}>
        {title}
      </Typography>
    )}
    {children}
  </Box>
);

const StatCard: React.FC<{ label: string; value: React.ReactNode; sub?: string }> = ({ label, value, sub }) => (
  <Card sx={{ p: 1.75 }}>
    <Typography sx={{ color: C.sub, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
      {label}
    </Typography>
    <Typography sx={{ color: C.blue, fontSize: '22px', fontWeight: 800, lineHeight: 1.2, mt: 0.5 }}>
      {value}
    </Typography>
    {sub && <Typography sx={{ color: C.sub, fontSize: '0.7rem', mt: 0.25 }}>{sub}</Typography>}
  </Card>
);

const SeverityDot: React.FC<{ severity: 'red' | 'amber' }> = ({ severity }) => {
  const color = severity === 'red' ? C.red : C.amber;
  return (
    <Box sx={{
      width: 9, height: 9, borderRadius: '50%', bgcolor: color, flexShrink: 0,
      boxShadow: `0 0 6px ${color}`, mt: '5px',
    }} />
  );
};

const OverwatchPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<OverwatchSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [narrative, setNarrative] = useState<OverwatchNarrative | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAdmin = user?.role === 'main_admin' || user?.role === 'admin';

  const load = useCallback(async () => {
    try {
      const d = await overwatchSummary();
      setData(d);
      setError(null);
      setRefreshedAt(new Date());
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load Overwatch summary.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    load();
    timerRef.current = setInterval(load, 60000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isAdmin, load]);

  const runNarrative = useCallback(async () => {
    if (!data) return;
    setNarrativeLoading(true);
    try {
      setNarrative(await overwatchNarrative(data));
    } catch (e: any) {
      setNarrative({ enabled: true, error: e?.response?.data?.message || e?.message || 'AI briefing failed' });
    } finally {
      setNarrativeLoading(false);
    }
  }, [data]);

  useEffect(() => {
    if (!isAdmin) return;
    overwatchLlmStatus().then((st) => setLlmEnabled(!!st.enabled)).catch(() => setLlmEnabled(false));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography sx={{ color: C.sub }}>You do not have access to the Overwatch dashboard.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: C.bg, minHeight: '100%' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
        <Box>
          <Typography sx={{ color: C.title, fontWeight: 800, fontSize: '1.5rem', letterSpacing: '-0.02em' }}>
            Overwatch
          </Typography>
          <Typography sx={{ color: C.sub, fontSize: '0.82rem', mt: 0.25 }}>
            Pipeline, procurement and approval risk — owner view
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {refreshedAt && (
            <Typography sx={{ color: C.sub, fontSize: '0.72rem' }}>
              Refreshed {refreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Typography>
          )}
          <Button
            onClick={runNarrative}
            disabled={!data || narrativeLoading}
            size="small"
            variant="outlined"
            sx={{ color: C.blue, borderColor: C.border, textTransform: 'none', fontSize: '0.75rem' }}
          >
            {narrativeLoading ? 'Generating…' : (llmEnabled ? 'AI briefing' : 'AI briefing (set key)')}
          </Button>
          <Tooltip title="Refresh">
            <IconButton onClick={load} size="small" sx={{ color: C.sub, '&:hover': { color: C.blue } }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {narrative && (
        <Box sx={{ bgcolor: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', p: 2, mb: 2.5 }}>
          <Typography sx={{ color: C.title, fontWeight: 800, fontSize: '0.9rem', mb: 1 }}>
            AI briefing{narrative.model ? ` · ${narrative.model}` : ''}
          </Typography>
          {narrative.enabled === false ? (
            <Typography sx={{ color: C.sub, fontSize: '0.8rem' }}>{narrative.reason || 'AI briefing is not configured.'}</Typography>
          ) : narrative.error ? (
            <Typography sx={{ color: C.red, fontSize: '0.8rem' }}>{narrative.error}{narrative.detail ? ` — ${narrative.detail}` : ''}</Typography>
          ) : (
            <Typography component="pre" sx={{ color: C.title, fontWeight: 400, fontSize: '0.82rem', whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0 }}>{narrative.briefing}</Typography>
          )}
        </Box>
      )}

      {loading && !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: C.blue }} />
        </Box>
      ) : error ? (
        <Card><Typography sx={{ color: C.red, fontSize: '0.85rem' }}>{error}</Typography></Card>
      ) : data ? (
        <>
          {/* Top row — 4 stat cards */}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6} md={3}>
              <StatCard label="Projects in pipeline" value={data.pipeline.total} />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard
                label="Issued quote value"
                value={fmtMoney(data.quotes.issuedValue, data.quotes.currency)}
                sub={`${data.quotes.issuedCount} issued`}
              />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard label="Open RFQ parts" value={data.procurement.pendingRfqParts} sub={`${data.procurement.openBatches} open batches`} />
            </Grid>
            <Grid item xs={6} md={3}>
              <StatCard label="Pending approvals" value={data.approvals.pending} />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            {/* Risk board */}
            <Grid item xs={12} md={6}>
              <Card title="Risk board">
                {data.risks.length === 0 ? (
                  <Typography sx={{ color: C.green, fontSize: '0.85rem' }}>
                    No risks flagged — all clear.
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, maxHeight: 320, overflow: 'auto' }}>
                    {data.risks.map((r, i) => (
                      <Box key={`${r.code}-${i}`} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                        <SeverityDot severity={r.severity} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ color: C.text, fontSize: '0.82rem', lineHeight: 1.35 }}>
                            {r.message}
                          </Typography>
                          <Typography sx={{ color: C.sub, fontSize: '0.72rem' }}>
                            {r.entity}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                )}
              </Card>
            </Grid>

            {/* Pipeline */}
            <Grid item xs={12} md={6}>
              <Card title="Pipeline">
                <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1 }}>
                  {data.pipeline.byStage.length === 0 ? (
                    <Typography sx={{ color: C.sub, fontSize: '0.82rem' }}>No projects yet.</Typography>
                  ) : data.pipeline.byStage.map((col) => (
                    <Box key={col.stage} sx={{ minWidth: 150, flexShrink: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
                        <Typography sx={{ color: C.title, fontSize: '0.74rem', fontWeight: 700 }}>
                          {stageLabel(col.stage)}
                        </Typography>
                        <Chip label={col.count} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(0,200,255,0.08)', color: C.blue, fontWeight: 700 }} />
                      </Box>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {col.projects.slice(0, 6).map((p) => (
                          <Box
                            key={p.id}
                            onClick={() => navigate(`/projects/${p.id}`)}
                            sx={{
                              bgcolor: C.bg, border: `1px solid ${C.border}`, borderRadius: '6px',
                              px: 1, py: 0.5, cursor: 'pointer', transition: 'border-color 0.15s',
                              '&:hover': { borderColor: C.blue },
                            }}
                          >
                            <Typography noWrap sx={{ color: C.text, fontSize: '0.72rem' }}>
                              {p.name}
                            </Typography>
                            {p.code && (
                              <Typography noWrap sx={{ color: C.sub, fontSize: '0.62rem' }}>{p.code}</Typography>
                            )}
                          </Box>
                        ))}
                        {col.count > 6 && (
                          <Typography sx={{ color: C.sub, fontSize: '0.65rem' }}>+{col.count - 6} more</Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Card>
            </Grid>

            {/* Procurement watch */}
            <Grid item xs={12} md={6}>
              <Card title="Procurement watch">
                {data.procurement.batches.length === 0 ? (
                  <Typography sx={{ color: C.sub, fontSize: '0.82rem' }}>No open RFQ batches.</Typography>
                ) : (
                  <Table size="small" sx={{ '& td, & th': { borderColor: C.border, color: C.text, fontSize: '0.74rem', py: 0.6 } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ color: `${C.sub} !important`, fontWeight: 700 }}>Code</TableCell>
                        <TableCell sx={{ color: `${C.sub} !important`, fontWeight: 700 }}>Vendor</TableCell>
                        <TableCell sx={{ color: `${C.sub} !important`, fontWeight: 700 }} align="right">Age</TableCell>
                        <TableCell sx={{ color: `${C.sub} !important`, fontWeight: 700 }} align="right">Recv</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.procurement.batches.map((b) => (
                        <TableRow key={b.code}>
                          <TableCell>{b.code}</TableCell>
                          <TableCell sx={{ color: `${C.sub} !important` }}>{b.vendor || '—'}</TableCell>
                          <TableCell align="right" sx={{ color: b.ageDays !== null && b.ageDays > 7 ? `${C.amber} !important` : undefined }}>
                            {b.ageDays !== null ? `${b.ageDays}d` : '—'}
                          </TableCell>
                          <TableCell align="right">{b.received}/{b.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </Grid>

            {/* Recent activity */}
            <Grid item xs={12} md={6}>
              <Card title="Recent activity">
                {data.activity.length === 0 ? (
                  <Typography sx={{ color: C.sub, fontSize: '0.82rem' }}>No recent activity.</Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {data.activity.map((a, i) => (
                      <Box key={i} sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography sx={{ color: C.sub, fontSize: '0.7rem', minWidth: 64 }}>{timeAgo(a.when)}</Typography>
                        <Chip label={a.entity} size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: C.bg, color: C.sub, border: `1px solid ${C.border}` }} />
                        <Typography noWrap sx={{ color: C.text, fontSize: '0.76rem', flex: 1 }}>{a.name}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Card>
            </Grid>
          </Grid>

          {data.warnings.length > 0 && (
            <Typography sx={{ color: C.sub, fontSize: '0.68rem', mt: 2 }}>
              {data.warnings.length} data section(s) degraded; partial results shown.
            </Typography>
          )}
        </>
      ) : null}
    </Box>
  );
};

export default OverwatchPage;
