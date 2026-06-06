'use strict';

/**
 * Migration: Fix invoice table
 *
 * 1. Add missing columns: customer_email, customer_phone, terms_conditions
 *    (these exist in the Sequelize model but were absent from the original migration)
 * 2. Drop the global unique constraint on invoice_number
 * 3. Add per-company compound unique constraint on (invoice_number, company_id)
 *    so each company has its own independent numbering namespace
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ── 1. Add missing columns (idempotent) ──────────────────────────────────
    const addIfMissing = async (table, column, definition) => {
      try {
        await queryInterface.addColumn(table, column, definition);
        console.log(`[INVOICE-FIX] Added column ${table}.${column}`);
      } catch (err) {
        if (err.message && err.message.includes('already exists')) {
          console.log(`[INVOICE-FIX] Column ${table}.${column} already exists — skipping`);
        } else {
          throw err;
        }
      }
    };

    await addIfMissing('invoices', 'customer_email', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });

    await addIfMissing('invoices', 'customer_phone', {
      type: Sequelize.STRING(50),
      allowNull: true,
    });

    await addIfMissing('invoices', 'terms_conditions', {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
    });

    // ── 2. Drop global unique constraint on invoice_number ───────────────────
    // The constraint name is typically 'invoices_invoice_number_key' (Postgres default)
    // We use raw SQL so we can check existence first.
    try {
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
        EXCEPTION WHEN OTHERS THEN NULL;
        END $$;
      `);
      console.log('[INVOICE-FIX] Dropped global unique constraint on invoice_number');
    } catch (err) {
      console.warn('[INVOICE-FIX] Could not drop invoice_number unique constraint:', err.message);
    }

    // Also drop any index variant (Sequelize sync({ alter }) can create an index instead)
    try {
      await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS invoices_invoice_number;
      `);
      console.log('[INVOICE-FIX] Dropped invoice_number index if existed');
    } catch (err) {
      console.warn('[INVOICE-FIX] Could not drop invoice_number index:', err.message);
    }

    // ── 3. Add compound unique constraint (invoice_number, company_id) ───────
    // In Postgres, two NULLs are NOT equal in a unique index, so two rows
    // with the same invoice_number but company_id = NULL would still collide.
    // Use a partial-index approach: separate unique index per non-null company.
    // For rows where company_id IS NULL (legacy / platform-admin created rows),
    // we keep a standard unique constraint.
    //
    // Simplest safe approach: unique index on (invoice_number, company_id)
    // using COALESCE to treat NULL as a fixed sentinel UUID so two NULLs collide.
    try {
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_company_unique
        ON invoices (invoice_number, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid));
      `);
      console.log('[INVOICE-FIX] Added per-company unique index on invoice_number');
    } catch (err) {
      console.warn('[INVOICE-FIX] Could not create per-company unique index:', err.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Drop the new compound index
    try {
      await queryInterface.sequelize.query(`
        DROP INDEX IF EXISTS invoices_number_company_unique;
      `);
    } catch (err) { /* ignore */ }

    // Restore global unique constraint
    try {
      await queryInterface.addConstraint('invoices', {
        type: 'unique',
        fields: ['invoice_number'],
        name: 'invoices_invoice_number_key',
      });
    } catch (err) { /* ignore */ }

    // Remove added columns
    try { await queryInterface.removeColumn('invoices', 'terms_conditions'); } catch (err) { /* ignore */ }
    try { await queryInterface.removeColumn('invoices', 'customer_phone'); } catch (err) { /* ignore */ }
    try { await queryInterface.removeColumn('invoices', 'customer_email'); } catch (err) { /* ignore */ }
  },
};
