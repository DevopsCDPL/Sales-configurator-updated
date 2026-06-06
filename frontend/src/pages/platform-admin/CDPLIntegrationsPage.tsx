import React, { useState } from 'react';
import {
  Box, Typography, Card, Chip, Button, TextField, InputAdornment, Select, MenuItem,
  Switch, alpha, Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Snackbar, Alert,
} from '@mui/material';
import {
  Search as SearchIcon, Add as AddIcon, Close as CloseIcon,
  CheckCircle as ConnectedIcon, CloudOff as DisconnectedIcon,
  Storage as StorageIcon, Payment as PaymentIcon, Email as EmailIcon,
  Cloud as CloudIcon, Api as ApiIcon, Analytics as AnalyticsIcon,
} from '@mui/icons-material';

const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

const CATEGORIES = ['All', 'Payment', 'Storage', 'Communication', 'Analytics', 'Cloud'];

const MOCK_INTEGRATIONS = [
  { id: '1', name: 'Razorpay', desc: 'Payment gateway for INR transactions', icon: PaymentIcon, category: 'Payment', connected: true, color: T.blue, lastSync: '2 hours ago' },
  { id: '2', name: 'AWS S3', desc: 'Cloud object storage for documents', icon: StorageIcon, category: 'Storage', connected: true, color: T.amber, lastSync: '30 min ago' },
  { id: '3', name: 'SendGrid', desc: 'Transactional email service', icon: EmailIcon, category: 'Communication', connected: true, color: T.teal, lastSync: '1 hour ago' },
  { id: '4', name: 'Google Analytics', desc: 'Website & app analytics', icon: AnalyticsIcon, category: 'Analytics', connected: false, color: T.red, lastSync: '—' },
  { id: '5', name: 'Stripe', desc: 'International payment processing', icon: PaymentIcon, category: 'Payment', connected: false, color: T.purple, lastSync: '—' },
  { id: '6', name: 'Azure Blob', desc: 'Microsoft cloud storage', icon: CloudIcon, category: 'Storage', connected: false, color: T.blue, lastSync: '—' },
  { id: '7', name: 'Twilio', desc: 'SMS & WhatsApp notifications', icon: EmailIcon, category: 'Communication', connected: true, color: T.red, lastSync: '4 hours ago' },
  { id: '8', name: 'Mixpanel', desc: 'Product analytics and tracking', icon: AnalyticsIcon, category: 'Analytics', connected: false, color: T.purple, lastSync: '—' },
  { id: '9', name: 'Zoho Books', desc: 'Accounting and invoicing', icon: ApiIcon, category: 'Cloud', connected: true, color: T.green, lastSync: '1 day ago' },
  { id: '10', name: 'Firebase', desc: 'Push notifications and auth', icon: CloudIcon, category: 'Cloud', connected: false, color: T.amber, lastSync: '—' },
];

const CDPLIntegrationsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [integrations, setIntegrations] = useState(MOCK_INTEGRATIONS);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const toggle = (id: string) => {
    setIntegrations((prev) =>
      prev.map((ig) => ig.id === id ? { ...ig, connected: !ig.connected, lastSync: ig.connected ? '—' : 'Just now' } : ig)
    );
    const ig = integrations.find((i) => i.id === id);
    setToast(ig ? `${ig.name} ${ig.connected ? 'disconnected' : 'connected'}` : null);
  };

  const filtered = integrations.filter((ig) => {
    if (search && !ig.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (category !== 'All' && ig.category !== category) return false;
    return true;
  });

  const connectedCount = integrations.filter((i) => i.connected).length;

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>System / Integrations</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>Integrations</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Chip label={`${connectedCount} Connected`} size="small" sx={{ fontSize: 11, bgcolor: alpha(T.green, 0.1), color: T.green, fontWeight: 600 }} />
          <Button variant="contained" startIcon={<AddIcon sx={{ fontSize: 16 }} />} onClick={() => setCustomOpen(true)}
            sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
            Add Custom
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
        <TextField size="small" placeholder="Search integrations..." value={search} onChange={(e) => setSearch(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: T.t3 }} /></InputAdornment> }}
          sx={{ minWidth: 260, '& input': { fontSize: 13 }, bgcolor: T.surface }} />
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={c} size="small" clickable onClick={() => setCategory(c)}
              sx={{
                fontSize: 11, fontWeight: 500,
                bgcolor: category === c ? alpha(T.teal, 0.1) : 'transparent',
                color: category === c ? T.teal : T.t3,
                border: `1px solid ${category === c ? T.teal : T.border}`,
              }} />
          ))}
        </Box>
      </Box>

      {/* Integration Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 2 }}>
        {filtered.map((ig) => {
          const Icon = ig.icon;
          return (
            <Card key={ig.id} sx={{
              p: 2.5, borderRadius: '12px', border: `1px solid ${ig.connected ? T.teal : T.border}`,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'all 0.2s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' },
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '10px', bgcolor: alpha(ig.color, 0.1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon sx={{ fontSize: 20, color: ig.color }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.t1 }}>{ig.name}</Typography>
                    <Chip label={ig.category} size="small" sx={{ fontSize: 9, height: 16, bgcolor: alpha(ig.color, 0.08), color: ig.color, mt: 0.3 }} />
                  </Box>
                </Box>
                <Switch size="small" checked={ig.connected} onChange={() => toggle(ig.id)}
                  sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: T.green }, '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': { bgcolor: T.green } }} />
              </Box>
              <Typography sx={{ fontSize: 12, color: T.t2, mb: 2, lineHeight: 1.5 }}>{ig.desc}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {ig.connected ? <ConnectedIcon sx={{ fontSize: 14, color: T.green }} /> : <DisconnectedIcon sx={{ fontSize: 14, color: T.t3 }} />}
                  <Typography sx={{ fontSize: 11, color: ig.connected ? T.green : T.t3 }}>{ig.connected ? 'Connected' : 'Not Connected'}</Typography>
                </Box>
                {ig.lastSync !== '—' && <Typography sx={{ fontSize: 10, color: T.t3 }}>Synced {ig.lastSync}</Typography>}
              </Box>
            </Card>
          );
        })}

        {/* Add Custom Integration Card */}
        <Card onClick={() => setCustomOpen(true)} sx={{
          p: 2.5, borderRadius: '12px', border: `2px dashed ${T.border}`,
          boxShadow: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', minHeight: 180,
          '&:hover': { borderColor: T.teal, bgcolor: alpha(T.teal, 0.02) },
        }}>
          <AddIcon sx={{ fontSize: 32, color: T.t3, mb: 1 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: T.t2 }}>Add Custom Integration</Typography>
          <Typography sx={{ fontSize: 11, color: T.t3, mt: 0.5 }}>Connect via webhook or API</Typography>
        </Card>
      </Box>

      {/* Add Custom Dialog */}
      <Dialog open={customOpen} onClose={() => setCustomOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Add Custom Integration</Typography>
          <IconButton onClick={() => setCustomOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Integration Name" size="small" fullWidth value={customName} onChange={(e) => setCustomName(e.target.value)} InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
            <TextField label="Webhook URL" size="small" fullWidth value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://api.example.com/webhook" InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
            <Select size="small" defaultValue="webhook" sx={{ fontSize: 13 }}>
              <MenuItem value="webhook" sx={{ fontSize: 13 }}>Webhook</MenuItem>
              <MenuItem value="rest" sx={{ fontSize: 13 }}>REST API</MenuItem>
              <MenuItem value="graphql" sx={{ fontSize: 13 }}>GraphQL</MenuItem>
            </Select>
            <TextField label="API Key (Optional)" size="small" fullWidth type="password" InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCustomOpen(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          <Button variant="contained" onClick={() => { setCustomOpen(false); setToast('Integration added'); setCustomName(''); setCustomUrl(''); }}
            sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
            Add Integration
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ borderRadius: '8px' }}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
};

export default CDPLIntegrationsPage;
