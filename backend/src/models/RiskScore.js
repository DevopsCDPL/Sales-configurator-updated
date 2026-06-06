const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RiskScore = sequelize.define('RiskScore', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    entity_type: { type: DataTypes.STRING(20), allowNull: false },
    entity_id: { type: DataTypes.UUID, allowNull: false },
    score: { type: DataTypes.INTEGER, defaultValue: 0 },
    level: { type: DataTypes.STRING(10), defaultValue: 'low' },
    factors: { type: DataTypes.JSONB, defaultValue: [] },
    last_calculated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    company_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'companies', key: 'id' } },
  }, {
    tableName: 'risk_scores',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return RiskScore;
};
