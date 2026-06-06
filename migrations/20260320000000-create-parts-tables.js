'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Enable uuid-ossp if not already
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    // ── parts table ──────────────────────────────────────────────
    await queryInterface.createTable('parts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true,
      },
      part_name: {
        type: Sequelize.STRING(300),
        allowNull: false,
      },
      part_number: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      material_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'materials', key: 'id' },
        onDelete: 'SET NULL',
      },
      material_grade: {
        type: Sequelize.STRING(200),
        allowNull: true,
      },
      form: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      shape: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      density: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      unit: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'Kg',
      },
      // Dimensions stored as JSONB for flexibility
      dimensions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      // Calculated fields
      volume: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      weight: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      cost_per_unit: {
        type: Sequelize.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      total_cost: {
        type: Sequelize.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      cost_type: {
        type: Sequelize.STRING(30),
        allowNull: true,
        defaultValue: 'Per Kg',
      },
      auto_calculate: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      // Vendor info
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'vendors', key: 'id' },
        onDelete: 'SET NULL',
      },
      vendor_price: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      vendor_lead_time: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      // Client info
      client_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'clients', key: 'id' },
        onDelete: 'SET NULL',
      },
      quantity: {
        type: Sequelize.FLOAT,
        allowNull: true,
        defaultValue: 1,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
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
    await queryInterface.addIndex('parts', ['company_id']);
    await queryInterface.addIndex('parts', ['material_id']);
    await queryInterface.addIndex('parts', ['vendor_id']);
    await queryInterface.addIndex('parts', ['client_id']);
    await queryInterface.addIndex('parts', ['is_active']);
    await queryInterface.addIndex('parts', ['part_number']);

    // ── part_dimensions table ───────────────────────────────────
    await queryInterface.createTable('part_dimensions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true,
      },
      part_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'parts', key: 'id' },
        onDelete: 'CASCADE',
      },
      key: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      label: {
        type: Sequelize.STRING(150),
        allowNull: true,
      },
      value: {
        type: Sequelize.FLOAT,
        allowNull: true,
      },
      unit: {
        type: Sequelize.STRING(30),
        allowNull: true,
        defaultValue: 'mm',
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
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

    await queryInterface.addIndex('part_dimensions', ['part_id']);
    await queryInterface.addIndex('part_dimensions', ['company_id']);

    // ── part_templates table ────────────────────────────────────
    await queryInterface.createTable('part_templates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        primaryKey: true,
      },
      template_name: {
        type: Sequelize.STRING(200),
        allowNull: false,
      },
      form: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      shape: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      default_dimensions: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onDelete: 'SET NULL',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
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

    await queryInterface.addIndex('part_templates', ['company_id']);
    await queryInterface.addIndex('part_templates', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('part_templates');
    await queryInterface.dropTable('part_dimensions');
    await queryInterface.dropTable('parts');
  },
};
