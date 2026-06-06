'use strict';

/**
 * Step 2 — File Management System
 *
 * Adds two columns to the `documents` table:
 *
 *   part_id        (UUID, nullable, FK → parts.id)
 *                  — identifies which part within a project this document belongs to.
 *                  Used to build the correct R2 path:
 *                  forge-files/{co}/{project_id}/{part_id}/{stage}/...
 *
 *   workflow_stage (VARCHAR 50, nullable)
 *                  — stores the R2 stage bucket for this document
 *                    e.g. 'estimation/drawings', 'quotation', 'quality/coc', etc.
 *                  Matches the STAGE_PATH_MAP values in unifiedFileService.js.
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('documents');

    // ── part_id ──────────────────────────────────────────────────
    if (!tableDesc.part_id) {
      await queryInterface.addColumn('documents', 'part_id', {
        type: Sequelize.UUID,
        allowNull: true,
        defaultValue: null,
        comment: 'Part UUID — identifies which part this document belongs to (for R2 path scoping)',
        references: {
          model: 'parts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
      console.log('[Migration] Added documents.part_id');
    } else {
      console.log('[Migration] documents.part_id already exists — skipping');
    }

    // ── workflow_stage ────────────────────────────────────────────
    if (!tableDesc.workflow_stage) {
      await queryInterface.addColumn('documents', 'workflow_stage', {
        type: Sequelize.STRING(100),
        allowNull: true,
        defaultValue: null,
        comment: 'R2 stage path for this document (e.g. quotation, quality/coc, logistics/tracking)',
      });
      console.log('[Migration] Added documents.workflow_stage');
    } else {
      console.log('[Migration] documents.workflow_stage already exists — skipping');
    }

    // ── Index on part_id for fast lookups ─────────────────────────
    try {
      await queryInterface.addIndex('documents', ['part_id'], {
        name: 'idx_documents_part_id',
        where: { part_id: { [Sequelize.Op.ne]: null } },
      });
      console.log('[Migration] Added index idx_documents_part_id');
    } catch (err) {
      if (err.message && err.message.includes('already exists')) {
        console.log('[Migration] Index idx_documents_part_id already exists — skipping');
      } else {
        throw err;
      }
    }

    // ── Index on workflow_stage for filtering ─────────────────────
    try {
      await queryInterface.addIndex('documents', ['workflow_stage'], {
        name: 'idx_documents_workflow_stage',
        where: { workflow_stage: { [Sequelize.Op.ne]: null } },
      });
      console.log('[Migration] Added index idx_documents_workflow_stage');
    } catch (err) {
      if (err.message && err.message.includes('already exists')) {
        console.log('[Migration] Index idx_documents_workflow_stage already exists — skipping');
      } else {
        throw err;
      }
    }
  },

  async down(queryInterface, _Sequelize) {
    // Remove indexes first, then columns
    try { await queryInterface.removeIndex('documents', 'idx_documents_workflow_stage'); } catch (_) {}
    try { await queryInterface.removeIndex('documents', 'idx_documents_part_id'); } catch (_) {}

    const tableDesc = await queryInterface.describeTable('documents');
    if (tableDesc.workflow_stage) {
      await queryInterface.removeColumn('documents', 'workflow_stage');
      console.log('[Migration] Removed documents.workflow_stage');
    }
    if (tableDesc.part_id) {
      await queryInterface.removeColumn('documents', 'part_id');
      console.log('[Migration] Removed documents.part_id');
    }
  },
};
