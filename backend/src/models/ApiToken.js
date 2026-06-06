const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ApiToken = sequelize.define('ApiToken', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    token_prefix: { type: DataTypes.STRING(8) },
    user_id: { type: DataTypes.UUID, allowNull: false },
    company_id: { type: DataTypes.UUID },
    scopes: { type: DataTypes.JSONB, defaultValue: ['read'] },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    last_used_at: { type: DataTypes.DATE },
    expires_at: { type: DataTypes.DATE },
  }, {
    tableName: 'api_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return ApiToken;
};
