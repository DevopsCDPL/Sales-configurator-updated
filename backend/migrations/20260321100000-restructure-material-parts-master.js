'use strict';

/**
 * Migration: Restructure Material Master + Parts Master
 *
 * 1. Add grade, form, shape, density, default_cost to materials table
 * 2. Create material_vendor_mappings junction table
 * 3. Parts table columns kept for backward compat but values derived from material at runtime
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    // ── 1. Add new columns to materials ────────────────────────────────
    const materialCols = await queryInterface.describeTable('materials');

    if (!materialCols.grade) {
      await queryInterface.addColumn('materials', 'grade', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }
    if (!materialCols.form) {
      await queryInterface.addColumn('materials', 'form', {
        type: Sequelize.STRING(50),
        allowNull: true,
      });
    }
    if (!materialCols.shape) {
      await queryInterface.addColumn('materials', 'shape', {
        type: Sequelize.STRING(50),
        allowNull: true,
      });
    }
    if (!materialCols.density) {
      await queryInterface.addColumn('materials', 'density', {
        type: Sequelize.FLOAT,
        allowNull: true,
      });
    }
    if (!materialCols.default_cost) {
      await queryInterface.addColumn('materials', 'default_cost', {
        type: Sequelize.FLOAT,
        allowNull: true,
        defaultValue: 0,
      });
    }

    // ── 2. Create material_vendor_mappings table ───────────────────────
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('material_vendor_mappings')) {
      await queryInterface.createTable('material_vendor_mappings', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('uuid_generate_v4()'),
          primaryKey: true,
        },
        material_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'materials', key: 'id' },
          onDelete: 'CASCADE',
        },
        vendor_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'vendors', key: 'id' },
          onDelete: 'CASCADE',
        },
        price_per_unit: {
          type: Sequelize.FLOAT,
          allowNull: true,
          defaultValue: 0,
        },
        lead_time: {
          type: Sequelize.INTEGER,
          allowNull: true,
        },
        is_default: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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

      await queryInterface.addIndex('material_vendor_mappings', ['material_id'], {
        name: 'idx_mvm_material_id',
      });
      await queryInterface.addIndex('material_vendor_mappings', ['vendor_id'], {
        name: 'idx_mvm_vendor_id',
      });
      await queryInterface.addIndex('material_vendor_mappings', ['material_id', 'vendor_id'], {
        unique: true,
        name: 'idx_mvm_material_vendor_unique',
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('material_vendor_mappings');

    const materialCols = await queryInterface.describeTable('materials');
    if (materialCols.grade) await queryInterface.removeColumn('materials', 'grade');
    if (materialCols.form) await queryInterface.removeColumn('materials', 'form');
    if (materialCols.shape) await queryInterface.removeColumn('materials', 'shape');
    if (materialCols.density) await queryInterface.removeColumn('materials', 'density');
    if (materialCols.default_cost) await queryInterface.removeColumn('materials', 'default_cost');
  },
};
