import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import {
  Box, Typography, TextField, Button, Alert, Switch,
  IconButton, alpha, Snackbar, Skeleton, InputAdornment,
  MenuItem, Tooltip, CircularProgress,
} from '@mui/material';
import {
  Person as PersonIcon, Lock as LockIcon,
  Settings as SystemIcon, Save as SaveIcon, CloudUpload as UploadIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon, VisibilityOff as VisibilityOffIcon,
  Email as EmailIcon, Shield as ShieldIcon, CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Badge as BadgeIcon,
  Tag as TagIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useCompanyLogo } from '../contexts/CompanyLogoContext';
import api from '../services/api';

// Lazy load DocumentNumberingPanel - only loads when System tab is opened
const DocumentNumberingPanel = lazy(() => import('../components/DocumentNumberingPanel'));
const DefaultTextConfigPanel = lazy(() => import('../components/DefaultTextConfigPanel'));

/* ═══════════════════════════════════════════════════════════════
   Design helpers
   ═══════════════════════════════════════════════════════════════ */
const PRIMARY = '#00c8ff';
const labelSx = { fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-muted, #9ab0d0)', textTransform: 'uppercase' as const, letterSpacing: 0.5, mb: 0.5 };
const inputSx = { '& .MuiOutlinedInput-root': { borderRadius: 2.5, fontSize: '0.88rem', color: 'var(--text-primary, #f8fbff)', bgcolor: 'var(--bg-input, #080e1a)', '& fieldset': { borderColor: 'rgba(0,200,255,0.12)' }, '&:hover fieldset': { borderColor: 'rgba(0,200,255,0.35)' }, '&.Mui-focused fieldset': { borderColor: '#00c8ff', borderWidth: '1.5px' }, '& input::placeholder': { color: 'var(--text-muted, #9ab0d0)', opacity: 1 }, '& textarea::placeholder': { color: 'var(--text-muted, #9ab0d0)', opacity: 1 } } };
const saveBtnSx = { bgcolor: '#00c8ff', color: '#03121a', '&:hover': { bgcolor: '#33d4ff' }, textTransform: 'none' as const, fontWeight: 700, borderRadius: 2, px: 3, boxShadow: 'none' };

/* ═══════════════════════════════════════════════════════════════
   Section Card wrapper
   ═══════════════════════════════════════════════════════════════ */
const SectionCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <Box sx={{ bgcolor: 'var(--bg-surface-2, #0f1622)', borderRadius: 2, border: '1px solid', borderColor: 'rgba(0,200,255,0.08)', p: 2, mb: 1.5, boxShadow: '0 1px 6px rgba(0,0,0,0.4)' }}>
    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary, #f8fbff)', mb: 0.15 }}>{title}</Typography>
    {subtitle && <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-muted, #9ab0d0)', mb: 1.5 }}>{subtitle}</Typography>}
    {!subtitle && <Box sx={{ mb: 1 }} />}
    {children}
  </Box>
);

/* ═══════════════════════════════════════════════════════════════
   Field wrapper (grid-aware label + input)
   ═══════════════════════════════════════════════════════════════ */
const Field: React.FC<{ label: string; children: React.ReactNode; span?: number }> = ({ label, children, span = 6 }) => (
  <Box sx={{ gridColumn: { xs: 'span 12', sm: `span ${span}` } }}>
    <Typography sx={labelSx}>{label}</Typography>
    {children}
  </Box>
);

/* ═══════════════════════════════════════════════════════════════
   Company form fields — isolated state prevents focus loss
   ═══════════════════════════════════════════════════════════════ */
const validateEmail = (email: string) => {
  if (!email) return ''; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Invalid email format';
};
const validatePhone = (phone: string) => {
  if (!phone) return ''; // optional
  return /^[+]?[\d\s().\-]{7,20}$/.test(phone) ? '' : 'Invalid phone number';
};
const validateWebsite = (url: string) => {
  if (!url) return ''; // optional
  return /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(url) ? '' : 'Invalid website URL';
};

const CompanyFormFields: React.FC<{
  initialSettings: { name: string; address: string; phone: string; email: string; website: string; tax_id: string };
  onChange: (data: any, errors: Record<string, string>) => void;
  disabled?: boolean;
}> = ({ initialSettings, onChange, disabled }) => {
  const [form, setForm] = useState(initialSettings);
  const formJsonRef = useRef(JSON.stringify(initialSettings));
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors: Record<string, string> = {
    name: form.name?.trim() ? '' : 'Company name is required',
    email: validateEmail(form.email || ''),
    phone: validatePhone(form.phone || ''),
    website: validateWebsite(form.website || ''),
  };

  // Sync from parent whenever initialSettings changes (use JSON comparison to avoid unnecessary syncs)
  useEffect(() => {
    const newJson = JSON.stringify(initialSettings);
    if (newJson !== formJsonRef.current) {
      formJsonRef.current = newJson;
      setForm(initialSettings);
      setTouched({});
    }
  }, [initialSettings]);

  // Notify parent of both data and validation errors on every change
  useEffect(() => {
    onChange(form, errors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const handle = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value;
    setForm(prev => ({ ...prev, [field]: v }));
  };

  const markTouched = (field: string) => () => setTouched(prev => ({ ...prev, [field]: true }));

  const fieldError = (field: string) => touched[field] && errors[field] ? errors[field] : '';

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
      <Field label="Company Name">
        <TextField fullWidth size="small" value={form.name} sx={inputSx} disabled />
      </Field>
      <Field label="Tax ID">
        <TextField fullWidth size="small" value={form.tax_id} onChange={handle('tax_id')} sx={inputSx} disabled={disabled} />
      </Field>
      <Field label="Phone">
        <TextField fullWidth size="small" value={form.phone} onChange={handle('phone')} onBlur={markTouched('phone')}
          error={!!fieldError('phone')} helperText={fieldError('phone')} sx={inputSx} disabled={disabled} />
      </Field>
      <Field label="Email">
        <TextField fullWidth size="small" value={form.email} onChange={handle('email')} onBlur={markTouched('email')}
          error={!!fieldError('email')} helperText={fieldError('email')} sx={inputSx} disabled={disabled} />
      </Field>
      <Field label="Website">
        <TextField fullWidth size="small" value={form.website} onChange={handle('website')} onBlur={markTouched('website')}
          error={!!fieldError('website')} helperText={fieldError('website')} sx={inputSx} disabled={disabled} />
      </Field>
      <Field label="Address" span={12}>
        <TextField fullWidth size="small" multiline rows={2} value={form.address} onChange={handle('address')} sx={inputSx} disabled={disabled} />
      </Field>
    </Box>
  );
};

/* ═══════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════ */
type ProfileForm = { name: string; email: string; phone: string; position: string; role: string };

const mapProfileFromApi = (data: any): ProfileForm => ({
  name: data?.name || '',
  email: data?.email || '',
  phone: data?.phone || '',
  position: data?.position || '',
  role: data?.role || 'user',
});

const SettingsPage: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { refreshLogo } = useCompanyLogo();
  const isPlatformAdmin = user?.role === 'platform_admin';
  const isMainAdmin = user?.role === 'main_admin';
  const isAdmin = user?.role === 'admin' || isMainAdmin;
  const isCoAdmin = !!(user as any)?.is_co_admin;
  // Full access: platform_admin, main_admin, or co-admin (Owner/Co-Owner)
  const hasFullAccess = isPlatformAdmin || isMainAdmin || isCoAdmin;

  type Section = 'profile' | 'system' | 'security' | 'defaultTexts';
  const [activeSection, setActiveSection] = useState<Section>('profile');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  // State
  const [profile, setProfile] = useState<ProfileForm>({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '', position: user?.position || '', role: user?.role || 'main_admin' });
  const profileBaselineRef = useRef<ProfileForm>({ name: user?.name || '', email: user?.email || '', phone: user?.phone || '', position: user?.position || '', role: user?.role || 'main_admin' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [companySettings, setCompanySettings] = useState({ name: '', address: '', phone: '', email: '', website: '', tax_id: '', logo: '' });
  const [companyLoaded, setCompanyLoaded] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [companyErrors, setCompanyErrors] = useState<Record<string, string>>({});
  
  // Sync company settings to ref whenever they change (after reload or manual updates)
  useEffect(() => {
    companyDraftRef.current = companySettings;
  }, [companySettings]);
  
  const companyDraftRef = useRef(companySettings);
  const [system, setSystem] = useState<{ projectNumberPrefix: string; soNumberPrefix: string; woNumberPrefix: string; 
    quotationNumberPrefix: string; quotationStartingNumber: number;
    defaultMargin: number | string; defaultPaymentTerms: string; quotationValidity: number | string; emailNotifications: boolean; autoBackup: boolean;
    quotationNotes?: string; quotationTerms?: string; workOrderQualityReqs?: string;
    logisticsInstructions?: string; invoicePaymentTerms?: string; invoiceNotes?: string;
    invoiceTerms?: string; qualityNotes?: string;
    woPreparedByNames?: string; woApprovedByNames?: string;
    productionInspectorInitials?: string; productionOperatorInitials?: string; }>({
    projectNumberPrefix: 'PRJ', soNumberPrefix: 'SO', woNumberPrefix: 'WO', 
    quotationNumberPrefix: 'QT', quotationStartingNumber: 3,
    defaultMargin: 15,
    defaultPaymentTerms: 'Net 30', quotationValidity: 30, emailNotifications: true, autoBackup: true,
  });

  const navItems: { key: Section; label: string; icon: React.ReactElement<any>; adminOnly?: boolean }[] = [
    { key: 'profile', label: 'Profile', icon: <PersonIcon /> },
    { key: 'system', label: 'System', icon: <SystemIcon />, adminOnly: true },
    { key: 'defaultTexts', label: 'Default Text Configuration', icon: <TagIcon />, adminOnly: true },
    { key: 'security', label: 'Security', icon: <LockIcon /> },
  ];
  const visibleNav = navItems.filter(n => !n.adminOnly || hasFullAccess);

  /* ─── Role badge config ────────────────────────────────────── */
  const roleBadge = useMemo(() => {
    switch (user?.role) {
      case 'platform_admin': return { label: 'Platform Admin', color: 'rgba(0,200,255,0.25)' };
      case 'main_admin': return { label: 'Super Admin', color: 'rgba(0,200,255,0.18)' };
      case 'admin':      return { label: 'Company Admin', color: 'rgba(0,200,255,0.12)' };
      default:           return { label: 'Member', color: 'rgba(0,200,255,0.08)' };
    }
  }, [user?.role]);

  /* ─── Password strength helpers ────────────────────────────── */
  const pwRules = useMemo(() => {
    const p = passwords.newPassword;
    return [
      { label: 'At least 8 characters', met: p.length >= 8 },
      { label: 'Contains uppercase letter', met: /[A-Z]/.test(p) },
      { label: 'Contains lowercase letter', met: /[a-z]/.test(p) },
      { label: 'Contains a number', met: /\d/.test(p) },
      { label: 'Contains special character', met: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
    ];
  }, [passwords.newPassword]);

  const pwStrength = useMemo(() => {
    const met = pwRules.filter(r => r.met).length;
    if (met <= 1) return { score: 15, label: 'Very Weak', color: '#ef4444' };
    if (met === 2) return { score: 35, label: 'Weak', color: '#F59E0B' };
    if (met === 3) return { score: 55, label: 'Fair', color: '#eab308' };
    if (met === 4) return { score: 80, label: 'Strong', color: '#22c55e' };
    return { score: 100, label: 'Very Strong', color: '#22c55e' };
  }, [pwRules]);

  /* ─── Loaders ──────────────────────────────────────────────── */
  const [systemLoaded, setSystemLoaded] = useState(false);
  
  // Load profile and company settings in parallel on mount (non-blocking)
  useEffect(() => {
    const load = async () => {
      // Load profile and company in parallel for faster initial load
      const [profileRes, companyRes] = await Promise.allSettled([
        api.get('/users/profile'),
        api.get('/settings/company'),
      ]);
      
      // Process profile
      if (profileRes.status === 'fulfilled' && profileRes.value.data?.data) {
        const nextProfile = mapProfileFromApi(profileRes.value.data.data);
        setProfile(nextProfile);
        profileBaselineRef.current = nextProfile;
      } else if (profileRes.status === 'rejected') {
        console.error('Failed to load profile:', profileRes.reason);
      }
      setProfileLoaded(true);
      
      // Process company settings
      if (companyRes.status === 'fulfilled' && companyRes.value.data?.data) {
        const data = companyRes.value.data.data;
        setCompanySettings(data);
        if (data.logo_data) {
          setLogoPreview(data.logo_data);
        } else if (data.logo && !data.logo_missing) {
          const b = (api.defaults.baseURL || '').replace('/api', '');
          setLogoPreview(`${b}${data.logo}?t=${Date.now()}`);
        } else {
          setLogoPreview(null);
        }
      } else if (companyRes.status === 'rejected') {
        console.error('Failed to load company settings:', companyRes.reason);
      }
      setCompanyLoaded(true);
    };
    load();
  }, []);
  
  // Lazy load system settings only when System tab is clicked
  useEffect(() => {
    if (activeSection === 'system' && !systemLoaded) {
      const loadSystem = async () => {
        try {
          const r = await api.get('/settings/system');
          if (r.data.data) setSystem(r.data.data);
          setSystemLoaded(true);
        } catch (e: any) {
          console.error('Failed to load system settings:', e);
          setSystemLoaded(true); // Mark as loaded even on error to prevent retry loop
        }
      };
      loadSystem();
    }
  }, [activeSection, systemLoaded]);

  /* ─── Handlers ─────────────────────────────────────────────── */

  const handleSaveProfile = async () => {
    setError(null);
    setSuccess(null);

    const payload: Partial<ProfileForm> = {};
    const baseline = profileBaselineRef.current;
    const fields: (keyof ProfileForm)[] = ['name', 'email', 'phone', 'position', 'role'];

    for (const field of fields) {
      const incoming = profile[field];
      if (incoming === undefined || incoming === null) continue;

      const nextValue = typeof incoming === 'string' ? incoming.trim() : incoming;
      const prevValue = typeof baseline[field] === 'string' ? baseline[field].trim() : baseline[field];

      if (nextValue === prevValue) continue;

      if ((field === 'name' || field === 'email') && nextValue === '') {
        setError(`${field === 'name' ? 'Name' : 'Email'} is required`);
        return;
      }

      payload[field] = nextValue;
    }

    if (Object.keys(payload).length === 0) {
      setSuccess('No profile changes to save');
      return;
    }

    try {
      await api.put('/users/profile', payload);

      const refreshed = await api.get('/users/profile', {
        params: { _t: Date.now() },
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
      });

      if (refreshed.data?.data) {
        const nextProfile = mapProfileFromApi(refreshed.data.data);
        setProfile(nextProfile);
        profileBaselineRef.current = nextProfile;
      }

      await refreshUser();
      setSuccess('Profile updated successfully');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Error updating profile');
    }
  };

  const handleChangePassword = async () => {
    if (passwords.newPassword !== passwords.confirmPassword) { setError('Passwords do not match'); return; }
    if (passwords.newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    try { await api.put('/users/password', { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword }); setSuccess('Password changed'); setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' }); }
    catch (e: any) { setError(e.response?.data?.message || 'Error changing password'); }
  };

  const reloadCompanySettings = async () => {
    try {
      const r = await api.get('/settings/company', { 
        params: { _t: Date.now() }, // Force fresh data from server, prevent any caching
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
      });
      if (r.data?.data) {
        setCompanySettings(r.data.data);
        setCompanyLoaded(true);
        if (r.data.data.logo_data) {
          setLogoPreview(r.data.data.logo_data);
        } else if (r.data.data.logo && !r.data.data.logo_missing) {
          const b = (api.defaults.baseURL || '').replace('/api', '');
          setLogoPreview(`${b}${r.data.data.logo}?t=${Date.now()}`);
        } else {
          setLogoPreview(null);
        }
      }
    } catch (e) { 
      console.error('Failed to reload company settings:', e);
      setError('Failed to reload settings from server');
    }
  };

  const handleSaveCompany = async () => {
    if (!companyLoaded) {
      setError('Company settings have not loaded yet. Please wait or refresh the page.');
      return;
    }
    // Check for validation errors
    const activeErrors = Object.entries(companyErrors).filter(([, msg]) => msg);
    if (activeErrors.length > 0) {
      setError(activeErrors.map(([, msg]) => msg).join(', '));
      return;
    }
    try {
      const draft = companyDraftRef.current as any;
      const infoOnly = {
        name: draft.name,
        address: draft.address,
        phone: draft.phone,
        email: draft.email,
        website: draft.website,
        tax_id: draft.tax_id,
      };
      const response = await api.put('/settings/company', infoOnly);
      if (response.data.success) {
        await reloadCompanySettings();
        setSuccess('Company settings updated successfully');
      } else {
        setError(response.data.message || 'Failed to save company settings');
      }
    } catch (e: any) { 
      setError(e.response?.data?.message || 'Error updating company settings'); 
      console.error('Save company settings error:', e);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setLogoUploading(true);
    try {
      const fd = new FormData(); fd.append('logo', file);
      await api.post('/settings/company/logo', fd);
      await reloadCompanySettings();
      await refreshLogo();
      setSuccess('Logo uploaded');
    } catch (e: any) { setError(e.response?.data?.message || 'Error uploading logo'); }
    finally { setLogoUploading(false); }
  };

  const handleRemoveLogo = async () => {
    try {
      setLogoPreview(null);  // Immediately clear preview
      await api.put('/settings/company', { logo: '' });
      await reloadCompanySettings();
      await refreshLogo();
      setSuccess('Logo removed');
    } catch (e: any) { setError(e.response?.data?.message || 'Error removing logo'); }
  };

  const handleSaveAll = async () => {
    try {
      // Save profile
      const payload: Partial<ProfileForm> = {};
      const baseline = profileBaselineRef.current;
      const fields: (keyof ProfileForm)[] = ['name', 'email', 'phone', 'position', 'role'];
      for (const field of fields) {
        const incoming = profile[field];
        if (incoming === undefined || incoming === null) continue;
        const nextValue = typeof incoming === 'string' ? incoming.trim() : incoming;
        const prevValue = typeof baseline[field] === 'string' ? baseline[field].trim() : baseline[field];
        if (nextValue !== prevValue) payload[field] = nextValue;
      }
      if (Object.keys(payload).length > 0) {
        if (!payload.name && profile.name?.trim() === '') { setError('Name is required'); return; }
        if (!payload.email && profile.email?.trim() === '') { setError('Email is required'); return; }
        await api.put('/users/profile', payload);
        const refreshed = await api.get('/users/profile', {
          params: { _t: Date.now() },
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
        });
        if (refreshed.data?.data) {
          const nextProfile = mapProfileFromApi(refreshed.data.data);
          setProfile(nextProfile);
          profileBaselineRef.current = nextProfile;
        }
        await refreshUser();
      }

      // Save company (if loaded and user has access)
      if (companyLoaded && hasFullAccess) {
        const activeErrors = Object.entries(companyErrors).filter(([, msg]) => msg);
        if (activeErrors.length > 0) { setError(activeErrors.map(([, msg]) => msg).join(', ')); return; }
        const draft = companyDraftRef.current as any;
        const infoOnly = { name: draft.name, address: draft.address, phone: draft.phone, email: draft.email, website: draft.website, tax_id: draft.tax_id };
        const response = await api.put('/settings/company', infoOnly);
        if (!response.data.success) { setError(response.data.message || 'Failed to save company settings'); return; }
        await reloadCompanySettings();
      }

      setSuccess('Settings saved successfully');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Error saving settings');
    }
  };

  const handleSaveSystem = async () => {
    try { 
      const response = await api.put('/settings/system', system);
      if (response.data.success) {
        setSystem(response.data.data);
        setSuccess('System settings updated successfully');
      } else {
        setError(response.data.message || 'Failed to save system settings');
      }
    } catch (e: any) { 
      setError(e.response?.data?.message || 'Error updating system settings');
      console.error('Save system settings error:', e);
    }
  };

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', bgcolor: 'var(--bg-canvas, #05080d)', minHeight: '100vh' }}>
      {/* ─── Sticky Header + Tabs ──────────────────────────── */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: 'var(--bg-surface, #0b1018)', pt: 1, pb: 0, borderBottom: '1px solid', borderColor: 'rgba(0,200,255,0.1)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography sx={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary, #f8fbff)' }}>Settings</Typography>
          {activeSection === 'profile' && (
            <Button variant="contained" startIcon={<SaveIcon sx={{ fontSize: 15 }} />} onClick={handleSaveAll} sx={{ ...saveBtnSx, minWidth: 120, whiteSpace: 'nowrap' }}>Save</Button>
          )}
          {activeSection === 'system' && hasFullAccess && (
            <Button variant="contained" startIcon={<SaveIcon sx={{ fontSize: 15 }} />} onClick={handleSaveSystem} sx={{ ...saveBtnSx, minWidth: 120, whiteSpace: 'nowrap' }}>Save System Settings</Button>
          )}
        </Box>
        {/* Horizontal Tab Navigation */}
        <Box sx={{ display: 'flex', gap: 0.5, px: 0.5 }}>
          {visibleNav.map((n) => {
            const active = activeSection === n.key;
            return (
              <Box key={n.key} onClick={() => setActiveSection(n.key)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  px: 2, py: 1, cursor: 'pointer',
                  borderBottom: active ? `2px solid ${PRIMARY}` : '2px solid transparent',
                  color: active ? '#00c8ff' : 'var(--text-muted, #9ab0d0)',
                  transition: 'all 0.15s',
                  '&:hover': { color: '#00c8ff', bgcolor: 'rgba(0,200,255,0.06)' },
                }}>
                {React.cloneElement(n.icon, { sx: { fontSize: 18 } })}
                <Typography sx={{ fontSize: '0.85rem', fontWeight: active ? 700 : 500, color: 'inherit' }}>
                  {n.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* ─── Main Content ─────────────────── */}
      <Box className="settings-main-layout" sx={{ p: 2 }}>
        <Box className="settings-content" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <>
            {/* ══════════════ PROFILE ══════════════════════════ */}
            {activeSection === 'profile' && (
              <Box className="animate-fadeIn" sx={{ pb: 2 }}>
                {/* ── 2-column layout: Personal Info (left) + Company (right) ── */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, alignItems: 'start' }}>
                  {/* LEFT: Personal Details */}
                  <Box>
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted, #9ab0d0)', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5, px: 0.5 }}>
                      Personal Information
                    </Typography>
                    <SectionCard title="">
                      {!profileLoaded ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                          {[32, 32, 32, 32].map((h, i) => <Skeleton key={i} variant="rounded" height={h} sx={{ borderRadius: 1.5 }} />)}
                        </Box>
                      ) : (
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2, mb: 0 }}>
                        <Field label="Username" span={6}>
                          <TextField fullWidth size="small" value={`@${(profile.name || '').toLowerCase().replace(/\s+/g, '')}`} disabled
                            sx={inputSx}
                            InputProps={{
                              startAdornment: <InputAdornment position="start"><PersonIcon sx={{ fontSize: 16, color: '#94a3b8' }} /></InputAdornment>,
                              endAdornment: <InputAdornment position="end"><Tooltip title="Copy Username"><IconButton size="small" onClick={() => { navigator.clipboard.writeText(`@${(profile.name || '').toLowerCase().replace(/\s+/g, '')}`); setSuccess('Username copied'); }}><CopyIcon sx={{ fontSize: 15, color: '#94a3b8' }} /></IconButton></Tooltip></InputAdornment>,
                            }}
                          />
                        </Field>
                        <Field label="User ID" span={6}>
                          <TextField fullWidth size="small" value={user?.user_id || 'Generated on first login'} disabled
                            sx={inputSx}
                            InputProps={{
                              startAdornment: <InputAdornment position="start"><BadgeIcon sx={{ fontSize: 16, color: '#94a3b8' }} /></InputAdornment>,
                              endAdornment: user?.user_id ? <InputAdornment position="end"><Tooltip title="Copy User ID"><IconButton size="small" onClick={() => { navigator.clipboard.writeText(String(user.user_id)); setSuccess('User ID copied'); }}><CopyIcon sx={{ fontSize: 15, color: '#94a3b8' }} /></IconButton></Tooltip></InputAdornment> : undefined,
                            }}
                          />
                        </Field>
                        <Field label="Full Name" span={12}>
                          <TextField fullWidth size="small" placeholder="Enter your full name"
                            value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} sx={inputSx} />
                        </Field>
                        <Field label="Email" span={12}>
                          <TextField fullWidth size="small" type="email" placeholder="your.email@example.com"
                            value={profile.email} disabled sx={inputSx} />
                        </Field>
                        <Field label="Phone">
                          <TextField fullWidth size="small" placeholder="Enter phone number"
                            value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} sx={inputSx} />
                        </Field>
                        <Field label="Position">
                          <TextField fullWidth size="small" placeholder="e.g. Sales Engineer, Project Manager"
                            value={profile.position} onChange={e => setProfile({ ...profile, position: e.target.value })} sx={inputSx} />
                        </Field>
                        <Field label="Role">
                          <TextField fullWidth size="small" select value={profile.role} disabled sx={inputSx}>
                            <MenuItem value="platform_admin">Platform Admin</MenuItem>
                            <MenuItem value="main_admin">Super Admin</MenuItem>
                            <MenuItem value="admin">Company Admin</MenuItem>
                            <MenuItem value="sales_engineer">Sales Engineer</MenuItem>
                            <MenuItem value="user">Member</MenuItem>
                          </TextField>
                        </Field>
                      </Box>
                      )}
                    </SectionCard>
                  </Box>

                  {/* RIGHT: Company Details (visible to all, editable by admins) */}
                  <Box>
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted, #9ab0d0)', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5, px: 0.5 }}>
                        Company
                      </Typography>
                      <SectionCard title="">
                        {!companyLoaded ? (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                            <Skeleton variant="rounded" height={50} sx={{ borderRadius: 1.5 }} />
                            {[32, 32, 32, 32].map((h, i) => <Skeleton key={i} variant="rounded" height={h} sx={{ borderRadius: 1.5 }} />)}
                          </Box>
                        ) : (
                        <>
                        {/* Logo row */}
                        <Box sx={{ mb: 2 }}>
                          {(companySettings as any).logo_missing && (
                            <Alert severity="warning" sx={{ mb: 1.5, borderRadius: 2, fontSize: '0.8rem' }}>
                              Logo file missing. Please re-upload your company logo.
                            </Alert>
                          )}
                          <Typography sx={labelSx}>Company Logo</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 0.5 }}>
                            <Box sx={{
                              width: 120, height: 50, borderRadius: 2, overflow: 'hidden',
                              border: '1px dashed', borderColor: 'rgba(0,200,255,0.2)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'var(--bg-input, #080e1a)',
                            }}>
                              {logoPreview ? (
                                <Box component="img" src={logoPreview} alt="Logo" sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                              ) : (
                                <Typography sx={{ fontSize: '0.7rem', color: 'var(--text-muted, #9ab0d0)' }}>No logo</Typography>
                              )}
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              {hasFullAccess && (
                                <>
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    component="label"
                                    startIcon={logoUploading ? <CircularProgress size={14} /> : <UploadIcon sx={{ fontSize: 15 }} />}
                                    disabled={logoUploading}
                                    sx={{ textTransform: 'none', fontSize: '0.75rem', fontWeight: 600, borderColor: alpha(PRIMARY, 0.3), color: PRIMARY, borderRadius: 2, '&:hover': { borderColor: PRIMARY, bgcolor: alpha(PRIMARY, 0.04) } }}
                                  >
                                    {logoUploading ? 'Uploading…' : 'Upload'}
                                    <input type="file" hidden accept="image/*" onChange={handleLogoUpload} />
                                  </Button>
                                  {logoPreview && (
                                    <Button
                                      variant="outlined"
                                      size="small"
                                      startIcon={<DeleteIcon sx={{ fontSize: 15 }} />}
                                      onClick={handleRemoveLogo}
                                      sx={{ textTransform: 'none', fontSize: '0.75rem', fontWeight: 600, borderColor: alpha('#ef4444', 0.3), color: '#ef4444', borderRadius: 2, '&:hover': { borderColor: '#ef4444', bgcolor: alpha('#ef4444', 0.04) } }}
                                    >
                                      Remove
                                    </Button>
                                  )}
                                </>
                              )}
                            </Box>
                          </Box>
                        </Box>

                        {/* Company fields */}
                        <CompanyFormFields
                          initialSettings={companySettings}
                          onChange={(data, errors) => { companyDraftRef.current = data; setCompanyErrors(errors); }}
                          disabled={!hasFullAccess}
                        />
                        </>
                        )}
                      </SectionCard>
                    </Box>
                </Box>
              </Box>
            )}

            {/* ══════════════ SYSTEM ════════════════════════ */}
            {activeSection === 'system' && (
              <Box className="animate-fadeIn">
                {!systemLoaded ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2 }} />
                    <Skeleton variant="rounded" height={80} sx={{ borderRadius: 2 }} />
                    <Skeleton variant="rounded" height={60} sx={{ borderRadius: 2 }} />
                  </Box>
                ) : (
                  <>
                    {/* ── Section: Document Numbering ── */}
                    <Box sx={{ mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted, #9ab0d0)', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5, px: 0.5 }}>
                        Document Numbering
                      </Typography>
                      <Suspense fallback={
                        <Box sx={{ bgcolor: 'var(--bg-surface-2, #0f1622)', borderRadius: 2, border: '1px solid', borderColor: 'rgba(0,200,255,0.08)', p: 3, mb: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                            <CircularProgress size={20} sx={{ color: '#00c8ff' }} />
                            <Typography sx={{ fontSize: '0.85rem', color: 'var(--text-muted, #9ab0d0)' }}>Loading document numbering...</Typography>
                          </Box>
                          <Skeleton variant="rounded" height={60} sx={{ borderRadius: 2, mb: 1 }} />
                          <Skeleton variant="rounded" height={60} sx={{ borderRadius: 2 }} />
                        </Box>
                      }>
                        <DocumentNumberingPanel />
                      </Suspense>
                    </Box>

                    <Box sx={{ height: 1, bgcolor: 'rgba(0,200,255,0.08)', my: 2 }} />

                    {/* ── Section: Global Default Values ── */}
                    <Box sx={{ mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted, #9ab0d0)', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5, px: 0.5 }}>
                        Global Default Values
                      </Typography>
                      <SectionCard title="" subtitle="Defaults for new documents and estimates">
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
                          <Field label="Default Margin (%)" span={4}>
                            <TextField fullWidth size="small" value={system.defaultMargin}
                              onChange={e => { const v = e.target.value; if (v === '' || !isNaN(Number(v))) setSystem({ ...system, defaultMargin: v as any }); }}
                              onBlur={e => setSystem({ ...system, defaultMargin: parseFloat(e.target.value) || 0 })}
                              inputProps={{ inputMode: 'decimal' }} sx={inputSx} disabled={!hasFullAccess} />
                          </Field>
                          <Field label="Payment Terms" span={4}>
                            <TextField fullWidth size="small" value={system.defaultPaymentTerms}
                              onChange={e => setSystem({ ...system, defaultPaymentTerms: e.target.value })}
                              sx={inputSx} disabled={!hasFullAccess} />
                          </Field>
                          <Field label="Quote Validity (days)" span={4}>
                            <TextField fullWidth size="small" value={system.quotationValidity}
                              onChange={e => { const v = e.target.value; if (v === '' || (!isNaN(Number(v)) && Number(v) >= 0)) setSystem({ ...system, quotationValidity: v as any }); }}
                              onBlur={e => setSystem({ ...system, quotationValidity: parseInt(e.target.value) || 30 })}
                              inputProps={{ inputMode: 'numeric' }} sx={inputSx} disabled={!hasFullAccess} />
                          </Field>
                        </Box>
                      </SectionCard>
                    </Box>

                    <Box sx={{ height: 1, bgcolor: 'rgba(0,200,255,0.08)', my: 2 }} />

                    {/* ── Section: Module Default Text Configuration ── */}
                    {/* <Box sx={{ mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted, #9ab0d0)', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5, px: 0.5 }}>
                        Module Default Text Configuration
                      </Typography>
                      
                      <SectionCard title="Quotation Defaults" subtitle="Project schedule & Commercial Notes, Terms and Conditions">
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
                          <Field label="Schedule & Commercial Notes">
                            <TextField fullWidth multiline rows={4} size="small" value={system.quotationNotes || ''} onChange={e => setSystem({ ...system, quotationNotes: e.target.value })} sx={inputSx} disabled={!hasFullAccess} />
                          </Field>
                          <Field label="Terms and Conditions">
                            <TextField fullWidth multiline rows={4} size="small" value={system.quotationTerms || ''} onChange={e => setSystem({ ...system, quotationTerms: e.target.value })} sx={inputSx} disabled={!hasFullAccess} />
                          </Field>
                        </Box>
                      </SectionCard>

                      <Box sx={{ height: 1, bgcolor: 'rgba(0,200,255,0.06)', my: 2 }} />
                      
                      <SectionCard title="Work Order Defaults" subtitle="Quality Requirements">
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
                          <Field label="Quality Requirements (one per line)">
                            <TextField fullWidth multiline rows={4} size="small" value={system.workOrderQualityReqs || ''} onChange={e => setSystem({ ...system, workOrderQualityReqs: e.target.value })} sx={inputSx} disabled={!hasFullAccess} />
                          </Field>
                        </Box>
                      </SectionCard>

                      <Box sx={{ height: 1, bgcolor: 'rgba(0,200,255,0.06)', my: 2 }} />

                      <SectionCard title="Logistics Defaults" subtitle="Instructions and Requirements">
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
                          <Field label="Instructions & Requirements (one per line)">
                            <TextField fullWidth multiline rows={4} size="small" value={system.logisticsInstructions || ''} onChange={e => setSystem({ ...system, logisticsInstructions: e.target.value })} sx={inputSx} disabled={!hasFullAccess} />
                          </Field>
                        </Box>
                      </SectionCard>

                      <Box sx={{ height: 1, bgcolor: 'rgba(0,200,255,0.06)', my: 2 }} />

                      <SectionCard title="Invoice Defaults" subtitle="Payment Terms, Notes, Terms & Conditions">
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
                          <Field label="Payment Terms">
                            <TextField fullWidth multiline rows={2} size="small" value={system.invoicePaymentTerms || ''} onChange={e => setSystem({ ...system, invoicePaymentTerms: e.target.value })} sx={inputSx} disabled={!hasFullAccess} />
                          </Field>
                          <Field label="Notes">
                            <TextField fullWidth multiline rows={3} size="small" value={system.invoiceNotes || ''} onChange={e => setSystem({ ...system, invoiceNotes: e.target.value })} sx={inputSx} disabled={!hasFullAccess} />
                          </Field>
                          <Field label="Terms & Conditions">
                            <TextField fullWidth multiline rows={4} size="small" value={system.invoiceTerms || ''} onChange={e => setSystem({ ...system, invoiceTerms: e.target.value })} sx={inputSx} disabled={!hasFullAccess} />
                          </Field>
                        </Box>
                      </SectionCard>

                      <Box sx={{ height: 1, bgcolor: 'rgba(0,200,255,0.06)', my: 2 }} />

                      <SectionCard title="Quality Defaults" subtitle="Notes/Comments">
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2 }}>
                          <Field label="Inspection Notes & Comments">
                            <TextField fullWidth multiline rows={4} size="small" value={system.qualityNotes || ''} onChange={e => setSystem({ ...system, qualityNotes: e.target.value })} sx={inputSx} disabled={!hasFullAccess} />
                          </Field>
                        </Box>
                      </SectionCard>
                      <Box sx={{ height: 1, bgcolor: 'rgba(0,200,255,0.06)', my: 2 }} />

                      <SectionCard title="Dropdown Names & Initials" subtitle="Enter up to 5 names/initials per field (one per line)">
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 2 }}>
                          <Field label="Work Order: Prepared By" span={6}>
                            <TextField fullWidth multiline rows={4} size="small" value={system.woPreparedByNames || ''} onChange={e => setSystem({ ...system, woPreparedByNames: e.target.value })} sx={inputSx} disabled={!hasFullAccess} placeholder={'John Doe\nJane Smith'} helperText="Max 5 names" />
                          </Field>
                          <Field label="Work Order: Approved By" span={6}>
                            <TextField fullWidth multiline rows={4} size="small" value={system.woApprovedByNames || ''} onChange={e => setSystem({ ...system, woApprovedByNames: e.target.value })} sx={inputSx} disabled={!hasFullAccess} placeholder={'John Doe\nJane Smith'} helperText="Max 5 names" />
                          </Field>
                          <Field label="Production: Inspector Initials" span={6}>
                            <TextField fullWidth multiline rows={4} size="small" value={system.productionInspectorInitials || ''} onChange={e => setSystem({ ...system, productionInspectorInitials: e.target.value })} sx={inputSx} disabled={!hasFullAccess} placeholder={'MJ\nJW'} helperText="Max 5 initials" />
                          </Field>
                          <Field label="Production: Operator Initials" span={6}>
                            <TextField fullWidth multiline rows={4} size="small" value={system.productionOperatorInitials || ''} onChange={e => setSystem({ ...system, productionOperatorInitials: e.target.value })} sx={inputSx} disabled={!hasFullAccess} placeholder={'JD\nTS'} helperText="Max 5 initials" />
                          </Field>
                        </Box>
                      </SectionCard>
                    </Box> */}

                    <Box sx={{ height: 1, bgcolor: 'rgba(0,200,255,0.08)', my: 2 }} />

                    {/* ── Section: Core ── */}
                    <Box sx={{ mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted, #9ab0d0)', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5, px: 0.5 }}>
                        Core
                      </Typography>
                      <SectionCard title="" subtitle="Toggle application-wide features">
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                          {(
                            [
                              { label: 'Email Notifications', key: 'emailNotifications' as const, desc: 'Receive email alerts for important events' },
                              { label: 'Automatic Backups', key: 'autoBackup' as const, desc: 'Enable scheduled data backups' },
                            ]
                          ).map(opt => (
                            <Box key={opt.key} sx={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              py: 1, px: 0.5, borderRadius: 1.5,
                              '&:hover': { bgcolor: 'rgba(0,200,255,0.04)' },
                            }}>
                              <Box>
                                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary, #f8fbff)' }}>{opt.label}</Typography>
                                <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-muted, #9ab0d0)' }}>{opt.desc}</Typography>
                              </Box>
                              <Switch
                                checked={(system as any)[opt.key]}
                                onChange={e => setSystem({ ...system, [opt.key]: e.target.checked })}
                                disabled={!hasFullAccess}
                                sx={{
                                  width: 44, height: 24, p: 0,
                                  '& .MuiSwitch-switchBase': {
                                    p: '3px',
                                    '&.Mui-checked': {
                                      color: '#fff',
                                      transform: 'translateX(20px)',
                                      '& + .MuiSwitch-track': { bgcolor: '#34D399', opacity: 1, border: 'none' },
                                    },
                                  },
                                  '& .MuiSwitch-thumb': { width: 18, height: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
                                  '& .MuiSwitch-track': { borderRadius: 12, bgcolor: '#1e3a5f', opacity: 1, transition: 'background-color 0.2s' },
                                }}
                              />
                            </Box>
                          ))}
                        </Box>
                      </SectionCard>
                    </Box>
                  </>
                )}
              </Box>
            )}

            {/* ══════════════ DEFAULT TEXTS ══════════════════ */}
            {activeSection === 'defaultTexts' && (
              <Box className="animate-fadeIn">
                <Suspense fallback={<CircularProgress />}>
                  <DefaultTextConfigPanel />
                </Suspense>
              </Box>
            )}

            {/* ══════════════ SECURITY ══════════════════════ */}
            {activeSection === 'security' && (
              <Box className="animate-fadeIn" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5, alignItems: 'flex-start' }}>
                {/* ── Left: Account ── */}
                <Box sx={{ bgcolor: 'var(--bg-surface-2, #0f1622)', borderRadius: 3, border: '1px solid', borderColor: 'rgba(0,200,255,0.08)', p: 3, boxShadow: '0 1px 6px rgba(0,0,0,0.4)' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
                    <ShieldIcon sx={{ fontSize: 20, color: '#00c8ff' }} />
                    <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #f8fbff)' }}>Account</Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    <Box>
                      <Typography sx={labelSx}>Login Email</Typography>
                      <TextField
                        fullWidth size="small"
                        value={user?.email || ''}
                        InputProps={{
                          readOnly: true,
                          startAdornment: (
                            <InputAdornment position="start">
                              <EmailIcon sx={{ fontSize: 18, color: 'var(--text-muted, #9ab0d0)' }} />
                            </InputAdornment>
                          ),
                        }}
                        sx={{
                          ...inputSx,
                          '& .MuiOutlinedInput-root': {
                            ...inputSx['& .MuiOutlinedInput-root'],
                            bgcolor: 'rgba(0,200,255,0.04)',
                          },
                        }}
                      />
                    </Box>

                    <Box>
                      <Typography sx={labelSx}>Account Name</Typography>
                      <TextField
                        fullWidth size="small"
                        value={user?.name || ''}
                        InputProps={{ readOnly: true }}
                        sx={{
                          ...inputSx,
                          '& .MuiOutlinedInput-root': {
                            ...inputSx['& .MuiOutlinedInput-root'],
                            bgcolor: 'rgba(0,200,255,0.04)',
                          },
                        }}
                      />
                    </Box>
                  </Box>
                </Box>

                {/* ── Right: Change Password ── */}
                <Box sx={{ bgcolor: 'var(--bg-surface-2, #0f1622)', borderRadius: 3, border: '1px solid', borderColor: 'rgba(0,200,255,0.08)', p: 3, boxShadow: '0 1px 6px rgba(0,0,0,0.4)' }}>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #f8fbff)', mb: 2.5 }}>Change Password</Typography>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                    {/* Current Password */}
                    <Box>
                      <Typography sx={labelSx}>Current Password</Typography>
                      <TextField
                        fullWidth size="small"
                        type={showCurrentPw ? 'text' : 'password'}
                        placeholder="Enter your current password"
                        autoComplete="current-password"
                        value={passwords.currentPassword}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswords(prev => ({ ...prev, currentPassword: e.target.value }))}
                        sx={inputSx}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton size="small" onClick={() => setShowCurrentPw(v => !v)} edge="end" tabIndex={-1}>
                                {showCurrentPw ? <VisibilityOffIcon sx={{ fontSize: 18, color: '#94a3b8' }} /> : <VisibilityIcon sx={{ fontSize: 18, color: '#94a3b8' }} />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    </Box>

                    {/* New Password */}
                    <Box>
                      <Typography sx={labelSx}>New Password</Typography>
                      <TextField
                        fullWidth size="small"
                        type={showNewPw ? 'text' : 'password'}
                        placeholder="Min. 8 characters"
                        autoComplete="new-password"
                        value={passwords.newPassword}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswords(prev => ({ ...prev, newPassword: e.target.value }))}
                        sx={inputSx}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton size="small" onClick={() => setShowNewPw(v => !v)} edge="end" tabIndex={-1}>
                                {showNewPw ? <VisibilityOffIcon sx={{ fontSize: 18, color: '#94a3b8' }} /> : <VisibilityIcon sx={{ fontSize: 18, color: '#94a3b8' }} />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    </Box>

                    {/* Confirm Password */}
                    <Box>
                      <Typography sx={labelSx}>Confirm New Password</Typography>
                      <TextField
                        fullWidth size="small"
                        type={showConfirmPw ? 'text' : 'password'}
                        placeholder="Re-enter new password"
                        autoComplete="new-password"
                        value={passwords.confirmPassword}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPasswords(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        sx={inputSx}
                        error={!!passwords.confirmPassword && passwords.confirmPassword !== passwords.newPassword}
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton size="small" onClick={() => setShowConfirmPw(v => !v)} edge="end" tabIndex={-1}>
                                {showConfirmPw ? <VisibilityOffIcon sx={{ fontSize: 18, color: '#94a3b8' }} /> : <VisibilityIcon sx={{ fontSize: 18, color: '#94a3b8' }} />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                      <Typography sx={{ fontSize: '0.72rem', color: 'var(--text-muted, #9ab0d0)', mt: 0.75 }}>
                        Must include one uppercase letter and one number.
                      </Typography>
                    </Box>

                    {/* Action */}
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        variant="contained"
                        startIcon={<LockIcon sx={{ fontSize: 16 }} />}
                        onClick={handleChangePassword}
                        disabled={
                          !passwords.currentPassword ||
                          !passwords.newPassword ||
                          !passwords.confirmPassword ||
                          passwords.newPassword !== passwords.confirmPassword
                        }
                        sx={{
                          ...saveBtnSx,
                          borderRadius: 2.5,
                          px: 3,
                          py: 1,
                          fontSize: '0.85rem',
                          '&.Mui-disabled': { bgcolor: 'rgba(0,200,255,0.04)', color: 'var(--text-muted, #9ab0d0)' },
                        }}
                      >
                        Update Password
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Box>
            )}
          </>
        </Box>
      </Box>

      {/* Alerts */}
      <Snackbar open={!!success} autoHideDuration={3000} onClose={() => setSuccess(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={() => setSuccess(null)} severity="success" variant="filled" sx={{ borderRadius: 2 }}>{success}</Alert>
      </Snackbar>
      <Snackbar open={!!error} autoHideDuration={4000} onClose={() => setError(null)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={() => setError(null)} severity="error" variant="filled" sx={{ borderRadius: 2 }}>{error}</Alert>
      </Snackbar>
    </Box>
  );
};

export default SettingsPage;
