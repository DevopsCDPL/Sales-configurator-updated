'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create event_type enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_calendar_events_event_type" AS ENUM ('meeting', 'deadline', 'task');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Create reminder enum
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_calendar_events_reminder" AS ENUM ('none', '15min', '1hour', '1day');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryInterface.createTable('calendar_events', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'companies', key: 'id' },
        onDelete: 'CASCADE',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
      },
      event_type: {
        type: Sequelize.ENUM('meeting', 'deadline', 'task'),
        allowNull: false,
        defaultValue: 'task',
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'SET NULL',
      },
      project_module: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      event_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      start_time: {
        type: Sequelize.TIME,
        allowNull: true,
      },
      end_time: {
        type: Sequelize.TIME,
        allowNull: true,
      },
      all_day: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      assigned_users: {
        type: Sequelize.JSONB,
        defaultValue: [],
      },
      reminder: {
        type: Sequelize.ENUM('none', '15min', '1hour', '1day'),
        defaultValue: 'none',
      },
      is_overdue: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      completed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Indexes for fast queries
    await queryInterface.addIndex('calendar_events', ['company_id']);
    await queryInterface.addIndex('calendar_events', ['event_date']);
    await queryInterface.addIndex('calendar_events', ['project_id']);
    await queryInterface.addIndex('calendar_events', ['created_by']);
    await queryInterface.addIndex('calendar_events', ['event_type']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('calendar_events');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_calendar_events_event_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_calendar_events_reminder";');
  },
};
