/**
 * Project Workflow Step Configuration — Phase 3
 *
 * Defines the new 12-step project workflow (Estimation → Configuration
 * replacement; Drawing Generation inserted; Production Traveller wording;
 * Documentation wording).
 *
 * Step order is the SINGLE SOURCE OF TRUTH for ProjectDetailPage tabs,
 * stepper UI, and step-index ↔ backend status mapping. Keep this file
 * stable — any reordering is a breaking change.
 */
import type { ProjectStatus } from '../types';

export type ProjectStepKey =
  | 'project_info'
  | 'configuration'
  | 'quotation'
  | 'po_from_client'
  | 'work_order'
  | 'production_traveller'
  | 'quality'
  | 'logistics'
  | 'invoice'
  | 'documentation'
  | 'analytics';

export interface ProjectStepMeta {
  key: ProjectStepKey;
  /** User-facing label (rendered in stepper) */
  label: string;
  /** Compact label for mobile/tablet */
  short: string;
  /** One-line description (tooltip / header) */
  desc: string;
  /**
   * Step belongs to "documentation phase" — has no Save/Next/Back footer
   * (read-only browsing of attached files / analytics).
   */
  terminal?: boolean;
}

/* ─── Canonical 12-step order ─────────────────────────────────────────── */
export const PROJECT_STEPS: ReadonlyArray<ProjectStepMeta> = [
  { key: 'project_info',         label: 'Project Info',         short: 'Info',   desc: 'Basic project & client details' },
  { key: 'configuration',        label: 'Configuration',        short: 'Cfg',    desc: 'Configurator workflow & saved configurations' },
  { key: 'quotation',            label: 'Quotation',            short: 'Quote',  desc: 'Generate and send quotation to client' },
  { key: 'po_from_client',       label: 'PO from Client',       short: 'PO-C',   desc: 'Client purchase order capture' },
  { key: 'work_order',           label: 'Work Order',           short: 'WO',     desc: 'Create & assign work orders' },
  { key: 'production_traveller', label: 'Production Traveller', short: 'Prod.',  desc: 'Track manufacturing progress' },
  { key: 'quality',              label: 'Quality',              short: 'QC',     desc: 'Inspection & quality control' },
  { key: 'logistics',            label: 'Logistics',            short: 'Ship',   desc: 'Shipping & logistics planning' },
  { key: 'invoice',              label: 'Invoice',              short: 'Inv.',   desc: 'Generate and manage invoices' },
  { key: 'documentation',        label: 'Documentation',        short: 'Docs',   desc: 'Attached files & uploads',                                  terminal: true },
  { key: 'analytics',            label: 'Analytics',            short: 'Stats',  desc: 'Project statistics & reports',                              terminal: true },
] as const;

export const PROJECT_STEP_COUNT = PROJECT_STEPS.length;

/* ─── Step index helpers ─────────────────────────────────────────────── */
export const stepIndex = (key: ProjectStepKey): number =>
  PROJECT_STEPS.findIndex((s) => s.key === key);

export const stepKeyAt = (index: number): ProjectStepKey | undefined =>
  PROJECT_STEPS[index]?.key;

/* ─── ProjectStatus ↔ unlocked-step-index mapping ────────────────────── */
/**
 * Returns the highest step index unlocked given a backend project status.
 *
 *   0: Project Info, 1: Configuration, 2: Quotation, 3: PO from Client,
 *   4: Work Order, 5: Production Traveller, 6: Quality, 7: Logistics,
 *   8: Invoice, 9: Documentation, 10: Analytics
 *
 *   draft           → Configuration  (1)   project created; cfg is next
 *   estimated       → Quotation      (2)   config/estimation done; quote is next
 *   quoted          → PO from Client (3)   quotation sent; PO is next
 *   order_confirmed → Work Order     (4)   PO confirmed; WO is next
 *   in_production   → Quality        (6)   production done; QC is next
 *   inspected       → Logistics      (7)   quality done; logistics is next
 *   shipped         → Invoice        (8)   shipped; invoice is next
 *   issue           → Production     (5)   issue flagged; production accessible
 *   closed          → Analytics      (10)  all done
 */
export const statusToMaxStep = (status: ProjectStatus): number => {
  const map: Record<ProjectStatus, number> = {
    draft:           1,
    estimated:       2,
    quoted:          3,
    order_confirmed: 4,
    in_production:   6,
    inspected:       7,
    shipped:         8,
    issue:           5,
    closed:          10,
  };
  return map[status] ?? 1;
};
