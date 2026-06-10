'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorSwitchboard — Phase A spec §4.1
 *
 * One physical switchgear/switchboard inside a Configuration.
 * UI: one "card" on the Configuration cards screen.
 */
module.exports = (sequelize) => {
  const ConfiguratorSwitchboard = sequelize.define(
    'ConfiguratorSwitchboard',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      configuration_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_configurations', key: 'id' },
        onDelete: 'CASCADE',
      },
      board_index: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      name: { type: DataTypes.STRING(160), allowNull: false, defaultValue: 'Switchboard 1' },
      standards_regime: {
        type: DataTypes.STRING(8),
        allowNull: false,
        defaultValue: 'UL',
        validate: { isIn: [['UL', 'IEC']] },
      },
      board_type: {
        type: DataTypes.STRING(40),
        allowNull: true,
        comment: 'SWITCHBOARD_UL891 | GEN_PARALLELING | PDU | RPP | DOCKING_STATION',
      },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'draft',
        validate: { isIn: [['draft', 'complete', 'locked']] },
      },
      service_entrance: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      /** boardParameters envelope (SystemParameters shape) */
      board_data: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      /** Phase C requirements intake envelope */
      intake: { type: DataTypes.JSONB, allowNull: true },
      /** Phase E: none | queued | running | generated | failed */
      drawings_status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'none' },
      cloned_from_switchboard_id: { type: DataTypes.UUID, allowNull: true },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'configurator_switchboards',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['configuration_id', 'board_index'] }],
    }
  );

  ConfiguratorSwitchboard.associate = (models) => {
    if (models.ConfiguratorConfiguration) {
      ConfiguratorSwitchboard.belongsTo(models.ConfiguratorConfiguration, {
        foreignKey: 'configuration_id',
        as: 'configuration',
      });
    }
    if (models.ConfiguratorSystemSection) {
      ConfiguratorSwitchboard.hasMany(models.ConfiguratorSystemSection, {
        foreignKey: 'switchboard_id',
        as: 'sections',
      });
    }
    if (models.ConfiguratorComponentLine) {
      ConfiguratorSwitchboard.hasMany(models.ConfiguratorComponentLine, {
        foreignKey: 'switchboard_id',
        as: 'componentLines',
      });
    }
  };

  return ConfiguratorSwitchboard;
};
