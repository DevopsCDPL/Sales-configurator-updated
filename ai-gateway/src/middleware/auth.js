/**
 * Identity middleware.
 *
 * Order of trust (first match wins):
 *   1. Bearer JWT in Authorization header — verified with AI_AUTH_SECRET.
 *      Required claims: sub (or id) + role.
 *   2. Signed service-to-service headers — X-AI-User-Id + X-AI-User-Role,
 *      authorized by X-AI-Service-Token == AI_SERVICE_TOKEN. Used when the
 *      Forge backend proxies user requests with a server-side shared secret.
 *   3. AI_AUTH_DISABLED=1 (development only) — falls back to req.body.user
 *      so existing curl tests keep working. NEVER set this in production.
 *
 * On success, populates req.user = { id, role, source }.
 * On failure, throws AppError("UNAUTHORIZED", ...).
 */

const { AppError } = require("../lib/errors");
const logger = require("../lib/logger");

let jwt = null;
try { jwt = require("jsonwebtoken"); } catch { /* optional */ }

function authMiddleware(req, _res, next) {
  // 1) JWT
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ") && process.env.AI_AUTH_SECRET && jwt) {
    const token = authHeader.slice(7).trim();
    try {
      const claims = jwt.verify(token, process.env.AI_AUTH_SECRET, {
        algorithms: ["HS256"],
      });
      const id = claims.sub || claims.id || claims.user_id;
      const role = claims.role || claims.user_role;
      if (!id || !role) throw new Error("token missing sub/role claims");
      req.user = { id: String(id), role: String(role), source: "jwt" };
      return next();
    } catch (err) {
      logger.warn({ err: err.message, request_id: req.id }, "jwt verification failed");
      return next(new AppError("UNAUTHORIZED", "Invalid or expired token", { status: 401 }));
    }
  }

  // 2) Signed service-to-service headers
  const svcToken = req.headers["x-ai-service-token"];
  if (process.env.AI_SERVICE_TOKEN && svcToken) {
    if (svcToken !== process.env.AI_SERVICE_TOKEN) {
      return next(new AppError("UNAUTHORIZED", "Invalid service token", { status: 401 }));
    }
    const id = req.headers["x-ai-user-id"];
    const role = req.headers["x-ai-user-role"];
    if (!id || !role) {
      return next(new AppError("UNAUTHORIZED", "Missing x-ai-user-id / x-ai-user-role", { status: 401 }));
    }
    req.user = { id: String(id), role: String(role), source: "service" };
    return next();
  }

  // 3) Dev fallback
  if (process.env.AI_AUTH_DISABLED === "1") {
    const u = req.body?.user;
    if (!u?.id || !u?.role) {
      return next(new AppError("UNAUTHORIZED", "Missing user.id / user.role in dev mode", { status: 401 }));
    }
    req.user = { id: String(u.id), role: String(u.role), source: "dev" };
    return next();
  }

  return next(
    new AppError("UNAUTHORIZED", "Authentication required (Bearer token or service headers)", { status: 401 })
  );
}

/**
 * Role gate. Usage:
 *   router.post("/chat", authMiddleware, requireRole(["admin","staff"]), handler)
 * Role list `null` ⇒ any authenticated user.
 */
function requireRole(allowed) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError("UNAUTHORIZED", "Not authenticated", { status: 401 }));
    if (!allowed || allowed.includes(req.user.role)) return next();
    return next(
      new AppError("FORBIDDEN", `Role "${req.user.role}" not allowed`, { status: 403 })
    );
  };
}

module.exports = { authMiddleware, requireRole };
