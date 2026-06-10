'use strict';

/**
 * This migration fixes the estimates unique constraint issue.
 * It ensures the wrong constraint (estimates_project_id_key) is dropped
 * and the correct composite constraint (estimates_project_id_revision_unique) exists.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Use raw SQL for more control and better error handling
    const sequelize = queryInterface.sequelize;

    // Step 1: Check and drop wrong constraint if exists
    try {
      const [constraints] = await sequelize.query(`
        SELECT conname FROM pg_constraint 
        WHERE conrelid = 'estimates'::regclass 
        AND conname = 'estimates_project_id_key'
      `);
      
      if (constraints.length > 0) {
        console.log('Dropping incorrect constraint: estimates_project_id_key');
        await sequelize.query('ALTER TABLE estimates DROP CONSTRAINT estimates_project_id_key');
      }
    } catch (error) {
      console.log('Note: estimates_project_id_key constraint not found or already dropped');
    }

    // Step 2: Check if correct constraint exists, create if not
    try {
      const [constraints] = await sequelize.query(`
        SELECT conname FROM pg_constraint 
        WHERE conrelid = 'estimates'::regclass 
        AND conname = 'estimates_project_id_revision_unique'
      `);
      
      if (constraints.length === 0) {
        console.log('Adding composite unique constraint on (project_id, revision)');
        await sequelize.query(`
          ALTER TABLE estimates 
          ADD CONSTRAINT estimates_project_id_revision_unique 
          UNIQUE (project_id, revision)
        `);
      } else {
        console.log('Composite constraint already exists');
      }
    } catch (error) {
      console.error('Error adding composite constraint:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // This is a fix migration - down just logs a message
    console.log('Fix migration - nothing to undo');
  },
};
