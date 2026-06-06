'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('invoices', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' } },
      invoice_number: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      invoice_type: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'Commercial' },
      invoice_date: { type: Sequelize.DATEONLY, allowNull: false },
      customer_name: { type: Sequelize.STRING(255), allowNull: true },
      customer_address: { type: Sequelize.TEXT, allowNull: true },
      client_po_number: { type: Sequelize.STRING(100), allowNull: true },
      project_name: { type: Sequelize.STRING(255), allowNull: true },
      revision: { type: Sequelize.STRING(20), allowNull: true },
      line_items: { type: Sequelize.JSONB, allowNull: false, defaultValue: '[]' },
      tax_type: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'Exempt' },
      tax_percent: { type: Sequelize.DECIMAL(5, 2), defaultValue: 0 },
      payment_terms: { type: Sequelize.TEXT, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
      shipping_charges: { type: Sequelize.DECIMAL(12, 2), defaultValue: 0 },
      subtotal: { type: Sequelize.DECIMAL(14, 2), defaultValue: 0 },
      tax_amount: { type: Sequelize.DECIMAL(14, 2), defaultValue: 0 },
      final_total: { type: Sequelize.DECIMAL(14, 2), defaultValue: 0 },
      status: { type: Sequelize.STRING(20), defaultValue: 'Draft' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('invoices');
  },
};
