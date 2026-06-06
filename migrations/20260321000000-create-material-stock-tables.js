'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── material_stock ──────────────────────────────────────────────────
    await queryInterface.createTable('material_stock', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      material_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'materials', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      current_quantity: {
        type: Sequelize.DECIMAL(14, 4),
        allowNull: false,
        defaultValue: 0,
      },
      unit: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Kg',
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      last_updated: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('NOW()'),
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

    await queryInterface.addIndex('material_stock', ['material_id'], {
      unique: true,
      name: 'idx_material_stock_material_id',
    });
    await queryInterface.addIndex('material_stock', ['company_id'], {
      name: 'idx_material_stock_company_id',
    });

    // ── material_transactions ───────────────────────────────────────────
    await queryInterface.createTable('material_transactions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      material_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'materials', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      type: {
        type: Sequelize.ENUM('IN', 'OUT', 'ADJUSTMENT'),
        allowNull: false,
      },
      direction: {
        type: Sequelize.STRING(20),
        allowNull: true,
      },
      quantity: {
        type: Sequelize.DECIMAL(14, 4),
        allowNull: false,
      },
      unit: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'Kg',
      },
      heat_number: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      vendor_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'vendors', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'projects', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      reference_type: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      reference_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
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

    await queryInterface.addIndex('material_transactions', ['material_id'], {
      name: 'idx_material_tx_material_id',
    });
    await queryInterface.addIndex('material_transactions', ['type'], {
      name: 'idx_material_tx_type',
    });
    await queryInterface.addIndex('material_transactions', ['heat_number'], {
      name: 'idx_material_tx_heat_number',
    });
    await queryInterface.addIndex('material_transactions', ['company_id'], {
      name: 'idx_material_tx_company_id',
    });
    await queryInterface.addIndex('material_transactions', ['created_at'], {
      name: 'idx_material_tx_created_at',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('material_transactions');
    await queryInterface.dropTable('material_stock');
  },
};
