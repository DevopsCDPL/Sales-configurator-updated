import React, { useState } from 'react';
import {
  Box, Typography, Card, TextField, Switch, Button, Divider, alpha, Select, MenuItem,
  Snackbar, Alert,
} from '@mui/material';
import {
  Business as GeneralIcon, Security as SecurityIcon, Email as EmailIcon,
  Palette as AppearanceIcon, Backup as BackupIcon, Save as SaveIcon,
} from '@mui/icons-material';

const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

const TABS = [
  { key: 'general', label: 'General', icon: GeneralIcon },
  { key: 'security', label: 'Security', icon: SecurityIcon },
  { key: 'email', label: 'Email', icon: EmailIcon },
  { key: 'appearance', label: 'Appearance', icon: AppearanceIcon },
  { key: 'backup', label: 'Backup', icon: BackupIcon },
];

const Row = ({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 2, borderBottom: `1px solid ${T.borderSubtle}` }}>
    <Box sx={{ flex: 1, mr: 3 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 500, color: T.t1 }}>{label}</Typography>
      {desc && <Typography sx={{ fontSize: 11, color: T.t3, mt: 0.3 }}>{desc}</Typography>}
    </Box>
    <Box sx={{ flexShrink: 0 }}>{children}</Box>
  </Box>
);

const CDPLSettingsPage: React.FC = () => {
  const [tab, setTab] = useState('general');
  const [toast, setToast] = useState<string | null>(null);

  // General
  const [platformName, setPlatformName] = useState('CDPL Forge Platform');
  const [supportEmail, setSupportEmail] = useState('support@cdpl-forge.com');
  const [defaultTimezone, setDefaultTimezone] = useState('Asia/Kolkata');

  // Security
  const [force2FA, setForce2FA] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState('30');
  const [passwordExpiry, setPasswordExpiry] = useState('90');
  const [ipWhitelist, setIpWhitelist] = useState(false);

  // Email
  const [smtpHost, setSmtpHost] = useState('smtp.sendgrid.net');
  const [smtpPort, setSmtpPort] = useState('587');
  const [senderName, setSenderName] = useState('CDPL Forge');
  const [senderEmail, setSenderEmail] = useState('noreply@cdpl-forge.com');

  // Appearance
  const [defaultTheme, setDefaultTheme] = useState('light');
  const [brandColor, setBrandColor] = useState('#1F7A63');
  const [showLogo, setShowLogo] = useState(true);

  // Backup
  const [autoBackup, setAutoBackup] = useState(true);
  const [backupFreq, setBackupFreq] = useState('daily');
  const [retainDays, setRetainDays] = useState('30');

  const save = () => setToast('Settings saved successfully');

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>System / Settings</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>Platform Settings</Typography>
        </Box>
        <Button variant="contained" startIcon={<SaveIcon sx={{ fontSize: 16 }} />} onClick={save}
          sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, fontSize: 13, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
          Save Changes
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '200px 1fr' }, gap: 2.5 }}>
        {/* Tab Navigation */}
        <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', p: 1, alignSelf: 'start' }}>
          {TABS.map((t) => (
            <Box key={t.key} onClick={() => setTab(t.key)} sx={{
              display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1.2, borderRadius: '8px', cursor: 'pointer',
              bgcolor: tab === t.key ? alpha(T.teal, 0.08) : 'transparent',
              color: tab === t.key ? T.teal : T.t2,
              '&:hover': { bgcolor: alpha(T.teal, 0.04) }, transition: 'all 0.15s',
            }}>
              <t.icon sx={{ fontSize: 18 }} />
              <Typography sx={{ fontSize: 13, fontWeight: tab === t.key ? 600 : 400 }}>{t.label}</Typography>
            </Box>
          ))}
        </Card>

        {/* Tab Content */}
        <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', p: 3 }}>
          {tab === 'general' && (
            <>
              <Typography sx={{ fontSize: 16, fontWeight: 600, color: T.t1, mb: 0.5 }}>General Settings</Typography>
              <Typography sx={{ fontSize: 12, color: T.t3, mb: 2 }}>Core platform configuration</Typography>
              <Row label="Platform Name" desc="Displayed in the header and emails">
                <TextField size="small" value={platformName} onChange={(e) => setPlatformName(e.target.value)} sx={{ width: 260, '& input': { fontSize: 13 } }} />
              </Row>
              <Row label="Support Email" desc="Public support contact address">
                <TextField size="small" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} sx={{ width: 260, '& input': { fontSize: 13 } }} />
              </Row>
              <Row label="Default Timezone">
                <Select size="small" value={defaultTimezone} onChange={(e) => setDefaultTimezone(e.target.value)} sx={{ width: 200, fontSize: 13 }}>
                  <MenuItem value="Asia/Kolkata" sx={{ fontSize: 13 }}>Asia/Kolkata (IST)</MenuItem>
                  <MenuItem value="UTC" sx={{ fontSize: 13 }}>UTC</MenuItem>
                  <MenuItem value="America/New_York" sx={{ fontSize: 13 }}>America/New_York (EST)</MenuItem>
                </Select>
              </Row>
              <Row label="Date Format">
                <Select size="small" defaultValue="DD/MM/YYYY" sx={{ width: 200, fontSize: 13 }}>
                  <MenuItem value="DD/MM/YYYY" sx={{ fontSize: 13 }}>DD/MM/YYYY</MenuItem>
                  <MenuItem value="MM/DD/YYYY" sx={{ fontSize: 13 }}>MM/DD/YYYY</MenuItem>
                  <MenuItem value="YYYY-MM-DD" sx={{ fontSize: 13 }}>YYYY-MM-DD</MenuItem>
                </Select>
              </Row>
              <Row label="Currency">
                <Select size="small" defaultValue="INR" sx={{ width: 200, fontSize: 13 }}>
                  <MenuItem value="INR" sx={{ fontSize: 13 }}>₹ INR</MenuItem>
                  <MenuItem value="USD" sx={{ fontSize: 13 }}>$ USD</MenuItem>
                  <MenuItem value="EUR" sx={{ fontSize: 13 }}>€ EUR</MenuItem>
                </Select>
              </Row>
            </>
          )}

          {tab === 'security' && (
            <>
              <Typography sx={{ fontSize: 16, fontWeight: 600, color: T.t1, mb: 0.5 }}>Security Settings</Typography>
              <Typography sx={{ fontSize: 12, color: T.t3, mb: 2 }}>Authentication and access controls</Typography>
              <Row label="Enforce 2FA" desc="Require two-factor authentication for all admins">
                <Switch size="small" checked={force2FA} onChange={(e) => setForce2FA(e.target.checked)} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: T.teal }, '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': { bgcolor: T.teal } }} />
              </Row>
              <Row label="Session Timeout" desc="Auto-logout after inactivity (minutes)">
                <Select size="small" value={sessionTimeout} onChange={(e) => setSessionTimeout(e.target.value)} sx={{ width: 140, fontSize: 13 }}>
                  {['15', '30', '60', '120'].map((v) => <MenuItem key={v} value={v} sx={{ fontSize: 13 }}>{v} min</MenuItem>)}
                </Select>
              </Row>
              <Row label="Password Expiry" desc="Force password change after N days">
                <Select size="small" value={passwordExpiry} onChange={(e) => setPasswordExpiry(e.target.value)} sx={{ width: 140, fontSize: 13 }}>
                  {['30', '60', '90', 'Never'].map((v) => <MenuItem key={v} value={v} sx={{ fontSize: 13 }}>{v === 'Never' ? v : `${v} days`}</MenuItem>)}
                </Select>
              </Row>
              <Row label="IP Whitelisting" desc="Restrict access to specific IP ranges">
                <Switch size="small" checked={ipWhitelist} onChange={(e) => setIpWhitelist(e.target.checked)} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: T.teal }, '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': { bgcolor: T.teal } }} />
              </Row>
              <Row label="Max Login Attempts" desc="Lock account after N failed attempts">
                <Select size="small" defaultValue="5" sx={{ width: 140, fontSize: 13 }}>
                  {['3', '5', '10'].map((v) => <MenuItem key={v} value={v} sx={{ fontSize: 13 }}>{v} attempts</MenuItem>)}
                </Select>
              </Row>
            </>
          )}

          {tab === 'email' && (
            <>
              <Typography sx={{ fontSize: 16, fontWeight: 600, color: T.t1, mb: 0.5 }}>Email Configuration</Typography>
              <Typography sx={{ fontSize: 12, color: T.t3, mb: 2 }}>SMTP and notification email settings</Typography>
              <Row label="SMTP Host">
                <TextField size="small" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} sx={{ width: 260, '& input': { fontSize: 13 } }} />
              </Row>
              <Row label="SMTP Port">
                <TextField size="small" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} sx={{ width: 120, '& input': { fontSize: 13 } }} />
              </Row>
              <Row label="Sender Name">
                <TextField size="small" value={senderName} onChange={(e) => setSenderName(e.target.value)} sx={{ width: 260, '& input': { fontSize: 13 } }} />
              </Row>
              <Row label="Sender Email">
                <TextField size="small" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} sx={{ width: 260, '& input': { fontSize: 13 } }} />
              </Row>
              <Row label="Send Test Email">
                <Button variant="outlined" size="small" onClick={() => setToast('Test email sent')}
                  sx={{ textTransform: 'none', fontSize: 11, borderColor: T.border, color: T.t2, borderRadius: '8px' }}>
                  Send Test
                </Button>
              </Row>
            </>
          )}

          {tab === 'appearance' && (
            <>
              <Typography sx={{ fontSize: 16, fontWeight: 600, color: T.t1, mb: 0.5 }}>Appearance</Typography>
              <Typography sx={{ fontSize: 12, color: T.t3, mb: 2 }}>Visual and branding customization</Typography>
              <Row label="Default Theme" desc="Applied when user has no preference">
                <Select size="small" value={defaultTheme} onChange={(e) => setDefaultTheme(e.target.value)} sx={{ width: 160, fontSize: 13 }}>
                  <MenuItem value="light" sx={{ fontSize: 13 }}>Light</MenuItem>
                  <MenuItem value="dark" sx={{ fontSize: 13 }}>Dark</MenuItem>
                  <MenuItem value="system" sx={{ fontSize: 13 }}>System</MenuItem>
                </Select>
              </Row>
              <Row label="Brand Color" desc="Primary color across the platform">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 28, height: 28, borderRadius: '6px', bgcolor: brandColor, border: `1px solid ${T.border}` }} />
                  <TextField size="small" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} sx={{ width: 120, '& input': { fontSize: 12, fontFamily: 'monospace' } }} />
                </Box>
              </Row>
              <Row label="Show Logo" desc="Display company logo in sidebar header">
                <Switch size="small" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: T.teal }, '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': { bgcolor: T.teal } }} />
              </Row>
              <Row label="Sidebar Style">
                <Select size="small" defaultValue="dark" sx={{ width: 160, fontSize: 13 }}>
                  <MenuItem value="dark" sx={{ fontSize: 13 }}>Dark</MenuItem>
                  <MenuItem value="light" sx={{ fontSize: 13 }}>Light</MenuItem>
                </Select>
              </Row>
            </>
          )}

          {tab === 'backup' && (
            <>
              <Typography sx={{ fontSize: 16, fontWeight: 600, color: T.t1, mb: 0.5 }}>Backup & Recovery</Typography>
              <Typography sx={{ fontSize: 12, color: T.t3, mb: 2 }}>Automated backup configuration</Typography>
              <Row label="Auto Backup" desc="Schedule automatic database backups">
                <Switch size="small" checked={autoBackup} onChange={(e) => setAutoBackup(e.target.checked)} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: T.teal }, '& .MuiSwitch-switchBase.Mui-checked+.MuiSwitch-track': { bgcolor: T.teal } }} />
              </Row>
              <Row label="Backup Frequency">
                <Select size="small" value={backupFreq} onChange={(e) => setBackupFreq(e.target.value)} sx={{ width: 160, fontSize: 13 }}>
                  <MenuItem value="hourly" sx={{ fontSize: 13 }}>Hourly</MenuItem>
                  <MenuItem value="daily" sx={{ fontSize: 13 }}>Daily</MenuItem>
                  <MenuItem value="weekly" sx={{ fontSize: 13 }}>Weekly</MenuItem>
                </Select>
              </Row>
              <Row label="Retention Period">
                <Select size="small" value={retainDays} onChange={(e) => setRetainDays(e.target.value)} sx={{ width: 160, fontSize: 13 }}>
                  {['7', '14', '30', '60', '90'].map((v) => <MenuItem key={v} value={v} sx={{ fontSize: 13 }}>{v} days</MenuItem>)}
                </Select>
              </Row>
              <Row label="Last Backup">
                <Typography sx={{ fontSize: 12, color: T.green, fontWeight: 500 }}>Mar 15, 2026 10:00 AM — 12.8 GB</Typography>
              </Row>
              <Row label="Manual Backup">
                <Button variant="outlined" size="small" startIcon={<BackupIcon sx={{ fontSize: 14 }} />} onClick={() => setToast('Backup initiated')}
                  sx={{ textTransform: 'none', fontSize: 11, borderColor: T.border, color: T.t2, borderRadius: '8px' }}>
                  Backup Now
                </Button>
              </Row>
            </>
          )}
        </Card>
      </Box>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={() => setToast(null)} severity="success" variant="filled" sx={{ borderRadius: '8px' }}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
};

export default CDPLSettingsPage;
