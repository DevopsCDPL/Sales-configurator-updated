/**
 * Backfill R2 project folders for projects that already exist in the database
 * but have no corresponding folder in the Cloudflare R2 bucket.
 *
 * For each (non-deleted) project, ensures:
 *   {CompanyName_CompanyCode|ID}/{ProjectName_ProjectNumber|ID}/Uploaded/.keep
 *   {CompanyName_CompanyCode|ID}/{ProjectName_ProjectNumber|ID}/Generated/.keep
 *
 * Usage:
 *   cd backend
 *   node scripts/backfill-r2-project-folders.js          # backfill all
 *   node scripts/backfill-r2-project-folders.js --dry    # preview only
 *   node scripts/backfill-r2-project-folders.js --company <companyId>
 *
 * Environment: requires .env with R2 + DB credentials.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry') || args.includes('--dry-run');
const companyArgIdx = args.indexOf('--company');
const ONLY_COMPANY = companyArgIdx !== -1 ? args[companyArgIdx + 1] : null;

(async () => {
  const r2 = require('../src/services/r2StorageService');
  if (!r2.isConfigured) {
    console.error('ERROR: R2 is not configured. Set CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME in .env');
    process.exit(1);
  }

  const { Project, Company, sequelize } = require('../src/models');

  const where = {};
  if (ONLY_COMPANY) where.company_id = ONLY_COMPANY;

  const projects = await Project.findAll({
    where,
    attributes: ['id', 'project_name', 'project_number', 'company_id', 'deleted_at'],
    include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'company_code'], required: false }],
    paranoid: false, // we filter manually below to be explicit
  });

  const active = projects.filter(p => !p.deleted_at);
  console.log(`Found ${active.length} active project(s) (skipping ${projects.length - active.length} soft-deleted)`);
  if (DRY_RUN) console.log('DRY RUN — no R2 writes will be performed.');

  let ok = 0;
  let failed = 0;
  const failures = [];

  for (const p of active) {
    const label = `${p.project_name} (${p.id})`;
    if (!p.company_id) {
      console.warn(`SKIP ${label}: no company_id`);
      failed++;
      failures.push({ projectId: p.id, reason: 'missing company_id' });
      continue;
    }
    if (!p.company) {
      console.warn(`SKIP ${label}: company ${p.company_id} not found`);
      failed++;
      failures.push({ projectId: p.id, reason: `company ${p.company_id} missing` });
      continue;
    }

    try {
      if (DRY_RUN) {
        const companySeg = (p.company.company_code || p.company_id);
        const projectSeg = (p.project_number || p.id);
        console.log(`WOULD CREATE: ${p.company.name}_${companySeg}/${p.project_name}_${projectSeg}/{Uploaded,Generated}/.keep`);
      } else {
        const result = await r2.ensureProjectFolder({
          companyId: p.company_id,
          projectId: p.id,
          companyName: p.company.name,
          companyCode: p.company.company_code,
          projectName: p.project_name,
          projectNumber: p.project_number,
        });
        console.log(`OK   ${label} -> ${result.prefix}`);
      }
      ok++;
    } catch (err) {
      console.error(`FAIL ${label}: ${err.message}`);
      failed++;
      failures.push({ projectId: p.id, reason: err.message });
    }
  }

  console.log('\n──────── Backfill summary ────────');
  console.log(`Succeeded: ${ok}`);
  console.log(`Failed:    ${failed}`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f.projectId}: ${f.reason}`);
  }

  await sequelize.close();
  process.exit(failed === 0 ? 0 : 2);
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
