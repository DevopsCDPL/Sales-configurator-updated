const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PartTemplate = sequelize.define('PartTemplate', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    template_name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    form: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    shape: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    default_dimensions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'companies', key: 'id' },
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  }, {
    tableName: 'part_templates',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return PartTemplate;
};
