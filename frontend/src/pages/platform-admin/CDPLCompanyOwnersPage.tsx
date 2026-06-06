import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import {
  Launch as EnterIcon,
  LockReset as ResetPwIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import { setActiveCompanyContext } from '../../utils/activeCompany';
import dayjs from 'dayjs';

const PRIMARY = '#1F7A63';
const BLUE = '#0D3D2F';

interface OwnerRow {
  id: string;
  name: string;
  email: string;
  last_login?: string;
  is_active: boolean;
  company: {
    id: string;
    name: string;
    company_code?: string;
    plan?: string;
    is_active: boolean;
  } | null;
}

const CDPLCompanyOwnersPage: React.FC = () => {
  const [owners, setOwners] = useState<OwnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetDialog, setResetDialog] = useState<{ open: boolean; owner: OwnerRow | null; password: string; error: string }>({
    open: false, owner: null, password: '', error: '',
  });
  const [detailOwner, setDetailOwner] = useState<OwnerRow | null>(null);

  const loadOwners = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/platform-admin/company-owners');
      setOwners(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      console.error('Failed to load company owners:', err);
      setToast({ message: 'Failed to load company owners', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOwners();
  }, [loadOwners]);

  const filtered = search
    ? owners.filter(
        (o) =>
          o.name.toLowerCase().includes(search.toLowerCase()) ||
          o.email.toLowerCase().includes(search.toLowerCase()) ||
          (o.company?.name || '').toLowerCase().includes(search.toLowerCase())
      )
    : owners;

  const handleEnterCompany = async (owner: OwnerRow) => {
    if (!owner.company) return;
    setBusyId(owner.id);
    try {
      const response = await api.post(`/platform-admin/companies/${owner.company.id}/enter`);
      const selected = response.data?.data;
      if (!selected?.id || !selected?.name) throw new Error('Invalid response');
      setActiveCompanyContext({
        id: selected.id,
        name: selected.name,
        company_code: selected.company_code || null,
        plan: selected.plan || null,
        owner_name: owner.name,
      });
      // Open Forge working dashboard in a new tab with impersonation
      if (selected.impersonation_token) {
        const impUser = selected.owner ? JSON.stringify({
          id: selected.owner.id,
          name: selected.owner.name,
          email: selected.owner.email,
          role: 'main_admin',
          company_id: selected.id,
        }) : null;
        // Store impersonation data in temporary keys for the new tab to pick up
        localStorage.setItem('forge_impersonate_token', selected.impersonation_token);
        if (impUser) localStorage.setItem('forge_impersonate_user', impUser);
        window.open('/?impersonate=1', '_blank');
      }
    } catch (error: any) {
      setToast({ message: error.response?.data?.message || 'Failed to enter company', severity: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPassword = async (owner: OwnerRow) => {
    if (!owner.company) return;
    setResetDialog({ open: true, owner, password: '', error: '' });
  };

  const handleResetPasswordSubmit = async () => {
    const { owner, password } = resetDialog;
    if (!owner?.company) return;
    if (password.length < 6) {
      setResetDialog((prev) => ({ ...prev, error: 'Password must be at least 6 characters' }));
      return;
    }
    setBusyId(owner.id);
    try {
      await api.post(`/platform-admin/companies/${owner.company.id}/reset-password`, { password });
      setToast({ message: `Password reset for ${owner.name}`, severity: 'success' });
      setResetDialog({ open: false, owner: null, password: '', error: '' });
    } catch (error: any) {
      setToast({ message: error.response?.data?.message || 'Failed to reset password', severity: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            Company Owners
          </Typography>
          <Typography sx={{ fontSize: '0.88rem', color: '#64748b', mt: 0.5 }}>
            All primary company owners (main_admin) across the platform.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField
            size="small"
            placeholder="Search owners..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: '#94a3b8' }} />
                </InputAdornment>
              ),
            }}
            sx={{ width: 260 }}
          />
          <Button startIcon={<RefreshIcon />} onClick={loadOwners} sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
            Refresh
          </Button>
        </Stack>
      </Stack>

      {/* Table */}
      <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0' }}>
        <CardContent sx={{ p: 0 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: alpha(PRIMARY, 0.04) }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Owner Name</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Company</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Company Code</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Plan</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Last Login</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem' }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                      <Typography sx={{ color: '#64748b' }}>
                        {search ? 'No owners match your search' : 'No company owners found'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : filtered.map((owner) => (
                  <TableRow key={owner.id} hover sx={{ '&:hover': { bgcolor: alpha(PRIMARY, 0.02) } }}>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY, fontWeight: 700, fontSize: '0.85rem' }}>
                          {owner.name?.charAt(0)?.toUpperCase() || 'O'}
                        </Avatar>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{owner.name}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.82rem', color: '#475569' }}>{owner.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                        {owner.company?.name || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.82rem', color: '#475569', fontFamily: 'monospace' }}>
                        {owner.company?.company_code || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={owner.company?.plan || 'Starter'}
                        size="small"
                        sx={{ fontWeight: 700, textTransform: 'capitalize', fontSize: '0.72rem',
                          bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {owner.last_login ? dayjs(owner.last_login).format('DD MMM YYYY HH:mm') : 'Never'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={owner.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        sx={{
                          bgcolor: owner.is_active ? alpha('#16a34a', 0.12) : alpha('#dc2626', 0.1),
                          color: owner.is_active ? '#15803d' : '#dc2626',
                          fontWeight: 700,
                          fontSize: '0.72rem',
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="View Owner Details">
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => setDetailOwner(owner)}
                            >
                              <ViewIcon fontSize="small" sx={{ color: PRIMARY }} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Reset Password">
                          <span>
                            <IconButton
                              size="small"
                              disabled={busyId === owner.id}
                              onClick={() => handleResetPassword(owner)}
                              sx={{ color: '#166354' }}
                            >
                              <ResetPwIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title={owner.company?.is_active ? 'Enter Company' : 'Company suspended'}>
                          <span>
                            <Button
                              size="small"
                              variant="contained"
                              startIcon={<EnterIcon />}
                              disabled={!owner.company?.is_active || busyId === owner.id}
                              onClick={() => handleEnterCompany(owner)}
                              sx={{
                                borderRadius: 2, textTransform: 'none', fontWeight: 700,
                                fontSize: '0.75rem', px: 1.5, py: 0.5,
                                bgcolor: PRIMARY, '&:hover': { bgcolor: '#186753' },
                              }}
                            >
                              Enter
                            </Button>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Owner Details Dialog */}
      <Dialog open={!!detailOwner} onClose={() => setDetailOwner(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>
          Owner Details
          <IconButton size="small" onClick={() => setDetailOwner(null)}><CloseIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {detailOwner && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pb: 1.5, borderBottom: '1px solid #e2e8f0' }}>
                <Avatar sx={{ width: 48, height: 48, bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY, fontWeight: 700, fontSize: '1.2rem' }}>
                  {detailOwner.name?.charAt(0)?.toUpperCase() || 'O'}
                </Avatar>
                <Box>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>{detailOwner.name}</Typography>
                  <Typography sx={{ fontSize: '0.82rem', color: '#64748b' }}>{detailOwner.email}</Typography>
                </Box>
              </Box>
              {[
                { label: 'Company', value: detailOwner.company?.name || 'No data' },
                { label: 'Company Code', value: detailOwner.company?.company_code || 'No data' },
                { label: 'Role', value: 'Main Admin (Owner)' },
                { label: 'Plan', value: detailOwner.company?.plan ? detailOwner.company.plan.charAt(0).toUpperCase() + detailOwner.company.plan.slice(1) : 'No data' },
                { label: 'Last Login', value: detailOwner.last_login ? dayjs(detailOwner.last_login).format('MMM D, YYYY h:mm A') : 'Never' },
                { label: 'Status', value: detailOwner.is_active ? 'Active' : 'Inactive' },
              ].map((row) => (
                <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 500 }}>{row.label}</Typography>
                  {row.label === 'Status' ? (
                    <Chip size="small" label={row.value}
                      sx={{ fontWeight: 700, fontSize: '0.72rem',
                        bgcolor: detailOwner.is_active ? alpha('#16a34a', 0.12) : alpha('#dc2626', 0.1),
                        color: detailOwner.is_active ? '#15803d' : '#dc2626' }} />
                  ) : row.label === 'Plan' ? (
                    <Chip size="small" label={row.value}
                      sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'capitalize',
                        bgcolor: alpha(PRIMARY, 0.1), color: PRIMARY }} />
                  ) : (
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{row.value}</Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDetailOwner(null)} sx={{ textTransform: 'none' }}>Close</Button>
          {detailOwner?.company?.is_active && (
            <Button
              variant="contained"
              startIcon={<EnterIcon />}
              onClick={() => { if (detailOwner) handleEnterCompany(detailOwner); setDetailOwner(null); }}
              sx={{ textTransform: 'none', fontWeight: 700, bgcolor: PRIMARY, '&:hover': { bgcolor: '#186753' } }}
            >
              Enter Workspace
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialog.open} onClose={() => setResetDialog({ open: false, owner: null, password: '', error: '' })} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>
          Reset Password
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 2 }}>
            Enter a new password for <strong>{resetDialog.owner?.name}</strong>
          </Typography>
          <TextField
            autoFocus
            fullWidth
            size="small"
            type="password"
            label="New Password"
            placeholder="Min 6 characters"
            value={resetDialog.password}
            onChange={(e) => setResetDialog((prev) => ({ ...prev, password: e.target.value, error: '' }))}
            error={!!resetDialog.error}
            helperText={resetDialog.error}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setResetDialog({ open: false, owner: null, password: '', error: '' })} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleResetPasswordSubmit}
            disabled={busyId === resetDialog.owner?.id}
            sx={{ textTransform: 'none', fontWeight: 700, bgcolor: '#166354', '&:hover': { bgcolor: '#0D3D2F' } }}
          >
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : <span />}
      </Snackbar>
    </Box>
  );
};

export default CDPLCompanyOwnersPage;
