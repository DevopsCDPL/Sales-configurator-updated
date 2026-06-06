import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Grid, IconButton, Chip, alpha, Tabs, Tab,
  LinearProgress, CircularProgress, Alert, Breadcrumbs, Link,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Business as BusinessIcon,
  ShoppingCart as OrderIcon,
  History as HistoryIcon,
  NoteAdd as NoteIcon,
  Home as HomeIcon,
  NavigateNext as NavNextIcon,
} from '@mui/icons-material';
import { clientService } from '../services/clientService';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';

/* --- Design Tokens (same as ClientsPage) --- */
const C = {
  primary: '#1F7A63',
  dark: '#1F2937',
  textSec: '#6B7280',
  textMuted: 'var(--text-muted)',
  border: 'var(--border)',
  bg: 'var(--bg-canvas)',
  white: '#FFFFFF',
};

const TIER_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  gold:   { bg: '#fef3c7', fg: '#92400e', label: 'Gold' },
  silver: { bg: '#f1f5f9', fg: 'var(--text-secondary)', label: 'Silver' },
  bronze: { bg: '#fed7aa', fg: '#9a3412', label: 'Bronze' },
};

const PAL = ['#1F7A63','#1F7A63','#1F7A63','#ea580c','#dc2626','#1F7A63','#d97706','#1F7A63'];
const hashColor = (s: string) => PAL[Math.abs([...(s || 'N')].reduce((a, c) => a + c.charCodeAt(0), 0)) % PAL.length];
const initials = (s: string) => (s || 'N').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
const n = (v: any) => Number(v) || 0;
const currency = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v}`;

function enrich(c: any): any {
  return {
    ...c,
    company_name: c.client_name || c.company_name || '',
    contact_person: c.poc_name || c.contact_person || '',
    email: c.poc_email || c.email || '',
    phone: c.poc_phone || c.phone || '',
    address: c.address || '',
    tax_id: c.tax_id || '',
    payment_terms: c.payment_terms || 'Net 30',
    notes: c.notes || '',
    status: c.status || ((c.is_active === false) ? 'Inactive' : 'Active'),
    tier: c.tier || '',
    total_orders: n(c.total_orders),
    total_revenue: n(c.total_revenue),
    last_order_date: c.last_order_date || null,
    payment_status: c.payment_status || '',
    credit_limit: n(c.credit_limit),
    last_interaction: c.last_interaction || c.updated_at || c.created_at,
    manager: c.manager || '',
    perf_score: n(c.perf_score),
  };
}

/* --- Sub-components --- */
const MiniBar: React.FC<{ label: string; value: number; color?: string }> = ({ label, value, color = C.primary }) => (
  <Box sx={{ mb: 0.75 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
      <Typography sx={{ fontSize: '0.68rem', color: C.textSec, fontWeight: 500 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color }}>{value}%</Typography>
    </Box>
    <LinearProgress variant="determinate" value={Math.min(value, 100)}
      sx={{ height: 4, borderRadius: 2, bgcolor: alpha(color, 0.1), '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 2 } }} />
  </Box>
);

const TierBadge: React.FC<{ tier: string }> = ({ tier }) => {
  const t = TIER_COLORS[tier] || TIER_COLORS.silver;
  return <Chip size="small" label={t.label} sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, bgcolor: t.bg, color: t.fg, borderRadius: 1.5 }} />;
};

const PaymentBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, { bg: string; fg: string }> = {
    Current: { bg: alpha(C.primary, 0.08), fg: C.primary },
    Overdue: { bg: '#fee2e2', fg: '#dc2626' },
    Pending: { bg: '#fef9c3', fg: '#ca8a04' },
  };
  const s = colors[status] || colors.Pending;
  return <Chip size="small" label={status} sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, bgcolor: s.bg, color: s.fg, borderRadius: 1.5 }} />;
};

/* ================================================================== */
const ClientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === 'main_admin' || user?.role === 'admin';

  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState(0);

  const loadClient = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await clientService.getById(id);
      setClient(enrich(data));
    } catch {
      setError('Client not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClient(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress sx={{ color: C.primary }} />
      </Box>
    );
  }

  if (error || !client) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error || 'Client not found'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/clients')}
          sx={{ textTransform: 'none', fontWeight: 600, color: C.textSec }}>
          Back to Clients
        </Button>
      </Box>
    );
  }

  const c = hashColor(client.company_name);
  const isActive = client.status?.toLowerCase() === 'active';

  return (
    <Box sx={{ pb: 4 }} className="animate-fadeIn">
      {/* Header Banner */}
      <Box sx={{ borderRadius: 3, overflow: 'hidden', border: `1px solid ${alpha('#000', 0.06)}`, bgcolor: C.white, mb: 3 }}>
        <Box sx={{ p: 3, pb: 1, background: `linear-gradient(135deg, ${c}, ${alpha(c, 0.65)})`, color: '#fff' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <IconButton onClick={() => navigate('/clients')} sx={{ color: '#fff', opacity: 0.8, mr: 0.5 }}>
                <ArrowBackIcon sx={{ fontSize: 20 }} />
              </IconButton>
              <Box sx={{
                width: 52, height: 52, borderRadius: 3, bgcolor: alpha('#fff', 0.18),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{initials(client.company_name)}</Typography>
              </Box>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 700 }}>{client.company_name}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                  <Typography sx={{ fontSize: '0.82rem', opacity: 0.85 }}>{client.contact_person}</Typography>
                  <TierBadge tier={client.tier} />
                  <Chip size="small" label={isActive ? 'Active' : client.status}
                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha('#fff', 0.2), color: '#fff' }} />
                </Box>
              </Box>
            </Box>
            {canWrite && (
              <Button size="small" startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                onClick={() => navigate(`/clients/${id}/edit`)}
                sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600, fontSize: '0.82rem', color: '#fff', opacity: 0.85,
                  '&:hover': { opacity: 1, bgcolor: alpha('#fff', 0.1) } }}>
                Edit
              </Button>
            )}
          </Box>
          <Tabs value={detailTab} onChange={(_, v) => setDetailTab(v)}
            sx={{
              '& .MuiTab-root': {
                color: alpha('#fff', 0.65), fontSize: '0.78rem', fontWeight: 600,
                textTransform: 'none', minWidth: 0, px: 2,
                '&.Mui-selected': { color: '#fff' },
              },
              '& .MuiTabs-indicator': { bgcolor: '#00c8ff', height: 2.5, borderRadius: 2 },
            }}>
            <Tab label="Overview" />
            <Tab label="Orders" />
            <Tab label="Payments" />
            <Tab label="Activity" />
            <Tab label="Notes" />
          </Tabs>
        </Box>

        {/* Tab Content */}
        <Box sx={{ p: 3, minHeight: 320 }}>
          {/* OVERVIEW */}
          {detailTab === 0 && (
            <Box className="animate-fadeIn">
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Typography sx={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, color: C.textMuted, letterSpacing: '.06em', mb: 1.5 }}>
                    Contact Information
                  </Typography>
                  {[
                    { label: 'Contact Person', value: client.contact_person },
                    { label: 'Email', value: client.email, link: `mailto:${client.email}` },
                    { label: 'Phone', value: client.phone, link: `tel:${client.phone}` },
                    { label: 'Location', value: client.address },
                    { label: 'Tax ID', value: client.tax_id },
                    { label: 'Payment Terms', value: client.payment_terms },
                  ].map(f => (
                    <Box key={f.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: `1px solid ${alpha('#000', 0.03)}` }}>
                      <Typography sx={{ fontSize: '0.8rem', color: C.textMuted, fontWeight: 500 }}>{f.label}</Typography>
                      {f.link
                        ? <Typography component="a" href={f.link} sx={{ fontSize: '0.8rem', fontWeight: 600, color: C.primary, textDecoration: 'none' }}>{f.value || '\u2014'}</Typography>
                        : <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: C.dark }}>{f.value || '\u2014'}</Typography>}
                    </Box>
                  ))}
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography sx={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, color: C.textMuted, letterSpacing: '.06em', mb: 1.5 }}>
                    Business Metrics
                  </Typography>
                  <Grid container spacing={2}>
                    {[
                      { label: 'Total Revenue', value: currency(client.total_revenue), color: C.primary },
                      { label: 'Total Orders', value: client.total_orders, color: C.primary },
                      { label: 'Credit Limit', value: currency(client.credit_limit), color: '#2A9D7E' },
                      { label: 'Last Order', value: dayjs(client.last_order_date).format('MMM D, YYYY'), color: C.textSec },
                    ].map(m => (
                      <Grid item xs={6} key={m.label}>
                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(m.color, 0.04), textAlign: 'center' }}>
                          <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: C.dark }}>{m.value}</Typography>
                          <Typography sx={{ fontSize: '0.65rem', color: C.textMuted }}>{m.label}</Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                  <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: alpha('#000', 0.015) }}>
                    <MiniBar label="Performance Score" value={client.perf_score} color={C.primary} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                      <PaymentBadge status={client.payment_status} />
                      <Typography sx={{ fontSize: '0.7rem', color: C.textMuted }}>
                        Last activity: {dayjs(client.last_interaction).format('MMM D')}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* ORDERS TAB */}
          {detailTab === 1 && (
            <Box className="animate-fadeIn" sx={{ textAlign: 'center', py: 6 }}>
              <OrderIcon sx={{ fontSize: 40, color: C.border, mb: 1 }} />
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: C.textSec, mb: 0.5 }}>
                {client.total_orders} orders total
              </Typography>
              <Typography sx={{ fontSize: '0.82rem', color: C.textMuted }}>
                Last order placed on {dayjs(client.last_order_date).format('MMMM D, YYYY')}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#cbd5e1', mt: 2 }}>
                Detailed order history will be available when linked to the Projects module.
              </Typography>
            </Box>
          )}

          {/* PAYMENTS TAB */}
          {detailTab === 2 && (
            <Box className="animate-fadeIn">
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                  { label: 'Total Revenue', value: currency(client.total_revenue), color: C.primary },
                  { label: 'Credit Limit', value: currency(client.credit_limit), color: '#2A9D7E' },
                  { label: 'Payment Status', value: client.payment_status, color: client.payment_status === 'Overdue' ? '#dc2626' : C.primary },
                  { label: 'Payment Terms', value: client.payment_terms, color: C.textSec },
                ].map(m => (
                  <Grid item xs={6} sm={3} key={m.label}>
                    <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: alpha(m.color, 0.04), textAlign: 'center' }}>
                      <Typography sx={{ fontSize: '1.15rem', fontWeight: 800, color: C.dark }}>{m.value}</Typography>
                      <Typography sx={{ fontSize: '0.68rem', color: C.textSec, mt: 0.25 }}>{m.label}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
              <Box sx={{ textAlign: 'center', py: 3 }}>
                <Typography sx={{ fontSize: '0.82rem', color: C.textMuted }}>Detailed payment ledger coming soon.</Typography>
              </Box>
            </Box>
          )}

          {/* ACTIVITY TAB */}
          {detailTab === 3 && (
            <Box className="animate-fadeIn" sx={{ textAlign: 'center', py: 6 }}>
              <HistoryIcon sx={{ fontSize: 36, color: C.border, mb: 1 }} />
              <Typography sx={{ color: C.textMuted, fontSize: '0.85rem' }}>No activity recorded yet.</Typography>
            </Box>
          )}

          {/* NOTES TAB */}
          {detailTab === 4 && (
            <Box className="animate-fadeIn">
              {client.notes ? (
                <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha('#000', 0.015) }}>
                  <Typography sx={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{client.notes}</Typography>
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 6 }}>
                  <NoteIcon sx={{ fontSize: 36, color: C.border, mb: 1 }} />
                  <Typography sx={{ color: C.textMuted, fontSize: '0.85rem' }}>No notes for this client yet.</Typography>
                </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default ClientDetailPage;
