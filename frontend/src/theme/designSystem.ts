/**
 * designSystem.ts — SWGPLAY Switchgear Configurator Design System
 *
 * Single source of truth for all design tokens: palette, typography, sizing,
 * status semantics, provenance, and reusable MUI `sx` snippets.
 *
 * Prefer importing these over inline literals in NEW components.
 * Existing inline `const C = {...}` objects can migrate opportunistically —
 * do NOT mass-refactor existing files just to adopt this module.
 *
 * Values derived from: CatalogManagerPanel.tsx, SectionEditorPanel.tsx,
 * PriceSourceDot.tsx (read June 2026). Keep in sync with those files.
 */

// ---------------------------------------------------------------------------
// 1. PALETTE
// ---------------------------------------------------------------------------

/**
 * Core palette. Three-color discipline:
 *   black / light-black / sky-blue are the structural base.
 *   Status colors (green / amber / red) are reserved for status signalling only.
 *   Never use status colors as decoration or category highlights.
 */
export const COLORS = {
  /** Page / outermost background */
  bg: '#000000',
  /** Panel / raised-surface background (one notch above bg) */
  surface: '#0B0B0D',
  /** Card border, divider, input fieldset */
  border: '#1E2235',
  /** Sky-blue primary action / focus / accent */
  blue: '#00c8ff',
  /** Dark text shown ON a blue background (buttons, selected icon bg) */
  blueText: '#06151c',
  /** Body text */
  text: '#E2E8F0',
  /** Heading / title text */
  title: '#F0F6FF',
  /** Muted / secondary / label text */
  sub: '#64748B',
  /** Secondary label inside cards (slightly warmer than sub) */
  label: '#8E9AAD',
  /** SKU / metadata chips text */
  meta: '#A9B6C9',
  /** Status: firm / confirmed */
  green: '#22C55E',
  /** Status: estimated / warning */
  amber: '#D97706',
  /** Status: missing / error / awaiting RFQ */
  red: '#EF4444',
} as const;

export type ColorKey = keyof typeof COLORS;

// ---------------------------------------------------------------------------
// 2. PROVENANCE (price-source axis)
// ---------------------------------------------------------------------------

/**
 * Provenance = where a price CAME FROM (source axis, one value per component).
 * Rendered as small filled dots (7 px diameter, circle).
 * See PriceSourceDot.tsx for the canonical dot component.
 *
 *   vendor-import / TPS  — sky-blue   — negotiated vendor price from TPS workbook
 *   rfq                  — green      — confirmed RFQ price
 *   web                  — amber      — approximate web / catalog price
 *   manual               — slate-grey — manually entered
 */
export const PROVENANCE: Record<string, string> = {
  'vendor-import': '#00c8ff',
  rfq: '#22C55E',
  web: '#D97706',
  manual: '#94A3B8',
} as const;

export const PROVENANCE_LABELS: Record<string, string> = {
  'vendor-import': 'Vendor-negotiated price (imported)',
  rfq: 'Firm RFQ price from vendor',
  web: 'Approximate web price',
  manual: 'Manually entered',
};

// ---------------------------------------------------------------------------
// 3. STATUS (price-firmness axis)
// ---------------------------------------------------------------------------

/**
 * Status = FIRMNESS of a price (status axis, independent of provenance).
 * Rendered as small outlined chips (height 16 px, borderRadius 4 px)
 * or small filled dots (7 px, borderRadius 2 px for status vs 50% for provenance).
 *
 * The two axes are independent:
 *   Provenance = SOURCE (where did the price come from?)
 *   Status     = FIRMNESS (is that price locked, estimated, or missing?)
 */
export const STATUS = {
  FIRM: {
    key: 'FIRM',
    label: 'Firm',
    shortLabel: 'FIRM',
    color: '#22C55E',
    tip: 'Firm price',
  },
  ESTIMATED: {
    key: 'ESTIMATED',
    label: 'Estimated',
    shortLabel: 'EST',
    color: '#D97706',
    tip: 'Estimated price',
  },
  PENDING_RFQ: {
    key: 'PENDING_RFQ',
    label: 'Awaiting RFQ',
    shortLabel: 'RFQ',
    color: '#EF4444',
    tip: 'No firm price — RFQ required',
  },
} as const;

export type StatusKey = keyof typeof STATUS;

/** Resolve a status key to its dot color (fallback: red = unknown/missing). */
export function statusColor(key?: string | null): string {
  return STATUS[key as StatusKey]?.color ?? COLORS.red;
}

// ---------------------------------------------------------------------------
// 4. TYPOGRAPHY SCALE
// ---------------------------------------------------------------------------

/**
 * Font sizes sourced from components (px values as seen in sx props).
 * MUI default fontSize is 14 px; these are all set explicitly.
 */
export const FONT_SIZE = {
  /** Category chip label, provenance filter label */
  xs: 9.5,
  /** Status chip short label, icon badge */
  xxs: 8.5,
  /** Table header, filter row label, info icons */
  tableHead: 10,
  /** Filter chip labels, source row label */
  filterChip: 10.5,
  /** Filter section label ("Source:", "Status:") */
  filterLabel: 11,
  /** Card label column, body small */
  sm: 11.5,
  /** Input font, table cell body, body medium */
  md: 12,
  /** Input root font-size, section name, most body text */
  body: 12.5,
  /** Section card header title */
  sectionTitle: 13,
  /** Card device-class heading */
  lg: 17,
} as const;

/** Reusable typography sx blobs (spread into Typography sx prop). */
export const TYPO = {
  /** Page / panel / card primary heading. Sentence case, never ALL CAPS. */
  heading: {
    color: '#F0F6FF',
    fontWeight: 800,
    fontSize: FONT_SIZE.lg,
    lineHeight: 1.15,
  },
  /** Section card header (smaller heading) */
  sectionHeading: {
    color: '#F0F6FF',
    fontWeight: 700,
    fontSize: FONT_SIZE.sectionTitle,
  },
  /** Card label column (left side of label–value pairs) */
  label: {
    color: '#8E9AAD',
    fontSize: FONT_SIZE.sm,
    lineHeight: 1.4,
  },
  /** Card value column (right side of label–value pairs) */
  value: {
    color: '#E2E8F0',
    fontSize: FONT_SIZE.sm,
    lineHeight: 1.4,
  },
  /** Table header cell */
  tableHeader: {
    color: '#64748B',
    fontSize: FONT_SIZE.tableHead,
    fontWeight: 700,
    letterSpacing: 0.4,
  },
  /** Table body cell */
  tableCell: {
    color: '#E2E8F0',
    fontSize: FONT_SIZE.md,
  },
  /** Muted / secondary text */
  sub: {
    color: '#64748B',
    fontSize: FONT_SIZE.body,
  },
  /** Inline metadata / SKU */
  meta: {
    color: '#A9B6C9',
    fontSize: FONT_SIZE.xs,
  },
} as const;

// ---------------------------------------------------------------------------
// 5. SIZING
// ---------------------------------------------------------------------------

/**
 * Component sizing tokens.
 * chipH: standard filter/tag chip height (px).
 * chipHSm: status chip height (slightly smaller, px).
 * dot: provenance/status dot diameter (px).
 * radius: standard card/panel border-radius string.
 * inputRadius: text-field/input border-radius string.
 * radiusSm: small element border-radius (status chip, icon button).
 * cardMinH: minimum height of a catalog card (px).
 * iconSm / iconMd / iconLg: icon fontSize values (px).
 */
export const SIZES = {
  /** Standard filter / category chip height (px) */
  chipH: 20,
  /** Status / price-type badge chip height (px) */
  chipHSm: 16,
  /** Provenance and status indicator dot diameter (px) */
  dot: 7,
  /** Card and panel border-radius */
  radius: '10px',
  /** Input / text-field border-radius (MUI default inherits, explicit here) */
  inputRadius: '8px',
  /** Small element border-radius (icon buttons, status chips) */
  radiusSm: '6px',
  /** Status chip border-radius (square-ish badge) */
  radiusBadge: '4px',
  /** Minimum height of a component catalog card (px) */
  cardMinH: 150,
  /** Thumbnail image in cards (px) */
  thumbSize: 34,
  /** Small icon (edit, copy, delete in cards) */
  iconSm: 14,
  /** Medium icon (chevron, add, tune) */
  iconMd: 16,
  /** Larger structural icon */
  iconLg: 18,
  /** Label column width in card label-value rows (px) */
  labelColW: 110,
} as const;

// ---------------------------------------------------------------------------
// 6. REUSABLE sx SNIPPETS
// ---------------------------------------------------------------------------

/**
 * Dark MUI OutlinedInput / TextField styling.
 * Spread into the TextField `sx` prop.
 *
 * Usage:
 *   <TextField sx={inputSx} ... />
 */
export const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: COLORS.surface,
    color: COLORS.text,
    fontSize: FONT_SIZE.body,
    '& fieldset': { borderColor: COLORS.border },
    '&.Mui-focused fieldset': { borderColor: COLORS.blue },
  },
  '& input': { color: COLORS.text },
  '& .MuiInputLabel-root': { color: COLORS.sub, fontSize: FONT_SIZE.md },
} as const;

/**
 * TableHead cell — sticky-header style used in catalog tables.
 * Spread into TableCell `sx` inside TableHead rows.
 */
export const headSx = {
  color: COLORS.sub,
  fontSize: FONT_SIZE.tableHead,
  fontWeight: 700,
  letterSpacing: 0.4,
  borderBottom: '1px solid ' + COLORS.border,
  py: 0.7,
  whiteSpace: 'nowrap' as const,
} as const;

/**
 * TableBody cell.
 * Spread into TableCell `sx` inside TableBody rows.
 */
export const cellSx = {
  color: COLORS.text,
  fontSize: FONT_SIZE.md,
  borderBottom: '1px solid ' + COLORS.border,
  py: 0.55,
} as const;

/**
 * Component catalog card (black background, raised border, hover glow).
 * Spread into the wrapping Box `sx`.
 */
export const cardSx = {
  bgcolor: COLORS.bg,
  border: '1px solid ' + COLORS.border,
  borderRadius: SIZES.radius,
  p: 1.5,
  transition: 'border-color .15s, box-shadow .15s',
  '&:hover': {
    borderColor: COLORS.blue,
    boxShadow: '0 0 14px rgba(0,200,255,0.3)',
  },
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 0.75,
  minHeight: SIZES.cardMinH,
} as const;

/**
 * Panel / section container (light-black surface, raised border).
 * One nesting level above bg cards; used for Panel wrappers.
 */
export const panelSx = {
  bgcolor: COLORS.surface,
  border: '1px solid ' + COLORS.border,
  borderRadius: SIZES.radius,
} as const;

/**
 * Filter/tag chip sx (unselected state).
 * Merge with selected overrides as needed.
 *
 * Usage:
 *   sx={{ ...chipSx, ...(active ? chipSxActive : {}) }}
 */
export const chipSx = {
  height: SIZES.chipH,
  fontSize: FONT_SIZE.filterChip,
  cursor: 'pointer',
  bgcolor: 'transparent',
  border: '1px solid ' + COLORS.border,
  color: COLORS.sub,
  '& .MuiChip-label': { px: 1 },
} as const;

/** Selected state to merge with chipSx */
export const chipSxActive = {
  bgcolor: 'rgba(0,200,255,0.12)',
  border: '1px solid ' + COLORS.blue,
  color: COLORS.blue,
} as const;

/**
 * Primary solid button (sky-blue fill, dark text).
 * Spread into Button `sx`.
 */
export const btnPrimarySx = {
  bgcolor: COLORS.blue,
  color: COLORS.blueText,
  textTransform: 'none' as const,
  fontWeight: 600,
  fontSize: FONT_SIZE.md,
  '&:hover': { bgcolor: '#33d4ff' },
} as const;

/**
 * Outlined / ghost button.
 * Spread into Button `sx`.
 */
export const btnOutlinedSx = {
  color: COLORS.text,
  textTransform: 'none' as const,
  fontSize: FONT_SIZE.md,
  border: '1px solid ' + COLORS.border,
  '&:hover': { borderColor: COLORS.blue },
} as const;

/**
 * Alert / error banner (dark-red tint).
 * Used with MUI Alert severity="error".
 */
export const alertErrorSx = {
  bgcolor: 'rgba(239,68,68,0.08)',
  color: '#FCA5A5',
  border: '1px solid ' + COLORS.border,
  fontSize: FONT_SIZE.md,
} as const;

/**
 * Empty-state placeholder box (dashed border, centered text).
 */
export const emptyStateSx = {
  bgcolor: COLORS.bg,
  border: '1px dashed ' + COLORS.border,
  borderRadius: SIZES.radius,
  p: 3,
  textAlign: 'center' as const,
} as const;

// ---------------------------------------------------------------------------
// 7. NESTING LEVELS (documentation only — not runtime tokens)
// ---------------------------------------------------------------------------

/**
 * Alternating nesting rule (one notch per level):
 *
 *   Level 0 — Page bg:       COLORS.bg      (#000000)
 *   Level 1 — Panel surface: COLORS.surface (#0B0B0D)
 *   Level 2 — Card bg:       COLORS.bg      (#000000)  ← back to black
 *   Level 3 — Input bg:      COLORS.surface (#0B0B0D)  ← back to light-black
 *
 * Borders/dividers always use COLORS.border (#1E2235) regardless of level.
 * Dialog Paper also uses COLORS.surface (dark modal on dark page).
 */
export const NESTING = {
  page: COLORS.bg,
  panel: COLORS.surface,
  card: COLORS.bg,
  input: COLORS.surface,
} as const;

// ---------------------------------------------------------------------------
// 8. TOAST / NOTIFICATION COLORS (reference)
// ---------------------------------------------------------------------------

/**
 * Toast notification colors (used wherever snackbar/toast is shown).
 * These align with the status palette — do NOT invent new colors for toasts.
 *
 *   success → COLORS.green  (#22C55E)
 *   error   → COLORS.red    (#EF4444)
 *   warning → COLORS.amber  (#D97706)
 *   info    → COLORS.blue   (#00c8ff)
 */
export const TOAST_COLORS = {
  success: COLORS.green,
  error: COLORS.red,
  warning: COLORS.amber,
  info: COLORS.blue,
} as const;
