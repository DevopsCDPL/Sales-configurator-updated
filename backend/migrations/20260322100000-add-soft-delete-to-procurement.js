'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add deleted_at and deleted_by to mgmt_procurement_rfqs
    await queryInterface.addColumn('mgmt_procurement_rfqs', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('mgmt_procurement_rfqs', 'deleted_by', {
      type: Sequelize.UUID,
      allowNull: true,
      defaultValue: null,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // Add deleted_at and deleted_by to mgmt_procurement_pos
    await queryInterface.addColumn('mgmt_procurement_pos', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn('mgmt_procurement_pos', 'deleted_by', {
      type: Sequelize.UUID,
      allowNull: true,
      defaultValue: null,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('mgmt_procurement_rfqs', 'deleted_at');
    await queryInterface.removeColumn('mgmt_procurement_rfqs', 'deleted_by');
    await queryInterface.removeColumn('mgmt_procurement_pos', 'deleted_at');
    await queryInterface.removeColumn('mgmt_procurement_pos', 'deleted_by');
  },
};
