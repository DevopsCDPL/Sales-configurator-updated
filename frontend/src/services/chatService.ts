import api from './api';

export interface ChatUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface Participant {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'member' | 'admin';
  last_read_at: string | null;
  user: ChatUser;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  created_by: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  participants: Participant[];
  unread_count?: number;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  type: 'text' | 'system';
  created_at: string;
  sender: ChatUser;
}

export const chatService = {
  searchUsers: async (q: string): Promise<ChatUser[]> => {
    const res = await api.get('/chat/users/search', { params: { q } });
    return res.data;
  },

  getUnreadCount: async (): Promise<number> => {
    const res = await api.get('/chat/unread');
    return res.data.unread || 0;
  },

  getConversations: async (): Promise<Conversation[]> => {
    const res = await api.get('/chat/conversations');
    return res.data;
  },

  getOrCreateDirect: async (targetUserId: string): Promise<Conversation> => {
    const res = await api.post('/chat/conversations/direct', { targetUserId });
    return res.data;
  },

  createGroup: async (name: string, memberIds: string[]): Promise<Conversation> => {
    const res = await api.post('/chat/conversations/group', { name, memberIds });
    return res.data;
  },

  updateGroup: async (id: string, data: { name?: string; addMembers?: string[]; removeMembers?: string[] }): Promise<Conversation> => {
    const res = await api.put(`/chat/conversations/group/${id}`, data);
    return res.data;
  },

  getMessages: async (conversationId: string, page = 1, limit = 50): Promise<{ messages: ChatMessage[]; total: number }> => {
    const res = await api.get(`/chat/conversations/${conversationId}/messages`, { params: { page, limit } });
    return res.data;
  },

  sendMessage: async (conversationId: string, content: string): Promise<ChatMessage> => {
    const res = await api.post(`/chat/conversations/${conversationId}/messages`, { content });
    return res.data;
  },

  markAsRead: async (conversationId: string): Promise<void> => {
    await api.put(`/chat/conversations/${conversationId}/read`);
  },
};
