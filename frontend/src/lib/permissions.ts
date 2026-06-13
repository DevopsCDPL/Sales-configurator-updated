/**
 * Frontend permission gate — mirror of backend/src/middleware/departments.js.
 *
 * Keep this in sync with the backend `can()` map. Policy v1 (conservative).
 *
 * NON-REGRESSION RULE (mirror of backend): `can()` only restricts the 8 NEW
 * department roles. Any role it does not recognize (legacy: user,
 * sales_engineer, custom roles, etc.) returns TRUE — legacy roles keep their
 * previous behavior. Only department roles outside their resource map get false.
 */
import { useAuth } from '../contexts/AuthContext';

export type Resource =
  | 'configurator'
  | 'catalog'
  | 'procurement'
  | 'quality'
  | 'logistics'
  | 'workorders'
  | 'analytics'
  | 'users';

export const DEPARTMENT_ROLES = [
  'manufacturing',
  'procurement',
  'assembly',
  'outsourcing',
  'quality',
  'packing',
  'logistics',
  'commissioning',
] as const;

const FULL_ACCESS_ROLES = ['platform_admin', 'main_admin', 'admin'];

const DEPARTMENT_ACCESS: Record<string, Resource[]> = {
  procurement: ['catalog', 'procurement', 'workorders'],
  quality: ['quality', 'workorders'],
  logistics: ['logistics', 'workorders'],
  packing: ['logistics', 'workorders'],
  manufacturing: ['workorders', 'configurator'],
  assembly: ['workorders', 'configurator'],
  outsourcing: ['workorders', 'configurator'],
  commissioning: ['workorders', 'configurator'],
};

export function can(role: string | undefined | null, resource: Resource): boolean {
  if (!role) return false;
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  // Legacy / unknown roles keep their previous unguarded behavior.
  if (!(DEPARTMENT_ROLES as readonly string[]).includes(role)) return true;
  const allowed = DEPARTMENT_ACCESS[role] || [];
  return allowed.includes(resource);
}

/** Hook: whether the logged-in user may access a resource. */
export function useCanAccess(resource: Resource): boolean {
  const { user } = useAuth();
  return can(user?.role, resource);
}
