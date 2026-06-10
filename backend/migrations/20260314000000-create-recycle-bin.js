'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add deleted_at and deleted_by to tables that don't have them yet
    const tablesToAddSoftDelete = ['clients', 'vendors', 'companies'];

    for (const table of tablesToAddSoftDelete) {
      // deleted_at
      const tableDesc = await queryInterface.describeTable(table).catch(() => null);
      if (tableDesc && !tableDesc.deleted_at) {
        await queryInterface.addColumn(table, 'deleted_at', {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        });
      }
      // deleted_by
      if (tableDesc && !tableDesc.deleted_by) {
        await queryInterface.addColumn(table, 'deleted_by', {
          type: Sequelize.UUID,
          allowNull: true,
          defaultValue: null,
        });
      }
    }

    // Add deleted_by to tables that already have deleted_at
    const tablesWithDeletedAt = ['users', 'projects'];
    for (const table of tablesWithDeletedAt) {
      const tableDesc = await queryInterface.describeTable(table).catch(() => null);
      if (tableDesc && !tableDesc.deleted_by) {
        await queryInterface.addColumn(table, 'deleted_by', {
          type: Sequelize.UUID,
          allowNull: true,
          defaultValue: null,
        });
      }
    }
  },

  async down(queryInterface) {
    const tablesToRemove = ['clients', 'vendors', 'companies'];
    for (const table of tablesToRemove) {
      await queryInterface.removeColumn(table, 'deleted_at').catch(() => {});
      await queryInterface.removeColumn(table, 'deleted_by').catch(() => {});
    }
    const tablesDeletedBy = ['users', 'projects'];
    for (const table of tablesDeletedBy) {
      await queryInterface.removeColumn(table, 'deleted_by').catch(() => {});
    }
  },
};
