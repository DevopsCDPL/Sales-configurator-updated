/**
 * AI routes.
 *
 * All routes here require a tenant + user context (enforced by middleware
 * once wired to the main backend's auth).
 */

const express = require('express');
const aiController = require('../controllers/ai.controller');

const router = express.Router();

// POST /api/ai/chat — free-form chat (ChatPage / floating assistant)
router.post('/chat', aiController.chat);

// POST /api/ai/command — structured intent execution
router.post('/command', aiController.command);

module.exports = router;
