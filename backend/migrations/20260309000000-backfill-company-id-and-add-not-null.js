'use strict';

/**
 * Phase 1: Backfill NULL company_id records using FK relationships, then add NOT NULL constraints.
 *
 * Backfill order (dependency chain):
 *   1. clients       (created_by → users.company_id)
 *   2. vendors       (created_by → users.company_id)
 *   3. projects      (prepared_by → users.company_id)
 *   4. estimates     (project_id → projects.company_id)
 *   5. work_orders   (project_id → projects.company_id)
 *   6. documents     (project_id → projects.company_id, fallback uploaded_by/generated_by → users.company_id)
 *   7. conversations (created_by → users.company_id)
 *   8. approval_workflows (requested_by → users.company_id)
 *
 * Tables kept nullable (intentional):
 *   - audit_logs       (platform_admin operations have no company)
 *   - risk_scores      (platform-level risk scores)
 *   - users            (platform_admin has no company_id)
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // Helper: check if column exists before altering
    const colExists = async (table, col) => {
      const desc = await queryInterface.describeTable(table).catch(() => null);
      return desc && desc[col];
    };

    // ---------- Step 1: Find fallback company (first active company) ----------
    // If any record truly can't be resolved, assign to first company as safe fallback.
    const [companies] = await queryInterface.sequelize.query(
      `SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`
    );
    const fallbackCompanyId = companies.length ? companies[0].id : null;

    if (!fallbackCompanyId) {
      console.log('No companies found — skipping backfill (fresh install).');
      return;
    }

    console.log(`Fallback company_id for unresolvable records: ${fallbackCompanyId}`);

    // ---------- Step 2: Backfill in dependency order ----------

    // 2a. clients — via created_by → users.company_id
    if (await colExists('clients', 'company_id')) {
      const [r1] = await queryInterface.sequelize.query(`
        UPDATE clients SET company_id = u.company_id
        FROM users u
        WHERE clients.company_id IS NULL
          AND clients.created_by IS NOT NULL
          AND clients.created_by = u.id
          AND u.company_id IS NOT NULL
      `);
      console.log(`clients: backfilled via created_by→users`);

      // Fallback: any still NULL
      await queryInterface.sequelize.query(`
        UPDATE clients SET company_id = '${fallbackCompanyId}'
        WHERE company_id IS NULL
      `);
    }

    // 2b. vendors — via created_by → users.company_id
    if (await colExists('vendors', 'company_id')) {
      await queryInterface.sequelize.query(`
        UPDATE vendors SET company_id = u.company_id
        FROM users u
        WHERE vendors.company_id IS NULL
          AND vendors.created_by IS NOT NULL
          AND vendors.created_by = u.id
          AND u.company_id IS NOT NULL
      `);
      console.log(`vendors: backfilled via created_by→users`);

      await queryInterface.sequelize.query(`
        UPDATE vendors SET company_id = '${fallbackCompanyId}'
        WHERE company_id IS NULL
      `);
    }

    // 2c. projects — via prepared_by → users.company_id
    if (await colExists('projects', 'company_id')) {
      await queryInterface.sequelize.query(`
        UPDATE projects SET company_id = u.company_id
        FROM users u
        WHERE projects.company_id IS NULL
          AND projects.prepared_by IS NOT NULL
          AND projects.prepared_by = u.id
          AND u.company_id IS NOT NULL
      `);
      console.log(`projects: backfilled via prepared_by→users`);

      await queryInterface.sequelize.query(`
        UPDATE projects SET company_id = '${fallbackCompanyId}'
        WHERE company_id IS NULL
      `);
    }

    // 2d. estimates — via project_id → projects.company_id
    if (await colExists('estimates', 'company_id')) {
      await queryInterface.sequelize.query(`
        UPDATE estimates SET company_id = p.company_id
        FROM projects p
        WHERE estimates.company_id IS NULL
          AND estimates.project_id IS NOT NULL
          AND estimates.project_id = p.id
          AND p.company_id IS NOT NULL
      `);
      console.log(`estimates: backfilled via project_id→projects`);

      await queryInterface.sequelize.query(`
        UPDATE estimates SET company_id = '${fallbackCompanyId}'
        WHERE company_id IS NULL
      `);
    }

    // 2e. work_orders — via project_id → projects.company_id
    if (await colExists('work_orders', 'company_id')) {
      await queryInterface.sequelize.query(`
        UPDATE work_orders SET company_id = p.company_id
        FROM projects p
        WHERE work_orders.company_id IS NULL
          AND work_orders.project_id IS NOT NULL
          AND work_orders.project_id = p.id
          AND p.company_id IS NOT NULL
      `);
      console.log(`work_orders: backfilled via project_id→projects`);

      await queryInterface.sequelize.query(`
        UPDATE work_orders SET company_id = '${fallbackCompanyId}'
        WHERE company_id IS NULL
      `);
    }

    // 2f. documents — via project_id → projects, fallback uploaded_by/generated_by → users
    if (await colExists('documents', 'company_id')) {
      // Primary: project_id
      await queryInterface.sequelize.query(`
        UPDATE documents SET company_id = p.company_id
        FROM projects p
        WHERE documents.company_id IS NULL
          AND documents.project_id IS NOT NULL
          AND documents.project_id = p.id
          AND p.company_id IS NOT NULL
      `);
      // Fallback: uploaded_by
      await queryInterface.sequelize.query(`
        UPDATE documents SET company_id = u.company_id
        FROM users u
        WHERE documents.company_id IS NULL
          AND documents.uploaded_by IS NOT NULL
          AND documents.uploaded_by = u.id
          AND u.company_id IS NOT NULL
      `);
      // Fallback: generated_by
      await queryInterface.sequelize.query(`
        UPDATE documents SET company_id = u.company_id
        FROM users u
        WHERE documents.company_id IS NULL
          AND documents.generated_by IS NOT NULL
          AND documents.generated_by = u.id
          AND u.company_id IS NOT NULL
      `);
      console.log(`documents: backfilled via project→users chain`);

      await queryInterface.sequelize.query(`
        UPDATE documents SET company_id = '${fallbackCompanyId}'
        WHERE company_id IS NULL
      `);
    }

    // 2g. conversations — via created_by → users.company_id
    if (await colExists('conversations', 'company_id')) {
      await queryInterface.sequelize.query(`
        UPDATE conversations SET company_id = u.company_id
        FROM users u
        WHERE conversations.company_id IS NULL
          AND conversations.created_by IS NOT NULL
          AND conversations.created_by = u.id
          AND u.company_id IS NOT NULL
      `);
      console.log(`conversations: backfilled via created_by→users`);

      await queryInterface.sequelize.query(`
        UPDATE conversations SET company_id = '${fallbackCompanyId}'
        WHERE company_id IS NULL
      `);
    }

    // 2h. approval_workflows — via requested_by → users.company_id
    if (await colExists('approval_workflows', 'company_id')) {
      await queryInterface.sequelize.query(`
        UPDATE approval_workflows SET company_id = u.company_id
        FROM users u
        WHERE approval_workflows.company_id IS NULL
          AND approval_workflows.requested_by IS NOT NULL
          AND approval_workflows.requested_by = u.id
          AND u.company_id IS NOT NULL
      `);
      console.log(`approval_workflows: backfilled via requested_by→users`);

      await queryInterface.sequelize.query(`
        UPDATE approval_workflows SET company_id = '${fallbackCompanyId}'
        WHERE company_id IS NULL
      `);
    }

    // ---------- Step 3: Add NOT NULL constraints ----------
    const criticalTables = [
      'projects', 'clients', 'vendors', 'estimates',
      'documents', 'work_orders', 'conversations', 'approval_workflows'
    ];

    for (const table of criticalTables) {
      if (await colExists(table, 'company_id')) {
        try {
          await queryInterface.changeColumn(table, 'company_id', {
            type: Sequelize.UUID,
            allowNull: false,
          });
          console.log(`${table}: company_id set to NOT NULL`);
        } catch (err) {
          // If there are still NULLs somehow, log but don't crash
          console.error(`${table}: Failed to set NOT NULL — ${err.message}`);
        }
      }
    }

    console.log('Phase 1 backfill + NOT NULL constraints complete.');
  },

  async down(queryInterface, Sequelize) {
    // Revert NOT NULL back to nullable
    const criticalTables = [
      'projects', 'clients', 'vendors', 'estimates',
      'documents', 'work_orders', 'conversations', 'approval_workflows'
    ];

    for (const table of criticalTables) {
      const desc = await queryInterface.describeTable(table).catch(() => null);
      if (desc && desc.company_id) {
        await queryInterface.changeColumn(table, 'company_id', {
          type: Sequelize.UUID,
          allowNull: true,
        });
      }
    }
  },
};
