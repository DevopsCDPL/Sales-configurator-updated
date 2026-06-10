'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // ── Enhance file_manager_folders ──────────────────────────────────
    const folderCols = await queryInterface.describeTable('file_manager_folders').catch(() => null);

    if (!folderCols) {
      await queryInterface.createTable('file_manager_folders', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.literal('uuid_generate_v4()'), primaryKey: true },
        name: { type: Sequelize.STRING(100), allowNull: false },
        slug: { type: Sequelize.STRING(100), allowNull: false },
        parent_id: { type: Sequelize.UUID, allowNull: true },
        folder_type: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'category' },
        module_type: { type: Sequelize.STRING(50), allowNull: true },
        project_id: { type: Sequelize.UUID, allowNull: true },
        part_id: { type: Sequelize.UUID, allowNull: true },
        reference_id: { type: Sequelize.UUID, allowNull: true },
        company_id: { type: Sequelize.UUID, allowNull: true, references: { model: 'companies', key: 'id' } },
        path: { type: Sequelize.STRING(500), allowNull: false, unique: true },
        created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
        updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      });
    } else {
      if (!folderCols.module_type) {
        await queryInterface.addColumn('file_manager_folders', 'module_type', {
          type: Sequelize.STRING(50), allowNull: true,
        });
      }
      if (!folderCols.reference_id) {
        await queryInterface.addColumn('file_manager_folders', 'reference_id', {
          type: Sequelize.UUID, allowNull: true,
        });
      }
      if (!folderCols.company_id) {
        await queryInterface.addColumn('file_manager_folders', 'company_id', {
          type: Sequelize.UUID, allowNull: true, references: { model: 'companies', key: 'id' },
        });
      }
      // Widen folder_type from VARCHAR(20) to VARCHAR(50) if it was too narrow
      await queryInterface.changeColumn('file_manager_folders', 'folder_type', {
        type: Sequelize.STRING(50), allowNull: false, defaultValue: 'category',
      }).catch(() => {});
    }

    // ── Enhance documents table ──────────────────────────────────────
    const docCols = await queryInterface.describeTable('documents');

    if (!docCols.module_type) {
      await queryInterface.addColumn('documents', 'module_type', {
        type: Sequelize.STRING(50), allowNull: true,
      });
    }
    if (!docCols.reference_id) {
      await queryInterface.addColumn('documents', 'reference_id', {
        type: Sequelize.UUID, allowNull: true,
      });
    }
    if (!docCols.file_type) {
      await queryInterface.addColumn('documents', 'file_type', {
        type: Sequelize.STRING(20), allowNull: true, defaultValue: 'generated',
      });
    }
    if (!docCols.uploaded_by) {
      await queryInterface.addColumn('documents', 'uploaded_by', {
        type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' },
      });
    }
    if (!docCols.company_id) {
      await queryInterface.addColumn('documents', 'company_id', {
        type: Sequelize.UUID, allowNull: true, references: { model: 'companies', key: 'id' },
      });
    }

    // Convert status from ENUM to VARCHAR if needed (allows draft/approved/latest)
    try {
      await queryInterface.changeColumn('documents', 'status', {
        type: Sequelize.STRING(20), defaultValue: 'draft',
      });
    } catch (_) { /* already VARCHAR or another type — ignore */ }

    // ── Seed root folders (idempotent via path unique constraint) ──
    const rootFolders = [
      { name: 'Project Documents', slug: 'project-documents', folder_type: 'root', module_type: 'project', path: '/Project Documents' },
      { name: 'Procurement Documents', slug: 'procurement-documents', folder_type: 'root', module_type: 'procurement', path: '/Procurement Documents' },
      { name: 'Part Master', slug: 'part-master', folder_type: 'root', module_type: 'part_master', path: '/Part Master' },
      { name: 'Inventory', slug: 'inventory', folder_type: 'root', module_type: 'inventory', path: '/Inventory' },
    ];

    for (const f of rootFolders) {
      const exists = await queryInterface.sequelize.query(
        `SELECT id FROM file_manager_folders WHERE path = :path LIMIT 1`,
        { replacements: { path: f.path }, type: Sequelize.QueryTypes.SELECT }
      );
      if (exists.length === 0) {
        await queryInterface.sequelize.query(
          `INSERT INTO file_manager_folders (id, name, slug, folder_type, module_type, path, created_at, updated_at)
           VALUES (uuid_generate_v4(), :name, :slug, :folder_type, :module_type, :path, NOW(), NOW())`,
          { replacements: f }
        );
      }
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('documents', 'company_id').catch(() => {});
    await queryInterface.removeColumn('documents', 'uploaded_by').catch(() => {});
    await queryInterface.removeColumn('documents', 'file_type').catch(() => {});
    await queryInterface.removeColumn('documents', 'reference_id').catch(() => {});
    await queryInterface.removeColumn('documents', 'module_type').catch(() => {});
    await queryInterface.removeColumn('file_manager_folders', 'company_id').catch(() => {});
    await queryInterface.removeColumn('file_manager_folders', 'reference_id').catch(() => {});
    await queryInterface.removeColumn('file_manager_folders', 'module_type').catch(() => {});
  },
};
