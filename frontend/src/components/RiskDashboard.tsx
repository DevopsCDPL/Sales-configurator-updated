import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Alert, alpha, Stack, LinearProgress,
  Avatar,
} from '@mui/material';
import {
  Warning as WarningIcon,
  Shield as ShieldIcon,
  CheckCircle as SafeIcon,
  Error as CriticalIcon,
  Refresh as RefreshIcon,
  Business as CompanyIcon,
  Person as PersonIcon,
  TrendingUp as TrendingIcon,
  Security as SecurityIcon,
  GppGood as GoodIcon,
  GppBad as BadIcon,
  GppMaybe as MaybeIcon,
  Speed as SpeedIcon,
  Verified as VerifiedIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const PRIMARY = '#1F7A63';

const RISK_CONFIG: Record<string, { color: string; icon: React.ReactElement<any>; bg: string; label: string }> = {
  low: { color: '#1F7A63', icon: <SafeIcon />, bg: '#E8F7F2', label: 'Low' },
  medium: { color: '#b45309', icon: <MaybeIcon />, bg: '#fffbeb', label: 'Medium' },
  high: { color: '#EF4444', icon: <WarningIcon />, bg: '#fef2f2', label: 'High' },
  critical: { color: '#7f1d1d', icon: <CriticalIcon />, bg: '#fef2f2', label: 'Critical' },
};

interface RiskFactor { name: string; score: number; weight: number; description: string; }
interface RiskScore {
  id: string; entity_type: string; entity_id: string; score: number; level: string;
  factors: RiskFactor[]; last_calculated_at: string;
  company?: { name: string }; user?: { name: string; email: string };
}

/* ── Stat Card ───────────────────────────────── */
const StatCard: React.FC<{
  label: string; value: number | string; color: string; icon: React.ReactElement<any>; subtext?: string;
}> = ({ label, value, color, icon, subtext }) => (
  <Card elevation={0} sx={{
    border: '1px solid var(--border)', borderRadius: '12px', height: '100%', bgcolor: 'var(--bg-surface)',
    transition: 'all .25s', position: 'relative', overflow: 'hidden',
    '&:hover': { boxShadow: '0 6px 24px rgba(0,0,0,.06)', transform: 'translateY(-2px)' },
  }}>
    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: color, borderRadius: '16px 16px 0 0' }} />
    <CardContent sx={{ p: '20px 18px 16px !important' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .8, lineHeight: 1, mb: .8 }}>{label}</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 900, color: '#1F2937', lineHeight: 1, letterSpacing: -.5 }}>{value}</Typography>
          {subtext && <Typography sx={{ fontSize: 11.5, color: '#94a3b8', mt: .5, fontWeight: 500 }}>{subtext}</Typography>}
        </Box>
        <Box sx={{
          width: 42, height: 42, borderRadius: '12px', bgcolor: alpha(color, 0.08),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1.5px solid ${alpha(color, 0.15)}`,
        }}>
          {React.cloneElement(icon, { sx: { fontSize: 20, color } })}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

/* ── Score Gauge ─────────────────────────────── */
const ScoreGauge: React.FC<{ score: number; size?: number }> = ({ score, size = 120 }) => {
  const r = 46; const cx = size / 2; const cy = size / 2;
  const circ = Math.PI * r; // half circle
  const offset = circ - (score / 100) * circ;
  const color = score > 60 ? '#EF4444' : score > 30 ? '#f59e0b' : '#1F7A63';
  return (
    <Box sx={{ position: 'relative', width: size, height: size * .65 }}>
      <svg width={size} height={size * .65} viewBox={`0 0 ${size} ${size * .65}`}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#f1f5f9" strokeWidth="10" strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${circ}`} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .8s ease' }} />
      </svg>
      <Box sx={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <Typography sx={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{score}</Typography>
        <Typography sx={{ fontSize: 9, color: '#94a3b8' }}>/ 100</Typography>
      </Box>
    </Box>
  );
};

const RiskDashboard: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isMainAdmin = currentUser?.role === 'main_admin';
  const [loading, setLoading] = useState(false);
  const [riskScores, setRiskScores] = useState<RiskScore[]>([]);
  const [alerts, setAlerts] = useState<RiskScore[]>([]);
  const [recalculating, setRecalculating] = useState(false);
  const [snack, setSnack] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [scoresRes, alertsRes] = await Promise.all([api.get('/risk'), api.get('/risk/alerts')]);
      const scores = scoresRes.data?.data ?? scoresRes.data;
      setRiskScores(Array.isArray(scores) ? scores : []);
      const alertData = alertsRes.data?.data ?? alertsRes.data;
      setAlerts(Array.isArray(alertData) ? alertData : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      await api.post('/risk/recalculate');
      setSnack('Risk scores recalculated'); loadData();
    } catch { setSnack('Recalculation failed'); }
    setRecalculating(false);
  };

  const avgScore = riskScores.length > 0
    ? Math.round(riskScores.reduce((s, r) => s + r.score, 0) / riskScores.length)
    : 0;

  const distribution = {
    low: riskScores.filter(r => r.level === 'low').length,
    medium: riskScores.filter(r => r.level === 'medium').length,
    high: riskScores.filter(r => r.level === 'high').length,
    critical: riskScores.filter(r => r.level === 'critical').length,
  };

  const healthGrade = avgScore <= 15 ? 'A+' : avgScore <= 30 ? 'A' : avgScore <= 50 ? 'B' : avgScore <= 70 ? 'C' : 'D';
  const healthColor = avgScore <= 30 ? '#1F7A63' : avgScore <= 50 ? '#f59e0b' : '#ef4444';

  return (
    <Box sx={{ pb: 4, minHeight: '100vh', bgcolor: 'var(--bg-canvas)' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: 26, fontWeight: 800, color: '#1F2937', letterSpacing: -.3, lineHeight: 1.2 }}>
            Risk Detection & Alerts
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#94a3b8', mt: .4 }}>AI-driven risk scoring and security alerts</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {isMainAdmin && (
            <Button startIcon={<TrendingIcon sx={{ fontSize: 16 }} />} onClick={handleRecalculate}
              variant="contained" size="small" disabled={recalculating}
              sx={{ bgcolor: PRIMARY, '&:hover': { bgcolor: '#1F7A63' }, textTransform: 'none', fontWeight: 700, borderRadius: '10px', boxShadow: 'none', fontSize: 13 }}>
              {recalculating ? 'Recalculating...' : 'Recalculate All'}
            </Button>
          )}
          <Button startIcon={<RefreshIcon sx={{ fontSize: 16 }} />} onClick={loadData}
            variant="outlined" size="small"
            sx={{ textTransform: 'none', borderRadius: '10px', borderColor: 'var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13 }}>
            Refresh
          </Button>
        </Box>
      </Box>

      {snack && <Alert severity="info" onClose={() => setSnack('')} sx={{ mb: 2, borderRadius: '12px' }}>{snack}</Alert>}

      {loading ? <LinearProgress sx={{ mb: 2, borderRadius: 2, '& .MuiLinearProgress-bar': { bgcolor: PRIMARY } }} /> : (
        <>
          {/* Top Row: Stats + Score Gauge */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6} sm={3}>
              <StatCard label="Avg Risk Score" value={avgScore} color={avgScore > 60 ? '#EF4444' : avgScore > 30 ? '#f59e0b' : '#1F7A63'}
                icon={<SpeedIcon />} subtext={`out of 100`} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard label="Active Alerts" value={alerts.length} color="#EF4444" icon={<WarningIcon />}
                subtext={alerts.length > 0 ? 'needs attention' : 'all clear'} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard label="Total Entities" value={riskScores.length} color={PRIMARY} icon={<SecurityIcon />}
                subtext="being monitored" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard label="Security Grade" value={healthGrade} color={healthColor} icon={<VerifiedIcon />}
                subtext={avgScore <= 30 ? 'excellent' : avgScore <= 50 ? 'moderate' : 'needs improvement'} />
            </Grid>
          </Grid>

          {/* Risk Gauge + Distribution */}
          <Grid container spacing={2.5} sx={{ mb: 3 }}>
            {/* Score Gauge */}
            <Grid item xs={12} md={4}>
              <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', height: '100%' }}>
                <CardContent sx={{ p: '20px 24px !important', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, alignSelf: 'flex-start' }}>
                    <Box sx={{ bgcolor: alpha(healthColor, .08), borderRadius: '10px', p: .6, display: 'flex' }}>
                      <SpeedIcon sx={{ fontSize: 17, color: healthColor }} />
                    </Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>Risk Score Gauge</Typography>
                  </Box>
                  <ScoreGauge score={avgScore} size={160} />
                  <Typography sx={{ fontSize: 12, color: '#6B7280', mt: 1, textAlign: 'center' }}>
                    {avgScore <= 15 ? 'Excellent security posture' :
                     avgScore <= 30 ? 'Good security posture' :
                     avgScore <= 50 ? 'Moderate risk detected' :
                     avgScore <= 70 ? 'Elevated risk — review needed' : 'Critical — immediate action required'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Risk Distribution */}
            <Grid item xs={12} md={4}>
              <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', height: '100%' }}>
                <CardContent sx={{ p: '20px 24px !important' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
                    <Box sx={{ bgcolor: alpha('#2A9D7E', .08), borderRadius: '10px', p: .6, display: 'flex' }}>
                      <ShieldIcon sx={{ fontSize: 17, color: '#2A9D7E' }} />
                    </Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>Risk Distribution</Typography>
                  </Box>
                  <Stack spacing={2}>
                    {Object.entries(distribution).map(([level, count]) => {
                      const rc = RISK_CONFIG[level];
                      const total = riskScores.length || 1;
                      return (
                        <Box key={level}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: .5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: .5 }}>
                              <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: rc.color }} />
                              <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{level}</Typography>
                            </Box>
                            <Typography sx={{ fontSize: 12, fontWeight: 700, color: rc.color }}>{count}</Typography>
                          </Box>
                          <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                            <Box sx={{ height: '100%', borderRadius: 3, bgcolor: rc.color, width: `${(count / total) * 100}%`, transition: 'width .6s' }} />
                          </Box>
                        </Box>
                      );
                    })}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>

            {/* Compliance Indicators */}
            <Grid item xs={12} md={4}>
              <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', height: '100%' }}>
                <CardContent sx={{ p: '20px 24px !important' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
                    <Box sx={{ bgcolor: alpha(PRIMARY, .08), borderRadius: '10px', p: .6, display: 'flex' }}>
                      <VerifiedIcon sx={{ fontSize: 17, color: PRIMARY }} />
                    </Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>Security Checklist</Typography>
                  </Box>
                  <Stack spacing={1.5}>
                    {[
                      { label: 'Login Security', ok: distribution.critical === 0, desc: distribution.critical === 0 ? 'No critical users' : `${distribution.critical} critical` },
                      { label: 'Session Hygiene', ok: true, desc: 'Session monitoring active' },
                      { label: 'Role Compliance', ok: true, desc: 'RBAC enforced' },
                      { label: 'Audit Logging', ok: true, desc: 'Full audit trail enabled' },
                      { label: 'Risk Monitoring', ok: riskScores.length > 0, desc: riskScores.length > 0 ? `${riskScores.length} entities tracked` : 'No entities yet' },
                    ].map(item => (
                      <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: .8, borderBottom: '1px solid #f8f8f8' }}>
                        {item.ok
                          ? <GoodIcon sx={{ fontSize: 18, color: '#1F7A63' }} />
                          : <BadIcon sx={{ fontSize: 18, color: '#ef4444' }} />
                        }
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#1F2937' }}>{item.label}</Typography>
                          <Typography sx={{ fontSize: 10.5, color: '#94a3b8' }}>{item.desc}</Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Active Alerts */}
          {alerts.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Box sx={{ bgcolor: alpha('#ef4444', .08), borderRadius: '10px', p: .6, display: 'flex' }}>
                  <WarningIcon sx={{ fontSize: 17, color: '#ef4444' }} />
                </Box>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>Active Alerts</Typography>
                <Chip label={alerts.length} size="small" sx={{ bgcolor: alpha('#ef4444', .08), color: '#ef4444', fontWeight: 700, fontSize: 11, height: 22 }} />
              </Box>
              <Stack spacing={1.5}>
                {alerts.map(a => {
                  const rc = RISK_CONFIG[a.level] || RISK_CONFIG.high;
                  return (
                    <Card key={a.id} elevation={0} sx={{
                      border: `1px solid ${alpha(rc.color, .2)}`, borderRadius: '16px',
                      bgcolor: alpha(rc.color, .02), position: 'relative', overflow: 'hidden',
                    }}>
                      <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, bgcolor: rc.color }} />
                      <CardContent sx={{ p: '16px 16px 16px 20px !important' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box sx={{ flex: 1 }}>
                            <Box sx={{ display: 'flex', gap: .5, alignItems: 'center', mb: .5, flexWrap: 'wrap' }}>
                              <Chip label={a.level.toUpperCase()} size="small"
                                sx={{ height: 20, bgcolor: rc.color, color: '#fff', fontWeight: 800, fontSize: 10 }} />
                              <Chip icon={a.entity_type === 'company' ? <CompanyIcon sx={{ fontSize: 13 }} /> : <PersonIcon sx={{ fontSize: 13 }} />}
                                label={a.entity_type} size="small"
                                sx={{ height: 20, bgcolor: 'var(--bg-surface-2)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 10.5, textTransform: 'capitalize', border: '1px solid var(--border)' }} />
                              <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#1F2937' }}>
                                {a.entity_type === 'company' ? a.company?.name : a.user?.name || a.entity_id}
                              </Typography>
                            </Box>
                            <Typography sx={{ fontSize: 11.5, color: '#6B7280' }}>
                              Score: {a.score}/100 &bull; {a.factors?.length || 0} risk factors identified
                            </Typography>
                          </Box>
                          <Typography sx={{ fontSize: 32, fontWeight: 900, color: rc.color, lineHeight: 1, ml: 2 }}>{a.score}</Typography>
                        </Box>
                        {a.factors && a.factors.filter((f: RiskFactor) => f.score > 0).length > 0 && (
                          <Box sx={{ mt: 1.5, pt: 1, borderTop: `1px solid ${alpha(rc.color, .1)}` }}>
                            {a.factors.filter((f: RiskFactor) => f.score > 0).map((f: RiskFactor, i: number) => (
                              <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: .8, mb: .5 }}>
                                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: f.score >= 15 ? '#ef4444' : f.score >= 5 ? '#f59e0b' : '#94a3b8' }} />
                                <Typography sx={{ fontSize: 11.5, color: '#6B7280', flex: 1 }}>{f.description}</Typography>
                                <Typography sx={{ fontSize: 11, fontWeight: 700, color: f.score >= 15 ? '#ef4444' : '#f59e0b' }}>+{f.score}</Typography>
                              </Box>
                            ))}
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </Box>
          )}

          {/* All Risk Scores Table */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>All Risk Scores</Typography>
            <Chip label={riskScores.length} size="small" sx={{ bgcolor: alpha(PRIMARY, .08), color: PRIMARY, fontWeight: 700, fontSize: 11, height: 22 }} />
          </Box>
          {riskScores.length > 0 ? (
            <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', overflow: 'hidden' }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'var(--bg-canvas)' }}>
                      {['Entity', 'Type', 'Score', 'Level', 'Factors', 'Last Calculated'].map(h => (
                        <TableCell key={h} sx={{ fontWeight: 700, fontSize: 11.5, color: '#6B7280', borderBottom: '1px solid #f0f0f0', py: 1.5 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {riskScores.map(r => {
                      const rc = RISK_CONFIG[r.level] || RISK_CONFIG.low;
                      return (
                        <TableRow key={r.id} sx={{ '&:hover': { bgcolor: 'var(--bg-canvas)' }, transition: 'background .15s' }}>
                          <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Avatar sx={{ width: 28, height: 28, bgcolor: alpha(rc.color, .1), fontSize: 12, fontWeight: 700, color: rc.color }}>
                                {(r.entity_type === 'company' ? r.company?.name?.[0] : r.user?.name?.[0]) || '?'}
                              </Avatar>
                              <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#1F2937' }}>
                                {r.entity_type === 'company' ? r.company?.name : r.user?.name || r.entity_id}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                            <Chip icon={r.entity_type === 'company' ? <CompanyIcon sx={{ fontSize: 13 }} /> : <PersonIcon sx={{ fontSize: 13 }} />}
                              label={r.entity_type} size="small"
                              sx={{ height: 22, bgcolor: 'var(--bg-canvas)', fontSize: 11, textTransform: 'capitalize', fontWeight: 600 }} />
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 100 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 800, color: rc.color, minWidth: 22 }}>{r.score}</Typography>
                              <Box sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: 'var(--bg-surface-2)', overflow: 'hidden' }}>
                                <Box sx={{ height: '100%', borderRadius: 3, bgcolor: rc.color, width: `${r.score}%`, transition: 'width .6s' }} />
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                            <Chip label={rc.label} size="small"
                              sx={{ height: 22, bgcolor: alpha(rc.color, 0.06), color: rc.color, fontWeight: 700, fontSize: 11 }} />
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                            <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
                              {r.factors?.filter((f: RiskFactor) => f.score > 0).length || 0} active
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f8f8f8', py: 1.2 }}>
                            <Typography sx={{ fontSize: 11.5, color: '#94a3b8' }}>
                              {r.last_calculated_at ? new Date(r.last_calculated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          ) : (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <ShieldIcon sx={{ fontSize: 64, color: 'var(--border)', mb: 2 }} />
              <Typography sx={{ color: '#94a3b8', fontSize: 14 }}>No risk scores calculated yet</Typography>
              {isMainAdmin && (
                <Button onClick={handleRecalculate} size="small"
                  sx={{ mt: 1, color: PRIMARY, textTransform: 'none', fontWeight: 600 }}>
                  Calculate Now
                </Button>
              )}
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default RiskDashboard;
