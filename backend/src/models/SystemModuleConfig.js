const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SystemModuleConfig = sequelize.define('SystemModuleConfig', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    tenant_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    section_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    module_key: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    module_label: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    numbering_prefix: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    numbering_start: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    numbering_increment: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    numbering_suffix: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  }, {
    tableName: 'system_module_config',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return SystemModuleConfig;
};
