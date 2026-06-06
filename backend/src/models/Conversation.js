const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Conversation = sequelize.define('Conversation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM('direct', 'group'),
      allowNull: false,
      defaultValue: 'direct',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true, // null for direct, required for group
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    last_message_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    last_message_preview: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    company_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'companies', key: 'id' }
    },
  }, {
    tableName: 'conversations',
    timestamps: true,
    underscored: true,
  });

  return Conversation;
};
