'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('system_module_config', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      tenant_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      section_name: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      module_key: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      module_label: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      numbering_prefix: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      numbering_start: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      numbering_increment: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      numbering_suffix: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
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

    // Insert exactly 3 seed rows
    await queryInterface.bulkInsert('system_module_config', [
      {
        section_name: 'work_order',
        module_key: 'machining_industry',
        module_label: 'Machining Industry',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        section_name: 'production_traveler',
        module_key: 'machining_industry',
        module_label: 'Machining Industry',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        section_name: 'quality',
        module_key: 'machining_industry',
        module_label: 'Machining Industry',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('system_module_config');
  },
};
