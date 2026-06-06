const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Company = sequelize.define('Company', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    tax_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    company_code: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true
    },
    logo_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    logo_data: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    subscription_start_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    subscription_end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    subscription_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active'
    },
    user_limit: {
      type: DataTypes.INTEGER,
      defaultValue: 50,
      allowNull: false
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    plan: {
      type: DataTypes.ENUM('free', 'starter', 'premium', 'professional', 'enterprise'),
      defaultValue: 'starter',
      allowNull: false
    },
    suspended_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    suspension_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    risk_flags: {
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: false
    },
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false
    },
    ip_whitelist: {
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: false
    },
    storage_used_mb: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    last_activity_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    deleted_by: {
      type: DataTypes.UUID,
      allowNull: true,
      defaultValue: null
    }
  }, {
    tableName: 'companies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Company;
};
