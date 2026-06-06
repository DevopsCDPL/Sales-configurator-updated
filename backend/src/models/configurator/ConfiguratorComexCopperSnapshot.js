'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorComexCopperSnapshot
 *
 * Captured copper-spot prices fetched from the Comex/COMEXLIVE upstream.
 * Replaces the localStorage key `tps-copper-snapshot-latest` and the
 * Python `/api/market/copper` endpoint, persisting every fetch so the
 * pricing engine can re-quote against historical copper prices.
 */
module.exports = (sequelize) => {
  const ConfiguratorComexCopperSnapshot = sequelize.define(
    'ConfiguratorComexCopperSnapshot',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      captured_on: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        comment: 'Trading-date the snapshot represents',
      },
      price_per_lb: {
        type: DataTypes.DECIMAL(14, 6),
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: DataTypes.STRING(8),
        allowNull: false,
        defaultValue: 'USD',
      },
      source: {
        type: DataTypes.STRING(80),
        allowNull: true,
        defaultValue: 'comexlive',
      },
      raw_payload: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Verbatim upstream response for audit',
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
    },
    {
      tableName: 'configurator_comex_copper_snapshots',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return ConfiguratorComexCopperSnapshot;
};
