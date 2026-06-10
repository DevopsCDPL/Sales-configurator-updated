'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorSolidworksAgent — Phase E spec §3 (agent registry)
 */
module.exports = (sequelize) => {
  const ConfiguratorSolidworksAgent = sequelize.define(
    'ConfiguratorSolidworksAgent',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      api_token_id: { type: DataTypes.UUID, allowNull: true },
      /** { payloadVersions: ["1"], jobTypes: ["FULL","DRAWINGS","COPPER_ONLY"], maxConcurrent: 1 } */
      capabilities: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      last_seen_at: { type: DataTypes.DATE, allowNull: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'configurator_solidworks_agents',
      timestamps: true,
      underscored: true,
    }
  );

  return ConfiguratorSolidworksAgent;
};
