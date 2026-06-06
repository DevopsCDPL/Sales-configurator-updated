/**
 * R2 Cloud Storage Migration Script
 * 
 * Wipes ALL existing R2 objects and re-uploads every document from the database
 * using the new flat folder structure:
 * 
 *   CompanyName_CompanyID / ProjectName_ProjectID / uploaded|generated / filename
 * 
 * Usage:
 *   cd backend && node scripts/migrate-r2-structure.js
 * 
 * Environment: Requires .env with R2 credentials and DATABASE_URL.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const path = require('path');
const fs = require('fs');
const { Sequelize, Op } = require('sequelize');

// ── DB Connection ──────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL || (
  process.env.DB_HOST
    ? `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME}`
    : null
);
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME not set');
  process.exit(1);
}

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? { require: true, rejectUnauthorized: false } : false,
  },
});

// ── R2 Client ──────────────────────────────────────────────────
const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const BUCKET = process.env.R2_BUCKET_NAME || 'forge-files';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ── Helpers ────────────────────────────────────────────────────
function sanitise(str) {
  if (!str) return 'unknown';
  return String(str).replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_').trim() || 'unknown';
}

function mimeFromExt(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.dwg': 'application/acad', '.dxf': 'application/dxf',
    '.step': 'application/step', '.stp': 'application/step',
  };
  return map[ext] || 'application/octet-stream';
}

// ── Step 1: Delete ALL existing R2 objects ─────────────────────
async function deleteAllR2Objects() {
  console.log('\n═══ STEP 1: Deleting ALL existing R2 objects ═══');
  const allKeys = [];
  let continuationToken;
  do {
    const params = { Bucket: BUCKET, MaxKeys: 1000 };
    if (continuationToken) params.ContinuationToken = continuationToken;
    const result = await s3.send(new ListObjectsV2Command(params));
    if (result.Contents) {
      for (const obj of result.Contents) allKeys.push(obj.Key);
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : null;
  } while (continuationToken);

  if (allKeys.length === 0) {
    console.log('  Bucket is already empty.');
    return 0;
  }

  console.log(`  Found ${allKeys.length} objects to delete...`);
  let deleted = 0;
  for (let i = 0; i < allKeys.length; i += 1000) {
    const batch = allKeys.slice(i, i + 1000).map(Key => ({ Key }));
    await s3.send(new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: batch, Quiet: true },
    }));
    deleted += batch.length;
    console.log(`  Deleted ${deleted}/${allKeys.length}`);
  }
  console.log(`  ✓ Deleted ${deleted} objects.\n`);
  return deleted;
}

// ── Step 2: Re-upload from DB + local disk ─────────────────────
async function reuploadDocuments() {
  console.log('═══ STEP 2: Re-uploading documents with new structure ═══');

  // Fetch all companies
  const [companies] = await sequelize.query(`SELECT id, name, company_code FROM companies`);
  const companyMap = {};
  for (const c of companies) {
    companyMap[c.id] = { name: c.name, code: c.company_code };
  }

  // Fetch all projects (project_number may not exist in older DBs)
  let projects;
  try {
    [projects] = await sequelize.query(`SELECT id, project_name, project_number, company_id FROM projects`);
  } catch {
    console.log('  (project_number column not found, falling back)');
    [projects] = await sequelize.query(`SELECT id, project_name, NULL as project_number, company_id FROM projects`);
  }
  const projectMap = {};
  for (const p of projects) {
    projectMap[p.id] = { name: p.project_name, number: p.project_number, companyId: p.company_id };
  }

  // Fetch all documents
  const [documents] = await sequelize.query(`
    SELECT id, file_name, file_path, file_type, project_id, company_id, module_type, document_type, r2_url
    FROM documents
    ORDER BY created_at ASC
  `);

  console.log(`  Found ${documents.length} documents in DB.\n`);

  const UPLOADS_ROOT = process.env.UPLOAD_PATH
    ? path.resolve(process.env.UPLOAD_PATH)
    : path.join(__dirname, '..', 'uploads');

  let uploaded = 0, skipped = 0, failed = 0;

  for (const doc of documents) {
    // Resolve company info
    const companyId = doc.company_id || (doc.project_id && projectMap[doc.project_id]?.companyId) || null;
    const company = companyId ? companyMap[companyId] : null;
    const companyFolder = company
      ? sanitise(`${company.name}_${company.code || companyId}`)
      : sanitise(companyId || 'default');

    // Resolve project info
    const project = doc.project_id ? projectMap[doc.project_id] : null;
    const projectFolder = project
      ? sanitise(`${project.name}_${project.number || doc.project_id}`)
      : null;

    // Determine uploaded vs generated
    const origin = (doc.file_type === 'generated') ? 'generated' : 'uploaded';

    // Build new R2 key
    const fileName = doc.file_name || path.basename(doc.file_path || 'unknown');
    let newKey;
    if (projectFolder) {
      newKey = `${companyFolder}/${projectFolder}/${origin}/${fileName}`;
    } else {
      // Non-project files: flat under company
      newKey = `${companyFolder}/${origin}/${fileName}`;
    }

    // Find file on local disk
    let buffer = null;
    const candidates = [];

    if (doc.file_path) {
      // Strip uploads/ prefix variations
      let relPath = doc.file_path.replace(/\\/g, '/').replace(/^\/?(uploads\/)+/, '');
      candidates.push(path.join(UPLOADS_ROOT, relPath));
      candidates.push(path.join(UPLOADS_ROOT, 'documents', path.basename(relPath)));
      candidates.push(path.join(UPLOADS_ROOT, doc.file_path.replace(/\\/g, '/')));
    }
    if (doc.file_name) {
      candidates.push(path.join(UPLOADS_ROOT, 'documents', doc.file_name));
      candidates.push(path.join(UPLOADS_ROOT, 'documents', 'project', doc.file_name));
      candidates.push(path.join(UPLOADS_ROOT, 'documents', 'project', 'drawing', doc.file_name));
      candidates.push(path.join(UPLOADS_ROOT, 'generated', doc.file_name));
      candidates.push(path.join(UPLOADS_ROOT, 'quality-reports', doc.file_name));
    }

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          buffer = fs.readFileSync(candidate);
          break;
        }
      } catch {}
    }

    if (!buffer) {
      // Try downloading from old R2 key
      if (doc.r2_url) {
        try {
          const { GetObjectCommand } = require('@aws-sdk/client-s3');
          const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: doc.r2_url }));
          const chunks = [];
          for await (const chunk of resp.Body) chunks.push(chunk);
          buffer = Buffer.concat(chunks);
        } catch {}
      }
    }

    if (!buffer) {
      skipped++;
      console.log(`  SKIP: ${doc.id} — ${fileName} (file not found on disk or R2)`);
      // Still update the r2_url in DB to new key for future uploads
      await sequelize.query(`UPDATE documents SET r2_url = $1 WHERE id = $2`, {
        bind: [newKey, doc.id],
      });
      continue;
    }

    // Upload to R2 with new key
    try {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: newKey,
        Body: buffer,
        ContentType: mimeFromExt(fileName),
      }));

      // Update the document's r2_url in DB
      await sequelize.query(`UPDATE documents SET r2_url = $1 WHERE id = $2`, {
        bind: [newKey, doc.id],
      });

      uploaded++;
      console.log(`  ✓ ${uploaded}: ${newKey} (${(buffer.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      failed++;
      console.error(`  ✗ FAIL: ${newKey} — ${err.message}`);
    }
  }

  console.log(`\n  ═══ SUMMARY ═══`);
  console.log(`  Uploaded:  ${uploaded}`);
  console.log(`  Skipped:   ${skipped} (no local file)`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Total:     ${documents.length}\n`);
}

// ── Main ───────────────────────────────────────────────────────
(async () => {
  try {
    console.log('R2 Storage Structure Migration');
    console.log('==============================');
    console.log(`Bucket: ${BUCKET}`);
    console.log(`DB: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}\n`);

    await sequelize.authenticate();
    console.log('Database connected ✓');

    // STEP 1: Wipe everything
    await deleteAllR2Objects();

    // STEP 2: Re-upload with new structure
    await reuploadDocuments();

    console.log('Migration complete ✓');
    process.exit(0);
  } catch (err) {
    console.error('MIGRATION FAILED:', err);
    process.exit(1);
  }
})();
