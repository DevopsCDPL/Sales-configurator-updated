'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorConfiguration
 *
 * A single saved (or in-progress) configurator session for a project.
 *
 * Mirrors the SQLAlchemy `Configuration` model from
 * `config/backend/app/models/base_models.py` but adds:
 *   • `project_id` FK so a Forge project owns the configuration
 *     (nullable — a saved config can exist as a reusable template).
 *   • `code` (human-readable, e.g. CFG-0001) generated via
 *     documentNumberingService.
 *   • `is_template`, `is_draft` flags for "Saved Configurations" UX.
 *   • `active_step` mirror of the configurator inner-stepper position.
 */
module.exports = (sequelize) => {
  const ConfiguratorConfiguration = sequelize.define(
    'ConfiguratorConfiguration',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Auto-generated configuration code (CFG-####), unique per company',
      },
      name: { type: DataTypes.STRING(200), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },

      project_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'SET NULL',
        comment: 'Project this configuration belongs to (NULL for templates)',
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        comment: 'Owner / last-editor — used for the original /api/configs filter',
      },

      // Free-form workflow state — the configurator engine writes the
      // entire SystemParameters + per-step selections here.
      config_data: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      active_step: {
        type: DataTypes.STRING(60),
        allowNull: true,
        defaultValue: 'system_design',
      },
      progress_pct: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },

      is_template: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      is_draft: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      tableName: 'configurator_configurations',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      paranoid: true,
      deletedAt: 'deleted_at',
    }
  );

  return ConfiguratorConfiguration;
};
