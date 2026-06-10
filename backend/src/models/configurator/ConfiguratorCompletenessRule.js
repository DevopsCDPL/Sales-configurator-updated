'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorCompletenessRule — Phase A spec §4.1 (BOM Completeness Engine)
 *
 * Per board type, which categories are mandatory before a quotation
 * may be issued. Evaluated by services/configurator/completenessEngine.js.
 */
module.exports = (sequelize) => {
  const ConfiguratorCompletenessRule = sequelize.define(
    'ConfiguratorCompletenessRule',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      board_type: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: '*',
        comment: '"*" = all board types',
      },
      category: { type: DataTypes.STRING(120), allowNull: false },
      requirement: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'REQUIRED',
        validate: { isIn: [['REQUIRED', 'CONDITIONAL', 'OPTIONAL']] },
      },
      /** JS-safe expression evaluated against {board, sections, lines} context */
      condition_expr: { type: DataTypes.STRING(500), allowNull: true },
      severity: {
        type: DataTypes.STRING(8),
        allowNull: false,
        defaultValue: 'BLOCK',
        validate: { isIn: [['BLOCK', 'WARN']] },
      },
      message: { type: DataTypes.STRING(255), allowNull: false },
      /** scope hint: per_section | per_board */
      applies_per: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'per_board',
        validate: { isIn: [['per_board', 'per_section']] },
      },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'configurator_completeness_rules',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['board_type'] }, { fields: ['active'] }],
    }
  );

  return ConfiguratorCompletenessRule;
};
