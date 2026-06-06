'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Remove old material_id column and add new columns for direct material info
    const tableInfo = await queryInterface.describeTable('vendor_materials').catch(() => null);

    if (!tableInfo) {
      // Table doesn't exist, create it fresh
      await queryInterface.createTable('vendor_materials', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        vendor_id: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'vendors', key: 'id' },
          onDelete: 'CASCADE',
        },
        part_description: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        material_grade: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        dimension: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW'),
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.fn('NOW'),
        },
      });
    } else {
      // Table exists --- restructure it
      // Remove material_id if it exists
      if (tableInfo.material_id) {
        await queryInterface.removeColumn('vendor_materials', 'material_id');
      }

      // Add new columns if they don't exist
      if (!tableInfo.part_description) {
        await queryInterface.addColumn('vendor_materials', 'part_description', {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: '',
        });
      }
      if (!tableInfo.material_grade) {
        await queryInterface.addColumn('vendor_materials', 'material_grade', {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: '',
        });
      }
      if (!tableInfo.dimension) {
        await queryInterface.addColumn('vendor_materials', 'dimension', {
          type: Sequelize.STRING,
          allowNull: false,
          defaultValue: '',
        });
      }

      // Add CASCADE on delete for vendor_id if not already set
      // (handled by model definition going forward)
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('vendor_materials').catch(() => null);
    if (!tableInfo) return;

    // Remove new columns
    if (tableInfo.part_description) {
      await queryInterface.removeColumn('vendor_materials', 'part_description');
    }
    if (tableInfo.material_grade) {
      await queryInterface.removeColumn('vendor_materials', 'material_grade');
    }
    if (tableInfo.dimension) {
      await queryInterface.removeColumn('vendor_materials', 'dimension');
    }

    // Re-add material_id
    if (!tableInfo.material_id) {
      await queryInterface.addColumn('vendor_materials', 'material_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'materials', key: 'id' },
      });
    }
  },
};
