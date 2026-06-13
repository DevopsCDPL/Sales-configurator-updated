'use strict';

const { DataTypes } = require('sequelize');

/**
 * WorkTask — the schedulable, department-owned, dependency-aware unit of
 * production work (the *executable* twin of the printed WorkOrder traveller).
 *
 * `work_order_id` is intentionally FK-less (loose UUID) so this execution
 * layer stays decoupled from the work_orders document record (design §0.2).
 * `meta.predecessors` holds the task-id array forming the DAG.
 *
 * Design: docs/capacity-traveler-design.md §1, §2.1. INERT until routes mount.
 */
module.exports = (sequelize) => {
  const WorkTask = sequelize.define(
    'WorkTask',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      work_order_id: { type: DataTypes.UUID, allowNull: true },
      board_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'configurator_switchboards', key: 'id' },
        onDelete: 'CASCADE',
      },
      department: { type: DataTypes.STRING(40), allowNull: false },
      seq: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
      title: { type: DataTypes.STRING(255), allowNull: true },
      status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'pending',
        validate: { isIn: [['pending', 'ready', 'checked_in', 'done', 'quality_hold']] },
      },
      assignee_user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      },
      machine_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'capacity_machines', key: 'id' },
        onDelete: 'SET NULL',
      },
      est_hours: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
      est_start: { type: DataTypes.DATE, allowNull: true },
      est_finish: { type: DataTypes.DATE, allowNull: true },
      started_at: { type: DataTypes.DATE, allowNull: true },
      finished_at: { type: DataTypes.DATE, allowNull: true },
      quality_gate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      meta: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'work_tasks',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['board_id', 'seq'] },
        { fields: ['status'] },
        { fields: ['assignee_user_id'] },
        { fields: ['work_order_id'] },
      ],
    }
  );

  WorkTask.associate = (models) => {
    if (models.ConfiguratorSwitchboard) {
      WorkTask.belongsTo(models.ConfiguratorSwitchboard, { foreignKey: 'board_id', as: 'board' });
    }
    if (models.CapacityMachine) {
      WorkTask.belongsTo(models.CapacityMachine, { foreignKey: 'machine_id', as: 'machine' });
    }
    if (models.TaskEvent) {
      WorkTask.hasMany(models.TaskEvent, { foreignKey: 'task_id', as: 'events' });
    }
  };

  return WorkTask;
};
