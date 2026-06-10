'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorSolidworksJob — Phase E spec §2
 *
 * Postgres-backed job queue for the pull-based Windows SolidWorks
 * agent. Lease + heartbeat model; typed error codes drive retry policy.
 */
module.exports = (sequelize) => {
  const ConfiguratorSolidworksJob = sequelize.define(
    'ConfiguratorSolidworksJob',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      switchboard_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_switchboards', key: 'id' },
        onDelete: 'CASCADE',
      },
      configuration_id: { type: DataTypes.UUID, allowNull: true },
      quotation_id: { type: DataTypes.UUID, allowNull: true },
      job_type: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'FULL',
        validate: { isIn: [['FULL', 'DRAWINGS', 'COPPER_ONLY']] },
      },
      payload: { type: DataTypes.JSONB, allowNull: false },
      payload_version: { type: DataTypes.STRING(8), allowNull: false, defaultValue: '1.0' },
      payload_hash: { type: DataTypes.STRING(64), allowNull: false },
      status: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: 'queued',
        validate: { isIn: [['queued', 'leased', 'running', 'succeeded', 'failed', 'cancelled']] },
      },
      priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      max_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
      last_error_code: { type: DataTypes.STRING(32), allowNull: true },
      last_error_message: { type: DataTypes.TEXT, allowNull: true },
      leased_by_agent_id: { type: DataTypes.UUID, allowNull: true },
      lease_expires_at: { type: DataTypes.DATE, allowNull: true },
      next_attempt_at: { type: DataTypes.DATE, allowNull: true },
      progress: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      timeout_min: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 45 },
      cancel_requested: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      artifacts: { type: DataTypes.JSONB, allowNull: true, defaultValue: [] },
      requested_by: { type: DataTypes.UUID, allowNull: true },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'configurator_solidworks_jobs',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['status', 'priority', 'created_at'] },
        { fields: ['switchboard_id'] },
        { fields: ['payload_hash'] },
      ],
    }
  );

  return ConfiguratorSolidworksJob;
};
