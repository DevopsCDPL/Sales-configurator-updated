import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  InputBase, Box, Typography, Chip, alpha, Paper, Popper,
  List, ListItem, ListItemIcon, ListItemText, ClickAwayListener,
  CircularProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  Description as DocsIcon,
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
import api from '../services/api';

const PRIMARY = '#1F7A63';

const MODULE_ICONS: Record<string, React.ReactElement<any>> = {
  Project: <ProjectIcon sx={{ fontSize: 20 }} />,
  Client: <ClientIcon sx={{ fontSize: 20 }} />,
  Vendor: <VendorIcon sx={{ fontSize: 20 }} />,
  Material: <MaterialIcon sx={{ fontSize: 20 }} />,
  Inventory: <InventoryIcon sx={{ fontSize: 20 }} />,
  'Work Order': <WorkOrderIcon sx={{ fontSize: 20 }} />,
  Document: <DocsIcon sx={{ fontSize: 20 }} />,
  Message: <MessageIcon sx={{ fontSize: 20 }} />,
  'Purchase Order': <POIcon sx={{ fontSize: 20 }} />,
  Invoice: <InvoiceIcon sx={{ fontSize: 20 }} />,
};

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

interface SearchResult {
  id: string;
  name: string;
  subtitle: string;
  module: string;
  path: string;
}

const GlobalSearch: React.FC = () => {
  const navigate = useNavigate();
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const showDropdown = focused && query.trim().length >= 2;

  // Debounced API search
  const performSearch = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get('/search', { params: { q: term.trim() } });
      if (res.data?.success) {
        setResults(res.data.data);
      }
    } catch {
      setResults([]);
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
      setResults([]);
      setSearching(false);
    }
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, performSearch]);

  useEffect(() => { setSelectedIndex(-1); }, [results]);

  // Ctrl+K focuses the search bar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = (result: SearchResult) => {
    navigate(result.path);
    setQuery('');
    setResults([]);
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || results.length === 0) {
      if (e.key === 'Escape') { inputRef.current?.blur(); setFocused(false); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  const handleClickAway = () => {
    setFocused(false);
  };

  // Group results by module
  const grouped: Record<string, SearchResult[]> = {};
  results.forEach(r => {
    if (!grouped[r.module]) grouped[r.module] = [];
    grouped[r.module].push(r);
  });
  const modules = Object.keys(grouped);

  // Flat index tracking for keyboard nav
  let flatIdx = -1;

  return (
    <ClickAwayListener onClickAway={handleClickAway}>
        <Box ref={anchorRef} sx={{ position: 'relative', width: { xs: '100%', sm: 400, md: 460 }, minWidth: 360 }}>
        {/* Search input */}
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            bgcolor: focused ? '#fff' : 'var(--bg-surface-2)',
            border: `1px solid ${focused ? PRIMARY : '#E8EAED'}`,
            borderRadius: '10px', px: 1.5, py: 0.6,
            transition: 'all 0.2s ease',
            boxShadow: focused ? `0 0 0 3px ${alpha(PRIMARY, 0.1)}` : 'inset 0 1px 3px rgba(0,0,0,0.06)',
            '&:hover': { bgcolor: focused ? '#fff' : '#EBEDF0', borderColor: focused ? PRIMARY : 'var(--text-muted)' },
          }}
        >
          <SearchIcon sx={{ fontSize: 17, color: focused ? PRIMARY : '#9CA3AF' }} />
          <InputBase
            inputRef={inputRef}
            fullWidth
            placeholder="Search projects, clients, vendors..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            type="search"
            inputProps={{
              autoComplete: 'new-password', // Strongest autofill prevention
              'data-lpignore': 'true',
              'data-form-type': 'other',
              'aria-autocomplete': 'none',
              name: 'global-search-query', // Unique name to prevent autofill matching
            }}
            sx={{ fontSize: '0.8rem' }}
          />
          {searching && <CircularProgress size={16} sx={{ color: PRIMARY }} />}
          <Box sx={{
            display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.3,
            bgcolor: alpha('#000', 0.04), borderRadius: '6px', px: 0.8, py: 0.15,
          }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>Ctrl+K</Typography>
          </Box>
        </Box>

        {/* Dropdown results */}
        <Popper
          open={showDropdown}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          disablePortal
          style={{ width: anchorRef.current?.offsetWidth || 320, zIndex: 1300 }}
          modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
        >
          <Paper
            elevation={8}
            sx={{
              borderRadius: '12px', overflow: 'hidden',
              border: `1px solid ${alpha(PRIMARY, 0.12)}`,
              maxHeight: 420, overflowY: 'auto',
            }}
          >
            {modules.length > 0 ? (
              modules.map(mod => (
                <Box key={mod}>
                  <Typography variant="caption" sx={{
                    px: 1.5, pt: 1, pb: 0.3, display: 'block', fontWeight: 700,
                    textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: '0.05em',
                    color: MODULE_COLORS[mod] || '#6B7280',
                  }}>
                    {mod}
                  </Typography>
                  <List dense disablePadding>
                    {grouped[mod].map(r => {
                      flatIdx++;
                      const idx = flatIdx;
                      const selected = idx === selectedIndex;
                      return (
                        <ListItem
                          key={r.id}
                          onClick={() => handleSelect(r)}
                          sx={{
                            px: 1.5, py: 0.6, cursor: 'pointer',
                            bgcolor: selected ? alpha(PRIMARY, 0.08) : 'transparent',
                            '&:hover': { bgcolor: alpha(PRIMARY, 0.05) },
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 32, color: MODULE_COLORS[r.module] || '#6B7280' }}>
                            {MODULE_ICONS[r.module] || <DocsIcon sx={{ fontSize: 20 }} />}
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Typography variant="body2" fontWeight={500} noWrap sx={{ fontSize: '0.8rem' }}>
                                {r.name}
                              </Typography>
                            }
                            secondary={
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: '0.7rem' }}>
                                {r.subtitle}
                              </Typography>
                            }
                          />
                          <Chip
                            label={r.module}
                            size="small"
                            sx={{
                              height: 18, fontSize: '0.55rem', fontWeight: 600, ml: 1,
                              bgcolor: alpha(MODULE_COLORS[r.module] || PRIMARY, 0.1),
                              color: MODULE_COLORS[r.module] || PRIMARY,
                              borderRadius: '4px',
                            }}
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </Box>
              ))
            ) : !searching ? (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography color="text.secondary" variant="body2" sx={{ fontSize: '0.8rem' }}>
                  No results found for "{query}"
                </Typography>
              </Box>
            ) : null}

            {searching && results.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <CircularProgress size={20} sx={{ color: PRIMARY, mb: 0.5 }} />
                <Typography color="text.secondary" variant="body2" sx={{ fontSize: '0.8rem' }}>
                  Searching...
                </Typography>
              </Box>
            )}
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
};

export default GlobalSearch;
