'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. procurement_rfq - Main RFQ table
    await queryInterface.createTable('procurement_rfq', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      rfq_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      status: {
        type: Sequelize.ENUM('Draft', 'Sent', 'Quoted', 'Closed'),
        allowNull: false,
        defaultValue: 'Draft',
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'companies',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // 2. procurement_rfq_items - Materials in an RFQ
    await queryInterface.createTable('procurement_rfq_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      rfq_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'procurement_rfq',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      material_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'materials',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      quantity: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      unit: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Kg',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // 3. procurement_rfq_vendors - Vendors assigned to an RFQ
    await queryInterface.createTable('procurement_rfq_vendors', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      rfq_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'procurement_rfq',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'vendors',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('Pending', 'Responded'),
        allowNull: false,
        defaultValue: 'Pending',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // 4. procurement_vendor_quotes - Vendor quotations for materials
    await queryInterface.createTable('procurement_vendor_quotes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      rfq_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'procurement_rfq',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'vendors',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      material_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'materials',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      price_per_unit: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      lead_time: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // 5. procurement_po - Purchase Orders
    await queryInterface.createTable('procurement_po', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      po_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      rfq_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'procurement_rfq',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'vendors',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: {
        type: Sequelize.ENUM('Draft', 'Issued', 'Received'),
        allowNull: false,
        defaultValue: 'Draft',
      },
      total_value: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: true,
        defaultValue: 0,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'companies',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // 6. procurement_po_items - Items in a Purchase Order
    await queryInterface.createTable('procurement_po_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      po_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'procurement_po',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      material_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'materials',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      quantity: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      price_per_unit: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
      },
      heat_number: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      unit: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Kg',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Create indexes for better query performance
    await queryInterface.addIndex('procurement_rfq', ['status']);
    await queryInterface.addIndex('procurement_rfq', ['company_id']);
    await queryInterface.addIndex('procurement_rfq_items', ['rfq_id']);
    await queryInterface.addIndex('procurement_rfq_vendors', ['rfq_id']);
    await queryInterface.addIndex('procurement_rfq_vendors', ['vendor_id']);
    await queryInterface.addIndex('procurement_vendor_quotes', ['rfq_id']);
    await queryInterface.addIndex('procurement_vendor_quotes', ['vendor_id']);
    await queryInterface.addIndex('procurement_po', ['status']);
    await queryInterface.addIndex('procurement_po', ['vendor_id']);
    await queryInterface.addIndex('procurement_po_items', ['po_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('procurement_po_items');
    await queryInterface.dropTable('procurement_po');
    await queryInterface.dropTable('procurement_vendor_quotes');
    await queryInterface.dropTable('procurement_rfq_vendors');
    await queryInterface.dropTable('procurement_rfq_items');
    await queryInterface.dropTable('procurement_rfq');
  },
};
