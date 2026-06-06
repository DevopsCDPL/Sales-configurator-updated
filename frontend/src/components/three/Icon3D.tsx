import React from 'react';
import { Box } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Icon3D
 * -----------------------------------------------------------------------------
 * A drop-in wrapper that turns any flat icon (MUI / SVG / element) into a
 * glossy "3D" tile with depth, highlight and a subtle hover tilt.
 *
 * Zero new dependencies. Pure CSS gradients + framer-motion (already in deps).
 * Lightweight: a couple of layered backgrounds — no canvas / WebGL.
 *
 * Use inside KPI cards, dashboard summary cards or feature highlights.
 */

interface Icon3DProps {
  children: React.ReactNode;
  /** Tile accent / brand colour. */
  color: string;
  /** Tile pixel size (square). Default 46. */
  size?: number;
  /** Border radius. Default 12. */
  radius?: number;
  /** Disable the hover tilt animation. */
  staticTile?: boolean;
}

const Icon3D: React.FC<Icon3DProps> = ({
  children,
  color,
  size = 46,
  radius = 12,
  staticTile = false,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const animated = !staticTile && !prefersReducedMotion;

  const Wrapper: any = animated ? motion.div : 'div';
  const animProps = animated
    ? {
        whileHover: { rotateX: -10, rotateY: 12, scale: 1.06 },
        transition: { type: 'spring', stiffness: 220, damping: 18 },
      }
    : {};

  return (
    <Box
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        perspective: '600px',
        display: 'inline-flex',
      }}
    >
      <Wrapper
        {...animProps}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: radius,
          position: 'relative',
          transformStyle: 'preserve-3d',
          // Layered gradients give a glossy, faux-3D ball/tile look.
          background: `
            radial-gradient(circle at 30% 22%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 45%),
            linear-gradient(160deg, ${withAlpha(color, 0.32)} 0%, ${withAlpha(color, 0.14)} 55%, ${withAlpha(color, 0.06)} 100%)
          `,
          boxShadow: `
            inset 0 1px 0 rgba(255,255,255,0.7),
            inset 0 -3px 8px ${withAlpha(color, 0.22)},
            0 6px 14px -4px ${withAlpha(color, 0.35)},
            0 2px 4px rgba(15,23,42,0.06)
          `,
          border: `1px solid ${withAlpha(color, 0.22)}`,
          color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Top specular highlight */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            top: 2,
            left: '12%',
            right: '12%',
            height: '38%',
            borderRadius: `${radius - 2}px ${radius - 2}px 50% 50%`,
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 100%)',
            pointerEvents: 'none',
            opacity: 0.55,
          }}
        />
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {children}
        </Box>
      </Wrapper>
    </Box>
  );
};

function withAlpha(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  const full =
    cleaned.length === 3
      ? cleaned.split('').map((c) => c + c).join('')
      : cleaned;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default Icon3D;
