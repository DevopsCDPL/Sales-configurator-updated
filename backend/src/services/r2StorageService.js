/**
 * Cloudflare R2 Storage Service
 * S3-compatible object storage for all file uploads.
 *
 * Usage:
 *   const r2 = require('./r2StorageService');
 *   const url  = await r2.upload(fileBuffer, 'documents/myfile.pdf', 'application/pdf');
 *   const buf  = await r2.download('documents/myfile.pdf');
 *   await r2.remove('documents/myfile.pdf');
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl: awsGetSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────
const ACCOUNT_ID       = process.env.CLOUDFLARE_ACCOUNT_ID;
const ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET           = process.env.R2_BUCKET_NAME || 'forge-files';

const isConfigured = !!(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY);

let s3 = null;
if (isConfigured) {
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });
  console.log('[R2] Cloudflare R2 storage configured ✓');
} else {
  console.warn('[R2] R2 credentials not set — falling back to local disk storage');
}

// ── Helpers ────────────────────────────────────────────────────

/** Normalise a key – strip leading slashes, backslashes → forward slashes */
function normaliseKey(key) {
  return key.replace(/\\/g, '/').replace(/^\/+/, '');
}

/** Derive a section name from a local file path (e.g. uploads/documents/... → "documents") */
function deriveSection(localPath) {
  const norm = localPath.replace(/\\/g, '/');
  const segments = ['tracking-slips', 'quality-reports', 'procurement', 'certificates',
                    'drawings', 'documents', 'generated', 'logos', 'logo'];
  for (const seg of segments) {
    if (norm.includes(`/${seg}/`) || norm.includes(`/${seg}`)) return seg === 'logo' ? 'logos' : seg;
  }
  return 'documents';
}

/** Determine if a section represents a "Generated" or "Uploaded" category */
function sectionToCategory(section) {
  const generatedSections = ['generated'];
  return generatedSections.includes(section) ? 'Generated' : 'Uploaded';
}

/** Sanitise a name for use as an R2 folder path segment */
function sanitiseFolderName(name) {
  if (!name) return 'Unknown';
  return name.replace(/[<>:"/\\|?*]+/g, '_').replace(/\s+/g, '_').trim() || 'Unknown';
}

/** Guess content-type from extension */
function mimeFromExt(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.csv': 'text/csv',
    '.dwg': 'application/acad',
    '.dxf': 'application/dxf',
    '.step': 'application/step',
    '.stp': 'application/step',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Build a hierarchical R2 key: {CompanyName}/{ProjectName}/{Uploaded|Generated}/{filename}
 * Falls back gracefully when company/project context is unavailable.
 * @param {string|null} companyName  Human-readable company name
/**
 * Build a hierarchical R2 key using Name_ID format:
 *   {CompanyName_CompanyID} / {ProjectName_ProjectID} / uploaded|generated / {filename}
 *
 * Falls back gracefully when company/project context is unavailable.
 * @param {string|null} companyName  Human-readable company name
 * @param {string|null} projectName  Human-readable project name
 * @param {string} section  "Uploaded" or "Generated" (or "logos" for company logos)
 * @param {string} filename
 * @param {object} [ids]  Optional IDs for Name_ID folder format
 * @param {string} [ids.companyId]
 * @param {string} [ids.companyCode]
 * @param {string} [ids.projectId]
 * @param {string} [ids.projectNumber]
 * @returns {string}
 */
function buildR2Key(companyName, projectName, section, filename, ids = {}) {
  const parts = [];
  // Company folder: Name_ID format
  if (companyName) {
    const cid = ids.companyCode || ids.companyId || '';
    parts.push(sanitiseFolderName(cid ? `${companyName}_${cid}` : companyName));
  }
  // Project folder: Name_ID format
  if (projectName) {
    const pid = ids.projectNumber || ids.projectId || '';
    parts.push(sanitiseFolderName(pid ? `${projectName}_${pid}` : projectName));
  }
  // Category: uploaded / generated / logos
  if (section) parts.push(section);
  parts.push(filename);
  return normaliseKey(parts.join('/'));
}

/**
 * Resolve company/project names AND IDs for R2 key building (Name_ID format).
 * Caches lookups within the same process tick for efficiency.
 * @param {string|null} companyId
 * @param {string|null} projectId
 * @returns {Promise<{companyName: string|null, companyCode: string|null, projectName: string|null, projectNumber: string|null}>}
 */
const _nameCache = new Map();
async function resolveNames(companyId, projectId) {
  const { Company, Project } = require('../models');
  let companyName = null, companyCode = null;
  let projectName = null, projectNumber = null;

  if (projectId) {
    const cacheKey = `proj:${projectId}`;
    if (_nameCache.has(cacheKey)) {
      const cached = _nameCache.get(cacheKey);
      companyName = cached.companyName;
      companyCode = cached.companyCode;
      projectName = cached.projectName;
      projectNumber = cached.projectNumber;
    } else {
      try {
        const project = await Project.findByPk(projectId, {
          attributes: ['id', 'project_name', 'project_number', 'company_id'],
          include: [{ model: Company, as: 'company', attributes: ['id', 'name', 'company_code'], required: false }],
        });
        if (project) {
          projectName = project.project_name || null;
          projectNumber = project.project_number || null;
          companyName = project.company?.name || null;
          companyCode = project.company?.company_code || null;
          // If company wasn't loaded via include, try from companyId param
          if (!companyName && (project.company_id || companyId)) {
            const cid = project.company_id || companyId;
            const company = await Company.findByPk(cid, { attributes: ['id', 'name', 'company_code'] });
            companyName = company?.name || null;
            companyCode = company?.company_code || null;
          }
          _nameCache.set(cacheKey, { companyName, companyCode, projectName, projectNumber });
          // Auto-clear cache entry after 60s
          setTimeout(() => _nameCache.delete(cacheKey), 60000);
        }
      } catch (e) {
        console.warn('[R2] resolveNames project lookup failed:', e.message);
      }
    }
  }

  if (!companyName && companyId) {
    const cacheKey = `comp:${companyId}`;
    if (_nameCache.has(cacheKey)) {
      const cached = _nameCache.get(cacheKey);
      companyName = cached.companyName || cached;
      companyCode = cached.companyCode || null;
    } else {
      try {
        const { Company } = require('../models');
        const company = await Company.findByPk(companyId, { attributes: ['id', 'name', 'company_code'] });
        companyName = company?.name || null;
        companyCode = company?.company_code || null;
        _nameCache.set(cacheKey, { companyName, companyCode });
        setTimeout(() => _nameCache.delete(cacheKey), 60000);
      } catch (e) {
        console.warn('[R2] resolveNames company lookup failed:', e.message);
      }
    }
  }

  return { companyName, companyCode, projectName, projectNumber };
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Upload a file buffer to R2.
 * @param {Buffer} buffer  File content
 * @param {string} key     Object key, e.g. "documents/1713200000-abc-file.pdf"
 * @param {string} [contentType]  Optional MIME type (auto-detected if omitted)
 * @returns {Promise<string>} The stored key
 */
async function upload(buffer, key, contentType) {
  key = normaliseKey(key);
  if (!s3) throw new Error('R2 storage is not configured');
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || mimeFromExt(key),
  }));
  return key;
}

/**
 * Download a file from R2 as a Buffer.
 * @param {string} key
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
async function download(key) {
  key = normaliseKey(key);
  if (!s3) throw new Error('R2 storage is not configured');
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of resp.Body) chunks.push(chunk);
  return {
    buffer: Buffer.concat(chunks),
    contentType: resp.ContentType || mimeFromExt(key),
  };
}

/**
 * Check if a key exists in R2.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
async function exists(key) {
  key = normaliseKey(key);
  if (!s3) return false;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a file from R2.
 * @param {string} key
 */
async function remove(key) {
  if (!s3) return;
  key = normaliseKey(key);
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    console.log(`[R2] Deleted: ${key}`);
  } catch (err) {
    console.error(`[R2] Delete failed for ${key}:`, err.message);
  }
}

/**
 * List all object keys in the R2 bucket (paginated).
 * @param {string} [prefix]  Optional prefix filter
 * @returns {Promise<string[]>}
 */
async function listAllKeys(prefix) {
  if (!s3) return [];
  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const keys = [];
  let continuationToken;
  do {
    const params = { Bucket: BUCKET, MaxKeys: 1000 };
    if (prefix) params.Prefix = prefix;
    if (continuationToken) params.ContinuationToken = continuationToken;
    const result = await s3.send(new ListObjectsV2Command(params));
    if (result.Contents) {
      for (const obj of result.Contents) keys.push(obj.Key);
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : null;
  } while (continuationToken);
  return keys;
}

/**
 * Delete ALL objects in the R2 bucket. Full deep clean.
 * @returns {Promise<number>} Number of objects deleted
 */
async function deleteAllObjects() {
  if (!s3) { console.log('[R2] Deep clean skipped (not configured)'); return 0; }
  const { DeleteObjectsCommand: DeleteObjsCmd } = require('@aws-sdk/client-s3');
  const allKeys = await listAllKeys();
  if (allKeys.length === 0) {
    console.log('[R2] Bucket is already empty');
    return 0;
  }
  console.log(`[R2] Deep clean: deleting ${allKeys.length} objects...`);
  let deleted = 0;
  // Delete in batches of 1000 (S3 API limit)
  for (let i = 0; i < allKeys.length; i += 1000) {
    const batch = allKeys.slice(i, i + 1000).map(Key => ({ Key }));
    await s3.send(new DeleteObjsCmd({
      Bucket: BUCKET,
      Delete: { Objects: batch, Quiet: true },
    }));
    deleted += batch.length;
    console.log(`[R2] Deleted batch: ${deleted}/${allKeys.length}`);
  }
  console.log(`[R2] Deep clean complete: ${deleted} objects deleted`);
  return deleted;
}

/**
 * Upload a multer file object to R2 (convenience wrapper).
 * Reads file from disk (req.file.path), uploads to R2, then deletes local copy.
 * @param {object} multerFile  req.file from multer
 * @param {string} folder      R2 folder prefix, e.g. "documents", "logo", "drawings"
 * @returns {Promise<string>}  The R2 key
 */
async function uploadMulterFile(multerFile, folder) {
  const fs = require('fs');
  const buffer = fs.readFileSync(multerFile.path);
  const key = `${folder}/${multerFile.filename}`;
  await upload(buffer, key, multerFile.mimetype);
  // Remove local temp file
  try { fs.unlinkSync(multerFile.path); } catch { /* ignore */ }
  return key;
}

/**
 * Sync a local file to R2 using a hierarchical key: {CompanyName}/{ProjectName}/{Uploaded|Generated}/{filename}
 * Resolves company and project names from IDs automatically.
 * @param {string} localPath  Absolute path on disk
 * @param {object} [opts]     Optional hierarchy context
 * @param {string} [opts.companyId]  Company UUID
 * @param {string} [opts.projectId]  Project UUID
 * @param {string} [opts.section]    Category: "Uploaded", "Generated", or "logos"
 * @param {string} [opts.companyName] Pre-resolved company name (skips DB lookup)
 * @param {string} [opts.projectName] Pre-resolved project name (skips DB lookup)
 * @returns {Promise<string|null>}   The R2 key used, or null on error
 */
async function syncFileToR2(localPath, opts = {}) {
  if (!s3) { console.log('[R2] Skipped sync (not configured):', localPath); return null; }
  const fs = require('fs');

  // Read buffer synchronously FIRST to avoid race with file moves
  let buffer;
  try {
    buffer = fs.readFileSync(localPath);
  } catch (readErr) {
    console.warn('[R2] Cannot read file for sync:', localPath, readErr.message);
    return null;
  }

  let key;
  if (opts.companyId || opts.companyName) {
    const filename = path.basename(localPath);
    // Resolve human-readable names + IDs for Name_ID folder format
    const names = await resolveNames(opts.companyId, opts.projectId);
    const companyName = opts.companyName || names.companyName;
    const projectName = opts.projectName || names.projectName;
    // Determine category from section or derive from path
    const rawSection = opts.section || deriveSection(localPath);
    const category = (rawSection === 'logos') ? 'logos' : sectionToCategory(rawSection);
    key = buildR2Key(companyName, projectName, category, filename, {
      companyId: opts.companyId,
      companyCode: names.companyCode,
      projectId: opts.projectId,
      projectNumber: names.projectNumber,
    });
  } else {
    // Legacy fallback: flat key from relative path
    const uploadsRoot = process.env.UPLOAD_PATH
      ? path.resolve(process.env.UPLOAD_PATH)
      : path.join(__dirname, '..', '..', 'uploads');
    key = path.relative(uploadsRoot, localPath).replace(/\\/g, '/');
    if (key.startsWith('..')) key = path.basename(localPath);
  }

  try {
    await upload(buffer, key, mimeFromExt(localPath));
    console.log(`[R2] Synced: ${key} (${buffer.length} bytes)`);
    return key;
  } catch (err) {
    console.error(`[R2] Sync failed for ${key}:`, err.name, err.message);
    return null;
  }
}

/**
 * Sync a buffer to R2 (for generated PDFs that may not be on disk yet).
 * Uses new hierarchical key: {CompanyName}/{ProjectName}/{Uploaded|Generated}/{filename}
 * @param {Buffer} buffer
 * @param {string} relativePath  e.g. "documents/proj123/file.pdf"
 * @param {object} [opts]        Optional hierarchy context
 * @param {string} [opts.companyId]
 * @param {string} [opts.projectId]
 * @param {string} [opts.section]  "Generated", "Uploaded", or legacy section name
 * @param {string} [opts.companyName] Pre-resolved company name
 * @param {string} [opts.projectName] Pre-resolved project name
 * @returns {Promise<string|null>} The R2 key used, or null on error
 */
async function syncBufferToR2(buffer, relativePath, opts = {}) {
  if (!s3) { console.log('[R2] Skipped buffer sync (not configured)'); return null; }

  let key;
  if (opts.companyId || opts.companyName) {
    const filename = path.basename(relativePath);
    const names = await resolveNames(opts.companyId, opts.projectId);
    const companyName = opts.companyName || names.companyName;
    const projectName = opts.projectName || names.projectName;
    const rawSection = opts.section || 'generated';
    const category = (rawSection === 'logos') ? 'logos' : sectionToCategory(rawSection);
    key = buildR2Key(companyName, projectName, category, filename, {
      companyId: opts.companyId,
      companyCode: names.companyCode,
      projectId: opts.projectId,
      projectNumber: names.projectNumber,
    });
  } else {
    key = normaliseKey(relativePath);
  }

  try {
    await upload(buffer, key, mimeFromExt(key));
    console.log(`[R2] Synced buffer: ${key} (${buffer.length} bytes)`);
    return key;
  } catch (err) {
    console.error(`[R2] Buffer sync failed for ${key}:`, err.name, err.message);
    return null;
  }
}

/**
 * Derive an R2 key from a DB-stored file_path.
 * Handles various formats: "/uploads/documents/x.pdf", "documents/x.pdf", absolute paths.
 */
function keyFromDbPath(dbPath) {
  if (!dbPath) return null;
  let p = dbPath.replace(/\\/g, '/');
  // Strip leading /uploads/ or uploads/
  p = p.replace(/^\/?(uploads\/)+/, '');
  // Strip absolute prefix up to /uploads/
  const idx = p.indexOf('/uploads/');
  if (idx !== -1) p = p.substring(idx + '/uploads/'.length);
  return normaliseKey(p);
}

/**
 * List objects and "folders" under a given prefix using S3 delimiter.
 * Returns { folders: string[], files: [{key, size, lastModified}] }
 * @param {string} prefix  e.g. "CompanyName_ID/" or "CompanyName_ID/ProjectName_ID/uploaded/"
 * @returns {Promise<{folders: string[], files: {key: string, size: number, lastModified: Date}[]}>}
 */
async function listPrefix(prefix = '') {
  if (!s3) return { folders: [], files: [] };
  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const normPrefix = prefix ? normaliseKey(prefix).replace(/\/?$/, '/') : '';
  const result = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: normPrefix || undefined,
    Delimiter: '/',
    MaxKeys: 1000,
  }));
  const folders = (result.CommonPrefixes || []).map(p => p.Prefix);
  const files = (result.Contents || [])
    .filter(o => o.Key !== normPrefix) // exclude the prefix itself
    .map(o => ({ key: o.Key, size: o.Size || 0, lastModified: o.LastModified }));
  return { folders, files };
}

/**
 * Generate a presigned GET URL for an R2 object.
 * @param {string} key        R2 object key
 * @param {number} expiresIn  Seconds until URL expires (default 900 = 15 min)
 * @returns {Promise<string>} Presigned URL
 */
async function getPresignedUrl(key, expiresIn = 900) {
  if (!s3) throw new Error('R2 storage is not configured');
  const normKey = normaliseKey(key);
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: normKey });
  return awsGetSignedUrl(s3, command, { expiresIn });
}

/**
 * Ensure a project's folder structure exists in R2.
 *
 * R2 (like S3) has no real "folders" — they are implied by object key prefixes.
 * To make a folder visible in the R2 dashboard immediately on project creation,
 * we write zero-byte placeholder objects (`.keep`) under the project prefix:
 *
 *   {CompanyName_CompanyID}/{ProjectName_ProjectID}/Uploaded/.keep
 *   {CompanyName_CompanyID}/{ProjectName_ProjectID}/Generated/.keep
 *
 * Idempotent: re-running on an existing folder is a cheap no-op overwrite of
 * the placeholders. Safe to call from project create and from backfill scripts.
 *
 * @param {object} opts
 * @param {string} opts.companyId   Company UUID (required)
 * @param {string} opts.projectId   Project UUID (required)
 * @param {string} [opts.companyName] Pre-resolved company name (skips DB lookup)
 * @param {string} [opts.projectName] Pre-resolved project name (skips DB lookup)
 * @param {string} [opts.companyCode] Pre-resolved company code
 * @param {string} [opts.projectNumber] Pre-resolved project number
 * @param {string[]} [opts.sections=['Uploaded','Generated']] Subfolders to seed
 * @returns {Promise<{prefix: string, keys: string[]}>} The created folder prefix and keys
 * @throws {Error} If R2 is configured but the folder cannot be created
 */
async function ensureProjectFolder(opts = {}) {
  if (!s3) {
    // Surface a clear error rather than silently no-op'ing — callers decide
    // whether to swallow it (e.g. in dev without R2 configured).
    const err = new Error('R2 storage is not configured (missing CLOUDFLARE_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY)');
    err.code = 'R2_NOT_CONFIGURED';
    throw err;
  }

  const { companyId, projectId } = opts;
  if (!companyId || !projectId) {
    throw new Error(`ensureProjectFolder requires companyId and projectId (got companyId=${companyId}, projectId=${projectId})`);
  }

  // Resolve names if not provided
  let companyName = opts.companyName;
  let projectName = opts.projectName;
  let companyCode = opts.companyCode;
  let projectNumber = opts.projectNumber;
  if (!companyName || !projectName) {
    const names = await resolveNames(companyId, projectId);
    companyName = companyName || names.companyName;
    projectName = projectName || names.projectName;
    companyCode = companyCode || names.companyCode;
    projectNumber = projectNumber || names.projectNumber;
  }

  if (!companyName) throw new Error(`Cannot resolve company name for company_id=${companyId}`);
  if (!projectName) throw new Error(`Cannot resolve project name for project_id=${projectId}`);

  const companySegment = sanitiseFolderName(companyCode ? `${companyName}_${companyCode}` : `${companyName}_${companyId}`);
  const projectSegment = sanitiseFolderName(projectNumber ? `${projectName}_${projectNumber}` : `${projectName}_${projectId}`);
  const prefix = `${companySegment}/${projectSegment}/`;

  const sections = Array.isArray(opts.sections) && opts.sections.length
    ? opts.sections
    : ['Uploaded', 'Generated'];

  const keys = [];
  for (const section of sections) {
    const key = normaliseKey(`${prefix}${section}/.keep`);
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.alloc(0),
      ContentType: 'application/x-directory-placeholder',
    }));
    keys.push(key);
  }
  console.log(`[R2] Ensured project folder: ${prefix} (${keys.length} placeholder(s))`);
  return { prefix, keys };
}

module.exports = {
  upload,
  download,
  exists,
  remove,
  uploadMulterFile,
  syncFileToR2,
  syncBufferToR2,
  keyFromDbPath,
  buildR2Key,
  resolveNames,
  ensureProjectFolder,
  listAllKeys,
  listPrefix,
  deleteAllObjects,
  isConfigured,
  normaliseKey,
  mimeFromExt,
  sanitiseFolderName,
  getPresignedUrl,
};
