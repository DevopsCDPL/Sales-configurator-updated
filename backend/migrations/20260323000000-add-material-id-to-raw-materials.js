'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add material_id column to raw_materials table
    await queryInterface.addColumn('raw_materials', 'material_id', {
      type: Sequelize.STRING(20),
      allowNull: true,
      unique: true,
      comment: 'Unique material ID (MAT-00001 format)',
    });

    // Create index for material_id
    await queryInterface.addIndex('raw_materials', ['material_id'], {
      name: 'raw_materials_material_id_idx',
      unique: true,
    });

    // Populate existing records with material_id
    const [results] = await queryInterface.sequelize.query(
      `SELECT id, company_id FROM raw_materials ORDER BY created_at ASC`
    );

    // Group by company_id and assign material_id
    const companyCounters = {};
    for (const record of results) {
      const companyId = record.company_id || 'default';
      if (!companyCounters[companyId]) {
        companyCounters[companyId] = 1;
      }
      const materialId = `MAT-${String(companyCounters[companyId]).padStart(5, '0')}`;
      await queryInterface.sequelize.query(
        `UPDATE raw_materials SET material_id = ? WHERE id = ?`,
        { replacements: [materialId, record.id] }
      );
      companyCounters[companyId]++;
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex('raw_materials', 'raw_materials_material_id_idx');
    await queryInterface.removeColumn('raw_materials', 'material_id');
  },
};
