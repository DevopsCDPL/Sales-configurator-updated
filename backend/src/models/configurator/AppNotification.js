'use strict';

const { DataTypes } = require('sequelize');

/**
 * AppNotification — in-app bell notification (channel-agnostic; v1 = in-app
 * only, email/SMS parked). Event catalog: Phase F §7 / design §3.2.
 * Design: docs/capacity-traveler-design.md §3. INERT until routes mount.
 */
module.exports = (sequelize) => {
  const AppNotification = sequelize.define(
    'AppNotification',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      type: { type: DataTypes.STRING(60), allowNull: false },
      title: { type: DataTypes.STRING(255), allowNull: true },
      body: { type: DataTypes.TEXT, allowNull: true },
      read_at: { type: DataTypes.DATE, allowNull: true },
      entity: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
    },
    {
      tableName: 'app_notifications',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['user_id', 'read_at'] }],
    }
  );

  AppNotification.associate = (models) => {
    if (models.User) {
      AppNotification.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  };

  return AppNotification;
};
