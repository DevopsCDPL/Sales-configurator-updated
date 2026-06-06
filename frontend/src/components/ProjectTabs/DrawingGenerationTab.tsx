/**
 * DrawingGenerationTab â€” Phase 3 SHELL
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * Step #3 in the new 12-step project workflow. Surfaces the SolidWorks
 * drawing-generation backend (Phase 2 proxy) with:
 *
 *   â€¢ Health-status banner â€” gracefully shows "unavailable" when the
 *     SolidWorks API is offline (backend returns 503 fallback).
 *   â€¢ Job list (read-only) â€” supports manual refresh + per-job open.
 *   â€¢ Async polling shell â€” `pollJob` is wired but inactive until the
 *     user creates a drawing in Phase 4.
 *
 * Phase 4 adds: parameterized "Create Drawing" form, live job progress,
 * per-file preview/download integrated with the document library.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  IconButton,
  Tooltip,
  Skeleton,
  Stack,
  Alert,
  Button,
  alpha,
  CircularProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Architecture as ArchitectureIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  CloudOff as CloudOffIcon,
} from '@mui/icons-material';
import { useNotification } from '../../contexts/NotificationContext';
import { drawingGenerationService } from '../../services/drawingGenerationService';
import type { DrawingHealth, DrawingJob } from '../../services/drawingGenerationService';
import { ProjectFlowFooter } from './ProjectFlowFooter';
import type { Project } from '../../types';

const PRIMARY = '#00c8ff';
const BORDER = 'var(--border, #e4e8ee)';

export interface DrawingGenerationTabProps {
  project: Project;
  onUpdate?: () => void;
  onBack?: () => void;
  onNext?: () => void;
}

/* â”€â”€â”€ Status pill rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
type PillKind = 'success' | 'error' | 'running' | 'queued';

const statusPill = (
  status?: string
): { label: string; color: string; bg: string; kind: PillKind } => {
  const s = String(status ?? '').toLowerCase();
  if (s === 'completed' || s === 'done')
    return { label: 'Completed', color: '#16a34a', bg: '#dcfce7', kind: 'success' };
  if (s === 'failed' || s === 'error')
    return { label: 'Failed', color: '#dc2626', bg: '#fee2e2', kind: 'error' };
  if (s === 'running' || s === 'in_progress')
    return { label: 'Running', color: '#0369a1', bg: '#dbeafe', kind: 'running' };
  return { label: status || 'Queued', color: '#6b7280', bg: '#f3f4f6', kind: 'queued' };
};

const renderPillIcon = (kind: PillKind) => {
  switch (kind) {
    case 'success':
      return <CheckCircleIcon sx={{ fontSize: 14 }} />;
    case 'error':
      return <ErrorIcon sx={{ fontSize: 14 }} />;
    case 'running':
      return <CircularProgress size={12} thickness={5} />;
    default:
      return <ScheduleIcon sx={{ fontSize: 14 }} />;
  }
};

const DrawingGenerationTab: React.FC<DrawingGenerationTabProps> = ({ onBack, onNext }) => {
  const notify = useNotification();
  const [health, setHealth] = useState<DrawingHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [jobs, setJobs] = useState<DrawingJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const h = await drawingGenerationService.health();
      setHealth(h);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const list = await drawingGenerationService.listJobs();
      setJobs(list);
    } catch (err: any) {
      // 503 from backend means SolidWorks API is unreachable â€” non-fatal
      if (err?.response?.status !== 503) {
        notify.showError(err?.response?.data?.message || 'Failed to load drawing jobs');
      }
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    refreshHealth();
    refreshJobs();
  }, [refreshHealth, refreshJobs]);

  const serviceAvailable = !!health?.ok && !health?.fallback;

  const healthBanner = useMemo(() => {
    if (healthLoading) {
      return (
        <Alert
          severity="info"
          icon={<CircularProgress size={16} />}
          sx={{ borderRadius: '10px', mb: 2 }}
        >
          Checking SolidWorks service statusâ€¦
        </Alert>
      );
    }
    if (serviceAvailable) {
      return (
        <Alert severity="success" icon={<CheckCircleIcon />} sx={{ borderRadius: '10px', mb: 2 }}>
          SolidWorks drawing service is online.
          {health?.version ? ` Version ${health.version}.` : ''}
        </Alert>
      );
    }
    return (
      <Alert severity="warning" icon={<CloudOffIcon />} sx={{ borderRadius: '10px', mb: 2 }}>
        Drawing generation service is currently unavailable. Existing jobs remain accessible;
        new drawings cannot be queued until the SolidWorks API is reachable.
      </Alert>
    );
  }, [healthLoading, serviceAvailable, health?.version]);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          mb: 2.5,
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: '1.15rem',
              fontWeight: 700,
              color: 'var(--text-primary, #0b1220)',
              letterSpacing: '-0.01em',
            }}
          >
            Drawing Generation
          </Typography>
          <Typography sx={{ fontSize: '0.825rem', color: 'var(--text-secondary, #4a5365)', mt: 0.25 }}>
            Queue SolidWorks drawing jobs for the active configuration.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh">
            <span>
              <IconButton
                size="small"
                onClick={() => {
                  refreshHealth();
                  refreshJobs();
                }}
                disabled={healthLoading || jobsLoading}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            variant="contained"
            disabled
            size="small"
            startIcon={<ArchitectureIcon fontSize="small" />}
            sx={{
              bgcolor: PRIMARY,
              textTransform: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '0.8125rem',
            }}
          >
            New Drawing (Phase 4)
          </Button>
        </Stack>
      </Box>

      {healthBanner}

      {/* Jobs list */}
      <Card variant="outlined" sx={{ borderColor: BORDER, borderRadius: '12px' }}>
        <CardContent sx={{ p: 2 }}>
          <Typography
            sx={{
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--text-muted, #8b93a3)',
              mb: 1,
            }}
          >
            Drawing Jobs
          </Typography>

          {jobsLoading ? (
            <Stack spacing={1}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
              ))}
            </Stack>
          ) : jobs.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center' }}>
              <ArchitectureIcon
                sx={{ fontSize: 32, color: 'var(--text-muted, #8b93a3)', mb: 1 }}
              />
              <Typography
                sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}
              >
                No drawing jobs yet
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.78rem',
                  color: 'var(--text-muted, #8b93a3)',
                  mt: 0.5,
                  maxWidth: 420,
                  mx: 'auto',
                  lineHeight: 1.5,
                }}
              >
                The Create Drawing flow ships in Phase&nbsp;4. Once enabled, jobs queued from this
                project will appear here with live status.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={0.75}>
              {jobs.map((j) => {
                const id = j.job_id || j.jobId || '';
                const pill = statusPill(j.status);
                return (
                  <Box
                    key={id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 1.5,
                      py: 0.85,
                      borderRadius: '8px',
                      border: `1px solid ${BORDER}`,
                      transition: 'all 0.15s ease',
                      '&:hover': { borderColor: PRIMARY, bgcolor: alpha(PRIMARY, 0.03) },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontSize: '0.825rem',
                          fontWeight: 600,
                          color: 'var(--text-primary, #0b1220)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {j.folder_name || id || 'Untitled job'}
                      </Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-muted, #8b93a3)' }}>
                        {j.circuit_breaker_brand ?? 'â€”'} Â· {j.panel_count ?? '?'} panel(s)
                        {j.created_at ? ` Â· ${new Date(j.created_at).toLocaleString()}` : ''}
                      </Typography>
                    </Box>
                    <Chip
                      icon={renderPillIcon(pill.kind)}
                      label={pill.label}
                      size="small"
                      sx={{
                        bgcolor: pill.bg,
                        color: pill.color,
                        fontWeight: 700,
                        fontSize: '0.68rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    />
                  </Box>
                );
              })}
            </Stack>
          )}

          <ProjectFlowFooter
            onBack={onBack}
            onNext={onNext}
            hideSave
            nextLabel="Continue"
          />
        </CardContent>
      </Card>
    </Box>
  );
};

export default DrawingGenerationTab;

