'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Add revision column (default 0 for existing rows)
    await queryInterface.addColumn('estimates', 'revision', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    // 2. Add is_locked column
    await queryInterface.addColumn('estimates', 'is_locked', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    // 3. Remove the old unique constraint on project_id (if it exists)
    //    Sequelize names may vary so try both common patterns
    try {
      await queryInterface.removeConstraint('estimates', 'estimates_project_id_key');
    } catch (_) {
      try {
        await queryInterface.removeIndex('estimates', 'estimates_project_id');
      } catch (_2) { /* constraint may not exist */ }
    }

    // 4. Add composite unique constraint (project_id + revision)
    await queryInterface.addConstraint('estimates', {
      fields: ['project_id', 'revision'],
      type: 'unique',
      name: 'estimates_project_id_revision_unique',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint('estimates', 'estimates_project_id_revision_unique');
    await queryInterface.removeColumn('estimates', 'is_locked');
    await queryInterface.removeColumn('estimates', 'revision');

    // Re-add the original unique constraint on project_id
    await queryInterface.addConstraint('estimates', {
      fields: ['project_id'],
      type: 'unique',
      name: 'estimates_project_id_key',
    });
  },
};
