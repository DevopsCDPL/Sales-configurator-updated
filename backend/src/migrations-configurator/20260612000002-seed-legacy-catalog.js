'use strict';

/**
 * 20260612000002-seed-legacy-catalog — one-time permanent load of the
 * legacy sales-configurator component catalog (267 parts, 21 categories,
 * recovered from the old app's database 2026-06-12).
 *
 * Runs ONCE at boot (tracked in SequelizeMeta) so the catalog is in the
 * database permanently with no user action. Never re-runs: users are free
 * to edit/delete legacy parts and maintain the catalog via the Excel
 * download/upload round-trip without the server resurrecting rows.
 */

module.exports = {
  async up() {
    // Data seed, not schema — use the models + shared importer.
    const models = require('../models');
    const { importLegacyCatalog } = require('../services/configurator/legacyCatalogImporter');
    const out = await importLegacyCatalog(models.ConfiguratorComponent, { companyId: null });
    console.log(`[seed-legacy-catalog] created=${out.created} updated=${out.updated} skipped=${out.skipped} total=${out.total}`);
  },

  async down() {
    // Intentionally a no-op: removing user-owned catalog data on rollback
    // would be destructive.
  },
};
