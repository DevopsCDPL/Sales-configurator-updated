'use strict';

/**
 * Phase 1 — Sales Configurator migration.
 *
 * Creates `configurator_sld_documents` — the persisted Single-Line-Diagram
 * payload for the SLD step in the Configuration sub-flow.
 *
 * The structured `diagram` JSON is the source of truth; rendered exports
 * (PDF/PNG/SVG) are stored via Forge's `documents` table (R2-backed) and
 * linked via `rendered_document_id`.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('configurator_sld_documents')) {
      await queryInterface.createTable('configurator_sld_documents', {
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
        project_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'projects', key: 'id' },
          onDelete: 'SET NULL',
        },
        version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        title: { type: Sequelize.STRING(200), allowNull: true },
        diagram: {
          type: Sequelize.JSONB,
          allowNull: false,
          defaultValue: { nodes: [], edges: [], layout: {} },
        },
        rendered_document_id: {
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
      CREATE INDEX IF NOT EXISTS configurator_sld_config_idx
        ON configurator_sld_documents (configuration_id);
    `);
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS configurator_sld_project_idx
        ON configurator_sld_documents (project_id);
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('configurator_sld_documents');
  },
};
