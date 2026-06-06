const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CustomRole = sequelize.define('CustomRole', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT },
    company_id: { type: DataTypes.UUID },
    is_system: { type: DataTypes.BOOLEAN, defaultValue: false },
    base_role: { type: DataTypes.STRING(20), defaultValue: 'user' },
    permissions: { type: DataTypes.JSONB, defaultValue: {} },
    conditions: { type: DataTypes.JSONB, defaultValue: [] },
    color: { type: DataTypes.STRING(7), defaultValue: '#6b7280' },
    icon: { type: DataTypes.STRING(50) },
    priority: { type: DataTypes.INTEGER, defaultValue: 0 },
    created_by: { type: DataTypes.UUID },
  }, {
    tableName: 'custom_roles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return CustomRole;
};
