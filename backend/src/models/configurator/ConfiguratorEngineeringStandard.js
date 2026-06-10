'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorEngineeringStandard — Phase B spec §2
 *
 * Versioned, company-scoped engineering reference tables consumed by
 * the design engines. One row = one version of one table; `rows` is
 * the table content. Editing creates a NEW version; configurations pin
 * the version they were designed against (never silently re-ruled).
 *
 * table_key ∈ voltage_systems | bus_schedule | bus_support_spacing |
 *             frame_library | motor_fla | ratings_ladders | safety_items_map
 */
module.exports = (sequelize) => {
  const ConfiguratorEngineeringStandard = sequelize.define(
    'ConfiguratorEngineeringStandard',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      table_key: { type: DataTypes.STRING(40), allowNull: false },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      /** Array of row objects; each row may carry {verified: bool, seed: bool} */
      rows: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'configurator_engineering_standards',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['table_key', 'is_current'] },
        { unique: true, fields: ['company_id', 'table_key', 'version'] },
      ],
    }
  );

  return ConfiguratorEngineeringStandard;
};
