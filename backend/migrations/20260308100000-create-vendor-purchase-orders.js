'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ------ vendor_purchase_orders (PO header) ------------------------------------------------------------------
    await queryInterface.createTable('vendor_purchase_orders', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      po_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      rfq_bundle_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'rfq_bundles', key: 'id' },
        onDelete: 'SET NULL',
        comment: 'Linked approved RFQ bundle',
      },
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vendors', key: 'id' },
        onDelete: 'RESTRICT',
      },
      po_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_DATE'),
      },
      tax_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'exempt',
        comment: 'exempt | 18% | 10%',
      },
      subtotal: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      tax_amount: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      grand_total: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      quotation_file: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Uploaded vendor quotation file path',
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('draft', 'sent', 'acknowledged', 'delivered', 'cancelled'),
        defaultValue: 'draft',
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
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

    // ------ vendor_po_items (PO line items) ---------------------------------------------------------------------------
    await queryInterface.createTable('vendor_po_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      vendor_po_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vendor_purchase_orders', key: 'id' },
        onDelete: 'CASCADE',
      },
      part_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Ref to estimation custom part id',
      },
      part_description: {
        type: Sequelize.STRING(500),
        allowNull: false,
      },
      quantity: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      unit_cost: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      line_total: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'quantity * unit_cost',
      },
      selected: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
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

    // Indexes
    await queryInterface.addIndex('vendor_purchase_orders', ['project_id']);
    await queryInterface.addIndex('vendor_purchase_orders', ['rfq_bundle_id']);
    await queryInterface.addIndex('vendor_purchase_orders', ['vendor_id']);
    await queryInterface.addIndex('vendor_purchase_orders', ['company_id']);
    await queryInterface.addIndex('vendor_po_items', ['vendor_po_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('vendor_po_items');
    await queryInterface.dropTable('vendor_purchase_orders');
  },
};
