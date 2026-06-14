/**
 * SeedStandardsBanner (Standards Phase 4) — internal-only warning that some
 * engineering-standards values are still unverified SEED defaults (no tenant
 * version saved). Shown on BOM and Pricing; never on the client proposal.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Box } from '@mui/material';
import configuratorV2Service, { StandardsSeedStatus } from '../../services/configuratorV2Service';

interface Props {
  scope?: 'cost' | 'all';
  onLoaded?: (s: StandardsSeedStatus) => void;
  sx?: object;
}

const KEY_LABEL: Record<string, string> = {
  copper_grades: 'copper grade/density', copper_cost: 'copper cost',
  copper_estimator: 'copper estimator', ground_bus: 'ground bus',
  enclosure_costing: 'enclosure costing', load_calc: 'load calc',
  breaker_rules: 'breaker rules', termination_factors: 'terminations',
  proposal_settings: 'proposal settings', bus_schedule: 'bus schedule',
  frame_library: 'frame library', packing_settings: 'packing',
  safety_items_map: 'safety items',
};

export default function SeedStandardsBanner({ scope = 'cost', onLoaded, sx }: Props) {
  const [status, setStatus] = useState<StandardsSeedStatus | null>(null);
  useEffect(() => {
    let alive = true;
    configuratorV2Service.getStandardsSeedStatus(scope)
      .then((s) => { if (alive) { setStatus(s); onLoaded?.(s); } })
      .catch(() => { /* non-blocking */ });
    return () => { alive = false; };
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!status || status.verified || !status.seedKeys.length) return null;
  const names = status.seedKeys.map((k) => KEY_LABEL[k] ?? k);
  const shown = names.slice(0, 6).join(', ');
  const more = names.length > 6 ? ` +${names.length - 6} more` : '';
  const n = status.seedKeys.length;
  return (
    <Alert
      severity="warning"
      sx={{
        mb: 2, bgcolor: 'rgba(217,119,6,0.10)', color: '#FBBF24',
        border: '1px solid #3a2d12', fontSize: 12,
        '& .MuiAlert-icon': { color: '#D97706' }, ...sx,
      }}
    >
      <Box sx={{ fontWeight: 700, mb: 0.3 }}>
        {n} engineering-standards value{n > 1 ? 's are' : ' is'} unverified seed default{n > 1 ? 's' : ''}
      </Box>
      <Box sx={{ opacity: 0.85 }}>
        Used as provisional in this costing until confirmed on the Standards page: {shown}{more}.
      </Box>
    </Alert>
  );
}
