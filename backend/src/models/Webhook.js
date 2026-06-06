const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Webhook = sequelize.define('Webhook', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    url: { type: DataTypes.STRING(500), allowNull: false },
    secret: { type: DataTypes.STRING(64) },
    events: { type: DataTypes.JSONB, defaultValue: [] },
    company_id: { type: DataTypes.UUID },
    created_by: { type: DataTypes.UUID },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    last_triggered_at: { type: DataTypes.DATE },
    failure_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, {
    tableName: 'webhooks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return Webhook;
};
