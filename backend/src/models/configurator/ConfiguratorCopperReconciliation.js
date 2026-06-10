'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorCopperReconciliation — Phase D spec §5
 *
 * Estimated vs SolidWorks-exact copper weight per configuration /
 * quotation revision. |delta| > threshold routes to management review
 * with computed margin impact. Issued revisions are never mutated.
 */
module.exports = (sequelize) => {
  const ConfiguratorCopperReconciliation = sequelize.define(
    'ConfiguratorCopperReconciliation',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      switchboard_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_switchboards', key: 'id' },
        onDelete: 'CASCADE',
      },
      quotation_id: { type: DataTypes.UUID, allowNull: true },
      solidworks_job_id: { type: DataTypes.UUID, allowNull: true },
      estimated_lbs: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      exact_lbs: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      delta_pct: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
      price_per_lb: { type: DataTypes.DECIMAL(14, 6), allowNull: true },
      margin_impact_usd: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      per_section: { type: DataTypes.JSONB, allowNull: true },
      status: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: 'ok',
        validate: { isIn: [['ok', 'review', 'approved']] },
      },
      reviewed_by: { type: DataTypes.UUID, allowNull: true },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'configurator_copper_reconciliations',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['switchboard_id'] }, { fields: ['status'] }],
    }
  );

  return ConfiguratorCopperReconciliation;
};
