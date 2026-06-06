/**
 * Role-Based Access Control configuration.
 *
 * Co Admin role assignments (Owner, Co-owner, Backup) are stored in the
 * `settings` table (key: 'co_admin_assignments') and loaded dynamically.
 * No hardcoded emails — everything is configured post-login.
 *
 * === RBAC Summary ===
 * Owner / Co-Owner (co-admin main_admin) → Full access to all modules
 * Super Admin (main_admin, not co-admin) → No Administration, limited Enterprise (Risk Dashboard only)
 * Admin → No Administration, No Enterprise
 * User → No Administration, No Enterprise, no user creation
 *
 * ROLE_DISPLAY --- human-readable names shown in the UI.
 * ROLE_HIERARCHY --- higher number = more privilege.
 */

/**
 * Co Admin credential slot definitions (key + label only).
 * Actual email assignments are stored in the database.
 */
const CO_ADMIN_SLOTS = [
  { key: 'owner',   label: 'Owner' },
  { key: 'coowner', label: 'Co-owner' },
  { key: 'backup',  label: 'Backup' },
];

/**
 * Role creation permissions:
 * - Owner / Co-owner: Can create Super Admin (with OTP), Admin, User
 * - Super Admin: Can create Admin, User (NOT Super Admin)
 * - Admin: Can create User only
 * - User: No creation permissions
 */
const ROLE_CREATION_MAP = {
  platform_admin: ['main_admin', 'admin', 'sales_engineer'], // Platform Admin (full access)
  co_admin: ['main_admin', 'admin', 'sales_engineer'],  // Owner/Co-owner
  main_admin: ['main_admin', 'admin', 'sales_engineer'], // Super Admin (same as co_admin)
  admin: ['admin', 'sales_engineer'],                     // Admin
  user: [],                                                       // No creation
  sales_engineer: [],                                              // No creation
};

const ROLE_DISPLAY = {
  main_admin: 'Super Admin',
  admin: 'Admin',
  sales_engineer: 'Sales Engineer',
  user: 'User',
};

const ROLE_HIERARCHY = {
  main_admin: 100,
  admin: 70,
  sales_engineer: 30,
  user: 10,
};

// Roles that are genuine User.role ENUM values (as opposed to
// module-permission slugs that can also be passed to authorize()).
const ALL_ROLES = ['main_admin', 'admin', 'sales_engineer', 'user'];

/**
 * Module groups for RBAC enforcement.
 * 'administration' = Access Control, Settings, Recycle Bin
 * 'enterprise'     = Sessions, Custom Roles, Approvals, Risk Dashboard
 */
const MODULE_GROUPS = {
  administration: ['users-manage', 'companies', 'permissions', 'permission-templates', 'audit-logs', 'settings', 'recycle-bin', 'co-admin'],
  enterprise: ['sessions', 'custom-roles', 'approvals', 'risk'],
};

/**
 * Enterprise sub-features accessible to Super Admin (non-co-admin main_admin).
 * All other enterprise features are blocked for Super Admin.
 */
const SUPER_ADMIN_ENTERPRISE_ALLOWED = ['risk'];

/**
 * Get the roles a user can create based on their role and co-admin status.
 * @param {string} userRole - The user's role enum value
 * @param {boolean} userIsCoAdmin - Whether the user is an assigned co-admin
 */
function getCreatableRoles(userRole, userIsCoAdmin) {
  if (userIsCoAdmin) {
    return ROLE_CREATION_MAP.co_admin;
  }
  return ROLE_CREATION_MAP[userRole] || [];
}

module.exports = {
  CO_ADMIN_SLOTS,
  ROLE_CREATION_MAP,
  ROLE_DISPLAY,
  ROLE_HIERARCHY,
  ALL_ROLES,
  MODULE_GROUPS,
  SUPER_ADMIN_ENTERPRISE_ALLOWED,
  getCreatableRoles,
};
