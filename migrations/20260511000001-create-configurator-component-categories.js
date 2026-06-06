'use strict';

/**
 * Phase 1 — Sales Configurator migration.
 *
 * Creates `configurator_component_categories`.
 * Idempotent: skipped if the table already exists.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('configurator_component_categories')) {
      await queryInterface.createTable('configurator_component_categories', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        name: { type: Sequelize.STRING(120), allowNull: false },
        normalized_name: { type: Sequelize.STRING(120), allowNull: false },
        display_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
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

    // Indexes (each guarded by IF NOT EXISTS for re-runnability)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS configurator_cat_company_normname_uniq
        ON configurator_component_categories (company_id, normalized_name)
        WHERE deleted_at IS NULL;
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_cat_display_order_idx
        ON configurator_component_categories (display_order);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_cat_is_active_idx
        ON configurator_component_categories (is_active);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('configurator_component_categories');
  },
};
