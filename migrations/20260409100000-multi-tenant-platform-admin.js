'use strict';

/**
 * Multi-Tenant & Platform Admin Migration
 * 
 * 1. Add subscription fields to companies table (companies = tenant entity)
 * 2. Add platform_admin to users role enum
 * 3. Add company_id to projects table (tenant isolation for projects)
 * 4. Add company_id to other tables that don't have it
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // ── 1. Add subscription & tenant fields to companies ──────────────────
    const companyColumns = await queryInterface.describeTable('companies').catch(() => null);
    if (companyColumns) {
      if (!companyColumns.company_code) {
        await queryInterface.addColumn('companies', 'company_code', {
          type: Sequelize.STRING(50),
          allowNull: true,
          unique: true,
        });
      }
      if (!companyColumns.logo_url) {
        await queryInterface.addColumn('companies', 'logo_url', {
          type: Sequelize.TEXT,
          allowNull: true,
        });
      }
      if (!companyColumns.subscription_start_date) {
        await queryInterface.addColumn('companies', 'subscription_start_date', {
          type: Sequelize.DATEONLY,
          allowNull: true,
        });
      }
      if (!companyColumns.subscription_end_date) {
        await queryInterface.addColumn('companies', 'subscription_end_date', {
          type: Sequelize.DATEONLY,
          allowNull: true,
        });
      }
      if (!companyColumns.subscription_status) {
        await queryInterface.addColumn('companies', 'subscription_status', {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'active',
        });
      }
    }

    // ── 2. Add platform_admin to users role enum ──────────────────────────
    // PostgreSQL enum types need ALTER TYPE to add new values
    try {
      await queryInterface.sequelize.query(`
        ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'platform_admin';
      `);
    } catch (e) {
      console.warn('platform_admin enum addition:', e.message);
    }

    // ── 3. Add company_id to projects ─────────────────────────────────────
    const projectColumns = await queryInterface.describeTable('projects').catch(() => null);
    if (projectColumns && !projectColumns.company_id) {
      await queryInterface.addColumn('projects', 'company_id', {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'companies', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }

    // ── 4. Add company_id to other tables that don't have it ──────────────
    const tablesToUpdate = [
      'documents',
      'invoices',
      'estimates',
      'sales_orders',
      'work_orders',
      'quality_records',
      'project_analytics',
      'audit_logs',
      'file_manager_folders',
    ];

    for (const table of tablesToUpdate) {
      try {
        const cols = await queryInterface.describeTable(table);
        if (cols && !cols.company_id) {
          await queryInterface.addColumn(table, 'company_id', {
            type: Sequelize.UUID,
            allowNull: true,
            references: { model: 'companies', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          });
        }
      } catch (e) {
        console.warn(`Skipping company_id on ${table}:`, e.message);
      }
    }

    // ── 5. Backfill company_id on projects from their client's company_id ─
    try {
      await queryInterface.sequelize.query(`
        UPDATE projects p
        SET company_id = c.company_id
        FROM clients c
        WHERE p.client_id = c.id
          AND p.company_id IS NULL
          AND c.company_id IS NOT NULL
      `);
      console.log('Backfilled company_id on projects from clients.');
    } catch (e) {
      console.warn('Project company_id backfill:', e.message);
    }

    // ── 6. Backfill company_id on child tables from their project ─────────
    const childTables = [
      { table: 'documents', fk: 'project_id' },
      { table: 'invoices', fk: 'project_id' },
      { table: 'estimates', fk: 'project_id' },
      { table: 'sales_orders', fk: 'project_id' },
      { table: 'work_orders', fk: 'project_id' },
      { table: 'quality_records', fk: 'project_id' },
      { table: 'project_analytics', fk: 'project_id' },
    ];

    for (const { table, fk } of childTables) {
      try {
        await queryInterface.sequelize.query(`
          UPDATE ${table} t
          SET company_id = p.company_id
          FROM projects p
          WHERE t.${fk} = p.id
            AND t.company_id IS NULL
            AND p.company_id IS NOT NULL
        `);
        console.log(`Backfilled company_id on ${table}.`);
      } catch (e) {
        console.warn(`${table} company_id backfill:`, e.message);
      }
    }

    // Backfill audit_logs from user
    try {
      await queryInterface.sequelize.query(`
        UPDATE audit_logs a
        SET company_id = u.company_id
        FROM users u
        WHERE a.performed_by = u.id
          AND a.company_id IS NULL
          AND u.company_id IS NOT NULL
      `);
      console.log('Backfilled company_id on audit_logs.');
    } catch (e) {
      console.warn('audit_logs company_id backfill:', e.message);
    }
  },

  async down(queryInterface) {
    // Remove subscription fields from companies
    const removeColumns = [
      ['companies', 'company_code'],
      ['companies', 'logo_url'],
      ['companies', 'subscription_start_date'],
      ['companies', 'subscription_end_date'],
      ['companies', 'subscription_status'],
    ];
    for (const [table, col] of removeColumns) {
      try { await queryInterface.removeColumn(table, col); } catch (e) { /* skip */ }
    }

    // Remove company_id from tables
    const tables = ['projects', 'documents', 'invoices', 'estimates', 'sales_orders',
      'work_orders', 'quality_records', 'project_analytics', 'audit_logs', 'file_manager_folders'];
    for (const table of tables) {
      try { await queryInterface.removeColumn(table, 'company_id'); } catch (e) { /* skip */ }
    }
  }
};
