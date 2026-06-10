'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── 1. mgmt_procurement_rfqs ─────────────────────────────────────────
    await queryInterface.createTable('mgmt_procurement_rfqs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true,
      },
      rfq_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_DATE'),
      },
      need_materials_before: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      instructions: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('Draft', 'Sent'),
        defaultValue: 'Draft',
      },
      /* ── Part snapshot fields (frozen at selection time) ── */
      part_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Reference to original part (for traceability only)',
      },
      part_name: { type: Sequelize.STRING(300), allowNull: true },
      material_category: { type: Sequelize.STRING(50), allowNull: true },
      material_grade: { type: Sequelize.STRING(200), allowNull: true },
      density: { type: Sequelize.FLOAT, allowNull: true },
      form: { type: Sequelize.STRING(50), allowNull: true },
      shape: { type: Sequelize.STRING(50), allowNull: true },
      dimensions: { type: Sequelize.JSONB, allowNull: true, defaultValue: {} },
      weight_per_piece: { type: Sequelize.FLOAT, allowNull: true },
      quantity: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 1,
      },
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vendors', key: 'id' },
      },
      parent_rfq_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Links split RFQs back to the original drafted RFQ',
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
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('mgmt_procurement_rfqs', ['status']);
    await queryInterface.addIndex('mgmt_procurement_rfqs', ['company_id']);
    await queryInterface.addIndex('mgmt_procurement_rfqs', ['vendor_id']);

    // ── 2. mgmt_procurement_pos ──────────────────────────────────────────
    await queryInterface.createTable('mgmt_procurement_pos', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true,
      },
      po_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        // Per-company uniqueness enforced by partial composite index in
        // backend/src/index.js pre-sync (excludes soft-deleted rows).
      },
      rfq_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'mgmt_procurement_rfqs', key: 'id' },
      },
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vendors', key: 'id' },
      },
      po_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_DATE'),
      },
      tax_type: {
        type: Sequelize.ENUM('Exempt', '5%', '12%', '18%'),
        defaultValue: 'Exempt',
      },
      /* ── Snapshot from RFQ (copied at PO creation) ── */
      part_name: { type: Sequelize.STRING(300), allowNull: true },
      material_category: { type: Sequelize.STRING(50), allowNull: true },
      material_grade: { type: Sequelize.STRING(200), allowNull: true },
      quantity: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      weight_per_piece: { type: Sequelize.FLOAT, allowNull: true },
      total_weight: { type: Sequelize.FLOAT, allowNull: true },

      subtotal: { type: Sequelize.DECIMAL(14, 2), allowNull: true, defaultValue: 0 },
      tax_amount: { type: Sequelize.DECIMAL(14, 2), allowNull: true, defaultValue: 0 },
      grand_total: { type: Sequelize.DECIMAL(14, 2), allowNull: true, defaultValue: 0 },

      status: {
        type: Sequelize.ENUM('Draft', 'Sent', 'Ordered', 'Received'),
        defaultValue: 'Draft',
      },
      notes: { type: Sequelize.TEXT, allowNull: true },
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
        defaultValue: Sequelize.literal('NOW()'),
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()'),
      },
    });

    await queryInterface.addIndex('mgmt_procurement_pos', ['rfq_id']);
    await queryInterface.addIndex('mgmt_procurement_pos', ['vendor_id']);
    await queryInterface.addIndex('mgmt_procurement_pos', ['status']);
    await queryInterface.addIndex('mgmt_procurement_pos', ['company_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mgmt_procurement_pos');
    await queryInterface.dropTable('mgmt_procurement_rfqs');
  },
};
