'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add new fields for Parts Master as per spec
    await queryInterface.addColumn('parts', 'revision', {
      type: Sequelize.STRING(10),
      allowNull: true,
      defaultValue: 'R0',
      comment: 'Part revision (R0-R8)',
    });

    await queryInterface.addColumn('parts', 'drawing_given_by_client', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      defaultValue: false,
      comment: 'Whether drawing was provided by client',
    });

    await queryInterface.addColumn('parts', 'drawing_url', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: 'URL/path to uploaded drawing PDF',
    });

    // Ensure parts_id_seq sequence exists with proper format
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'parts_id_seq') THEN
          CREATE SEQUENCE parts_id_seq START WITH 1 INCREMENT BY 1;
        END IF;
      END $$;
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('parts', 'revision');
    await queryInterface.removeColumn('parts', 'drawing_given_by_client');
    await queryInterface.removeColumn('parts', 'drawing_url');
  }
};
