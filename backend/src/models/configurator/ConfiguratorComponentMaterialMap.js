'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorComponentMaterialMap — Phase F spec §3.2
 *
 * Links the three part masters (ConfiguratorComponent / Material / Part)
 * until post-v1 unification. A demand cannot release to PR while its
 * part is unmapped. This table is the future unification migration source.
 */
module.exports = (sequelize) => {
  const ConfiguratorComponentMaterialMap = sequelize.define(
    'ConfiguratorComponentMaterialMap',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      component_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_components', key: 'id' },
        onDelete: 'CASCADE',
      },
      material_id: { type: DataTypes.UUID, allowNull: true },
      part_id: { type: DataTypes.UUID, allowNull: true },
      confidence: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: 'unmapped',
        validate: { isIn: [['exact', 'manual', 'unmapped']] },
      },
      mapped_by: { type: DataTypes.UUID, allowNull: true },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'configurator_component_material_map',
      timestamps: true,
      underscored: true,
      indexes: [
        { unique: true, fields: ['company_id', 'component_id'] },
        { fields: ['confidence'] },
      ],
    }
  );

  return ConfiguratorComponentMaterialMap;
};
