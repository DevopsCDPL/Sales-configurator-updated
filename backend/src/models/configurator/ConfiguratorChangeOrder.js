'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorChangeOrder — Phase F spec §5 (lightweight v1)
 *
 * Controlled mutation path for accepted/locked configurations. The
 * quotation revision diff IS the impact statement; placed POs are
 * never auto-cancelled.
 */
module.exports = (sequelize) => {
  const ConfiguratorChangeOrder = sequelize.define(
    'ConfiguratorChangeOrder',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      sales_order_id: { type: DataTypes.UUID, allowNull: true },
      configuration_id: { type: DataTypes.UUID, allowNull: false },
      switchboard_id: { type: DataTypes.UUID, allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: false },
      originator: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: 'internal',
        validate: { isIn: [['customer', 'internal']] },
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'pending_approval',
        validate: {
          isIn: [['draft', 'impact_review', 'customer_approval', 'pending_approval', 'approved', 'rejected', 'applied']],
        },
      },
      old_quotation_id: { type: DataTypes.UUID, allowNull: true },
      new_quotation_id: { type: DataTypes.UUID, allowNull: true },
      schedule_impact: { type: DataTypes.STRING(255), allowNull: true },
      customer_approval_doc_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      approved_by: { type: DataTypes.UUID, allowNull: true },
      approved_at: { type: DataTypes.DATE, allowNull: true },
      rejected_reason: { type: DataTypes.TEXT, allowNull: true },
      applied_at: { type: DataTypes.DATE, allowNull: true },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'configurator_change_orders',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['configuration_id'] }, { fields: ['status'] }],
    }
  );

  return ConfiguratorChangeOrder;
};
