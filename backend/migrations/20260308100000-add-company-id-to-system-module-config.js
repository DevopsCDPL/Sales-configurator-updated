'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('system_module_config');
    if (!tableDesc.company_id) {
      await queryInterface.addColumn('system_module_config', 'company_id', {
        type: Sequelize.UUID,
        allowNull: true,
      });
      await queryInterface.addIndex('system_module_config', ['company_id'], {
        name: 'idx_system_module_config_company_id',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('system_module_config', 'company_id');
  },
};
