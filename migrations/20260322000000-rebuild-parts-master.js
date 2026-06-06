'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ─── 1. Add new columns to parts table ─────────────────────────────────
    const partsTableDesc = await queryInterface.describeTable('parts').catch(() => null);
    if (!partsTableDesc) {
      // Create parts table from scratch if it doesn't exist
      await queryInterface.createTable('parts', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.literal('gen_random_uuid()'),
          primaryKey: true,
        },
        part_id_seq: {
          type: Sequelize.STRING(20),
          allowNull: true,
          unique: true,
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
        material_category: {
          type: Sequelize.STRING(50),
          allowNull: true,
        },
        material_grade: {
          type: Sequelize.STRING(200),
          allowNull: true,
        },
        density: {
          type: Sequelize.FLOAT,
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
        dimensions: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: {},
        },
        volume: {
          type: Sequelize.FLOAT,
          allowNull: true,
        },
        weight_per_piece: {
          type: Sequelize.FLOAT,
          allowNull: true,
        },
        total_weight: {
          type: Sequelize.FLOAT,
          allowNull: true,
        },
        weight_unit: {
          type: Sequelize.STRING(10),
          allowNull: true,
          defaultValue: 'Kg',
        },
        quantity: {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: 1,
        },
        cost_type: {
          type: Sequelize.STRING(30),
          allowNull: true,
          defaultValue: 'Per Kg',
        },
        cost_rate: {
          type: Sequelize.FLOAT,
          allowNull: true,
          defaultValue: 0,
        },
        cost_per_piece: {
          type: Sequelize.FLOAT,
          allowNull: true,
          defaultValue: 0,
        },
        total_cost: {
          type: Sequelize.FLOAT,
          allowNull: true,
          defaultValue: 0,
        },
        vendor_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'vendors', key: 'id' },
        },
        client_id: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'clients', key: 'id' },
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
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()'),
        },
      });
    } else {
      // Table exists — add missing columns
      const addCol = async (col, def) => {
        if (!partsTableDesc[col]) {
          await queryInterface.addColumn('parts', col, def);
        }
      };

      await addCol('part_id_seq', {
        type: Sequelize.STRING(20),
        allowNull: true,
        unique: true,
      });
      await addCol('material_category', {
        type: Sequelize.STRING(50),
        allowNull: true,
      });
      await addCol('weight_per_piece', {
        type: Sequelize.FLOAT,
        allowNull: true,
      });
      await addCol('total_weight', {
        type: Sequelize.FLOAT,
        allowNull: true,
      });
      await addCol('weight_unit', {
        type: Sequelize.STRING(10),
        allowNull: true,
        defaultValue: 'Kg',
      });
      await addCol('cost_rate', {
        type: Sequelize.FLOAT,
        allowNull: true,
        defaultValue: 0,
      });
      await addCol('cost_per_piece', {
        type: Sequelize.FLOAT,
        allowNull: true,
        defaultValue: 0,
      });

      // Change quantity to INTEGER if not already
      // Drop old columns that are no longer needed (material_id FK, etc.)
      // We keep material_grade, form, shape, density, dimensions, volume as they still apply
    }

    // ─── 2. Create sequence for Part ID auto-generation ─────────────────────
    await queryInterface.sequelize.query(`
      CREATE SEQUENCE IF NOT EXISTS parts_id_seq START WITH 1 INCREMENT BY 1;
    `);

    // ─── 3. Populate part_id_seq for existing rows ──────────────────────────
    await queryInterface.sequelize.query(`
      UPDATE parts
      SET part_id_seq = 'PRT01-' || LPAD(nextval('parts_id_seq')::text, 5, '0')
      WHERE part_id_seq IS NULL;
    `);
  },

  async down(queryInterface, Sequelize) {
    const partsTableDesc = await queryInterface.describeTable('parts').catch(() => null);
    if (partsTableDesc) {
      const dropCol = async (col) => {
        if (partsTableDesc[col]) {
          await queryInterface.removeColumn('parts', col);
        }
      };
      await dropCol('part_id_seq');
      await dropCol('material_category');
      await dropCol('weight_per_piece');
      await dropCol('total_weight');
      await dropCol('weight_unit');
      await dropCol('cost_rate');
      await dropCol('cost_per_piece');
    }
    await queryInterface.sequelize.query('DROP SEQUENCE IF EXISTS parts_id_seq;');
  },
};
