import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  Collapse,
  useTheme,
  alpha,
  Badge,
  Button,
  Popover,
  CircularProgress,
  Chip,
  Stack,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Folder as FolderIcon,
  People as PeopleIcon,
  LocalShipping as ShippingIcon,
  Settings as SettingsIcon,
  Shield as ShieldIcon,
  Radar as RadarIcon,
  Engineering as EngineeringIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
  Notifications as NotificationsIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ExpandMore as ExpandMoreIcon,
  AdminPanelSettings as AdminPanelIcon,
  Security as SecurityIcon,
  History as HistoryIcon,
  Group as GroupIcon,
  Business as BusinessIcon,
  FileCopy as FileCopyIcon,
  Lock as LockIcon,
  Devices as DevicesIcon,
  Approval as ApprovalIcon,
  Warning as WarningIcon,
  Search as SearchIcon,
  KeyboardArrowDown as ArrowDownIcon,
  Add as AddIcon,
  FiberManualRecord as DotIcon,
  Forum as ForumIcon,
  Inventory as InventoryIcon,
  BarChart as BarChartIcon,
  SmartToyOutlined as SmartToyIcon,
  Storage as StorageIcon,
  CalendarMonth as CalendarIcon,
  DeleteOutline as RecycleBinIcon,
  Build as BuildIcon,
  Memory as ComponentsIcon,
  ShoppingCart as ShoppingCartIcon,
  Science as ScienceIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  CameraAlt as CameraIcon,
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useThemeMode } from '../../contexts/ThemeContext';
import { canSeeSidebarItem, isCoAdmin } from '../../config/rolePermissions';
import { SupervisorAccount as CoAdminIcon } from '@mui/icons-material';
import api from '../../services/api';
import { chatService } from '../../services/chatService';
import GlobalSearch from '../GlobalSearch';
import AIAssistant from '../AIAssistant/AIAssistant';
import { useCompanyLogo, DEFAULT_LOGO } from '../../contexts/CompanyLogoContext';
import { clearActiveCompanyContext, getActiveCompanyContext, listenToActiveCompanyChange } from '../../utils/activeCompany';

// Default avatar images (stored in /public/avatars/)
const AVATAR_MALE = '/avatars/male.png';
const AVATAR_FEMALE = '/avatars/female.png';

// ─── Brand Tokens (constant across modes) ────────────────────────────────
const PRIMARY    = '#33d6ff';
const PRIMARY_DK = '#00bce0';
const PRIMARY_LT = '#5ce0ff';

// ─── Constants ───────────────────────────────────────────────────────────
const SIDEBAR_EXPANDED = 220;
const SIDEBAR_COLLAPSED = 64;
const HEADER_HEIGHT = 60;
const TRANSITION = '240ms cubic-bezier(0.4, 0, 0.2, 1)';

// Welcome messages that rotate
const WELCOME_MESSAGES = [
  'Welcome aboard!',
  'Great to see you back!',
  "Let's get things done!",
  "Ready for today's work?",
  'Good to have you here!',
  'Making progress together!',
  "Let's build something great!",
  'Glad to have you on the team!',
];

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const Layout: React.FC = () => {
  useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, refreshUser } = useAuth();
  const { logoUrl: companyLogoUrl } = useCompanyLogo();
  useThemeMode(); // keep provider connection alive
  const [activeCompany, setActiveCompany] = useState(() => getActiveCompanyContext());

  // Welcome message â€” pick one randomly on mount
  const welcomeMsg = useMemo(() => WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)], []);

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; }
    catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [acOpen, setAcOpen] = useState(() => location.pathname.startsWith('/access-control'));
  const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
  const [aiOpen, setAiOpen] = useState(false);

  // 3-dot menu state
  const [dotMenuAnchor, setDotMenuAnchor] = useState<null | HTMLElement>(null);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Notification state
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Chat unread count
  const [chatUnread, setChatUnread] = useState(0);

  const fetchChatUnread = useCallback(async () => {
    try {
      const count = await chatService.getUnreadCount();
      setChatUnread(count);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchChatUnread();
    const interval = setInterval(fetchChatUnread, 10000);
    return () => clearInterval(interval);
  }, [fetchChatUnread]);



  const drawerWidth = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  const isMainAdmin = user?.role === 'main_admin';
  const isAdmin = user?.role === 'admin';
  const isAdminPlus = isMainAdmin || isAdmin;
  const userIsCoAdmin = user?.is_co_admin ?? isCoAdmin(user?.role, user?.is_co_admin);
  const isAcPath = location.pathname.startsWith('/access-control');
  const isPlatformAdminInCompany = user?.role === 'platform_admin' && !!activeCompany;

  // RBAC visibility helpers
  const showAdministration = userIsCoAdmin || isMainAdmin; // Owner/Co-Owner/Super Admin
  const showEnterprise = user?.role === 'platform_admin'; // Platform Admin only â€” hidden for all company users
  const showEnterpriseItem = (path: string) => canSeeSidebarItem(user?.role, path, userIsCoAdmin);

  useEffect(() => { if (isAcPath) setAcOpen(true); }, [isAcPath]);

  useEffect(() => {
    const syncActiveCompany = () => setActiveCompany(getActiveCompanyContext());
    return listenToActiveCompanyChange(syncActiveCompany);
  }, []);

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  };

  const handleNav = (path: string) => { navigate(path); setMobileOpen(false); };
  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleProfileOpen = (e: React.MouseEvent<HTMLElement>) => setProfileAnchor(e.currentTarget);
  const handleProfileClose = () => setProfileAnchor(null);
  const handleLogout = () => { handleProfileClose(); logout(); navigate('/login'); };
  const handleExitCompany = () => {
    clearActiveCompanyContext();
    // Restore platform admin token if impersonating
    const savedToken = localStorage.getItem('platform_admin_token');
    const savedUser = localStorage.getItem('platform_admin_user');
    if (savedToken) {
      localStorage.setItem('token', savedToken);
      localStorage.removeItem('platform_admin_token');
    }
    if (savedUser) {
      localStorage.setItem('user', savedUser);
      localStorage.removeItem('platform_admin_user');
    }
    navigate('/platform-admin');
  };

  // 3-dot menu handlers
  const handleDotMenuOpen = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setDotMenuAnchor(e.currentTarget);
  };
  const handleDotMenuClose = () => setDotMenuAnchor(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      await api.post('/users/avatar', fd);
      await refreshUser();
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setAvatarUploading(false);
      handleDotMenuClose();
    }
  };

  const handleUpdateName = async () => {
    const trimmed = editNameValue.trim();
    if (!trimmed || trimmed === user?.name) { setEditNameOpen(false); return; }
    try {
      await api.put('/users/profile', { name: trimmed });
      await refreshUser();
    } catch (err) {
      console.error('Name update failed:', err);
    } finally {
      setEditNameOpen(false);
      handleDotMenuClose();
    }
  };

  // Helper: get avatar src with gender-aware fallback
  const getAvatarSrc = (avatar?: string | null) => {
    if (avatar) return avatar;
    const gender = (user as any)?.gender?.toLowerCase();
    if (gender === 'male') return AVATAR_MALE;
    if (gender === 'female') return AVATAR_FEMALE;
    return undefined; // blank â€” no image until gender selected or DP uploaded
  };

  // Notification handlers
  const fetchNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const res = await api.get('/audit-logs', { params: { page: 1, limit: 8 } });
      const logs = res.data?.logs || res.data?.data || (Array.isArray(res.data) ? res.data : []);
      // Merge in capacity in-app notifications (task assignments etc.). Optional —
      // degrades silently if the user lacks the capacity resource.
      let capItems: any[] = [];
      let capUnread = 0;
      try {
        const capRes = await api.get('/capacity/notifications');
        const capData = capRes.data?.data || {};
        capUnread = capData.unread || 0;
        capItems = (capData.items || []).filter((n: any) => !n.read_at).map((n: any) => ({
          id: 'cap-' + n.id,
          action: n.title,
          entity_name: n.body || 'Task update',
          created_at: n.created_at || n.createdAt,
          _capacity: true,
        }));
      } catch { /* capacity notifications are optional */ }
      const merged = [...capItems, ...logs].slice(0, 8);
      setNotifications(merged);
      setUnreadCount(capUnread + Math.min(logs.length, 8));
    } catch {
      setNotifications([]);
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleNotifOpen = (e: React.MouseEvent<HTMLElement>) => {
    setNotifAnchor(e.currentTarget);
    setUnreadCount(0);
  };
  const handleNotifClose = () => setNotifAnchor(null);

  const getNotifIcon = (action: string) => {
    if (action?.includes('create')) return { icon: <AddIcon sx={{ fontSize: 16 }} />, color: '#10B981' };
    if (action?.includes('update') || action?.includes('edit')) return { icon: <HistoryIcon sx={{ fontSize: 16 }} />, color: '#3B82F6' };
    if (action?.includes('delete')) return { icon: <WarningIcon sx={{ fontSize: 16 }} />, color: '#EF4444' };
    if (action?.includes('login')) return { icon: <PersonIcon sx={{ fontSize: 16 }} />, color: '#33d4ff' };
    return { icon: <DotIcon sx={{ fontSize: 16 }} />, color: '#94A3B8' };
  };

  const formatTimeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  // ─── Sidebar Nav Item ──────────────────────────────────────────────────────
  const renderNavItem = (icon: React.ReactNode, label: string, path: string, isCollapsedView: boolean) => {
    const active = isActive(path);
    const button = (
      <ListItemButton
        onClick={() => handleNav(path)}
        sx={{
          minHeight: 36,
          borderRadius: 0,
          mx: 0,
          px: isCollapsedView ? 0 : '20px',
          py: '8px',
          justifyContent: isCollapsedView ? 'center' : 'flex-start',
          transition: 'background 0.18s ease, color 0.18s ease',
          position: 'relative',
          borderLeft: active && !isCollapsedView ? `3px solid ${PRIMARY}` : '3px solid transparent',
          ...(active
            ? {
                bgcolor: '#1E2235',
                color: '#FFFFFF',
                '&::before': isCollapsedView ? {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: '50%',
                  width: 3,
                  height: '60%',
                  transform: 'translateY(-50%)',
                  backgroundColor: PRIMARY,
                } : undefined,
                '&:hover': { bgcolor: '#1E2235' },
              }
            : {
                color: '#FFFFFF',
                '&:hover': {
                  bgcolor: 'rgba(30, 34, 53, 0.4)',
                  color: '#FFFFFF',
                },
              }),
        }}
      >
        <ListItemIcon
          sx={{
            minWidth: isCollapsedView ? 0 : 28,
            justifyContent: 'center',
            color: active ? '#FFFFFF' : '#FFFFFF',
            transition: 'color 0.18s ease',
            '& .MuiSvgIcon-root': { fontSize: 16 },
          }}
        >
          {icon}
        </ListItemIcon>
        {!isCollapsedView && (
          <ListItemText
            primary={label}
            primaryTypographyProps={{
              fontSize: '13px',
              fontWeight: active ? 600 : 500,
              color: active ? '#FFFFFF' : '#FFFFFF',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.005em',
            }}
          />
        )}

      </ListItemButton>
    );

    return (
      <ListItem disablePadding sx={{ mb: 0 }} key={path}>
        {isCollapsedView ? <Tooltip title={label} placement="right" arrow>{button}</Tooltip> : button}
      </ListItem>
    );
  };

  const renderSectionLabel = (label: string, isCollapsedView: boolean) => {
    if (isCollapsedView) return <Divider sx={{ my: 2, mx: 1.5, borderColor: '#1E2235' }} />;
    return (
      <Box sx={{ px: '20px', pt: '16px', pb: '6px' }}>
        <Typography sx={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '1px', whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
      </Box>
    );
  };

  const renderAccessControl = (isCollapsedView: boolean) => {
    const acItems = [
      { icon: <CoAdminIcon />, label: 'Co Admins', path: '/access-control/co-admins', show: userIsCoAdmin || isMainAdmin },
      { icon: <AdminPanelIcon />, label: 'Admins', path: '/access-control/admins', show: isMainAdmin },
      { icon: <GroupIcon />, label: 'Users', path: '/access-control/users', show: true },
      { icon: <BusinessIcon />, label: 'Companies', path: '/access-control/companies', show: isMainAdmin },
      { icon: <FileCopyIcon />, label: 'Templates', path: '/access-control/templates', show: isAdminPlus },
      { icon: <SecurityIcon />, label: 'Roles & Permissions', path: '/access-control/roles', show: isAdminPlus },
      { icon: <LockIcon />, label: 'Security', path: '/access-control/security', show: isAdminPlus },
      { icon: <HistoryIcon />, label: 'Audit Logs', path: '/access-control/audit-logs', show: isAdminPlus },
    ].filter(item => item.show);

    if (isCollapsedView) {
      return (
        <ListItem disablePadding sx={{ mb: 0.5 }}>
          <Tooltip title="Access Control" placement="right" arrow>
            <ListItemButton
              onClick={() => { toggleCollapse(); setAcOpen(true); handleNav('/access-control/users'); }}
              sx={{
                minHeight: 44, borderRadius: '8px', mx: 0.75, justifyContent: 'center',
                transition: 'all 0.15s ease',
                ...(isAcPath
                  ? { bgcolor: PRIMARY, color: '#000', '&:hover': { bgcolor: PRIMARY_DK, color: '#000' } }
                  : { '&:hover': { bgcolor: 'var(--bg-sidebar-active)' } }),
              }}
            >
              <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center', color: isAcPath ? '#000' : 'var(--text-muted)', '& .MuiSvgIcon-root': { fontSize: 20 } }}>
                <ShieldIcon />
              </ListItemIcon>
            </ListItemButton>
          </Tooltip>
        </ListItem>
      );
    }

    return (
      <>
        <ListItem disablePadding sx={{ mb: 0.5 }}>
          <ListItemButton
            onClick={() => setAcOpen(!acOpen)}
            sx={{
              minHeight: 44, borderRadius: '8px', px: 1.5, py: 0.8,
              transition: 'all 0.15s ease',
              ...(isAcPath && !acOpen ? { bgcolor: PRIMARY, '&:hover': { bgcolor: PRIMARY_DK } } : { '&:hover': { bgcolor: 'var(--bg-sidebar-active)' } }),
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: isAcPath ? (acOpen ? PRIMARY : '#fff') : 'var(--text-muted)', '& .MuiSvgIcon-root': { fontSize: 20 } }}>
              <ShieldIcon />
            </ListItemIcon>
            <ListItemText primary="Access Control" primaryTypographyProps={{ fontSize: '0.855rem', fontWeight: isAcPath ? 600 : 500, color: isAcPath ? (acOpen ? PRIMARY : '#fff') : 'var(--text-primary)', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }} />
            <ExpandMoreIcon sx={{ fontSize: 18, color: 'var(--text-muted)', transition: 'transform 0.2s ease', transform: acOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
          </ListItemButton>
        </ListItem>
        <Collapse in={acOpen} timeout="auto">
          <List disablePadding sx={{ pl: 0.5, pb: 0.5, position: 'relative', '&::before': { content: '""', position: 'absolute', left: 26, top: 0, bottom: 8, width: '1.5px', bgcolor: 'var(--border)', borderRadius: 1 } }}>
            {acItems.map(item => {
              const active = location.pathname === item.path;
              return (
                <ListItem key={item.path} disablePadding sx={{ mb: 0.1 }}>
                  <ListItemButton
                    onClick={() => handleNav(item.path)}
                    sx={{
                      minHeight: 34, borderRadius: '8px', py: 0.35, ml: 1.5, px: 1.5,
                      transition: 'all 0.2s ease',
                      borderLeft: `2px solid ${active ? PRIMARY : 'transparent'}`,
                      ...(active ? { bgcolor: alpha(PRIMARY, 0.06), boxShadow: '0 0 0 1px rgba(0,200,255,0.08)' } : { opacity: 0.78, '&:hover': { bgcolor: 'var(--bg-sidebar-active)', opacity: 1 } }),
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 26, color: active ? PRIMARY : 'var(--text-muted)', '& .MuiSvgIcon-root': { fontSize: 15 } }}>
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.78rem', fontWeight: active ? 650 : 400, color: active ? PRIMARY : 'var(--text-secondary)' }} />

                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Collapse>
      </>
    );
  };

  // â”€â”€â”€ Drawer Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const drawerContent = (isMobile: boolean) => {
    const c = !isMobile && collapsed;

    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#000000', borderRight: '1px solid #1E2235' }}>
        {/* Logo & Toggle */}
        <Box sx={{ px: c ? 1.5 : '20px', py: '20px', display: 'flex', alignItems: 'center', justifyContent: c ? 'center' : 'space-between', minHeight: HEADER_HEIGHT, borderBottom: '1px solid #1E2235' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, overflow: 'hidden', cursor: 'pointer', transition: 'opacity 0.2s ease', '&:hover': { opacity: 0.8 } }} onClick={() => handleNav('/')}>
            <Box sx={{
              width: 32, height: 32, borderRadius: '6px',
              backgroundColor: PRIMARY,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em' }}>SC</Typography>
            </Box>
            {!c && (
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif', fontWeight: 600, color: '#E2E8F0', fontSize: '0.8125rem', letterSpacing: '-0.015em', lineHeight: 1.25 }}>
                  Switchgear<br />Configurator
                </Typography>
                <Typography sx={{ fontSize: '0.55rem', color: '#3D4663', letterSpacing: '0.1em', whiteSpace: 'nowrap', textTransform: 'uppercase', fontWeight: 600, mt: 0.3 }}>
                  Industrial Systems
                </Typography>
              </Box>
            )}
          </Box>
          {!isMobile && !c && (
            <Tooltip title="Collapse sidebar" placement="right">
              <IconButton onClick={toggleCollapse} size="small" sx={{ color: '#64748B', transition: 'all 0.2s ease', '&:hover': { bgcolor: 'rgba(30,34,53,0.4)', color: '#E2E8F0' } }}>
                <ChevronLeftIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Navigation */}
        <Box sx={{ flex: 1, overflow: 'auto', py: 0.5, px: 0 }}>
          {/* OPERATIONS */}
          {renderSectionLabel('Operations', c)}
          <List disablePadding>
            {renderNavItem(<DashboardIcon />, 'Dashboard', '/', c)}
            {isAdminPlus && renderNavItem(<RadarIcon />, 'Overwatch', '/overwatch', c)}
            {isAdminPlus && renderNavItem(<EngineeringIcon />, 'Capacity', '/capacity', c)}
            {renderNavItem(<FolderIcon />, 'Projects', '/projects', c)}
            {canSeeSidebarItem(user?.role, '/procurement', userIsCoAdmin) && renderNavItem(<ShoppingCartIcon />, 'Procurement', '/procurement', c)}
            {canSeeSidebarItem(user?.role, '/material-stock', userIsCoAdmin) && renderNavItem(<InventoryIcon />, 'Inventory', '/material-stock', c)}
            {renderNavItem(<FolderIcon />, 'File Manager', '/file-manager', c)}
          </List>

          {/* Messages moved to top-right header icon */}
          {/* Business Analytics moved to top-right header icon (Analytics hub) */}

          {/* System section moved into Settings tabs (Users / Roles / Approvals / Sessions) */}
        </Box>

        {/* Bottom */}
        <Box sx={{ px: c ? 0.5 : 1.25, pb: 0.5 }}>
        </Box>

        {!isMobile && c && (
          <Box sx={{ pb: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            {companyLogoUrl && (
              <Box component="img" src={companyLogoUrl} alt="Company" onError={(e: any) => { e.target.style.display = 'none'; }} sx={{ maxWidth: 48, maxHeight: 48, width: 'auto', height: 'auto', borderRadius: '8px', objectFit: 'contain', opacity: 0.9 }} />
            )}
            <Tooltip title="Expand sidebar" placement="right">
              <IconButton onClick={toggleCollapse} size="small" sx={{ color: 'var(--text-muted)', '&:hover': { bgcolor: 'var(--bg-sidebar-active)', color: PRIMARY } }}>
                <ChevronRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {!c && (
          <Box sx={{ pb: 3, pt: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', px: 1 }}>
            {companyLogoUrl && (
              <Box component="img" src={companyLogoUrl} alt="Company Logo" onError={(e: any) => { e.target.style.display = 'none'; }} sx={{ maxWidth: '85%', width: 'auto', height: 'auto', maxHeight: 64, objectFit: 'contain', opacity: 0.9, borderRadius: '8px' }} />
            )}
            <Typography sx={{ color: 'var(--text-muted)', fontSize: '0.6rem', mt: 0.8, fontWeight: 500, letterSpacing: '0.02em' }}>v1.0.0 &copy; {new Date().getFullYear()}</Typography>
          </Box>
        )}
      </Box>
    );
  };

  // â”€â”€â”€ Layout Return â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'var(--bg-canvas)', transition: 'background-color 0.3s ease' }}>
      {/* Header */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          transition: `width ${TRANSITION}, margin-left ${TRANSITION}, background-color 0.3s ease`,
          bgcolor: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(24px) saturate(200%)',
          borderBottom: '1px solid',
          borderColor: 'var(--border)',
          height: HEADER_HEIGHT,
          zIndex: 1100,
        }}
      >
        <Toolbar sx={{ px: { xs: 2, sm: 3 }, minHeight: `${HEADER_HEIGHT}px !important`, height: HEADER_HEIGHT }}>
          <IconButton edge="start" onClick={() => setMobileOpen(!mobileOpen)} sx={{ mr: 2, display: { md: 'none' }, color: 'var(--text-primary)' }}>
            <MenuIcon />
          </IconButton>

          {/* Search Bar */}
          <GlobalSearch />

          <Box sx={{ flexGrow: 1 }} />

          {isPlatformAdminInCompany && activeCompany && (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mr: 1.5, display: { xs: 'flex' }, maxWidth: { xs: 180, sm: 'none' } }}>
              <Chip
                size="small"
                label={`Company: ${activeCompany.name}`}
                sx={{ bgcolor: alpha(PRIMARY, 0.08), color: PRIMARY, fontWeight: 700, maxWidth: 220 }}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={handleExitCompany}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                Exit Company
              </Button>
            </Stack>
          )}

          {/* Messages */}
          <Tooltip title="Messages">
            <IconButton onClick={() => navigate('/messages')} sx={{ color: 'var(--text-secondary)', ml: 1, transition: 'all 0.15s ease', '&:hover': { bgcolor: 'var(--bg-sidebar-active)', color: PRIMARY } }}>
              <Badge badgeContent={chatUnread || undefined} color="error" sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', height: 18, minWidth: 18, fontWeight: 700 } }}>
                <ForumIcon sx={{ fontSize: 21 }} />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* Notifications */}
          <Tooltip title="Notifications">
            <IconButton onClick={handleNotifOpen} sx={{ color: 'var(--text-secondary)', ml: 1, position: 'relative', transition: 'all 0.15s ease', '&:hover': { bgcolor: 'var(--bg-sidebar-active)', color: PRIMARY } }}>
              <Badge badgeContent={unreadCount || undefined} color="error" sx={{
                '& .MuiBadge-badge': {
                  fontSize: '0.65rem', height: 18, minWidth: 18, fontWeight: 700,
                  ...(unreadCount > 0 ? {
                    animation: 'pulse-badge 2s ease-in-out infinite',
                    '@keyframes pulse-badge': {
                      '0%, 100%': { transform: 'scale(1) translate(50%, -50%)', boxShadow: '0 0 0 0 rgba(239,68,68,0.4)' },
                      '50%': { transform: 'scale(1.1) translate(50%, -50%)', boxShadow: '0 0 0 6px rgba(239,68,68,0)' },
                    },
                  } : {}),
                },
              }}>
                <NotificationsIcon sx={{ fontSize: 21 }} />
              </Badge>
              {unreadCount > 0 && (
                <Box sx={{ position: 'absolute', top: 8, right: 8, width: 7, height: 7, borderRadius: '50%', bgcolor: '#EF4444', border: '1.5px solid #fff', zIndex: 2 }} />
              )}
            </IconButton>
          </Tooltip>

          {/* Notification Popover */}
          <Popover
            open={Boolean(notifAnchor)}
            anchorEl={notifAnchor}
            onClose={handleNotifClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { mt: 1.5, width: 380, maxHeight: 480, borderRadius: '16px', boxShadow: '0 20px 60px -12px rgba(0,0,0,0.15)', border: '1px solid var(--border)', overflow: 'hidden' } }}
          >
            <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-2)' }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Notifications</Typography>
              <Chip label={`${notifications.length} recent`} size="small" sx={{ bgcolor: 'rgba(0, 200, 255, 0.04)', color: PRIMARY, fontWeight: 600, fontSize: '0.7rem', height: 22, borderRadius: '6px' }} />
            </Box>
            <Box sx={{ maxHeight: 340, overflow: 'auto' }}>
              {notifLoading ? (
                <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress size={24} sx={{ color: PRIMARY }} /></Box>
              ) : notifications.length === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <NotificationsIcon sx={{ fontSize: 36, color: 'var(--border)', mb: 1 }} />
                  <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No recent activity</Typography>
                </Box>
              ) : (
                notifications.map((n, i) => {
                  const { icon, color } = getNotifIcon(n.action);
                  return (
                    <Box key={n.id || i} sx={{ px: 2.5, py: 1.5, display: 'flex', gap: 1.5, alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'background 0.15s', '&:hover': { bgcolor: 'var(--bg-surface-2)' } }}>
                      <Box sx={{ mt: 0.3, width: 30, height: 30, borderRadius: '8px', bgcolor: alpha(color, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
                        {icon}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.action?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'Activity'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'var(--text-muted)', mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.entity_name || (typeof n.details === 'string' ? n.details : n.entity_type) || 'System activity'}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0, mt: 0.3 }}>
                        {formatTimeAgo(n.created_at || n.timestamp)}
                      </Typography>
                    </Box>
                  );
                })
              )}
            </Box>
            <Box sx={{ px: 2.5, py: 1.5, borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
              <Button size="small" onClick={() => { handleNotifClose(); navigate('/activity-timeline'); }} sx={{ textTransform: 'none', color: PRIMARY, fontWeight: 600, fontSize: '0.8rem', '&:hover': { bgcolor: alpha(PRIMARY, 0.06) } }}>
                View All Activity
              </Button>
            </Box>
          </Popover>

          {/* Amber AI */}
          <Tooltip title="Amber AI">
            <IconButton onClick={() => setAiOpen(true)} sx={{ color: 'var(--text-secondary)', ml: 1, transition: 'all 0.15s ease', '&:hover': { bgcolor: 'var(--bg-sidebar-active)', color: PRIMARY } }}>
              <SmartToyIcon sx={{ fontSize: 21 }} />
            </IconButton>
          </Tooltip>

          {/* Database Hub */}
          {canSeeSidebarItem(user?.role, '/parts-master', userIsCoAdmin) && (
            <Tooltip title="Database">
              <IconButton onClick={() => navigate('/database')} sx={{ color: 'var(--text-secondary)', ml: 0.5, transition: 'all 0.15s ease', '&:hover': { bgcolor: 'var(--bg-sidebar-active)', color: PRIMARY } }}>
                <StorageIcon sx={{ fontSize: 21 }} />
              </IconButton>
            </Tooltip>
          )}

          {/* Settings */}
          <Tooltip title="Settings">
            <IconButton onClick={() => navigate('/settings')} sx={{ color: 'var(--text-secondary)', ml: 0.5, transition: 'all 0.15s ease', '&:hover': { bgcolor: 'var(--bg-sidebar-active)', color: PRIMARY } }}>
              <SettingsIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          {/* Analytics Hub */}
          {canSeeSidebarItem(user?.role, '/business-analytics', userIsCoAdmin) && (
            <Tooltip title="Analytics">
              <IconButton onClick={() => navigate('/analytics-hub')} sx={{ color: 'var(--text-secondary)', ml: 0.5, transition: 'all 0.15s ease', '&:hover': { bgcolor: 'var(--bg-sidebar-active)', color: PRIMARY } }}>
                <BarChartIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          )}

          {/* Calendar */}
          <Tooltip title="Calendar">
            <IconButton onClick={() => navigate('/activity-timeline?view=calendar')} sx={{ color: 'var(--text-secondary)', ml: 0.5, transition: 'all 0.15s ease', '&:hover': { bgcolor: 'var(--bg-sidebar-active)', color: PRIMARY } }}>
              <CalendarIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 1.5, my: 1.5, borderColor: 'var(--border)' }} />

          {/* Profile */}
          <Box onClick={handleProfileOpen} sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 0.5, pr: 1, py: 0.5, borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s ease', '&:hover': { bgcolor: 'var(--bg-sidebar-active)' } }}>
            <Avatar src={getAvatarSrc(user?.avatar)} sx={{ width: 34, height: 34, bgcolor: 'var(--bg-surface-2)', border: '2px solid rgba(255, 255, 255, 0.10)' }} />
            <Box sx={{ display: { xs: 'none', sm: 'block' }, maxWidth: 120, overflow: 'hidden' }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</Typography>
              <Typography sx={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'capitalize', lineHeight: 1.2 }}>
                {user?.is_owner ? 'Owner' : user?.role === 'main_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.role === 'sales_engineer' ? 'Sales Engineer' : user?.role}
              </Typography>
            </Box>
            <ArrowDownIcon sx={{ fontSize: 16, color: 'var(--text-muted)', display: { xs: 'none', sm: 'block' }, transition: 'transform 0.2s', transform: profileAnchor ? 'rotate(180deg)' : 'rotate(0)' }} />
          </Box>

          {/* Hidden avatar file input */}
          <input ref={avatarInputRef} type="file" hidden accept="image/*" onChange={handleAvatarUpload} />

          {/* Profile Menu */}
          <Menu anchorEl={profileAnchor} open={Boolean(profileAnchor)} onClose={handleProfileClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { mt: 1, minWidth: 320, maxWidth: 380, borderRadius: '16px', boxShadow: '0 20px 60px -12px rgba(0,0,0,0.25)', border: '1px solid', borderColor: 'var(--border)', overflow: 'hidden', bgcolor: 'var(--bg-surface)', p: 0 } }}>

            {/* Welcome Card Header */}
            <Box sx={{ backgroundColor: 'var(--bg-surface-3)', px: 2.5, pt: 2.5, pb: 2, position: 'relative', overflow: 'hidden' }}>
              {/* 3-dot menu button */}
              <IconButton onClick={handleDotMenuOpen} sx={{ position: 'absolute', top: 8, right: 8, color: 'rgba(255,255,255,0.5)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.1)' } }}>
                <MoreVertIcon sx={{ fontSize: 18 }} />
              </IconButton>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar src={getAvatarSrc(user?.avatar)} sx={{ width: 52, height: 52, bgcolor: 'var(--bg-surface-2)', border: '3px solid rgba(255,255,255,0.15)' }} />
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#fff', lineHeight: 1.3 }}>
                    Welcome back, {user?.name?.split(' ')[0]} ðŸ‘‹
                  </Typography>
                  <Chip
                    icon={<Box sx={{ fontSize: '0.7rem', mr: -0.5 }}>ðŸ‘‘</Box>}
                    label={user?.is_owner ? 'Owner' : user?.role === 'main_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.role === 'sales_engineer' ? 'Sales Engineer' : 'Member'}
                    size="small"
                    sx={{ mt: 0.5, height: 22, fontSize: '0.7rem', fontWeight: 700, bgcolor: '#d4a017', color: '#fff', borderRadius: '6px', '& .MuiChip-icon': { ml: 0.5 } }}
                  />
                </Box>
              </Box>

              {/* User details bar */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1.5, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <PersonIcon sx={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }} />
                  <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)' }}>@{user?.name?.toLowerCase().replace(/\s+/g, '')}</Typography>
                </Box>
                <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.15)', my: 0.2 }} />
                {user?.user_id && (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ fontSize: '0.65rem' }}>ðŸ“‹</Box>
                      <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)' }}>User ID: {user.user_id}</Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.15)', my: 0.2 }} />
                  </>
                )}
                <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', ml: 'auto' }}>
                  {user?.is_owner ? 'Owner' : user?.role === 'main_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.role === 'sales_engineer' ? 'Sales Engineer' : 'Member'}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ px: 2.5, pt: 2, pb: 1 }}>
              <Typography sx={{ fontSize: '0.78rem', color: PRIMARY, fontStyle: 'italic', mt: 0.5, mb: 0.5 }}>
                {welcomeMsg}
              </Typography>
            </Box>

            <Divider sx={{ borderColor: 'var(--border)' }} />

            {/* Footer: role + last login */}
            <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ fontSize: '0.85rem' }}>ðŸ‘¥</Box>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {user?.is_owner ? 'Owner' : user?.role === 'main_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.role === 'sales_engineer' ? 'Sales Engineer' : 'Member'}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {user?.is_owner ? 'Owner' : user?.role === 'main_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.role === 'sales_engineer' ? 'Sales Engineer' : 'Member'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <DotIcon sx={{ fontSize: 10, color: '#22c55e' }} />
                <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Last login: {user?.last_login ? (() => {
                    const diff = Date.now() - new Date(user.last_login).getTime();
                    if (diff < 60000) return 'just now';
                    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
                    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
                    return `${Math.floor(diff / 86400000)}d ago`;
                  })() : 'just now'}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ borderColor: 'var(--border)' }} />

            {/* Inline name edit */}
            {editNameOpen && (
              <Box sx={{ px: 2.5, py: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
                <input
                  autoFocus
                  value={editNameValue}
                  onChange={e => setEditNameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleUpdateName(); if (e.key === 'Escape') setEditNameOpen(false); }}
                  placeholder="Enter new name"
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none' }}
                />
                <Button size="small" variant="contained" onClick={handleUpdateName} sx={{ minWidth: 0, px: 1.5, bgcolor: PRIMARY, color: '#000', '&:hover': { bgcolor: PRIMARY_DK, color: '#000' }, textTransform: 'none', fontSize: '0.78rem', borderRadius: 2 }}>Save</Button>
              </Box>
            )}
            <MenuItem onClick={() => { handleProfileClose(); navigate('/settings'); }} sx={{ py: 1.2, px: 2.5, mx: 1, mt: 0.5, borderRadius: '8px', '&:hover': { bgcolor: 'var(--bg-sidebar-active)' } }}>
              <ListItemIcon><PersonIcon fontSize="small" sx={{ color: 'var(--text-secondary)' }} /></ListItemIcon>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>Profile</Typography>
            </MenuItem>
            <MenuItem onClick={() => { handleProfileClose(); navigate('/settings'); }} sx={{ py: 1.2, px: 2.5, mx: 1, borderRadius: '8px', '&:hover': { bgcolor: 'var(--bg-sidebar-active)' } }}>
              <ListItemIcon><SettingsIcon fontSize="small" sx={{ color: 'var(--text-secondary)' }} /></ListItemIcon>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>Settings</Typography>
            </MenuItem>
            <MenuItem onClick={() => { handleProfileClose(); navigate('/recycle-bin'); }} sx={{ py: 1.2, px: 2.5, mx: 1, borderRadius: '8px', '&:hover': { bgcolor: 'var(--bg-sidebar-active)' } }}>
              <ListItemIcon><RecycleBinIcon fontSize="small" sx={{ color: 'var(--text-secondary)' }} /></ListItemIcon>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>Recycle Bin</Typography>
            </MenuItem>
            <Divider sx={{ my: 0.5, borderColor: 'var(--border)' }} />
            <MenuItem onClick={handleLogout} sx={{ py: 1.2, px: 2.5, mx: 1, mb: 0.5, borderRadius: '8px', color: 'error.main', '&:hover': { bgcolor: alpha('#ef4444', 0.08) } }}>
              <ListItemIcon><LogoutIcon fontSize="small" sx={{ color: 'error.main' }} /></ListItemIcon>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 500 }}>Sign Out</Typography>
            </MenuItem>
          </Menu>

          {/* 3-dot sub-menu */}
          <Menu anchorEl={dotMenuAnchor} open={Boolean(dotMenuAnchor)} onClose={handleDotMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { minWidth: 200, borderRadius: '10px', boxShadow: '0 8px 30px rgba(0,0,0,0.15)', border: '1px solid', borderColor: 'var(--border)', bgcolor: 'var(--bg-surface)' } }}>
            <MenuItem onClick={() => { handleDotMenuClose(); avatarInputRef.current?.click(); }} sx={{ py: 1, px: 2, borderRadius: '6px', mx: 0.5, '&:hover': { bgcolor: 'var(--bg-sidebar-active)' } }}>
              <ListItemIcon><CameraIcon fontSize="small" sx={{ color: 'var(--text-secondary)' }} /></ListItemIcon>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>Update Profile Picture</Typography>
            </MenuItem>
            <MenuItem onClick={() => { handleDotMenuClose(); setEditNameValue(user?.name || ''); setEditNameOpen(true); }} sx={{ py: 1, px: 2, borderRadius: '6px', mx: 0.5, '&:hover': { bgcolor: 'var(--bg-sidebar-active)' } }}>
              <ListItemIcon><EditIcon fontSize="small" sx={{ color: 'var(--text-secondary)' }} /></ListItemIcon>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>Update Username</Typography>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 }, transition: `width ${TRANSITION}` }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: SIDEBAR_EXPANDED, border: 'none', bgcolor: 'var(--bg-sidebar)' } }}>
          {drawerContent(true)}
        </Drawer>
        <Drawer variant="permanent" open
          sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth, border: 'none', transition: `width ${TRANSITION}`, overflowX: 'hidden', position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 1200, bgcolor: 'var(--bg-sidebar)' } }}>
          {drawerContent(false)}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', width: { md: `calc(100% - ${drawerWidth}px)` }, height: '100vh', overflow: 'hidden', bgcolor: 'var(--bg-canvas)', transition: `width ${TRANSITION}` }}>
        <Toolbar sx={{ minHeight: `${HEADER_HEIGHT}px !important`, flexShrink: 0 }} />
        <Box sx={{ flex: 1, overflow: 'auto', p: '12px' }}>
          <Box className="animate-fadeIn" sx={{ width: '100%' }}><Outlet /></Box>
        </Box>
      </Box>


      <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
    </Box>
  );
};

export default Layout;



