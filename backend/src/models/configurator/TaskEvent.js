'use strict';

const { DataTypes } = require('sequelize');

/**
 * TaskEvent — immutable audit trail for a WorkTask (check-in/out,
 * quality pass/fail, reassign, rework, ...).
 * Design: docs/capacity-traveler-design.md §2.1. INERT until routes mount.
 */
module.exports = (sequelize) => {
  const TaskEvent = sequelize.define(
    'TaskEvent',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      task_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'work_tasks', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: DataTypes.STRING(40), allowNull: false },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      meta: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'task_events',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['task_id', 'at'] }],
    }
  );

  TaskEvent.associate = (models) => {
    if (models.WorkTask) {
      TaskEvent.belongsTo(models.WorkTask, { foreignKey: 'task_id', as: 'task' });
    }
  };

  return TaskEvent;
};
