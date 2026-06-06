const { Op } = require('sequelize');
const {
  Conversation,
  ConversationParticipant,
  Message,
  User,
} = require('../models');

// ------ Get all conversations for the current user ------------------------------------------------------------------------------------------
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.user.company_id;

    // Find all conversation IDs where the user participates
    const participantRows = await ConversationParticipant.findAll({
      where: { user_id: userId },
      attributes: ['conversation_id'],
    });
    const convoIds = participantRows.map((p) => p.conversation_id);

    if (convoIds.length === 0) return res.json([]);

    // Scope conversations to the user's company (or null for backwards compat)
    const whereClause = { id: { [Op.in]: convoIds } };
    if (companyId && req.user.role !== 'platform_admin') {
      whereClause.company_id = { [Op.or]: [companyId, null] };
    }

    const conversations = await Conversation.findAll({
      where: whereClause,
      include: [
        {
          model: ConversationParticipant,
          as: 'participants',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'role'],
            },
          ],
        },
      ],
      order: [['last_message_at', 'DESC NULLS LAST'], ['created_at', 'DESC']],
    });

    // Add unread count per conversation
    const result = await Promise.all(
      conversations.map(async (c) => {
        const myParticipant = c.participants.find((p) => p.user_id === userId);
        const lastRead = myParticipant?.last_read_at || new Date(0);

        const unread = await Message.count({
          where: {
            conversation_id: c.id,
            sender_id: { [Op.ne]: userId },
            created_at: { [Op.gt]: lastRead },
          },
        });

        return { ...c.toJSON(), unread_count: unread };
      })
    );

    res.json(result);
  } catch (err) {
    console.error('getConversations error:', err);
    res.status(500).json({ message: 'Error fetching conversations' });
  }
};

// ------ Get or create a direct conversation with a user ---------------------------------------------------------------------------
exports.getOrCreateDirect = async (req, res) => {
  try {
    const userId = req.user.id;
    const { targetUserId } = req.body;

    if (!targetUserId) return res.status(400).json({ message: 'targetUserId is required' });
    if (targetUserId === userId) return res.status(400).json({ message: 'Cannot chat with yourself' });

    // Check target user exists
    const target = await User.findByPk(targetUserId, { attributes: ['id', 'name', 'company_id'] });
    if (!target) return res.status(404).json({ message: 'User not found' });

    // Tenant isolation: cannot start DM with user from another company
    if (req.user.role !== 'platform_admin' && target.company_id !== req.user.company_id) {
      return res.status(403).json({ message: 'Cannot chat with users from another company' });
    }

    // Check if a direct conversation already exists between these two users (scoped to company)
    const existingWhere = { type: 'direct' };
    if (req.user.company_id) existingWhere.company_id = { [Op.or]: [req.user.company_id, null] };
    const existing = await Conversation.findAll({
      where: existingWhere,
      include: [
        {
          model: ConversationParticipant,
          as: 'participants',
          attributes: ['user_id'],
        },
      ],
    });

    const found = existing.find((c) => {
      const pids = c.participants.map((p) => p.user_id).sort();
      const check = [userId, targetUserId].sort();
      return pids.length === 2 && pids[0] === check[0] && pids[1] === check[1];
    });

    if (found) {
      // Re-fetch with full participant info
      const full = await Conversation.findByPk(found.id, {
        include: [
          {
            model: ConversationParticipant,
            as: 'participants',
            include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role'] }],
          },
        ],
      });
      return res.json(full);
    }

    // Create new direct conversation
    const conversation = await Conversation.create({
      type: 'direct',
      created_by: userId,
      company_id: req.user.company_id || null,
    });

    await ConversationParticipant.bulkCreate([
      { conversation_id: conversation.id, user_id: userId, role: 'admin' },
      { conversation_id: conversation.id, user_id: targetUserId, role: 'member' },
    ]);

    const full = await Conversation.findByPk(conversation.id, {
      include: [
        {
          model: ConversationParticipant,
          as: 'participants',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role'] }],
        },
      ],
    });

    res.status(201).json(full);
  } catch (err) {
    console.error('getOrCreateDirect error:', err);
    res.status(500).json({ message: 'Error creating conversation' });
  }
};

// ------ Create a group conversation (admin/main_admin only) ---------------------------------------------------------------
exports.createGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, memberIds } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ message: 'Group name is required' });
    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ message: 'At least one member is required' });
    }

    // Ensure the creator is always a member
    const allMembers = [...new Set([userId, ...memberIds])];

    // Tenant isolation: all members must belong to the same company
    if (req.user.role !== 'platform_admin' && req.user.company_id) {
      const members = await User.findAll({
        where: { id: { [Op.in]: allMembers } },
        attributes: ['id', 'company_id'],
      });
      const crossCompany = members.filter(m => m.company_id !== req.user.company_id);
      if (crossCompany.length > 0) {
        return res.status(403).json({ message: 'All group members must belong to your company' });
      }
    }

    const conversation = await Conversation.create({
      type: 'group',
      name: name.trim(),
      created_by: userId,
      company_id: req.user.company_id || null,
    });

    await ConversationParticipant.bulkCreate(
      allMembers.map((uid) => ({
        conversation_id: conversation.id,
        user_id: uid,
        role: uid === userId ? 'admin' : 'member',
      }))
    );

    // System message
    await Message.create({
      conversation_id: conversation.id,
      sender_id: userId,
      content: `Group "${name.trim()}" was created`,
      type: 'system',
    });

    await conversation.update({ last_message_at: new Date(), last_message_preview: `Group "${name.trim()}" was created` });

    const full = await Conversation.findByPk(conversation.id, {
      include: [
        {
          model: ConversationParticipant,
          as: 'participants',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role'] }],
        },
      ],
    });

    res.status(201).json(full);
  } catch (err) {
    console.error('createGroup error:', err);
    res.status(500).json({ message: 'Error creating group' });
  }
};

// ------ Update group (rename, add/remove members) ---------------------------------------------------------------------------------------------
exports.updateGroup = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, addMembers, removeMembers } = req.body;

    const conversation = await Conversation.findByPk(id);
    if (!conversation || conversation.type !== 'group') {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Only admins/main_admins or group creator can manage
    const userRole = req.user.role;
    if (userRole !== 'main_admin' && userRole !== 'admin' && conversation.created_by !== userId) {
      return res.status(403).json({ message: 'Only admins can manage groups' });
    }

    if (name && name.trim()) {
      const oldName = conversation.name;
      await conversation.update({ name: name.trim() });
      await Message.create({
        conversation_id: id,
        sender_id: userId,
        content: `Group renamed from "${oldName}" to "${name.trim()}"`,
        type: 'system',
      });
    }

    if (addMembers && Array.isArray(addMembers)) {
      // Tenant isolation: validate all new members belong to same company
      if (req.user.role !== 'platform_admin' && req.user.company_id) {
        const newUsers = await User.findAll({
          where: { id: { [Op.in]: addMembers } },
          attributes: ['id', 'company_id'],
        });
        const crossCompany = newUsers.filter(u => u.company_id !== req.user.company_id);
        if (crossCompany.length > 0) {
          return res.status(403).json({ message: 'Cannot add members from another company' });
        }
      }
      for (const uid of addMembers) {
        const exists = await ConversationParticipant.findOne({
          where: { conversation_id: id, user_id: uid },
        });
        if (!exists) {
          await ConversationParticipant.create({
            conversation_id: id,
            user_id: uid,
            role: 'member',
          });
          const addedUser = await User.findByPk(uid, { attributes: ['name'] });
          await Message.create({
            conversation_id: id,
            sender_id: userId,
            content: `${addedUser?.name || 'User'} was added to the group`,
            type: 'system',
          });
        }
      }
    }

    if (removeMembers && Array.isArray(removeMembers)) {
      for (const uid of removeMembers) {
        if (uid === conversation.created_by) continue; // Can't remove creator
        await ConversationParticipant.destroy({
          where: { conversation_id: id, user_id: uid },
        });
        const removedUser = await User.findByPk(uid, { attributes: ['name'] });
        await Message.create({
          conversation_id: id,
          sender_id: userId,
          content: `${removedUser?.name || 'User'} was removed from the group`,
          type: 'system',
        });
      }
    }

    await conversation.update({ last_message_at: new Date() });

    const full = await Conversation.findByPk(id, {
      include: [
        {
          model: ConversationParticipant,
          as: 'participants',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'role'] }],
        },
      ],
    });

    res.json(full);
  } catch (err) {
    console.error('updateGroup error:', err);
    res.status(500).json({ message: 'Error updating group' });
  }
};

// ------ Get messages for a conversation ---------------------------------------------------------------------------------------------------------------------------
exports.getMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // Verify participation
    const participant = await ConversationParticipant.findOne({
      where: { conversation_id: conversationId, user_id: userId },
    });
    if (!participant) return res.status(403).json({ message: 'Not a member of this conversation' });

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows, count } = await Message.findAndCountAll({
      where: { conversation_id: conversationId },
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email', 'role'] },
      ],
      order: [['created_at', 'ASC']],
      limit: parseInt(limit),
      offset,
    });

    // Update last_read_at for this user
    await participant.update({ last_read_at: new Date() });

    res.json({ messages: rows, total: count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ message: 'Error fetching messages' });
  }
};

// ------ Send a message ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
exports.sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) return res.status(400).json({ message: 'Message content is required' });

    // Verify participation
    const participant = await ConversationParticipant.findOne({
      where: { conversation_id: conversationId, user_id: userId },
    });
    if (!participant) return res.status(403).json({ message: 'Not a member of this conversation' });

    const message = await Message.create({
      conversation_id: conversationId,
      sender_id: userId,
      content: content.trim(),
      type: 'text',
    });

    // Update conversation last_message
    await Conversation.update(
      {
        last_message_at: message.created_at,
        last_message_preview: content.trim().substring(0, 100),
      },
      { where: { id: conversationId } }
    );

    // Update sender's last_read_at
    await participant.update({ last_read_at: new Date() });

    const full = await Message.findByPk(message.id, {
      include: [{ model: User, as: 'sender', attributes: ['id', 'name', 'email', 'role'] }],
    });

    res.status(201).json(full);
  } catch (err) {
    console.error('sendMessage error:', err);
    res.status(500).json({ message: 'Error sending message' });
  }
};

// ------ Mark conversation as read ---------------------------------------------------------------------------------------------------------------------------------------------
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;

    const participant = await ConversationParticipant.findOne({
      where: { conversation_id: conversationId, user_id: userId },
    });
    if (!participant) return res.status(403).json({ message: 'Not a member' });

    await participant.update({ last_read_at: new Date() });
    res.json({ success: true });
  } catch (err) {
    console.error('markAsRead error:', err);
    res.status(500).json({ message: 'Error' });
  }
};

// ------ Search users for chat ---------------------------------------------------------------------------------------------------------------------------------------------------------
exports.searchUsers = async (req, res) => {
  try {
    const userId = req.user.id;
    const { q } = req.query;

    const where = {
      id: { [Op.ne]: userId },
      is_active: true,
    };

    if (q && q.trim()) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${q.trim()}%` } },
        { email: { [Op.iLike]: `%${q.trim()}%` } },
      ];
    }

    const users = await User.findAll({
      where,
      attributes: ['id', 'name', 'email', 'role'],
      limit: 20,
      order: [['name', 'ASC']],
    });

    res.json(users);
  } catch (err) {
    console.error('searchUsers error:', err);
    res.status(500).json({ message: 'Error searching users' });
  }
};

// ------ Get total unread count across all conversations ---------------------------------------------------------------------------
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const participants = await ConversationParticipant.findAll({
      where: { user_id: userId },
      attributes: ['conversation_id', 'last_read_at'],
    });

    let total = 0;
    for (const p of participants) {
      const lastRead = p.last_read_at || new Date(0);
      const count = await Message.count({
        where: {
          conversation_id: p.conversation_id,
          sender_id: { [Op.ne]: userId },
          created_at: { [Op.gt]: lastRead },
        },
      });
      total += count;
    }

    res.json({ unread: total });
  } catch (err) {
    console.error('getUnreadCount error:', err);
    res.status(500).json({ message: 'Error' });
  }
};
