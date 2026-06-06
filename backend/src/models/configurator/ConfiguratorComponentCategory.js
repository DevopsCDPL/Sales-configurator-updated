'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorComponentCategory
 *
 * Master list of switchgear component categories used by the Sales
 * Configurator (Enclosure, Bussing, Conduit, …).
 *
 * Source: SQLAlchemy `ComponentCategory` model in
 * `config/backend/app/models/base_models.py` (Phase 0 analysis §4.4).
 *
 * Conventions:
 * - Tenant-scoped via `company_id`.
 * - Soft-delete via Sequelize paranoid mode.
 * - `(company_id, normalized_name)` is unique (enforced by migration).
 */
module.exports = (sequelize) => {
  const ConfiguratorComponentCategory = sequelize.define(
    'ConfiguratorComponentCategory',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      normalized_name: {
        type: DataTypes.STRING(120),
        allowNull: false,
        comment: 'Lowercase + trimmed; used for case-insensitive lookups',
      },
      display_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
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
      tableName: 'configurator_component_categories',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      paranoid: true,
      deletedAt: 'deleted_at',
    }
  );

  return ConfiguratorComponentCategory;
};
