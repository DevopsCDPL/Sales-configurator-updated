/**
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * SHARED UI COMPONENTS â€” Enterprise SaaS Design System
 * Reusable section cards, headers, field helpers, input styles, table wrappers,
 * status badges, progress bars, animated containers, and separators
 * used across ALL tabs for visual consistency.
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */
import React, { useState } from 'react';
import { Box, Typography, Chip, LinearProgress, alpha, Collapse, IconButton } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, CheckCircle2, Clock, AlertCircle,
  CircleDashed, ArrowLeft, ArrowRight, Info,
} from 'lucide-react';

/* â”€â”€â”€ Design Tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export const UI = {
  /* Colors — Unified Cyan / Dark Industrial */
  primary:        '#33d6ff',
  primaryLight:   '#5ce0ff',
  primaryDark:    '#00bce0',
  primaryBg:      'rgba(51, 214, 255, 0.10)',

  textPrimary:    'var(--text-primary)',
  textSecondary:  'var(--text-secondary)',
  textMuted:      'var(--text-muted)',
  textLight:      'var(--text-muted)',

  /* Aliases for convenience */
  text:           'var(--text-primary)',
  card:           'var(--bg-surface)',
  muted:          'var(--bg-canvas)',

  border:         'var(--border)',
  borderLight:    'var(--border-subtle)',
  bg:             'var(--bg-canvas)',
  bgCard:         'var(--bg-surface)',
  bgSubtle:       'var(--bg-canvas)',

  danger:         '#f87171',
  dangerBg:       'rgba(248, 113, 113, 0.12)',

  /* Radius */
  radius:         '12px',
  radiusSm:       '8px',
  radiusXs:       '6px',
  radius2xl:      '14px',

  /* Shadows — dark system */
  shadow:         '0 1px 2px rgba(0,0,0,0.40)',
  shadowMd:       '0 4px 12px rgba(0,0,0,0.50)',
  shadowLg:       '0 8px 24px rgba(0,0,0,0.60)',
  shadowGlow:     '0 0 16px rgba(0, 200, 255, 0.10)',

  /* Brand colors — flat */
  gradient:       '#00c8ff',
  gradientHover:  '#33d4ff',
  gradientSoft:   'rgba(0,200,255,0.04)',
  gradientHeaderBg: 'var(--bg-surface)',
  gradientTextDark: 'var(--text-primary)',
} as const;

/* ─── Solid Brand Text mixin (use as `sx={gradientTextSx}`) ────────── */
export const gradientTextSx = {
  color: 'var(--text-primary)',
} as const;

export const gradientBrandTextSx = {
  color: UI.primary,
} as const;

/* â”€â”€â”€ Standardized Input Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export const inputSx = (disabled = false) => ({
  '& .MuiOutlinedInput-root': {
    height: 38,
    fontSize: '0.8125rem',
    fontFamily: '"Inter", sans-serif',
    color: UI.textPrimary,
    backgroundColor: disabled ? UI.bgSubtle : '#fff',
    borderRadius: UI.radiusXs,
    transition: 'all 0.2s ease',
    '& fieldset':            { borderColor: UI.border, borderWidth: 1 },
    '&:hover fieldset':      { borderColor: disabled ? UI.border : UI.textLight },
    '&.Mui-focused fieldset': { borderColor: UI.primary, borderWidth: 2, boxShadow: '0 0 0 3px rgba(0, 200, 255, 0.20)' },
  },
});

export const textareaSx = (disabled = false) => ({
  '& .MuiOutlinedInput-root': {
    fontSize: '0.8125rem',
    fontFamily: '"Inter", sans-serif',
    color: UI.textPrimary,
    backgroundColor: disabled ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.015)',
    borderRadius: UI.radiusXs,
    transition: 'all 0.2s ease',
    '& fieldset':            { borderColor: UI.border, borderWidth: 1 },
    '&:hover fieldset':      { borderColor: disabled ? UI.border : 'rgba(255,255,255,0.18)' },
    '&.Mui-focused fieldset': { borderColor: UI.primary, borderWidth: 1, boxShadow: '0 0 0 3px rgba(0, 200, 255, 0.10)' },
  },
});

export const selectSx = (disabled = false) => ({
  height: 38,
  fontSize: '0.8125rem',
  fontFamily: '"Inter", sans-serif',
  color: UI.textPrimary,
  backgroundColor: disabled ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.015)',
  borderRadius: UI.radiusXs,
  transition: 'all 0.2s ease',
  '& .MuiOutlinedInput-notchedOutline':                 { borderColor: UI.border },
  '&:hover .MuiOutlinedInput-notchedOutline':            { borderColor: disabled ? UI.border : 'rgba(255,255,255,0.18)' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline':      { borderColor: UI.primary, borderWidth: 1, boxShadow: '0 0 0 3px rgba(0, 200, 255, 0.10)' },
});

/* â”€â”€â”€ Field Label â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface FieldLabelProps {
  children: React.ReactNode;
  required?: boolean;
}
export const FieldLabel: React.FC<FieldLabelProps> = ({ children, required }) => (
  <Typography
    component="label"
    sx={{
      display: 'block',
      mb: '4px',
      fontSize: '0.6875rem',
      fontWeight: 400,
      color: UI.textSecondary,
      lineHeight: 1.3,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      fontFamily: '"Inter", sans-serif',
    }}
  >
    {children}
    {required && <span className="required-asterisk">*</span>}
  </Typography>
);

/* â”€â”€â”€ Field Group Wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface FieldGroupProps {
  children: React.ReactNode;
  fullWidth?: boolean;
}
export const FieldGroup: React.FC<FieldGroupProps> = ({ children, fullWidth }) => (
  <Box sx={{ mb: '12px', gridColumn: fullWidth ? '1 / -1' : undefined }}>{children}</Box>
);

/* â”€â”€â”€ Section Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface SectionCardProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
  subtitle?: string;
  accentColor?: string;
  action?: React.ReactNode;
  noPadding?: boolean;
  sx?: object;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  children, icon, title, subtitle, accentColor, action, noPadding, sx,
}) => (
  <Box
    sx={{
      backgroundColor: UI.bgCard,
      border: `1px solid ${UI.border}`,
      borderRadius: UI.radius,
      boxShadow: UI.shadow,
      overflow: 'hidden',
      transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      '&:hover': { borderColor: 'var(--border-strong)' },
      ...(accentColor ? { borderTop: `3px solid ${accentColor}` } : {}),
      ...sx,
    }}
  >
    {title && (
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2.5, py: 2,
        borderBottom: `1px solid ${UI.borderLight}`,
        backgroundColor: UI.gradientHeaderBg,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {icon && (
            <Box sx={{
              width: 38, height: 38, borderRadius: '10px',
              backgroundColor: accentColor ? `${accentColor}22` : UI.primaryBg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${accentColor ? `${accentColor}44` : 'rgba(0,200,255,0.18)'}`,
              '& svg': { fontSize: 18, color: accentColor ?? UI.primary },
            }}>
              {icon}
            </Box>
          )}
          <Box>
            <Typography sx={{
              fontSize: '1.0625rem',
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.025em',
              fontFamily: '"Inter", sans-serif',
              ...gradientTextSx,
            }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography sx={{ fontSize: '0.75rem', color: UI.textMuted, mt: '2px', fontWeight: 500, fontFamily: '"Inter", sans-serif' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        {action}
      </Box>
    )}
    <Box sx={{ p: noPadding ? 0 : 2.5 }}>{children}</Box>
  </Box>
);

/* â”€â”€â”€ Section Header (standalone, for inside cards) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}
export const SectionHeader: React.FC<SectionHeaderProps> = ({ icon, title, subtitle, action }) => (
  <Box sx={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    mb: 2, pb: 1.75,
    borderBottom: `1px solid ${UI.borderLight}`,
  }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{
        width: 40, height: 40, borderRadius: '12px',
        background: UI.gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: UI.shadowGlow,
        '& svg': { fontSize: 18, color: '#fff' },
      }}>
        {icon}
      </Box>
      <Box>
        <Typography sx={{
          fontWeight: 800, fontSize: '1.0625rem',
          lineHeight: 1.15, letterSpacing: '-0.025em',
          fontFamily: '"Inter", sans-serif',
          ...gradientTextSx,
        }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ fontSize: '0.75rem', color: UI.textMuted, mt: '2px', fontWeight: 500, fontFamily: '"Inter", sans-serif' }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
    {action}
  </Box>
);

/* â”€â”€â”€ Table Wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface TableWrapperProps {
  children: React.ReactNode;
}
export const TableWrapper: React.FC<TableWrapperProps> = ({ children }) => (
  <Box sx={{
    border: `1px solid ${UI.border}`,
    borderRadius: UI.radiusSm,
    overflow: 'hidden',
    '& table': {
      width: '100%',
      borderCollapse: 'collapse',
      fontFamily: '"Inter", sans-serif',
    },
    '& thead': {
      background: UI.bgSubtle,
      '& th': {
        padding: '10px 14px',
        fontSize: '0.6875rem',
        fontWeight: 500,
        color: UI.textLight,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        borderBottom: `2px solid ${UI.border}`,
        textAlign: 'left',
        fontFamily: '"Inter", sans-serif',
        whiteSpace: 'nowrap',
      },
    },
    '& tbody': {
      '& tr': {
        transition: 'background 0.15s ease',
        '&:hover': { background: 'var(--bg-surface-2)' },
      },
      '& td': {
        padding: '10px 14px',
        fontSize: '0.8125rem',
        color: UI.textSecondary,
        borderBottom: `1px solid ${UI.borderLight}`,
        fontFamily: '"Inter", sans-serif',
        verticalAlign: 'middle',
      },
      '& tr:last-child td': { borderBottom: 'none' },
    },
  }}>
    {children}
  </Box>
);

/* â”€â”€â”€ Tab Container â€” wraps each tab's content for spacing / bg â”€â”€â”€â”€â”€â”€â”€â”€ */
interface TabContainerProps {
  children: React.ReactNode;
  maxWidth?: number;
}
export const TabContainer: React.FC<TabContainerProps> = ({ children, maxWidth }) => (
  <Box sx={{
    ...(maxWidth ? { maxWidth, mx: 'auto' } : { width: '100%' }),
    px: 0,
    py: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2.5,        // consistent 20px gap between sections
  }}>
    {children}
  </Box>
);

/* â”€â”€â”€ Navigation Footer (Back / Next) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface NavFooterProps {
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  extra?: React.ReactNode;
}
export const NavFooter: React.FC<NavFooterProps> = ({
  onBack, onNext, backLabel = 'Back', nextLabel = 'Next', nextDisabled, extra,
}) => (
  <Box sx={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    pt: 2.5, mt: 1,
    borderTop: `1px solid ${UI.border}`,
  }}>
    <Box>
      {onBack && (
        <Typography
          onClick={onBack}
          sx={{
            fontSize: '0.8125rem', fontWeight: 600, color: UI.textMuted,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5,
            '&:hover': { color: UI.primary },
            transition: 'color 0.15s',
          }}
        >
          â† {backLabel}
        </Typography>
      )}
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      {extra}
      {onNext && (
        <Typography
          onClick={nextDisabled ? undefined : onNext}
          sx={{
            fontSize: '0.8125rem', fontWeight: 600,
            color: nextDisabled ? UI.textLight : UI.primary,
            cursor: nextDisabled ? 'default' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 0.5,
            '&:hover': nextDisabled ? {} : { color: UI.primaryDark },
            transition: 'color 0.15s',
          }}
        >
          {nextLabel} â†’
        </Typography>
      )}
    </Box>
  </Box>
);

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ENHANCED COMPONENTS â€” Enterprise SaaS Patterns
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

/* â”€â”€â”€ Framer Motion Wrappers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export const MotionBox = motion(Box);

export const AnimatedSection: React.FC<{ children: React.ReactNode; delay?: number }> = ({ children, delay = 0 }) => (
  <MotionBox
    initial="hidden"
    animate="visible"
    variants={{ ...fadeUp, visible: { ...fadeUp.visible, transition: { ...fadeUp.visible.transition, delay } } }}
  >
    {children}
  </MotionBox>
);

export const StaggerList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MotionBox initial="hidden" animate="visible" variants={staggerContainer}>
    {children}
  </MotionBox>
);

export const StaggerItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <MotionBox variants={fadeUp}>{children}</MotionBox>
);

/* â”€â”€â”€ Status Badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const STATUS_STYLES: Record<string, { bg: string; fg: string; icon?: React.ReactNode }> = {
  draft:           { bg: 'var(--border-subtle)', fg: '#6B7280', icon: <CircleDashed size={12} /> },
  estimated:       { bg: '#EFF6FF', fg: '#166354', icon: <Clock size={12} /> },
  quoted:          { bg: '#E8F7F2', fg: '#166354', icon: <Clock size={12} /> },
  confirmed:       { bg: '#E8F7F2', fg: '#1F7A63', icon: <CheckCircle2 size={12} /> },
  order_confirmed: { bg: '#E8F7F2', fg: '#1F7A63', icon: <CheckCircle2 size={12} /> },
  in_production:   { bg: '#FFF7ED', fg: '#EA580C', icon: <Clock size={12} /> },
  production:      { bg: '#FFF7ED', fg: '#EA580C', icon: <Clock size={12} /> },
  inspected:       { bg: '#ECFEFF', fg: '#0891B2', icon: <CheckCircle2 size={12} /> },
  shipped:         { bg: '#E8F7F2', fg: '#0D3D2F', icon: <CheckCircle2 size={12} /> },
  completed:       { bg: '#E8F7F2', fg: '#16A34A', icon: <CheckCircle2 size={12} /> },
  closed:          { bg: 'var(--bg-surface-2)', fg: '#374151', icon: <CheckCircle2 size={12} /> },
  issue:           { bg: '#FEF2F2', fg: '#DC2626', icon: <AlertCircle size={12} /> },
  overdue:         { bg: '#FEF2F2', fg: '#DC2626', icon: <AlertCircle size={12} /> },
  pending:         { bg: '#FEF9C3', fg: '#CA8A04', icon: <Clock size={12} /> },
  active:          { bg: '#E8F7F2', fg: '#1F7A63', icon: <CheckCircle2 size={12} /> },
  inactive:        { bg: 'var(--border-subtle)', fg: 'var(--text-muted)', icon: <CircleDashed size={12} /> },
  approved:        { bg: '#E8F7F2', fg: '#16A34A', icon: <CheckCircle2 size={12} /> },
  rejected:        { bg: '#FEF2F2', fg: '#DC2626', icon: <AlertCircle size={12} /> },
  sent:            { bg: '#EFF6FF', fg: '#166354', icon: <CheckCircle2 size={12} /> },
  paid:            { bg: '#E8F7F2', fg: '#16A34A', icon: <CheckCircle2 size={12} /> },
  unpaid:          { bg: '#FEF9C3', fg: '#CA8A04', icon: <Clock size={12} /> },
  partial:         { bg: '#FFF7ED', fg: '#EA580C', icon: <Clock size={12} /> },
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  size?: 'sm' | 'md';
}
export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, size = 'sm' }) => {
  const key = status?.toLowerCase().replace(/\s+/g, '_') || 'draft';
  const style = STATUS_STYLES[key] || STATUS_STYLES.draft;
  const displayLabel = label || status?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Draft';
  return (
    <Chip
      size="small"
      icon={<Box sx={{ display: 'flex', alignItems: 'center', ml: 0.5 }}>{style.icon}</Box>}
      label={displayLabel}
      sx={{
        height: size === 'sm' ? 22 : 26,
        fontSize: size === 'sm' ? '0.68rem' : '0.75rem',
        fontWeight: 600,
        bgcolor: style.bg,
        color: style.fg,
        border: `1px solid ${alpha(style.fg, 0.15)}`,
        borderRadius: '6px',
        '& .MuiChip-label': { px: 0.75 },
        '& .MuiChip-icon': { color: style.fg },
        letterSpacing: '0.01em',
        fontFamily: '"Inter", sans-serif',
      }}
    />
  );
};

/* â”€â”€â”€ Progress Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface ProgressBarProps {
  value: number;       // 0â€“100
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md';
  color?: string;
}
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value, label, showPercentage = true, size = 'sm', color = UI.primary,
}) => (
  <Box>
    {(label || showPercentage) && (
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        {label && <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500, color: UI.textMuted }}>{label}</Typography>}
        {showPercentage && <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, color }}>{Math.round(value)}%</Typography>}
      </Box>
    )}
    <LinearProgress
      variant="determinate"
      value={Math.min(100, Math.max(0, value))}
      sx={{
        height: size === 'sm' ? 5 : 8,
        borderRadius: 4,
        bgcolor: alpha(color, 0.08),
        '& .MuiLinearProgress-bar': {
          borderRadius: 4,
          background: `linear-gradient(90deg, ${color}, ${alpha(color, 0.75)})`,
          transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
        },
      }}
    />
  </Box>
);

/* â”€â”€â”€ Separator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface SeparatorProps {
  label?: string;
  spacing?: number;
}
export const Separator: React.FC<SeparatorProps> = ({ label, spacing = 2 }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: spacing }}>
    <Box sx={{ flex: 1, height: 1, bgcolor: UI.border }} />
    {label && (
      <Typography sx={{
        fontSize: '0.625rem', fontWeight: 600, color: UI.textLight,
        textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
      }}>
        {label}
      </Typography>
    )}
    {label && <Box sx={{ flex: 1, height: 1, bgcolor: UI.border }} />}
  </Box>
);

/* â”€â”€â”€ Accordion Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface AccordionSectionProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  accentColor?: string;
  badge?: React.ReactNode;
}
export const AccordionSection: React.FC<AccordionSectionProps> = ({
  icon, title, subtitle, children, defaultOpen = true, accentColor = UI.primary, badge,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box sx={{
      backgroundColor: UI.bgCard,
      border: `1px solid ${UI.border}`,
      borderRadius: UI.radius,
      boxShadow: UI.shadow,
      overflow: 'hidden',
      transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
      '&:hover': { boxShadow: UI.shadowMd, borderColor: '#D1D5DB' },
      borderTop: `3px solid ${accentColor}`,
    }}>
      <Box
        onClick={() => setOpen(v => !v)}
        sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2.5, py: 1.75, cursor: 'pointer',
          borderBottom: open ? `1px solid ${UI.borderLight}` : 'none',
          background: UI.bgSubtle,
          transition: 'background 0.15s ease',
          '&:hover': { background: alpha(accentColor, 0.03) },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          {icon && (
            <Box sx={{
              width: 32, height: 32, borderRadius: UI.radiusXs,
              background: `linear-gradient(135deg, ${alpha(accentColor, 0.1)}, ${alpha(accentColor, 0.04)})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${alpha(accentColor, 0.1)}`,
              color: accentColor,
            }}>
              {icon}
            </Box>
          )}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{
                fontSize: '0.875rem', fontWeight: 600, color: UI.textPrimary,
                lineHeight: 1.2, letterSpacing: '-0.01em', fontFamily: '"Inter", sans-serif',
              }}>
                {title}
              </Typography>
              {badge}
            </Box>
            {subtitle && (
              <Typography sx={{ fontSize: '0.6875rem', color: UI.textMuted, mt: 0.15, fontFamily: '"Inter", sans-serif' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
        <IconButton size="small" sx={{ color: UI.textLight, p: 0.5 }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Box sx={{ p: 2.5 }}>{children}</Box>
      </Collapse>
    </Box>
  );
};

/* â”€â”€â”€ Info Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface InfoBannerProps {
  children?: React.ReactNode;
  message?: React.ReactNode;
  variant?: 'info' | 'warning' | 'success' | 'error';
}
export const InfoBanner: React.FC<InfoBannerProps> = ({ children, message, variant = 'info' }) => {
  const content = children ?? message;
  const colors = {
    info: { bg: '#EFF6FF', fg: '#166354', border: '#BFDBFE' },
    warning: { bg: '#FEF9C3', fg: '#CA8A04', border: '#FDE68A' },
    success: { bg: '#E8F7F2', fg: '#16A34A', border: '#BBF7D0' },
    error: { bg: '#FEF2F2', fg: '#DC2626', border: '#FECACA' },
  };
  const c = colors[variant];
  return (
    <Box sx={{
      display: 'flex', alignItems: 'flex-start', gap: 1,
      px: 2, py: 1.5, borderRadius: UI.radiusSm,
      bgcolor: c.bg, border: `1px solid ${c.border}`,
    }}>
      <Info size={14} style={{ color: c.fg, marginTop: 2, flexShrink: 0 }} />
      {typeof content === 'string' ? (
        <Typography sx={{ fontSize: '0.8rem', color: c.fg, fontWeight: 500, lineHeight: 1.5 }}>
          {content}
        </Typography>
      ) : content}
    </Box>
  );
};

/* â”€â”€â”€ Stat Card (KPI) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}
export const StatCard: React.FC<StatCardProps> = ({ icon, label, value, sub, color = UI.primary }) => (
  <MotionBox
    variants={fadeUp}
    sx={{
      flex: '1 1 160px',
      minWidth: 140,
      display: 'flex', alignItems: 'center', gap: 1.5,
      bgcolor: UI.bgCard,
      border: `1px solid ${UI.border}`,
      borderLeft: `3px solid ${color}`,
      borderRadius: UI.radiusSm,
      boxShadow: UI.shadow,
      py: 1.75, px: 2,
      transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
      '&:hover': { boxShadow: UI.shadowMd, transform: 'translateY(-1px)' },
    }}
  >
    <Box sx={{
      width: 36, height: 36, borderRadius: UI.radiusXs, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      bgcolor: alpha(color, 0.08), color,
    }}>
      {icon}
    </Box>
    <Box>
      <Typography sx={{
        fontSize: '0.625rem', fontWeight: 600, color: UI.textLight,
        textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.2, mb: '2px',
      }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, color: UI.textPrimary, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {value}
      </Typography>
      {sub && <Typography sx={{ fontSize: '0.65rem', fontWeight: 500, color, mt: '2px' }}>{sub}</Typography>}
    </Box>
  </MotionBox>
);

/* â”€â”€â”€ Enhanced Nav Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface EnhancedNavFooterProps {
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  extra?: React.ReactNode;
}
export const EnhancedNavFooter: React.FC<EnhancedNavFooterProps> = ({
  onBack, onNext, backLabel = 'Back', nextLabel = 'Next Step', nextDisabled, extra,
}) => (
  <MotionBox
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.3 }}
    sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      pt: 2.5, mt: 1,
      borderTop: `1px solid ${UI.border}`,
    }}
  >
    <Box>
      {onBack && (
        <Box
          onClick={onBack}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.75,
            fontSize: '0.8125rem', fontWeight: 600, color: UI.textMuted,
            cursor: 'pointer', borderRadius: UI.radiusXs,
            px: 1.5, py: 0.75,
            transition: 'all 0.15s ease',
            '&:hover': { color: UI.primary, bgcolor: alpha(UI.primary, 0.04) },
          }}
        >
          <ArrowLeft size={15} /> {backLabel}
        </Box>
      )}
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      {extra}
      {onNext && (
        <Box
          onClick={nextDisabled ? undefined : onNext}
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.75,
            fontSize: '0.8125rem', fontWeight: 600,
            color: nextDisabled ? UI.textLight : '#fff',
            bgcolor: nextDisabled ? UI.borderLight : UI.primary,
            cursor: nextDisabled ? 'default' : 'pointer',
            borderRadius: UI.radiusXs,
            px: 2, py: 0.75,
            transition: 'all 0.2s ease',
            boxShadow: nextDisabled ? 'none' : `0 1px 3px ${alpha(UI.primary, 0.3)}`,
            '&:hover': nextDisabled ? {} : { bgcolor: UI.primaryDark, boxShadow: `0 4px 12px ${alpha(UI.primary, 0.3)}` },
          }}
        >
          {nextLabel} <ArrowRight size={15} />
        </Box>
      )}
    </Box>
  </MotionBox>
);

/* â”€â”€â”€ Empty State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, actionLabel, onAction }) => (
  <Box sx={{
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    py: 6, px: 3, textAlign: 'center',
  }}>
    {icon && (
      <Box sx={{
        width: 56, height: 56, borderRadius: '14px',
        bgcolor: UI.borderLight, display: 'flex', alignItems: 'center', justifyContent: 'center',
        mb: 2, color: UI.textLight,
      }}>
        {icon}
      </Box>
    )}
    <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: UI.textPrimary, mb: 0.5 }}>
      {title}
    </Typography>
    {description && (
      <Typography sx={{ fontSize: '0.8125rem', color: UI.textMuted, maxWidth: 320, lineHeight: 1.5, mb: actionLabel ? 2 : 0 }}>
        {description}
      </Typography>
    )}
    {actionLabel && onAction && (
      <Box
        onClick={onAction}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          fontSize: '0.8125rem', fontWeight: 600, color: '#fff',
          bgcolor: UI.primary, borderRadius: UI.radiusXs,
          px: 2.5, py: 1, cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: `0 1px 3px ${alpha(UI.primary, 0.3)}`,
          '&:hover': { bgcolor: UI.primaryDark, boxShadow: `0 4px 12px ${alpha(UI.primary, 0.3)}` },
        }}
      >
        {actionLabel}
      </Box>
    )}
  </Box>
);

/* â”€â”€â”€ Page Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  /** Use brand gradient (blueâ†’indigoâ†’violet) for title text instead of slate-dark gradient */
  brandGradient?: boolean;
}
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, action, icon, brandGradient }) => (
  <Box sx={{
    display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between',
    mb: 3, flexWrap: 'wrap', gap: 2,
  }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      {icon && (
        <Box sx={{
          width: 48, height: 48, borderRadius: '14px',
          background: UI.gradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          '& svg': { fontSize: 22, color: '#fff' },
          boxShadow: UI.shadowGlow,
        }}>
          {icon}
        </Box>
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{
          fontSize: { xs: 22, md: 28 }, fontWeight: 800,
          letterSpacing: '-0.035em', lineHeight: 1.1,
          fontFamily: '"Inter", sans-serif',
          ...(brandGradient ? gradientBrandTextSx : gradientTextSx),
        }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ fontSize: { xs: 13, md: 14 }, color: UI.textMuted, mt: '6px', fontWeight: 500 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
    </Box>
    {action && (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>
        {action}
      </Box>
    )}
  </Box>
);

