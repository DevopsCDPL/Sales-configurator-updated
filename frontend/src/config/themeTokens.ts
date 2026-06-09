/**
 * Theme Tokens — Phase 3 foundational migration
 * ════════════════════════════════════════════════════════════════════════
 * NON-BREAKING ADDITION. The existing Forge `theme.ts` continues to be
 * the active MUI theme. This module ships:
 *
 *   1. A "Lightning Blue" palette token set (target brand for the
 *      configurator migration). Tokens are exported as a plain object;
 *      consumers opt in.
 *   2. A CSS variable bridge — `installThemeVariables()` writes both the
 *      brand palette and dark-mode infra to :root so that legacy
 *      var(--text-primary)/var(--border) references keep working while
 *      Phase 4 components can read the new tokens directly.
 *   3. A reusable `extendMuiTheme(base, mode)` helper that returns a new
 *      MUI theme with the lightning-blue palette + dark-mode wiring,
 *      WITHOUT mutating the active theme.
 *
 * Phase 4 will flip the global theme to use these tokens. Phase 3 stops
 * at "infrastructure initialized cleanly" per the acceptance criteria.
 * ════════════════════════════════════════════════════════════════════════
 */
import { createTheme, alpha } from '@mui/material/styles';
import type { PaletteMode, Theme } from '@mui/material';

/* ─── Brand palette: Professional Blue (Material Design) ─────────────── */
export const LIGHTNING_BLUE = {
  50:  '#E3F2FD',
  100: '#BBDEFB',
  200: '#90CAF9',
  300: '#64B5F6',
  400: '#42A5F5',
  500: '#1976D2',   // primary
  600: '#1565C0',
  700: '#0D47A1',
  800: '#0A3880',
  900: '#082560',
} as const;

/* ─── Light/Dark surface tokens ──────────────────────────────────────── */
export const LIGHT_TOKENS = {
  bgCanvas:     '#f5f7fa',
  bgSurface:    '#ffffff',
  bgSurface2:   '#fafbfc',
  bgSurface3:   '#f4f6f9',
  bgInput:      '#f6f8fb',
  border:       '#e4e8ee',
  borderSubtle: '#eef1f5',
  borderStrong: '#d6dbe2',
  textPrimary:  '#0b1220',
  textSecondary:'#4a5365',
  textMuted:    '#8b93a3',
  textDisabled: '#b6bcc7',
  sidebar:      '#ffffff',
  sidebarActive:'#f0f4fa',
} as const;

export const DARK_TOKENS = {
  bgCanvas:     '#000000',
  bgSurface:    '#0a0d12',
  bgSurface2:   '#0e1218',
  bgSurface3:   '#131822',
  bgInput:      'rgba(255, 255, 255, 0.015)',
  border:       'rgba(255, 255, 255, 0.06)',
  borderSubtle: 'rgba(255, 255, 255, 0.04)',
  borderStrong: 'rgba(255, 255, 255, 0.10)',
  textPrimary:  '#f0f6ff',
  textSecondary:'#d9e4fb',
  textMuted:    '#9ab0d0',
  textDisabled: '#4d5c78',
  sidebar:      '#050709',
  sidebarActive:'rgba(255, 255, 255, 0.04)',
} as const;

export type ThemeTokens = {
  bgCanvas: string;
  bgSurface: string;
  bgSurface2: string;
  bgSurface3: string;
  bgInput: string;
  border: string;
  borderSubtle: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDisabled: string;
  sidebar: string;
  sidebarActive: string;
};

/* ─── CSS variable bridge ───────────────────────────────────────────── */
/**
 * Writes brand palette + mode-aware surface tokens to :root as CSS custom
 * properties. Idempotent. Safe to call on mount + on mode toggle.
 *
 *   --lb-50 … --lb-900       — brand ramp
 *   --bg-canvas / --bg-surface / --bg-surface-2 / --bg-surface-3
 *   --bg-input / --bg-sidebar / --bg-sidebar-active
 *   --border / --border-subtle / --border-strong
 *   --text-primary / --text-secondary / --text-muted / --text-disabled
 *
 * Existing legacy variable names (--text-primary, --border, --bg-canvas,
 * etc.) are preserved for back-compat with Forge components.
 */
export function installThemeVariables(mode: PaletteMode = 'light'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const tokens = mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;

  // Brand ramp (always written; mode-independent)
  for (const [shade, hex] of Object.entries(LIGHTNING_BLUE)) {
    root.style.setProperty(`--lb-${shade}`, hex);
  }
  root.style.setProperty('--lb-primary', LIGHTNING_BLUE[500]);

  // Surface tokens (mode-aware)
  root.style.setProperty('--bg-canvas',         tokens.bgCanvas);
  root.style.setProperty('--bg-surface',        tokens.bgSurface);
  root.style.setProperty('--bg-surface-2',      tokens.bgSurface2);
  root.style.setProperty('--bg-surface-3',      tokens.bgSurface3);
  root.style.setProperty('--bg-input',          tokens.bgInput);
  root.style.setProperty('--bg-sidebar',        tokens.sidebar);
  root.style.setProperty('--bg-sidebar-active', tokens.sidebarActive);

  root.style.setProperty('--border',         tokens.border);
  root.style.setProperty('--border-subtle',  tokens.borderSubtle);
  root.style.setProperty('--border-strong',  tokens.borderStrong);

  root.style.setProperty('--text-primary',   tokens.textPrimary);
  root.style.setProperty('--text-secondary', tokens.textSecondary);
  root.style.setProperty('--text-muted',     tokens.textMuted);
  root.style.setProperty('--text-disabled',  tokens.textDisabled);

  // Expose mode for CSS selectors that want to scope rules.
  root.setAttribute('data-theme', mode);
}

/* ─── Optional MUI theme extension ──────────────────────────────────── */
/**
 * Returns a NEW theme derived from `base` with the lightning-blue palette
 * + dark-mode-aware surfaces applied. Does NOT mutate `base`.
 *
 * Intended use: wrapping configurator/drawing-generation routes in a
 * scoped <ThemeProvider> during Phase 4 rollout without touching the
 * global theme.
 */
export function extendMuiTheme(base: Theme, mode: PaletteMode = 'light'): Theme {
  const tokens = mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  return createTheme(base, {
    palette: {
      mode,
      primary: {
        main: LIGHTNING_BLUE[500],
        light: LIGHTNING_BLUE[400],
        dark: LIGHTNING_BLUE[700],
        contrastText: '#fff',
      },
      background: {
        default: tokens.bgCanvas,
        paper: tokens.bgSurface,
      },
      text: {
        primary: tokens.textPrimary,
        secondary: tokens.textSecondary,
        disabled: tokens.textDisabled,
      },
      divider: tokens.border,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 8,
            boxShadow: `0 1px 2px ${alpha(LIGHTNING_BLUE[500], 0.25)}`,
          },
        },
      },
    },
  });
}

/* ─── Convenience export of the active palette tier ─────────────────── */
export const tokensFor = (mode: PaletteMode): ThemeTokens =>
  mode === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
