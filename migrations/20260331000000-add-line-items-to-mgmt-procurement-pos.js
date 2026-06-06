'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('mgmt_procurement_pos', 'line_items', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Array of per-line item cost data: {part_id, part_name, material_category, material_grade, quantity, weight, unit_cost, cost_per_weight, weight_unit, line_total}',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('mgmt_procurement_pos', 'line_items');
  },
};
