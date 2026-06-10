import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import SaveIcon from '@mui/icons-material/Save';
import { useConfigurator } from '../state/ConfiguratorProvider';
import { getSystemDirective, getSectionDirective, type FieldDirective } from '../lib/field-intelligence';
import type {
  SystemParameters,
  SectionDefinition,
  ElectricalProtection,
  LayoutHardware,
} from '../types';
import { CircuitBreakerTab } from './CircuitBreakerTab';

interface FieldDef {
  key: string;
  label: string;
  options?: string[];
}

const SYSTEM_FIELDS: FieldDef[] = [
  { key: 'switchboardType', label: 'Switchboard Type', options: ['LV', 'MV'] },
  { key: 'applicationType', label: 'Application Type', options: ['Industrial', 'Commercial', 'Utility', 'Residential'] },
  { key: 'standards', label: 'Standards', options: ['IEC', 'UL', 'CSA'] },
  { key: 'specialEnvironment', label: 'Special Environment' },
  { key: 'designMode', label: 'Design Mode', options: ['Auto', 'Manual'] },
  { key: 'systemVoltage', label: 'System Voltage' },
  { key: 'frequency', label: 'Frequency (Hz)', options: ['50', '60'] },
  { key: 'phase', label: 'Phase', options: ['1-phase', '3-phase'] },
  { key: 'shortCircuitRating', label: 'Short Circuit Rating (kA)' },
  { key: 'mainBusRating', label: 'Main Bus Rating (A)' },
  { key: 'neutralRating', label: 'Neutral Rating (%)', options: ['50', '100', '200'] },
  { key: 'connectionType', label: 'Connection Type' },
  { key: 'numberOfSections', label: 'Number of Sections' },
  { key: 'accessType', label: 'Access Type', options: ['Front', 'Rear', 'Front + Rear'] },
  { key: 'cableType', label: 'Cable Type' },
  { key: 'sectionWidth', label: 'Section Width (mm)' },
  { key: 'depth', label: 'Depth (mm)' },
  { key: 'height', label: 'Height (mm)' },
  { key: 'cableEntry', label: 'Cable Entry', options: ['Top', 'Bottom', 'Side'] },
  { key: 'cableExit', label: 'Cable Exit', options: ['Top', 'Bottom', 'Side'] },
  { key: 'specialConnections', label: 'Special Connections' },
  { key: 'installationLocation', label: 'Installation Location', options: ['Indoor', 'Outdoor'] },
  { key: 'ipRating', label: 'IP Rating', options: ['IP31', 'IP41', 'IP54', 'IP65'] },
  { key: 'ambientTemp', label: 'Ambient Temp (°C)' },
  { key: 'busMaterial', label: 'Bus Material', options: ['Copper', 'Aluminium'] },
  { key: 'plating', label: 'Plating', options: ['None', 'Tin', 'Silver'] },
  { key: 'busConfiguration', label: 'Bus Configuration', options: ['Single', 'Double', 'Bypass'] },
];

const BOARD_SETUP = ['switchboardType', 'applicationType', 'standards', 'specialEnvironment', 'designMode'];
const ELEC_SYSTEM = ['systemVoltage', 'frequency', 'phase', 'shortCircuitRating', 'mainBusRating', 'neutralRating', 'connectionType'];
const MECH_LAYOUT = ['numberOfSections','accessType', 'cableType', 'sectionWidth', 'depth', 'height', 'cableEntry', 'cableExit', 'specialConnections'];
const ENVIRONMENT = ['installationLocation', 'ipRating', 'ambientTemp'];
const BUS_SYSTEM = ['busMaterial', 'plating', 'busConfiguration'];

const SECTION_DEFINITION_FIELDS: FieldDef[] = [
  { key: 'sectionName', label: 'Section Name' },
  { key: 'sectionType', label: 'Section Type', options: ['Incomer', 'Feeder', 'Tie', 'Metering', 'Bus Coupler'] },
  { key: 'sectionFunction', label: 'Section Function' },
  { key: 'operationType', label: 'Operation Type', options: ['Manual', 'Motorized', 'Automatic'] },
  { key: 'accessories', label: 'Accessories' },
];

const ELECTRICAL_FIELDS: FieldDef[] = [
  { key: 'sectionRatedCurrent', label: 'Section Rated Current (A)' },
  { key: 'loadType', label: 'Load Type', options: ['Resistive', 'Inductive', 'Motor', 'Mixed'] },
  { key: 'connectedLoad', label: 'Connected Load (kW)' },
  { key: 'demandFactor', label: 'Demand Factor' },
  { key: 'diversityFactor', label: 'Diversity Factor' },
  { key: 'continuousLoad', label: 'Continuous Load' },
  { key: 'feederType', label: 'Feeder Type', options: ['Incomer', 'Outgoing Feeder', 'Tie'] },
  { key: 'parentSection', label: 'Parent Section' },
  { key: 'redundancyType', label: 'Redundancy Type', options: ['None', 'N+1', '2N'] },
  { key: 'protectionLevel', label: 'Protection Level' },
  { key: 'earthFaultProtection', label: 'Earth Fault Protection', options: ['None', 'Standard', 'Sensitive'] },
  { key: 'arcFlashProtection', label: 'Arc Flash Protection', options: ['None', 'Light Sensing', 'Trip Unit'] },
  { key: 'interlockingRequirement', label: 'Interlocking Requirement' },
];

const LAYOUT_FIELDS: FieldDef[] = [
  { key: 'position', label: 'Position' },
  { key: 'compartmentSize', label: 'Compartment Size' },
  { key: 'mountingStructure', label: 'Mounting Structure', options: ['Fixed', 'Drawout', 'Plug-in'] },
  { key: 'stacking', label: 'Stacking', options: ['Single', 'Stacked'] },
  { key: 'busConnection', label: 'Bus Connection' },
  { key: 'tapOffType', label: 'Tap-Off Type' },
  { key: 'cableEntry', label: 'Cable Entry', options: ['Top', 'Bottom', 'Side'] },
  { key: 'cableExit', label: 'Cable Exit', options: ['Top', 'Bottom', 'Side'] },
  { key: 'cableTerminationType', label: 'Cable Termination Type' },
  { key: 'metering', label: 'Metering' },
  { key: 'ctRequirement', label: 'CT Requirement' },
  { key: 'ctType', label: 'CT Type' },
  { key: 'controlType', label: 'Control Type' },
  { key: 'indications', label: 'Indications' },
];

interface FieldGridProps<T extends Record<string, string>> {
  fields: FieldDef[];
  values: T;
  onChange: (k: keyof T, v: string) => void;
  getDirective: (key: string) => FieldDirective;
  columns?: number;
}

/* Common dark-input styling used across every field. Label sits ABOVE the
   input (separate <Typography>), the input itself is a borderless-looking
   dark pill with a subtle outline + chevron. Matches the reference design. */
const INPUT_SX = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'rgba(255,255,255,0.015)',
    color: '#f0f6ff',
    fontSize: '0.78rem',
    borderRadius: '6px',
    minHeight: 32,
    transition: 'border-color 120ms ease, background-color 120ms ease',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.18)' },
    '&.Mui-focused fieldset': { borderColor: '#00c8ff', borderWidth: 1 },
    '&.Mui-disabled': {
      bgcolor: 'rgba(255,255,255,0.01)',
      '& fieldset': { borderColor: 'rgba(255,255,255,0.05)' },
    },
  },
  '& .MuiOutlinedInput-input': {
    py: 0.55,
    px: 1.1,
    color: '#f0f6ff',
    '&.Mui-disabled': { WebkitTextFillColor: 'rgba(240,246,255,0.45)' },
  },
  '& .MuiSelect-icon': { color: 'rgba(217,228,251,0.5)' },
} as const;

function FieldGrid<T extends Record<string, string>>({ fields, values, onChange, getDirective, columns }: FieldGridProps<T>) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: columns
          ? { xs: '1fr', sm: 'repeat(2, 1fr)', md: `repeat(${Math.min(columns, 4)}, 1fr)`, lg: `repeat(${columns}, 1fr)` }
          : { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
        columnGap: 1.5,
        rowGap: 1.1,
      }}
    >
      {fields.map((f) => {
        const d = getDirective(f.key);
        if (d.visible === false) return null;

        const v = (values as any)[f.key] ?? '';
        const options = d.filteredOptions?.length ? d.filteredOptions : f.options;
        const isSelect = (options?.length ?? 0) > 0;

        return (
          <Box key={f.key} sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={0.5}
              sx={{ mb: 0.25, minHeight: 14 }}
            >
              <Typography
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  color: 'rgba(217,228,251,0.62)',
                  letterSpacing: 0.1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {f.label}
              </Typography>
              {d.locked && <LockIcon sx={{ fontSize: 11, color: 'rgba(217,228,251,0.55)' }} />}
            </Stack>
            <TextField
              value={v}
              size="small"
              fullWidth
              select={isSelect}
              onChange={(e) => onChange(f.key as keyof T, e.target.value)}
              disabled={d.locked}
              SelectProps={isSelect ? { displayEmpty: true } : undefined}
              sx={INPUT_SX}
            >
              {isSelect && [
                <MenuItem key="__empty" value="">
                  <em style={{ color: 'rgba(217,228,251,0.45)' }}>—</em>
                </MenuItem>,
                ...(options ?? []).map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                )),
              ]}
            </TextField>
          </Box>
        );
      })}
    </Box>
  );
}

const SystemDesignStep: React.FC = () => {
  const { state, dispatch, fieldIntelligence, saving, dirty, flush } = useConfigurator();
  const [activeTab, setActiveTab] = useState<string>('systemParameters');
  const [sectionSubTab, setSectionSubTab] = useState<Record<number, string>>({});

  const numberOfSections = useMemo(() => {
    const n = parseInt(state.systemParameters.numberOfSections || '1', 10);
    if (Number.isNaN(n) || n < 1) return 1;
    return Math.min(6, n);
  }, [state.systemParameters.numberOfSections]);

  const setSystemField = useCallback(
    (k: keyof SystemParameters, v: string) => {
      dispatch({
        type: 'setSystemParameters',
        payload: { ...state.systemParameters, [k]: v },
      });
    },
    [dispatch, state.systemParameters]
  );

  const activeSectionNumber = activeTab.startsWith('section-') ? parseInt(activeTab.split('-')[1], 10) : null;

  const setSectionDefField = useCallback(
    (k: keyof SectionDefinition, v: string) => {
      if (!activeSectionNumber) return;
      if (activeSectionNumber === 1) {
        dispatch({
          type: 'setSection1Definition',
          payload: { ...state.section1Definition, [k]: v },
        });
      } else {
        const prev = state.sectionDefinitions[activeSectionNumber] ?? state.section1Definition;
        dispatch({
          type: 'setSectionDefinition',
          sectionNumber: activeSectionNumber,
          payload: { ...prev, [k]: v },
        });
      }
    },
    [activeSectionNumber, dispatch, state.section1Definition, state.sectionDefinitions]
  );

  const setSectionElecField = useCallback(
    (k: keyof ElectricalProtection, v: string) => {
      if (!activeSectionNumber) return;
      if (activeSectionNumber === 1) {
        dispatch({
          type: 'setSection1Electrical',
          payload: { ...state.section1ElectricalProtection, [k]: v },
        });
      } else {
        const prev = state.sectionElectricals[activeSectionNumber] ?? state.section1ElectricalProtection;
        dispatch({
          type: 'setSectionElectrical',
          sectionNumber: activeSectionNumber,
          payload: { ...prev, [k]: v },
        });
      }
    },
    [activeSectionNumber, dispatch, state.section1ElectricalProtection, state.sectionElectricals]
  );

  const setSectionLayoutField = useCallback(
    (k: keyof LayoutHardware, v: string) => {
      if (!activeSectionNumber) return;
      if (activeSectionNumber === 1) {
        dispatch({
          type: 'setSection1Layout',
          payload: { ...state.section1LayoutHardware, [k]: v },
        });
      } else {
        const prev = state.sectionLayouts[activeSectionNumber] ?? state.section1LayoutHardware;
        dispatch({
          type: 'setSectionLayout',
          sectionNumber: activeSectionNumber,
          payload: { ...prev, [k]: v },
        });
      }
    },
    [activeSectionNumber, dispatch, state.section1LayoutHardware, state.sectionLayouts]
  );

  const renderGroupCard = (title: string, groupKeys: string[], cols?: number) => {
    const fields = SYSTEM_FIELDS.filter((f) => groupKeys.includes(f.key));
    return (
      <Box
        sx={{
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: '8px',
          bgcolor: 'rgba(255,255,255,0.04)',
          p: 1.25,
        }}
      >
        <Typography
          sx={{
            fontWeight: 600,
            mb: 0.75,
            fontSize: '0.78rem',
            color: '#f0f6ff',
            letterSpacing: 0.1,
          }}
        >
          {title}
        </Typography>
        <FieldGrid<SystemParameters>
          fields={fields}
          values={state.systemParameters}
          onChange={setSystemField}
          getDirective={(key) => getSystemDirective(fieldIntelligence, key)}
          columns={cols}
        />
      </Box>
    );
  };

  /* ── Pill-chip helper for the inline System Parameters / Section N tabs ── */
  const renderTabChip = (value: string, label: string, isActive: boolean) => (
    <Box
      key={value}
      role="tab"
      onClick={() => setActiveTab(value)}
      sx={{
        cursor: 'pointer',
        userSelect: 'none',
        px: 1.5,
        py: 0.6,
        fontSize: '0.78rem',
        fontWeight: isActive ? 600 : 500,
        color: isActive ? '#f0f6ff' : 'rgba(217,228,251,0.55)',
        bgcolor: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: `1px solid ${isActive ? 'rgba(255,255,255,0.10)' : 'transparent'}`,
        borderRadius: '6px',
        transition: 'background-color 120ms ease, color 120ms ease, border-color 120ms ease',
        whiteSpace: 'nowrap',
        '&:hover': {
          color: '#f0f6ff',
          bgcolor: isActive ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
        },
      }}
    >
      {label}
    </Box>
  );

  return (
    <Box sx={{ color: '#f0f6ff', bgcolor: '#000', p: 1 }}>
      {/* ── Sub-tab strip: System Parameters / Section N ──
         (Save moved to unified hub header above) */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1,
          pb: 0.5,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <Stack
          direction="row"
          spacing={0.5}
          sx={{ flex: 1, minWidth: 0, overflowX: 'auto', '&::-webkit-scrollbar': { height: 0 } }}
        >
          {renderTabChip('systemParameters', 'System Parameters', activeTab === 'systemParameters')}
          {Array.from({ length: numberOfSections }, (_, i) => i + 1).map((n) =>
            renderTabChip(`section-${n}`, `Section${n}`, activeTab === `section-${n}`)
          )}
        </Stack>
      </Box>

      <Box>
        {/* ══ SYSTEM PARAMETERS ══ */}
        {activeTab === 'systemParameters' && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {renderGroupCard('Board Setup', BOARD_SETUP, BOARD_SETUP.length)}
            {renderGroupCard('Electrical System', ELEC_SYSTEM, ELEC_SYSTEM.length)}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 1.25, alignItems: 'start' }}>
              {renderGroupCard('Mechanical Layout', MECH_LAYOUT)}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {renderGroupCard('Environment', ENVIRONMENT)}
                {renderGroupCard('Bus System', BUS_SYSTEM)}
              </Box>
            </Box>
          </Box>
        )}

        {/* ══ SECTION PANELS ══ */}
        {activeSectionNumber !== null && (
          <Box>
            <Box
              sx={{
                mb: 2,
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: '8px',
                bgcolor: 'rgba(255,255,255,0.04)',
                p: 2,
              }}
            >
              <Typography
                sx={{
                  fontWeight: 600,
                  mb: 1.75,
                  fontSize: '0.85rem',
                  color: '#f0f6ff',
                  letterSpacing: 0.1,
                }}
              >
                Section Definition
              </Typography>
              <FieldGrid<SectionDefinition>
                fields={SECTION_DEFINITION_FIELDS}
                values={activeSectionNumber === 1 ? state.section1Definition : (state.sectionDefinitions[activeSectionNumber] ?? state.section1Definition)}
                onChange={setSectionDefField}
                getDirective={(key) => getSectionDirective(fieldIntelligence, activeSectionNumber, 'definition', key)}
              />
            </Box>

            <Box sx={{ mt: 2 }}>
              {/* Section sub-tabs styled as the same pill chips */}
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  mb: 2,
                  pb: 1.25,
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  overflowX: 'auto',
                  '&::-webkit-scrollbar': { height: 0 },
                }}
              >
                {([
                  { value: 'circuit-breaker', label: 'Circuit Breaker' },
                  { value: 'electrical-protection', label: 'Electrical & Protection' },
                  { value: 'layout-hardware', label: 'Layout & Hardware' },
                ] as const).map(({ value, label }) => {
                  const current = sectionSubTab[activeSectionNumber] || 'circuit-breaker';
                  const isActive = current === value;
                  return (
                    <Box
                      key={value}
                      role="tab"
                      onClick={() => setSectionSubTab((prev) => ({ ...prev, [activeSectionNumber]: value }))}
                      sx={{
                        cursor: 'pointer',
                        userSelect: 'none',
                        px: 1.5,
                        py: 0.6,
                        fontSize: '0.78rem',
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? '#f0f6ff' : 'rgba(217,228,251,0.55)',
                        bgcolor: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                        border: `1px solid ${isActive ? 'rgba(255,255,255,0.10)' : 'transparent'}`,
                        borderRadius: '6px',
                        whiteSpace: 'nowrap',
                        transition: 'background-color 120ms ease, color 120ms ease, border-color 120ms ease',
                        '&:hover': {
                          color: '#f0f6ff',
                          bgcolor: isActive ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                        },
                      }}
                    >
                      {label}
                    </Box>
                  );
                })}
              </Stack>

              {(sectionSubTab[activeSectionNumber] || 'circuit-breaker') === 'circuit-breaker' && (
                <CircuitBreakerTab sectionNumber={activeSectionNumber} />
              )}

              {(sectionSubTab[activeSectionNumber] || 'circuit-breaker') === 'electrical-protection' && (
                <Box sx={{ p: 1 }}>
                  <FieldGrid<ElectricalProtection>
                    fields={ELECTRICAL_FIELDS}
                    values={activeSectionNumber === 1 ? state.section1ElectricalProtection : (state.sectionElectricals[activeSectionNumber] ?? state.section1ElectricalProtection)}
                    onChange={setSectionElecField}
                    getDirective={(key) => getSectionDirective(fieldIntelligence, activeSectionNumber, 'electricalProtection', key)}
                  />
                </Box>
              )}

              {(sectionSubTab[activeSectionNumber] || 'circuit-breaker') === 'layout-hardware' && (
                <Box sx={{ p: 1 }}>
                  <FieldGrid<LayoutHardware>
                    fields={LAYOUT_FIELDS}
                    values={activeSectionNumber === 1 ? state.section1LayoutHardware : (state.sectionLayouts[activeSectionNumber] ?? state.section1LayoutHardware)}
                    onChange={setSectionLayoutField}
                    getDirective={(key) => getSectionDirective(fieldIntelligence, activeSectionNumber, 'layoutHardware', key)}
                  />
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default SystemDesignStep;
