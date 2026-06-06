const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    entity_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'user'
    },
    entity_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    entity_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    performed_by: {
      type: DataTypes.UUID,
      allowNull: true
    },
    performer_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    performer_role: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'companies', key: 'id' }
    }
  }, {
    tableName: 'audit_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  return AuditLog;
};
