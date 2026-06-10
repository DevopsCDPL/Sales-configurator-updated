'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create file_manager_folders table
    await queryInterface.createTable('file_manager_folders', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Display name (e.g. "Quotation", "RFQ")',
      },
      slug: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Disk-safe folder name (e.g. "Quotation", "RFQ")',
      },
      parent_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'file_manager_folders', key: 'id' },
        onDelete: 'CASCADE',
      },
      folder_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'category',
        comment: 'root | project | category | part_drawing',
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'projects', key: 'id' },
        onDelete: 'CASCADE',
      },
      part_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'parts', key: 'id' },
        onDelete: 'SET NULL',
      },
      path: {
        type: Sequelize.STRING(500),
        allowNull: false,
        comment: 'Full relative path from documents root',
      },
      created_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    // Add indexes
    await queryInterface.addIndex('file_manager_folders', ['parent_id']);
    await queryInterface.addIndex('file_manager_folders', ['project_id']);
    await queryInterface.addIndex('file_manager_folders', ['part_id']);
    await queryInterface.addIndex('file_manager_folders', ['folder_type']);
    await queryInterface.addIndex('file_manager_folders', ['path'], { unique: true });

    // Add folder_id column to documents table
    await queryInterface.addColumn('documents', 'folder_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'file_manager_folders', key: 'id' },
      onDelete: 'SET NULL',
    });

    await queryInterface.addIndex('documents', ['folder_id']);

    // Make project_id nullable on documents (for procurement/global docs without a project)
    await queryInterface.changeColumn('documents', 'project_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'projects', key: 'id' },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('documents', 'folder_id');
    await queryInterface.changeColumn('documents', 'project_id', {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: 'projects', key: 'id' },
    });
    await queryInterface.dropTable('file_manager_folders');
  },
};
