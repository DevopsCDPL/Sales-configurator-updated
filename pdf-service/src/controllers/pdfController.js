'use strict';
/**
 * PDF generation controller.
 * Validates auth, calls generator, uploads to R2, returns r2_url.
 */

const logger              = require('../utils/logger');
const { generatePdf }     = require('../services/pdfGeneratorService');
const { upload, buildR2Key } = require('../services/r2StorageService');

/**
 * POST /api/pdf/generate  (or specific type routes)
 * Body: { type, fileName, company, project, user, r2Context, ...typeSpecificFields }
 */
async function handleGenerate(req, res, next) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const secret = process.env.PDF_SERVICE_SECRET;
    if (secret) {
      const provided = req.headers['x-pdf-service-secret'];
      if (!provided || provided !== secret) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
      }
    }

    const { type, fileName, r2Context, ...rest } = req.body;

    if (!type) {
      return res.status(400).json({ success: false, error: '"type" is required' });
    }

    // ── Generate PDF ─────────────────────────────────────────────────────────
    const buffer = await generatePdf(type, req.body);
    logger.info({ type, size: buffer.length }, 'PDF generated');

    // ── Upload to R2 ─────────────────────────────────────────────────────────
    const safeFileName = fileName || `${type}_${Date.now()}.pdf`;
    const key          = buildR2Key(r2Context || {}, safeFileName);
    await upload(buffer, key, 'application/pdf');

    logger.info({ key }, 'PDF uploaded to R2');

    return res.json({
      success: true,
      data: {
        r2_url:    key,
        file_name: safeFileName,
        file_path: key,
        size:      buffer.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Convenience wrapper that injects the correct `type` from the route.
 */
function handleType(type) {
  return (req, res, next) => {
    req.body = { ...req.body, type };
    return handleGenerate(req, res, next);
  };
}

module.exports = { handleGenerate, handleType };
