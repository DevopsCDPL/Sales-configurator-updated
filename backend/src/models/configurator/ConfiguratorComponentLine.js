'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorComponentLine — Phase A spec §4.1
 *
 * Replaces the global per-step `stepLines` buckets and per-section
 * breaker arrays with a single scope-tagged line schema. Every line is
 * traceable to the board or a specific section — the prerequisite for
 * per-section BOM, SolidWorks payloads and copper estimation.
 */
module.exports = (sequelize) => {
  const ConfiguratorComponentLine = sequelize.define(
    'ConfiguratorComponentLine',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      switchboard_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_switchboards', key: 'id' },
        onDelete: 'CASCADE',
      },
      scope: {
        type: DataTypes.STRING(8),
        allowNull: false,
        defaultValue: 'board',
        validate: { isIn: [['board', 'section']] },
      },
      section_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: 'Required when scope = section',
      },
      component_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'configurator_components', key: 'id' },
        onDelete: 'SET NULL',
        comment: 'NULL = ad-hoc / manual line',
      },
      category: { type: DataTypes.STRING(120), allowNull: true },
      part_number: { type: DataTypes.STRING(160), allowNull: true },
      name: { type: DataTypes.STRING(255), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },
      quantity: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
      unit: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'ea' },
      unit_cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true, defaultValue: 0 },
      price_status: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'FIRM',
        validate: { isIn: [['FIRM', 'ESTIMATED', 'PENDING_RFQ']] },
      },
      /** {cu, asm, cnt, qc, tst, eng, cad} hour snapshot */
      labor_hours: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      source: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'user',
        validate: { isIn: [['user', 'auto', 'builder', 'standard', 'generator']] },
      },
      /** Part-number-builder decoder positions for generated catalog numbers */
      builder_payload: { type: DataTypes.JSONB, allowNull: true },
      meta: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'configurator_component_lines',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['switchboard_id'] },
        { fields: ['switchboard_id', 'scope', 'section_id'] },
        { fields: ['category'] },
        { fields: ['price_status'] },
      ],
      validate: {
        sectionScopeNeedsSection() {
          if (this.scope === 'section' && !this.section_id) {
            throw new Error('component line with scope=section requires section_id');
          }
        },
      },
    }
  );

  ConfiguratorComponentLine.associate = (models) => {
    if (models.ConfiguratorSwitchboard) {
      ConfiguratorComponentLine.belongsTo(models.ConfiguratorSwitchboard, {
        foreignKey: 'switchboard_id',
        as: 'switchboard',
      });
    }
    if (models.ConfiguratorComponent) {
      ConfiguratorComponentLine.belongsTo(models.ConfiguratorComponent, {
        foreignKey: 'component_id',
        as: 'component',
      });
    }
  };

  return ConfiguratorComponentLine;
};
