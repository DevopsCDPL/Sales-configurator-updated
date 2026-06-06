const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ConversationParticipant = sequelize.define('ConversationParticipant', {
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
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    role: {
      type: DataTypes.ENUM('member', 'admin'),
      allowNull: false,
      defaultValue: 'member',
    },
    last_read_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'conversation_participants',
    timestamps: true,
    underscored: true,
    indexes: [
      { unique: true, fields: ['conversation_id', 'user_id'] },
    ],
  });

  return ConversationParticipant;
};
