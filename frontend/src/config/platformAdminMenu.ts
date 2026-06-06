import React from 'react';

// ─── Types ───────────────────────────────────────────────────────────

export type PlatformRole = 'owner' | 'admin' | 'user';

export interface PlatformMenuItem {
  id: string;
  label: string;
  path: string;
  icon: string;           // icon key – resolved in component
  badge?: 'companies' | 'users' | 'expiring';
  roles: PlatformRole[];  // which roles can see this item
}

export interface PlatformMenuSection {
  id: string;
  title: string;
  items: PlatformMenuItem[];
  collapsible?: boolean;
}

// ─── Menu Config ─────────────────────────────────────────────────────

export const PLATFORM_MENU: PlatformMenuSection[] = [
  {
    id: 'main',
    title: 'MAIN',
    collapsible: false,
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/platform-admin', icon: 'LayoutDashboard', roles: ['owner', 'admin', 'user'] },
    ],
  },
  {
    id: 'organization',
    title: 'ORGANIZATION',
    collapsible: true,
    items: [
      { id: 'companies', label: 'Companies', path: '/platform-admin/companies', icon: 'Building2', badge: 'companies', roles: ['owner', 'admin', 'user'] },
      { id: 'company-owners', label: 'Company Owners', path: '/platform-admin/company-owners', icon: 'ShieldCheck', roles: ['owner', 'admin', 'user'] },
      { id: 'users', label: 'Platform Admins', path: '/platform-admin/users', icon: 'Users', badge: 'users', roles: ['owner', 'admin', 'user'] },
      { id: 'teams', label: 'Teams', path: '/platform-admin/teams', icon: 'UsersRound', roles: ['owner', 'admin'] },
    ],
  },
  {
    id: 'admin-management',
    title: 'ADMIN MANAGEMENT',
    collapsible: true,
    items: [
      { id: 'admins', label: 'Admins', path: '/platform-admin/admins', icon: 'ShieldCheck', roles: ['owner', 'admin'] },
      { id: 'roles', label: 'Roles & Permissions', path: '/platform-admin/access-control/roles', icon: 'Key', roles: ['owner', 'admin'] },
      { id: 'access-control', label: 'Access Control', path: '/platform-admin/access-control', icon: 'Shield', roles: ['owner', 'admin'] },
    ],
  },
  {
    id: 'operations',
    title: 'OPERATIONS',
    collapsible: true,
    items: [
      { id: 'activity-logs', label: 'Activity Logs', path: '/platform-admin/activity-logs', icon: 'Activity', roles: ['owner', 'admin'] },
      { id: 'audit-logs', label: 'Audit Logs', path: '/platform-admin/audit-logs', icon: 'FileSearch', roles: ['owner', 'admin'] },
      { id: 'notifications', label: 'Notifications', path: '/platform-admin/notifications', icon: 'Bell', roles: ['owner', 'admin'] },
    ],
  },
  {
    id: 'analytics',
    title: 'ANALYTICS',
    collapsible: true,
    items: [
      { id: 'reports', label: 'Reports', path: '/platform-admin/reports', icon: 'BarChart3', roles: ['owner', 'admin'] },
      { id: 'insights', label: 'Insights', path: '/platform-admin/insights', icon: 'TrendingUp', roles: ['owner', 'admin'] },
    ],
  },
  {
    id: 'system',
    title: 'SYSTEM',
    collapsible: true,
    items: [
      { id: 'subscriptions', label: 'Subscriptions', path: '/platform-admin/subscriptions', icon: 'CreditCard', roles: ['owner', 'admin'] },
      { id: 'billing', label: 'Billing', path: '/platform-admin/billing', icon: 'Receipt', roles: ['owner'] },
      { id: 'integrations', label: 'Integrations', path: '/platform-admin/integrations', icon: 'Puzzle', roles: ['owner', 'admin'] },
      { id: 'api-keys', label: 'API Keys', path: '/platform-admin/api-keys', icon: 'Key', roles: ['owner'] },
      { id: 'settings', label: 'Settings', path: '/platform-admin/settings', icon: 'Settings', roles: ['owner', 'admin'] },
    ],
  },
  {
    id: 'safety',
    title: 'SAFETY',
    collapsible: false,
    items: [
      { id: 'recycle-bin', label: 'Recycle Bin', path: '/platform-admin/recycle-bin', icon: 'Trash2', roles: ['owner', 'admin'] },
    ],
  },
];

// ─── Role Filtering ──────────────────────────────────────────────────

export function filterMenuByRole(role: PlatformRole): PlatformMenuSection[] {
  return PLATFORM_MENU
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(role)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * Map platform_admin sub-role. For now, all platform_admin users are
 * treated as 'owner'. Extend this when you add platform_admin sub-roles.
 */
export function getPlatformRole(user: { role: string; is_owner?: boolean }): PlatformRole {
  // Future: check user.platform_role or similar field
  if (user.is_owner) return 'owner';
  return 'owner'; // default: full access for platform_admin
}
