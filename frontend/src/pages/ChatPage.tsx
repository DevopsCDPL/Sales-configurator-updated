import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Avatar,
  Badge,
  InputAdornment,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemButton,
  Checkbox,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  alpha,
} from '@mui/material';
import {
  Search as SearchIcon,
  Send as SendIcon,
  Group as GroupIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  PersonAdd as PersonAddIcon,
  PersonRemove as PersonRemoveIcon,
  Edit as EditIcon,
  Chat as ChatIcon,
  Forum as ForumIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import {
  chatService,
  type Conversation,
  type ChatMessage,
  type ChatUser,
} from '../services/chatService';

// ── Color tokens ────────────────────────────────────────────────────────────
const PRIMARY = '#1F7A63';
const PRIMARY_LIGHT = '#E8F7F2';
const TEXT_DARK = 'var(--text-primary)';
const TEXT_MED = 'var(--text-secondary)';
const TEXT_LIGHT = 'var(--text-muted)';
const BORDER = 'var(--border)';
const BG_HOVER = 'var(--bg-canvas)';
const BG_ACTIVE = 'var(--border-subtle)';
const BG_MSG_SELF = '#1F7A63';
const BG_MSG_OTHER = 'var(--bg-surface-2)';

// ── Helpers ──────────────────────────────────────────────────────────────────
const getInitials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

const formatTime = (d: string) => {
  const date = new Date(d);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const formatMsgTime = (d: string) =>
  new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatMsgDate = (d: string) => {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};

const avatarColors = ['#1F7A63', '#0D3D2F', '#166354', '#DB2777', '#EA580C', '#0891B2', '#0D3D2F', '#B45309'];
const getAvatarColor = (id: string) => avatarColors[parseInt(id.replace(/\D/g, '').slice(0, 4) || '0') % avatarColors.length];

// ═══════════════════════════════════════════════════════════════════════════
//  CHAT PAGE
// ═══════════════════════════════════════════════════════════════════════════
const ChatPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'main_admin' || user?.role === 'admin';

  // ── State ──────────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ChatUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [convosLoading, setConvosLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Group creation
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupSearchResults, setGroupSearchResults] = useState<ChatUser[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<ChatUser[]>([]);
  const [groupCreating, setGroupCreating] = useState(false);

  // Group management
  const [groupMenuAnchor, setGroupMenuAnchor] = useState<null | HTMLElement>(null);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [manageAction, setManageAction] = useState<'add' | 'remove' | 'rename'>('add');
  const [manageSearch, setManageSearch] = useState('');
  const [manageSearchResults, setManageSearchResults] = useState<ChatUser[]>([]);
  const [manageSelectedUsers, setManageSelectedUsers] = useState<string[]>([]);
  const [renameValue, setRenameValue] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const data = await chatService.getConversations();
      setConversations(data);
    } catch {
      /* silent */
    } finally {
      setConvosLoading(false);
    }
  }, []);

  const loadMessages = useCallback(
    async (convoId: string) => {
      setMsgsLoading(true);
      try {
        const data = await chatService.getMessages(convoId, 1, 200);
        setMessages(data.messages);
      } catch {
        /* silent */
      } finally {
        setMsgsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Polling for new messages
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadConversations();
      if (activeConvo) {
        loadMessages(activeConvo.id);
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [activeConvo, loadConversations, loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [messages]);

  // ── User search ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const users = await chatService.searchUsers(searchTerm);
        setSearchResults(users);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, [searchTerm]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const openConversation = async (convo: Conversation) => {
    setActiveConvo(convo);
    setSearchTerm('');
    setSearchResults([]);
    await loadMessages(convo.id);
    await chatService.markAsRead(convo.id);
    loadConversations();
  };

  const startDirectChat = async (targetUser: ChatUser) => {
    try {
      const convo = await chatService.getOrCreateDirect(targetUser.id);
      setSearchTerm('');
      setSearchResults([]);
      setActiveConvo(convo);
      await loadMessages(convo.id);
      loadConversations();
    } catch {
      /* silent */
    }
  };

  const handleSendMessage = async () => {
    if (!msgInput.trim() || !activeConvo || sending) return;
    setSending(true);
    try {
      await chatService.sendMessage(activeConvo.id, msgInput.trim());
      setMsgInput('');
      await loadMessages(activeConvo.id);
      loadConversations();
    } catch {
      /* silent */
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ── Group creation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!groupSearch.trim()) {
      setGroupSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const users = await chatService.searchUsers(groupSearch);
        setGroupSearchResults(users.filter((u) => !selectedMembers.find((m) => m.id === u.id)));
      } catch {
        setGroupSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [groupSearch, selectedMembers]);

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;
    setGroupCreating(true);
    try {
      const convo = await chatService.createGroup(
        groupName.trim(),
        selectedMembers.map((m) => m.id)
      );
      setGroupDialogOpen(false);
      setGroupName('');
      setSelectedMembers([]);
      setGroupSearch('');
      setActiveConvo(convo);
      await loadMessages(convo.id);
      loadConversations();
    } catch {
      /* silent */
    } finally {
      setGroupCreating(false);
    }
  };

  // ── Group management ───────────────────────────────────────────────────────
  useEffect(() => {
    if (manageAction !== 'add' || !manageSearch.trim()) {
      setManageSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const users = await chatService.searchUsers(manageSearch);
        const memberIds = activeConvo?.participants.map((p) => p.user_id) || [];
        setManageSearchResults(users.filter((u) => !memberIds.includes(u.id)));
      } catch {
        setManageSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [manageSearch, manageAction, activeConvo]);

  const handleManageGroup = async () => {
    if (!activeConvo) return;
    try {
      let updated: Conversation;
      if (manageAction === 'rename') {
        updated = await chatService.updateGroup(activeConvo.id, { name: renameValue.trim() });
      } else if (manageAction === 'add') {
        updated = await chatService.updateGroup(activeConvo.id, { addMembers: manageSelectedUsers });
      } else {
        updated = await chatService.updateGroup(activeConvo.id, { removeMembers: manageSelectedUsers });
      }
      setActiveConvo(updated);
      setManageDialogOpen(false);
      setManageSelectedUsers([]);
      setManageSearch('');
      setRenameValue('');
      loadConversations();
      if (activeConvo) loadMessages(activeConvo.id);
    } catch {
      /* silent */
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const getConvoName = (convo: Conversation) => {
    if (convo.type === 'group') return convo.name || 'Group';
    const other = convo.participants?.find((p) => p.user_id !== user?.id);
    return other?.user?.name || 'User';
  };

  const getConvoAvatar = (convo: Conversation) => {
    if (convo.type === 'group') return null;
    const other = convo.participants?.find((p) => p.user_id !== user?.id);
    return other?.user;
  };

  const filteredConversations = conversations.filter((c) => {
    if (!searchTerm.trim()) return true;
    const name = getConvoName(c).toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 96px)', bgcolor: 'var(--bg-surface)', borderRadius: '12px', border: `1px solid ${BORDER}`, overflow: 'hidden', boxShadow: 'none' }}>
      {/* ════════════════════════════════════════════════════════════════════
          LEFT SIDEBAR — conversations list
         ════════════════════════════════════════════════════════════════════ */}
      <Box sx={{ width: 340, borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Header */}
        <Box sx={{ p: 2.5, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ForumIcon sx={{ color: PRIMARY, fontSize: 22 }} />
            <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: TEXT_DARK, letterSpacing: '-0.02em' }}>Messages</Typography>
          </Box>
          {isAdmin && (
            <Tooltip title="Create Group">
              <IconButton size="small" onClick={() => setGroupDialogOpen(true)} sx={{ bgcolor: PRIMARY_LIGHT, color: PRIMARY, '&:hover': { bgcolor: alpha(PRIMARY, 0.15) } }}>
                <AddIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Search */}
        <Box sx={{ px: 2, pb: 1.5 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search users or conversations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: TEXT_LIGHT }} />
                </InputAdornment>
              ),
              sx: {
                borderRadius: '10px',
                bgcolor: '#FAFAFA',
                fontSize: '0.85rem',
                '& fieldset': { borderColor: 'var(--border-subtle)' },
                '&:hover fieldset': { borderColor: 'var(--text-muted) !important' },
                '&.Mui-focused fieldset': { borderColor: `${PRIMARY} !important` },
              },
            }}
          />
          {/* Search dropdown */}
          {searchTerm.trim() && searchResults.length > 0 && (
            <Box sx={{ mt: 0.5, border: `1px solid ${BORDER}`, borderRadius: '10px', bgcolor: 'var(--bg-surface-2)', boxShadow: 'none', maxHeight: 240, overflow: 'auto', position: 'relative', zIndex: 10 }}>
              {searchResults.map((u) => (
                <ListItemButton key={u.id} onClick={() => startDirectChat(u)} sx={{ py: 1, px: 1.5, '&:hover': { bgcolor: BG_HOVER } }}>
                  <ListItemAvatar sx={{ minWidth: 40 }}>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: getAvatarColor(u.id), fontSize: '0.75rem', fontWeight: 700 }}>
                      {getInitials(u.name)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={u.name}
                    secondary={u.email}
                    primaryTypographyProps={{ fontSize: '0.82rem', fontWeight: 600, color: TEXT_DARK }}
                    secondaryTypographyProps={{ fontSize: '0.72rem', color: TEXT_LIGHT }}
                  />
                  <Chip label={u.role === 'main_admin' ? 'Admin' : u.role} size="small" sx={{ height: 20, fontSize: '0.62rem', fontWeight: 600, bgcolor: BG_ACTIVE, color: TEXT_MED }} />
                </ListItemButton>
              ))}
            </Box>
          )}
          {searchTerm.trim() && searchLoading && (
            <Box sx={{ mt: 1, textAlign: 'center' }}>
              <CircularProgress size={18} sx={{ color: PRIMARY }} />
            </Box>
          )}
        </Box>

        {/* Conversation list */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {convosLoading ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <CircularProgress size={28} sx={{ color: PRIMARY }} />
            </Box>
          ) : filteredConversations.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <ChatIcon sx={{ fontSize: 40, color: 'var(--border)', mb: 1 }} />
              <Typography sx={{ fontSize: '0.85rem', color: TEXT_LIGHT }}>No conversations yet</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: TEXT_LIGHT, mt: 0.5 }}>Search for a user to start chatting</Typography>
            </Box>
          ) : (
            filteredConversations.map((convo) => {
              const name = getConvoName(convo);
              const convoUser = getConvoAvatar(convo);
              const isActive = activeConvo?.id === convo.id;
              const hasUnread = (convo.unread_count || 0) > 0;
              return (
                <ListItemButton
                  key={convo.id}
                  onClick={() => openConversation(convo)}
                  sx={{
                    px: 2, py: 1.5, mx: 1, mb: 0.5, borderRadius: '10px',
                    bgcolor: isActive ? PRIMARY_LIGHT : 'transparent',
                    borderLeft: isActive ? `3px solid ${PRIMARY}` : '3px solid transparent',
                    '&:hover': { bgcolor: isActive ? PRIMARY_LIGHT : BG_HOVER },
                    transition: 'all 0.15s ease',
                  }}
                >
                  <ListItemAvatar sx={{ minWidth: 44 }}>
                    <Badge
                      badgeContent={convo.unread_count || 0}
                      color="error"
                      invisible={!hasUnread}
                      sx={{ '& .MuiBadge-badge': { fontSize: '0.6rem', height: 16, minWidth: 16 } }}
                    >
                      <Avatar
                        sx={{
                          width: 36, height: 36,
                          bgcolor: convo.type === 'group' ? '#166354' : getAvatarColor(convoUser?.id || ''),
                          fontSize: '0.78rem', fontWeight: 700,
                        }}
                      >
                        {convo.type === 'group' ? <GroupIcon sx={{ fontSize: 18 }} /> : getInitials(name)}
                      </Avatar>
                    </Badge>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography sx={{ fontSize: '0.84rem', fontWeight: hasUnread ? 700 : 500, color: TEXT_DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                          {name}
                        </Typography>
                        {convo.last_message_at && (
                          <Typography sx={{ fontSize: '0.65rem', color: hasUnread ? PRIMARY : TEXT_LIGHT, fontWeight: hasUnread ? 600 : 400, flexShrink: 0 }}>
                            {formatTime(convo.last_message_at)}
                          </Typography>
                        )}
                      </Box>
                    }
                    secondary={
                      <Typography sx={{ fontSize: '0.75rem', color: hasUnread ? TEXT_MED : TEXT_LIGHT, fontWeight: hasUnread ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', mt: 0.2 }}>
                        {convo.last_message_preview || 'No messages yet'}
                      </Typography>
                    }
                  />
                </ListItemButton>
              );
            })
          )}
        </Box>
      </Box>

      {/* ════════════════════════════════════════════════════════════════════
          RIGHT SIDE — messages area
         ════════════════════════════════════════════════════════════════════ */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: '#FAFAFA' }}>
        {!activeConvo ? (
          /* Empty state */
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <Box sx={{ width: 80, height: 80, borderRadius: '20px', bgcolor: PRIMARY_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
              <ForumIcon sx={{ fontSize: 36, color: PRIMARY }} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: '1.15rem', color: TEXT_DARK, mb: 0.5 }}>Welcome to Messages</Typography>
            <Typography sx={{ fontSize: '0.85rem', color: TEXT_LIGHT, textAlign: 'center', maxWidth: 320 }}>
              Search for a user to start a conversation, or select an existing chat from the sidebar.
            </Typography>
          </Box>
        ) : (
          <>
            {/* Chat header */}
            <Box sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${BORDER}`, bgcolor: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 64 }}>
              <Avatar
                sx={{
                  width: 38, height: 38,
                  bgcolor: activeConvo.type === 'group' ? '#166354' : getAvatarColor(getConvoAvatar(activeConvo)?.id || ''),
                  fontSize: '0.82rem', fontWeight: 700,
                }}
              >
                {activeConvo.type === 'group' ? <GroupIcon sx={{ fontSize: 20 }} /> : getInitials(getConvoName(activeConvo))}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: TEXT_DARK }}>{getConvoName(activeConvo)}</Typography>
                <Typography sx={{ fontSize: '0.72rem', color: TEXT_LIGHT }}>
                  {activeConvo.type === 'group'
                    ? `${activeConvo.participants?.length || 0} members`
                    : activeConvo.participants?.find((p) => p.user_id !== user?.id)?.user?.email || ''}
                </Typography>
              </Box>
              {activeConvo.type === 'group' && isAdmin && (
                <Tooltip title="Group Settings">
                  <IconButton size="small" onClick={(e) => setGroupMenuAnchor(e.currentTarget)} sx={{ color: TEXT_MED }}>
                    <MoreVertIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>
              )}
              {/* Group management menu */}
              <Menu
                anchorEl={groupMenuAnchor}
                open={Boolean(groupMenuAnchor)}
                onClose={() => setGroupMenuAnchor(null)}
                PaperProps={{ sx: { borderRadius: '12px', minWidth: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } }}
              >
                <MenuItem onClick={() => { setManageAction('rename'); setRenameValue(activeConvo?.name || ''); setManageDialogOpen(true); setGroupMenuAnchor(null); }}>
                  <ListItemIcon><EditIcon fontSize="small" sx={{ color: TEXT_MED }} /></ListItemIcon>
                  <Typography sx={{ fontSize: '0.85rem' }}>Rename Group</Typography>
                </MenuItem>
                <MenuItem onClick={() => { setManageAction('add'); setManageDialogOpen(true); setGroupMenuAnchor(null); }}>
                  <ListItemIcon><PersonAddIcon fontSize="small" sx={{ color: TEXT_MED }} /></ListItemIcon>
                  <Typography sx={{ fontSize: '0.85rem' }}>Add Members</Typography>
                </MenuItem>
                <MenuItem onClick={() => { setManageAction('remove'); setManageDialogOpen(true); setGroupMenuAnchor(null); }}>
                  <ListItemIcon><PersonRemoveIcon fontSize="small" sx={{ color: '#EF4444' }} /></ListItemIcon>
                  <Typography sx={{ fontSize: '0.85rem', color: '#EF4444' }}>Remove Members</Typography>
                </MenuItem>
              </Menu>
            </Box>

            {/* Messages area */}
            <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 2 }}>
              {msgsLoading ? (
                <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={28} sx={{ color: PRIMARY }} /></Box>
              ) : messages.length === 0 ? (
                <Box sx={{ py: 6, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.85rem', color: TEXT_LIGHT }}>No messages yet. Say hello!</Typography>
                </Box>
              ) : (
                (() => {
                  let lastDate = '';
                  return messages.map((msg) => {
                    const isSelf = msg.sender_id === user?.id;
                    const isSystem = msg.type === 'system';
                    const msgDate = formatMsgDate(msg.created_at);
                    const showDateSep = msgDate !== lastDate;
                    lastDate = msgDate;

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateSep && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 2 }}>
                            <Box sx={{ flex: 1, height: '1px', bgcolor: 'var(--border)' }} />
                            <Typography sx={{ fontSize: '0.68rem', color: TEXT_LIGHT, fontWeight: 600, whiteSpace: 'nowrap' }}>{msgDate}</Typography>
                            <Box sx={{ flex: 1, height: '1px', bgcolor: 'var(--border)' }} />
                          </Box>
                        )}
                        {isSystem ? (
                          <Box sx={{ textAlign: 'center', my: 1.5 }}>
                            <Typography sx={{ fontSize: '0.72rem', color: TEXT_LIGHT, fontStyle: 'italic', bgcolor: 'var(--bg-canvas)', display: 'inline-block', px: 2, py: 0.5, borderRadius: '8px' }}>
                              {msg.content}
                            </Typography>
                          </Box>
                        ) : (
                          <Box sx={{ display: 'flex', justifyContent: isSelf ? 'flex-end' : 'flex-start', mb: 1, gap: 1 }}>
                            {!isSelf && (
                              <Avatar sx={{ width: 30, height: 30, bgcolor: getAvatarColor(msg.sender_id), fontSize: '0.68rem', fontWeight: 700, mt: 0.4, flexShrink: 0 }}>
                                {getInitials(msg.sender?.name || '?')}
                              </Avatar>
                            )}
                            <Box sx={{ maxWidth: '65%', minWidth: 80 }}>
                              {!isSelf && activeConvo?.type === 'group' && (
                                <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: getAvatarColor(msg.sender_id), mb: 0.3, px: 0.5 }}>
                                  {msg.sender?.name}
                                </Typography>
                              )}
                              <Box
                                sx={{
                                  bgcolor: isSelf ? BG_MSG_SELF : BG_MSG_OTHER,
                                  color: isSelf ? '#fff' : TEXT_DARK,
                                  px: 1.8, py: 1,
                                  borderRadius: isSelf ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                  fontSize: '0.84rem', lineHeight: 1.5,
                                  boxShadow: isSelf ? '0 1px 4px rgba(31, 122, 99,0.15)' : 'none',
                                  wordBreak: 'break-word',
                                }}
                              >
                                {msg.content}
                              </Box>
                              <Typography sx={{ fontSize: '0.62rem', color: TEXT_LIGHT, mt: 0.3, px: 0.5, textAlign: isSelf ? 'right' : 'left' }}>
                                {formatMsgTime(msg.created_at)}
                              </Typography>
                            </Box>
                          </Box>
                        )}
                      </React.Fragment>
                    );
                  });
                })()
              )}
              <div ref={messagesEndRef} />
            </Box>

            {/* Message input */}
            <Box sx={{ px: 2.5, py: 1.5, borderTop: `1px solid ${BORDER}`, bgcolor: 'var(--bg-surface-2)' }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                <TextField
                  fullWidth
                  multiline
                  maxRows={4}
                  size="small"
                  placeholder="Enter Message..."
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  InputProps={{
                    sx: {
                      borderRadius: '12px',
                      bgcolor: '#FAFAFA',
                      fontSize: '0.85rem',
                      '& fieldset': { borderColor: 'var(--border-subtle)' },
                      '&:hover fieldset': { borderColor: 'var(--text-muted) !important' },
                      '&.Mui-focused fieldset': { borderColor: `${PRIMARY} !important` },
                    },
                  }}
                />
                <IconButton
                  onClick={handleSendMessage}
                  disabled={!msgInput.trim() || sending}
                  sx={{
                    bgcolor: PRIMARY,
                    color: '#fff',
                    width: 40, height: 40,
                    borderRadius: '10px',
                    '&:hover': { bgcolor: '#1F7A63' },
                    '&.Mui-disabled': { bgcolor: 'var(--border)', color: 'var(--text-muted)' },
                    transition: 'all 0.15s ease',
                  }}
                >
                  {sending ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <SendIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </Box>
            </Box>
          </>
        )}
      </Box>

      {/* ════════════════════════════════════════════════════════════════════
          CREATE GROUP DIALOG
         ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={groupDialogOpen} onClose={() => setGroupDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.05rem', color: TEXT_DARK, pb: 1 }}>Create Group Chat</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <TextField
            fullWidth size="small" label="Group Name" value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
          />
          <TextField
            fullWidth size="small" label="Search users to add..."
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
          />
          {/* Selected members */}
          {selectedMembers.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
              {selectedMembers.map((m) => (
                <Chip
                  key={m.id} label={m.name} size="small"
                  onDelete={() => setSelectedMembers((prev) => prev.filter((x) => x.id !== m.id))}
                  sx={{ bgcolor: PRIMARY_LIGHT, color: PRIMARY, fontWeight: 600, fontSize: '0.75rem' }}
                />
              ))}
            </Box>
          )}
          {/* Search results */}
          {groupSearchResults.length > 0 && (
            <List dense sx={{ maxHeight: 200, overflow: 'auto', border: `1px solid ${BORDER}`, borderRadius: '10px' }}>
              {groupSearchResults.map((u) => (
                <ListItem key={u.id} disablePadding>
                  <ListItemButton onClick={() => { setSelectedMembers((prev) => [...prev, u]); setGroupSearch(''); }}>
                    <ListItemAvatar sx={{ minWidth: 36 }}>
                      <Avatar sx={{ width: 28, height: 28, bgcolor: getAvatarColor(u.id), fontSize: '0.68rem', fontWeight: 700 }}>
                        {getInitials(u.name)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText primary={u.name} secondary={u.email} primaryTypographyProps={{ fontSize: '0.82rem', fontWeight: 500 }} secondaryTypographyProps={{ fontSize: '0.7rem' }} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setGroupDialogOpen(false)} sx={{ textTransform: 'none', color: TEXT_MED }}>Cancel</Button>
          <Button
            onClick={handleCreateGroup}
            disabled={!groupName.trim() || selectedMembers.length === 0 || groupCreating}
            variant="contained"
            sx={{ textTransform: 'none', bgcolor: PRIMARY, borderRadius: '8px', fontWeight: 600, '&:hover': { bgcolor: '#1F7A63' } }}
          >
            {groupCreating ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : 'Create Group'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════
          MANAGE GROUP DIALOG
         ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={manageDialogOpen} onClose={() => setManageDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.05rem', color: TEXT_DARK, pb: 1 }}>
          {manageAction === 'rename' ? 'Rename Group' : manageAction === 'add' ? 'Add Members' : 'Remove Members'}
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {manageAction === 'rename' && (
            <TextField
              fullWidth size="small" label="New group name" value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
            />
          )}
          {manageAction === 'add' && (
            <>
              <TextField
                fullWidth size="small" label="Search users..." value={manageSearch}
                onChange={(e) => setManageSearch(e.target.value)}
                sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }}
              />
              {manageSearchResults.length > 0 && (
                <List dense sx={{ maxHeight: 200, overflow: 'auto', border: `1px solid ${BORDER}`, borderRadius: '10px' }}>
                  {manageSearchResults.map((u) => (
                    <ListItem key={u.id} disablePadding>
                      <ListItemButton onClick={() => setManageSelectedUsers((prev) => prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id])}>
                        <Checkbox size="small" checked={manageSelectedUsers.includes(u.id)} sx={{ '&.Mui-checked': { color: PRIMARY } }} />
                        <ListItemAvatar sx={{ minWidth: 36 }}>
                          <Avatar sx={{ width: 28, height: 28, bgcolor: getAvatarColor(u.id), fontSize: '0.68rem', fontWeight: 700 }}>{getInitials(u.name)}</Avatar>
                        </ListItemAvatar>
                        <ListItemText primary={u.name} secondary={u.email} primaryTypographyProps={{ fontSize: '0.82rem' }} secondaryTypographyProps={{ fontSize: '0.7rem' }} />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              )}
            </>
          )}
          {manageAction === 'remove' && (
            <List dense sx={{ maxHeight: 260, overflow: 'auto', border: `1px solid ${BORDER}`, borderRadius: '10px' }}>
              {activeConvo?.participants
                ?.filter((p) => p.user_id !== activeConvo.created_by)
                .map((p) => (
                  <ListItem key={p.user_id} disablePadding>
                    <ListItemButton onClick={() => setManageSelectedUsers((prev) => prev.includes(p.user_id) ? prev.filter((x) => x !== p.user_id) : [...prev, p.user_id])}>
                      <Checkbox size="small" checked={manageSelectedUsers.includes(p.user_id)} sx={{ '&.Mui-checked': { color: '#EF4444' } }} />
                      <ListItemAvatar sx={{ minWidth: 36 }}>
                        <Avatar sx={{ width: 28, height: 28, bgcolor: getAvatarColor(p.user_id), fontSize: '0.68rem', fontWeight: 700 }}>{getInitials(p.user?.name || '?')}</Avatar>
                      </ListItemAvatar>
                      <ListItemText primary={p.user?.name} secondary={p.user?.email} primaryTypographyProps={{ fontSize: '0.82rem' }} secondaryTypographyProps={{ fontSize: '0.7rem' }} />
                    </ListItemButton>
                  </ListItem>
                ))}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setManageDialogOpen(false); setManageSelectedUsers([]); setManageSearch(''); }} sx={{ textTransform: 'none', color: TEXT_MED }}>Cancel</Button>
          <Button
            onClick={handleManageGroup}
            disabled={
              (manageAction === 'rename' && !renameValue.trim()) ||
              (manageAction !== 'rename' && manageSelectedUsers.length === 0)
            }
            variant="contained"
            sx={{
              textTransform: 'none', borderRadius: '8px', fontWeight: 600,
              bgcolor: manageAction === 'remove' ? '#EF4444' : PRIMARY,
              '&:hover': { bgcolor: manageAction === 'remove' ? '#DC2626' : '#1F7A63' },
            }}
          >
            {manageAction === 'rename' ? 'Rename' : manageAction === 'add' ? 'Add Selected' : 'Remove Selected'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChatPage;
