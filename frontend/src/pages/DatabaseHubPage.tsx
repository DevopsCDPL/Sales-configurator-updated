import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, IconButton, CircularProgress, Stack, Chip, TextField, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
} from '@mui/material';
import {
  LocalShipping as ShippingIcon,
  People as PeopleIcon,
  Science as ScienceIcon,
  Build as BuildIcon,
  AccountTree as ComponentsIcon,
  Bookmark as BookmarkIcon,
  TrendingUp as TrendingUpIcon,
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
} from '@mui/icons-material';

import VendorsPage from './VendorsPage';
import ClientsPage from './ClientsPage';
import RawMaterialMasterPage from './RawMaterialMasterPage';
import PartsMasterPage from './PartsMasterPage';
import ComponentsPage from './ComponentsPage';

import { configuratorService, type ConfigurationSummary } from '../services/configuratorService';
import { marketDataService, type CopperPrice } from '../services/marketDataService';
import { useNotification } from '../contexts/NotificationContext';

const PRIMARY = '#33d6ff';
const PRIMARY_DK = '#00bce0';
const SURFACE = '#0B0B0D';
const BORDER = '#1E2235';
const TEXT = '#F1F5F9';
const TEXT_DIM = '#94A3B8';

interface TabDef {
  key: string;
  label: string;
  icon: React.ReactElement;
}

const TABS: TabDef[] = [
  { key: 'vendors',        label: 'Vendor Data',         icon: <ShippingIcon sx={{ fontSize: 16 }} /> },
  { key: 'clients',        label: 'Client Data',         icon: <PeopleIcon sx={{ fontSize: 16 }} /> },
  { key: 'raw-materials',  label: 'Raw Material',        icon: <ScienceIcon sx={{ fontSize: 16 }} /> },
  { key: 'parts',          label: 'Parts Master',        icon: <BuildIcon sx={{ fontSize: 16 }} /> },
  { key: 'components',     label: 'Components',          icon: <ComponentsIcon sx={{ fontSize: 16 }} /> },
  { key: 'saved-configs',  label: 'Saved Configuration', icon: <BookmarkIcon sx={{ fontSize: 16 }} /> },
  { key: 'comex',          label: 'Comex Copper',        icon: <TrendingUpIcon sx={{ fontSize: 16 }} /> },
];

const DatabaseHubPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const initial = params.get('tab') || TABS[0].key;
  const [active, setActive] = useState<string>(TABS.some(t => t.key === initial) ? initial : TABS[0].key);

  const handleSelect = (key: string) => {
    setActive(key);
    const next = new URLSearchParams(params);
    next.set('tab', key);
    setParams(next, { replace: true });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#000', color: TEXT }}>
      {/* Hub header */}
      <Box sx={{ px: { xs: 1.5, sm: 2.5 }, pt: 1.5, pb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '10px', bgcolor: 'rgba(51,214,255,0.12)', border: `1px solid ${PRIMARY}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <StorageIcon sx={{ fontSize: 18, color: PRIMARY }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: TEXT, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Database</Typography>
          <Typography sx={{ fontSize: 11.5, color: TEXT_DIM, fontWeight: 500 }}>Centralized master data &amp; market references</Typography>
        </Box>
      </Box>

      {/* Horizontal tab bar */}
      <Box sx={{
        position: 'sticky', top: 0, zIndex: 5,
        bgcolor: '#000',
        borderBottom: `1px solid ${BORDER}`,
        px: { xs: 1.5, sm: 2.5 },
        display: 'flex', gap: 0.5, overflowX: 'auto',
        '&::-webkit-scrollbar': { height: 4 },
        '&::-webkit-scrollbar-thumb': { bgcolor: BORDER, borderRadius: 2 },
      }}>
        {TABS.map(t => {
          const isActive = active === t.key;
          return (
            <Button
              key={t.key}
              onClick={() => handleSelect(t.key)}
              startIcon={t.icon}
              sx={{
                textTransform: 'none', fontWeight: isActive ? 700 : 500, fontSize: '0.82rem',
                color: isActive ? PRIMARY : TEXT_DIM,
                bgcolor: 'transparent', borderRadius: 0,
                px: 1.75, py: 1.25, minWidth: 'auto', flexShrink: 0,
                borderBottom: isActive ? `2px solid ${PRIMARY}` : '2px solid transparent',
                '&:hover': { bgcolor: 'rgba(51,214,255,0.06)', color: isActive ? PRIMARY : TEXT },
              }}
            >
              {t.label}
            </Button>
          );
        })}
      </Box>

      {/* Tab content */}
      <Box sx={{ p: '12px' }}>
        {active === 'vendors' && <VendorsPage />}
        {active === 'clients' && <ClientsPage />}
        {active === 'raw-materials' && <RawMaterialMasterPage />}
        {active === 'parts' && <PartsMasterPage />}
        {active === 'components' && <ComponentsPage />}
        {active === 'saved-configs' && <SavedConfigurationsTab />}
        {active === 'comex' && <ComexCopperTab />}
      </Box>
    </Box>
  );
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Saved Configurations — cross-project list                                  */
/* ────────────────────────────────────────────────────────────────────────── */
const SavedConfigurationsTab: React.FC = () => {
  const navigate = useNavigate();
  const notify = useNotification();
  const [rows, setRows] = useState<ConfigurationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await configuratorService.listConfigurations({});
      setRows(list);
    } catch (e: any) {
      notify.showError(e?.response?.data?.message || 'Failed to load configurations');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => (r.name || '').toLowerCase().includes(q) || (r.code || '').toLowerCase().includes(q));
  }, [rows, search]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this saved configuration? This cannot be undone.')) return;
    try {
      await configuratorService.deleteConfiguration(id);
      setRows(prev => prev.filter(r => r.id !== id));
      notify.showSuccess('Configuration deleted');
    } catch (e: any) {
      notify.showError(e?.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} mb={1.5} flexWrap="wrap">
        <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, color: TEXT }}>Saved Configurations</Typography>
        <Chip size="small" label={`${rows.length} total`} sx={{ bgcolor: 'rgba(51,214,255,0.12)', color: PRIMARY, fontWeight: 700, height: 22 }} />
        <Box sx={{ flex: 1 }} />
        <TextField
          size="small"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or code…"
          sx={{ minWidth: 260, '& .MuiOutlinedInput-root': { bgcolor: SURFACE, color: TEXT, borderRadius: '10px', '& fieldset': { borderColor: BORDER }, '&:hover fieldset': { borderColor: PRIMARY } } }}
        />
        <Button variant="outlined" size="small" startIcon={<RefreshIcon sx={{ fontSize: 16 }} />} onClick={load}
          sx={{ textTransform: 'none', borderRadius: '10px', borderColor: BORDER, color: TEXT, '&:hover': { borderColor: PRIMARY, color: PRIMARY } }}>
          Refresh
        </Button>
      </Stack>

      <TableContainer component={Paper} sx={{ bgcolor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '14px', boxShadow: 'none' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['NAME', 'CODE', 'STATUS', 'PROJECT', 'UPDATED', 'ACTIONS'].map(h => (
                <TableCell key={h} sx={{ color: TEXT_DIM, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', borderBottom: `1px solid ${BORDER}` }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} sx={{ py: 6, textAlign: 'center', borderBottom: 'none' }}><CircularProgress size={24} sx={{ color: PRIMARY }} /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} sx={{ py: 6, textAlign: 'center', color: TEXT_DIM, borderBottom: 'none' }}>No saved configurations yet</TableCell></TableRow>
            ) : filtered.map(r => (
              <TableRow key={r.id} sx={{ '&:hover': { bgcolor: 'rgba(51,214,255,0.04)' } }}>
                <TableCell sx={{ color: TEXT, fontWeight: 600, fontSize: 13, borderBottom: `1px solid ${BORDER}` }}>{r.name || '—'}</TableCell>
                <TableCell sx={{ color: TEXT_DIM, fontSize: 12, borderBottom: `1px solid ${BORDER}` }}>{r.code || '—'}</TableCell>
                <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                  <Chip size="small" label={r.status || 'draft'} sx={{ bgcolor: 'rgba(51,214,255,0.10)', color: PRIMARY, fontWeight: 600, height: 20, fontSize: 11 }} />
                </TableCell>
                <TableCell sx={{ color: TEXT_DIM, fontSize: 12, borderBottom: `1px solid ${BORDER}` }}>{r.project_id ? r.project_id.slice(0, 8) : '—'}</TableCell>
                <TableCell sx={{ color: TEXT_DIM, fontSize: 12, borderBottom: `1px solid ${BORDER}` }}>{r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}</TableCell>
                <TableCell sx={{ borderBottom: `1px solid ${BORDER}` }}>
                  <Tooltip title="Open project">
                    <IconButton size="small" disabled={!r.project_id} onClick={() => r.project_id && navigate(`/projects/${r.project_id}`)} sx={{ color: PRIMARY }}>
                      <ViewIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" onClick={() => handleDelete(r.id)} sx={{ color: '#EF4444' }}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Comex Copper — market price + bus-bar pricing calculator                   */
/* ────────────────────────────────────────────────────────────────────────── */
const ComexCopperTab: React.FC = () => {
  const notify = useNotification();
  const [price, setPrice] = useState<CopperPrice | null>(null);
  const [loading, setLoading] = useState(false);
  const [adder, setAdder] = useState<string>('3');
  const [markup, setMarkup] = useState<string>('25');
  const [asOf, setAsOf] = useState<string>('');

  const load = useCallback(async (dateIso?: string) => {
    setLoading(true);
    try {
      const data = dateIso
        ? await marketDataService.getCopperPriceForDate(dateIso)
        : await marketDataService.getCopperPrice();
      setPrice(data);
      if (!data) notify.showError('No snapshot for that date');
    } catch (e: any) {
      notify.showError(e?.response?.data?.message || 'Failed to fetch copper price');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const comexLb = price?.price_per_lb ?? 0;
  const adderNum = Number(adder) || 0;
  const markupPct = Number(markup) || 0;
  const purchase = comexLb + adderNum;
  const quoted = purchase * (1 + markupPct / 100);

  return (
    <Box>
      {/* Title */}
      <Box mb={1.5}>
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: TEXT, letterSpacing: '-0.02em' }}>Comex Copper</Typography>
        <Typography sx={{ fontSize: 12.5, color: TEXT_DIM }}>Pulling copper last trade price from comexlive.org via backend market provider</Typography>
      </Box>

      {/* Market card */}
      <Box sx={{ bgcolor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '14px', p: 2.5, mb: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={1.5} mb={1.5}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>Market: Copper (COMEX)</Typography>
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="outlined" startIcon={loading ? <CircularProgress size={14} sx={{ color: PRIMARY }} /> : <RefreshIcon sx={{ fontSize: 16 }} />}
            disabled={loading} onClick={() => load()}
            sx={{ textTransform: 'none', borderRadius: '10px', borderColor: BORDER, color: TEXT, '&:hover': { borderColor: PRIMARY, color: PRIMARY } }}>
            Refresh
          </Button>
        </Stack>
        <Stack direction="row" gap={4} flexWrap="wrap">
          <Box>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: TEXT_DIM, letterSpacing: '0.08em' }}>PRICE</Typography>
            <Typography sx={{ fontSize: 26, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>
              {comexLb.toFixed(2)} <span style={{ fontSize: 14, color: TEXT_DIM, fontWeight: 600 }}>USD/lb</span>
            </Typography>
            <Typography sx={{ fontSize: 11, color: TEXT_DIM, mt: 0.3 }}>≈ {(comexLb * 2.20462).toFixed(2)} USD/kg</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: TEXT_DIM, letterSpacing: '0.08em' }}>SOURCE</Typography>
            <Typography sx={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>{price?.source || 'comexlive.org'}</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: TEXT_DIM, letterSpacing: '0.08em' }}>LAST UPDATED</Typography>
            <Typography sx={{ fontSize: 14, color: TEXT, fontWeight: 600 }}>{price?.fetched_at ? new Date(price.fetched_at).toLocaleString() : '—'}</Typography>
          </Box>
        </Stack>
      </Box>

      {/* Bus bar pricing calculator */}
      <Box sx={{ bgcolor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '14px', p: 2.5, mb: 1.5 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: TEXT, mb: 0.3 }}>10' Silver Plated Copper Bus Bar Pricing</Typography>
        <Typography sx={{ fontSize: 12, color: TEXT_DIM, mb: 2 }}>Purchase price = COMEX + adder. Quoted price adds a markup above the purchase price.</Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
          <Box>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: TEXT_DIM, letterSpacing: '0.08em', mb: 0.6 }}>ADDER ABOVE COMEX ($/LB)</Typography>
            <TextField fullWidth size="small" value={adder} onChange={e => setAdder(e.target.value)} type="number"
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#000', color: TEXT, borderRadius: '10px', '& fieldset': { borderColor: BORDER }, '&:hover fieldset': { borderColor: PRIMARY } } }} />
            <Typography sx={{ fontSize: 11, color: TEXT_DIM, mt: 0.5 }}>Typically ~$3/lb for 10' silver plated copper bus bars</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: TEXT_DIM, letterSpacing: '0.08em', mb: 0.6 }}>QUOTE MARKUP (%)</Typography>
            <TextField fullWidth size="small" value={markup} onChange={e => setMarkup(e.target.value)} type="number"
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#000', color: TEXT, borderRadius: '10px', '& fieldset': { borderColor: BORDER }, '&:hover fieldset': { borderColor: PRIMARY } } }} />
            <Typography sx={{ fontSize: 11, color: TEXT_DIM, mt: 0.5 }}>Generate: {markupPct.toFixed(2)}% above purchase price</Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          <PriceCard label="COMEX PRICE" value={`${comexLb.toFixed(2)} USD/lb`} accent={BORDER} sublabel="" />
          <PriceCard label="EXPECTED PURCHASE PRICE" value={`${purchase.toFixed(2)} USD/lb`} accent="#F59E0B" sublabel={`COMEX (${comexLb.toFixed(2)}) + $${adderNum.toFixed(2)} adder`} />
          <PriceCard label="QUOTED PRICE" value={`${quoted.toFixed(2)} USD/lb`} accent={PRIMARY} sublabel={`Purchase (${purchase.toFixed(2)}) + ${markupPct.toFixed(2)}% markup`} />
        </Box>
      </Box>

      {/* As-of-date control */}
      <Box sx={{ bgcolor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '14px', p: 2.5, mb: 1.5 }}>
        <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: TEXT_DIM, letterSpacing: '0.08em', mb: 0.6 }}>AS-OF-DATE (OPTIONAL)</Typography>
        <Stack direction="row" gap={1.5} alignItems="center" flexWrap="wrap">
          <TextField size="small" type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
            sx={{ minWidth: 180, '& .MuiOutlinedInput-root': { bgcolor: '#000', color: TEXT, borderRadius: '10px', '& fieldset': { borderColor: BORDER }, '&:hover fieldset': { borderColor: PRIMARY } } }} />
          <Button variant="contained" startIcon={<TrendingUpIcon sx={{ fontSize: 16 }} />}
            onClick={() => load(asOf || undefined)}
            sx={{ bgcolor: PRIMARY, color: '#000', textTransform: 'none', fontWeight: 700, borderRadius: '10px', px: 2.5, '&:hover': { bgcolor: PRIMARY_DK, color: '#000' } }}>
            Pull Copper Costs
          </Button>
        </Stack>
      </Box>

      {/* Notes */}
      <Box sx={{ bgcolor: SURFACE, border: `1px solid ${BORDER}`, borderRadius: '14px', p: 2.5 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: PRIMARY, mb: 1 }}>Notes</Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, color: TEXT_DIM, fontSize: 12, lineHeight: 1.8 }}>
          <li>Backend endpoint: <code style={{ color: TEXT }}>/api/configurator/market/copper</code></li>
          <li>Set <code style={{ color: TEXT }}>MARKETDATA_PROVIDER=comexlive</code> in backend to enable real ComexLive pull.</li>
          <li>Historical snapshots persist via <code style={{ color: TEXT }}>configurator_comex_copper_snapshots</code>.</li>
        </Box>
      </Box>
    </Box>
  );
};

const PriceCard: React.FC<{ label: string; value: string; accent: string; sublabel: string }> = ({ label, value, accent, sublabel }) => (
  <Box sx={{ bgcolor: '#000', border: `1px solid ${accent}`, borderRadius: '12px', p: 1.5 }}>
    <Typography sx={{ fontSize: 10, fontWeight: 700, color: accent === BORDER ? TEXT_DIM : accent, letterSpacing: '0.08em', mb: 0.4 }}>{label}</Typography>
    <Typography sx={{ fontSize: 18, fontWeight: 800, color: TEXT }}>{value}</Typography>
    {sublabel && <Typography sx={{ fontSize: 10.5, color: TEXT_DIM, mt: 0.5 }}>{sublabel}</Typography>}
  </Box>
);

export default DatabaseHubPage;
