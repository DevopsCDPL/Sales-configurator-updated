/**
 * AI Gateway — production-hardened entrypoint.
 *
 * Responsibilities here are deliberately tiny:
 *   - boot Express
 *   - install security middleware (helmet, cors, json body parser w/ limit)
 *   - assign request IDs
 *   - mount /ai routes
 *   - register the standard error handler LAST
 *
 * Business logic lives in services/. HTTP concerns live in middleware/.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const logger = require("./lib/logger");
const sessionStore = require("./lib/sessionStore");
const { requestId, notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: process.env.AI_CORS_ORIGIN || true }));
app.use(express.json({ limit: "64kb" }));
app.use(requestId);

// Lightweight access log — single line per request, structured.
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info(
      {
        request_id: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - start,
        user_id: req.user?.id,
      },
      "http"
    );
  });
  next();
});

// Liveness — no auth, used by load balancers.
app.get("/health", (_req, res) =>
  res.json({ status: "ok", session_store: sessionStore.describe() })
);

app.use("/ai", require("./routes/aiRoutes"));

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT || 5001);
app.listen(port, () => {
  logger.info({ port, mock: process.env.AI_MOCK === "1" }, "AI Gateway running");
  // Keep the legacy line so existing test scripts that grep for it still work.
  console.log(`AI Gateway running on port ${port}`);
});
