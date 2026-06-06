'use strict';

/**
 * Migration: Add composite indexes for common tenant-scoped queries.
 *
 * Every index is a composite that leads with company_id because all application
 * queries filter by company_id first (enforced by tenant middleware + RLS).
 * The second column is the next most-selective predicate for each table.
 *
 * All statements use IF NOT EXISTS so the migration is safe to re-run.
 */

const INDEXES = [
  // projects — list/sort by creation date within a company
  {
    name: 'idx_projects_company_id_created_at',
    sql: `CREATE INDEX IF NOT EXISTS idx_projects_company_id_created_at
          ON projects (company_id, created_at DESC)`,
    drop: `DROP INDEX IF EXISTS idx_projects_company_id_created_at`,
  },
  // documents — fetch docs by project within a company
  {
    name: 'idx_documents_company_id_project_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_documents_company_id_project_id
          ON documents (company_id, project_id)`,
    drop: `DROP INDEX IF EXISTS idx_documents_company_id_project_id`,
  },
  // estimates — fetch estimates by project within a company
  {
    name: 'idx_estimates_company_id_project_id',
    sql: `CREATE INDEX IF NOT EXISTS idx_estimates_company_id_project_id
          ON estimates (company_id, project_id)`,
    drop: `DROP INDEX IF EXISTS idx_estimates_company_id_project_id`,
  },
  // work_orders — filter by status within a company (kanban / list views)
  {
    name: 'idx_work_orders_company_id_status',
    sql: `CREATE INDEX IF NOT EXISTS idx_work_orders_company_id_status
          ON work_orders (company_id, status)`,
    drop: `DROP INDEX IF EXISTS idx_work_orders_company_id_status`,
  },
  // invoices — filter by status within a company (AR dashboards)
  {
    name: 'idx_invoices_company_id_status',
    sql: `CREATE INDEX IF NOT EXISTS idx_invoices_company_id_status
          ON invoices (company_id, status)`,
    drop: `DROP INDEX IF EXISTS idx_invoices_company_id_status`,
  },
];

module.exports = {
  up: async (queryInterface) => {
    for (const idx of INDEXES) {
      try {
        await queryInterface.sequelize.query(idx.sql);
        console.log(`[INDEXES] Created: ${idx.name}`);
      } catch (err) {
        // Table may not exist yet in some envs — non-fatal
        console.warn(`[INDEXES] Skipped ${idx.name}: ${err.message}`);
      }
    }
  },

  down: async (queryInterface) => {
    for (const idx of INDEXES) {
      try {
        await queryInterface.sequelize.query(idx.drop);
        console.log(`[INDEXES] Dropped: ${idx.name}`);
      } catch (err) {
        console.warn(`[INDEXES] Drop skipped ${idx.name}: ${err.message}`);
      }
    }
  },
};
