'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorPriceRfq — Phase A spec §4.1 (Awaiting-Price loop)
 *
 * Builder-generated catalog numbers queue here until the manufacturer
 * returns a price. On `received` the component price flips to FIRM and
 * dependent configurations are flagged for re-quote review.
 */
module.exports = (sequelize) => {
  const ConfiguratorPriceRfq = sequelize.define(
    'ConfiguratorPriceRfq',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      component_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_components', key: 'id' },
        onDelete: 'CASCADE',
      },
      catalog_number: { type: DataTypes.STRING(160), allowNull: false },
      manufacturer: { type: DataTypes.STRING(120), allowNull: true },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'open',
        validate: { isIn: [['open', 'sent', 'received', 'cancelled']] },
      },
      requested_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      received_price: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
      received_at: { type: DataTypes.DATE, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'configurator_price_rfqs',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['status'] }, { fields: ['component_id'] }],
    }
  );

  return ConfiguratorPriceRfq;
};
