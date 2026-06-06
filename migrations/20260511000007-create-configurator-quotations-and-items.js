'use strict';

/**
 * Phase 1 — Sales Configurator migration.
 *
 * Creates `configurator_quotations` and `configurator_quotation_items`.
 *
 * The configurator quotation reuses Forge's project-level QUOTATION_NUMBER
 * (mirror is stored in `quotation_number`) so PDFs link back to the
 * same identifier customers already see.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();

    if (!tables.includes('configurator_quotations')) {
      await queryInterface.createTable('configurator_quotations', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        quotation_number: { type: Sequelize.STRING(50), allowNull: true },
        project_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'projects', key: 'id' },
          onDelete: 'CASCADE',
        },
        configuration_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'configurator_configurations', key: 'id' },
          onDelete: 'SET NULL',
        },
        customer_name: { type: Sequelize.STRING(255), allowNull: true },
        issued_at: { type: Sequelize.DATE, allowNull: true },
        valid_until: { type: Sequelize.DATE, allowNull: true },
        status: {
          type: Sequelize.STRING(40),
          allowNull: false,
          defaultValue: 'draft',
        },
        sold: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },

        subtotal: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        labour_total: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        material_total: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        overhead_total: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        margin_pct: { type: Sequelize.DECIMAL(8, 4), allowNull: false, defaultValue: 0 },
        margin_total: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        tax_total: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        grand_total: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        currency: { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'USD' },

        bom_spec: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        pricing_spec: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
        terms: { type: Sequelize.TEXT, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },

        pdf_document_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'documents', key: 'id' },
          onDelete: 'SET NULL',
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
      CREATE UNIQUE INDEX IF NOT EXISTS configurator_quotations_company_qnum_uniq
        ON configurator_quotations (company_id, quotation_number)
        WHERE quotation_number IS NOT NULL AND deleted_at IS NULL;
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_quotations_project_idx
        ON configurator_quotations (project_id);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_quotations_config_idx
        ON configurator_quotations (configuration_id);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_quotations_status_idx
        ON configurator_quotations (status);
    `);

    if (!tables.includes('configurator_quotation_items')) {
      await queryInterface.createTable('configurator_quotation_items', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        quotation_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'configurator_quotations', key: 'id' },
          onDelete: 'CASCADE',
        },
        component_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'configurator_components', key: 'id' },
          onDelete: 'SET NULL',
        },
        line_no: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        step_key: { type: Sequelize.STRING(60), allowNull: true },
        category: { type: Sequelize.STRING(120), allowNull: true },
        part_number: { type: Sequelize.STRING(120), allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        quantity: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
        unit: { type: Sequelize.STRING(20), allowNull: true, defaultValue: 'ea' },
        unit_price: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        line_total: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
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
      CREATE INDEX IF NOT EXISTS configurator_quotation_items_quotation_idx
        ON configurator_quotation_items (quotation_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('configurator_quotation_items');
    await queryInterface.dropTable('configurator_quotations');
  },
};
