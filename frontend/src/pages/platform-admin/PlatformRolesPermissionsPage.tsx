import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Avatar, CircularProgress,
  Collapse, IconButton, alpha, Stack, Button, Tooltip, Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandIcon, ExpandLess as CollapseIcon,
  Business as BusinessIcon, People as PeopleIcon,
  AdminPanelSettings as AdminIcon, Shield as ShieldIcon,
  Refresh as RefreshIcon, CheckCircle as ActiveIcon,
  Cancel as InactiveIcon,
} from '@mui/icons-material';
import api from '../../services/api';
import dayjs from 'dayjs';

const PRIMARY = '#1F7A63';

const ROLE_LABELS: Record<string, string> = {
  main_admin: 'Company Owner',
  admin: 'Admin',
  sales_engineer: 'Sales Engineer',
  user: 'User',
};

const ROLE_COLORS: Record<string, string> = {
  main_admin: '#2A9D7E',
  admin: '#0D3D2F',
  sales_engineer: '#F59E0B',
  user: '#6B7280',
};

function StatCard({ title, value, icon, color }: { title: string; value: number | string; icon: React.ReactNode; color: string }) {
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: alpha('#000', 0.06), borderRadius: 3 }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</Typography>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, mt: 0.5, color, lineHeight: 1 }}>{value}</Typography>
          </Box>
          <Box sx={{ width: 40, height: 40, borderRadius: 2.5, bgcolor: alpha(color, 0.08), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {React.cloneElement(icon as React.ReactElement, { sx: { fontSize: 20, color } })}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

interface CompanyRoleData {
  company: { id: string; name: string; is_active: boolean; plan: string };
  owner: { id: string; name: string; email: string; is_active: boolean; last_login?: string } | null;
  role_counts: Record<string, number>;
  total_users: number;
  users: Array<{ id: string; name: string; email: string; role: string; is_active: boolean; last_login?: string }>;
}

interface RolesData {
  totalCompanies: number;
  totalOwners: number;
  totalUsers: number;
  companies: CompanyRoleData[];
}

// ─── Expandable Company Row ──────────────────────────────────────────
const CompanyRow: React.FC<{ data: CompanyRoleData }> = ({ data }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        hover
        onClick={() => setExpanded(!expanded)}
        sx={{ cursor: 'pointer', '&:hover': { bgcolor: alpha(PRIMARY, 0.03) } }}
      >
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <IconButton size="small">{expanded ? <CollapseIcon /> : <ExpandIcon />}</IconButton>
            <Avatar sx={{ width: 32, height: 32, bgcolor: alpha(PRIMARY, 0.12), color: PRIMARY, fontSize: '0.8rem', fontWeight: 700 }}>
              {data.company.name?.charAt(0)?.toUpperCase()}
            </Avatar>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{data.company.name}</Typography>
              <Chip label={data.company.plan?.charAt(0).toUpperCase() + data.company.plan?.slice(1)}
                size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 600, mt: 0.3 }} />
            </Box>
          </Box>
        </TableCell>
        <TableCell>
          {data.owner ? (
            <Box>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{data.owner.name}</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8' }}>{data.owner.email}</Typography>
            </Box>
          ) : <Typography sx={{ color: '#94a3b8', fontSize: '0.8rem' }}>No owner</Typography>}
        </TableCell>
        <TableCell sx={{ fontWeight: 700 }}>{data.total_users}</TableCell>
        <TableCell>
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {Object.entries(data.role_counts).map(([role, count]) => (
              <Chip key={role}
                label={`${ROLE_LABELS[role] || role}: ${count}`}
                size="small"
                sx={{ bgcolor: alpha(ROLE_COLORS[role] || '#6B7280', 0.1), color: ROLE_COLORS[role] || '#6B7280', fontWeight: 600, fontSize: '0.65rem', height: 22, mb: 0.3 }}
              />
            ))}
          </Stack>
        </TableCell>
        <TableCell>
          {data.company.is_active
            ? <Chip icon={<ActiveIcon sx={{ fontSize: 14 }} />} label="Active" size="small" sx={{ bgcolor: alpha('#1F7A63', 0.1), color: '#1F7A63', fontWeight: 600, fontSize: '0.7rem', height: 24 }} />
            : <Chip icon={<InactiveIcon sx={{ fontSize: 14 }} />} label="Inactive" size="small" sx={{ bgcolor: alpha('#dc2626', 0.1), color: '#dc2626', fontWeight: 600, fontSize: '0.7rem', height: 24 }} />
          }
        </TableCell>
      </TableRow>

      {/* Expanded Users List */}
      <TableRow>
        <TableCell colSpan={5} sx={{ py: 0, border: expanded ? undefined : 'none' }}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ py: 2, px: 3, bgcolor: alpha('#f8fafc', 0.8), borderRadius: 2, my: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', mb: 1.5, color: '#475569' }}>
                Users in {data.company.name}
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 600, fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', py: 0.5 } }}>
                    <TableCell>Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Role</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Last Login</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{user.name}</TableCell>
                      <TableCell sx={{ fontSize: '0.78rem', color: '#64748b' }}>{user.email}</TableCell>
                      <TableCell>
                        <Chip label={ROLE_LABELS[user.role] || user.role} size="small"
                          sx={{ bgcolor: alpha(ROLE_COLORS[user.role] || '#6B7280', 0.1), color: ROLE_COLORS[user.role] || '#6B7280', fontWeight: 600, fontSize: '0.65rem', height: 22 }} />
                      </TableCell>
                      <TableCell>
                        {user.is_active
                          ? <Chip label="Active" size="small" sx={{ bgcolor: alpha('#1F7A63', 0.1), color: '#1F7A63', fontSize: '0.65rem', height: 20 }} />
                          : <Chip label="Inactive" size="small" sx={{ bgcolor: alpha('#dc2626', 0.1), color: '#dc2626', fontSize: '0.65rem', height: 20 }} />
                        }
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {user.last_login ? dayjs(user.last_login).format('DD MMM YYYY, HH:mm') : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

// ─── Main Component ──────────────────────────────────────────────────
const PlatformRolesPermissionsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RolesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/platform-admin/roles-overview');
      setData(res.data?.data || null);
    } catch (err: any) {
      console.error('Failed to load roles overview:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load roles data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;
  }

  if (!data) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography color="error" gutterBottom>Failed to load roles data</Typography>
        {error && <Typography variant="body2" color="text.secondary">{error}</Typography>}
        <Button size="small" startIcon={<RefreshIcon />} onClick={loadData} sx={{ mt: 1 }}>Retry</Button>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Roles & Permissions</Typography>
          <Typography sx={{ fontSize: '0.82rem', color: '#94a3b8', mt: 0.3 }}>
            Hierarchy overview — Super Admin → Company Owner → Users
          </Typography>
        </Box>
        <Button size="small" startIcon={<RefreshIcon />} onClick={loadData}>Refresh</Button>
      </Box>

      {/* Hierarchy Overview */}
      <Card elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: alpha('#000', 0.06), borderRadius: 3, bgcolor: alpha(PRIMARY, 0.02) }}>
        <CardContent sx={{ py: 2.5 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', mb: 2, color: '#475569' }}>Permission Hierarchy</Typography>
          <Stack direction="row" spacing={3} divider={<Typography sx={{ color: '#94a3b8', fontWeight: 700, alignSelf: 'center' }}>→</Typography>}>
            <Box sx={{ textAlign: 'center', px: 2, py: 1, borderRadius: 2, bgcolor: alpha('#166354', 0.08), border: '1px solid', borderColor: alpha('#166354', 0.15) }}>
              <ShieldIcon sx={{ fontSize: 28, color: '#166354', mb: 0.5 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#166354' }}>Super Admin</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#94a3b8' }}>All Companies</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', px: 2, py: 1, borderRadius: 2, bgcolor: alpha(PRIMARY, 0.08), border: '1px solid', borderColor: alpha(PRIMARY, 0.15) }}>
              <AdminIcon sx={{ fontSize: 28, color: PRIMARY, mb: 0.5 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: PRIMARY }}>Company Owner</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#94a3b8' }}>Own Company Only</Typography>
            </Box>
            <Box sx={{ textAlign: 'center', px: 2, py: 1, borderRadius: 2, bgcolor: alpha('#0D3D2F', 0.08), border: '1px solid', borderColor: alpha('#0D3D2F', 0.15) }}>
              <PeopleIcon sx={{ fontSize: 28, color: '#0D3D2F', mb: 0.5 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#0D3D2F' }}>Users</Typography>
              <Typography sx={{ fontSize: '0.65rem', color: '#94a3b8' }}>Limited Access</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2, mb: 3 }}>
        <StatCard title="Total Companies" value={data.totalCompanies} icon={<BusinessIcon />} color={PRIMARY} />
        <StatCard title="Company Owners" value={data.totalOwners} icon={<AdminIcon />} color="#2A9D7E" />
        <StatCard title="Total Users" value={data.totalUsers} icon={<PeopleIcon />} color="#0D3D2F" />
      </Box>

      {/* Company-wise Role Table */}
      <Card elevation={0} sx={{ border: '1px solid', borderColor: alpha('#000', 0.06), borderRadius: 3 }}>
        <CardContent sx={{ p: 0 }}>
          <Box sx={{ px: 3, py: 2 }}>
            <Typography sx={{ fontWeight: 700 }}>Company-wise User Roles</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: '#94a3b8' }}>Click a company to expand and see all users</Typography>
          </Box>
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid', borderColor: alpha('#000', 0.08) } }}>
                  <TableCell>Company</TableCell>
                  <TableCell>Owner</TableCell>
                  <TableCell>Users</TableCell>
                  <TableCell>Role Breakdown</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.companies.length === 0 ? (
                  <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: '#94a3b8' }}>No companies found</TableCell></TableRow>
                ) : data.companies.map((c) => (
                  <CompanyRow key={c.company.id} data={c} />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default PlatformRolesPermissionsPage;
