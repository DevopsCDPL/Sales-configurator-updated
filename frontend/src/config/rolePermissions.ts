import type { UserRole } from '../types';

/**
 * Co Admin credential slot definitions (key + label only).
 * Actual email assignments are stored in the database.
 */
export const CO_ADMIN_SLOTS = [
  { key: 'owner',   label: 'Owner' },
  { key: 'coowner', label: 'Co-owner' },
  { key: 'backup',  label: 'Backup' },
];

/**
 * Check if a user's role qualifies for Co Admin tab access.
 * This is a client-side rough filter; the backend enforces real access
 * via the checkAccess endpoint and DB-backed assignments.
 */
export function isCoAdmin(role: string | undefined, isCoAdminFlag?: boolean): boolean {
  if (isCoAdminFlag !== undefined) return isCoAdminFlag;
  return role === 'main_admin';
}

/**
 * Role creation permissions map.
 */
export const ROLE_CREATION_MAP: Record<string, UserRole[]> = {
  platform_admin: ['platform_admin', 'main_admin', 'admin', 'sales_engineer'],
  co_admin: ['main_admin', 'admin', 'sales_engineer'],
  main_admin: ['main_admin', 'admin', 'sales_engineer'],
  admin: ['admin', 'sales_engineer'],
  user: [],
  sales_engineer: [],
};

/**
 * Get the roles a user can create based on their role and co-admin status.
 */
export function getCreatableRoles(role: UserRole | undefined, coAdminAccess?: boolean): UserRole[] {
  if (!role) return [];
  if (coAdminAccess) return ROLE_CREATION_MAP.co_admin;
  return ROLE_CREATION_MAP[role] || [];
}

/** Human-readable role labels */
export const ROLE_DISPLAY: Record<UserRole, string> = {
  platform_admin: 'Platform Admin',
  main_admin: 'Super Admin',
  admin: 'Admin',
  sales_engineer: 'Sales Engineer',
  user: 'User',
};

// ─── RBAC Path Definitions ───────────────────────────────────────────────

/** Paths that belong to the Administration module (Access Control, Recycle Bin).
 *  Note: /settings is NOT listed here because all roles need access to their
 *  profile via the Settings page.  The System tab inside SettingsPage is
 *  already gated with adminOnly, and the sidebar "Settings" link stays
 *  hidden for non-co-admins via Layout.tsx. */
/** Paths blocked specifically for Sales Engineer role */
export const SALES_ENGINEER_BLOCKED_PATHS = [
  '/business-analytics',
];

export const ADMINISTRATION_PATHS = [
  '/platform-admin/access-control',
  '/recycle-bin',
];

/** Paths that belong to the Enterprise module */
export const ENTERPRISE_PATHS = [
  '/sessions',
  '/custom-roles',
  '/approvals',
  '/risk-dashboard',
];

/** Enterprise sub-features accessible to Super Admin (non-co-admin main_admin) */
const SUPER_ADMIN_ENTERPRISE_ALLOWED = ['/risk-dashboard'];

/**
 * Check if a path belongs to a module group.
 */
function isInModule(path: string, modulePaths: string[]): boolean {
  return modulePaths.some(p => path === p || path.startsWith(p + '/'));
}

/**
 * Baseline sidebar items for roles that don't get '*' (wildcard).
 */
export const ROLE_SIDEBAR_ITEMS: Record<UserRole, string[]> = {
  platform_admin: ['*'],
  main_admin: ['*'], // filtered by co-admin / enterprise checks at call site
  admin: ['*'],      // filtered to exclude administration & enterprise
  sales_engineer: ['*'], // all modules except business-analytics (blocked below)
  user: [
    '/',
    '/projects',
    '/messages',
    '/file-manager',
    '/settings',
  ],
};

/**
 * Routes each role is allowed to navigate to (baseline).
 */
export const ROLE_ALLOWED_ROUTES: Record<UserRole, string[]> = {
  platform_admin: ['*'],
  main_admin: ['*'],
  admin: ['*'],
  sales_engineer: ['*'], // all modules except business-analytics (blocked below)
  user: [
    '/',
    '/projects',
    '/messages',
    '/file-manager',
    '/settings',
  ],
};

/**
 * Check if a role can access a given path, accounting for co-admin status.
 *
 * RBAC rules:
 * - Owner/Co-Owner (is_co_admin=true) → full access
 * - Super Admin (main_admin, NOT co-admin) → no Administration, Enterprise only Risk Dashboard
 * - Admin → no Administration, no Enterprise
 * - User/Sales Engineer → restricted to their allowed routes, no Administration, no Enterprise
 */
export function canAccessPath(role: UserRole | undefined, path: string, userIsCoAdmin?: boolean): boolean {
  if (!role) return false;

  const isAdmin = isInModule(path, ADMINISTRATION_PATHS);
  const isEnterprise = isInModule(path, ENTERPRISE_PATHS);

  // Platform admin has access everywhere (but uses separate UI)
  if (role === 'platform_admin') return true;

  // Owner/Co-Owner/Super Admin: full access (all main_admin users)
  if (userIsCoAdmin || role === 'main_admin') return true;

  // Admin: no administration, no enterprise
  if (role === 'admin') {
    if (isAdmin || isEnterprise) return false;
    return true; // access to all other modules
  }

  // Sales Engineer: all modules except administration, enterprise, and business-analytics
  if (role === 'sales_engineer') {
    if (isAdmin || isEnterprise) return false;
    if (isInModule(path, SALES_ENGINEER_BLOCKED_PATHS)) return false;
    return true;
  }

  // User: no administration, no enterprise + limited routes
  if (isAdmin || isEnterprise) return false;
  const allowed = ROLE_ALLOWED_ROUTES[role];
  if (!allowed) return false;
  return allowed.some(p => path === p || path.startsWith(p + '/'));
}

/**
 * Check if a sidebar item should be visible for a role, accounting for co-admin status.
 */
export function canSeeSidebarItem(role: UserRole | undefined, path: string, userIsCoAdmin?: boolean): boolean {
  if (!role) return false;

  const isAdmin = isInModule(path, ADMINISTRATION_PATHS);
  const isEnterprise = isInModule(path, ENTERPRISE_PATHS);

  if (role === 'platform_admin') return true;

  // Owner/Co-Owner/Super Admin: see everything (all main_admin users)
  if (userIsCoAdmin || role === 'main_admin') return true;

  // Admin: hide administration and enterprise
  if (role === 'admin') {
    if (isAdmin || isEnterprise) return false;
    return true;
  }

  // Sales Engineer: hide administration, enterprise, and business-analytics
  if (role === 'sales_engineer') {
    if (isAdmin || isEnterprise) return false;
    if (isInModule(path, SALES_ENGINEER_BLOCKED_PATHS)) return false;
    return true;
  }

  // User
  if (isAdmin || isEnterprise) return false;
  const allowed = ROLE_SIDEBAR_ITEMS[role];
  if (!allowed) return false;
  return allowed.some(p => path === p || path.startsWith(p + '/'));
}
