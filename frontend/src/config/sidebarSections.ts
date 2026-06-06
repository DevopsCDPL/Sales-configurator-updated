/**
 * Sidebar Sections Plan — Phase 3 (additive, NOT yet wired)
 * ════════════════════════════════════════════════════════════════════════
 * Captures the target sidebar grouping derived from the Phase-3 product
 * spec PDF:
 *
 *   • My Account
 *   • Settings
 *   • Database
 *   • Operations
 *   • Dashboard
 *   • Projects
 *   • Procurement
 *   • Inventory
 *   • Business Analytics
 *   • File Manager
 *
 * Phase 3 deliberately preserves the current Layout.tsx navigation
 * behavior. This file is the SINGLE SOURCE OF TRUTH that Phase 4 will
 * consume when the sidebar is restructured. Each entry is keyed to an
 * existing route so the migration is purely cosmetic / grouping.
 *
 * `legacySectionLabel` lets the Phase 4 migration honor RBAC visibility
 * rules already enforced via `canSeeSidebarItem`.
 * ════════════════════════════════════════════════════════════════════════
 */
export interface SidebarItemPlan {
  key: string;
  label: string;
  path: string;
  /** RBAC path used by `canSeeSidebarItem` for visibility checks. */
  rbacPath?: string;
  /** Reserved Phase-4 description / tooltip text. */
  description?: string;
}

export interface SidebarSectionPlan {
  key: string;
  label: string;
  /** Maps to the legacy section grouping in current Layout.tsx. */
  legacySectionLabel?: string;
  items: ReadonlyArray<SidebarItemPlan>;
}

/* ─── Target structure (Phase 4 will apply) ──────────────────────────── */
export const SIDEBAR_SECTIONS_PLAN: ReadonlyArray<SidebarSectionPlan> = [
  {
    key: 'operations',
    label: 'Operations',
    legacySectionLabel: 'Operations',
    items: [
      { key: 'dashboard',  label: 'Dashboard',  path: '/',           description: 'Today\'s overview' },
      { key: 'projects',   label: 'Projects',   path: '/projects',   description: 'Project workspace' },
      { key: 'procurement', label: 'Procurement', path: '/procurement', rbacPath: '/procurement', description: 'Vendor POs & sourcing' },
      { key: 'inventory',  label: 'Inventory',  path: '/material-stock', rbacPath: '/material-stock', description: 'Stock & raw materials' },
    ],
  },
  {
    key: 'database',
    label: 'Database',
    legacySectionLabel: 'Master Data',
    items: [
      { key: 'vendors',       label: 'Vendors',       path: '/vendors',       rbacPath: '/vendors' },
      { key: 'clients',       label: 'Clients',       path: '/clients',       rbacPath: '/clients' },
      { key: 'raw-materials', label: 'Raw Materials', path: '/raw-materials', rbacPath: '/material-stock' },
      { key: 'parts-master',  label: 'Parts Master',  path: '/parts-master',  rbacPath: '/parts-master' },
    ],
  },
  {
    key: 'analytics',
    label: 'Business Analytics',
    legacySectionLabel: 'Execution',
    items: [
      { key: 'business-analytics', label: 'Business Analytics', path: '/business-analytics', rbacPath: '/business-analytics' },
    ],
  },
  {
    key: 'files',
    label: 'File Manager',
    legacySectionLabel: 'Execution',
    items: [
      { key: 'file-manager', label: 'File Manager', path: '/file-manager' },
      { key: 'messages',     label: 'Messages',     path: '/messages' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    items: [
      { key: 'settings',   label: 'Settings',       path: '/settings' },
      { key: 'my-account', label: 'My Account',     path: '/settings' /* Phase 4: dedicated route */ },
    ],
  },
] as const;

/* ─── Phase 3 helper: lookup canonical section for a path ──────────── */
export function findSection(path: string): SidebarSectionPlan | undefined {
  for (const section of SIDEBAR_SECTIONS_PLAN) {
    if (section.items.some((i) => i.path === path)) return section;
  }
  return undefined;
}
