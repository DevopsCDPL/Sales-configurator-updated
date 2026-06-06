const { Permission } = require('../models');

// Default permission keys with descriptions and category grouping
const DEFAULT_PERMISSIONS = [
  // User management
  { key: 'add_users', label: 'Add Users', category: 'User Management' },
  { key: 'edit_users', label: 'Edit Users', category: 'User Management' },
  { key: 'delete_users', label: 'Delete Users', category: 'User Management' },
  // Data management
  { key: 'manage_projects', label: 'Manage Projects', category: 'Data Management' },
  { key: 'manage_estimates', label: 'Manage Estimates', category: 'Data Management' },
  { key: 'manage_sales_orders', label: 'Manage Sales Orders', category: 'Data Management' },
  { key: 'manage_work_orders', label: 'Manage Work Orders', category: 'Data Management' },
  { key: 'manage_quality', label: 'Manage Quality Records', category: 'Data Management' },
  { key: 'manage_logistics', label: 'Manage Logistics', category: 'Data Management' },
  { key: 'manage_clients', label: 'Manage Clients', category: 'Data Management' },
  { key: 'manage_vendors', label: 'Manage Vendors', category: 'Data Management' },
  // Reports & views
  { key: 'view_reports', label: 'View Reports', category: 'Reports & Views' },
  { key: 'view_dashboard', label: 'View Dashboard', category: 'Reports & Views' },
  // Settings
  { key: 'access_settings', label: 'Access Settings', category: 'Settings' },
  { key: 'update_own_profile', label: 'Update Own Profile', category: 'Settings' },
];

class PermissionService {
  /**
   * Get the static permission definitions (metadata)
   */
  getPermissionDefinitions() {
    return DEFAULT_PERMISSIONS;
  }

  /**
   * Seed default permissions for both roles if they don't already exist.
   */
  async seedDefaults() {
    const roles = ['admin', 'user'];
    for (const role of roles) {
      for (const perm of DEFAULT_PERMISSIONS) {
        const existing = await Permission.findOne({
          where: { role, permission_key: perm.key }
        });
        if (!existing) {
          // Admin gets most things enabled, user gets limited
          const defaultEnabled = role === 'admin'
            ? true
            : ['manage_projects', 'manage_estimates', 'manage_sales_orders', 'view_dashboard', 'update_own_profile'].includes(perm.key);

          await Permission.create({
            role,
            permission_key: perm.key,
            enabled: defaultEnabled
          });
        }
      }
    }
  }

  /**
   * Get all permissions for a specific role.
   */
  async getByRole(role) {
    if (!['admin', 'user'].includes(role)) {
      throw new Error('Invalid role. Must be admin or user.');
    }

    const permissions = await Permission.findAll({
      where: { role },
      order: [['permission_key', 'ASC']]
    });

    // Merge with definitions for labels/categories
    return DEFAULT_PERMISSIONS.map(def => {
      const dbRow = permissions.find(p => p.permission_key === def.key);
      return {
        key: def.key,
        label: def.label,
        category: def.category,
        enabled: dbRow ? dbRow.enabled : false,
        id: dbRow ? dbRow.id : null
      };
    });
  }

  /**
   * Get permissions for all roles (admin + sales).
   */
  async getAll() {
    const adminPerms = await this.getByRole('admin');
    const userPerms = await this.getByRole('user');
    return { admin: adminPerms, user: userPerms };
  }

  /**
   * Update a single permission toggle.
   */
  async updatePermission(role, permissionKey, enabled, requestingUser) {
    if (requestingUser.role !== 'main_admin') {
      throw new Error('Only Main Admin can update permissions');
    }

    if (!['admin', 'user'].includes(role)) {
      throw new Error('Invalid role');
    }

    const [perm, created] = await Permission.findOrCreate({
      where: { role, permission_key: permissionKey },
      defaults: { role, permission_key: permissionKey, enabled }
    });

    if (!created) {
      await perm.update({ enabled });
    }

    return perm;
  }

  /**
   * Bulk update permissions for a role.
   * `updates` is an array of { key: string, enabled: boolean }
   */
  async bulkUpdate(role, updates, requestingUser) {
    if (requestingUser.role !== 'main_admin') {
      throw new Error('Only Main Admin can update permissions');
    }

    if (!['admin', 'user'].includes(role)) {
      throw new Error('Invalid role');
    }

    const results = [];
    for (const { key, enabled } of updates) {
      const [perm, created] = await Permission.findOrCreate({
        where: { role, permission_key: key },
        defaults: { role, permission_key: key, enabled }
      });

      if (!created) {
        await perm.update({ enabled });
      }
      results.push(perm);
    }

    return results;
  }
}

module.exports = new PermissionService();
