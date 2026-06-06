const db = require('../src/config/database.js');
const { Sequelize } = require('sequelize');
const seq = new Sequelize(db.development);

(async () => {
  const migrations = [
    '20260306000000-add-raw-material-fields-to-analytics.js',
    '20260306000000-restructure-vendor-materials.js',
    '20260308000000-add-job-requirements-to-work-orders.js',
    '20260308000000-create-stocks-table.js',
    '20260310100000-create-invoice.js',
    '20260312000000-add-position-to-users.js',
    '20260313000000-add-instructions-to-rfq-bundles.js',
    '20260313000000-add-position-to-clients.js',
    '20260313000000-add-ratings-to-vendor-purchase-orders.js',
    '20260313100000-add-sales-engineer-role.js',
    '20260314000000-create-recycle-bin.js',
    '20260316000000-add-contact-position-to-vendors.js',
    '20260320000000-create-parts-tables.js',
    '20260320000000-create-procurement-tables.js',
    '20260321000000-create-material-stock-tables.js',
    '20260321000000-create-mgmt-procurement-tables.js',
    '20260321100000-restructure-material-parts-master.js',
    '20260322000000-add-po-cost-fields.js',
    '20260322000000-rebuild-parts-master.js',
    '20260322100000-add-soft-delete-to-procurement.js',
    '20260322100000-create-raw-material-master.js',
    '20260322200000-add-dimensions-to-raw-materials.js',
    '20260323000000-add-material-id-to-raw-materials.js',
    '20260323000000-add-parts-master-fields.js',
    '20260324000000-add-heat-number-to-parts.js',
    '20260331000000-add-line-items-to-mgmt-procurement-pos.js',
    '20260331000000-add-line-items-to-mgmt-rfqs.js',
    '20260401000000-add-stock-warehouse-fields.js',
    '20260402000000-add-avatar-to-users.js',
    '20260403000000-add-raw-material-id-to-stocks.js',
    '20260409000000-create-file-manager-folders.js',
    '20260409100000-multi-tenant-platform-admin.js',
    '20260410000000-file-manager-enhancements.js'
  ];

  for (const m of migrations) {
    try {
      await seq.query(
        'INSERT INTO "SequelizeMeta" (name) VALUES (:name) ON CONFLICT DO NOTHING',
        { replacements: { name: m } }
      );
      console.log('Marked:', m);
    } catch (e) {
      console.error('Failed:', m, e.message);
    }
  }
  await seq.close();
  console.log('Done!');
})();
