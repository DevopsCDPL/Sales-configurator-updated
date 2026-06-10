'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // --------- Company enhancements ------------------------------------------------------------------------------------------------------------------------------------------------------
    await queryInterface.addColumn('companies', 'plan', {
      type: Sequelize.ENUM('free', 'starter', 'professional', 'enterprise'),
      defaultValue: 'starter',
      allowNull: false,
    });
    await queryInterface.addColumn('companies', 'suspended_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('companies', 'suspension_reason', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('companies', 'risk_flags', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: false,
    });
    await queryInterface.addColumn('companies', 'settings', {
      type: Sequelize.JSONB,
      defaultValue: {},
      allowNull: false,
    });
    await queryInterface.addColumn('companies', 'ip_whitelist', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: false,
    });
    await queryInterface.addColumn('companies', 'storage_used_mb', {
      type: Sequelize.FLOAT,
      defaultValue: 0,
    });
    await queryInterface.addColumn('companies', 'last_activity_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // --------- User enhancements ---------------------------------------------------------------------------------------------------------------------------------------------------------------
    await queryInterface.addColumn('users', 'department', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'tags', {
      type: Sequelize.JSONB,
      defaultValue: [],
      allowNull: false,
    });
    await queryInterface.addColumn('users', 'last_login_ip', {
      type: Sequelize.STRING(45),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'last_login_device', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'failed_login_attempts', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
    });
    await queryInterface.addColumn('users', 'locked_until', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'two_factor_enabled', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
    await queryInterface.addColumn('users', 'force_password_reset', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    });
    await queryInterface.addColumn('users', 'module_permissions', {
      type: Sequelize.JSONB,
      defaultValue: {},
      allowNull: false,
    });
    await queryInterface.addColumn('users', 'invited_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'invite_status', {
      type: Sequelize.ENUM('pending', 'accepted', 'expired'),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    }).catch(() => {});

    // --------- Expand audit log action enum ------------------------------------------------------------------------------------------------------------------------------
    // Add new enum values using raw SQL (Postgres)
    const newActions = [
      'company_created', 'company_updated', 'company_suspended', 'company_reactivated',
      'company_plan_changed', 'company_deleted',
      'bulk_import', 'bulk_deactivate', 'user_invited',
      'data_exported', 'session_terminated', 'account_locked', 'account_unlocked',
      'two_factor_enabled', 'two_factor_disabled',
      'force_password_reset', 'impersonation_start', 'impersonation_end',
      'permission_template_created', 'permission_template_updated', 'permission_template_deleted',
    ];
    for (const action of newActions) {
      await queryInterface.sequelize.query(
        `ALTER TYPE "enum_audit_logs_action" ADD VALUE IF NOT EXISTS '${action}'`
      ).catch(() => {});
    }

    // --------- Permission Templates table ------------------------------------------------------------------------------------------------------------------------------------
    await queryInterface.createTable('permission_templates', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      permissions: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      company_id: {
        type: Sequelize.UUID, allowNull: true,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      created_by: {
        type: Sequelize.UUID, allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      is_global: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    // --------- Login History table ---------------------------------------------------------------------------------------------------------------------------------------------------------
    await queryInterface.createTable('login_history', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID, allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      ip_address: { type: Sequelize.STRING(45), allowNull: true },
      user_agent: { type: Sequelize.TEXT, allowNull: true },
      device: { type: Sequelize.STRING(100), allowNull: true },
      location: { type: Sequelize.STRING(255), allowNull: true },
      status: { type: Sequelize.ENUM('success', 'failed'), allowNull: false },
      failure_reason: { type: Sequelize.STRING(255), allowNull: true },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.fn('NOW') },
    });

    await queryInterface.addIndex('login_history', ['user_id']);
    await queryInterface.addIndex('login_history', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('login_history');
    await queryInterface.dropTable('permission_templates');

    const userCols = [
      'department', 'tags', 'last_login_ip', 'last_login_device',
      'failed_login_attempts', 'locked_until', 'two_factor_enabled',
      'force_password_reset', 'module_permissions', 'invited_at', 'invite_status',
    ];
    for (const col of userCols) {
      await queryInterface.removeColumn('users', col).catch(() => {});
    }

    const companyCols = [
      'plan', 'suspended_at', 'suspension_reason', 'risk_flags',
      'settings', 'ip_whitelist', 'storage_used_mb', 'last_activity_at',
    ];
    for (const col of companyCols) {
      await queryInterface.removeColumn('companies', col).catch(() => {});
    }
  },
};
