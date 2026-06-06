'use strict';

/**
 * Phase 1 — Sales Configurator migration.
 *
 * Creates `configurator_components` plus its supporting indexes.
 *
 * Schema deviation from the original SQLAlchemy single-table-inheritance
 * model (Component → CAMLOCKConnector / Conduit / …): the discriminator
 * is kept as the `component_type` column and subclass-specific fields
 * live in the `specifications` JSONB. A GIN index on `specifications`
 * keeps category-specific filters fast without a wide column matrix.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('configurator_components')) {
      await queryInterface.createTable('configurator_components', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        part_number: { type: Sequelize.STRING(120), allowNull: true },
        name: { type: Sequelize.STRING(255), allowNull: false },
        category: { type: Sequelize.STRING(120), allowNull: true },
        subcategory: { type: Sequelize.STRING(120), allowNull: true },
        type: { type: Sequelize.STRING(120), allowNull: true },
        component_type: { type: Sequelize.STRING(60), allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: true },

        price: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        material_cost: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        labor_cost: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        mat_cost: { type: Sequelize.DECIMAL(14, 4), allowNull: true },

        lbr_cu: { type: Sequelize.DECIMAL(10, 4), allowNull: true },
        lbr_asm: { type: Sequelize.DECIMAL(10, 4), allowNull: true },
        lbr_cnt: { type: Sequelize.DECIMAL(10, 4), allowNull: true },
        lbr_qc: { type: Sequelize.DECIMAL(10, 4), allowNull: true },
        lbr_tst: { type: Sequelize.DECIMAL(10, 4), allowNull: true },
        lbr_eng: { type: Sequelize.DECIMAL(10, 4), allowNull: true },
        lbr_cad: { type: Sequelize.DECIMAL(10, 4), allowNull: true },

        specifications: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: {},
        },
        image_url: { type: Sequelize.TEXT, allowNull: true },
        excel_date: { type: Sequelize.STRING(40), allowNull: true },
        comments: { type: Sequelize.TEXT, allowNull: true },
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

    // Per-company part-number uniqueness (partial, ignores NULL part_numbers and soft-deleted rows).
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS configurator_components_company_pn_uniq
        ON configurator_components (company_id, part_number)
        WHERE part_number IS NOT NULL AND deleted_at IS NULL;
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_components_company_category_idx
        ON configurator_components (company_id, category);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_components_company_active_idx
        ON configurator_components (company_id, is_active);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_components_type_idx
        ON configurator_components (component_type);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_components_specifications_gin
        ON configurator_components USING GIN (specifications);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('configurator_components');
  },
};
