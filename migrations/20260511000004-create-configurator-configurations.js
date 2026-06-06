'use strict';

/**
 * Phase 1 — Sales Configurator migration.
 *
 * Creates `configurator_configurations` — the per-project (or template)
 * configurator session record.
 *
 * `code` is generated via `documentNumberingService.CONFIGURATION_NUMBER`
 * (CFG-####) at the application layer; uniqueness here is enforced as
 * a partial unique index keyed on (company_id, code).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('configurator_configurations')) {
      await queryInterface.createTable('configurator_configurations', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        code: { type: Sequelize.STRING(50), allowNull: true },
        name: { type: Sequelize.STRING(200), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },

        project_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'projects', key: 'id' },
          onDelete: 'SET NULL',
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },

        config_data: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        active_step: {
          type: Sequelize.STRING(60),
          allowNull: true,
          defaultValue: 'system_design',
        },
        progress_pct: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        is_template: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        is_draft: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },

        company_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'companies', key: 'id' },
          onDelete: 'CASCADE',
        },
        created_by: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        deleted_at: { type: Sequelize.DATE, allowNull: true },
        deleted_by: { type: Sequelize.UUID, allowNull: true },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
      });
    }

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS configurator_configurations_company_code_uniq
        ON configurator_configurations (company_id, code)
        WHERE code IS NOT NULL AND deleted_at IS NULL;
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_configurations_project_idx
        ON configurator_configurations (project_id);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_configurations_company_template_idx
        ON configurator_configurations (company_id, is_template);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_configurations_company_user_draft_idx
        ON configurator_configurations (company_id, user_id, is_draft);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('configurator_configurations');
  },
};
