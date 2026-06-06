'use strict';

/**
 * Phase 1 — Sales Configurator migration.
 *
 * Creates `configurator_bom_items` and `configurator_labour_lines`,
 * the normalized breakdown of a configuration's computed BOM and the
 * per-category labour summary produced by the pricing engine.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('configurator_bom_items')) {
      await queryInterface.createTable('configurator_bom_items', {
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
        component_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'configurator_components', key: 'id' },
          onDelete: 'SET NULL',
        },
        step_key: { type: Sequelize.STRING(60), allowNull: true },
        category: { type: Sequelize.STRING(120), allowNull: true },
        part_number: { type: Sequelize.STRING(120), allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        quantity: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
        unit: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'ea' },
        unit_cost: { type: Sequelize.DECIMAL(14, 4), allowNull: true, defaultValue: 0 },
        total_cost: { type: Sequelize.DECIMAL(14, 4), allowNull: true, defaultValue: 0 },
        meta: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
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
      CREATE INDEX IF NOT EXISTS configurator_bom_items_config_idx
        ON configurator_bom_items (configuration_id);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_bom_items_component_idx
        ON configurator_bom_items (component_id);
    `);

    if (!tables.includes('configurator_labour_lines')) {
      await queryInterface.createTable('configurator_labour_lines', {
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
        category: { type: Sequelize.STRING(20), allowNull: false },
        hours: { type: Sequelize.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
        rate: { type: Sequelize.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
        total_cost: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        meta: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
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
      CREATE UNIQUE INDEX IF NOT EXISTS configurator_labour_lines_config_category_uniq
        ON configurator_labour_lines (configuration_id, category);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('configurator_labour_lines');
    await queryInterface.dropTable('configurator_bom_items');
  },
};
