'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('audit_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      action: {
        type: Sequelize.ENUM(
          'user_created',
          'user_updated',
          'user_deleted',
          'user_deactivated',
          'user_activated',
          'role_changed',
          'permissions_updated',
          'password_reset',
          'login_success',
          'login_failed'
        ),
        allowNull: false
      },
      entity_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'user'
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      entity_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      performed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      performer_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      performer_role: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      details: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Index for efficient querying
    await queryInterface.addIndex('audit_logs', ['performed_by']);
    await queryInterface.addIndex('audit_logs', ['entity_id']);
    await queryInterface.addIndex('audit_logs', ['action']);
    await queryInterface.addIndex('audit_logs', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_logs');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_audit_logs_action";');
  }
};
