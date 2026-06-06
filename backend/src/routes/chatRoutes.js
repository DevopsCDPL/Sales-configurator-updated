const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticate, authorize } = require('../middleware/auth');
const { tenantScope } = require('../middleware/tenantScope');

// All chat routes require authentication
router.use(authenticate);
router.use(tenantScope);

// Search users for starting chat
router.get('/users/search', chatController.searchUsers);

// Get total unread count
router.get('/unread', chatController.getUnreadCount);

// Get all conversations
router.get('/conversations', chatController.getConversations);

// Get or create a direct conversation
router.post('/conversations/direct', chatController.getOrCreateDirect);

// Create a group (admin/main_admin only)
router.post('/conversations/group', authorize('main_admin', 'admin'), chatController.createGroup);

// Update a group (admin/main_admin only)
router.put('/conversations/group/:id', authorize('main_admin', 'admin'), chatController.updateGroup);

// Get messages for a conversation
router.get('/conversations/:conversationId/messages', chatController.getMessages);

// Send a message
router.post('/conversations/:conversationId/messages', chatController.sendMessage);

// Mark conversation as read
router.put('/conversations/:conversationId/read', chatController.markAsRead);

module.exports = router;
