'use strict';

/**
 * runConfiguratorMigrations — executes pending migrations from
 * src/migrations-configurator at boot, tracked in SequelizeMeta.
 *
 * Why at boot: this Railway instance deploys via `railway up` (no CI
 * step), so migrations must be self-applying. Every migration in that
 * folder is written IF-NOT-EXISTS / additive, so re-runs are safe.
 *
 * Non-fatal by design: a migration failure logs loudly but does not
 * crash the app (the V1 paths don't depend on the new tables).
 */

const fs = require('fs');
const path = require('path');

async function runConfiguratorMigrations(sequelize, logger = console) {
  const dir = path.join(__dirname, '..', 'migrations-configurator');
  if (!fs.existsSync(dir)) return { ran: [], skipped: true };

  const qi = sequelize.getQueryInterface();
  const Sequelize = require('sequelize');

  // Ensure the standard sequelize-cli meta table exists
  await sequelize.query(
    'CREATE TABLE IF NOT EXISTS "SequelizeMeta" (name VARCHAR(255) PRIMARY KEY)'
  );
  const [doneRows] = await sequelize.query('SELECT name FROM "SequelizeMeta"');
  const done = new Set(doneRows.map((r) => r.name));

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !f.startsWith('_') && !f.includes('__'))
    .sort();

  const ran = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const mig = require(path.join(dir, file));
    if (typeof mig.up !== 'function') continue;
    logger.info ? logger.info(`[migrations] running ${file}`) : console.log(`[migrations] running ${file}`);
    try {
      await mig.up(qi, Sequelize);
      await sequelize.query('INSERT INTO "SequelizeMeta" (name) VALUES (:name) ON CONFLICT DO NOTHING', {
        replacements: { name: file },
      });
      ran.push(file);
    } catch (err) {
      const msg = `[migrations] FAILED ${file}: ${err.message}`;
      logger.error ? logger.error(msg) : console.error(msg);
      // additive migrations: stop the chain but never crash the app
      break;
    }
  }
  if (ran.length) {
    const msg = `[migrations] applied: ${ran.join(', ')}`;
    logger.info ? logger.info(msg) : console.log(msg);
  }
  return { ran, skipped: false };
}

module.exports = { runConfiguratorMigrations };
