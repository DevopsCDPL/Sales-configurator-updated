const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const OtpToken = sequelize.define('OtpToken', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    requester_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    target_email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    otp_code: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    target_role: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    purpose: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'super_admin_creation',
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    is_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }, {
    tableName: 'otp_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['requester_email', 'target_email'],
      },
      {
        fields: ['expires_at'],
      },
    ],
  });

  return OtpToken;
};
