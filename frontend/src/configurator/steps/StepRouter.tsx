/**
 * StepRouter — renders the active configurator substep panel.
 *
 * Standard substeps come from `ConfiguratorStepKey` (system_design …
 * sld). One extra UI-only "phantom" substep (`__preview`) is appended
 * on the chip strip in `ConfigurationTab` and rendered here. The legacy
 * `__quotation` sub-step was removed — the parent 12-step workflow
 * "Quotation" tab is now the single source of truth for compile + PDF.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import type { ConfiguratorStepKey } from '../../services/configuratorService';
import { STEP_CATEGORY_MAP } from './stepCategoryMap';
import SystemDesignStep from './SystemDesignStep';
import CategoryComponentPicker from './CategoryComponentPicker';
import PlusCompStep from './PlusCompStep';
import SLDStep from './SLDStep';
import PreviewStep from './PreviewStep';

export type ConfiguratorPhantomStepKey = '__preview';
export type ConfiguratorSubstepKey = ConfiguratorStepKey | ConfiguratorPhantomStepKey;

interface Props {
  stepKey: ConfiguratorSubstepKey;
}

const StepRouter: React.FC<Props> = ({ stepKey }) => {
  if (stepKey === '__preview') return <PreviewStep />;
  if (stepKey === 'system_design') return <SystemDesignStep />;
  if (stepKey === 'plus_comp') return <PlusCompStep />;
  if (stepKey === 'sld') return <SLDStep />;

  const meta = STEP_CATEGORY_MAP[stepKey];
  if (!meta?.categories || meta.categories.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-muted, #8b93a3)' }}>
          Step not yet implemented.
        </Typography>
      </Box>
    );
  }

  return <CategoryComponentPicker stepKey={stepKey} categories={meta.categories} />;
};

export default StepRouter;
