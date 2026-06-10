'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add website column if it doesn't exist
    const tableDesc = await queryInterface.describeTable('companies');
    
    if (!tableDesc.website) {
      await queryInterface.addColumn('companies', 'website', {
        type: Sequelize.STRING(255),
        allowNull: true
      });
      console.log('Added website column to companies table');
    }
    
    if (!tableDesc.tax_id) {
      await queryInterface.addColumn('companies', 'tax_id', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
      console.log('Added tax_id column to companies table');
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('companies');
    
    if (tableDesc.website) {
      await queryInterface.removeColumn('companies', 'website');
    }
    
    if (tableDesc.tax_id) {
      await queryInterface.removeColumn('companies', 'tax_id');
    }
  }
};
