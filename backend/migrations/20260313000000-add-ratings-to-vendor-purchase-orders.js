'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('vendor_purchase_orders', 'ratings', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: 'Per-order vendor ratings: { price: 0-5, delivery: 0-5, quality: 0-5 }',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('vendor_purchase_orders', 'ratings');
  },
};
