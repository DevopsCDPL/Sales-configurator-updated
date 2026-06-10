import { createTheme, alpha } from '@mui/material/styles';
import type { PaletteMode } from '@mui/material';

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM — Dark Industrial MUI theme (TierPower Configurator)
// Mirrors index.css custom properties. Neon cyan brand accent.
// ═══════════════════════════════════════════════════════════════════════════

// Brand Colors — Professional Blue
const PRIMARY      = '#1976D2';
const PRIMARY_LT   = '#2563EB';   // active/selected accent
const PRIMARY_DK   = '#1565C0';
const PRIMARY_DKR  = '#0D47A1';

// Dark palette — premium industrial SaaS (deep neutral canvas, lifted slate surfaces)
const c = {
  bgCanvas:      '#000000',
  bgSurface:     '#13131E',
  bgSurface2:    '#181826',
  bgSurface3:    '#1E2235',
  bgInput:       '#000000',
  border:        '#1E2235',
  borderSubtle:  '#181826',
  borderHairline:'#15151F',
  borderStrong:  '#2A2F44',
  textPrimary:   '#E2E8F0',
  textSecondary: '#CBD5E1',
  textMuted:     '#64748B',
  textDisabled:  '#3D4663',
};

// Brand surfaces are now FLAT solids (no gradients in this theme)
const GRAD_PRIMARY       = PRIMARY;
const GRAD_PRIMARY_HOVER = PRIMARY_LT;
const SURFACE_GRADIENT   = c.bgSurface;

// Ring shadow for focus states — blue glow
const RING_PRIMARY        = `0 0 0 3px rgba(25, 118, 210, 0.15)`;
const RING_PRIMARY_STRONG = `0 0 0 4px rgba(25, 118, 210, 0.18)`;

export const createAppTheme = (_mode?: PaletteMode) => {
  // Multi-layer dark shadows
  const SHADOW_XS  = '0 1px 2px rgba(0, 0, 0, 0.40)';
  const SHADOW_SM  = '0 1px 2px rgba(0, 0, 0, 0.40), 0 1px 3px rgba(0, 0, 0, 0.30)';
  const SHADOW_MD  = '0 1px 2px rgba(0, 0, 0, 0.40), 0 4px 12px -2px rgba(0, 0, 0, 0.50)';
  const SHADOW_LG  = '0 1px 2px rgba(0, 0, 0, 0.40), 0 10px 24px -6px rgba(0, 0, 0, 0.60), 0 20px 48px -12px rgba(0, 0, 0, 0.40)';
  const SHADOW_XL  = '0 1px 2px rgba(0, 0, 0, 0.40), 0 16px 32px -8px rgba(0, 0, 0, 0.70), 0 32px 64px -16px rgba(0, 0, 0, 0.50)';
  const SHADOW_2XL = '0 2px 4px rgba(0, 0, 0, 0.50), 0 24px 48px -12px rgba(0, 0, 0, 0.80), 0 48px 96px -24px rgba(0, 0, 0, 0.60)';

  return createTheme({
    palette: {
      mode: 'dark',
      primary:    { main: PRIMARY, light: PRIMARY_LT, dark: PRIMARY_DK, contrastText: '#ffffff' },
      secondary:  { main: c.textSecondary, light: c.textMuted, dark: c.textPrimary, contrastText: '#fff' },
      background: { default: c.bgCanvas, paper: c.bgSurface },
      success:    { main: '#22C55E', light: '#86EFAC', dark: '#166534' },
      warning:    { main: PRIMARY,   light: PRIMARY_LT, dark: PRIMARY_DK },
      error:      { main: '#EF4444', light: '#FCA5A5', dark: '#991B1B' },
      info:       { main: PRIMARY,   light: PRIMARY_LT, dark: PRIMARY_DK },
      text:       { primary: c.textPrimary, secondary: c.textSecondary },
      divider:    c.border,
    },

    typography: {
      fontFamily: '"Inter", "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      h1: { fontWeight: 800, letterSpacing: '-0.035em', fontSize: '2.25rem', lineHeight: 1.12, color: c.textPrimary, fontFeatureSettings: '"ss01", "cv11"' },
      h2: { fontWeight: 700, letterSpacing: '-0.03em',  fontSize: '1.75rem', lineHeight: 1.18, color: c.textPrimary },
      h3: { fontWeight: 700, letterSpacing: '-0.022em', fontSize: '1.4375rem', lineHeight: 1.25, color: c.textPrimary },
      h4: { fontWeight: 600, letterSpacing: '-0.018em', fontSize: '1.1875rem', lineHeight: 1.3,  color: c.textPrimary },
      h5: { fontWeight: 600, letterSpacing: '-0.012em', fontSize: '1.0625rem', lineHeight: 1.35, color: c.textPrimary },
      h6: { fontWeight: 600, letterSpacing: '-0.005em', fontSize: '1rem', lineHeight: 1.4,  color: c.textPrimary },
      subtitle1: { fontWeight: 500, fontSize: '1rem', color: c.textSecondary, lineHeight: 1.5, letterSpacing: '-0.005em' },
      subtitle2: { fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.085em', textTransform: 'uppercase' as const, color: c.textMuted },
      body1: { fontSize: '0.95rem', lineHeight: 1.6, color: c.textPrimary, letterSpacing: '-0.003em' },
      body2: { fontSize: '0.875rem', lineHeight: 1.55, color: c.textSecondary },
      button: { fontWeight: 600, letterSpacing: '0.005em', textTransform: 'none' as const, fontSize: '0.95rem' },
      caption: { fontSize: '0.8125rem', color: c.textSecondary, lineHeight: 1.4, letterSpacing: '0.005em' },
      overline: { fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.085em', textTransform: 'uppercase' as const, color: c.textMuted, lineHeight: 1.4 },
    },
    shape: { borderRadius: 8 },

    shadows: [
      'none', SHADOW_XS, SHADOW_SM, SHADOW_MD, SHADOW_LG, SHADOW_XL, SHADOW_2XL,
      ...Array(18).fill(SHADOW_2XL),
    ] as any,

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            scrollbarWidth: 'thin',
            backgroundColor: c.bgCanvas,
            color: c.textPrimary,
            transition: 'background-color 0.22s cubic-bezier(0.4,0,0.2,1), color 0.22s cubic-bezier(0.4,0,0.2,1)',
            '&::-webkit-scrollbar':       { width: 10, height: 10 },
            '&::-webkit-scrollbar-track':  { background: 'transparent' },
            '&::-webkit-scrollbar-thumb':  {
              background: 'transparent',
              border: '3px solid transparent',
              backgroundClip: 'padding-box',
              borderRadius: 100,
            },
            '&:hover::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.08)', backgroundClip: 'padding-box' },
            '&::-webkit-scrollbar-thumb:hover': { background: 'rgba(255,255,255,0.16) !important', backgroundClip: 'padding-box !important' },
          },
        },
      },

      MuiButton: {
        defaultProps: { disableElevation: true, disableRipple: false },
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 6,
            fontWeight: 500,
            padding: '8px 16px',
            fontSize: '0.8125rem',
            letterSpacing: '0.005em',
            transition: 'background 0.2s ease, box-shadow 0.2s ease, transform 0.18s ease, border-color 0.2s ease, color 0.2s ease',
            '&:focus-visible': { boxShadow: RING_PRIMARY_STRONG },
            '&.Mui-disabled': { opacity: 0.35 },
          },
          contained: {
            boxShadow: SHADOW_XS,
            '&:hover': { transform: 'translateY(-1px)', boxShadow: SHADOW_MD },
            '&:active': { transform: 'translateY(0)', boxShadow: SHADOW_XS },
          },
          containedPrimary: {
            backgroundColor: PRIMARY,
            color: '#ffffff',
            boxShadow: `0 0 0 1px ${alpha(PRIMARY, 0.15)} inset, 0 1px 2px rgba(0,0,0,0.40)`,
            '&:hover': {
              backgroundColor: PRIMARY_LT,
              boxShadow: `0 0 0 1px ${alpha(PRIMARY, 0.20)} inset, 0 2px 4px rgba(0,0,0,0.50)`,
            },
            '&:active': {
              boxShadow: `0 0 0 1px ${alpha(PRIMARY, 0.12)} inset, 0 1px 2px rgba(0,0,0,0.40)`,
            },
          },
          containedSecondary: {
            backgroundColor: c.bgSurface3,
            color: c.textPrimary,
            border: `1px solid ${c.borderStrong}`,
            '&:hover': { backgroundColor: c.bgSurface2 },
          },
          outlined: {
            borderColor: c.border,
            color: c.textSecondary,
            backgroundColor: 'transparent',
            '&:hover': { backgroundColor: alpha(PRIMARY, 0.04), borderColor: c.borderStrong, color: c.textPrimary, boxShadow: SHADOW_XS },
          },
          outlinedPrimary: {
            borderColor: alpha(PRIMARY, 0.32),
            color: PRIMARY,
            backgroundColor: alpha(PRIMARY, 0.04),
            '&:hover': { backgroundColor: alpha(PRIMARY, 0.08), borderColor: alpha(PRIMARY, 0.55), color: PRIMARY_LT },
          },
          text: { color: c.textSecondary, '&:hover': { backgroundColor: alpha('#fff', 0.04), color: c.textPrimary } },
          textPrimary: { color: PRIMARY, '&:hover': { backgroundColor: alpha(PRIMARY, 0.08) } },
          sizeSmall: { padding: '5px 12px', fontSize: '0.75rem', borderRadius: 6 },
          sizeLarge: { padding: '10px 22px', fontSize: '0.875rem', borderRadius: 8 },
        },
      },

      MuiButtonGroup: {
        styleOverrides: {
          root: { boxShadow: SHADOW_XS, borderRadius: 10 },
          grouped: { borderColor: c.border },
        },
      },

      MuiToggleButtonGroup: {
        styleOverrides: {
          root: { backgroundColor: c.bgInput, borderRadius: 10, padding: 3, gap: 2 },
          grouped: { border: 'none !important', borderRadius: '8px !important', mx: 0 },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            border: 'none',
            borderRadius: 8,
            padding: '6px 14px',
            fontWeight: 600,
            fontSize: '0.8125rem',
            color: c.textMuted,
            textTransform: 'none',
            transition: 'all 0.18s ease',
            '&.Mui-selected': {
              backgroundColor: c.bgSurface2,
              color: c.textPrimary,
              boxShadow: SHADOW_SM,
              '&:hover': { backgroundColor: c.bgSurface2 },
            },
            '&:hover': { backgroundColor: alpha('#fff', 0.04) },
          },
        },
      },

      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            boxShadow: 'none',
            backgroundColor: c.bgSurface,
            backgroundImage: 'none',
            transition: 'border-color 0.22s ease, background-color 0.22s ease',
            '&:hover': { borderColor: c.borderStrong },
          },
        },
      },
      MuiCardContent: {
        styleOverrides: { root: { padding: '20px 24px', '&:last-child': { paddingBottom: 20 } } },
      },
      MuiCardHeader: {
        styleOverrides: {
          root: { padding: '20px 24px 8px' },
          title: { fontSize: '0.875rem', fontWeight: 600, letterSpacing: '-0.005em', color: '#CBD5E1' },
          subheader: { fontSize: '0.75rem', color: c.textMuted, marginTop: 2 },
        },
      },

      MuiTextField: {
        defaultProps: { variant: 'outlined', size: 'small' },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': {
              borderRadius: 6,
              fontSize: '0.8125rem',
              fontFamily: '"Inter", sans-serif',
              backgroundColor: c.bgInput,
              transition: 'background 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
              minHeight: 40,
              boxShadow: 'inset 0 1px 1px rgba(0, 0, 0, 0.20)',
              '& fieldset': { borderColor: c.border, borderWidth: 1 },
              '&:hover': { backgroundColor: c.bgSurface3 },
              '&:hover fieldset': { borderColor: c.borderStrong },
              '&.Mui-focused': {
                backgroundColor: c.bgSurface3,
                boxShadow: RING_PRIMARY,
              },
              '&.Mui-focused fieldset': { borderWidth: 1.5, borderColor: PRIMARY },
              '&.Mui-error': { boxShadow: `0 0 0 3px ${alpha('#f87171', 0.20)}` },
              '&.Mui-disabled': { backgroundColor: c.bgSurface2, opacity: 0.5 },
            },
            '& .MuiInputLabel-root': { fontSize: '0.8125rem', fontFamily: '"Inter", sans-serif', color: c.textMuted },
            '& .MuiInputLabel-root.Mui-focused': { color: PRIMARY },
            '& .MuiInputBase-input': { color: c.textPrimary, padding: '9px 12px' },
            '& .MuiInputBase-input::placeholder': { color: c.textMuted, opacity: 1 },
            '& .MuiFormHelperText-root': { marginLeft: 2, marginTop: 4, fontSize: '0.75rem' },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            backgroundColor: c.bgInput,
            boxShadow: 'inset 0 1px 1px rgba(0, 0, 0, 0.20)',
            transition: 'background 0.18s ease, box-shadow 0.18s ease',
            '&:hover': { backgroundColor: c.bgSurface3 },
            '&.Mui-focused': { backgroundColor: c.bgSurface3, boxShadow: RING_PRIMARY },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1.5, borderColor: PRIMARY },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: c.border },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.borderStrong },
          },
        },
      },
      MuiSelect: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: { borderRadius: 6, fontSize: '0.8125rem', fontFamily: '"Inter", sans-serif', minHeight: 40 },
          icon: { color: c.textDisabled },
        },
      },
      MuiInputLabel: {
        styleOverrides: { root: { fontSize: '0.8125rem', fontFamily: '"Inter", sans-serif', fontWeight: 400 } },
      },
      MuiFormControlLabel: {
        styleOverrides: { label: { fontSize: '0.8125rem', fontFamily: '"Inter", sans-serif' } },
      },

      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: 8,
            backgroundColor: c.bgSurface,
            backgroundImage: 'none',
            transition: 'box-shadow 0.22s ease, border-color 0.22s ease, background-color 0.22s ease',
          },
          outlined: { border: `1px solid ${c.border}` },
          elevation1: { boxShadow: SHADOW_SM },
          elevation2: { boxShadow: SHADOW_MD },
          elevation3: { boxShadow: SHADOW_LG },
          elevation4: { boxShadow: SHADOW_XL },
          elevation8: { boxShadow: SHADOW_XL },
          elevation12: { boxShadow: SHADOW_2XL },
          elevation24: { boxShadow: SHADOW_2XL },
        },
      },

      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 4,
            fontWeight: 600,
            fontSize: '0.6875rem',
            letterSpacing: '0.005em',
            height: 22,
            transition: 'all 0.15s ease',
          },
          filled: {
            backgroundColor: c.bgSurface2,
            color: c.textSecondary,
            border: `1px solid ${c.border}`,
            '&.MuiChip-colorPrimary': {
              backgroundColor: PRIMARY,
              color: '#ffffff',
              border: 'none',
              boxShadow: 'none',
            },
            '&.MuiChip-colorSuccess': { backgroundColor: alpha('#22C55E', 0.10), color: '#86EFAC', border: `1px solid ${alpha('#22C55E', 0.22)}` },
            '&.MuiChip-colorWarning': { backgroundColor: alpha(PRIMARY, 0.10),  color: PRIMARY,   border: `1px solid ${alpha(PRIMARY, 0.25)}` },
            '&.MuiChip-colorError':   { backgroundColor: alpha('#EF4444', 0.10), color: '#FCA5A5', border: `1px solid ${alpha('#EF4444', 0.25)}` },
            '&.MuiChip-colorInfo':    { backgroundColor: alpha(PRIMARY, 0.10),  color: PRIMARY,   border: `1px solid ${alpha(PRIMARY, 0.25)}` },
          },
          outlined: { borderWidth: 1, borderColor: c.border, backgroundColor: 'transparent', color: c.textSecondary },
          sizeSmall: { fontSize: '0.6875rem', height: 22 },
          label: { paddingLeft: 10, paddingRight: 10 },
        },
      },

      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              fontWeight: 600, fontSize: '0.6875rem', textTransform: 'uppercase',
              letterSpacing: '0.085em', backgroundColor: c.bgSurface2, color: c.textMuted,
              borderBottom: `1px solid ${c.border}`, padding: '12px 18px',
              fontFamily: '"Inter", sans-serif', whiteSpace: 'nowrap',
              position: 'sticky', top: 0, zIndex: 2,
            },
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${c.borderHairline}`, padding: '14px 18px',
            fontSize: '0.8125rem', color: c.textSecondary,
            fontFamily: '"Inter", sans-serif', verticalAlign: 'middle',
          },
          body: { color: c.textSecondary, '& strong, & b': { color: c.textPrimary, fontWeight: 600 } },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: 'background 0.15s ease, box-shadow 0.15s ease',
            '&:hover': { backgroundColor: alpha(PRIMARY, 0.04) },
            '&.Mui-selected': { backgroundColor: alpha(PRIMARY, 0.08), '&:hover': { backgroundColor: alpha(PRIMARY, 0.12) } },
            '&:last-child td': { borderBottom: 'none' },
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${c.border}`,
            boxShadow: 'none',
            backgroundColor: c.bgSurface,
            overflowX: 'auto',
          },
        },
      },

      MuiTabs: {
        styleOverrides: {
          root: {
            minHeight: 40,
            borderBottom: `1px solid ${c.border}`,
          },
          indicator: { height: 2, borderRadius: 0, backgroundColor: PRIMARY },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none', fontWeight: 500, fontSize: '0.8125rem', minHeight: 40,
            padding: '10px 16px',
            color: c.textMuted,
            letterSpacing: '-0.005em',
            transition: 'color 0.15s ease, background 0.15s ease',
            '&.Mui-selected': { fontWeight: 500, color: c.textPrimary },
            '&:hover': { color: '#CBD5E1', backgroundColor: 'rgba(30,34,53,0.6)' },
          },
        },
      },

      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 8,
            boxShadow: SHADOW_2XL,
            border: `1px solid ${c.border}`,
            backgroundColor: c.bgSurface,
            backgroundImage: 'none',
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: {
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
          },
          invisible: { backgroundColor: 'transparent', backdropFilter: 'none', WebkitBackdropFilter: 'none' },
        },
      },
      MuiDialogTitle: { styleOverrides: { root: { fontSize: '1.125rem', fontWeight: 700, pb: 0.5, pt: 2.5, px: 3, color: c.textPrimary, letterSpacing: '-0.01em' } } },
      MuiDialogContent: { styleOverrides: { root: { px: 3, py: 2 } } },
      MuiDialogActions: { styleOverrides: { root: { px: 3, py: 2, gap: 1 } } },

      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: 8, fontWeight: 500, fontSize: '0.8125rem', padding: '10px 14px', alignItems: 'center' },
          icon: { padding: '4px 0', marginRight: 10 },
          standardSuccess: { backgroundColor: alpha('#22C55E', 0.10), color: '#86EFAC', border: `1px solid ${alpha('#22C55E', 0.22)}` },
          standardError:   { backgroundColor: alpha('#EF4444', 0.10), color: '#FCA5A5', border: `1px solid ${alpha('#EF4444', 0.22)}` },
          standardWarning: { backgroundColor: alpha(PRIMARY, 0.10),  color: PRIMARY,   border: `1px solid ${alpha(PRIMARY, 0.22)}` },
          standardInfo:    { backgroundColor: alpha(PRIMARY, 0.10),  color: PRIMARY,   border: `1px solid ${alpha(PRIMARY, 0.22)}` },
          filled: { borderRadius: 8 },
          outlined: { borderRadius: 8 },
        },
      },

      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 999, height: 6, backgroundColor: c.bgSurface2 },
          bar:  { borderRadius: 999, backgroundColor: PRIMARY },
        },
      },

      MuiCircularProgress: {
        styleOverrides: {
          colorPrimary: { color: PRIMARY },
        },
      },

      MuiAvatar: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(PRIMARY, 0.12),
            color: PRIMARY_LT,
            fontWeight: 700,
            fontSize: '0.85rem',
            border: `1px solid ${alpha(PRIMARY, 0.20)}`,
          },
        },
      },

      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 0,
            margin: 0,
            padding: '8px 20px',
            transition: 'background 0.15s ease, color 0.15s ease',
            '&.Mui-selected': {
              backgroundColor: '#1E2235',
              color: c.textPrimary,
              boxShadow: `inset 3px 0 0 ${PRIMARY}`,
              '&:hover': { backgroundColor: '#1E2235' },
              '& .MuiListItemIcon-root': { color: c.textPrimary },
            },
            '&:hover': { backgroundColor: 'rgba(30, 34, 53, 0.4)', color: '#CBD5E1' },
          },
        },
      },
      MuiListItemIcon: {
        styleOverrides: {
          root: { color: c.textMuted, minWidth: 32, '& .MuiSvgIcon-root': { fontSize: 16 } },
        },
      },

      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: '#1E2235',
            color: c.textPrimary, borderRadius: 6, fontSize: '0.75rem', padding: '7px 12px',
            fontWeight: 500, boxShadow: SHADOW_LG, border: `1px solid ${c.border}`,
            backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          },
          arrow: { color: '#1E2235' },
        },
      },

      MuiFab: {
        styleOverrides: {
          primary: {
            backgroundColor: PRIMARY,
            color: '#ffffff',
            boxShadow: `0 0 0 1px ${alpha(PRIMARY, 0.15)} inset, ${SHADOW_LG}`,
            '&:hover': { backgroundColor: PRIMARY_LT, transform: 'translateY(-2px)', boxShadow: `0 0 0 1px ${alpha(PRIMARY, 0.20)} inset, ${SHADOW_XL}` },
          },
        },
      },

      MuiDrawer: { styleOverrides: { paper: { border: 'none', backgroundColor: '#000000', backgroundImage: 'none' } } },
      MuiSkeleton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            background: `linear-gradient(90deg, ${c.bgSurface2} 0%, ${c.bgSurface3} 50%, ${c.bgSurface2} 100%)`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.6s ease-in-out infinite',
          },
          rounded: { borderRadius: 10 },
          circular: { borderRadius: '50%' },
        },
      },

      MuiSwitch: {
        styleOverrides: {
          root: { padding: 8, width: 50, height: 30 },
          switchBase: {
            padding: 7,
            '&.Mui-checked': {
              transform: 'translateX(20px)',
              color: '#ffffff',
              '& + .MuiSwitch-track': { backgroundColor: PRIMARY, opacity: 1, border: 'none' },
            },
          },
          track: {
            borderRadius: 999,
            backgroundColor: c.bgSurface3,
            border: `1px solid ${c.border}`,
            opacity: 1,
            transition: 'background 0.2s ease',
          },
          thumb: {
            boxShadow: '0 1px 2px rgba(0,0,0,0.50), 0 1px 3px rgba(0,0,0,0.40)',
            width: 16,
            height: 16,
          },
        },
      },

      MuiBreadcrumbs: { styleOverrides: { root: { fontSize: '0.8125rem' }, separator: { color: c.textMuted } } },

      MuiMenu: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          paper: {
            borderRadius: 8,
            boxShadow: SHADOW_XL,
            border: `1px solid ${c.border}`,
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
            backgroundColor: alpha('#13131E', 0.96),
            padding: 4,
            marginTop: 4,
          },
          list: { padding: 0 },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: '0.8125rem',
            borderRadius: 6,
            margin: '1px 2px',
            padding: '8px 12px',
            minHeight: 36,
            transition: 'background 0.12s ease, color 0.12s ease',
            color: c.textSecondary,
            '&:hover': { backgroundColor: 'rgba(30, 34, 53, 0.6)', color: c.textPrimary },
            '&.Mui-selected': { backgroundColor: alpha(PRIMARY, 0.10), color: PRIMARY, fontWeight: 600, '&:hover': { backgroundColor: alpha(PRIMARY, 0.15) } },
          },
        },
      },

      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            transition: 'background 0.15s ease, color 0.15s ease, transform 0.15s ease',
            '&:hover': { backgroundColor: alpha('#fff', 0.06) },
            '&:active': { transform: 'scale(0.96)' },
          },
        },
      },

      MuiBadge: {
        styleOverrides: {
          badge: { fontWeight: 700, fontSize: '0.65rem', boxShadow: `0 0 0 2px ${c.bgSurface}`, minWidth: 18, height: 18, padding: '0 5px' },
          dot: { boxShadow: `0 0 0 2px ${c.bgSurface}` },
        },
      },

      MuiDivider: {
        styleOverrides: {
          root: { borderColor: c.borderHairline },
        },
      },

      MuiPopover: {
        styleOverrides: {
          paper: {
            backgroundColor: alpha('#13131E', 0.96),
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
            border: `1px solid ${c.border}`,
            boxShadow: SHADOW_XL,
            borderRadius: 8,
          },
        },
      },

      MuiAutocomplete: {
        styleOverrides: {
          paper: {
            backgroundColor: alpha('#13131E', 0.96),
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
            border: `1px solid ${c.border}`,
            boxShadow: SHADOW_XL,
            borderRadius: 8,
          },
          option: {
            fontSize: '0.8125rem',
            borderRadius: 6,
            margin: '1px 4px',
            '&:hover': { backgroundColor: alpha('#fff', 0.05) },
            '&[aria-selected="true"]': { backgroundColor: alpha(PRIMARY, 0.10), color: PRIMARY },
          },
          inputRoot: { paddingTop: 2, paddingBottom: 2 },
        },
      },

      MuiAccordion: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${c.border}`,
            backgroundImage: 'none',
            boxShadow: 'none',
            '&:before': { display: 'none' },
            '&.Mui-expanded': { boxShadow: SHADOW_SM, borderColor: c.borderStrong },
          },
        },
      },

      MuiAppBar: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: alpha('#000000', 0.92),
            backgroundImage: 'none',
            color: c.textPrimary,
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
            borderBottom: `1px solid ${c.border}`,
            boxShadow: 'none',
          },
        },
      },

      MuiToolbar: {
        styleOverrides: {
          root: { minHeight: 60 },
        },
      },
    },
  });
};

// Default dark theme export for backwards compatibility
const theme = createAppTheme('dark');
export default theme;
