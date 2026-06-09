/**
 * ConfiguratorShell
 * ════════════════════════════════════════════════════════════════════════
 * Wraps the active configuration with:
 *   1. A scoped MUI ThemeProvider (Lightning Blue, dark mode) — applied
 *      ONLY to this subtree per the Phase 4 scoping constraint.
 *   2. The ConfiguratorProvider (state, autosave, pipeline, intelligence).
 *   3. The substep chip strip + step body via StepRouter.
 *   4. The ProjectFlowFooter (Save / Back / Next / autosave hint).
 *
 * `installThemeVariables('dark')` is intentionally NOT invoked here —
 * doing so would flip the entire app's CSS variables. The scoped MUI
 * theme is enough for primitive MUI surfaces; legacy `var(--bg-surface)`
 * references on inner Forge components will continue to read the light
 * variables, which is the desired Phase 4 behaviour (global flip is a
 * later phase).
 */
import React, { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Stack,
  ThemeProvider,
  alpha,
  useTheme,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { extendMuiTheme, LIGHTNING_BLUE } from '../../config/themeTokens';
import type { Configuration } from '../../services/configuratorService';
import type { ConfiguratorStepKey } from '../../services/configuratorService';
import { ConfiguratorProvider } from '../state/ConfiguratorProvider';
import StepRouter, { type ConfiguratorSubstepKey } from './StepRouter';
import { ProjectFlowFooter } from '../../components/ProjectTabs/ProjectFlowFooter';

export const STANDARD_KEYS: ConfiguratorStepKey[] = [
  'system_design',
  'enclosure',
  'bussing',
  'glastic',
  'cam_lock_panel',
  'spd_ats',
  'controls',
  'ct_vt_cpt',
  'conduit_fittings',
  'wire_cable',
  'standard_bom',
  'labour',
  'plus_comp',
  'sld',
];

export const SUBSTEP_LABELS: Record<ConfiguratorSubstepKey, string> = {
  system_design: 'System Design',
  enclosure: 'Enclosure',
  bussing: 'Bussing',
  glastic: 'Glastic',
  cam_lock_panel: 'Cam Lock',
  spd_ats: 'SPD / ATS',
  controls: 'Controls',
  ct_vt_cpt: 'CT / VT / CPT',
  conduit_fittings: 'Conduit',
  wire_cable: 'Wire & Cable',
  standard_bom: 'Standard BOM',
  labour: 'Labour',
  plus_comp: '+ Comp',
  sld: 'SLD',
  __preview: 'Preview',
};

export interface ConfiguratorShellProps {
  configuration: Configuration;
  onPersist?: (next: Configuration) => void;
  onBack?: () => void;
  onNext?: () => void;
  /** Controlled substep — if provided the parent owns the selection state */
  activeSubstep?: ConfiguratorSubstepKey;
  onSubstepChange?: (key: ConfiguratorSubstepKey) => void;
}

/** @internal */
type Props = ConfiguratorShellProps;

const InnerShell: React.FC<Props> = ({ configuration, onPersist, onBack, onNext, activeSubstep: controlledSubstep, onSubstepChange }) => {
  const [internalSubstep, setInternalSubstep] = useState<ConfiguratorSubstepKey>('system_design');
  const isControlled = controlledSubstep !== undefined && onSubstepChange !== undefined;
  const activeSubstep = isControlled ? controlledSubstep : internalSubstep;
  const setActiveSubstep = isControlled ? onSubstepChange : setInternalSubstep;

  const orderedSubsteps = useMemo<ConfiguratorSubstepKey[]>(
    () => [...STANDARD_KEYS, '__preview'],
    []
  );

  return (
    <ConfiguratorProvider configuration={configuration} onPersist={onPersist}>
      {/* Pure-black canvas with subtle border — no decorative shadows or
          gradients. The inner step (e.g. SystemDesignStep) owns its own
          card styling so this wrapper stays transparent. */}
      <Box
        sx={{
          bgcolor: 'transparent',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 0 }}>
          {/* Chip strip only renders when NOT in controlled mode (parent renders it) */}
          {!isControlled && (
            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                flexWrap: 'wrap',
                gap: 0.75,
                px: 2,
                py: 1.25,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              {orderedSubsteps.map((key) => {
                const isPhantom = key === '__preview';
                const active = key === activeSubstep;
                const accent = LIGHTNING_BLUE[500];
                return (
                  <Chip
                    key={key}
                    size="small"
                    icon={
                      key === '__preview' ? (
                        <VisibilityIcon sx={{ fontSize: 14 }} />
                      ) : undefined
                    }
                    label={SUBSTEP_LABELS[key]}
                    onClick={() => setActiveSubstep(key)}
                    sx={{
                      cursor: 'pointer',
                      fontWeight: active ? 700 : 500,
                      fontSize: '0.74rem',
                      border: `1px solid ${active ? accent : 'rgba(255,255,255,0.07)'}`,
                      bgcolor: active
                        ? accent
                        : isPhantom
                        ? alpha(accent, 0.05)
                        : 'transparent',
                      color: active ? '#ffffff' : 'rgba(217,228,251,0.78)',
                      borderRadius: '8px',
                      '&:hover': { bgcolor: active ? accent : 'rgba(255,255,255,0.04)' },
                    }}
                  />
                );
              })}
            </Stack>
          )}

          {/* Active step body — no extra padding so each step owns its layout */}
          <Box sx={{ minHeight: 280, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', overflowX: 'hidden' }}>
            <StepRouter stepKey={activeSubstep} />
          </Box>

          <FooterWithFlush onBack={onBack} onNext={onNext} />
        </Box>
      </Box>
    </ConfiguratorProvider>
  );
};

/**
 * Footer is a separate child so it can consume the configurator context
 * (saving, flush) — it must be inside <ConfiguratorProvider>.
 */
const FooterWithFlush: React.FC<{ onBack?: () => void; onNext?: () => void }> = ({ onBack, onNext }) => {
  // Lazy import to avoid circular when Provider re-renders.
  const { useConfigurator } = require('../state/ConfiguratorProvider') as typeof import('../state/ConfiguratorProvider');
  const { saving, dirty, flush } = useConfigurator();
  return (
    <ProjectFlowFooter
      onBack={onBack}
      onNext={onNext}
      onSave={flush}
      saving={saving}
      saveLabel={dirty ? 'Save Draft' : 'Saved'}
      hint={dirty ? 'Unsaved changes — autosaves shortly.' : undefined}
      nextLabel="Continue"
    />
  );
};

const ConfiguratorShell: React.FC<ConfiguratorShellProps> = (props) => {
  const baseTheme = useTheme();
  const scopedTheme = useMemo(() => extendMuiTheme(baseTheme, 'dark'), [baseTheme]);
  return (
    <ThemeProvider theme={scopedTheme}>
      <InnerShell {...props} />
    </ThemeProvider>
  );
};

export default ConfiguratorShell;
