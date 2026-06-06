'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ------ 1. Sessions table (session monitoring) ------------------------------------------------------------------------------------------
    await queryInterface.createTable('sessions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      token_hash: { type: Sequelize.STRING(64), allowNull: false },
      ip_address: { type: Sequelize.STRING(45) },
      user_agent: { type: Sequelize.TEXT },
      device: { type: Sequelize.STRING(50) },
      location: { type: Sequelize.STRING(200) },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      last_activity_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      revoked_at: { type: Sequelize.DATE },
      revoked_by: { type: Sequelize.UUID, references: { model: 'users', key: 'id' } },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // ------ 2. Custom Roles table ---------------------------------------------------------------------------------------------------------------------------------------------
    await queryInterface.createTable('custom_roles', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT },
      company_id: { type: Sequelize.UUID, references: { model: 'companies', key: 'id' } },
      is_system: { type: Sequelize.BOOLEAN, defaultValue: false },
      base_role: { type: Sequelize.STRING(20), defaultValue: 'user' },
      // Module --- Submodule --- Action permissions (JSONB)
      // e.g. { "Quotation": { "view": true, "create": true, "edit": true, "delete": false, "export": true, "approve": false }, ... }
      permissions: { type: Sequelize.JSONB, defaultValue: {} },
      // Conditional permissions / policies (PBAC)
      // e.g. [{ "field": "amount", "operator": "lt", "value": 10000, "action": "approve" }, { "scope": "own_records" }]
      conditions: { type: Sequelize.JSONB, defaultValue: [] },
      color: { type: Sequelize.STRING(7), defaultValue: '#6b7280' },
      icon: { type: Sequelize.STRING(50) },
      priority: { type: Sequelize.INTEGER, defaultValue: 0 },
      created_by: { type: Sequelize.UUID, references: { model: 'users', key: 'id' } },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // ------ 3. Approval Workflows table ---------------------------------------------------------------------------------------------------------------------------
    await queryInterface.createTable('approval_workflows', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      type: { type: Sequelize.STRING(50), allowNull: false },
      // e.g. 'user_creation', 'role_change', 'company_suspension', 'data_export', 'plan_change'
      title: { type: Sequelize.STRING(200), allowNull: false },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.STRING(20), defaultValue: 'pending' },
      // pending | approved | rejected | cancelled
      priority: { type: Sequelize.STRING(10), defaultValue: 'normal' },
      // low | normal | high | urgent
      entity_type: { type: Sequelize.STRING(50) },
      entity_id: { type: Sequelize.UUID },
      company_id: { type: Sequelize.UUID, references: { model: 'companies', key: 'id' } },
      requested_by: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      // Payload with the requested change details
      request_data: { type: Sequelize.JSONB, defaultValue: {} },
      // Multi-level approval chain
      approval_chain: { type: Sequelize.JSONB, defaultValue: [] },
      // [{ level: 1, approver_id, status, decided_at, comment }, ...]
      current_level: { type: Sequelize.INTEGER, defaultValue: 1 },
      decided_by: { type: Sequelize.UUID, references: { model: 'users', key: 'id' } },
      decided_at: { type: Sequelize.DATE },
      decision_comment: { type: Sequelize.TEXT },
      expires_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // ------ 4. Risk Scores table ------------------------------------------------------------------------------------------------------------------------------------------------
    await queryInterface.createTable('risk_scores', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      entity_type: { type: Sequelize.STRING(20), allowNull: false },
      // 'company' | 'user'
      entity_id: { type: Sequelize.UUID, allowNull: false },
      score: { type: Sequelize.INTEGER, defaultValue: 0 },
      // 0-100
      level: { type: Sequelize.STRING(10), defaultValue: 'low' },
      // low | medium | high | critical
      factors: { type: Sequelize.JSONB, defaultValue: [] },
      // [{ factor: 'failed_logins', weight: 30, detail: '12 failed in 24h' }, ...]
      last_calculated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // ------ 5. API Tokens table ---------------------------------------------------------------------------------------------------------------------------------------------------
    await queryInterface.createTable('api_tokens', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      token_prefix: { type: Sequelize.STRING(8) },
      user_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' } },
      company_id: { type: Sequelize.UUID, references: { model: 'companies', key: 'id' } },
      scopes: { type: Sequelize.JSONB, defaultValue: ['read'] },
      // ['read', 'write', 'admin']
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      last_used_at: { type: Sequelize.DATE },
      expires_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // ------ 6. Webhooks table ---------------------------------------------------------------------------------------------------------------------------------------------------------
    await queryInterface.createTable('webhooks', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      url: { type: Sequelize.STRING(500), allowNull: false },
      secret: { type: Sequelize.STRING(64) },
      events: { type: Sequelize.JSONB, defaultValue: [] },
      // ['user.created', 'user.updated', 'role.changed', 'company.suspended', ...]
      company_id: { type: Sequelize.UUID, references: { model: 'companies', key: 'id' } },
      created_by: { type: Sequelize.UUID, references: { model: 'users', key: 'id' } },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      last_triggered_at: { type: Sequelize.DATE },
      failure_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // ------ 7. Activity Timeline table ------------------------------------------------------------------------------------------------------------------------------
    await queryInterface.createTable('activity_timeline', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      company_id: { type: Sequelize.UUID, references: { model: 'companies', key: 'id' } },
      user_id: { type: Sequelize.UUID, references: { model: 'users', key: 'id' } },
      action: { type: Sequelize.STRING(100), allowNull: false },
      // e.g. 'user_added', 'role_changed', 'admin_modified', 'login', 'logout', 'data_export', 'setting_changed'
      description: { type: Sequelize.TEXT },
      metadata: { type: Sequelize.JSONB, defaultValue: {} },
      icon: { type: Sequelize.STRING(50) },
      severity: { type: Sequelize.STRING(10), defaultValue: 'info' },
      // info | warning | error | success
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // ------ 8. Add custom_role_id to users table ------------------------------------------------------------------------------------------------
    await queryInterface.addColumn('users', 'custom_role_id', {
      type: Sequelize.UUID,
      references: { model: 'custom_roles', key: 'id' },
      onDelete: 'SET NULL',
    });

    // ------ 9. Add branding fields to companies ---------------------------------------------------------------------------------------------------
    await queryInterface.addColumn('companies', 'logo_url', { type: Sequelize.STRING(500) });
    await queryInterface.addColumn('companies', 'theme_color', { type: Sequelize.STRING(7), defaultValue: '#0f766e' });
    await queryInterface.addColumn('companies', 'custom_domain', { type: Sequelize.STRING(200) });
    await queryInterface.addColumn('companies', 'data_retention_days', { type: Sequelize.INTEGER, defaultValue: 365 });
    await queryInterface.addColumn('companies', 'compliance_flags', { type: Sequelize.JSONB, defaultValue: [] });
    // ['gdpr', 'soc2', 'iso27001']

    // ------ 10. Indexes ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    await queryInterface.addIndex('sessions', ['user_id', 'is_active']);
    await queryInterface.addIndex('sessions', ['token_hash']);
    await queryInterface.addIndex('custom_roles', ['company_id']);
    await queryInterface.addIndex('approval_workflows', ['status', 'company_id']);
    await queryInterface.addIndex('approval_workflows', ['requested_by']);
    await queryInterface.addIndex('risk_scores', ['entity_type', 'entity_id']);
    await queryInterface.addIndex('api_tokens', ['user_id']);
    await queryInterface.addIndex('api_tokens', ['token_hash']);
    await queryInterface.addIndex('webhooks', ['company_id']);
    await queryInterface.addIndex('activity_timeline', ['company_id', 'created_at']);
    await queryInterface.addIndex('activity_timeline', ['user_id']);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'custom_role_id');
    await queryInterface.removeColumn('companies', 'logo_url');
    await queryInterface.removeColumn('companies', 'theme_color');
    await queryInterface.removeColumn('companies', 'custom_domain');
    await queryInterface.removeColumn('companies', 'data_retention_days');
    await queryInterface.removeColumn('companies', 'compliance_flags');
    await queryInterface.dropTable('activity_timeline');
    await queryInterface.dropTable('webhooks');
    await queryInterface.dropTable('api_tokens');
    await queryInterface.dropTable('risk_scores');
    await queryInterface.dropTable('approval_workflows');
    await queryInterface.dropTable('custom_roles');
    await queryInterface.dropTable('sessions');
  },
};
