'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('project_analytics', 'raw_material_used', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });
    await queryInterface.addColumn('project_analytics', 'purchased_dimension', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });
    await queryInterface.addColumn('project_analytics', 'dimension_after_usage', {
      type: Sequelize.STRING(200),
      allowNull: true,
    });
    await queryInterface.addColumn('project_analytics', 'qty_available', {
      type: Sequelize.FLOAT,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('project_analytics', 'qty_available');
    await queryInterface.removeColumn('project_analytics', 'dimension_after_usage');
    await queryInterface.removeColumn('project_analytics', 'purchased_dimension');
    await queryInterface.removeColumn('project_analytics', 'raw_material_used');
  },
};
