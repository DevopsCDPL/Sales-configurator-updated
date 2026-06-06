/**
 * ProjectFlowFooter â€” Phase 3 reusable Save/Next/Back controls
 *
 * Renders the standardized Save / Back / Next bar used by configurator
 * and drawing-generation step shells. Existing Forge tabs continue to
 * use `EnhancedNavFooter` (legacy); this is the forward-looking footer
 * built around the new 12-step workflow vocabulary.
 *
 * The footer is presentation-only â€” orchestration lives in
 * `useProjectFlow`. It accepts callbacks rather than reaching into the
 * hook so it can be reused in shell components that aren't tied to a
 * full project (e.g. preview/sandbox screens).
 */
import React from 'react';
import { Box, Button, CircularProgress, Tooltip } from '@mui/material';
import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  Save as SaveIcon,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';

const PRIMARY = '#00c8ff';
const PRIMARY_DK = '#0099cc';

export interface ProjectFlowFooterProps {
  onBack?: () => void;
  onNext?: () => void;
  onSave?: () => void;
  backLabel?: string;
  nextLabel?: string;
  saveLabel?: string;
  /** Disables the Next button (e.g. validation failure). */
  nextDisabled?: boolean;
  /** Hide Back (first step). */
  hideBack?: boolean;
  /** Hide Next (terminal step or read-only). */
  hideNext?: boolean;
  /** Hide Save (step has no draft state). */
  hideSave?: boolean;
  /** Show inline spinner on Save while in flight. */
  saving?: boolean;
  /** Optional autosave status hint (e.g. "Saved 12s ago"). */
  hint?: React.ReactNode;
  /** Extra controls rendered between Save and Next (e.g. Preview). */
  extra?: React.ReactNode;
}

/* eslint-disable react/jsx-no-undef */
export const ProjectFlowFooter: React.FC<ProjectFlowFooterProps> = ({
  onBack,
  onNext,
  onSave,
  backLabel = 'Back',
  nextLabel = 'Next',
  saveLabel = 'Save',
  nextDisabled,
  hideBack,
  hideNext,
  hideSave,
  saving,
  hint,
  extra,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 2,
        mt: 3,
        pt: 2,
        borderTop: '1px solid var(--border, #e4e8ee)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {!hideBack && (
          <Button
            onClick={onBack}
            disabled={!onBack}
            variant="text"
            size="medium"
            startIcon={<ArrowLeftIcon fontSize="small" />}
            sx={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--text-secondary, #4a5365)',
              textTransform: 'none',
              borderRadius: '8px',
              px: 1.5,
              '&:hover': { bgcolor: alpha(PRIMARY, 0.06), color: PRIMARY },
            }}
          >
            {backLabel}
          </Button>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        {hint && (
          <Box
            sx={{
              fontSize: '0.75rem',
              color: 'var(--text-muted, #8b93a3)',
              fontWeight: 500,
            }}
          >
            {hint}
          </Box>
        )}
        {extra}
        {!hideSave && (
          <Tooltip title={saving ? 'Savingâ€¦' : ''} arrow disableHoverListener={!saving}>
            <span>
              <Button
                onClick={onSave}
                disabled={!onSave || saving}
                variant="outlined"
                size="medium"
                startIcon={
                  saving ? (
                    <CircularProgress size={14} thickness={5} sx={{ color: PRIMARY }} />
                  ) : (
                    <SaveIcon fontSize="small" />
                  )
                }
                sx={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: '8px',
                  borderColor: 'var(--border, #e4e8ee)',
                  color: PRIMARY,
                  '&:hover': { borderColor: PRIMARY, bgcolor: alpha(PRIMARY, 0.04) },
                }}
              >
                {saveLabel}
              </Button>
            </span>
          </Tooltip>
        )}
        {!hideNext && (
          <Button
            onClick={onNext}
            disabled={!onNext || nextDisabled}
            variant="contained"
            size="medium"
            endIcon={<ArrowRightIcon fontSize="small" />}
            sx={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '8px',
              px: 2.25,
              bgcolor: PRIMARY,
              boxShadow: `0 1px 3px ${alpha(PRIMARY, 0.3)}`,
              '&:hover': { bgcolor: PRIMARY_DK, boxShadow: `0 4px 12px ${alpha(PRIMARY, 0.3)}` },
            }}
          >
            {nextLabel}
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default ProjectFlowFooter;

