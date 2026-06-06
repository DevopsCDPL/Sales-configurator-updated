'use strict';

/**
 * Phase 1 — Sales Configurator migration.
 *
 * Creates `configurator_system_parameters` (per-user defaults) and
 * `configurator_system_sections` (per-configuration breakdown).
 *
 * Combined in one migration because both come from the configurator's
 * SystemDesign step and are always created together at boot.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('configurator_system_parameters')) {
      await queryInterface.createTable('configurator_system_parameters', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        user_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        data: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        company_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'companies', key: 'id' },
          onDelete: 'CASCADE',
        },
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
      CREATE UNIQUE INDEX IF NOT EXISTS configurator_system_params_company_user_uniq
        ON configurator_system_parameters (company_id, user_id);
    `);

    if (!tables.includes('configurator_system_sections')) {
      await queryInterface.createTable('configurator_system_sections', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        configuration_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'configurator_configurations', key: 'id' },
          onDelete: 'CASCADE',
        },
        section_number: { type: Sequelize.INTEGER, allowNull: false },
        name: { type: Sequelize.STRING(120), allowNull: true },
        definition: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        company_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'companies', key: 'id' },
          onDelete: 'CASCADE',
        },
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
      CREATE UNIQUE INDEX IF NOT EXISTS configurator_system_sections_config_num_uniq
        ON configurator_system_sections (configuration_id, section_number);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('configurator_system_sections');
    await queryInterface.dropTable('configurator_system_parameters');
  },
};
