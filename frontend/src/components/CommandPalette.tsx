import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog, InputBase, Box, Typography, Chip, alpha,
  Stack, List, ListItem, ListItemIcon, ListItemText,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  People as UsersIcon,
  Business as CompanyIcon,
  Security as RolesIcon,
  Assessment as AnalyticsIcon,
  Timeline as TimelineIcon,
  Speed as DashboardIcon,
  Settings as SettingsIcon,
  Description as DocsIcon,
  NavigateNext as GoIcon,
  Folder as ProjectIcon,
  Person as ClientIcon,
  LocalShipping as VendorIcon,
  Inventory as InventoryIcon,
  Engineering as WorkOrderIcon,
  Forum as MessageIcon,
  ShoppingCart as POIcon,
  Receipt as InvoiceIcon,
  Category as MaterialIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

const PRIMARY = '#1F7A63';

// Icon map for search result modules
const MODULE_ICONS: Record<string, React.ReactElement<any>> = {
  Project: <ProjectIcon />,
  Client: <ClientIcon />,
  Vendor: <VendorIcon />,
  Material: <MaterialIcon />,
  Inventory: <InventoryIcon />,
  'Work Order': <WorkOrderIcon />,
  Document: <DocsIcon />,
  Message: <MessageIcon />,
  'Purchase Order': <POIcon />,
  Invoice: <InvoiceIcon />,
};

// Module badge colors
const MODULE_COLORS: Record<string, string> = {
  Project: '#1F7A63',
  Client: '#166354',
  Vendor: '#166354',
  Material: '#D97706',
  Inventory: '#059669',
  'Work Order': '#DC2626',
  Document: '#6B7280',
  Message: '#0891B2',
  'Purchase Order': '#EA580C',
  Invoice: '#166354',
};

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactElement<any>;
  category: string;
  action: () => void;
  keywords?: string[];
  badge?: string;
  badgeColor?: string;
}

interface SearchResult {
  id: string;
  name: string;
  subtitle: string;
  module: string;
  path: string;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const isAdmin = user?.role === 'main_admin' || user?.role === 'admin';

  // Build command registry
  const commands: CommandItem[] = [
    { id: 'nav-dashboard', label: 'Go to Dashboard', description: 'Main dashboard', icon: <DashboardIcon />, category: 'Navigation', action: () => { navigate('/dashboard'); onClose(); }, keywords: ['home', 'main'] },
    { id: 'nav-projects', label: 'Go to Projects', description: 'Project management', icon: <ProjectIcon />, category: 'Navigation', action: () => { navigate('/projects'); onClose(); }, keywords: ['quotation', 'work order', 'configuration', 'estimate', 'estimates'] },
    { id: 'nav-quality', label: 'Go to Quality', description: 'Quality control', icon: <DocsIcon />, category: 'Navigation', action: () => { navigate('/quality'); onClose(); }, keywords: ['qc', 'inspection'] },
    { id: 'nav-logistics', label: 'Go to Logistics', description: 'Delivery management', icon: <DocsIcon />, category: 'Navigation', action: () => { navigate('/logistics'); onClose(); }, keywords: ['delivery', 'shipping'] },
    { id: 'nav-documents', label: 'Go to Documents', description: 'Document management', icon: <DocsIcon />, category: 'Navigation', action: () => { navigate('/documents'); onClose(); }, keywords: ['files', 'uploads'] },
    { id: 'nav-clients', label: 'Go to Clients', description: 'Client management', icon: <ClientIcon />, category: 'Navigation', action: () => { navigate('/clients'); onClose(); }, keywords: ['customer'] },
    { id: 'nav-vendors', label: 'Go to Vendors', description: 'Vendor management', icon: <VendorIcon />, category: 'Navigation', action: () => { navigate('/vendors'); onClose(); }, keywords: ['supplier'] },
    { id: 'nav-materials', label: 'Go to Materials', description: 'Material inventory', icon: <MaterialIcon />, category: 'Navigation', action: () => { navigate('/materials'); onClose(); }, keywords: ['stock', 'inventory'] },
    { id: 'nav-messages', label: 'Go to Messages', description: 'Team messaging', icon: <MessageIcon />, category: 'Navigation', action: () => { navigate('/messages'); onClose(); }, keywords: ['chat'] },
    ...(isAdmin ? [
      { id: 'nav-users', label: 'Manage Users', description: 'User management', icon: <UsersIcon />, category: 'Administration', action: () => { navigate('/platform-admin/access-control/users'); onClose(); }, keywords: ['members', 'accounts'] },
      { id: 'nav-companies', label: 'Manage Companies', description: 'Company management', icon: <CompanyIcon />, category: 'Administration', action: () => { navigate('/platform-admin/access-control/companies'); onClose(); }, keywords: ['tenants', 'organizations'] },
      { id: 'nav-roles', label: 'Custom Roles', description: 'Role builder', icon: <RolesIcon />, category: 'Administration', action: () => { navigate('/custom-roles'); onClose(); }, keywords: ['permissions', 'RBAC'] },
      { id: 'nav-sessions', label: 'Session Monitor', description: 'Active sessions', icon: <RolesIcon />, category: 'Administration', action: () => { navigate('/sessions'); onClose(); }, keywords: ['active', 'logged in'] },
      { id: 'nav-approvals', label: 'Approval Queue', description: 'Pending approvals', icon: <DocsIcon />, category: 'Administration', action: () => { navigate('/approvals'); onClose(); }, keywords: ['pending', 'workflow'] },
      { id: 'nav-risk', label: 'Risk Dashboard', description: 'Risk detection & alerts', icon: <RolesIcon />, category: 'Administration', action: () => { navigate('/risk-dashboard'); onClose(); }, keywords: ['security', 'alerts'] },
      { id: 'nav-analytics', label: 'Analytics', description: 'Platform analytics', icon: <AnalyticsIcon />, category: 'Administration', action: () => { navigate('/analytics'); onClose(); }, keywords: ['stats', 'metrics', 'reports'] },
      { id: 'nav-timeline', label: 'Activity Timeline', description: 'Activity feed', icon: <TimelineIcon />, category: 'Administration', action: () => { navigate('/activity-timeline'); onClose(); }, keywords: ['feed', 'events', 'log'] },
      { id: 'nav-audit', label: 'Audit Logs', description: 'Security audit trail', icon: <RolesIcon />, category: 'Administration', action: () => { navigate('/platform-admin/access-control/audit-logs'); onClose(); }, keywords: ['trail', 'history'] },
      { id: 'nav-settings', label: 'Settings', description: 'System settings', icon: <SettingsIcon />, category: 'Administration', action: () => { navigate('/settings'); onClose(); }, keywords: ['config', 'preferences'] },
    ] : []),
  ];

  // Debounced API search
  const performSearch = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get('/search', { params: { q: term.trim() } });
      if (res.data?.success) {
        setSearchResults(res.data.data);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length >= 2) {
      setSearching(true);
      debounceRef.current = setTimeout(() => performSearch(query), 300);
    } else {
      setSearchResults([]);
      setSearching(false);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, performSearch]);

  // Convert search results to command items
  const searchItems: CommandItem[] = searchResults.map(r => ({
    id: `search-${r.module}-${r.id}`,
    label: r.name,
    description: r.subtitle,
    icon: MODULE_ICONS[r.module] || <DocsIcon />,
    category: r.module,
    badge: r.module,
    badgeColor: MODULE_COLORS[r.module] || PRIMARY,
    action: () => { navigate(r.path); onClose(); },
  }));

  // Filter navigation commands by query
  const filteredCommands = query.trim()
    ? commands.filter(c => {
        const q = query.toLowerCase();
        return c.label.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.keywords?.some(k => k.toLowerCase().includes(q));
      })
    : commands;

  // Combine: search results first, then matching navigation commands
  const hasSearchQuery = query.trim().length >= 2;
  const allItems: CommandItem[] = hasSearchQuery
    ? [...searchItems, ...filteredCommands]
    : filteredCommands;

  // Group by category
  const grouped: Record<string, CommandItem[]> = {};
  allItems.forEach(c => {
    const cat = c.badge ? 'Search Results' : c.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  });

  // If we have search results, ensure the "Search Results" category comes first
  const orderedCategories = Object.keys(grouped).sort((a, b) => {
    if (a === 'Search Results') return -1;
    if (b === 'Search Results') return 1;
    return 0;
  });

  const flatList = allItems;

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setSearchResults([]);
      setSearching(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => { setSelectedIndex(0); }, [query, searchResults]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatList[selectedIndex]) flatList[selectedIndex].action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
      PaperProps={{
        sx: { borderRadius: 3, mt: -10, position: 'relative', overflow: 'hidden' },
      }}
      BackdropProps={{ sx: { bgcolor: alpha('#000', 0.5), backdropFilter: 'blur(4px)' } }}
    >
      <Box sx={{ p: 0 }}>
        {/* Search input */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
          <InputBase ref={inputRef} fullWidth placeholder="Search projects, clients, vendors, documents..."
            value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKeyDown}
            sx={{ fontSize: '1rem' }} autoFocus />
          {searching && <CircularProgress size={18} sx={{ mr: 1, color: PRIMARY }} />}
          <Chip label="ESC" size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 20 }} />
        </Box>

        {/* Results */}
        <Box sx={{ maxHeight: 440, overflow: 'auto', py: 1 }}>
          {orderedCategories.map(category => {
            const items = grouped[category];
            const isSearchCategory = category === 'Search Results';
            return (
              <Box key={category}>
                <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: 'block', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.04em' }}>
                  {category}
                </Typography>
                <List dense disablePadding>
                  {items.map(item => {
                    const idx = flatList.findIndex(f => f.id === item.id);
                    const selected = idx === selectedIndex;
                    return (
                      <ListItem key={item.id} button onClick={item.action}
                        sx={{
                          px: 2, py: 0.75, mx: 1, borderRadius: 1.5,
                          bgcolor: selected ? alpha(PRIMARY, 0.08) : 'transparent',
                          '&:hover': { bgcolor: alpha(PRIMARY, 0.06) },
                        }}>
                        <ListItemIcon sx={{ minWidth: 36, color: item.badgeColor || (selected ? PRIMARY : 'text.secondary') }}>
                          {item.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" fontWeight={selected ? 600 : 400} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.label}
                              </Typography>
                              {item.badge && (
                                <Chip label={item.badge} size="small"
                                  sx={{
                                    height: 18, fontSize: '0.6rem', fontWeight: 600,
                                    bgcolor: alpha(item.badgeColor || PRIMARY, 0.1),
                                    color: item.badgeColor || PRIMARY,
                                    borderRadius: '4px',
                                  }}
                                />
                              )}
                            </Box>
                          }
                          secondary={item.description}
                          secondaryTypographyProps={{ variant: 'caption', sx: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}
                        />
                        {selected && <GoIcon sx={{ color: PRIMARY, fontSize: 18 }} />}
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            );
          })}

          {flatList.length === 0 && !searching && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                {query.trim().length >= 2 ? `No results found for "${query}"` : 'Start typing to search across all modules...'}
              </Typography>
            </Box>
          )}

          {searching && flatList.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CircularProgress size={24} sx={{ color: PRIMARY, mb: 1 }} />
              <Typography color="text.secondary" variant="body2">Searching all modules...</Typography>
            </Box>
          )}
        </Box>

        {/* Footer */}
        <Box sx={{ display: 'flex', gap: 2, px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider', bgcolor: alpha(PRIMARY, 0.02) }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip label="↑↓" size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
            <Typography variant="caption" color="text.secondary">Navigate</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip label="↵" size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
            <Typography variant="caption" color="text.secondary">Select</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip label="Ctrl+K" size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 18 }} />
            <Typography variant="caption" color="text.secondary">Toggle</Typography>
          </Stack>
        </Box>
      </Box>
    </Dialog>
  );
};

export default CommandPalette;
