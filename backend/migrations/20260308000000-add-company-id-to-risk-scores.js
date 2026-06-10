'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('risk_scores').catch(() => null);
    if (!tableInfo) return; // Table doesn't exist yet

    if (!tableInfo.company_id) {
      await queryInterface.addColumn('risk_scores', 'company_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
  },

  async down(queryInterface) {
    const tableInfo = await queryInterface.describeTable('risk_scores').catch(() => null);
    if (tableInfo && tableInfo.company_id) {
      await queryInterface.removeColumn('risk_scores', 'company_id');
    }
  },
};
