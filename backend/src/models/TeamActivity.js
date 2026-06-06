const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TeamActivity = sequelize.define('TeamActivity', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    team_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'teams',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    action: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    type: {
      type: DataTypes.ENUM('member', 'permission', 'role', 'team'),
      defaultValue: 'team',
      allowNull: false
    }
  }, {
    tableName: 'team_activities',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return TeamActivity;
};
