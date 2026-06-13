'use strict';

const { DataTypes } = require('sequelize');

/**
 * CapacityTeam — a department crew (e.g. "Bus Fab Team A").
 * Design: docs/capacity-traveler-design.md §2.1. INERT until routes mount.
 */
module.exports = (sequelize) => {
  const CapacityTeam = sequelize.define(
    'CapacityTeam',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING(160), allowNull: false },
      department: { type: DataTypes.STRING(40), allowNull: false },
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
      tableName: 'capacity_teams',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['department'] }],
    }
  );

  CapacityTeam.associate = (models) => {
    if (models.CapacityWorker) {
      CapacityTeam.hasMany(models.CapacityWorker, { foreignKey: 'team_id', as: 'workers' });
    }
  };

  return CapacityTeam;
};
