'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorHandoffEvent — Phase F spec §2.2 (outbox pattern)
 *
 * Every cross-boundary ERP handoff step is recorded here with an
 * idempotency key. Replaying an event must never duplicate sales
 * orders, demands, or work orders.
 */
module.exports = (sequelize) => {
  const ConfiguratorHandoffEvent = sequelize.define(
    'ConfiguratorHandoffEvent',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      event_type: { type: DataTypes.STRING(60), allowNull: false },
      idempotency_key: { type: DataTypes.STRING(160), allowNull: false },
      status: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'done', 'failed']] },
      },
      payload: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      result: { type: DataTypes.JSONB, allowNull: true },
      error: { type: DataTypes.TEXT, allowNull: true },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'configurator_handoff_events',
      timestamps: true,
      underscored: true,
      indexes: [
        { unique: true, fields: ['event_type', 'idempotency_key'] },
        { fields: ['status'] },
      ],
    }
  );

  return ConfiguratorHandoffEvent;
};
