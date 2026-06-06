import React, { useState } from 'react';
import {
  Box, Typography, Card, Button, Chip, alpha, Tooltip, IconButton, Select, MenuItem,
} from '@mui/material';
import {
  TrendingUp as TrendUpIcon, TrendingDown as TrendDownIcon,
  Warning as WarningIcon, AutoAwesome as AIIcon, OpenInNew as OpenIcon,
} from '@mui/icons-material';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Cell,
  ReferenceLine, ReferenceDot,
} from 'recharts';
import dayjs from 'dayjs';

// ─── Design Tokens ──────────────────────────────────────────────────
const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
  pink: '#EC4899', indigo: '#1F7A63', cyan: '#06B6D4',
};

// ─── AI Suggestion Cards ────────────────────────────────────────────
const AI_SUGGESTIONS = [
  {
    id: 1, severity: 'warning',
    title: 'Churn risk detected for 3 companies',
    desc: 'Bajaj Auto, Godrej Industries, and Ashok Leyland have decreased usage by 40%+ in the last 30 days.',
    action: 'View At-Risk', gradient: `linear-gradient(135deg, ${alpha(T.red, 0.15)}, ${alpha(T.amber, 0.15)})`,
    borderColor: T.red, icon: '⚠️',
  },
  {
    id: 2, severity: 'success',
    title: 'User growth up 23% this quarter',
    desc: 'Q1 2026 saw 847 new user registrations, the highest growth quarter in platform history.',
    action: 'View Growth', gradient: `linear-gradient(135deg, ${alpha(T.green, 0.15)}, ${alpha(T.teal, 0.15)})`,
    borderColor: T.green, icon: '📈',
  },
  {
    id: 3, severity: 'info',
    title: '5 companies approaching plan limits',
    desc: 'These companies are at 85%+ of their plan usage. Consider reaching out for upgrades.',
    action: 'Review Plans', gradient: `linear-gradient(135deg, ${alpha(T.blue, 0.15)}, ${alpha(T.purple, 0.15)})`,
    borderColor: T.blue, icon: '📊',
  },
  {
    id: 4, severity: 'insight',
    title: 'Enterprise plan has highest retention',
    desc: '94% retention rate for Enterprise vs 72% for Starter. Consider incentivizing upgrades.',
    action: 'See Details', gradient: `linear-gradient(135deg, ${alpha(T.purple, 0.15)}, ${alpha(T.pink, 0.15)})`,
    borderColor: T.purple, icon: '💡',
  },
];

// ─── Cohort Retention Heatmap Data ──────────────────────────────────
const COHORT_MONTHS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];
const RETENTION_PERIODS = ['Month 0', 'Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5'];
const COHORT_DATA: number[][] = [
  [100, 85, 72, 65, 58, 52],
  [100, 82, 70, 63, 55, 0],
  [100, 88, 76, 68, 0, 0],
  [100, 86, 74, 0, 0, 0],
  [100, 90, 0, 0, 0, 0],
  [100, 0, 0, 0, 0, 0],
];

// ─── Funnel Data ────────────────────────────────────────────────────
const FUNNEL_DATA = [
  { stage: 'Trial', count: 1200, pct: 100, color: T.blue },
  { stage: 'Active', count: 960, pct: 80, color: T.teal },
  { stage: 'Paid', count: 720, pct: 60, color: T.purple },
  { stage: 'Renewed', count: 576, pct: 48, color: T.green },
];

// ─── Anomaly Timeline ───────────────────────────────────────────────
const ANOMALY_TIMELINE = [
  { date: 'Mar 1', value: 120, isAnomaly: false },
  { date: 'Mar 5', value: 135, isAnomaly: false },
  { date: 'Mar 10', value: 128, isAnomaly: false },
  { date: 'Mar 15', value: 310, isAnomaly: true, note: 'Marketing campaign launch — 2.4x spike' },
  { date: 'Mar 20', value: 145, isAnomaly: false },
  { date: 'Mar 25', value: 42, isAnomaly: true, note: 'Server outage — 70% drop' },
  { date: 'Apr 1', value: 155, isAnomaly: false },
  { date: 'Apr 5', value: 162, isAnomaly: false },
  { date: 'Apr 10', value: 170, isAnomaly: false },
];

// ─── Sparkline Key Metrics ──────────────────────────────────────────
const SPARKLINE_METRICS = [
  { label: 'DAU', value: '1,247', change: 5.3, data: [80, 85, 82, 90, 88, 95, 100, 98, 105, 110, 108, 115] },
  { label: 'Avg Session', value: '24m', change: -2.1, data: [28, 26, 25, 27, 24, 23, 25, 24, 23, 24, 24, 24] },
  { label: 'API Calls', value: '45.2K', change: 18.7, data: [30, 32, 35, 33, 38, 40, 42, 41, 43, 44, 45, 45] },
  { label: 'Error Rate', value: '0.12%', change: -0.05, data: [0.2, 0.18, 0.15, 0.14, 0.16, 0.13, 0.12, 0.14, 0.13, 0.12, 0.12, 0.12] },
  { label: 'NPS Score', value: '72', change: 4, data: [65, 66, 67, 68, 68, 69, 70, 70, 71, 71, 72, 72] },
  { label: 'Revenue/User', value: '₹1,695', change: 8.2, data: [1400, 1420, 1450, 1480, 1500, 1520, 1560, 1590, 1620, 1650, 1680, 1695] },
];

const getHeatColor = (value: number): string => {
  if (value === 0) return '#F8FAFC';
  if (value >= 90) return T.teal;
  if (value >= 75) return alpha(T.teal, 0.7);
  if (value >= 60) return alpha(T.teal, 0.5);
  if (value >= 45) return alpha(T.amber, 0.6);
  return alpha(T.red, 0.5);
};

const MiniSparkline: React.FC<{ data: number[]; color: string; height?: number }> = ({ data, color, height = 32 }) => {
  const sparkData = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color.replace('#', '')})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

const PlatformInsightsPage: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('quarter');

  return (
    <Box>
      {/* ── Page Header ── */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>Analytics / Insights</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h5" fontWeight={700} color={T.t1}>Insights</Typography>
            <Chip
              icon={<AIIcon sx={{ fontSize: 14 }} />}
              label="AI-Powered"
              size="small"
              sx={{ bgcolor: alpha(T.purple, 0.1), color: T.purple, fontWeight: 600, fontSize: 11, height: 24 }}
            />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: T.t3 }}>
            Last updated: {dayjs().format('MMM D, YYYY h:mm A')}
          </Typography>
          <Select
            size="small"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            sx={{ minWidth: 140, fontSize: 13, bgcolor: T.surface, '& .MuiSelect-select': { py: 0.8 } }}
          >
            <MenuItem value="week" sx={{ fontSize: 13 }}>This Week</MenuItem>
            <MenuItem value="month" sx={{ fontSize: 13 }}>This Month</MenuItem>
            <MenuItem value="quarter" sx={{ fontSize: 13 }}>This Quarter</MenuItem>
            <MenuItem value="year" sx={{ fontSize: 13 }}>This Year</MenuItem>
          </Select>
        </Box>
      </Box>

      {/* ── AI Suggestion Cards ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 3 }}>
        {AI_SUGGESTIONS.map((s) => (
          <Card
            key={s.id}
            sx={{
              p: 2.5, borderRadius: '12px', background: s.gradient,
              border: `1px solid ${alpha(s.borderColor, 0.25)}`,
              boxShadow: 'none', position: 'relative', overflow: 'hidden',
              transition: 'transform 0.15s, box-shadow 0.15s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 8px 24px ${alpha(s.borderColor, 0.15)}` },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
              <Typography sx={{ fontSize: 24 }}>{s.icon}</Typography>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: T.t1, mb: 0.5 }}>{s.title}</Typography>
                <Typography sx={{ fontSize: 12.5, color: T.t2, lineHeight: 1.5 }}>{s.desc}</Typography>
              </Box>
            </Box>
            <Button
              size="small"
              endIcon={<OpenIcon sx={{ fontSize: 14 }} />}
              sx={{
                textTransform: 'none', fontSize: 12, fontWeight: 600, color: s.borderColor,
                bgcolor: alpha(s.borderColor, 0.1), borderRadius: '6px', px: 1.5, py: 0.5,
                '&:hover': { bgcolor: alpha(s.borderColor, 0.2) },
              }}
            >
              {s.action}
            </Button>
          </Card>
        ))}
      </Box>

      {/* ── Key Metrics with Sparklines ── */}
      <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', mb: 3 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600, color: T.t1, mb: 2 }}>Key Metrics</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' }, gap: 2 }}>
          {SPARKLINE_METRICS.map((m, i) => {
            const isPositiveGood = !['Error Rate', 'Avg Session'].includes(m.label) ? m.change > 0 : m.change < 0;
            const sparkColor = isPositiveGood ? T.teal : T.red;
            return (
              <Box key={m.label} sx={{ p: 1.5, borderRadius: '10px', bgcolor: alpha(T.teal, 0.02), border: `1px solid ${T.borderSubtle}` }}>
                <Typography sx={{ fontSize: 11, color: T.t3, fontWeight: 500, mb: 0.5 }}>{m.label}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 700, color: T.t1 }}>{m.value}</Typography>
                  <Typography sx={{ fontSize: 10, fontWeight: 600, color: isPositiveGood ? T.green : T.red }}>
                    {m.change > 0 ? '+' : ''}{m.change}%
                  </Typography>
                </Box>
                <MiniSparkline data={m.data} color={sparkColor} />
              </Box>
            );
          })}
        </Box>
      </Card>

      {/* ── Row: Cohort Heatmap + Funnel ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 2, mb: 3 }}>
        {/* Cohort Retention Heatmap */}
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: T.t1, mb: 2 }}>Cohort Retention Heatmap</Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: `100px repeat(${RETENTION_PERIODS.length}, 1fr)`, gap: 0.5 }}>
              {/* Header row */}
              <Box sx={{ p: 1 }} />
              {RETENTION_PERIODS.map((p) => (
                <Box key={p} sx={{ p: 1, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 600, color: T.t3, textTransform: 'uppercase' }}>{p}</Typography>
                </Box>
              ))}
              {/* Data rows */}
              {COHORT_DATA.map((row, ri) => (
                <React.Fragment key={ri}>
                  <Box sx={{ p: 1, display: 'flex', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 500, color: T.t2 }}>{COHORT_MONTHS[ri]} '26</Typography>
                  </Box>
                  {row.map((val, ci) => (
                    <Box
                      key={ci}
                      sx={{
                        p: 1, textAlign: 'center', borderRadius: '6px',
                        bgcolor: val === 0 ? '#F8FAFC' : getHeatColor(val),
                        transition: 'transform 0.1s',
                        cursor: val > 0 ? 'pointer' : 'default',
                        '&:hover': val > 0 ? { transform: 'scale(1.05)' } : {},
                      }}
                    >
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: val === 0 ? T.t3 : val >= 60 ? '#fff' : T.t1 }}>
                        {val > 0 ? `${val}%` : '—'}
                      </Typography>
                    </Box>
                  ))}
                </React.Fragment>
              ))}
            </Box>
          </Box>
        </Card>

        {/* Funnel Chart */}
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: T.t1, mb: 2 }}>Conversion Funnel</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
            {FUNNEL_DATA.map((stage, i) => (
              <Box key={stage.stage}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.t1 }}>{stage.stage}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: T.t1 }}>{stage.count.toLocaleString()}</Typography>
                    <Typography sx={{ fontSize: 11, color: T.t3 }}>({stage.pct}%)</Typography>
                  </Box>
                </Box>
                <Box sx={{ position: 'relative', height: 28, borderRadius: '6px', bgcolor: alpha(stage.color, 0.08), overflow: 'hidden' }}>
                  <Box
                    sx={{
                      position: 'absolute', top: 0, left: 0, height: '100%',
                      width: `${stage.pct}%`, borderRadius: '6px',
                      bgcolor: stage.color, transition: 'width 0.5s ease',
                    }}
                  />
                </Box>
                {i < FUNNEL_DATA.length - 1 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', my: 0.5 }}>
                    <Typography sx={{ fontSize: 10, color: T.t3, fontWeight: 500 }}>
                      ↓ {Math.round((FUNNEL_DATA[i + 1].count / stage.count) * 100)}% conversion
                    </Typography>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Card>
      </Box>

      {/* ── Trend Anomaly Timeline ── */}
      <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: T.t1 }}>Trend Anomaly Timeline</Typography>
          <Chip label="Anomalies highlighted" size="small" sx={{ bgcolor: alpha(T.amber, 0.1), color: T.amber, fontSize: 11, fontWeight: 600, height: 24 }} />
        </Box>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={ANOMALY_TIMELINE} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="anomalyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.blue} stopOpacity={0.2} />
                <stop offset="100%" stopColor={T.blue} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={T.borderSubtle} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: T.t3 }} axisLine={false} tickLine={false} />
            <RTooltip
              contentStyle={{ borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <Box sx={{ p: 1.5, bgcolor: 'var(--bg-surface)', borderRadius: '8px', border: `1px solid ${T.border}`, boxShadow: 'none' }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{d.date}</Typography>
                    <Typography sx={{ fontSize: 12, color: T.t2 }}>Activity: {d.value}</Typography>
                    {d.isAnomaly && (
                      <Typography sx={{ fontSize: 11, color: T.amber, fontWeight: 600, mt: 0.5 }}>
                        ⚠ {d.note}
                      </Typography>
                    )}
                  </Box>
                );
              }}
            />
            <Area type="monotone" dataKey="value" stroke={T.blue} strokeWidth={2} fill="url(#anomalyGrad)" dot={false} />
            {ANOMALY_TIMELINE.filter((d) => d.isAnomaly).map((d) => (
              <ReferenceDot
                key={d.date}
                x={d.date} y={d.value}
                r={6} fill={T.amber} stroke="#fff" strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
        {/* Anomaly annotations */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
          {ANOMALY_TIMELINE.filter((d) => d.isAnomaly).map((d) => (
            <Box
              key={d.date}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                borderRadius: '8px', bgcolor: alpha(T.amber, 0.08), border: `1px solid ${alpha(T.amber, 0.2)}`,
              }}
            >
              <WarningIcon sx={{ fontSize: 14, color: T.amber }} />
              <Typography sx={{ fontSize: 11, color: T.t2 }}>
                <Box component="span" fontWeight={600}>{d.date}:</Box> {d.note}
              </Typography>
            </Box>
          ))}
        </Box>
      </Card>
    </Box>
  );
};

export default PlatformInsightsPage;
