'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorSystemParameters
 *
 * Per-user system-design defaults captured by the configurator
 * SystemDesignPanel. Mirrors `SystemParameters` from
 * `config/backend/app/models/base_models.py`.
 *
 * Unique on (company_id, user_id) — one row per user per tenant.
 */
module.exports = (sequelize) => {
  const ConfiguratorSystemParameters = sequelize.define(
    'ConfiguratorSystemParameters',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
      },
    },
    {
      tableName: 'configurator_system_parameters',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return ConfiguratorSystemParameters;
};
