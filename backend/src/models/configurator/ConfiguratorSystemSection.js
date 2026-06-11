'use strict';

const { DataTypes } = require('sequelize');

/**
 * ConfiguratorSystemSection
 *
 * Per-configuration breakdown of system sections (Section 1, Section 2 …).
 * Each section carries its own `SectionDefinition` JSON (electrical
 * protection, layout hardware, etc.) as defined by the configurator
 * `SystemDesignPanel`.
 *
 * Unique on (configuration_id, section_number).
 */
module.exports = (sequelize) => {
  const ConfiguratorSystemSection = sequelize.define(
    'ConfiguratorSystemSection',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      configuration_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'configurator_configurations', key: 'id' },
        onDelete: 'CASCADE',
      },
      section_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      /** V2 spine: section belongs to a switchboard (nullable for legacy rows) */
      switchboard_id: { type: DataTypes.UUID, allowNull: true },
      setup: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      electrical: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      layout: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      computed: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      name: { type: DataTypes.STRING(120), allowNull: true },
      definition: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
      },
    },
    {
      tableName: 'configurator_system_sections',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return ConfiguratorSystemSection;
};
