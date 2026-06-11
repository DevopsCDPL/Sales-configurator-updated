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
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Stack,
  ThemeProvider,
  useTheme,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { extendMuiTheme } from '../../config/themeTokens';
import type { Configuration } from '../../services/configuratorService';
import type { ConfiguratorStepKey } from '../../services/configuratorService';
import { ConfiguratorProvider } from '../state/ConfiguratorProvider';
import StepRouter, { type ConfiguratorSubstepKey } from './StepRouter';

export interface ConfiguratorShellState {
  saving: boolean;
  dirty: boolean;
  flush: () => void;
}

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
  __v2: 'Designer',
};

export interface ConfiguratorShellProps {
  configuration: Configuration;
  onPersist?: (next: Configuration) => void;
  onBack?: () => void;
  onNext?: () => void;
  /** Controlled substep — if provided the parent owns the selection state */
  activeSubstep?: ConfiguratorSubstepKey;
  onSubstepChange?: (key: ConfiguratorSubstepKey) => void;
  /** Pushes saving/dirty/flush up so the parent can host the action bar. */
  onShellStateChange?: (s: ConfiguratorShellState) => void;
}

/** @internal */
type Props = ConfiguratorShellProps;

const InnerShell: React.FC<Props> = ({ configuration, onPersist, onShellStateChange, activeSubstep: controlledSubstep, onSubstepChange }) => {
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
      {/* Deep neutral canvas with hairline border — no decorative shadows. */}
      <Box
        sx={{
          bgcolor: 'transparent',
          border: '1px solid #1E2235',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 0 }}>
          {/* Linear underline tab strip — no pills, no border-radius on tabs */}
          {!isControlled && (
            <Stack
              direction="row"
              sx={{
                flexWrap: 'nowrap',
                overflowX: 'auto',
                bgcolor: '#13131E',
                borderBottom: '1px solid #1E2235',
                px: '24px',
              }}
            >
              {orderedSubsteps.map((key) => {
                const active = key === activeSubstep;
                const isPhantom = key === '__preview';
                return (
                  <Box
                    key={key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveSubstep(key)}
                    sx={{
                      cursor: 'pointer',
                      padding: '10px 16px',
                      fontSize: '13px',
                      fontWeight: 500,
                      letterSpacing: '-0.005em',
                      color: active ? '#E2E8F0' : '#64748B',
                      borderBottom: active ? '2px solid #1976D2' : '2px solid transparent',
                      marginBottom: '-1px',
                      backgroundColor: 'transparent',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      transition: 'color 0.15s ease, background 0.15s ease, border-color 0.15s ease',
                      '&:hover': {
                        color: active ? '#E2E8F0' : '#CBD5E1',
                        backgroundColor: active ? 'transparent' : 'rgba(30,34,53,0.6)',
                      },
                    }}
                  >
                    {isPhantom && <VisibilityIcon sx={{ fontSize: 14 }} />}
                    {SUBSTEP_LABELS[key]}
                  </Box>
                );
              })}
            </Stack>
          )}

          {/* Active step body — no extra padding so each step owns its layout */}
          <Box sx={{ minHeight: 280, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', overflowX: 'hidden' }}>
            <StepRouter stepKey={activeSubstep} />
          </Box>

          {onShellStateChange && <ShellStateBridge onChange={onShellStateChange} />}
        </Box>
      </Box>
    </ConfiguratorProvider>
  );
};

/**
 * Bridges configurator context (saving / dirty / flush) up to the parent so
 * the unified header action bar can render Save / Continue.
 */
const ShellStateBridge: React.FC<{ onChange: (s: ConfiguratorShellState) => void }> = ({ onChange }) => {
  const { useConfigurator } = require('../state/ConfiguratorProvider') as typeof import('../state/ConfiguratorProvider');
  const { saving, dirty, flush } = useConfigurator();
  useEffect(() => {
    onChange({ saving, dirty, flush });
  }, [saving, dirty, flush, onChange]);
  return null;
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
