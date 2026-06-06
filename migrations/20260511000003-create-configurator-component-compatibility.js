'use strict';

/**
 * Phase 1 — Sales Configurator migration.
 *
 * Creates `configurator_component_compatibility` — the explicit join
 * table for the self-M2M ConfiguratorComponent <-> ConfiguratorComponent
 * compatibility graph.
 *
 * The `bidirectional` flag preserves the original configurator's
 * "compatibility is symmetric by default" semantics while allowing
 * directed exclusions (e.g. "X fits inside Y" but not vice versa).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('configurator_component_compatibility')) {
      await queryInterface.createTable('configurator_component_compatibility', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        component_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'configurator_components', key: 'id' },
          onDelete: 'CASCADE',
        },
        compatible_component_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'configurator_components', key: 'id' },
          onDelete: 'CASCADE',
        },
        bidirectional: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        notes: { type: Sequelize.TEXT, allowNull: true },
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
      CREATE UNIQUE INDEX IF NOT EXISTS configurator_component_compat_pair_uniq
        ON configurator_component_compatibility (component_id, compatible_component_id);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_component_compat_reverse_idx
        ON configurator_component_compatibility (compatible_component_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('configurator_component_compatibility');
  },
};
