'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add raw_material_id column to stocks table
    await queryInterface.addColumn('stocks', 'raw_material_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'raw_materials', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    // 2. Backfill existing stock entries by matching material_grade (case-insensitive)
    // This links existing stock records to their corresponding RawMaterial entries
    await queryInterface.sequelize.query(`
      UPDATE stocks s
      SET raw_material_id = rm.id
      FROM raw_materials rm
      WHERE LOWER(TRIM(s.material_grade)) = LOWER(TRIM(rm.material_grade))
        AND s.raw_material_id IS NULL
        AND (s.company_id IS NULL OR s.company_id = rm.company_id)
    `);

    // 3. Add index for performance on the FK column
    await queryInterface.addIndex('stocks', ['raw_material_id'], {
      name: 'idx_stocks_raw_material_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('stocks', 'idx_stocks_raw_material_id');
    await queryInterface.removeColumn('stocks', 'raw_material_id');
  },
};
