const nodemailer = require('nodemailer');
const logger = require('./logger');

/**
 * Email Service — sends emails with optional PDF attachments.
 *
 * Configuration priority (first match wins):
 *   1. EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASS / EMAIL_FROM
 *   2. SMTP_HOST  / SMTP_PORT  / SMTP_USER  / SMTP_PASS  / SMTP_FROM  (legacy)
 *   3. Ethereal auto-test account (development only, NODE_ENV !== 'production')
 *
 * In development with no SMTP credentials, an Ethereal test account is created
 * automatically.  Sent emails appear at https://ethereal.email/messages — the
 * preview URL is logged to the console after each send.
 *
 * In production without credentials the service returns SMTP_NOT_CONFIGURED so
 * callers can surface a meaningful error without marking records as sent.
 */

// Cached transporter promise: { transport, testMode }
let _transporterPromise = null;

// ─── helpers ────────────────────────────────────────────────────────────────

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const v = email.trim();
  return v.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function getConfig() {
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST || '';
  const user = process.env.EMAIL_USER || process.env.SMTP_USER || '';
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS || '';
  const port = parseInt(process.env.EMAIL_PORT || process.env.SMTP_PORT, 10) || 587;
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || user || 'noreply@forge.local';
  return { host, user, pass, port, from };
}

function isSmtpConfigured() {
  const { host, user, pass } = getConfig();
  return !!(host && user && pass);
}

// ─── transporter init ────────────────────────────────────────────────────────

async function ensureTransporter() {
  if (_transporterPromise) return _transporterPromise;

  // Real SMTP credentials provided
  if (isSmtpConfigured()) {
    const { host, user, pass, port } = getConfig();
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    logger.info({ host, port, user }, '[EmailService] SMTP transport configured');
    _transporterPromise = Promise.resolve({ transport, testMode: false });
    return _transporterPromise;
  }

  // Development: spin up an Ethereal test account automatically
  if (process.env.NODE_ENV !== 'production') {
    _transporterPromise = nodemailer.createTestAccount().then((account) => {
      const transport = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: account.user, pass: account.pass },
      });
      logger.info({ user: account.user, inbox: 'https://ethereal.email/messages' }, '[EmailService] Dev mode — Ethereal test account ready');
      return { transport, testMode: true };
    }).catch((err) => {
      logger.error({ err: err.message }, '[EmailService] Failed to create Ethereal test account');
      return { transport: null, testMode: false };
    });
    return _transporterPromise;
  }

  // Production with no credentials
  _transporterPromise = Promise.resolve({ transport: null, testMode: false });
  return _transporterPromise;
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Send an email.
 *
 * @param {object}        opts
 * @param {string}        opts.to            Recipient email address
 * @param {string}        opts.subject       Email subject
 * @param {string}        opts.text          Plain-text body
 * @param {string}        [opts.html]        HTML body
 * @param {string}        [opts.from]        Override sender address
 * @param {Array<object>} [opts.attachments] Nodemailer attachment objects
 *   e.g. [{ filename: 'quote.pdf', content: <Buffer> }]
 * @returns {Promise<{success: boolean, messageId?: string, previewUrl?: string, error?: string}>}
 */
async function sendEmail({ to, subject, text, html, from, attachments }) {
  if (!isValidEmail(to)) {
    return { success: false, error: 'INVALID_RECIPIENT_EMAIL' };
  }

  const { transport, testMode } = await ensureTransporter();

  if (!transport) {
    logger.warn('[EmailService] No transport configured — email not sent');
    return { success: false, error: 'SMTP_NOT_CONFIGURED' };
  }

  const senderAddress = from || getConfig().from;

  const mailOptions = {
    from: senderAddress,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    ...(attachments && attachments.length ? { attachments } : {}),
  };

  const info = await transport.sendMail(mailOptions);

  const previewUrl = testMode ? nodemailer.getTestMessageUrl(info) : null;

  if (previewUrl) {
    logger.info({ to, subject, previewUrl }, '[EmailService] Test email delivered');
  } else {
    logger.info({ to, messageId: info.messageId }, '[EmailService] Email sent');
  }

  return { success: true, testMode: !!testMode, messageId: info.messageId, ...(previewUrl ? { previewUrl } : {}) };
}

module.exports = { sendEmail, isSmtpConfigured, isValidEmail };
