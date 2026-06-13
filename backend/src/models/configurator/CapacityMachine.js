'use strict';

const { DataTypes } = require('sequelize');

/**
 * CapacityMachine — a work-center / machine with finite capacity
 * (CNC punch, brake, plating line, test bay, ...).
 * Design: docs/capacity-traveler-design.md §2.1. INERT until routes mount.
 */
module.exports = (sequelize) => {
  const CapacityMachine = sequelize.define(
    'CapacityMachine',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(160), allowNull: false },
      type: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'generic' },
      department: { type: DataTypes.STRING(40), allowNull: true },
      capacity_unit: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'hours',
        comment: 'hours | batch',
      },
      capacity_per_day: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 8 },
      in_house: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      meta: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'capacity_machines',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['type'] }],
    }
  );

  return CapacityMachine;
};
