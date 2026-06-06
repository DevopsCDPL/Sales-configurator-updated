import React, { useState } from 'react';
import {
  Box, Typography, Card, Chip, Button, TextField, InputAdornment, Select, MenuItem,
  alpha, Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
  Snackbar, Alert, Tooltip, Checkbox, FormControlLabel,
} from '@mui/material';
import {
  Add as AddIcon, Close as CloseIcon, ContentCopy as CopyIcon,
  Visibility as ShowIcon, VisibilityOff as HideIcon,
  Delete as DeleteIcon, Code as CodeIcon,
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';

const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

const MOCK_KEYS = [
  { id: '1', name: 'Production API', key: 'cdpl_live_a3f2b1c8d9e7f4a6', created: '2025-10-15', lastUsed: '2026-03-15', calls: 8420, limit: 10000, permissions: ['Read', 'Write'], status: 'Active' },
  { id: '2', name: 'Staging API', key: 'cdpl_test_b7e4c9a1f3d2e5b8', created: '2025-12-01', lastUsed: '2026-03-14', calls: 3200, limit: 5000, permissions: ['Read', 'Write', 'Delete'], status: 'Active' },
  { id: '3', name: 'Analytics Read-Only', key: 'cdpl_ro_c2d8f0b5a7e1c4d9', created: '2026-01-20', lastUsed: '2026-03-13', calls: 1560, limit: 10000, permissions: ['Read'], status: 'Active' },
  { id: '4', name: 'Webhook Integration', key: 'cdpl_wh_d5a9e3c6b1f2a7e0', created: '2025-09-01', lastUsed: '2026-02-28', calls: 560, limit: 2000, permissions: ['Webhook'], status: 'Active' },
  { id: '5', name: 'Legacy API (Deprecated)', key: 'cdpl_old_e8f1b4d7c0a3b6f2', created: '2024-06-15', lastUsed: '2025-11-20', calls: 0, limit: 1000, permissions: ['Read'], status: 'Revoked' },
];

const USAGE_DATA = Array.from({ length: 7 }, (_, i) => ({
  day: dayjs().subtract(6 - i, 'day').format('ddd'),
  calls: Math.floor(Math.random() * 1500) + 500,
}));

const CODE_SNIPPETS: Record<string, string> = {
  curl: `curl -X GET "https://api.cdpl-forge.com/v1/projects" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`,
  node: `const response = await fetch('https://api.cdpl-forge.com/v1/projects', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
});
const data = await response.json();`,
  python: `import requests

response = requests.get(
    'https://api.cdpl-forge.com/v1/projects',
    headers={'Authorization': 'Bearer YOUR_API_KEY'}
)
data = response.json()`,
};

const CDPLApiKeysPage: React.FC = () => {
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [generateOpen, setGenerateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPerms, setNewKeyPerms] = useState<string[]>(['Read']);
  const [codeTab, setCodeTab] = useState<'curl' | 'node' | 'python'>('curl');
  const [toast, setToast] = useState<string | null>(null);

  const maskKey = (key: string) => key.substring(0, 10) + '••••••••••••';
  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setToast('API key copied to clipboard');
  };

  const togglePerm = (p: string) => {
    setNewKeyPerms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>System / API Keys</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>API Keys</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon sx={{ fontSize: 16 }} />} onClick={() => setGenerateOpen(true)}
          sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
          Generate Key
        </Button>
      </Box>

      {/* Usage Chart + Rate Limits */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 2.5, mb: 3 }}>
        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.t1, mb: 2 }}>API Usage (Last 7 Days)</Typography>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={USAGE_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.borderSubtle} />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: T.t3 }} />
              <YAxis tick={{ fontSize: 10, fill: T.t3 }} width={40} />
              <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}` }} />
              <Bar dataKey="calls" fill={T.teal} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.t1, mb: 2 }}>Rate Limits</Typography>
          {[
            { label: 'Requests / Minute', value: '60', used: '12' },
            { label: 'Requests / Hour', value: '1,000', used: '342' },
            { label: 'Requests / Day', value: '10,000', used: '4,280' },
          ].map((r) => (
            <Box key={r.label} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: 12, color: T.t2 }}>{r.label}</Typography>
                <Typography sx={{ fontSize: 11, color: T.t3 }}>{r.used} / {r.value}</Typography>
              </Box>
              <Box sx={{ height: 4, bgcolor: T.borderSubtle, borderRadius: '2px', overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: `${(parseInt(r.used.replace(',', '')) / parseInt(r.value.replace(',', ''))) * 100}%`, bgcolor: T.teal, borderRadius: '2px' }} />
              </Box>
            </Box>
          ))}
        </Card>
      </Box>

      {/* API Keys Table */}
      <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'auto', mb: 3 }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <Box component="thead">
            <Box component="tr" sx={{ borderBottom: `1px solid ${T.border}` }}>
              {['Name', 'API Key', 'Permissions', 'Usage', 'Last Used', 'Status', 'Actions'].map((h) => (
                <Box component="th" key={h} sx={{ px: 2, py: 1.5, textAlign: 'left', fontSize: 11, fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {MOCK_KEYS.map((k) => (
              <Box component="tr" key={k.id} sx={{ borderBottom: `1px solid ${T.borderSubtle}`, '&:hover': { bgcolor: alpha(T.teal, 0.02) } }}>
                <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 13, fontWeight: 500, color: T.t1 }}>{k.name}</Box>
                <Box component="td" sx={{ px: 2, py: 1.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: T.t2 }}>
                      {showKey[k.id] ? k.key : maskKey(k.key)}
                    </Typography>
                    <IconButton size="small" onClick={() => setShowKey((p) => ({ ...p, [k.id]: !p[k.id] }))}>
                      {showKey[k.id] ? <HideIcon sx={{ fontSize: 14 }} /> : <ShowIcon sx={{ fontSize: 14 }} />}
                    </IconButton>
                    <IconButton size="small" onClick={() => copyKey(k.key)}>
                      <CopyIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                </Box>
                <Box component="td" sx={{ px: 2, py: 1.5 }}>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {k.permissions.map((p) => <Chip key={p} label={p} size="small" sx={{ fontSize: 9, height: 18, bgcolor: alpha(T.teal, 0.1), color: T.teal }} />)}
                  </Box>
                </Box>
                <Box component="td" sx={{ px: 2, py: 1.5 }}>
                  <Typography sx={{ fontSize: 12, color: T.t2 }}>{k.calls.toLocaleString()} / {k.limit.toLocaleString()}</Typography>
                  <Box sx={{ height: 3, bgcolor: T.borderSubtle, borderRadius: '2px', mt: 0.5, width: 60 }}>
                    <Box sx={{ height: '100%', width: `${(k.calls / k.limit) * 100}%`, bgcolor: k.calls / k.limit > 0.8 ? T.amber : T.teal, borderRadius: '2px' }} />
                  </Box>
                </Box>
                <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 11, color: T.t3 }}>{dayjs(k.lastUsed).format('MMM D')}</Box>
                <Box component="td" sx={{ px: 2, py: 1.5 }}>
                  <Chip label={k.status} size="small" sx={{ fontSize: 10, height: 20, bgcolor: alpha(k.status === 'Active' ? T.green : T.red, 0.1), color: k.status === 'Active' ? T.green : T.red }} />
                </Box>
                <Box component="td" sx={{ px: 2, py: 1.5 }}>
                  <IconButton size="small" sx={{ color: T.red }}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Card>

      {/* Code Snippet Panel */}
      <Card sx={{ p: 2.5, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CodeIcon sx={{ fontSize: 18, color: T.teal }} />
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.t1 }}>Quick Start</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 2 }}>
          {(['curl', 'node', 'python'] as const).map((tab) => (
            <Chip key={tab} label={tab === 'node' ? 'Node.js' : tab === 'curl' ? 'cURL' : 'Python'} size="small" clickable
              onClick={() => setCodeTab(tab)}
              sx={{ fontSize: 11, bgcolor: codeTab === tab ? alpha(T.teal, 0.1) : 'transparent', color: codeTab === tab ? T.teal : T.t3, border: `1px solid ${codeTab === tab ? T.teal : T.border}` }} />
          ))}
        </Box>
        <Box sx={{ bgcolor: '#0F172A', borderRadius: '8px', p: 2, position: 'relative' }}>
          <IconButton size="small" onClick={() => { navigator.clipboard.writeText(CODE_SNIPPETS[codeTab]); setToast('Copied!'); }}
            sx={{ position: 'absolute', top: 8, right: 8, color: '#94A3B8' }}>
            <CopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
          <Typography component="pre" sx={{ fontSize: 12, color: '#E2E8F0', fontFamily: 'monospace', whiteSpace: 'pre-wrap', m: 0, lineHeight: 1.7 }}>
            {CODE_SNIPPETS[codeTab]}
          </Typography>
        </Box>
      </Card>

      {/* Generate Key Dialog */}
      <Dialog open={generateOpen} onClose={() => setGenerateOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Generate API Key</Typography>
          <IconButton onClick={() => setGenerateOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Key Name" size="small" fullWidth value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g., Production API" InputProps={{ sx: { fontSize: 13 } }} InputLabelProps={{ sx: { fontSize: 13 } }} />
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: T.t2, mb: 1 }}>Permissions</Typography>
              {['Read', 'Write', 'Delete', 'Webhook', 'Admin'].map((p) => (
                <FormControlLabel key={p}
                  control={<Checkbox size="small" checked={newKeyPerms.includes(p)} onChange={() => togglePerm(p)} sx={{ '&.Mui-checked': { color: T.teal } }} />}
                  label={<Typography sx={{ fontSize: 12 }}>{p}</Typography>}
                />
              ))}
            </Box>
            <Select size="small" defaultValue="10000" sx={{ fontSize: 13 }}>
              <MenuItem value="1000" sx={{ fontSize: 13 }}>1,000 req/day</MenuItem>
              <MenuItem value="5000" sx={{ fontSize: 13 }}>5,000 req/day</MenuItem>
              <MenuItem value="10000" sx={{ fontSize: 13 }}>10,000 req/day</MenuItem>
              <MenuItem value="unlimited" sx={{ fontSize: 13 }}>Unlimited</MenuItem>
            </Select>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setGenerateOpen(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          <Button variant="contained" onClick={() => { setGenerateOpen(false); setToast('API key generated'); setNewKeyName(''); }}
            sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
            Generate
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ borderRadius: '8px' }}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
};

export default CDPLApiKeysPage;
