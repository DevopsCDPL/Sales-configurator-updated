'use strict';

/**
 * Adds database-level DEFAULT NOW() to settings.created_at and settings.updated_at.
 * The Sequelize model already has defaultValue: DataTypes.NOW, but that is a JS-side
 * default that does not apply when raw SQL inserts skip these columns.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE settings ALTER COLUMN created_at SET DEFAULT NOW()`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE settings ALTER COLUMN updated_at SET DEFAULT NOW()`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE settings ALTER COLUMN created_at DROP DEFAULT`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE settings ALTER COLUMN updated_at DROP DEFAULT`
    );
  },
};
