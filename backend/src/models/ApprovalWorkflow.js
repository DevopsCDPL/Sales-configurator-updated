const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ApprovalWorkflow = sequelize.define('ApprovalWorkflow', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    type: { type: DataTypes.STRING(50), allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING(20), defaultValue: 'pending' },
    priority: { type: DataTypes.STRING(10), defaultValue: 'normal' },
    entity_type: { type: DataTypes.STRING(50) },
    entity_id: { type: DataTypes.UUID },
    company_id: { type: DataTypes.UUID, allowNull: false, references: { model: 'companies', key: 'id' } },
    requested_by: { type: DataTypes.UUID, allowNull: false },
    request_data: { type: DataTypes.JSONB, defaultValue: {} },
    approval_chain: { type: DataTypes.JSONB, defaultValue: [] },
    current_level: { type: DataTypes.INTEGER, defaultValue: 1 },
    decided_by: { type: DataTypes.UUID },
    decided_at: { type: DataTypes.DATE },
    decision_comment: { type: DataTypes.TEXT },
    expires_at: { type: DataTypes.DATE },
  }, {
    tableName: 'approval_workflows',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  });

  return ApprovalWorkflow;
};
