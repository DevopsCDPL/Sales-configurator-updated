/**
 * QuoteCharts — visual review BEFORE issuing (pie + bars).
 *
 * Left: cost composition donut (material by category + labour +
 * overhead). Right: cost → sell margin bar. Below: revision trend.
 * Dark-theme palette, no gold/yellow.
 */
import React, { useMemo } from 'react';
import { Box, Typography, Stack } from '@mui/material';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, LabelList,
} from 'recharts';
import type { QuotePreviewResponse, QuoteRevisionRow } from '../../services/configuratorV2Service';

const C = {
  surface: '#13131E', border: '#1E2235', text: '#E2E8F0', sub: '#64748B',
};
/** Calm, dark-friendly categorical palette (blue-led, no yellow). */
const PALETTE = ['#00c8ff', '#22C55E', '#8B5CF6', '#06B6D4', '#F472B6', '#94A3B8', '#FB7185', '#34D399'];

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const tooltipStyle = {
  backgroundColor: '#181826', border: '1px solid #2A3050', borderRadius: 8,
  color: '#E2E8F0', fontSize: 12,
};

export const QuoteCharts: React.FC<{ preview: QuotePreviewResponse; revisions: QuoteRevisionRow[] }> = ({ preview, revisions }) => {
  const q = preview.quote;

  const composition = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const r of (preview as any).bomRows ?? []) {
      const v = (Number(r.unit_cost) || 0) * (Number(r.quantity) || 0);
      if (v <= 0) continue;
      const k = String(r.category ?? 'OTHER');
      byCat.set(k, (byCat.get(k) ?? 0) + v);
    }
    const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
    const top = cats.slice(0, 5);
    const other = cats.slice(5).reduce((a, [, v]) => a + v, 0);
    const labour = Object.values(q.labor_costs).reduce((a, b) => a + b, 0);
    const segs = [
      ...top.map(([k, v]) => ({ name: k, value: Math.round(v) })),
      ...(other > 0 ? [{ name: 'OTHER MATERIAL', value: Math.round(other) }] : []),
      ...(labour > 0 ? [{ name: 'LABOUR', value: Math.round(labour) }] : []),
      { name: 'OVERHEAD', value: Math.round(q.totals.overhead_amount) },
    ];
    return segs.filter((s) => s.value > 0);
  }, [preview, q]);

  const marginData = useMemo(() => ([
    { name: 'Cost', cost: Math.round(q.total_cost), profit: 0 },
    { name: 'Sell', cost: Math.round(q.total_cost), profit: Math.round(q.pricing.actual_profit) },
  ]), [q]);

  const revData = useMemo(() =>
    [...revisions].reverse().map((r) => ({
      name: 'R' + r.revision,
      sell: Math.round(r.grand_total),
      gm: Math.round(r.margin_pct * 1000) / 10,
    })), [revisions]);

  return (
    <Box sx={{ bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', p: 2, mt: 2 }}>
      <Typography sx={{ color: '#CBD5E1', fontSize: 13, fontWeight: 600, mb: 1 }}>
        Quote review — where the money goes
      </Typography>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2}>
        {/* Cost composition donut */}
        <Box sx={{ width: 360, height: 240, minWidth: 300 }}>
          <Typography sx={{ color: C.sub, fontSize: 11, mb: 0.5 }}>COST COMPOSITION</Typography>
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie
                data={composition} dataKey="value" nameKey="name"
                innerRadius={50} outerRadius={80} paddingAngle={2} stroke="none"
              >
                {composition.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [usd(Number(v)), n]} />
            </PieChart>
          </ResponsiveContainer>
        </Box>
        {/* Legend */}
        <Box sx={{ alignSelf: 'center', minWidth: 180 }}>
          {composition.map((s, i) => (
            <Stack key={s.name} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: PALETTE[i % PALETTE.length] }} />
              <Typography sx={{ color: C.text, fontSize: 11.5, flex: 1 }}>{s.name}</Typography>
              <Typography sx={{ color: C.sub, fontSize: 11.5 }}>{usd(s.value)}</Typography>
            </Stack>
          ))}
        </Box>
        {/* Margin bar */}
        <Box sx={{ width: 300, height: 240, minWidth: 260 }}>
          <Typography sx={{ color: C.sub, fontSize: 11, mb: 0.5 }}>
            COST → SELL · GM {(q.pricing.actual_gm * 100).toFixed(1)}%
          </Typography>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={marginData} barSize={56}>
              <CartesianGrid stroke="#1E2235" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: '#1E2235' }} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => '$' + (v / 1000) + 'k'} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => [usd(Number(v)), n === 'cost' ? 'Cost' : 'Profit']} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="cost" stackId="a" fill="#00c8ff" radius={[0, 0, 4, 4]} />
              <Bar dataKey="profit" stackId="a" fill="#22C55E" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="profit" position="top" formatter={(v: any) => (Number(v) ? '+' + usd(Number(v)) : '')} style={{ fill: '#86EFAC', fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Box>
        {/* Revision trend */}
        {revData.length > 1 && (
          <Box sx={{ width: 300, height: 240, minWidth: 260 }}>
            <Typography sx={{ color: C.sub, fontSize: 11, mb: 0.5 }}>REVISION TREND (SELL $ / GM %)</Typography>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={revData} barSize={32}>
                <CartesianGrid stroke="#1E2235" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 11 }} axisLine={{ stroke: '#1E2235' }} tickLine={false} />
                <YAxis tick={{ fill: '#64748B', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => '$' + (v / 1000) + 'k'} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => (n === 'sell' ? [usd(Number(v)), 'Sell'] : [v + '%', 'GM'])} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="sell" fill="#00c8ff" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="gm" position="top" formatter={(v: any) => v + '%'} style={{ fill: '#94A3B8', fontSize: 10 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Stack>
    </Box>
  );
};

export default QuoteCharts;
