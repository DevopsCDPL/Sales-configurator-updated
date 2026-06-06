const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Message = sequelize.define('Message', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    conversation_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'conversations', key: 'id' },
    },
    sender_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('text', 'system'),
      allowNull: false,
      defaultValue: 'text',
    },
  }, {
    tableName: 'messages',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['conversation_id', 'created_at'] },
      { fields: ['sender_id'] },
    ],
  });

  return Message;
};
