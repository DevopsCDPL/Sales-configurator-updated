'use strict';

require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const pinoHttp = require('pino-http');
const rateLimit = require('express-rate-limit');

const pdfRoutes = require('./routes/pdfRoutes');
const logger    = require('./utils/logger');

const app  = express();
const PORT = process.env.PORT || 3100;

// ── Security ─────────────────────────────────────────────────────────────
app.use(helmet());

// ── Logging ───────────────────────────────────────────────────────────────
app.use(pinoHttp({ logger }));

// ── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '4mb' }));

// ── Rate limiting (protect against abuse, not strict — internal service) ─
app.use(
  '/api/',
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ── Health probe ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'pdf-service' }));

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/pdf', pdfRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, message: 'Not found' }));

// ── Error handler ─────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error({ err: err.message, stack: err.stack }, '[pdf-service] unhandled error');
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal error' });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`[pdf-service] listening on port ${PORT}`);
});

module.exports = app;
