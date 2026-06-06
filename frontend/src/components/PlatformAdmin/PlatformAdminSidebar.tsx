import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  IconButton,
  Avatar,
  Tooltip,
  Collapse,
  Badge,
  alpha,
} from '@mui/material';
import {
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  Shield,
  UsersRound,
  Activity,
  FileSearch,
  Bell,
  BarChart3,
  TrendingUp,
  CreditCard,
  Receipt,
  Puzzle,
  Key,
  Settings,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  PLATFORM_MENU,
  filterMenuByRole,
  getPlatformRole,
  PlatformMenuItem,
  PlatformMenuSection,
} from '../../config/platformAdminMenu';

// ─── Constants ───────────────────────────────────────────────────────

const DRAWER_WIDTH = 264;
const COLLAPSED_WIDTH = 72;
const PRIMARY = '#1F7A63';
const SIDEBAR_BG = '#0F1A2E';
const SIDEBAR_BG_LIGHT = '#162035';
const TEXT_MUTED = '#94A3B8';
const TEXT_DIM = '#64748B';
const APP_VERSION = 'v1.0.0';

// ─── Icon Map ────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.FC<{ size?: string | number }>> = {
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  Shield,
  UsersRound,
  Activity,
  FileSearch,
  Bell,
  BarChart3,
  TrendingUp,
  CreditCard,
  Receipt,
  Puzzle,
  Key,
  Settings,
  Trash2,
};

// ─── Badge Data Context ──────────────────────────────────────────────

export interface SidebarBadges {
  companies?: number;
  users?: number;
  expiring?: number;
}

// ─── SidebarItem ─────────────────────────────────────────────────────

const SidebarItem: React.FC<{
  item: PlatformMenuItem;
  active: boolean;
  collapsed: boolean;
  badges: SidebarBadges;
  onClick: (path: string) => void;
}> = ({ item, active, collapsed, badges, onClick }) => {
  const Icon = ICON_MAP[item.icon] || LayoutDashboard;
  const badgeValue = item.badge ? badges[item.badge] : undefined;

  const button = (
    <Box
      onClick={() => onClick(item.path)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: collapsed ? 0 : 1.5,
        py: 1,
        mx: 1,
        borderRadius: '10px',
        cursor: 'pointer',
        position: 'relative',
        justifyContent: collapsed ? 'center' : 'flex-start',
        bgcolor: active ? alpha(PRIMARY, 0.18) : 'transparent',
        color: active ? '#fff' : TEXT_MUTED,
        transition: 'all 0.2s ease',
        '&:hover': {
          bgcolor: active ? alpha(PRIMARY, 0.22) : alpha('#fff', 0.06),
          color: '#fff',
        },
        // Active glow indicator
        ...(active && {
          '&::before': {
            content: '""',
            position: 'absolute',
            left: collapsed ? '50%' : 0,
            top: collapsed ? 'auto' : '50%',
            bottom: collapsed ? -2 : 'auto',
            transform: collapsed ? 'translateX(-50%)' : 'translateY(-50%)',
            width: collapsed ? 20 : 3,
            height: collapsed ? 3 : 20,
            borderRadius: 4,
            bgcolor: PRIMARY,
          },
        }),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {badgeValue !== undefined && badgeValue > 0 ? (
          <Badge
            badgeContent={badgeValue}
            color={item.badge === 'expiring' ? 'warning' : 'primary'}
            max={99}
            sx={{
              '& .MuiBadge-badge': {
                fontSize: 10,
                height: 16,
                minWidth: 16,
                ...(item.badge !== 'expiring' && { bgcolor: PRIMARY }),
              },
            }}
          >
            <Icon size={20} />
          </Badge>
        ) : (
          <Icon size={20} />
        )}
      </Box>
      {!collapsed && (
        <Typography
          sx={{
            fontSize: 13.5,
            fontWeight: active ? 600 : 400,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.label}
        </Typography>
      )}
    </Box>
  );

  if (collapsed) {
    return (
      <Tooltip title={item.label} placement="right" arrow>
        {button}
      </Tooltip>
    );
  }

  return button;
};

// ─── SidebarSection ──────────────────────────────────────────────────

const SidebarSection: React.FC<{
  section: PlatformMenuSection;
  collapsed: boolean;
  badges: SidebarBadges;
  activePath: string;
  onNavigate: (path: string) => void;
}> = ({ section, collapsed, badges, activePath, onNavigate }) => {
  const [expanded, setExpanded] = useState(true);

  const isActive = (item: PlatformMenuItem) =>
    item.path === '/platform-admin'
      ? activePath === '/platform-admin'
      : activePath.startsWith(item.path);

  if (collapsed) {
    return (
      <Box sx={{ py: 0.5 }}>
        {section.items.map((item) => (
          <SidebarItem
            key={item.id}
            item={item}
            active={isActive(item)}
            collapsed
            badges={badges}
            onClick={onNavigate}
          />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 0.5 }}>
      {/* Section Header */}
      <Box
        onClick={section.collapsible ? () => setExpanded(!expanded) : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          pt: 2,
          pb: 0.5,
          cursor: section.collapsible ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        <Typography
          sx={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: TEXT_DIM,
            textTransform: 'uppercase',
          }}
        >
          {section.title}
        </Typography>
        {section.collapsible && (
          <Box sx={{ color: TEXT_DIM, display: 'flex' }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </Box>
        )}
      </Box>

      {/* Items */}
      <Collapse in={expanded} timeout={200}>
        <Box sx={{ py: 0.25 }}>
          {section.items.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              active={isActive(item)}
              collapsed={false}
              badges={badges}
              onClick={onNavigate}
            />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
};

// ─── Main Sidebar Component ─────────────────────────────────────────

interface PlatformAdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  badges?: SidebarBadges;
}

const PlatformAdminSidebar: React.FC<PlatformAdminSidebarProps> = ({
  collapsed,
  onToggle,
  badges = {},
}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const platformRole = useMemo(
    () => (user ? getPlatformRole(user) : 'user' as const),
    [user]
  );

  const filteredMenu = useMemo(
    () => filterMenuByRole(platformRole),
    [platformRole]
  );

  const handleNavigate = useCallback(
    (path: string) => navigate(path),
    [navigate]
  );

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  return (
    <Box
      sx={{
        width: collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH,
        minWidth: collapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH,
        height: '100vh',
        bgcolor: SIDEBAR_BG,
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        flexShrink: 0,
        borderRight: `1px solid ${alpha('#fff', 0.06)}`,
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          px: 2,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: `1px solid ${alpha('#fff', 0.06)}`,
          minHeight: 64,
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                bgcolor: PRIMARY,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <LayoutDashboard size={18} color="#fff" />
            </Box>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                color: '#fff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              CDPL Platform
            </Typography>
          </Box>
        )}
        <IconButton
          size="small"
          onClick={onToggle}
          sx={{
            color: TEXT_MUTED,
            ml: collapsed ? 'auto' : 0,
            mr: collapsed ? 'auto' : 0,
            '&:hover': { color: '#fff', bgcolor: alpha('#fff', 0.08) },
          }}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </IconButton>
      </Box>

      {/* ── Navigation Sections ── */}
      <Box sx={{ flex: 1, py: 1, overflow: 'auto', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: alpha('#fff', 0.1), borderRadius: 2 } }}>
        {filteredMenu.map((section) => (
          <SidebarSection
            key={section.id}
            section={section}
            collapsed={collapsed}
            badges={badges}
            activePath={location.pathname}
            onNavigate={handleNavigate}
          />
        ))}
      </Box>

      {/* ── Footer ── */}
      <Box
        sx={{
          borderTop: `1px solid ${alpha('#fff', 0.06)}`,
          p: collapsed ? 1 : 2,
          flexShrink: 0,
        }}
      >
        {/* User Profile */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: collapsed ? 0.5 : 1,
            borderRadius: '10px',
            bgcolor: alpha('#fff', 0.04),
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
        >
          <Avatar
            sx={{
              width: 34,
              height: 34,
              bgcolor: PRIMARY,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {user?.name?.charAt(0)?.toUpperCase() || 'P'}
          </Avatar>
          {!collapsed && (
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.name || 'Platform Admin'}
              </Typography>
              <Typography
                sx={{
                  fontSize: 11,
                  color: TEXT_MUTED,
                  textTransform: 'capitalize',
                }}
              >
                {platformRole}
              </Typography>
            </Box>
          )}
        </Box>

        {/* Logout */}
        <Tooltip title={collapsed ? 'Logout' : ''} placement="right">
          <Box
            onClick={handleLogout}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: collapsed ? 0 : 1.5,
              py: 1,
              mt: 1,
              borderRadius: '10px',
              cursor: 'pointer',
              color: TEXT_MUTED,
              justifyContent: collapsed ? 'center' : 'flex-start',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: alpha('#EF4444', 0.12),
                color: '#EF4444',
              },
            }}
          >
            <LogOut size={18} />
            {!collapsed && (
              <Typography sx={{ fontSize: 13 }}>Logout</Typography>
            )}
          </Box>
        </Tooltip>

        {/* App Version */}
        {!collapsed && (
          <Typography
            sx={{
              fontSize: 10,
              color: TEXT_DIM,
              textAlign: 'center',
              mt: 1,
            }}
          >
            {APP_VERSION}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default PlatformAdminSidebar;
