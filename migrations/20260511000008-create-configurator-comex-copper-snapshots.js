'use strict';

/**
 * Phase 1 — Sales Configurator migration.
 *
 * Creates `configurator_comex_copper_snapshots` — persistent storage
 * for fetched Comex/COMEXLIVE copper-spot prices used by the
 * configurator pricing engine.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('configurator_comex_copper_snapshots')) {
      await queryInterface.createTable('configurator_comex_copper_snapshots', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        captured_on: { type: Sequelize.DATEONLY, allowNull: false },
        price_per_lb: { type: Sequelize.DECIMAL(14, 6), allowNull: false, defaultValue: 0 },
        currency: { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'USD' },
        source: { type: Sequelize.STRING(80), allowNull: true, defaultValue: 'comexlive' },
        raw_payload: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
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
      CREATE UNIQUE INDEX IF NOT EXISTS configurator_copper_snapshots_company_date_uniq
        ON configurator_comex_copper_snapshots (company_id, captured_on);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('configurator_comex_copper_snapshots');
  },
};
