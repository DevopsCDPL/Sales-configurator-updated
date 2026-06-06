'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('stocks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      part_description: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },
      material_grade: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      dimension: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      quantity: {
        type: Sequelize.FLOAT,
        allowNull: false,
        defaultValue: 0,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'companies',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    // Indexes for fast lookups
    await queryInterface.addIndex('stocks', ['company_id']);
    await queryInterface.addIndex('stocks', ['part_description', 'material_grade']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('stocks');
  },
};
