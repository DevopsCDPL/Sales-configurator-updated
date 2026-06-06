const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CalendarEvent = sequelize.define('CalendarEvent', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: false },
    created_by: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT },
    event_type: {
      type: DataTypes.ENUM('meeting', 'deadline', 'task'),
      allowNull: false,
      defaultValue: 'task',
    },
    project_id: { type: DataTypes.UUID, allowNull: true },
    project_module: { type: DataTypes.STRING(50), allowNull: true }, // estimation, quotation, production, etc.
    event_date: { type: DataTypes.DATEONLY, allowNull: false },
    start_time: { type: DataTypes.TIME, allowNull: true },
    end_time: { type: DataTypes.TIME, allowNull: true },
    all_day: { type: DataTypes.BOOLEAN, defaultValue: true },
    assigned_users: { type: DataTypes.JSONB, defaultValue: [] }, // array of user IDs
    reminder: {
      type: DataTypes.ENUM('none', '15min', '1hour', '1day'),
      defaultValue: 'none',
    },
    is_overdue: { type: DataTypes.BOOLEAN, defaultValue: false },
    completed: { type: DataTypes.BOOLEAN, defaultValue: false },
    metadata: { type: DataTypes.JSONB, defaultValue: {} },
  }, {
    tableName: 'calendar_events',
    timestamps: true,
    underscored: true,
  });

  return CalendarEvent;
};
