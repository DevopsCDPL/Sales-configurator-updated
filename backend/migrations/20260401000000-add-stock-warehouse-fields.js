'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add stock_id column
    await queryInterface.addColumn('stocks', 'stock_id', {
      type: Sequelize.STRING(50),
      allowNull: true,
      unique: true,
    });

    // Add heat_number column
    await queryInterface.addColumn('stocks', 'heat_number', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    // Add condition column
    await queryInterface.addColumn('stocks', 'condition', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    // Add shape column
    await queryInterface.addColumn('stocks', 'shape', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    // Index on stock_id for quick lookup
    await queryInterface.addIndex('stocks', ['stock_id'], {
      unique: true,
      name: 'idx_stocks_stock_id',
      where: { stock_id: { [Sequelize.Op.ne]: null } },
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('stocks', 'idx_stocks_stock_id');
    await queryInterface.removeColumn('stocks', 'shape');
    await queryInterface.removeColumn('stocks', 'condition');
    await queryInterface.removeColumn('stocks', 'heat_number');
    await queryInterface.removeColumn('stocks', 'stock_id');
  },
};
