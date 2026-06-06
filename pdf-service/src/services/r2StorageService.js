'use strict';
/**
 * Cloudflare R2 storage service (pdf-service edition).
 *
 * This version is upload-only — no database access.
 * All name/identifier context is passed in from the calling code.
 *
 * The R2 bucket is S3-compatible and configured via env vars:
 *   CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('../utils/logger');

// ── Client ────────────────────────────────────────────────────────────────
let _client = null;

function getClient() {
  if (_client) return _client;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is not set');

  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID     || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
  });
  return _client;
}

function getBucket() {
  return process.env.R2_BUCKET_NAME || 'forge-files';
}

function isConfigured() {
  return !!(
    process.env.CLOUDFLARE_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}

// ── Key builder ───────────────────────────────────────────────────────────
/**
 * Build the R2 object key from contextual identifiers.
 *
 * Pattern: {CompanyName_CompanyCode}/{ProjectName_ProjectNumber}/generated/{filename}
 *
 * @param {object} ctx
 * @param {string} ctx.companyName
 * @param {string} ctx.companyCode
 * @param {string} ctx.projectName
 * @param {string} ctx.projectNumber
 * @param {string} filename
 */
function buildR2Key({ companyName, companyCode, projectName, projectNumber }, filename) {
  const sanitize = (s) => String(s || '').replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60);

  const companyPart  = `${sanitize(companyName)}_${sanitize(companyCode)}`;
  const projectPart  = `${sanitize(projectName)}_${sanitize(projectNumber)}`;

  return `${companyPart}/${projectPart}/generated/${filename}`;
}

// ── Upload ────────────────────────────────────────────────────────────────
/**
 * Upload a Buffer to R2.
 *
 * @param {Buffer} buffer
 * @param {string} key          – R2 object key (from buildR2Key)
 * @param {string} [contentType='application/pdf']
 * @returns {Promise<string>}   – the key (r2_url / file_path)
 */
async function upload(buffer, key, contentType = 'application/pdf') {
  if (!isConfigured()) {
    throw new Error('R2 is not configured – set CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
  }
  const client = getClient();
  await client.send(new PutObjectCommand({
    Bucket:      getBucket(),
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }));
  logger.info({ key, size: buffer.length }, '[r2] uploaded');
  return key;
}

/**
 * Delete an object from R2.
 * Silently ignores errors (non-critical cleanup).
 */
async function remove(key) {
  if (!isConfigured() || !key) return;
  try {
    const client = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
    logger.info({ key }, '[r2] deleted');
  } catch (err) {
    logger.warn({ key, err: err.message }, '[r2] delete failed (ignored)');
  }
}

module.exports = { upload, remove, buildR2Key, isConfigured };
