'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create rfq_bundles table
    await queryInterface.createTable('rfq_bundles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      rfq_number: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'vendors',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      total_quantity: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      need_materials_before: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('draft', 'sent', 'quoted', 'accepted', 'rejected'),
        defaultValue: 'draft'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'companies',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    // Create rfq_bundle_items table
    await queryInterface.createTable('rfq_bundle_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      rfq_bundle_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'rfq_bundles',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      part_id: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      part_description: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      material: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      material_grade: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      quantity: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0
      },
      unit: {
        type: Sequelize.STRING(50),
        allowNull: true,
        defaultValue: 'pcs'
      },
      quoted_price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW')
      }
    });

    // Add indexes
    await queryInterface.addIndex('rfq_bundles', ['project_id']);
    await queryInterface.addIndex('rfq_bundles', ['vendor_id']);
    await queryInterface.addIndex('rfq_bundles', ['company_id']);
    await queryInterface.addIndex('rfq_bundles', ['status']);
    await queryInterface.addIndex('rfq_bundle_items', ['rfq_bundle_id']);
    await queryInterface.addIndex('rfq_bundle_items', ['part_id']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('rfq_bundle_items');
    await queryInterface.dropTable('rfq_bundles');
  }
};
