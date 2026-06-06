require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./utils/logger');
const { v4: uuidv4 } = require('uuid')

// Prevent unhandled errors from crashing the process before the server starts
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'UNCAUGHT EXCEPTION');
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'UNHANDLED REJECTION');
});

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse-proxy headers (Railway, nginx) so rate limiter sees real client IP.
app.set('trust proxy', 1);

// Security headers — helmet sets X-Frame-Options, X-Content-Type-Options,
// Strict-Transport-Security, Content-Security-Policy and ~12 other headers.
const helmet = require('helmet');
app.use(helmet());

// Gzip/Brotli compression — applied before routes so all responses are compressed.
const compression = require('compression');
app.use(compression());

// Structured request logging via pino-http
const pinoHttp = require('pino-http');
app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === '/health' },
  customLogLevel: (_req, res) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, remoteAddress: req.remoteAddress }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}));

// Global rate limiter — 200 requests per minute per IP across all /api routes.
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', apiLimiter);

// Heavy endpoint rate limiter — 10 requests per minute per IP.
// Covers: PDF generation, Excel export, document merge, production traveller.
// req.path inside app.use('/api', ...) is relative to /api, e.g. /invoices/123/pdf
const heavyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests for this operation, please try again later.' },
});
const HEAVY_ROUTE_RE = /\/(pdf|traveller|production-pdf|job-pdf|export-excel|merge)\/?$/i;
app.use('/api', (req, res, next) => {
  if (HEAVY_ROUTE_RE.test(req.path)) return heavyLimiter(req, res, next);
  next();
});

// Track database readiness for health check
let dbReady = false;
let startupError = null;

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://front-end-ph4.up.railway.app',
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map(o => o.trim()) : []),
];

// Phase 1E: Warn at startup if FRONTEND_URL is not configured — CORS will only allow localhost in production.
if (!process.env.FRONTEND_URL) {
  logger.warn('FRONTEND_URL env var is not set — CORS will only allow localhost in production');
}

// Auto-add Railway frontend URLs if on Railway and FRONTEND_URL not explicitly set
if (process.env.RAILWAY_ENVIRONMENT_NAME && !process.env.FRONTEND_URL) {
  // Scoped to Railway deployments only — still requires FRONTEND_URL in production
  allowedOrigins.push(/^https:\/\/frontend-.*\.up\.railway\.app$/i);
  logger.info('CORS: auto-enabled Railway frontend URL pattern (set FRONTEND_URL to lock this down)');
}

// Always allow the production custom domains for the deployed tenants. Adding
// these in code (in addition to FRONTEND_URL) prevents a misconfigured env var
// from silently breaking every browser API call.
allowedOrigins.push(
  'https://forgehalima.com',
  'https://www.forgehalima.com',
  /^https:\/\/[a-z0-9-]+\.forgehalima\.com$/i,
);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    // Phase 1E: Removed standalone isRailwayFrontend wildcard — Railway origins are
    // handled by the allowedOrigins regex push above (only when FRONTEND_URL is unset).
    const isCodespacesOrigin = /https:\/\/[a-z0-9-]+\.app\.github\.dev$/i.test(origin);
    const isAllowed = allowedOrigins.some(allowed =>
      typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
    );

    if (isAllowed || isCodespacesOrigin) {
      return callback(null, true);
    }
    logger.warn({ origin }, 'CORS blocked origin');
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type', 'X-Merge-Skipped', 'X-Merge-Count', 'X-Merge-Pages'],
}));
// Phase 1E: Enforce body size limit to prevent DoS via oversized payloads
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Phase 8A: Parse cookies for refresh token handling
const cookieParser = require('cookie-parser');
app.use(cookieParser());


// Static files for uploads — R2-aware: tries local disk first, then Cloudflare R2
const r2 = require('./services/r2StorageService');
const fsSync = require('fs');
const jwt = require('jsonwebtoken');

// Helper: lightweight JWT check for /uploads — decodes token and attaches user info to req
function uploadsAuth(req, res, next) {
  // Logo paths are non-sensitive — allow without auth (used in <img> tags)
  if (req.path.startsWith('/logo/') || req.path.startsWith('/logos/')) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    req.uploadsUser = decoded; // Attach decoded JWT payload for tenant checks
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

app.use('/uploads', uploadsAuth, async (req, res) => {
  // Security: prevent path traversal
  if (req.path.includes('..')) {
    return res.status(400).json({ success: false, message: 'Invalid path' });
  }

  const isLogo = req.path.startsWith('/logo/') || req.path.startsWith('/logos/');

  // ── Tenant isolation: verify file belongs to requesting user's company ──
  if (!isLogo && req.uploadsUser) {
    const user = req.uploadsUser;
    const isPlatformAdmin = user.role === 'platform_admin';

    if (!isPlatformAdmin && user.company_id) {
      try {
        // Try to match Document by file_path (various stored formats)
        const cleanReqPath = req.path.replace(/^\//, ''); // "documents/xxx.pdf"
        const { Document } = require('./models');
        const { Op } = require('sequelize');

        const doc = await Document.findOne({
          where: {
            [Op.or]: [
              { file_path: cleanReqPath },
              { file_path: `/uploads/${cleanReqPath}` },
              { file_path: `uploads/${cleanReqPath}` },
              { file_path: req.path },
            ],
          },
          attributes: ['id', 'company_id'],
        });

        // Fail-closed — deny access to any file not registered in Document table.
        if (!doc) {
          logger.warn({ userId: user.id, companyId: user.company_id, path: cleanReqPath }, 'uploads: denied — unregistered file');
          return res.status(403).json({ success: false, message: 'Access denied' });
        }

        // Deny cross-company access (explicit tenant violation)
        if (doc.company_id && doc.company_id !== user.company_id) {
          logger.warn({ userId: user.id, companyId: user.company_id, docId: doc.id, docCompanyId: doc.company_id }, 'uploads: denied — tenant violation');
          return res.status(403).json({ success: false, message: 'Access denied' });
        }

        logger.info({ userId: user.id, companyId: user.company_id, docId: doc.id, path: cleanReqPath }, 'uploads: access granted');
      } catch (err) {
        logger.warn({ err: err.message }, 'uploads: tenant check failed, denying as precaution');
        return res.status(503).json({ success: false, message: 'File service temporarily unavailable' });
      }
    }
  }

  // ── Phase B: serve via R2 presigned URL → 302 redirect (no buffering through Node) ──
  if (r2.isConfigured) {
    try {
      const key = req.path.replace(/^\//, '');
      const signedUrl = await r2.getPresignedUrl(key, 60);
      return res.redirect(302, signedUrl);
    } catch (err) {
      logger.error({ err: err.message }, 'uploads: R2 presigned URL generation failed');
      return res.status(404).json({ success: false, message: 'File not found' });
    }
  }

  // ── Local disk fallback (development / R2 not configured) ──
  const uploadsDir = path.join(__dirname, '../uploads');
  const localPath = path.resolve(path.join(uploadsDir, req.path));
  if (!localPath.startsWith(path.resolve(uploadsDir))) {
    return res.status(400).json({ success: false, message: 'Invalid path' });
  }
  if (fsSync.existsSync(localPath) && fsSync.statSync(localPath).isFile()) {
    return res.sendFile(localPath);
  }

  return res.status(404).json({ success: false, message: 'File not found' });
});

// Load models and routes defensively — if either fails, server still responds to healthchecks
let sequelize;
let modelsLoaded = false;
let routesLoaded = false;
let Carrier;

// Step 1: Load models
try {
  const models = require('./models');
  sequelize = models.sequelize;
  Carrier = models.Carrier;
  modelsLoaded = true;
  logger.info('Models loaded successfully.');
} catch (err) {
  startupError = `Models failed: ${err.message}`;
  logger.fatal({ err }, 'FATAL: Failed to load models');
}

// Step 2: Load routes (only if models loaded, since routes depend on models)
if (modelsLoaded) {
  try {
    const routes = require('./routes');
    app.use('/api', routes);
    // Phase 1C: Removed root-level app.use(routes) double-mount.
    // All frontend calls use baseURL '/api' — root mount is not needed
    // and allowed middleware bypass via non-/api paths.
    routesLoaded = true;
    logger.info('Routes loaded successfully.');
  } catch (err) {
    startupError = `Routes failed: ${err.message}`;
    logger.fatal({ err }, 'FATAL: Failed to load routes');
  }
}

// Fallback: if routes didn't load, register a catch-all handler with useful error
if (!routesLoaded) {
  const startupHandler = (req, res) => {
    res.status(503).json({
      success: false,
      message: 'API is starting up. Please retry in a moment.',
      startupError: startupError || 'Routes not yet loaded',
    });
  };
  app.use('/api', startupHandler);
  app.use('/auth', startupHandler);
}

// Health check — public, returns minimal status only.
// No query-param admin operations. All admin ops require authentication
// and are routed through POST /api/platform-admin/ops/*.
app.get('/health', (req, res) => {
  res.status(200).json({ status: (dbReady && !startupError) ? 'ok' : 'degraded' });
});

// ── RLS / DB Role Health Check (platform_admin only) ──────────────────────
// GET /api/health/db-role
//
// Returns the actual PostgreSQL role the connection pool is using and the
// current app.company_id session setting. Use this after every deploy to
// confirm RLS is live without digging through logs.
//
// Protected: requires a valid JWT with role = platform_admin.
// Example curl:
//   curl -H "Authorization: Bearer <token>" https://your-api/api/health/db-role
app.get('/api/health/db-role', async (req, res) => {
  // ── Auth: require valid JWT + platform_admin role ───────────────────────
  // We inline the auth check here rather than using the middleware chain
  // because this endpoint is registered before routes load, and the route
  // loader may fail. This keeps the diagnostic endpoint always reachable.
  let authedUser;
  try {
    const jwt = require('jsonwebtoken');
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // JWT payload uses { userId } — look up user to get actual role
    const userId = decoded.userId || decoded.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Invalid token payload.' });
    }
    const [userRows] = await sequelize.query(
      'SELECT id, role FROM users WHERE id = :userId LIMIT 1',
      { replacements: { userId }, type: 'SELECT' }
    );
    authedUser = userRows?.[0] || userRows;
    if (!authedUser || authedUser.role !== 'platform_admin') {
      return res.status(403).json({ success: false, message: 'Platform admin access required.' });
    }
  } catch (authErr) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }

  if (!dbReady || !sequelize) {
    return res.status(503).json({ success: false, message: 'Database not ready yet.' });
  }

  try {
    const { isRlsActive } = require('./models');

    // Query the live pool: confirms the actual role in use on a real connection.
    // QueryTypes.SELECT returns just the rows array (not [rows, metadata]).
    const rows = await sequelize.query(
      `SELECT current_user,
              current_setting('app.company_id', TRUE) AS app_company_id`,
      { type: sequelize.QueryTypes.SELECT, raw: true }
    );
    const row = Array.isArray(rows) ? rows[0] : null;

    const currentUser = row?.current_user ?? 'unknown';
    const appCompanyId = row?.app_company_id ?? '';
    const rlsFlagActive = isRlsActive();
    const rlsEnforced = currentUser === 'forged_app';

    return res.status(200).json({
      success: true,
      rls_enforced: rlsEnforced,
      rls_flag_active: rlsFlagActive,
      db_current_user: currentUser,
      app_company_id_setting: appCompanyId || '(empty — platform admin scope)',
      status: rlsEnforced
        ? 'PASS: RLS is active. DB role is forged_app.'
        : `FAIL: DB role is '${currentUser}'. RLS is NOT enforced. Expected 'forged_app'.`,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({ err }, 'Unhandled request error');
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// --- Start HTTP server immediately so Railway healthcheck passes ---
// DEPLOYMENT REBUILD TRIGGER - v20260414-0700
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server listening');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.fatal({ port: PORT }, 'Port already in use — run: npm run stop');
  } else {
    logger.fatal({ err }, 'Server error');
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { server.close(() => process.exit(0)); });

const CARRIERS = [
  'UPS (United Parcel Service)',
  'FedEx',
  'DHL Express',
  'USPS (United States Postal Service)',
  'Canada Post',
  'Purolator',
  'OnTrac',
  'LaserShip',
  'Amazon Logistics',
  'XPO Logistics',
  'Old Dominion Freight Line',
  'Estes Express Lines',
  'Saia LTL Freight',
  'R+L Carriers',
  'YRC Freight',
  'N/A',
];

// const ensureCarriersTable = async () => {
//   try {
//     // Sync the Carrier model (creates the table if it doesn't exist)
//     await Carrier.sync();

//     // Insert carriers if they do not already exist
//     for (const carrier of CARRIERS) {
//       await Carrier.findOrCreate({
//         where: { carrier },
//         defaults: { id: uuidv4(), carrier },
//       });
//     }

//     logger.info('Carriers table ensured and carriers added.');
//   } catch (error) {
//     logger.error('Failed to ensure carriers table:', error.message);
//   }
// };

const ensureCarriersTable = async () => {
  try {
    // Ensure the carriers table exists
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS carriers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        carrier VARCHAR(255) NOT NULL UNIQUE
      );
    `);

    // Insert carriers if they do not already exist
    for (const carrier of CARRIERS) {
      await sequelize.query(`
        INSERT INTO carriers (id, carrier)
        VALUES (:id, :carrier)
        ON CONFLICT (carrier) DO NOTHING;
      `, {
        replacements: { id: uuidv4(), carrier },
      });
    }

    logger.info('Carriers table ensured and carriers added.');
  } catch (error) {
    logger.error({ err: error.message }, 'Failed to ensure carriers table');
  }
};

// --- Database initialization (runs after server is already listening) ---
const initDatabase = async (retries = 3) => {
  if (!sequelize) {
    logger.error('Database initialization skipped: models failed to load.');
    return;
  }
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully.');

    // ensure the carriers table
    await ensureCarriersTable();

    // ------ Pre-sync: ensure critical columns exist immediately ------------------------------------------------
    // The User model references custom_role_id (via association), so any
    // User query will fail if the column is absent. Adding it via fast raw
    // SQL before the slow sync({ alter: true }) prevents race conditions.
    try {
      // Ensure custom_roles table exists (needed for the FK)
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS custom_roles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL,
          description TEXT,
          company_id UUID,
          is_system BOOLEAN DEFAULT false,
          base_role VARCHAR(20) DEFAULT 'user',
          permissions JSONB DEFAULT '{}',
          conditions JSONB DEFAULT '[]',
          color VARCHAR(7) DEFAULT '#6b7280',
          icon VARCHAR(50),
          priority INTEGER DEFAULT 0,
          created_by UUID,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      // Ensure custom_role_id column exists on users
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE users ADD COLUMN custom_role_id UUID
            REFERENCES custom_roles(id) ON DELETE SET NULL;
        EXCEPTION
          WHEN duplicate_column THEN NULL;
        END $$;
      `);
      logger.info('Pre-sync: custom_role_id column ensured.');
      // Phase 7B: OTP columns for 2FA login
      await sequelize.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(64);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_attempts INTEGER DEFAULT 0;
      `);
      logger.info('Pre-sync: OTP columns ensured.');
      // Password reset token columns (used by /api/password/forgot-password flow)
      await sequelize.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(128);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;
      `);
      logger.info('Pre-sync: reset_token columns ensured.');
      // Phase 8A: Refresh token hash on sessions
      await sequelize.query(`
        ALTER TABLE sessions ADD COLUMN IF NOT EXISTS refresh_token_hash VARCHAR(64);
      `);
      logger.info('Pre-sync: refresh_token_hash column ensured.');
      // Phase 8B: Replace global unique(path) on file_manager_folders with two
      // partial indexes so different companies can have same-named project folders.
      await sequelize.query(`
        ALTER TABLE file_manager_folders DROP CONSTRAINT IF EXISTS file_manager_folders_path_key;
        DROP INDEX IF EXISTS file_manager_folders_path_key;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_fmf_path_root
          ON file_manager_folders (path) WHERE company_id IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_fmf_path_company
          ON file_manager_folders (path, company_id) WHERE company_id IS NOT NULL;
      `);
      logger.info('Pre-sync: file_manager_folders path indexes updated.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync column check');
    }

    // Ensure soft-delete columns exist on all relevant tables (added by recycle bin feature)
    try {
      const softDeleteTables = ['users', 'clients', 'vendors', 'companies', 'projects'];
      for (const table of softDeleteTables) {
        await sequelize.query(`
          DO $$ BEGIN
            ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
          EXCEPTION WHEN duplicate_column THEN NULL; END $$;
        `);
        await sequelize.query(`
          DO $$ BEGIN
            ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deleted_by UUID DEFAULT NULL;
          EXCEPTION WHEN duplicate_column THEN NULL; END $$;
        `);
      }
      logger.info('Pre-sync: soft-delete columns ensured on all tables.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync soft-delete columns');
    }

    // Pre-sync (CRITICAL): ensure WorkOrder.production_traveler_number column
    // exists BEFORE any project query can run. The Project model defines a
    // `hasOne(WorkOrder, as: 'workOrder')` association and the WorkOrder
    // model declares this column, so Sequelize selects it on every project
    // fetch. If the column is missing in the live DB, GET /api/projects/:id
    // fails with: column "workOrder.production_traveler_number" does not exist.
    try {
      await sequelize.query(`
        ALTER TABLE work_orders
          ADD COLUMN IF NOT EXISTS production_traveler_number VARCHAR(50);
      `);
      // Drop legacy global unique index — replaced by per-company composite index below.
      await sequelize.query(`DROP INDEX IF EXISTS uq_work_orders_production_traveler_number;`);
      logger.info('Pre-sync: work_orders.production_traveler_number column ensured.');
    } catch (e) {
      logger.error({ err: e.message }, 'Pre-sync work_orders.production_traveler_number FAILED');
    }

    // Pre-sync: ensure company_id column exists on all multi-tenant tables
    try {
      const companyIdTables = [
        'sales_orders', 'work_orders', 'projects', 'estimates', 'estimate_items',
        'clients', 'vendors', 'documents', 'invoices', 'quality_records',
        'audit_logs', 'parts', 'part_dimensions', 'part_templates',
        'materials', 'material_transactions', 'material_stocks', 'raw_materials', 'stocks',
        'file_manager_folders', 'conversations', 'login_histories',
        'project_analytics', 'rfq_bundles', 'procurement_rfqs', 'procurement_pos',
        'mgmt_procurement_rfqs', 'mgmt_procurement_pos',
        'activity_timelines', 'approval_workflows', 'api_tokens',
        'custom_roles', 'permission_templates', 'webhooks',
      ];
      for (const tbl of companyIdTables) {
        try {
          await sequelize.query(`
            DO $$ BEGIN
              ALTER TABLE "${tbl}" ADD COLUMN company_id UUID DEFAULT NULL;
            EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
            END $$;
          `);
        } catch (_) { /* table may not exist yet — sync will create it */ }
      }
      logger.info('Pre-sync: company_id column ensured on all tenant tables.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync company_id columns');
    }

    // Pre-sync: ensure Parts Master new columns exist
    try {
      const partsCols = [
        { col: 'part_id_seq', def: 'VARCHAR(20)' },
        { col: 'material_category', def: 'VARCHAR(50)' },
        { col: 'weight_per_piece', def: 'FLOAT' },
        { col: 'total_weight', def: 'FLOAT' },
        { col: 'weight_unit', def: "VARCHAR(10) DEFAULT 'Kg'" },
        { col: 'cost_rate', def: 'FLOAT DEFAULT 0' },
        { col: 'cost_per_piece', def: 'FLOAT DEFAULT 0' },
      ];
      for (const { col, def } of partsCols) {
        await sequelize.query(`
          DO $$ BEGIN
            ALTER TABLE parts ADD COLUMN ${col} ${def};
          EXCEPTION WHEN duplicate_column THEN NULL;
          END $$;
        `);
      }
      await sequelize.query(`CREATE SEQUENCE IF NOT EXISTS parts_id_seq START WITH 1 INCREMENT BY 1;`);
      logger.info('Pre-sync: Parts Master columns ensured.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync Parts Master columns');
    }

    // Pre-sync: ensure MgmtProcurementRFQ line_items column exists
    try {
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE mgmt_procurement_rfqs ADD COLUMN line_items JSONB DEFAULT NULL;
        EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);
      logger.info('Pre-sync: MgmtProcurementRFQ line_items column ensured.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync MgmtProcurementRFQ line_items');
    }

    // Pre-sync: ensure MgmtProcurementPO new columns exist
    try {
      const poCols = [
        { col: 'cost_mode', def: "VARCHAR(20) DEFAULT 'unit'" },
        { col: 'unit_cost', def: 'DECIMAL(14,2) DEFAULT 0' },
        { col: 'cost_per_weight', def: 'DECIMAL(14,2) DEFAULT 0' },
        { col: 'weight_unit', def: "VARCHAR(10) DEFAULT 'KG'" },
        { col: 'line_total', def: 'DECIMAL(14,2) DEFAULT 0' },
        { col: 'terms_conditions', def: 'TEXT' },
        { col: 'condition', def: 'VARCHAR(200)' },
        { col: 'form', def: 'VARCHAR(50)' },
        { col: 'shape', def: 'VARCHAR(50)' },
        { col: 'dimensions', def: "JSONB DEFAULT '{}'" },
        { col: 'line_items', def: 'JSONB DEFAULT NULL' },
      ];
      for (const { col, def } of poCols) {
        await sequelize.query(`
          DO $$ BEGIN
            ALTER TABLE mgmt_procurement_pos ADD COLUMN ${col} ${def};
          EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
          END $$;
        `);
      }
      logger.info('Pre-sync: MgmtProcurementPO columns ensured.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync MgmtProcurementPO columns');
    }

    // Pre-sync: fix duplicate UNIQUE constraints that conflict with sync({ alter: true })
    try {
      // Drop duplicate unique index on raw_materials.material_id (migration created both constraint + index)
      await sequelize.query(`DROP INDEX IF EXISTS raw_materials_material_id_idx;`);
      // Drop the GLOBAL unique constraint — material_id must be unique PER COMPANY only.
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE raw_materials DROP CONSTRAINT IF EXISTS raw_materials_material_id_key;
        EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);
      // Same for parts.part_id_seq — drop global unique; per-company composite added below.
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE parts DROP CONSTRAINT IF EXISTS parts_part_id_seq_key;
        EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);
      await sequelize.query(`DROP INDEX IF EXISTS parts_part_id_seq_key;`);
      logger.info('Pre-sync: duplicate UNIQUE constraints cleaned up.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync UNIQUE cleanup');
    }

    // Pre-sync: make documents.project_id and documents.company_id nullable
    // Part Master, Inventory, and Procurement uploads have no project_id.
    // company_id should also be nullable for system-generated docs.
    try {
      await sequelize.query(`ALTER TABLE documents ALTER COLUMN project_id DROP NOT NULL;`);
      await sequelize.query(`ALTER TABLE documents ALTER COLUMN company_id DROP NOT NULL;`);
      logger.info('Pre-sync: documents.project_id & company_id made nullable.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync documents nullable fix');
    }

    // Pre-sync: add missing invoices columns and fix unique constraint to be per-company
    try {
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);
          ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
          ALTER TABLE invoices ADD COLUMN IF NOT EXISTS terms_conditions TEXT;
        EXCEPTION WHEN undefined_table THEN NULL;
        END $$;
      `);
      // Drop global unique constraint on invoice_number (prevents multi-tenant use)
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
          ALTER TABLE invoices DROP CONSTRAINT IF EXISTS "invoices_invoice_number_key";
          DROP INDEX IF EXISTS invoices_invoice_number_key;
        EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);
      // Add per-company unique index so each company has independent invoice numbering
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_company_unique
          ON invoices (invoice_number, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid));
      `);
      logger.info('Pre-sync: invoices columns and unique constraint fixed.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync invoices fix');
    }

    // Pre-sync: convert all per-company-generated ID columns from GLOBAL unique to
    // PER-COMPANY unique. Document numbering is scoped per company_id, so two
    // companies will both generate the same MSTK-0001 / MAT-00001 / PRJ-001 / etc.
    // Without this fix, only the first company can use the system; every other
    // company hits a unique-constraint violation on insert.
    //
    // Pattern: drop global unique constraint/index, then create a composite unique
    // index on (id_field, COALESCE(company_id, sentinel-uuid)) so:
    //   - Two rows in the SAME company can never share the same id
    //   - Two rows in DIFFERENT companies CAN share the same id
    //   - Two NULL-company rows still collide (legacy / platform-admin rows)
    try {
      const perCompanyUnique = [
        // [tableName, idColumn, indexName]
        ['stocks',                 'stock_id',           'stocks_stock_id_company_unique'],
        ['raw_materials',          'material_id',        'raw_materials_material_id_company_unique'],
        ['parts',                  'part_id_seq',        'parts_part_id_seq_company_unique'],
        ['mgmt_procurement_pos',   'po_number',          'mgmt_pos_number_company_unique'],
        ['mgmt_procurement_rfqs',  'rfq_number',         'mgmt_rfqs_number_company_unique'],
        ['procurement_pos',        'po_number',          'procurement_pos_number_company_unique'],
        ['procurement_rfq',        'rfq_number',         'procurement_rfq_number_company_unique'],
        ['vendor_purchase_orders', 'po_number',          'vendor_pos_number_company_unique'],
        ['sales_orders',           'sales_order_number',         'sales_orders_number_company_unique'],
        ['work_orders',            'work_order_number',          'work_orders_number_company_unique'],
        ['work_orders',            'production_traveler_number', 'work_orders_pt_number_company_unique'],
        ['projects',               'project_number',             'projects_project_number_company_unique'],
        ['projects',               'quotation_number',   'projects_quotation_number_company_unique'],
      ];

      for (const [table, col, idxName] of perCompanyUnique) {
        try {
          // Skip silently if the table doesn't exist in this DB (older deploys / partial schema)
          const [exists] = await sequelize.query(
            `SELECT to_regclass(:t) AS reg`,
            { replacements: { t: table } }
          );
          if (!exists?.[0]?.reg) continue;

          // 1. Drop the standard PG unique constraint (default name: <table>_<col>_key)
          await sequelize.query(`
            DO $$ BEGIN
              ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_${col}_key";
            EXCEPTION WHEN undefined_object THEN NULL; WHEN undefined_table THEN NULL;
            END $$;
          `);
          // 2. Drop any plain unique index variants (Sequelize sync may create these)
          await sequelize.query(`DROP INDEX IF EXISTS "${table}_${col}_key";`);
          await sequelize.query(`DROP INDEX IF EXISTS "${table}_${col}";`);
          await sequelize.query(`DROP INDEX IF EXISTS "${table}_${col}_unique";`);
          // 3. Drop legacy custom names from earlier migrations
          if (table === 'stocks' && col === 'stock_id') {
            await sequelize.query(`DROP INDEX IF EXISTS idx_stocks_stock_id;`);
          }
          if (table === 'raw_materials' && col === 'material_id') {
            await sequelize.query(`DROP INDEX IF EXISTS raw_materials_material_id_idx;`);
          }
          // 4. Create the per-company composite unique index (NULL-safe via COALESCE)
          await sequelize.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "${idxName}"
              ON "${table}" ("${col}", COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
              WHERE "${col}" IS NOT NULL;
          `);
        } catch (innerErr) {
          logger.warn({ table, col, err: innerErr.message }, 'Pre-sync per-company unique fix (table)');
        }
      }
      logger.info('Pre-sync: per-company unique indexes ensured for document-numbered tables.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync per-company unique fix');
    }

    // Pre-sync: for soft-deletable numbered tables, REPLACE the non-partial unique
    // index with a partial one that excludes soft-deleted rows. This lets a deleted
    // PO/RFQ/SO/WO/Invoice/Project number be reused on the next create. Without
    // this, deleting a record permanently consumes its number — a mismatch with
    // the user-facing "Recycle Bin" semantics.
    try {
      const partialUniqueOnLive = [
        // [tableName, idColumn, indexName]
        ['mgmt_procurement_pos',   'po_number',          'mgmt_pos_number_company_unique_live'],
        ['mgmt_procurement_rfqs',  'rfq_number',         'mgmt_rfqs_number_company_unique_live'],
        ['procurement_pos',        'po_number',          'procurement_pos_number_company_unique_live'],
        ['procurement_rfq',        'rfq_number',         'procurement_rfq_number_company_unique_live'],
        ['vendor_purchase_orders', 'po_number',          'vendor_pos_number_company_unique_live'],
        ['sales_orders',           'sales_order_number', 'sales_orders_number_company_unique_live'],
        ['work_orders',            'work_order_number',  'work_orders_number_company_unique_live'],
        ['work_orders',            'production_traveler_number', 'work_orders_pt_number_company_unique_live'],
        ['projects',               'project_number',     'projects_project_number_company_unique_live'],
        ['projects',               'quotation_number',   'projects_quotation_number_company_unique_live'],
        ['invoices',               'invoice_number',     'invoices_number_company_unique_live'],
      ];
      for (const [table, col, idxName] of partialUniqueOnLive) {
        try {
          const [exists] = await sequelize.query(
            `SELECT to_regclass(:t) AS reg`,
            { replacements: { t: table } }
          );
          if (!exists?.[0]?.reg) continue;

          // Detect whether the table actually has a deleted_at column
          const [hasDel] = await sequelize.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_name = :t AND column_name = 'deleted_at'`,
            { replacements: { t: table } }
          );
          if (!hasDel || hasDel.length === 0) continue;

          // ── Discover and drop EVERY unique constraint that references this single column ──
          // This is name-agnostic: it queries pg_constraint for any UNIQUE constraint
          // whose key columns are exactly [col]. Catches the original migration's
          // `unique: true` (default name `<table>_<col>_key`), any Sequelize-generated
          // variants, and any custom-named single-column unique constraint.
          const [singleColConstraints] = await sequelize.query(`
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE rel.relname = :t
              AND con.contype = 'u'
              AND nsp.nspname = ANY (current_schemas(false))
              AND ARRAY(
                SELECT a.attname
                FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
                ORDER BY k.ord
              ) = ARRAY[:c]::name[]
          `, { replacements: { t: table, c: col } });
          for (const row of singleColConstraints || []) {
            try {
              await sequelize.query(`ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${row.conname}";`);
              logger.info({ table, col, dropped: row.conname }, 'Pre-sync: dropped global unique constraint');
            } catch (e) {
              logger.warn({ table, col, conname: row.conname, err: e.message }, 'Pre-sync: failed to drop constraint');
            }
          }

          // Also discover and drop any single-column UNIQUE INDEX (created independently of a constraint)
          const [singleColIndexes] = await sequelize.query(`
            SELECT i.relname AS indexname
            FROM pg_index x
            JOIN pg_class i ON i.oid = x.indexrelid
            JOIN pg_class t ON t.oid = x.indrelid
            WHERE t.relname = :t
              AND x.indisunique = true
              AND x.indpred IS NULL
              AND ARRAY(
                SELECT a.attname
                FROM unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
                ORDER BY k.ord
              ) = ARRAY[:c]::name[]
          `, { replacements: { t: table, c: col } });
          for (const row of singleColIndexes || []) {
            try {
              await sequelize.query(`DROP INDEX IF EXISTS "${row.indexname}";`);
              logger.info({ table, col, dropped: row.indexname }, 'Pre-sync: dropped global unique index');
            } catch (e) {
              logger.warn({ table, col, indexname: row.indexname, err: e.message }, 'Pre-sync: failed to drop index');
            }
          }

          // Also drop the prior non-partial composite index we created in earlier runs
          // (so the partial one is the single source of truth).
          await sequelize.query(`DROP INDEX IF EXISTS "${idxName.replace(/_live$/, '')}";`);

          // Create the new partial unique index that ignores soft-deleted rows
          // and is scoped per-company (NULL-safe via COALESCE sentinel).
          await sequelize.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "${idxName}"
              ON "${table}" ("${col}", COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
              WHERE "${col}" IS NOT NULL AND deleted_at IS NULL;
          `);

          // Diagnostic: log every unique index that remains on this column.
          try {
            const [idxRows] = await sequelize.query(
              `SELECT indexname, indexdef FROM pg_indexes
               WHERE tablename = :t AND indexdef ILIKE '%${col}%' AND indexdef ILIKE '%UNIQUE%'`,
              { replacements: { t: table } }
            );
            logger.info({ table, col, indexes: idxRows }, 'Pre-sync: unique indexes on column after fix');
          } catch (_) { /* ignore diagnostic failure */ }
        } catch (innerErr) {
          logger.warn({ table, col, err: innerErr.message }, 'Pre-sync partial-unique-on-live (table)');
        }
      }
      logger.info('Pre-sync: partial unique indexes ensured for soft-deletable numbered tables (number reuse on delete).');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync partial-unique-on-live');
    }

    // Migrate 'sales' role to 'user' in enums before sync
    try {
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'user';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TYPE "enum_permissions_role" ADD VALUE IF NOT EXISTS 'user';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
      `);
      await sequelize.query(`UPDATE users SET role = 'user' WHERE role = 'sales'`);
      await sequelize.query(`UPDATE permissions SET role = 'user' WHERE role = 'sales'`);
      logger.info('Role migration (sales → user) applied.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Role migration skipped');
    }

    // Pre-sync: ensure file_manager_folders table exists
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS file_manager_folders (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL,
          slug VARCHAR(100) NOT NULL,
          parent_id UUID,
          folder_type VARCHAR(50) NOT NULL DEFAULT 'category',
          module_type VARCHAR(50),
          project_id UUID,
          part_id UUID,
          reference_id UUID,
          company_id UUID,
          path VARCHAR(500) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      // Ensure unique index on path
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS file_manager_folders_path_unique ON file_manager_folders (path);
      `);
      // Ensure documents table has folder_id, module_type, reference_id, company_id, file_type columns
      const docCols = [
        { col: 'folder_id', def: 'UUID' },
        { col: 'module_type', def: 'VARCHAR(50)' },
        { col: 'reference_id', def: 'UUID' },
        { col: 'company_id', def: 'UUID' },
        { col: 'file_type', def: "VARCHAR(20) DEFAULT 'generated'" },
        { col: 'uploaded_by', def: 'UUID' },
      ];
      for (const { col, def } of docCols) {
        await sequelize.query(`
          DO $$ BEGIN
            ALTER TABLE documents ADD COLUMN ${col} ${def};
          EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
          END $$;
        `);
      }
      logger.info('Pre-sync: file_manager_folders table and documents columns ensured.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync file_manager_folders');
    }

    // Pre-sync: ensure companies table has website, tax_id, logo_data columns
    try {
      const companyCols = {
        'website': 'VARCHAR(255)',
        'tax_id': 'VARCHAR(100)',
        'logo_data': 'TEXT',
        'logo_url': 'TEXT',
      };
      for (const [col, def] of Object.entries(companyCols)) {
        await sequelize.query(`
          DO $$ BEGIN
            ALTER TABLE companies ADD COLUMN ${col} ${def};
          EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
          END $$;
        `);
      }
      logger.info('Pre-sync: companies columns (website, tax_id, logo_data, logo_url) ensured.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync companies columns');
    }

    // Pre-sync: ensure system_module_config has company_id column
    try {
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE system_module_config ADD COLUMN company_id UUID;
        EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);
      logger.info('Pre-sync: system_module_config.company_id ensured.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync system_module_config');
    }

    // Pre-sync: ensure documents table has r2_url column
    try {
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE documents ADD COLUMN r2_url VARCHAR(500);
        EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);
      logger.info('Pre-sync: documents.r2_url column ensured.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync documents.r2_url');
    }

    // Pre-sync: ensure documents table has part_id and workflow_stage columns
    try {
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE documents ADD COLUMN part_id UUID;
        EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE documents ADD COLUMN workflow_stage VARCHAR(100);
        EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);
      logger.info('Pre-sync: documents.part_id & workflow_stage columns ensured.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync documents.part_id/workflow_stage');
    }

    // Pre-sync: ensure projects table has project_number column
    try {
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE projects ADD COLUMN project_number VARCHAR(100);
        EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);
      logger.info('Pre-sync: projects.project_number column ensured.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync projects.project_number');
    }

    // Pre-sync: ensure settings table has id (UUID PK) and company_id columns.
    // Migration 20260418100000 changed the PK from `key` (VARCHAR) → `id` (UUID)
    // and added `company_id`. This block makes that change idempotent so existing
    // Railway deployments self-heal on the next restart without a manual migration run.
    try {
      // 1. Ensure uuid-ossp extension is available
      await sequelize.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

      // 2. Add id column if missing
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE settings ADD COLUMN id UUID NOT NULL DEFAULT uuid_generate_v4();
        EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);

      // 3. Add company_id column if missing
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE settings ADD COLUMN company_id UUID;
        EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);

      // 4. Add created_at / updated_at columns if missing (Sequelize timestamps)
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE settings ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
        EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE settings ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
        EXCEPTION WHEN duplicate_column THEN NULL; WHEN undefined_table THEN NULL;
        END $$;
      `);

      // 5. Migrate existing key:UUID rows → (key=baseKey, company_id=UUID)
      await sequelize.query(`
        UPDATE settings
        SET company_id = split_part(key, ':', 2)::uuid,
            key        = split_part(key, ':', 1)
        WHERE key LIKE '%:%'
          AND split_part(key, ':', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      `);

      // 6. Swap PK from key → id (only when the PK is still the old key-based one)
      await sequelize.query(`
        DO $$
        DECLARE pk_cols text;
        BEGIN
          SELECT string_agg(a.attname, ',' ORDER BY a.attnum)
          INTO pk_cols
          FROM pg_index i
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = 'settings'::regclass AND i.indisprimary;

          IF pk_cols = 'key' THEN
            EXECUTE 'ALTER TABLE settings DROP CONSTRAINT settings_pkey';
            EXECUTE 'ALTER TABLE settings ADD PRIMARY KEY (id)';
          ELSIF pk_cols IS NULL THEN
            -- No PK yet (fresh alter); add it
            EXECUTE 'ALTER TABLE settings ADD PRIMARY KEY (id)';
          END IF;
        END $$;
      `);

      // 7. Ensure partial unique indexes for correct scoping
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS settings_key_global_unique
          ON settings (key) WHERE company_id IS NULL;
      `);
      await sequelize.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS settings_key_company_unique
          ON settings (key, company_id) WHERE company_id IS NOT NULL;
      `);

      logger.info('Pre-sync: settings table schema (id PK, company_id) ensured.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Pre-sync settings table schema');
    }

    // Sync models — schema DDL is managed exclusively by Sequelize migrations in production.
    // sync({ alter: true }) is disabled in production because it can silently drop columns,
    // recreate constraints, and cause data loss. Use `npm run migrate` / Sequelize CLI instead.
    if (process.env.NODE_ENV !== 'production') {
      logger.info('Starting sequelize.sync({ alter: true }) [non-production only]...');
      try {
        await sequelize.sync({ alter: true });
        logger.info('Database models synchronized.');
      } catch (syncErr) {
        logger.error({ err: syncErr.message }, 'sync({ alter: true }) FAILED');
        logger.warn('Attempting sync({ alter: false }) as fallback...');
        try {
          await sequelize.sync({ alter: false });
          logger.info('Database models synchronized (no-alter fallback).');
        } catch (syncErr2) {
          logger.error({ err: syncErr2.message }, 'sync fallback also failed');
        }
      }
    } else {
      // Production: verify DB connection only — schema must be managed via migrations.
      await sequelize.authenticate();
      logger.info('Database connection verified (production — sync skipped, use migrations).');
    }

    // ------ Post-sync: fix company admin roles (admin → main_admin) --------------------------------
    try {
      const [result] = await sequelize.query(`
        UPDATE "Users"
        SET role = 'main_admin'
        WHERE role = 'admin'
          AND company_id IS NOT NULL
          AND id IN (
            SELECT MIN(id::text)::uuid FROM "Users"
            WHERE role = 'admin' AND company_id IS NOT NULL
            GROUP BY company_id
          )
      `);
      logger.info('Post-sync: company admin roles fixed to main_admin.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Post-sync admin role fix');
    }

    // ------ Post-sync: ensure platform_admin users have full modules & permissions --------------------------------
    try {
      const allModules = JSON.stringify(['Quotation', 'Work Order', 'Production', 'Quality', 'Logistics', 'Settings', 'Business Analytics']);
      const fullPerms = JSON.stringify({
        Quotation:            { read: true, write: true, admin: true },
        'Work Order':         { read: true, write: true, admin: true },
        Production:           { read: true, write: true, admin: true },
        Quality:              { read: true, write: true, admin: true },
        Logistics:            { read: true, write: true, admin: true },
        Settings:             { read: true, write: true, admin: true },
        'Business Analytics': { read: true, write: true, admin: true },
      });
      await sequelize.query(`
        UPDATE "Users"
        SET modules = :modules::jsonb,
            module_permissions = :perms::jsonb
        WHERE role = 'platform_admin'
          AND (modules IS NULL OR module_permissions IS NULL)
      `, { replacements: { modules: allModules, perms: fullPerms } });
      logger.info('Post-sync: platform_admin users given full modules & permissions.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Post-sync platform_admin permissions');
    }

    // ------ Post-sync: seed system_module_config defaults if table is empty --------------------------------
    try {
      const [rows] = await sequelize.query(`SELECT COUNT(*) AS cnt FROM system_module_config`);
      if (parseInt(rows[0].cnt, 10) === 0) {
        await sequelize.query(`
          INSERT INTO system_module_config (section_name, module_key, module_label, is_active, created_at, updated_at)
          VALUES
            ('work_order',          'machining_industry', 'Machining Industry', true, NOW(), NOW()),
            ('production_traveler', 'machining_industry', 'Machining Industry', true, NOW(), NOW()),
            ('quality',             'machining_industry', 'Machining Industry', true, NOW(), NOW())
        `);
        logger.info('Post-sync: system_module_config seeded with 3 default rows.');
      } else {
        logger.info({ rows: rows[0].cnt }, 'Post-sync: system_module_config already seeded');
      }
    } catch (e) {
      logger.warn({ err: e.message }, 'Post-sync system_module_config seed');
    }

    // ------ Post-sync: backfill raw_material_id on stocks table ------------------------------------------------
    // Links existing stock entries to their corresponding RawMaterial by matching material_grade.
    // Safe to run repeatedly — only updates rows where raw_material_id IS NULL.
    try {
      // Pass 1: exact material_grade match
      const [, meta1] = await sequelize.query(`
        UPDATE stocks s
        SET raw_material_id = rm.id
        FROM raw_materials rm
        WHERE LOWER(TRIM(s.material_grade)) = LOWER(TRIM(rm.material_grade))
          AND s.raw_material_id IS NULL
          AND (s.company_id IS NULL OR s.company_id = rm.company_id)
      `);
      logger.info({ rows: meta1?.rowCount || 0 }, 'Post-sync: stocks backfill pass 1 (grade match)');

      // Pass 2: match stock.material_grade against raw_material.material_category
      // (e.g. stock has material_grade='Brass' but raw_material has material_category='Brass', material_grade='C360')
      // Only matches when exactly one raw material has that category in the same company (avoids ambiguity).
      const [, meta2] = await sequelize.query(`
        UPDATE stocks s
        SET raw_material_id = sub.rm_id
        FROM (
          SELECT s2.id AS stock_id, MIN(rm2.id) AS rm_id
          FROM stocks s2
          JOIN raw_materials rm2
            ON LOWER(TRIM(s2.material_grade)) = LOWER(TRIM(rm2.material_category))
            AND (s2.company_id IS NULL OR s2.company_id = rm2.company_id)
          WHERE s2.raw_material_id IS NULL
          GROUP BY s2.id
          HAVING COUNT(rm2.id) = 1
        ) sub
        WHERE s.id = sub.stock_id
          AND s.raw_material_id IS NULL
      `);
      logger.info({ rows: meta2?.rowCount || 0 }, 'Post-sync: stocks backfill pass 2 (category match)');
    } catch (e) {
      logger.warn({ err: e.message }, 'Post-sync stocks backfill skipped');
    }

    // ------ Post-sync: fix estimates constraints ------------------------------------------------------------------------------------------------
    // Ensure the WRONG unique constraint (project_id alone) is dropped and
    // the CORRECT composite constraint (project_id + revision) exists.
    // This runs on every startup so production never has stale constraints.
    try {
      // Drop wrong constraint if it exists
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_project_id_key;
        EXCEPTION WHEN undefined_object THEN NULL;
        END $$;
      `);
      // Also drop unique INDEX variant (sync({ alter }) can create this)
      await sequelize.query(`
        DROP INDEX IF EXISTS estimates_project_id_key;
      `);
      // Ensure composite unique constraint exists
      await sequelize.query(`
        DO $$ BEGIN
          ALTER TABLE estimates
            ADD CONSTRAINT estimates_project_id_revision_unique
            UNIQUE (project_id, revision);
        EXCEPTION
          WHEN duplicate_table THEN NULL;
          WHEN duplicate_object THEN NULL;
        END $$;
      `);
      logger.info('Post-sync: estimates (project_id, revision) constraint verified.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Post-sync constraint fix');
    }

    // Seed default permissions
    try {
      const permissionService = require('./services/permissionService');
      await permissionService.seedDefaults();
      logger.info('Default permissions seeded.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Permission seeding skipped');
    }

    // Initialize file manager root folders
    try {
      const fileManagerService = require('./services/fileManagerService');
      await fileManagerService.initializeRootFolders();
      logger.info('File manager root folders initialized.');
    } catch (e) {
      logger.warn({ err: e.message }, 'File manager init via service failed');
      // Fallback: seed root folders via raw SQL
      try {
        const roots = [
          { name: 'Project Documents', slug: 'project-documents', module_type: 'project', path: '/Project Documents' },
          { name: 'Procurement Documents', slug: 'procurement-documents', module_type: 'procurement', path: '/Procurement Documents' },
          { name: 'Part Master', slug: 'part-master', module_type: 'part_master', path: '/Part Master' },
          { name: 'Inventory', slug: 'inventory', module_type: 'inventory', path: '/Inventory' },
        ];
        for (const r of roots) {
          await sequelize.query(`
            INSERT INTO file_manager_folders (id, name, slug, parent_id, folder_type, module_type, path, created_at, updated_at)
            VALUES (gen_random_uuid(), :name, :slug, NULL, 'root', :module_type, :path, NOW(), NOW())
            ON CONFLICT (path) DO NOTHING;
          `, { replacements: r });
        }
        logger.info('File manager root folders seeded via raw SQL fallback.');
      } catch (e2) {
        logger.error({ err: e2.message }, 'File manager root folder seeding FAILED');
      }
    }

    // ------ Post-sync: backfill procurement documents BEFORE project backfill ------
    // Procurement docs have project_id but should be module_type='procurement', not 'project'.
    try {
      const [, procDocs] = await sequelize.query(`
        UPDATE documents
        SET module_type = 'procurement'
        WHERE document_type IN ('rfq_quotation','vendor_po','vendor_po_quotation','sent_rfq','received_quotation')
          AND (module_type IS NULL OR module_type = 'project')
      `);
      logger.info({ rows: procDocs?.rowCount || 0 }, 'Post-sync: procurement documents backfill');
    } catch (e) {
      logger.warn({ err: e.message }, 'Procurement documents backfill skipped');
    }

    // ------ Post-sync: backfill documents with module_type & reference_id ------
    // Documents created before File Manager integration may be missing these fields.
    try {
      const [, metaDocs] = await sequelize.query(`
        UPDATE documents
        SET module_type = 'project',
            reference_id = project_id
        WHERE project_id IS NOT NULL
          AND (module_type IS NULL OR reference_id IS NULL)
          AND document_type NOT IN ('rfq_quotation','vendor_po','vendor_po_quotation','sent_rfq','received_quotation')
      `);
      logger.info({ rows: metaDocs?.rowCount || 0 }, 'Post-sync: documents backfill (module_type/reference_id)');
    } catch (e) {
      logger.warn({ err: e.message }, 'Documents backfill skipped');
    }

    // ------ Post-sync: create File Manager folders for existing projects ------
    try {
      const fileManagerService = require('./services/fileManagerService');
      const [projects] = await sequelize.query(`
        SELECT id, project_name, company_id FROM projects
        WHERE id NOT IN (
          SELECT DISTINCT project_id FROM file_manager_folders
          WHERE project_id IS NOT NULL AND folder_type = 'project'
        )
      `);
      for (const p of projects) {
        try {
          await fileManagerService.createProjectFolders(p.id, p.project_name, p.company_id);
        } catch (_) { /* skip individual failures */ }
      }
      logger.info({ count: projects.length }, 'Post-sync: File Manager folders created for projects');
    } catch (e) {
      logger.warn({ err: e.message }, 'Project folder backfill skipped');
    }

    // ------ Post-sync: create File Manager folders for existing procurement entities ------
    try {
      const { ensureProcurementFolders } = require('./controllers/fileManagerController');
      // MgmtProcurementRFQs
      const [mgmtRfqs] = await sequelize.query(`
        SELECT id, rfq_number, company_id FROM mgmt_procurement_rfqs
        WHERE id NOT IN (
          SELECT DISTINCT reference_id FROM file_manager_folders
          WHERE reference_id IS NOT NULL AND folder_type = 'procurement'
        )
      `);
      for (const r of mgmtRfqs) {
        try { await ensureProcurementFolders(r.id, r.rfq_number || `RFQ-${r.id.slice(0,8)}`, r.company_id); } catch (_) {}
      }
      // MgmtProcurementPOs
      const [mgmtPos] = await sequelize.query(`
        SELECT id, po_number, company_id FROM mgmt_procurement_pos
        WHERE id NOT IN (
          SELECT DISTINCT reference_id FROM file_manager_folders
          WHERE reference_id IS NOT NULL AND folder_type = 'procurement'
        )
      `);
      for (const p of mgmtPos) {
        try { await ensureProcurementFolders(p.id, p.po_number || `PO-${p.id.slice(0,8)}`, p.company_id); } catch (_) {}
      }
      logger.info({ count: mgmtRfqs.length + mgmtPos.length }, 'Post-sync: Procurement folders created');
    } catch (e) {
      logger.warn({ err: e.message }, 'Procurement folder backfill skipped');
    }

    // ------ Post-sync: link orphan documents to File Manager folders ----------
    // Documents that have project_id and document_type but no folder_id
    try {
      const docTypeToFolder = {
        quotation: 'Quotation',
        rfq: 'RFQ',
        purchase_order: 'PO',
        po_client: 'PO',
        sales_order: 'PO',
        work_order: 'Work Order',
        production_traveller: 'Production',
        coc: 'Quality',
        inspection_report: 'Quality',
        material_cert: 'Quality',
        packing_list: 'Logistics',
        tracking_slip: 'Logistics',
        invoice: 'Invoice',
        drawing: 'Quotation',
      };
      for (const [docType, folderName] of Object.entries(docTypeToFolder)) {
        await sequelize.query(`
          UPDATE documents d
          SET folder_id = f.id
          FROM file_manager_folders f
          WHERE d.project_id IS NOT NULL
            AND d.folder_id IS NULL
            AND d.document_type = :docType
            AND f.project_id = d.project_id
            AND f.name = :folderName
            AND f.folder_type = 'subfolder'
        `, { replacements: { docType, folderName } });
      }
      logger.info('Post-sync: orphan documents linked to File Manager folders.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Document folder linkage skipped');
    }

    // ------ Post-sync: backfill Part Master documents for parts with drawings ------
    try {
      const [partsWithDrawings] = await sequelize.query(`
        SELECT p.id, p.part_name, p.drawing_url, p.company_id
        FROM parts p
        WHERE p.drawing_url IS NOT NULL AND p.drawing_url != ''
          AND p.id NOT IN (
            SELECT reference_id FROM documents
            WHERE module_type = 'part_master' AND reference_id IS NOT NULL
          )
      `);
      if (partsWithDrawings.length) {
        const [partMasterRoot] = await sequelize.query(`
          SELECT id FROM file_manager_folders WHERE path = '/Part Master' LIMIT 1
        `);
        const folderId = partMasterRoot?.[0]?.id || null;
        for (const part of partsWithDrawings) {
          try {
            const drawingFilename = part.drawing_url.split('/').pop();
            await sequelize.query(`
              INSERT INTO documents (id, file_name, file_path, module_type, document_type, reference_id, folder_id, version, status, file_type, company_id, created_at, updated_at)
              VALUES (gen_random_uuid(), :file_name, :file_path, 'part_master', 'drawing', :reference_id, :folder_id, 1, 'latest', 'uploaded', :company_id, NOW(), NOW())
              ON CONFLICT DO NOTHING
            `, { replacements: {
              file_name: drawingFilename,
              file_path: part.drawing_url.replace(/^\/uploads\//, ''),
              reference_id: part.id,
              folder_id: folderId,
              company_id: part.company_id || null,
            }});
          } catch (_) {}
        }
        logger.info({ count: partsWithDrawings.length }, 'Post-sync: Part Master documents created');
      }
    } catch (e) {
      logger.warn({ err: e.message }, 'Part Master document backfill skipped');
    }

    // ------ Post-sync: backfill reference_id on orphan part_master documents ------
    try {
      const [, updatedParts] = await sequelize.query(`
        UPDATE documents d
        SET reference_id = p.id
        FROM parts p
        WHERE d.module_type = 'part_master'
          AND d.reference_id IS NULL
          AND d.document_type = 'drawing'
          AND d.file_name = SUBSTRING(p.drawing_url FROM '[^/]+$')
          AND p.drawing_url IS NOT NULL
      `);
      logger.info({ rows: updatedParts?.rowCount || 0 }, 'Post-sync: Part Master orphan docs linked');
    } catch (e) {
      logger.warn({ err: e.message }, 'Part Master orphan linkage skipped');
    }

    // ------ Post-sync: backfill Document records for existing MgmtProcurement RFQs ------
    try {
      const [rfqsWithoutDocs] = await sequelize.query(`
        SELECT id, rfq_number, company_id FROM mgmt_procurement_rfqs
        WHERE id NOT IN (
          SELECT reference_id FROM documents
          WHERE module_type = 'procurement' AND reference_id IS NOT NULL
        )
      `);
      for (const r of rfqsWithoutDocs) {
        try {
          await sequelize.query(`
            INSERT INTO documents (id, file_name, file_path, module_type, document_type, reference_id, version, status, file_type, company_id, size, created_at, updated_at)
            VALUES (gen_random_uuid(), :file_name, :file_path, 'procurement', 'sent_rfq', :reference_id, 1, 'latest', 'generated', :company_id, 0, NOW(), NOW())
            ON CONFLICT DO NOTHING
          `, { replacements: {
            file_name: `${r.rfq_number || 'RFQ-' + r.id.slice(0,8)}.pdf`,
            file_path: `generated/${r.rfq_number || 'RFQ-' + r.id.slice(0,8)}.pdf`,
            reference_id: r.id,
            company_id: r.company_id || null,
          }});
        } catch (_) {}
      }
      logger.info({ count: rfqsWithoutDocs.length }, 'Post-sync: Procurement RFQ documents created');
    } catch (e) {
      logger.warn({ err: e.message }, 'Procurement RFQ document backfill skipped');
    }

    // ------ Post-sync: backfill Document records for existing MgmtProcurement POs ------
    try {
      const [posWithoutDocs] = await sequelize.query(`
        SELECT id, po_number, company_id FROM mgmt_procurement_pos
        WHERE id NOT IN (
          SELECT reference_id FROM documents
          WHERE module_type = 'procurement' AND reference_id IS NOT NULL
        )
      `);
      for (const p of posWithoutDocs) {
        try {
          await sequelize.query(`
            INSERT INTO documents (id, file_name, file_path, module_type, document_type, reference_id, version, status, file_type, company_id, size, created_at, updated_at)
            VALUES (gen_random_uuid(), :file_name, :file_path, 'procurement', 'approved_po', :reference_id, 1, 'latest', 'generated', :company_id, 0, NOW(), NOW())
            ON CONFLICT DO NOTHING
          `, { replacements: {
            file_name: `${p.po_number || 'PO-' + p.id.slice(0,8)}.pdf`,
            file_path: `generated/${p.po_number || 'PO-' + p.id.slice(0,8)}.pdf`,
            reference_id: p.id,
            company_id: p.company_id || null,
          }});
        } catch (_) {}
      }
      logger.info({ count: posWithoutDocs.length }, 'Post-sync: Procurement PO documents created');
    } catch (e) {
      logger.warn({ err: e.message }, 'Procurement PO document backfill skipped');
    }

    // Auto-create / upsert admin on every start
    // Falls back to default credentials if env vars are not set
    try {
      const bcrypt = require('bcryptjs');
      const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@forgedas.com';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234';
      const adminName     = process.env.ADMIN_NAME     || 'Admin';
      logger.info({ email: adminEmail }, 'Admin setup');

      const salt = await bcrypt.genSalt(10);
      const password_hash = await bcrypt.hash(adminPassword, salt);
      // Use raw SQL so it never fails due to missing columns
      const [existing] = await sequelize.query(
        `SELECT id, failed_login_attempts, locked_until FROM users WHERE email = :email LIMIT 1`,
        { replacements: { email: adminEmail }, type: sequelize.QueryTypes.SELECT }
      );
      if (existing) {
        const wasLocked = existing.locked_until && new Date(existing.locked_until) > new Date();
        const hadFailedAttempts = existing.failed_login_attempts > 0;
        
        await sequelize.query(
          `UPDATE users SET password_hash = :hash, role = 'main_admin', is_active = true, failed_login_attempts = 0, locked_until = NULL, deleted_at = NULL, deleted_by = NULL WHERE email = :email`,
          { replacements: { hash: password_hash, email: adminEmail } }
        );
        
        logger.info({ email: adminEmail }, 'Admin synced');
        if (wasLocked) logger.warn({ email: adminEmail }, 'Admin was locked — now unlocked');
        if (hadFailedAttempts) logger.info({ email: adminEmail, attempts: existing.failed_login_attempts }, 'Admin failed login attempts reset');
      } else {
        await sequelize.query(
          `INSERT INTO users (id, name, email, password_hash, role, is_active, failed_login_attempts, locked_until, created_at, updated_at)
           VALUES (gen_random_uuid(), :name, :email, :hash, 'main_admin', true, 0, NULL, NOW(), NOW())`,
          { replacements: { name: adminName, email: adminEmail, hash: password_hash } }
        );
        logger.info({ email: adminEmail }, 'Admin created');
      }
    } catch (e) {
      logger.error({ err: e.message }, 'Auto-admin creation failed');
    }

    // Initialize settings: ensure company/system data & logo are in the DB
    try {
      const settingsService = require('./services/settingsService');
      await settingsService.initialize();
    } catch (e) {
      logger.warn({ err: e.message }, 'Settings initialization skipped');
    }

    // Initialize document numbering: ensure all document type configurations exist
    try {
      const documentNumberingService = require('./services/documentNumberingService');
      await documentNumberingService.initialize();
    } catch (e) {
      logger.warn({ err: e.message }, 'Document numbering initialization skipped');
    }

    // ------ Post-sync: backfill project_number for existing projects ------
    // Projects created before the numbering system was added have project_number = NULL.
    // Generate a project number for each one using the Document Numbering Service.
    try {
      const [projectsWithoutNumber] = await sequelize.query(
        `SELECT id, company_id FROM projects WHERE project_number IS NULL AND deleted_at IS NULL ORDER BY created_at ASC`
      );
      if (projectsWithoutNumber.length > 0) {
        const docNumSvc = require('./services/documentNumberingService');
        let backfilled = 0;
        for (const p of projectsWithoutNumber) {
          try {
            const projNum = await docNumSvc.generateNumber('project_number', p.company_id || null);
            await sequelize.query(
              `UPDATE projects SET project_number = :projNum WHERE id = :id AND project_number IS NULL`,
              { replacements: { projNum, id: p.id } }
            );
            backfilled++;
          } catch (numErr) {
            logger.warn({ projectId: p.id, err: numErr.message }, 'Post-sync: could not backfill project_number');
          }
        }
        logger.info({ backfilled, total: projectsWithoutNumber.length }, 'Post-sync: project_number backfilled');
      } else {
        logger.info('Post-sync: all projects already have project_number');
      }
    } catch (e) {
      logger.warn({ err: e.message }, 'Post-sync project_number backfill skipped');
    }

    dbReady = true;
    logger.info('Database fully initialized.');

    // ── Platform Admin Users: seed on startup ─────────────────────────────
    try {
      const bcrypt2 = require('bcryptjs');
      const platformAdmins = [
        { name: 'Vikraman', email: 'vikraman@cholandynamics.com' },
        { name: 'Priyanka', email: 'priyanka@cholandynamics.com' },
      ];
      const defaultPassword = process.env.PLATFORM_ADMIN_PASSWORD || 'cdpl@2026';
      const salt2 = await bcrypt2.genSalt(10);
      const hash2 = await bcrypt2.hash(defaultPassword, salt2);

      for (const pa of platformAdmins) {
        const [existing2] = await sequelize.query(
          `SELECT id FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1`,
          { replacements: { email: pa.email }, type: sequelize.QueryTypes.SELECT }
        );
        if (!existing2) {
          await sequelize.query(
            `INSERT INTO users (id, name, email, password_hash, role, is_active, company_id, failed_login_attempts, locked_until, created_at, updated_at)
             VALUES (gen_random_uuid(), :name, :email, :hash, 'platform_admin', true, NULL, 0, NULL, NOW(), NOW())`,
            { replacements: { name: pa.name, email: pa.email, hash: hash2 } }
          );
          logger.info({ email: pa.email }, 'Platform admin created');
        } else {
          // Ensure role is platform_admin (don't overwrite password if already exists)
          await sequelize.query(
            `UPDATE users SET role = 'platform_admin', company_id = NULL, is_active = true WHERE LOWER(email) = LOWER(:email)`,
            { replacements: { email: pa.email } }
          );
        }
      }
    } catch (e) {
      logger.warn({ err: e.message }, 'Platform admin seeding skipped');
    }

    // ── Subscription Status Check ─────────────────────────────────────────
    // BACKGROUND TASK — runs at startup outside any HTTP request.
    // checkSubscriptions() uses raw sequelize.query() with no company_id filter
    // intentionally — it is a platform-admin-level cross-tenant operation.
    // If you add new DB queries here, wrap them in:
    //   await tenantContext.runAsPlatformAdmin(async () => { ... })
    try {
      const platformAdminService = require('./services/platformAdminService');
      const subResult = await platformAdminService.checkSubscriptions();
      if (subResult.expiredCount > 0) {
        logger.info({ count: subResult.expiredCount }, 'Subscription: companies marked expired');
      }
    } catch (e) {
      logger.warn({ err: e.message }, 'Subscription check skipped');
    }

    // ── Phase 5B: Ensure performance indexes ─────────────────────────────
    // Idempotent — IF NOT EXISTS means safe to re-run on every startup.
    // Mirrors the 20260419000000-add-performance-indexes migration so fresh
    // deployments get indexes immediately even before `db:migrate` runs.
    try {
      const perfIndexes = [
        `CREATE INDEX IF NOT EXISTS idx_projects_company_id_created_at   ON projects    (company_id, created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS idx_documents_company_id_project_id  ON documents   (company_id, project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_estimates_company_id_project_id  ON estimates   (company_id, project_id)`,
        `CREATE INDEX IF NOT EXISTS idx_work_orders_company_id_status    ON work_orders (company_id, status)`,
        `CREATE INDEX IF NOT EXISTS idx_invoices_company_id_status       ON invoices    (company_id, status)`,
        // Hot-path: every authenticated request does Session.findOne({ token_hash, is_active }).
        // Without this index the middleware performs a full sequence scan on every API call.
        `CREATE INDEX IF NOT EXISTS idx_sessions_token_hash              ON sessions    (token_hash) WHERE is_active = true`,
        `CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token_hash      ON sessions    (refresh_token_hash) WHERE is_active = true`,
        `CREATE INDEX IF NOT EXISTS idx_sessions_user_id                 ON sessions    (user_id, is_active)`,
        `CREATE INDEX IF NOT EXISTS idx_users_reset_token                ON users       (reset_token) WHERE reset_token IS NOT NULL`,
        `CREATE INDEX IF NOT EXISTS idx_fmf_company_id                   ON file_manager_folders (company_id)`,
        `CREATE INDEX IF NOT EXISTS idx_fmf_project_id                   ON file_manager_folders (project_id)`,
      ];
      for (const sql of perfIndexes) {
        await sequelize.query(sql);
      }
      logger.info('Phase 5B: performance indexes ensured.');
    } catch (e) {
      logger.warn({ err: e.message }, 'Phase 5B: performance index creation skipped');
    }

    // ── Phase 4: Activate RLS ─────────────────────────────────────────────
    // All DDL (sync, alter table, create table) is now complete.
    // Re-grant forged_app on every table/sequence including ones sync just created,
    // then switch the connection pool to forged_app role so RLS is enforced
    // for all subsequent app queries.
    try {
      await sequelize.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO forged_app`
      );
      await sequelize.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO forged_app`
      );
      // Ensure forged_app automatically gets rights on tables created in the future
      // (e.g. by subsequent sync() calls on redeploy).
      await sequelize.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forged_app`
      );
      await sequelize.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO forged_app`
      );
      logger.info('[Phase 4] forged_app grants refreshed on all tables/sequences.');

      // Activate the RLS role: drain idle pool connections so they are recreated
      // as forged_app. All new connections from this point use the restricted role.
      const { activateRls } = require('./models');
      await activateRls();
      logger.info('[Phase 4] RLS enforcement fully active.');

      // ── Phase 4 Self-Test: verify the pool is actually running as forged_app ──
      // Queries `current_user` on a live connection from the pool. This confirms
      // the afterConnect hook fired and SET ROLE forged_app succeeded.
      // If the DB user is still 'postgres', RLS is NOT enforced — log a critical
      // alert so it is visible immediately in Railway logs.
      try {
        const selfTestRows = await sequelize.query(
          'SELECT current_user',
          { type: sequelize.QueryTypes.SELECT, raw: true }
        );
        const dbUser = selfTestRows?.[0]?.current_user;
        if (dbUser === 'forged_app') {
          logger.info({ dbUser }, '[Phase 4] Self-test PASSED: RLS is enforced.');
        } else {
          logger.error({ dbUser }, '[Phase 4] Self-test FAILED: RLS is NOT enforced. Expected forged_app role.');
        }
      } catch (selfTestErr) {
        logger.warn({ err: selfTestErr.message }, '[Phase 4] Self-test query failed (non-fatal)');
      }
    } catch (e) {
      logger.warn({ err: e.message }, '[Phase 4] RLS activation skipped (non-fatal)');
    }
  } catch (error) {
    logger.error({ err: error }, 'Unable to connect to the database');
    if (retries > 0) {
      logger.info({ retries }, 'Retrying database init in 5s...');
      setTimeout(() => initDatabase(retries - 1), 5000);
    } else {
      logger.error('All database init retries exhausted. API calls may fail.');
    }
  }
};

initDatabase(3).catch(err => logger.fatal({ err }, 'initDatabase unexpected rejection'));

module.exports = app;
