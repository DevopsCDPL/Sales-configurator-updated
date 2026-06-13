const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM(
        // Existing roles - KEPT unchanged for backward compatibility.
        'platform_admin', 'main_admin', 'admin', 'user', 'sales_engineer',
        // Department roles (additive; see 20260613000001-department-roles migration).
        'manufacturing', 'procurement', 'assembly', 'outsourcing',
        'quality', 'packing', 'logistics', 'commissioning'
      ),
      allowNull: false,
      defaultValue: 'user'
    },
    company_name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'companies',
        key: 'id'
      }
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    position: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    modules: {
      type: DataTypes.JSON,
      defaultValue: ['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings']
    },
    module_permissions: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false
    },
    last_login: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    },
    department: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    tags: {
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: false
    },
    last_login_ip: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    last_login_device: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    failed_login_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    locked_until: {
      type: DataTypes.DATE,
      allowNull: true
    },
    two_factor_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    otp_code: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    otp_expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    otp_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    force_password_reset: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    invited_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    invite_status: {
      type: DataTypes.ENUM('pending', 'accepted', 'expired'),
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
    },
    custom_role_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'custom_roles',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    avatar: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null
    },
    gender: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: null
    },
    user_id: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true
    },
    reset_token: {
      type: DataTypes.STRING(128),
      allowNull: true,
      defaultValue: null
    },
    reset_token_expiry: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    }
  }, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return User;
};
