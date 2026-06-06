/**
 * ConfigurationTab â€” Phase 3 SHELL
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * Replaces the legacy EstimationTab as step #2 in the new 12-step project
 * workflow. This file is INFRASTRUCTURE ONLY â€” the full configurator
 * step-flow UI lands in Phase 4. Today it provides:
 *
 *   â€¢ Saved Configurations list (loads via /api/configurator/configurations)
 *   â€¢ Create-new-configuration entry point
 *   â€¢ Load-existing flow with active draft state
 *   â€¢ Placeholder substeps for the 15 STEP_KEYS (system_design â€¦
 *     sld) â€” each substep is a stub card with no inputs
 *   â€¢ Save / Next / Back footer wired through useProjectFlow
 *
 * Strict additive contract:
 *   â€¢ Imports legacy types/services but never mutates Estimate data
 *   â€¢ EstimationTab.tsx is untouched on disk
 *   â€¢ Backend persistence uses ONLY Phase 2 endpoints
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  Skeleton,
  Stack,
  Button,
  Menu,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Edit as EditIcon,
  ContentCopy as DuplicateIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Visibility as VisibilityIcon,
  Inventory2 as EnclosureIcon,
  Bolt as BoltIcon,
  Waves as WavesIcon,
  Lock as LockIcon,
  Security as SecurityIcon,
  Tune as TuneIcon,
  Speed as SpeedIcon,
  AccountTree as RouteIcon,
  Cable as CableIcon,
  ListAlt as ListAltIcon,
  Engineering as EngineeringIcon,
  AddCircleOutline as PlusCircleIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import { useNotification } from '../../contexts/NotificationContext';
import { configuratorService } from '../../services/configuratorService';
import type {
  ConfigurationSummary,
  Configuration,
} from '../../services/configuratorService';
import { ProjectFlowFooter } from './ProjectFlowFooter';
import type { Project } from '../../types';
import ConfiguratorShell, { SUBSTEP_LABELS, STANDARD_KEYS } from '../../configurator/steps/ConfiguratorShell';
import type { ConfiguratorSubstepKey } from '../../configurator/steps/StepRouter';

const PRIMARY = '#00c8ff';
const PRIMARY_LT = '#33d4ff';

/* Per-step icons rendered inside the chip strip — purely visual, mirrors the
   reference design. Keep small (14 px) so chips stay compact. */
const STEP_ICON_MAP: Partial<Record<ConfiguratorSubstepKey, React.ReactElement>> = {
  system_design: <SettingsIcon sx={{ fontSize: 13 }} />,
  enclosure: <EnclosureIcon sx={{ fontSize: 13 }} />,
  bussing: <BoltIcon sx={{ fontSize: 13 }} />,
  glastic: <WavesIcon sx={{ fontSize: 13 }} />,
  cam_lock_panel: <LockIcon sx={{ fontSize: 13 }} />,
  spd_ats: <SecurityIcon sx={{ fontSize: 13 }} />,
  controls: <TuneIcon sx={{ fontSize: 13 }} />,
  ct_vt_cpt: <SpeedIcon sx={{ fontSize: 13 }} />,
  conduit_fittings: <RouteIcon sx={{ fontSize: 13 }} />,
  wire_cable: <CableIcon sx={{ fontSize: 13 }} />,
  standard_bom: <ListAltIcon sx={{ fontSize: 13 }} />,
  labour: <EngineeringIcon sx={{ fontSize: 13 }} />,
  plus_comp: <PlusCircleIcon sx={{ fontSize: 13 }} />,
  sld: <DescriptionIcon sx={{ fontSize: 13 }} />,
  __preview: <VisibilityIcon sx={{ fontSize: 13 }} />,
};

export interface ConfigurationTabProps {
  project: Project;
  onUpdate?: () => void;
  onBack?: () => void;
  onNext?: () => void;
}

const ConfigurationTab: React.FC<ConfigurationTabProps> = ({ project, onUpdate, onBack, onNext }) => {
  const notify = useNotification();
  const [loading, setLoading] = useState(true);
  const [configurations, setConfigurations] = useState<ConfigurationSummary[]>([]);
  const [activeConfig, setActiveConfig] = useState<Configuration | null>(null);
  const [creating, setCreating] = useState(false);
  const [activeSubstep, setActiveSubstep] = useState<ConfiguratorSubstepKey>('system_design');
  const [configMenuAnchor, setConfigMenuAnchor] = useState<null | HTMLElement>(null);
  const [stickyTop, setStickyTop] = useState(88);

  const orderedSubsteps: ConfiguratorSubstepKey[] = [...STANDARD_KEYS, '__preview'];

  /* â”€â”€â”€ Load saved configurations for this project â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const reload = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    try {
      const list = await configuratorService.listConfigurations({ project_id: project.id });
      setConfigurations(list);
      // Auto-select the most recent if none active yet.
      if (!activeConfig && list.length > 0) {
        const newest = [...list].sort((a, b) =>
          (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
        )[0];
        if (newest?.id) {
          const full = await configuratorService.getConfiguration(newest.id);
          setActiveConfig(full);
        }
      }
    } catch (err: any) {
      notify.showError(err?.response?.data?.message || 'Failed to load configurations');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    let raf = 0;

    const updateStickyTop = () => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const header = document.querySelector<HTMLElement>('[data-project-sticky-header="true"]');
        const nextTop = header ? Math.max(0, Math.round(header.getBoundingClientRect().height)) : 88;
        setStickyTop((prev) => (Math.abs(prev - nextTop) > 1 ? nextTop : prev));
      });
    };

    updateStickyTop();
    window.addEventListener('scroll', updateStickyTop, { passive: true });
    window.addEventListener('resize', updateStickyTop);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', updateStickyTop);
      window.removeEventListener('resize', updateStickyTop);
    };
  }, []);

  /* â”€â”€â”€ Create a fresh configuration draft â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const handleCreate = useCallback(async () => {
    if (!project?.id) return;
    setCreating(true);
    try {
      const created = await configuratorService.createConfiguration({
        project_id: project.id,
        name: `Configuration ${new Date().toLocaleDateString()}`,
        status: 'draft',
        config_data: {},
      });
      setActiveConfig(created);
      setConfigurations((prev) => [created, ...prev]);
      notify.showSuccess('New configuration created');
      onUpdate?.();
    } catch (err: any) {
      notify.showError(err?.response?.data?.message || 'Failed to create configuration');
    } finally {
      setCreating(false);
    }
  }, [project?.id, notify, onUpdate]);

  /* â”€â”€â”€ Load an existing configuration into the editor shell â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const handleLoad = useCallback(
    async (id: string) => {
      try {
        const full = await configuratorService.getConfiguration(id);
        setActiveConfig(full);
      } catch (err: any) {
        notify.showError(err?.response?.data?.message || 'Failed to load configuration');
      }
    },
    [notify]
  );

  /* â”€â”€â”€ Rename a saved configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const handleRename = useCallback(
    async (cfg: ConfigurationSummary) => {
      if (!cfg.id) return;
      const next = window.prompt('Rename configuration', cfg.name ?? cfg.code ?? '');
      if (!next || next.trim() === '' || next === cfg.name) return;
      try {
        const updated = await configuratorService.updateConfiguration(cfg.id, { name: next.trim() });
        setConfigurations((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
        if (activeConfig?.id === updated.id) setActiveConfig((a) => (a ? { ...a, ...updated } : a));
        notify.showSuccess('Renamed');
      } catch (err: any) {
        notify.showError(err?.response?.data?.message || 'Rename failed');
      }
    },
    [activeConfig?.id, notify]
  );

  /* â”€â”€â”€ Duplicate a saved configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const handleDuplicate = useCallback(
    async (cfg: ConfigurationSummary) => {
      if (!cfg.id) return;
      try {
        const full = await configuratorService.getConfiguration(cfg.id);
        if (!full) return;
        const created = await configuratorService.createConfiguration({
          project_id: project?.id,
          name: `${full.name ?? full.code ?? 'Configuration'} (copy)`,
          status: 'draft',
          config_data: full.config_data ?? {},
        });
        setConfigurations((prev) => [created, ...prev]);
        notify.showSuccess('Configuration duplicated');
      } catch (err: any) {
        notify.showError(err?.response?.data?.message || 'Duplicate failed');
      }
    },
    [project?.id, notify]
  );

  /* â”€â”€â”€ Delete a saved configuration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const handleDelete = useCallback(
    async (cfg: ConfigurationSummary) => {
      if (!cfg.id) return;
      const ok = window.confirm(
        `Delete configuration "${cfg.name ?? cfg.code ?? cfg.id}"? This cannot be undone.`
      );
      if (!ok) return;
      try {
        await configuratorService.deleteConfiguration(cfg.id);
        setConfigurations((prev) => prev.filter((c) => c.id !== cfg.id));
        if (activeConfig?.id === cfg.id) setActiveConfig(null);
        notify.showSuccess('Deleted');
      } catch (err: any) {
        notify.showError(err?.response?.data?.message || 'Delete failed');
      }
    },
    [activeConfig?.id, notify]
  );

  return (
    /* Outer wrapper has NO padding — sticky bar must be a direct top-level child.
       Pure-black canvas per the design reference (no blue gradient). */
    <Box sx={{ bgcolor: '#000', minHeight: '100%' }}>

      {/* ══════════════════════════════════════════════════════════════════
          STICKY SECONDARY HEADER
          Row 1 — context bar : Project ID (left) · Config selector (right)
          Row 2 — substep chips (only when a config is active)
      ══════════════════════════════════════════════════════════════════ */}
      <Box
        data-config-sticky-bar="true"
        sx={{
          position: 'sticky',
          top: `${stickyTop}px`,
          zIndex: 99,
          overflow: 'visible',
          bgcolor: '#000',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* ── Row 1: context badges + controls ── */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: { xs: 1.5, md: 2.5 },
            py: 0.75,
            gap: 1,
          }}
        >
          {/* LEFT — project identifier */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
            {/* <Box
              sx={{
                px: 1, py: 0.25, borderRadius: '6px',
                bgcolor: 'rgba(0,200,255,0.08)',
                border: '1px solid rgba(0,200,255,0.18)',
                flexShrink: 0,
              }}
            >
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#00c8ff', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                {project.project_number || project.id?.slice(0, 8) || 'PRJ'}
              </Typography>
            </Box> */}
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary, #d9e4fb)', whiteSpace: 'nowrap' }}>
              Configuration
            </Typography>
          </Box>

          {/* RIGHT — refresh · config selector dropdown · new button */}
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
            <Tooltip title="Refresh">
              <span>
                <IconButton size="small" onClick={reload} disabled={loading} sx={{ color: 'var(--text-muted, #9ab0d0)' }}>
                  <RefreshIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </span>
            </Tooltip>

            {/* Config picker pill */}
            <Button
              size="small"
              endIcon={<ExpandMoreIcon sx={{ fontSize: 13 }} />}
              onClick={(e) => setConfigMenuAnchor(e.currentTarget)}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.75rem',
                color: activeConfig ? '#00c8ff' : 'var(--text-muted, #9ab0d0)',
                border: `1px solid ${activeConfig ? 'rgba(0,200,255,0.28)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: '8px',
                px: 1.25,
                py: 0.35,
                bgcolor: activeConfig ? 'rgba(0,200,255,0.07)' : 'rgba(255,255,255,0.03)',
                minWidth: 0,
                maxWidth: 160,
                '&:hover': { bgcolor: 'rgba(0,200,255,0.13)', borderColor: 'rgba(0,200,255,0.45)' },
              }}
            >
              <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeConfig
                  ? (activeConfig.code || activeConfig.name || 'Config')
                  : (loading ? 'Loading…' : 'Select config')}
              </Box>
            </Button>

            <Menu
              anchorEl={configMenuAnchor}
              open={Boolean(configMenuAnchor)}
              onClose={() => setConfigMenuAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              PaperProps={{
                sx: {
                  bgcolor: 'var(--bg-surface-2, #0f1622)',
                  border: '1px solid rgba(0,200,255,0.12)',
                  borderRadius: '10px',
                  minWidth: 240,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                  mt: 0.5,
                },
              }}
            >
              {loading ? (
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Skeleton variant="text" width="80%" />
                  <Skeleton variant="text" width="60%" />
                </Box>
              ) : configurations.length === 0 ? (
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Typography sx={{ fontSize: '0.78rem', color: 'var(--text-muted, #9ab0d0)' }}>
                    No configurations yet.
                  </Typography>
                </Box>
              ) : (
                configurations.map((c) => {
                  const isSel = activeConfig?.id === c.id;
                  return (
                    <Box
                      key={c.id}
                      sx={{
                        display: 'flex', alignItems: 'center',
                        pl: 1.5, pr: 0.5, py: 0.5,
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        bgcolor: isSel ? 'rgba(0,200,255,0.06)' : 'transparent',
                        '&:last-child': { borderBottom: 'none' },
                      }}
                    >
                      <Box
                        sx={{ flex: 1, cursor: 'pointer', py: 0.5, minWidth: 0 }}
                        onClick={() => { if (c.id) handleLoad(c.id); setConfigMenuAnchor(null); }}
                      >
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: isSel ? 700 : 500, color: isSel ? '#00c8ff' : 'var(--text-primary, #f8fbff)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.code || c.name || 'Untitled'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.68rem', color: 'var(--text-muted, #9ab0d0)' }}>
                          {c.status ?? 'draft'}{c.updated_at ? ` · ${new Date(c.updated_at).toLocaleString()}` : ''}
                        </Typography>
                      </Box>
                      <Stack direction="row" onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Rename">
                          <IconButton size="small" onClick={() => { handleRename(c); setConfigMenuAnchor(null); }} sx={{ p: 0.5 }}>
                            <EditIcon sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Duplicate">
                          <IconButton size="small" onClick={() => { handleDuplicate(c); setConfigMenuAnchor(null); }} sx={{ p: 0.5 }}>
                            <DuplicateIcon sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => { handleDelete(c); setConfigMenuAnchor(null); }} sx={{ p: 0.5, color: 'rgba(248,113,113,0.7)', '&:hover': { color: '#f87171' } }}>
                            <DeleteIcon sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Box>
                  );
                })
              )}
            </Menu>

            <Button
              startIcon={creating ? <CircularProgress size={12} /> : <AddIcon sx={{ fontSize: 14 }} />}
              variant="contained"
              disabled={creating}
              onClick={handleCreate}
              size="small"
              sx={{
                bgcolor: '#00c8ff',
                textTransform: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '0.75rem',
                px: 1.25,
                py: 0.45,
                minWidth: 0,
                '&:hover': { bgcolor: '#33d4ff' },
              }}
            >
              New
            </Button>
          </Stack>
        </Box>

        {/* ── Row 2: substep chips (only when a config is active) ── */}
        {activeConfig && (
          <Box
            sx={{
              display: 'flex',
              gap: 0.75,
              overflowX: 'auto',
              px: { xs: 1.5, md: 2.5 },
              py: 1,
              borderTop: '1px solid rgba(255,255,255,0.04)',
              '&::-webkit-scrollbar': { height: 0 },
            }}
          >
            {orderedSubsteps.map((key) => {
              const active = key === activeSubstep;
              const accent = '#00c8ff';
              const stepIcon = STEP_ICON_MAP[key];
              return (
                <Chip
                  key={key}
                  size="small"
                  icon={stepIcon}
                  label={SUBSTEP_LABELS[key]}
                  onClick={() => setActiveSubstep(key)}
                  sx={{
                    flexShrink: 0,
                    cursor: 'pointer',
                    fontWeight: active ? 700 : 500,
                    fontSize: '0.745rem',
                    height: 28,
                    px: 0.5,
                    border: `1px solid ${active ? accent : 'rgba(255,255,255,0.07)'}`,
                    bgcolor: active ? accent : 'transparent',
                    color: active ? '#06151c' : 'rgba(217,228,251,0.78)',
                    borderRadius: '8px',
                    transition: 'background-color 120ms ease, color 120ms ease, border-color 120ms ease',
                    '& .MuiChip-icon': {
                      color: active ? '#06151c' : 'rgba(217,228,251,0.6)',
                      ml: '6px !important',
                      mr: '-2px !important',
                    },
                    '& .MuiChip-label': { px: 1 },
                    '&:hover': {
                      bgcolor: active ? PRIMARY_LT : 'rgba(255,255,255,0.04)',
                      borderColor: active ? PRIMARY_LT : 'rgba(255,255,255,0.14)',
                      color: active ? '#06151c' : '#f0f6ff',
                      '& .MuiChip-icon': { color: active ? '#06151c' : '#f0f6ff' },
                    },
                  }}
                />
              );
            })}
          </Box>
        )}
      </Box>

      {/* ══ SCROLLABLE CONTENT ══ */}
      <Box sx={{ p: { xs: 2, md: 3 } }}>

        {/* Active configuration → full Phase 4 configurator shell */}
        {activeConfig ? (
          <ConfiguratorShell
            configuration={activeConfig}
            activeSubstep={activeSubstep}
            onSubstepChange={setActiveSubstep}
            onPersist={(next) => {
              setActiveConfig(next);
              setConfigurations((prev) => prev.map((c) => (c.id === next.id ? { ...c, ...next } : c)));
              onUpdate?.();
            }}
            onBack={onBack}
            onNext={onNext}
          />
        ) : (
          <Card
            variant="outlined"
            sx={{
              borderColor: 'rgba(255,255,255,0.06)',
              borderRadius: '10px',
              bgcolor: 'transparent',
            }}
          >
            <CardContent
              sx={{
                p: 4,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <SettingsIcon sx={{ fontSize: 32, color: PRIMARY, opacity: 0.7, mb: 1.5 }} />
              <Typography
                sx={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: 'var(--text-primary, #f8fbff)',
                  mb: 0.5,
                }}
              >
                No active configuration
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.8125rem',
                  color: 'var(--text-muted, #9ab0d0)',
                  maxWidth: 420,
                  lineHeight: 1.5,
                  mb: 2,
                }}
              >
                Create a new configuration or select one from the dropdown above to enter the configurator workflow.
              </Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon fontSize="small" />}
                onClick={handleCreate}
                disabled={creating}
                sx={{
                  bgcolor: PRIMARY,
                  textTransform: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  '&:hover': { bgcolor: PRIMARY_LT },
                }}
              >
                {creating ? 'Creating…' : 'New Configuration'}
              </Button>

              <ProjectFlowFooter
                onBack={onBack}
                onNext={onNext}
                hideSave
                nextDisabled={!activeConfig}
                nextLabel="Continue"
              />
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
};

export default ConfigurationTab;
