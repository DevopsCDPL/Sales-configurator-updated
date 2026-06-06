const express = require("express");
const router = express.Router();
const aiController = require("../controllers/ai.controller");
const { authMiddleware } = require("../middleware/auth");
const { chatLimiter } = require("../middleware/rateLimit");

// Health/status — public.
router.get("/", (req, res) => {
  res.json({ status: "ok", message: "AI Gateway is running", request_id: req.id });
});

// POST /ai/chat — legacy free-form chat (kept for back-compat).
router.post("/chat", authMiddleware, chatLimiter, aiController.handleChat);

// POST /ai/process — structured workflow endpoint.
// Returns typed JSON envelopes (input | selection | confirmation | error | success).
router.post("/process", authMiddleware, chatLimiter, aiController.handleProcess);

module.exports = router;
