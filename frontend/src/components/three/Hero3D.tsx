import React from 'react';
import { Box, useMediaQuery, useTheme } from '@mui/material';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Hero3D — Isometric Industrial Factory Scene
 * -----------------------------------------------------------------------------
 * SVG-based isometric illustration replicating the Switchgear Configurator dashboard hero:
 *   - Central glowing factory cube with the "F" emblem (brand gradient).
 *   - Yellow tower crane with cable + hook on the left.
 *   - Conveyor belt with boxes on the right.
 *   - Glowing concentric rings on the platform floor.
 *   - Floating accent particles for life.
 *   - Subtle bobbing/glow animation; respects prefers-reduced-motion.
 *
 * Pure SVG + CSS — no Three.js, no GLB, no iframes. Bundle-friendly.
 */

interface Hero3DProps {
  size?: number;
  primary?: string;
  accent?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
}

const Hero3D: React.FC<Hero3DProps> = ({
  size = 360,
  primary = '#1F7A63',
  accent = '#2A9D7E',
  hideBelow = 'md',
}) => {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const hidden = useMediaQuery(theme.breakpoints.down(hideBelow));
  const idGrad = React.useId();
  if (hidden) return null;
  const idCube = `${idGrad}-cube`;
  const idCubeTop = `${idGrad}-cubeTop`;
  const idCubeRight = `${idGrad}-cubeRight`;
  const idPlatform = `${idGrad}-platform`;
  const idGlow = `${idGrad}-glow`;
  const idCrane = `${idGrad}-crane`;
  const idF = `${idGrad}-fglow`;
  if (hidden) return null;

  return (
    <Box
      sx={{
        width: size,
        height: size * 0.78,
        position: 'relative',
        userSelect: 'none',
        pointerEvents: 'none',
        filter: `drop-shadow(0 24px 40px rgba(31,122,99,0.35))`,
      }}
    >
      {/* Soft radial backdrop glow */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(60% 55% at 55% 55%, ${primary}33 0%, transparent 70%)`,
          filter: 'blur(8px)',
        }}
      />

      <motion.div
        initial={{ y: 0 }}
        animate={reduce ? {} : { y: [0, -6, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
        <svg
          viewBox="0 0 400 320"
          width="100%"
          height="100%"
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            {/* Cube front gradient (brand) */}
            <linearGradient id={idCube} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primary} stopOpacity="1" />
              <stop offset="100%" stopColor={accent} stopOpacity="1" />
            </linearGradient>
            {/* Cube top (lighter) */}
            <linearGradient id={idCubeTop} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a5b4fc" />
              <stop offset="100%" stopColor={primary} />
            </linearGradient>
            {/* Cube right side (darker) */}
            <linearGradient id={idCubeRight} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0D3D2F" />
              <stop offset="100%" stopColor="#312e81" />
            </linearGradient>
            {/* Platform gradient */}
            <radialGradient id={idPlatform} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={primary} stopOpacity="0.45" />
              <stop offset="60%" stopColor={primary} stopOpacity="0.12" />
              <stop offset="100%" stopColor={primary} stopOpacity="0" />
            </radialGradient>
            {/* Glow filter */}
            <filter id={idGlow} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Crane yellow gradient */}
            <linearGradient id={idCrane} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fcd34d" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
            {/* "F" emblem glow */}
            <linearGradient id={idF} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#c7d2fe" />
            </linearGradient>
          </defs>

          {/* ---------- ISOMETRIC PLATFORM (diamond floor with grid) ---------- */}
          <g opacity="0.95">
            {/* Glow disc under platform */}
            <ellipse cx="200" cy="245" rx="170" ry="48" fill={`url(#${idPlatform})`} />

            {/* Platform top diamond */}
            <polygon
              points="200,170 360,235 200,300 40,235"
              fill="#0b1426"
              stroke={primary}
              strokeOpacity="0.35"
              strokeWidth="1"
            />
            {/* Platform inner border ring */}
            <polygon
              points="200,185 340,242 200,290 60,242"
              fill="none"
              stroke={primary}
              strokeOpacity="0.55"
              strokeWidth="1.2"
            />
            {/* Concentric glowing rings */}
            <polygon
              points="200,205 305,247 200,275 95,247"
              fill="none"
              stroke={primary}
              strokeOpacity="0.7"
              strokeWidth="1.2"
              filter={`url(#${idGlow})`}
            />
            <polygon
              points="200,222 265,250 200,265 135,250"
              fill="none"
              stroke={accent}
              strokeOpacity="0.85"
              strokeWidth="1"
              filter={`url(#${idGlow})`}
            />

            {/* Side panels (depth) */}
            <polygon points="40,235 200,300 200,310 40,245" fill="#070d1a" stroke={primary} strokeOpacity="0.25" strokeWidth="0.7" />
            <polygon points="360,235 200,300 200,310 360,245" fill="#050913" stroke={primary} strokeOpacity="0.25" strokeWidth="0.7" />

            {/* Corner glow nodes */}
            <circle cx="40" cy="235" r="3" fill={primary} filter={`url(#${idGlow})`} />
            <circle cx="360" cy="235" r="3" fill={primary} filter={`url(#${idGlow})`} />
            <circle cx="200" cy="170" r="2.5" fill={accent} filter={`url(#${idGlow})`} />
            <circle cx="200" cy="300" r="2.5" fill={accent} filter={`url(#${idGlow})`} />
          </g>

          {/* ---------- CONVEYOR BELT (right) ---------- */}
          <g>
            {/* Belt top */}
            <polygon points="240,200 330,245 305,258 215,213" fill="#1e293b" stroke={primary} strokeOpacity="0.3" strokeWidth="0.6" />
            {/* Belt side */}
            <polygon points="215,213 305,258 305,266 215,221" fill="#0f172a" />
            {/* Boxes on belt */}
            <g>
              <polygon points="245,210 263,219 263,226 245,217" fill="#334155" />
              <polygon points="245,210 251,207 269,216 263,219" fill="#475569" />
              <polygon points="263,219 269,216 269,223 263,226" fill="#1e293b" />
            </g>
            <g>
              <polygon points="278,225 296,234 296,241 278,232" fill="#475569" />
              <polygon points="278,225 284,222 302,231 296,234" fill={accent} opacity="0.85" />
              <polygon points="296,234 302,231 302,238 296,241" fill="#312e81" />
            </g>
          </g>

          {/* ---------- SECONDARY SMALL CUBE (back-left) ---------- */}
          <g>
            <polygon points="80,205 110,220 110,245 80,230" fill="#1e293b" />
            <polygon points="80,205 95,197 125,212 110,220" fill="#334155" />
            <polygon points="110,220 125,212 125,237 110,245" fill="#0f172a" />
          </g>

          {/* ---------- MAIN FACTORY CUBE (centre) ---------- */}
          <motion.g
            animate={reduce ? {} : { y: [0, -4, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            {/* Cube top */}
            <polygon
              points="200,90 270,125 200,160 130,125"
              fill={`url(#${idCubeTop})`}
              stroke={primary}
              strokeOpacity="0.6"
              strokeWidth="0.8"
            />
            {/* Cube front-left face */}
            <polygon
              points="130,125 200,160 200,235 130,200"
              fill={`url(#${idCube})`}
              stroke={primary}
              strokeOpacity="0.5"
              strokeWidth="0.6"
            />
            {/* Cube front-right face */}
            <polygon
              points="270,125 200,160 200,235 270,200"
              fill={`url(#${idCubeRight})`}
              stroke={accent}
              strokeOpacity="0.4"
              strokeWidth="0.6"
            />

            {/* Inner panel highlights */}
            <polygon points="140,135 195,162 195,225 140,195" fill="none" stroke="#a5b4fc" strokeOpacity="0.18" strokeWidth="0.6" />
            <polygon points="260,135 205,162 205,225 260,195" fill="none" stroke="#d6efe5" strokeOpacity="0.18" strokeWidth="0.6" />

            {/* Glowing "F" emblem on front-left face */}
            <g filter={`url(#${idGlow})`}>
              <text
                x="165"
                y="195"
                fontFamily="Inter, system-ui, -apple-system, sans-serif"
                fontWeight="900"
                fontSize="42"
                fill={`url(#${idF})`}
                style={{ letterSpacing: '-0.02em' }}
              >F</text>
            </g>

            {/* Top emissive line */}
            <polyline
              points="200,90 270,125 200,160 130,125 200,90"
              fill="none"
              stroke="#e0e7ff"
              strokeOpacity="0.35"
              strokeWidth="0.5"
            />
          </motion.g>

          {/* ---------- TOWER CRANE (left) ---------- */}
          <g>
            {/* Mast (vertical) */}
            <polygon points="68,80 78,75 82,78 72,83" fill={`url(#${idCrane})`} />
            <polygon points="68,80 72,83 72,205 68,202" fill={`url(#${idCrane})`} />
            <polygon points="72,83 82,78 82,200 72,205" fill="#b45309" />

            {/* Mast lattice marks */}
            {[100, 130, 160, 190].map((y) => (
              <line key={y} x1="68" y1={y} x2="82" y2={y - 5} stroke="#78350f" strokeOpacity="0.6" strokeWidth="0.5" />
            ))}

            {/* Counterweight (back) */}
            <rect x="40" y="68" width="22" height="10" fill="#92400e" />
            {/* Cabin */}
            <rect x="62" y="63" width="14" height="12" fill="#fcd34d" stroke="#b45309" strokeWidth="0.5" />

            {/* Jib (horizontal arm) */}
            <polygon points="78,68 200,40 205,44 82,72" fill={`url(#${idCrane})`} />
            <polygon points="82,72 205,44 205,49 82,76" fill="#b45309" />

            {/* Jib lattice */}
            {[95, 115, 135, 155, 175, 195].map((x, i) => (
              <line key={x} x1={x} y1={70 - i * 1.5} x2={x + 4} y2={75 - i * 1.5} stroke="#78350f" strokeOpacity="0.5" strokeWidth="0.4" />
            ))}

            {/* Cable + hook */}
            <line x1="170" y1="48" x2="170" y2="120" stroke="#cbd5e1" strokeOpacity="0.7" strokeWidth="0.6" />
            <motion.g
              animate={reduce ? {} : { y: [0, 4, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            >
              <rect x="166" y="120" width="8" height="6" fill="#fcd34d" stroke="#b45309" strokeWidth="0.4" />
              <path d="M 170 126 L 170 134 Q 170 138 174 138" fill="none" stroke="#cbd5e1" strokeWidth="1" />
            </motion.g>

            {/* Top of mast peak */}
            <polygon points="68,80 75,68 82,78" fill="#fbbf24" />
          </g>

          {/* ---------- ACCENT SPHERE (top right) ---------- */}
          <motion.g
            animate={reduce ? {} : { y: [0, -8, 0], x: [0, 4, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <circle cx="320" cy="80" r="14" fill={accent} opacity="0.85" filter={`url(#${idGlow})`} />
            <circle cx="316" cy="76" r="4" fill="#ffffff" opacity="0.6" />
          </motion.g>

          {/* ---------- FLOATING PARTICLES ---------- */}
          {[
            { cx: 110, cy: 60, r: 2.5, c: primary, d: 4 },
            { cx: 340, cy: 150, r: 2, c: accent, d: 5 },
            { cx: 60, cy: 175, r: 2, c: '#06b6d4', d: 4.5 },
            { cx: 365, cy: 200, r: 1.8, c: primary, d: 3.8 },
            { cx: 30, cy: 130, r: 1.6, c: accent, d: 5.2 },
          ].map((p, i) => (
            <motion.circle
              key={i}
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill={p.c}
              filter={`url(#${idGlow})`}
              animate={reduce ? {} : { y: [0, -8, 0], opacity: [0.5, 1, 0.5] }}
              transition={{ duration: p.d, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
            />
          ))}
        </svg>
      </motion.div>
    </Box>
  );
};

export default Hero3D;
