/**
 * DesignSummaryCard — shared sticky summary shown alongside both the
 * Section editor tab and the Device picks tab.
 */
import React from 'react';
import { Box, Stack, Typography } from '@mui/material';

const C = {
  surface: '#0B0B0D', border: '#1E2235', text: '#E2E8F0',
};

export interface DesignSummaryCardProps {
  devices: number;
  mains: number;
  feeders: number;
  drawout: number;
  deviceCost: number;
  note?: string;
}

const usdWhole = (n: number) =>
  '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const Row: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
    <Typography sx={{ color: '#A9B6C9', fontSize: 11.5 }}>{label}</Typography>
    <Typography sx={{ color: C.text, fontWeight: 700, fontSize: 12.5 }}>{value}</Typography>
  </Stack>
);

const DesignSummaryCard: React.FC<DesignSummaryCardProps> = ({
  devices, mains, feeders, drawout, deviceCost, note,
}) => (
  <Box
    sx={{
      width: 250, flexShrink: 0,
      position: 'sticky', top: 8,
      bgcolor: C.surface, border: '1px solid ' + C.border, borderRadius: '10px', p: 1.5,
    }}
  >
    <Typography sx={{ color: '#A9B6C9', fontSize: 10.5, letterSpacing: 0.5, mb: 1 }}>
      DESIGN SUMMARY
    </Typography>
    <Row label="Devices" value={devices} />
    <Row label="Mains" value={mains} />
    <Row label="Feeders" value={feeders} />
    <Row label="Drawout" value={drawout} />
    <Row label="Device cost" value={usdWhole(deviceCost)} />
    <Typography sx={{ color: '#8E9AAD', fontSize: 10, mt: 1 }}>
      {note ?? 'Swap any pick — cost updates and the quote is flagged for review.'}
    </Typography>
  </Box>
);

export default DesignSummaryCard;
