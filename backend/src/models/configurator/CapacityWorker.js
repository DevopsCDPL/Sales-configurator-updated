'use strict';

const { DataTypes } = require('sequelize');

/**
 * CapacityWorker — a person who executes work_tasks.
 * Linked to a User (nullable so a roster can be stubbed before logins exist).
 * Design: docs/capacity-traveler-design.md §2.1. INERT until routes mount.
 */
module.exports = (sequelize) => {
  const CapacityWorker = sequelize.define(
    'CapacityWorker',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      team_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'capacity_teams', key: 'id' },
        onDelete: 'SET NULL',
      },
      display_name: { type: DataTypes.STRING(160), allowNull: true },
      department: { type: DataTypes.STRING(40), allowNull: false },
      skills: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      hours_per_day: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 8 },
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
      tableName: 'capacity_workers',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['department'] }, { fields: ['user_id'] }],
    }
  );

  CapacityWorker.associate = (models) => {
    if (models.CapacityTeam) {
      CapacityWorker.belongsTo(models.CapacityTeam, { foreignKey: 'team_id', as: 'team' });
    }
    if (models.User) {
      CapacityWorker.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  };

  return CapacityWorker;
};
