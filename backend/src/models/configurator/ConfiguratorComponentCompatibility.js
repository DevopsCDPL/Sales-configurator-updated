'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorComponentCompatibility
 *
 * Self-referential many-to-many "is compatible with" mapping for
 * configurator components. Mirrors SQLAlchemy `component_compatibility`
 * association table from `config/backend/app/models/switchgear_components.py`.
 *
 * Stored as an explicit join model so it can carry a directional flag and an
 * optional `notes` column without losing index discipline.
 */
module.exports = (sequelize) => {
  const ConfiguratorComponentCompatibility = sequelize.define(
    'ConfiguratorComponentCompatibility',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      component_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_components', key: 'id' },
        onDelete: 'CASCADE',
      },
      compatible_component_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_components', key: 'id' },
        onDelete: 'CASCADE',
      },
      bidirectional: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
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
    },
    {
      tableName: 'configurator_component_compatibility',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return ConfiguratorComponentCompatibility;
};
