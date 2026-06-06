'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorQuotation
 *
 * Configurator-specific quotation header. Merged with the Forge
 * project-level quotation flow: a project's `quotation_number` (already
 * in `projects` table) points at the user-visible quote, while this row
 * carries the configurator-specific pricing breakdown (`bom_spec`,
 * margins, terms) needed to regenerate the PDF.
 *
 * Source: SQLAlchemy `Quotation` model in `config/backend/app/models/`
 * plus the `bom_spec` JSON column added by Alembic migration
 * `add_bom_spec_20260123`.
 *
 * Soft-delete via paranoid; tenant-scoped.
 */
module.exports = (sequelize) => {
  const ConfiguratorQuotation = sequelize.define(
    'ConfiguratorQuotation',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      quotation_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Mirror of projects.quotation_number for direct lookups',
      },
      project_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      configuration_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'configurator_configurations', key: 'id' },
        onDelete: 'SET NULL',
      },
      customer_name: { type: DataTypes.STRING(255), allowNull: true },
      issued_at: { type: DataTypes.DATE, allowNull: true },
      valid_until: { type: DataTypes.DATE, allowNull: true },
      status: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'draft',
        comment: 'draft | sent | accepted | rejected | sold | expired',
      },
      sold: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },

      // Totals (kept denormalized for fast list queries)
      subtotal: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      labour_total: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      material_total: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      overhead_total: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      margin_pct: { type: DataTypes.DECIMAL(8, 4), allowNull: false, defaultValue: 0 },
      margin_total: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      tax_total: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      grand_total: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
      currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'USD' },

      // Free-form breakdown used by PDF generator and parity caches
      bom_spec: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      pricing_spec: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      terms: { type: DataTypes.TEXT, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      pdf_document_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'documents', key: 'id' },
        onDelete: 'SET NULL',
      },

      // Tenant + audit
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
      deleted_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'configurator_quotations',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      paranoid: true,
      deletedAt: 'deleted_at',
    }
  );

  return ConfiguratorQuotation;
};
