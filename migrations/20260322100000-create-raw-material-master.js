'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ── 1. Create raw_materials table ────────────────────────────
    await queryInterface.createTable('raw_materials', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      material_category: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      material_grade: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      condition: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      density: {
        type: Sequelize.FLOAT,
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
      cost_per_unit: {
        type: Sequelize.FLOAT,
        allowNull: true,
        defaultValue: 0,
      },
      cost_unit: {
        type: Sequelize.STRING(20),
        allowNull: true,
        defaultValue: '$/lb',
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

    // Index for fast lookups
    await queryInterface.addIndex('raw_materials', ['material_category', 'material_grade', 'condition'], {
      name: 'idx_raw_materials_cat_grade_cond',
    });
    await queryInterface.addIndex('raw_materials', ['company_id'], {
      name: 'idx_raw_materials_company',
    });

    // ── 2. Add raw_material_id + condition to parts table ────────
    const partsDesc = await queryInterface.describeTable('parts');
    if (!partsDesc.raw_material_id) {
      await queryInterface.addColumn('parts', 'raw_material_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'raw_materials', key: 'id' },
        onDelete: 'SET NULL',
      });
    }
    if (!partsDesc.condition) {
      await queryInterface.addColumn('parts', 'condition', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const partsDesc = await queryInterface.describeTable('parts');
    if (partsDesc.condition) {
      await queryInterface.removeColumn('parts', 'condition');
    }
    if (partsDesc.raw_material_id) {
      await queryInterface.removeColumn('parts', 'raw_material_id');
    }
    await queryInterface.dropTable('raw_materials');
  },
};
