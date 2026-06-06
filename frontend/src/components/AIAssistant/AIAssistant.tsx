import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Drawer,
  Typography,
  IconButton,
  TextField,
  Paper,
  Chip,
  CircularProgress,
  Fade,
  Divider,
  Avatar,
  Tooltip,
  Button,
} from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { aiService, AIMessage, QuickAction } from '../../services/aiService';

// ─── Color Tokens ────────────────────────────────────────────────────────────
const PRIMARY    = '#1F7A63';
const PRIMARY_DK = '#166354';
const PRIMARY_LT = '#2A9D7E';
const TEXT_DARK = 'var(--text-primary)';
const TEXT_MED = 'var(--text-secondary)';
const TEXT_LIGHT = 'var(--text-muted)';
const BORDER = 'var(--border)';
const BG_PAGE = 'var(--bg-canvas)';

const DRAWER_WIDTH = 420;

interface AIAssistantProps {
  open: boolean;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
const AIAssistant: React.FC<AIAssistantProps> = ({ open, onClose: onCloseProp }) => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsTitle, setSuggestionsTitle] = useState('');
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // ─── Actions ─────────────────────────────────────────────────────────────
  const handleClearChat = () => setMessages([]);
  const handleNewChat = () => {
    setMessages([]);
    setSuggestions([]);
    setSuggestionsTitle('');
    setQuickActions([]);
    setInput('');
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 300);
  };
  const onClose = () => onCloseProp();

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // Load page-aware suggestions when drawer opens or page changes
  useEffect(() => {
    if (open) {
      loadSuggestions();
      setTimeout(() => inputRef.current?.focus(), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, location.pathname]);

  // Welcome message + auto daily summary on first open
  useEffect(() => {
    if (open && messages.length === 0) {
      const h = new Date().getHours();
      const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `${greet}! 👋\n\nI'm your **Amber AI** — your smart operational assistant. 🚀\n\nHere's what I can help with:\n\n• ⚡ **Operate** — Create projects, generate quotations, send RFQs, create invoices\n• 🧭 **Navigate** — "Open Projects", "Go to Analytics"\n• 📊 **Analytics** — "Daily summary", "Revenue report", "Active orders"\n• 📎 **Documents** — Upload & auto-classify documents\n• 🎤 **Voice** — Click the mic icon and speak\n• 📚 **Learn** — Ask about any module or workflow\n• 🛠️ **Troubleshoot** — Describe issues and I'll guide you\n\nI always confirm before taking any action. What do you need?`,
        timestamp: new Date(),
        suggestions: ['What can you do?', 'Daily summary', 'Create a project'],
        quickActions: [
          { label: '➕ Create Project', action: 'create_project' },
          { label: '📊 Daily Summary', action: 'get_daily_summary' },
          { label: '📈 Analytics', path: '/analytics' },
        ],
      }]);

      // Auto-fetch daily summary
      (async () => {
        try {
          const res = await aiService.sendMessage('daily summary', location.pathname);
          if (res.success && res.data?.message) {
            setMessages(prev => [...prev, {
              id: `summary-${Date.now()}`,
              role: 'assistant',
              content: res.data.message,
              timestamp: new Date(),
              suggestions: res.data.suggestions || ['Revenue report', 'Active orders', 'Create a project'],
              quickActions: res.data.quickActions || [],
            }]);
          }
        } catch { /* Daily summary is non-critical */ }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const loadSuggestions = async () => {
    try {
      const res = await aiService.getSuggestions(location.pathname);
      if (res.success) {
        setSuggestions(res.data.suggestions);
        setSuggestionsTitle(res.data.title);
        if (res.data.quickActions?.length) setQuickActions(res.data.quickActions);
      }
    } catch { /* suggestions are optional */ }
  };

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMessage: AIMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await aiService.sendMessage(msg, location.pathname);

      const assistantMessage: AIMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: res.data.message,
        timestamp: new Date(),
        suggestions: res.data.suggestions,
        action: res.data.action,
        quickActions: res.data.quickActions,
        confirmationCard: res.data.confirmationCard || null,
        followUp: res.data.followUp || false,
        followUpParam: res.data.followUpParam || null,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Update the global quickActions if the response has them
      if (res.data.quickActions?.length) setQuickActions(res.data.quickActions);
    } catch {
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Oops, ran into an error — try again? 😅',
        timestamp: new Date(),
        suggestions: ['Dashboard overview', 'What can you do?'],
      }]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Voice Input (Web Speech API) ────────────────────────────────────────
  const toggleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages(prev => [...prev, {
        id: `voice-err-${Date.now()}`,
        role: 'assistant',
        content: '🎤 Voice input is not supported in this browser. Try Chrome or Edge.',
        timestamp: new Date(),
      }]);
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => (prev ? prev + ' ' : '') + transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // ─── Document Upload ─────────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show user message
    setMessages(prev => [...prev, {
      id: `user-file-${Date.now()}`,
      role: 'user',
      content: `📎 Uploaded: **${file.name}** (${(file.size / 1024).toFixed(1)} KB)`,
      timestamp: new Date(),
    }]);
    setLoading(true);

    try {
      const res = await aiService.uploadDocument(file);

      setMessages(prev => [...prev, {
        id: `doc-${Date.now()}`,
        role: 'assistant',
        content: res.data.message,
        timestamp: new Date(),
        suggestions: res.data.suggestions || [],
        documentResult: {
          classification: res.data.classification,
          extractedData: res.data.extractedData,
          suggestedActions: res.data.suggestedActions || [],
        },
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: `doc-err-${Date.now()}`,
        role: 'assistant',
        content: '⚠️ Failed to process the document. Please try again.',
        timestamp: new Date(),
        suggestions: ['Upload another document'],
      }]);
    } finally {
      setLoading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleSuggestionClick = (s: string) => {
    const clean = s.replace(/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]+\s*/u, '').trim();
    sendMessage(clean || s);
  };

  const handleNavigate = (path: string) => { navigate(path); onClose(); };

  // ─── Markdown renderer (bold + bullet support) ───────────────────────────
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    return (
      <>
        {lines.map((line, li) => {
          const parts = line.split(/(\*\*[^*]+\*\*)/g);
          const rendered = parts.map((part, pi) => {
            if (part.startsWith('**') && part.endsWith('**'))
              return <strong key={pi}>{part.slice(2, -2)}</strong>;
            return <span key={pi}>{part}</span>;
          });
          return (
            <React.Fragment key={li}>
              {rendered}
              {li < lines.length - 1 && <br />}
            </React.Fragment>
          );
        })}
      </>
    );
  };

  // ─── Render a message bubble ─────────────────────────────────────────────
  const renderMessage = (msg: AIMessage) => {
    const isUser = msg.role === 'user';
    return (
      <Fade in key={msg.id}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', mb: 2 }}>
          {/* Label */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
            {!isUser && (
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                bgcolor: '#f5f5f5', 
                borderRadius: '6px', 
                px: 0.75, 
                py: 0.25 
              }}>
                <Typography sx={{ fontWeight: 800, fontSize: '0.65rem', color: '#1a1a1a', letterSpacing: '-0.3px' }}>
                  A
                </Typography>
                <Typography sx={{ fontWeight: 800, fontSize: '0.65rem', color: '#FF4136', letterSpacing: '-0.3px' }}>
                  .
                </Typography>
              </Box>
            )}
            <Typography sx={{ fontSize: '0.7rem', color: TEXT_LIGHT, fontWeight: 500 }}>
              {isUser ? 'You' : 'Amber AI'}
            </Typography>
          </Box>

          {/* Bubble */}
          <Paper
            elevation={0}
            sx={{
              p: 1.5, px: 2,
              maxWidth: '90%',
              borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: isUser ? `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_LT})` : 'var(--border-subtle)',
              color: isUser ? '#fff' : TEXT_DARK,
              fontSize: '0.84rem',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              '& strong, & b': { fontWeight: 600, color: isUser ? '#fff' : TEXT_DARK },
            }}
          >
            {renderMarkdown(msg.content)}
          </Paper>

          {/* Navigation action chip */}
          {msg.action?.type === 'navigate' && msg.action?.path && (
            <Chip
              icon={<NavigateNextIcon sx={{ fontSize: 16 }} />}
              label={`Go to ${msg.action.path}`}
              size="small"
              onClick={() => handleNavigate(msg.action!.path)}
              sx={{
                mt: 1, bgcolor: 'rgba(31, 122, 99,0.08)', color: PRIMARY,
                fontWeight: 500, fontSize: '0.75rem', cursor: 'pointer',
                border: `1px solid ${BORDER}`,
                '&:hover': { bgcolor: 'rgba(31, 122, 99,0.15)' },
              }}
            />
          )}

          {/* Quick Action buttons from this message */}
          {msg.quickActions && msg.quickActions.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1, maxWidth: '90%' }}>
              {msg.quickActions.map((qa, i) => (
                <Button
                  key={i}
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    if (qa.action) {
                      sendMessage(qa.label.replace(/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]+\s*/u, ''));
                    } else if (qa.path) {
                      handleNavigate(qa.path);
                    }
                  }}
                  startIcon={<RocketLaunchIcon sx={{ fontSize: '14px !important' }} />}
                  sx={{
                    textTransform: 'none',
                    fontSize: '0.73rem',
                    fontWeight: 600,
                    borderRadius: '10px',
                    px: 1.5, py: 0.4,
                    borderColor: PRIMARY,
                    color: PRIMARY,
                    bgcolor: 'rgba(31, 122, 99,0.04)',
                    '&:hover': { bgcolor: 'rgba(31, 122, 99,0.12)', borderColor: PRIMARY_DK },
                  }}
                >
                  {qa.label}
                </Button>
              ))}
            </Box>
          )}

          {/* ── Confirmation Card ──────────────────────────────────────────── */}
          {msg.confirmationCard && (
            <Paper
              elevation={1}
              sx={{
                mt: 1.5, p: 2, maxWidth: '90%',
                borderRadius: '12px',
                border: `2px solid ${PRIMARY}`,
                bgcolor: 'rgba(31, 122, 99,0.03)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <DescriptionOutlinedIcon sx={{ fontSize: 18, color: PRIMARY }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: PRIMARY }}>
                  Action Confirmation
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.76rem', color: TEXT_DARK, mb: 1 }}>
                {msg.confirmationCard.description}
              </Typography>
              {msg.confirmationCard.params && Object.keys(msg.confirmationCard.params).length > 0 && (
                <Box sx={{ mb: 1.5 }}>
                  {Object.entries(msg.confirmationCard.params).map(([k, v]) => (
                    <Typography key={k} sx={{ fontSize: '0.72rem', color: TEXT_MED, lineHeight: 1.6 }}>
                      <strong>{k.replace(/_/g, ' ')}:</strong> {String(v)}
                    </Typography>
                  ))}
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<CheckCircleOutlineIcon sx={{ fontSize: '16px !important' }} />}
                  onClick={() => sendMessage('approve')}
                  sx={{
                    textTransform: 'none', fontSize: '0.73rem', fontWeight: 600,
                    bgcolor: PRIMARY, borderRadius: '8px',
                    '&:hover': { bgcolor: PRIMARY_DK },
                  }}
                >
                  Approve
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<EditOutlinedIcon sx={{ fontSize: '16px !important' }} />}
                  onClick={() => sendMessage('edit')}
                  sx={{
                    textTransform: 'none', fontSize: '0.73rem', fontWeight: 600,
                    borderColor: TEXT_LIGHT, color: TEXT_MED, borderRadius: '8px',
                    '&:hover': { borderColor: PRIMARY, color: PRIMARY },
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<CancelOutlinedIcon sx={{ fontSize: '16px !important' }} />}
                  onClick={() => sendMessage('cancel')}
                  sx={{
                    textTransform: 'none', fontSize: '0.73rem', fontWeight: 600,
                    borderColor: '#ef5350', color: '#ef5350', borderRadius: '8px',
                    '&:hover': { bgcolor: 'rgba(239,83,80,0.06)' },
                  }}
                >
                  Cancel
                </Button>
              </Box>
            </Paper>
          )}

          {/* ── Document Result ────────────────────────────────────────────── */}
          {msg.documentResult && (
            <Paper
              elevation={1}
              sx={{
                mt: 1.5, p: 2, maxWidth: '90%',
                borderRadius: '12px',
                border: `2px solid #166354`,
                bgcolor: 'rgba(22,99,84,0.03)',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <DescriptionOutlinedIcon sx={{ fontSize: 18, color: '#166354' }} />
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: '#166354' }}>
                  {msg.documentResult.classification.icon} {msg.documentResult.classification.label}
                </Typography>
                <Chip
                  label={`${Math.round(msg.documentResult.classification.confidence * 100)}% confidence`}
                  size="small"
                  sx={{ fontSize: '0.65rem', height: 20, bgcolor: 'rgba(22,99,84,0.1)', color: '#166354' }}
                />
              </Box>
              {Object.keys(msg.documentResult.extractedData).length > 0 && (
                <Box sx={{ mb: 1 }}>
                  {Object.entries(msg.documentResult.extractedData).map(([k, v]) => (
                    <Typography key={k} sx={{ fontSize: '0.72rem', color: TEXT_MED, lineHeight: 1.6 }}>
                      <strong>{k.replace(/_/g, ' ')}:</strong> {v}
                    </Typography>
                  ))}
                </Box>
              )}
              {msg.documentResult.suggestedActions?.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {msg.documentResult.suggestedActions.map((sa, i) => (
                    <Chip
                      key={i}
                      label={sa}
                      size="small"
                      onClick={() => handleSuggestionClick(sa)}
                      sx={{
                        fontSize: '0.72rem', height: 26, bgcolor: 'var(--bg-surface-2)',
                        border: '1px solid #166354', color: '#a7e7d6', cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(22,99,84,0.18)' },
                      }}
                    />
                  ))}
                </Box>
              )}
            </Paper>
          )}

          {/* Suggestion chips */}
          {msg.suggestions && msg.suggestions.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1, maxWidth: '90%' }}>
              {msg.suggestions.map((s, i) => (
                <Chip
                  key={i}
                  label={s}
                  size="small"
                  onClick={() => handleSuggestionClick(s)}
                  sx={{
                    fontSize: '0.72rem', height: 26, bgcolor: 'var(--bg-surface-2)',
                    border: `1px solid ${BORDER}`, color: TEXT_MED, cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(31, 122, 99,0.16)', borderColor: PRIMARY },
                  }}
                />
              ))}
            </Box>
          )}
        </Box>
      </Fade>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* Drawer */}
      <Drawer
        anchor="right"
        open={open}
        onClose={onClose}
        PaperProps={{
          sx: {
            width: DRAWER_WIDTH, maxWidth: '100vw',
            border: 'none', boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
            display: 'flex', flexDirection: 'column',
          },
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2.5, py: 1.5, borderBottom: `1px solid ${BORDER}`, bgcolor: 'var(--bg-surface)',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              component="img"
              src="/amber-ai-logo.png"
              alt="Amber AI"
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
              }}
              sx={{
                height: 32,
                maxWidth: 100,
                objectFit: 'contain',
                mr: 1,
              }}
            />
            {/* Text fallback if image fails */}
            <Box sx={{ display: 'none', alignItems: 'center' }}>
              <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#1a1a1a', letterSpacing: '-0.5px' }}>
                AMBER
              </Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#FF4136', letterSpacing: '-0.5px', ml: 0.5 }}>
                AI.
              </Typography>
            </Box>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Tooltip title="New Chat" arrow>
              <Button
                onClick={handleNewChat}
                variant="outlined"
                color="primary"
                startIcon={<FiberNewIcon sx={{ fontSize: 18 }} />}
                sx={{ minWidth: 0, px: 1.5, py: 0.5, fontWeight: 600, fontSize: '0.75rem', borderColor: 'primary.main', '&:hover': { bgcolor: 'primary.light' } }}
              >
                New
              </Button>
            </Tooltip>
            <Tooltip title="Close" arrow>
              <IconButton onClick={onClose} sx={{ color: 'grey.700', bgcolor: 'grey.100', p: 0.75, '&:hover': { bgcolor: 'grey.300' } }}>
                <CloseIcon sx={{ fontSize: 22 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* ── Quick Actions Bar ──────────────────────────────────────────── */}
        {quickActions.length > 0 && messages.length <= 1 && (
          <Box sx={{ px: 2, py: 1.25, bgcolor: 'rgba(31, 122, 99,0.03)', borderBottom: `1px solid ${BORDER}` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
              <RocketLaunchIcon sx={{ fontSize: 14, color: PRIMARY }} />
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: PRIMARY, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Quick Actions
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {quickActions.map((qa, i) => (
                <Button
                  key={i}
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    if (qa.action) {
                      // Operational action — send as a chat message
                      sendMessage(qa.label.replace(/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]+\s*/u, ''));
                    } else if (qa.path) {
                      handleNavigate(qa.path);
                    }
                  }}
                  sx={{
                    textTransform: 'none', fontSize: '0.72rem', fontWeight: 600,
                    borderRadius: '10px', px: 1.5, py: 0.35,
                    borderColor: qa.action ? PRIMARY : BORDER,
                    color: qa.action ? PRIMARY : TEXT_MED,
                    bgcolor: qa.action ? 'rgba(31, 122, 99,0.10)' : 'var(--bg-surface-2)',
                    '&:hover': { bgcolor: 'rgba(31, 122, 99,0.12)', borderColor: PRIMARY, color: PRIMARY },
                  }}
                >
                  {qa.label}
                </Button>
              ))}
            </Box>
          </Box>
        )}

        {/* ── Page Context Suggestions ───────────────────────────────────── */}
        {suggestions.length > 0 && messages.length <= 1 && (
          <Box sx={{ px: 2, py: 1.25, bgcolor: 'rgba(31, 122, 99,0.02)', borderBottom: `1px solid ${BORDER}` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
              <AutoAwesomeIcon sx={{ fontSize: 14, color: PRIMARY }} />
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: PRIMARY, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                {suggestionsTitle || 'Suggestions'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {suggestions.slice(0, 5).map((s, i) => (
                <Chip
                  key={i}
                  label={s.replace(/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]+\s*/u, '')}
                  size="small"
                  onClick={() => handleSuggestionClick(s)}
                  sx={{
                    fontSize: '0.72rem', height: 26, bgcolor: 'var(--bg-surface-2)',
                    border: `1px solid ${BORDER}`, color: TEXT_MED, cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(31, 122, 99,0.16)', borderColor: PRIMARY },
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* ── Messages Area ──────────────────────────────────────────────── */}
        <Box sx={{
          flex: 1, overflowY: 'auto', px: 2, py: 2,
          bgcolor: BG_PAGE, display: 'flex', flexDirection: 'column',
        }}>
          {messages.map(renderMessage)}

          {loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Avatar sx={{ width: 24, height: 24, background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_LT})`, fontSize: '0.75rem' }}>
                <SmartToyOutlinedIcon sx={{ fontSize: 16 }} />
              </Avatar>
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                bgcolor: 'var(--border-subtle)', borderRadius: '14px 14px 14px 4px', px: 2, py: 1,
              }}>
                <CircularProgress size={14} sx={{ color: PRIMARY }} />
                <Typography sx={{ fontSize: '0.8rem', color: TEXT_LIGHT }}>Thinking…</Typography>
              </Box>
            </Box>
          )}

          <div ref={messagesEndRef} />
        </Box>

        <Divider />

        {/* ── Input Area ─────────────────────────────────────────────────── */}
        <Box sx={{ px: 2, py: 1.5, bgcolor: 'var(--bg-surface)', display: 'flex', alignItems: 'flex-end', gap: 1 }}>
          {/* Hidden file input */}
          <input
            hidden
            type="file"
            ref={fileInputRef}
            aria-label="Upload Document"
            title="Upload Document"
            accept=".pdf,.txt,.csv,.json,.png,.jpg,.jpeg,.xlsx,.xls"
            onChange={handleFileUpload}
          />

          {/* Document upload button */}
          <Tooltip title="Upload Document" arrow>
            <IconButton
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              sx={{
                color: TEXT_MED, width: 36, height: 36, mb: 0.25,
                border: `1px solid ${BORDER}`, borderRadius: '10px',
                '&:hover': { bgcolor: 'rgba(22,99,84,0.08)', borderColor: '#166354', color: '#166354' },
                '&.Mui-disabled': { color: TEXT_LIGHT },
              }}
            >
              <AttachFileIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>

          <TextField
            inputRef={inputRef}
            fullWidth
            multiline
            maxRows={3}
            placeholder={isListening ? 'Listening…' : 'Ask me anything…'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            variant="outlined"
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: '12px', fontSize: '0.85rem', bgcolor: BG_PAGE,
                '& fieldset': { borderColor: isListening ? '#ef5350' : BORDER },
                '&:hover fieldset': { borderColor: TEXT_LIGHT },
                '&.Mui-focused fieldset': { borderColor: PRIMARY, borderWidth: 1 },
              },
            }}
          />

          {/* Voice input button */}
          <Tooltip title={isListening ? 'Stop Listening' : 'Voice Input'} arrow>
            <IconButton
              onClick={toggleVoiceInput}
              sx={{
                width: 36, height: 36, mb: 0.25,
                bgcolor: isListening ? '#ef5350' : 'transparent',
                color: isListening ? '#fff' : TEXT_MED,
                border: `1px solid ${isListening ? '#ef5350' : BORDER}`,
                borderRadius: '10px',
                animation: isListening ? 'pulse 1.5s infinite' : 'none',
                '@keyframes pulse': {
                  '0%': { boxShadow: '0 0 0 0 rgba(239,83,80,0.4)' },
                  '70%': { boxShadow: '0 0 0 8px rgba(239,83,80,0)' },
                  '100%': { boxShadow: '0 0 0 0 rgba(239,83,80,0)' },
                },
                '&:hover': {
                  bgcolor: isListening ? '#d32f2f' : 'rgba(31, 122, 99,0.08)',
                  borderColor: isListening ? '#d32f2f' : PRIMARY,
                  color: isListening ? '#fff' : PRIMARY,
                },
              }}
            >
              {isListening ? <MicOffIcon sx={{ fontSize: 18 }} /> : <MicIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>

          <IconButton
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            sx={{
              background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_LT})`,
              color: '#fff', width: 36, height: 36, mb: 0.25,
              '&:hover': { background: `linear-gradient(135deg, ${PRIMARY_DK}, ${PRIMARY})` },
              '&.Mui-disabled': { bgcolor: BORDER, color: TEXT_LIGHT },
            }}
          >
            <SendIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      </Drawer>
    </>
  );
};

export default AIAssistant;
