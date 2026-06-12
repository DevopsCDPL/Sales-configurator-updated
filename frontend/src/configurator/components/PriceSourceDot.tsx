import React from 'react';
import { Box, Tooltip } from '@mui/material';

const LABELS: Record<string, string> = {
  'vendor-import': 'Vendor-negotiated price (imported)',
  'rfq': 'Firm RFQ price from vendor',
  'web': 'Approximate web price',
  'manual': 'Manually entered',
};

const COLORS: Record<string, string> = {
  'vendor-import': '#00c8ff',
  'rfq': '#22C55E',
  'web': '#D97706',
  'manual': '#94A3B8',
};

export default function PriceSourceDot({ source }: { source?: string | null }) {
  if (!source) return null;
  return (
    <Tooltip title={LABELS[source] ?? source}>
      <Box
        component="span"
        sx={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: '50%',
          mr: 0.5,
          bgcolor: COLORS[source] ?? '#94A3B8',
          verticalAlign: 'middle',
        }}
      />
    </Tooltip>
  );
}
