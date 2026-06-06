const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ActivityTimeline = sequelize.define('ActivityTimeline', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID },
    user_id: { type: DataTypes.UUID },
    action: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT },
    metadata: { type: DataTypes.JSONB, defaultValue: {} },
    icon: { type: DataTypes.STRING(50) },
    severity: { type: DataTypes.STRING(10), defaultValue: 'info' },
  }, {
    tableName: 'activity_timeline',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });

  return ActivityTimeline;
};
