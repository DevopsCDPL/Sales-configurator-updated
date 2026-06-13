# SWGPLAY Configurator — Design System Reference

> **Canonical token source:** `frontend/src/theme/designSystem.ts`
> All new components must import tokens from there. Existing inline `const C = {...}` objects may migrate opportunistically.

---

## 1. Palette

### 1.1 Core colors

| Token | Hex | When to use |
|---|---|---|
| `COLORS.bg` | `#000000` | Page / outermost background |
| `COLORS.surface` | `#0B0B0D` | Panel, dialog Paper, raised surface |
| `COLORS.border` | `#1E2235` | Card border, table divider, input fieldset |
| `COLORS.blue` | `#00c8ff` | Primary action, focus ring, active chip border, accent glow |
| `COLORS.blueText` | `#06151c` | Text on a blue background (button labels, selected icon) |
| `COLORS.text` | `#E2E8F0` | Body text, table cells, input values |
| `COLORS.title` | `#F0F6FF` | Card headings, section titles |
| `COLORS.sub` | `#64748B` | Muted text, table headers, placeholder, secondary labels |
| `COLORS.label` | `#8E9AAD` | Label column in card label-value rows |
| `COLORS.meta` | `#A9B6C9` | SKU chips, metadata badges |

### 1.2 Status colors (reserved for status signalling only)

| Token | Hex | Meaning |
|---|---|---|
| `COLORS.green` | `#22C55E` | Firm price, confirmed, healthy, success toast |
| `COLORS.amber` | `#D97706` | Estimated price, warning, caution, warn toast |
| `COLORS.red` | `#EF4444` | Awaiting RFQ, error, overflow, error toast |

> **Three-color discipline:** `black / light-black / sky-blue` are the structural base. Status colors are **never** used as decoration, category highlights, or branding — only for actual status communication.

---

## 2. Alternating-nesting rule

Every nesting level alternates between black and light-black, one notch per level. Borders use `#1E2235` at every level.

```
Level 0  Page            bg       #000000
Level 1  Panel           surface  #0B0B0D
Level 2  Card            bg       #000000   ← back to black
Level 3  Input field     surface  #0B0B0D   ← back to light-black
```

Dialog `Paper` sits at Level 1 (surface). Menus and dropdowns also use surface.

---

## 3. Typography scale

| Token | px | Used for |
|---|---|---|
| `FONT_SIZE.xxs` | 8.5 | Status badge short labels (FIRM / EST / RFQ) |
| `FONT_SIZE.xs` | 9.5 | Category chip label, provenance filter label, meta chips |
| `FONT_SIZE.tableHead` | 10 | Table header cells |
| `FONT_SIZE.filterChip` | 10.5 | Filter chip labels |
| `FONT_SIZE.filterLabel` | 11 | Filter row section labels ("Source:", "Status:") |
| `FONT_SIZE.sm` | 11.5 | Card label/value columns, body small |
| `FONT_SIZE.md` | 12 | Table body cells, button labels, input label |
| `FONT_SIZE.body` | 12.5 | Input values, section name text, main body |
| `FONT_SIZE.sectionTitle` | 13 | Section card header title |
| `FONT_SIZE.lg` | 17 | Card device-class heading (primary card title) |

### Heading standard

```ts
{ color: '#F0F6FF', fontWeight: 800, fontSize: 17, lineHeight: 1.15 }
```

- Always **sentence case** — never ALL CAPS headings.
- Color is always `title` (`#F0F6FF`), weight always 800.
- Smaller headings (section cards): `fontWeight: 700`, `fontSize: 13`.

---

## 4. Component conventions

### 4.1 Chips

| Variant | Height | Font | Border-radius | Border |
|---|---|---|---|---|
| Filter / category chip | 20 px | 10.5 px | MUI default (~16 px) | `1px solid border` unselected / `blue` selected |
| Status badge chip | 16 px | 8.5 px | 4 px (square-ish) | `1px solid <status-color>` |
| Category label (on card) | 18 px | 9.5 px | MUI default | None — `rgba(0,200,255,0.10)` bg |
| SKU / meta chip | 18 px | 9.5 px | MUI default | `1px solid border` |

Active filter chip: `bgcolor: rgba(0,200,255,0.12)`, `border: 1px solid blue`, `color: blue`.

### 4.2 Provenance dots

Round dots (7 px × 7 px, `borderRadius: '50%'`) placed next to the item they annotate.

| Source | Color |
|---|---|
| `vendor-import` / TPS | `#00c8ff` (sky-blue) |
| `rfq` | `#22C55E` (green) |
| `web` | `#D97706` (amber) |
| `manual` | `#94A3B8` (slate-grey) |

Use the canonical `<PriceSourceDot source={...} />` component (`configurator/components/PriceSourceDot.tsx`).

### 4.3 Status dots / badges (price firmness)

Status uses **square-corner dots** (7 px × 7 px, `borderRadius: 2`) to visually distinguish from round provenance dots, or outlined Chip badges (height 16 px, `borderRadius: 4`).

| Status | Color |
|---|---|
| `FIRM` | `#22C55E` (green) |
| `ESTIMATED` | `#D97706` (amber) |
| `PENDING_RFQ` | `#EF4444` (red) |

### 4.4 Provenance vs Status — two-axis convention

These are **independent axes**. A single component can simultaneously have:
- `priceSource: 'web'` (provenance — blue dot) and `price_status: 'ESTIMATED'` (status — amber badge)

Never conflate them. The filter row always shows both axes separately: "Source:" row then "Status:" row.

### 4.5 Buttons

**Primary (solid blue):**
```ts
{ bgcolor: '#00c8ff', color: '#06151c', textTransform: 'none', fontWeight: 600, fontSize: 12 }
// hover: bgcolor '#33d4ff'
```

**Outlined / ghost:**
```ts
{ color: '#E2E8F0', textTransform: 'none', fontSize: 12, border: '1px solid #1E2235' }
// hover: borderColor '#00c8ff'
```

**Icon buttons:** `color: sub` at rest, `color: blue` on hover (except destructive: `color: red` on hover).

### 4.6 Cards

Black background (`#000000`), `1px solid border`, `borderRadius: '10px'`, `p: 1.5`.

Hover state: `borderColor: '#00c8ff'`, `boxShadow: '0 0 14px rgba(0,200,255,0.3)'`.

Card minimum height: 150 px. Use flex-column with `gap: 0.75` between rows.

Use `cardSx` from `designSystem.ts` as the base spread.

### 4.7 Tables

```ts
// Head cell (headSx):
{ color: '#64748B', fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
  borderBottom: '1px solid #1E2235', py: 0.7, whiteSpace: 'nowrap' }

// Body cell (cellSx):
{ color: '#E2E8F0', fontSize: 12, borderBottom: '1px solid #1E2235', py: 0.55 }
```

Tables should be sticky-header where the content scrolls. Table background inherits from the enclosing panel (`surface`).

### 4.8 Inputs / TextFields

```ts
// inputSx:
'& .MuiOutlinedInput-root': {
  bgcolor: '#0B0B0D',    // surface (one level below the card which is bg)
  color: '#E2E8F0',
  fontSize: 12.5,
  '& fieldset': { borderColor: '#1E2235' },
  '&.Mui-focused fieldset': { borderColor: '#00c8ff' },
}
'& .MuiInputLabel-root': { color: '#64748B', fontSize: 12 }
```

Inputs sit at nesting Level 3 (surface), inside cards at Level 2 (bg).

### 4.9 Dialogs

MUI `Dialog` should set `PaperProps={{ sx: { bgcolor: COLORS.surface } }}`. Dialogs are dark-themed with the same border/text conventions. Dialog titles follow the heading standard.

### 4.10 Alerts / Error banners

```ts
{ bgcolor: 'rgba(239,68,68,0.08)', color: '#FCA5A5', border: '1px solid #1E2235', fontSize: 12 }
```

### 4.11 Empty states

```ts
{ bgcolor: '#000000', border: '1px dashed #1E2235', borderRadius: '10px', p: 3, textAlign: 'center' }
```
Text inside: `color: sub`, `fontSize: 12.5`.

---

## 5. Toast / notification colors

| Level | Color |
|---|---|
| success | `#22C55E` (green) |
| error | `#EF4444` (red) |
| warning | `#D97706` (amber) |
| info | `#00c8ff` (sky-blue) |

Reference `TOAST_COLORS` from `designSystem.ts`. Toast definitions are consumed wherever `enqueueSnackbar` or equivalent is called (search for snack/toast in the codebase for the implementation location).

---

## 6. How to apply — guide for future agents / developers

1. **Import tokens, not hex literals.** In any new component:
   ```ts
   import { COLORS, SIZES, FONT_SIZE, inputSx, headSx, cellSx, cardSx, panelSx, STATUS, PROVENANCE } from '../../theme/designSystem';
   ```

2. **Follow the nesting rule.** Ask: what level is this element at? Match its `bgcolor` to the level table in section 2.

3. **Keep status colors semantic.** Never color a heading or category with `green/amber/red`. Those are reserved for price firmness and error states.

4. **Chips: use the right height.** Filter chips = 20 px. Status badge chips = 16 px. Category label chips = 18 px.

5. **Headings: sentence case, weight 800, color `#F0F6FF`.** No ALL-CAPS headings.

6. **Provenance vs status.** If a field represents *where a price came from*, use `PROVENANCE` colors and round dots. If it represents *how certain that price is*, use `STATUS` colors and square-corner dots or badges.

7. **Buttons.** Solid blue for primary actions. Outlined (ghost) for secondary. Never use colored backgrounds other than blue for buttons.

8. **Do not refactor existing inline `C` objects** unless that file is being substantially modified for another reason — migration is opportunistic only.

9. **Adding a new token.** Update `designSystem.ts` and this document together in the same commit. Add the value to the correct section; do not create ad-hoc palette extensions inside components.

10. **TypeScript.** The token module is `as const` typed. Use `COLORS.xxx` references so typos are caught at compile time.

## Standard data table (LOCKED)

Every data table in the configurator uses ONE locked format. Canonical
reference: the "Auto-selected components" table in `ComponentsPanel.tsx` and
the eBOM/mBOM tables in `BomViewer.tsx`. Tokens live in `designSystem.ts`
(`STANDARD_TABLE`, `tableHeadCellSx`, `snoCellSx`, `mergedCatCellSx`, plus the
existing `headSx`/`cellSx`).

Rules — replicate exactly for any new table:

1. **Scroll wrapper.** Wrap the `<Table>` in a `Box` with
   `{ maxHeight: '58vh', overflow: 'auto' }` (use `52vh` for per-section
   sub-boxes). This keeps long tables in-page.
2. **Sticky header.** `<Table size="small" stickyHeader>`. Every head
   `TableCell` gets `tableHeadCellSx` — i.e. `headSx` + `whiteSpace: nowrap`
   + `bgcolor: '#0B0B0D'` so the sticky header never bleeds the rows behind it.
3. **Sentence-case headers.** "Catalog description", "Unit cost", "Where
   used" — never ALL CAPS.
4. **First column is S.No** (`snoCellSx`): width 40, muted `#64748B`,
   `borderRight: 1px solid #1E2235`. Numbered continuously within the table
   (within each section box for sectioned eBOM).
5. **Category column is MERGED via `rowSpan`** (`mergedCatCellSx`): render the
   cell only on the first row of each category group, with
   `rowSpan = rows in that group`. Color `#A9B6C9`, `fontWeight 700`,
   right divider, `verticalAlign: middle`. (Skip the merge only when a table
   is genuinely by-part, e.g. mBOM — there S.No + standard styling is enough.)
6. **Body cells.** `cellSx` + `verticalAlign: 'middle'` + `py: 0.5`.
7. **Status & provenance** stay as outlined `StatusChip` / generator chip per
   the provenance-vs-status rule above; never drop a backend field to fit.

### Segmented view toggle

When a table offers alternate views (e.g. eBOM vs mBOM), use a segmented
control, NOT separate buttons — matching the catalog Source/Status toggles:

- Container: `bgcolor #0B0B0D`, `border 1px solid #1E2235`,
  `borderRadius 8px`, `display inline-flex`, `p 0.25`.
- Each pill: `borderRadius 6px`, `height ~24`, `px 1.25`, `fontSize 11.5`.
  Active = `bgcolor rgba(0,200,255,0.14)` / `color #00c8ff`.
  Inactive = `transparent` / `#64748B`.
- Labels are compact and descriptive ("eBOM · by section", "mBOM · by part").
