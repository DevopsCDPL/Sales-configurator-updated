import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Grid, IconButton, Chip, alpha, Tabs, Tab,
  LinearProgress, CircularProgress, Alert, Breadcrumbs, Link, Table, TableHead,
  TableRow, TableCell, TableBody, TableContainer,
} from '@mui/material';
import Rating from '@mui/material/Rating';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Star as StarIcon,
  Build as BuildIcon,
  LocalShipping as ShipIcon,
  History as HistoryIcon,
  VerifiedUser as VerifiedIcon,
  Home as HomeIcon,
  NavigateNext as NavNextIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';
import { vendorService } from '../services/vendorService';
import { vendorProcurementService } from '../services/vendorProcurementService';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';

/* --- Design Tokens (same as VendorsPage) --- */
const C = {
  primary: '#1F6F5C',
  primaryBg: '#E9F5F1',
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
const RISK_COLORS: Record<string, { bg: string; fg: string }> = {
  low:    { bg: 'var(--border)', fg: C.primary },
  medium: { bg: '#fef9c3', fg: '#ca8a04' },
  high:   { bg: '#fee2e2', fg: '#dc2626' },
};

const PAL = [C.primary, '#0891b2', '#ea580c', '#166354', '#dc2626', '#1F7A63', '#d97706', '#059669'];
const hashColor = (s: string) => PAL[Math.abs([...(s || 'N')].reduce((a, c) => a + c.charCodeAt(0), 0)) % PAL.length];
const initials = (s: string) => (s || 'N').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
const n = (v: any) => Number(v) || 0;

function enrich(v: any): any {
  const cats = v.service_categories && v.service_categories.length > 0
    ? v.service_categories : [];
  const risk = v.risk || 'low';
  const perf_score = n(v.perf_score);
  const on_time_pct = n(v.on_time_delivery) || n(v.on_time_pct);
  const rating = n(v.rating);
  const riskVal = risk === 'low' ? 100 : risk === 'medium' ? 50 : 10;
  const health_score = n(v.health_score) || (rating || perf_score || on_time_pct ? Math.round(
    (rating / 5) * 40 + (perf_score / 100) * 35 + (riskVal / 100) * 15 + (on_time_pct / 100) * 10
  ) : 0);
  return {
    ...v,
    company_name: v.vendor_name || v.company_name || '',
    contact_person: v.contact_person || v.contact_name || v.poc_name || '',
    email: v.contact_email || v.email || v.poc_email || '',
    phone: v.contact_phone || v.phone || v.poc_phone || '',
    address: v.address || v.location || '',
    location: v.location || v.address || '',
    status: v.status || (v.is_active === false ? 'Inactive' : 'Active'),
    tier: v.tier || '',
    risk, rating,
    total_orders: n(v.total_orders) || n(v.orders_done),
    orders_done: n(v.orders_done) || n(v.total_orders),
    on_time_delivery: on_time_pct, on_time_pct, perf_score,
    service_categories: cats,
    last_order_date: v.last_order_date || '',
    verified: v.verified ?? false,
    avg_response_hrs: n(v.avg_response_hrs),
    health_score,
    manager: v.manager || '',
    last_activity: v.last_activity || v.updated_at || v.created_at || '',
  };
}

/* --- Sub-components (same as VendorsPage) --- */
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

const RiskBadge: React.FC<{ risk: string }> = ({ risk }) => {
  const r = RISK_COLORS[risk] || RISK_COLORS.low;
  return <Chip size="small" label={risk.charAt(0).toUpperCase() + risk.slice(1) + ' Risk'}
    sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, bgcolor: r.bg, color: r.fg, borderRadius: 1.5 }} />;
};

/* ================================================================== */
const VendorDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === 'main_admin' || user?.role === 'admin';

  const [vendor, setVendor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [vendorPOs, setVendorPOs] = useState<any[]>([]);
  const [posLoading, setPosLoading] = useState(false);

  const loadVendor = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await vendorService.getById(id);
      setVendor(enrich(data));
    } catch {
      setError('Vendor not found');
    } finally {
      setLoading(false);
    }
  };

  const loadVendorPOs = useCallback(async () => {
    if (!id) return;
    try {
      setPosLoading(true);
      const pos = await vendorProcurementService.getVendorPurchaseOrders({ vendor_id: id });
      setVendorPOs(pos || []);
    } catch {
      setVendorPOs([]);
    } finally {
      setPosLoading(false);
    }
  }, [id]);

  useEffect(() => { loadVendor(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (detailTab === 1 || detailTab === 3) loadVendorPOs(); }, [detailTab, loadVendorPOs]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress sx={{ color: C.primary }} />
      </Box>
    );
  }

  if (error || !vendor) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error || 'Vendor not found'}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/vendors')}
          sx={{ textTransform: 'none', fontWeight: 600, color: C.textSec }}>
          Back to Vendors
        </Button>
      </Box>
    );
  }

  const c = hashColor(vendor.company_name);
  const isActive = vendor.status?.toLowerCase() === 'active';

  return (
    <Box sx={{ pb: 4 }} className="animate-fadeIn">
      {/* Header Banner */}
      <Box sx={{ borderRadius: 3, overflow: 'hidden', border: `1px solid ${alpha('#000', 0.06)}`, bgcolor: C.white, mb: 3 }}>
        <Box sx={{ p: 3, pb: 1, background: `linear-gradient(135deg, ${c}, ${alpha(c, 0.65)})`, color: '#fff' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <IconButton onClick={() => navigate('/vendors')} sx={{ color: '#fff', opacity: 0.8, mr: 0.5 }}>
                <ArrowBackIcon sx={{ fontSize: 20 }} />
              </IconButton>
              <Box sx={{
                width: 52, height: 52, borderRadius: 3, bgcolor: alpha('#fff', 0.18),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{initials(vendor.company_name)}</Typography>
              </Box>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 700 }}>{vendor.company_name}</Typography>
                  {vendor.verified && <VerifiedIcon sx={{ fontSize: 18, color: '#a5f3fc' }} />}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                  <Typography sx={{ fontSize: '0.82rem', opacity: 0.85 }}>{vendor.contact_person}</Typography>
                  <TierBadge tier={vendor.tier} />
                  <Chip size="small" label={isActive ? 'Active' : vendor.status}
                    sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: alpha('#fff', 0.2), color: '#fff' }} />
                </Box>
              </Box>
            </Box>
            {canWrite && (
              <Button size="small" startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                onClick={() => navigate(`/vendors/${id}/edit`)}
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
            <Tab label="Capabilities" />
            <Tab label="Performance" />
            <Tab label="Activity" />
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
                    { label: 'Contact Person', value: vendor.contact_person },
                    { label: 'Email', value: vendor.email, link: `mailto:${vendor.email}` },
                    { label: 'Phone', value: vendor.phone, link: `tel:${vendor.phone}` },
                    { label: 'Location', value: vendor.address },
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
                    Risk & Compliance
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                    <TierBadge tier={vendor.tier} />
                    <RiskBadge risk={vendor.risk} />
                    {vendor.verified && <Chip size="small" icon={<VerifiedIcon sx={{ fontSize: '14px !important' }} />} label="Verified"
                      sx={{ height: 20, fontSize: '0.62rem', fontWeight: 700, bgcolor: alpha(C.primary, 0.08), color: C.primary }} />}
                  </Box>
                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: alpha('#000', 0.015) }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
                      <Rating value={n(vendor.rating)} precision={0.5} readOnly size="small" sx={{ '& .MuiRating-iconFilled': { color: '#f59e0b' } }} />
                      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{n(vendor.rating).toFixed(1)}</Typography>
                    </Box>
                    <MiniBar label="On-time Delivery" value={vendor.on_time_pct} color={C.primary} />
                    <MiniBar label="Performance Score" value={vendor.perf_score} color={C.primary} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.5 }}>
                      <Box>
                        <Typography sx={{ fontSize: '0.65rem', color: C.textMuted }}>Orders</Typography>
                        <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: C.dark }}>{vendor.orders_done}</Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: '0.65rem', color: C.textMuted }}>Avg Response</Typography>
                        <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: C.dark }}>{vendor.avg_response_hrs}h</Typography>
                      </Box>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* ORDERS TAB */}
          {detailTab === 1 && (
            <Box className="animate-fadeIn">
              <Typography sx={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, color: C.textMuted, letterSpacing: '.06em', mb: 2 }}>
                Purchase Orders
              </Typography>
              {posLoading ? (
                <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={28} sx={{ color: C.primary }} /></Box>
              ) : vendorPOs.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <ShipIcon sx={{ fontSize: 40, color: C.border, mb: 1 }} />
                  <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: C.textSec }}>No purchase orders yet</Typography>
                </Box>
              ) : (
                <TableContainer sx={{ borderRadius: 2, border: `1px solid ${C.border}` }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: alpha('#000', 0.02) }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: C.textSec }}>PO Number</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: C.textSec }}>Project</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: C.textSec }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: C.textSec }}>Items</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: C.textSec }}>Total</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: C.textSec }}>Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {vendorPOs.map((po: any) => (
                        <TableRow key={po.id} sx={{ '&:hover': { bgcolor: alpha(C.primary, 0.03) } }}>
                          <TableCell sx={{ fontSize: '0.82rem', fontWeight: 600, color: C.primary }}>{po.po_number}</TableCell>
                          <TableCell sx={{ fontSize: '0.82rem', color: C.dark }}>{po.project?.project_name || '—'}</TableCell>
                          <TableCell sx={{ fontSize: '0.82rem', color: C.textSec }}>{po.po_date ? dayjs(po.po_date).format('MMM D, YYYY') : '—'}</TableCell>
                          <TableCell sx={{ fontSize: '0.82rem', color: C.textSec }}>{po.items?.length || 0}</TableCell>
                          <TableCell sx={{ fontSize: '0.82rem', fontWeight: 600, color: C.dark }}>${n(po.grand_total).toLocaleString()}</TableCell>
                          <TableCell>
                            <Chip size="small" label={(po.status || 'draft').charAt(0).toUpperCase() + (po.status || 'draft').slice(1)}
                              sx={{
                                height: 22, fontSize: '0.7rem', fontWeight: 600,
                                bgcolor: po.status === 'delivered' ? alpha(C.primary, 0.08) : po.status === 'sent' ? alpha('#3B82F6', 0.08) : po.status === 'cancelled' ? alpha('#EF4444', 0.08) : alpha('#000', 0.04),
                                color: po.status === 'delivered' ? C.primary : po.status === 'sent' ? '#3B82F6' : po.status === 'cancelled' ? '#EF4444' : C.textSec,
                              }} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}

          {/* CAPABILITIES TAB */}
          {detailTab === 2 && (
            <Box className="animate-fadeIn">
              <Typography sx={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, color: C.textMuted, letterSpacing: '.06em', mb: 2 }}>
                Service Capabilities
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {(vendor.service_categories || []).map((cap: string) => (
                  <Chip key={cap} label={cap}
                    sx={{
                      height: 28, fontSize: '0.78rem', fontWeight: 500,
                      bgcolor: 'var(--border-subtle)', color: C.textSec, borderRadius: '14px',
                    }} />
                ))}
                {(!vendor.service_categories || vendor.service_categories.length === 0) && (
                  <Box sx={{ textAlign: 'center', py: 4, width: '100%' }}>
                    <BuildIcon sx={{ fontSize: 36, color: C.border, mb: 1 }} />
                    <Typography sx={{ color: C.textMuted, fontSize: '0.85rem' }}>No capabilities recorded yet.</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* PERFORMANCE TAB */}
          {detailTab === 3 && (
            <Box className="animate-fadeIn">
              {/* Consolidated Rating Summary */}
              <Typography sx={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, color: C.textMuted, letterSpacing: '.06em', mb: 2 }}>
                Consolidated Rating
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, p: 2, borderRadius: 2.5, bgcolor: alpha('#f59e0b', 0.04) }}>
                <Rating value={n(vendor.rating)} precision={0.5} readOnly size="medium" sx={{ '& .MuiRating-iconFilled': { color: '#f59e0b' } }} />
                <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', color: C.dark }}>{n(vendor.rating).toFixed(1)}</Typography>
                <Typography sx={{ fontSize: '0.78rem', color: C.textMuted }}>/5</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: C.textSec, ml: 1 }}>
                  (from {vendorPOs.filter((po: any) => po.ratings).length} rated order{vendorPOs.filter((po: any) => po.ratings).length !== 1 ? 's' : ''})
                </Typography>
              </Box>

              {/* Per-Order Ratings */}
              <Typography sx={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, color: C.textMuted, letterSpacing: '.06em', mb: 2 }}>
                Rate Each Order
              </Typography>
              {posLoading ? (
                <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={28} sx={{ color: C.primary }} /></Box>
              ) : vendorPOs.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <StarIcon sx={{ fontSize: 40, color: C.border, mb: 1 }} />
                  <Typography sx={{ fontSize: '0.85rem', color: C.textMuted }}>No orders to rate yet.</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {vendorPOs.map((po: any) => {
                    const r = po.ratings || { price: 0, delivery: 0, quality: 0 };
                    return (
                      <Box key={po.id} sx={{ p: 2, borderRadius: 2.5, border: `1px solid ${C.border}`, bgcolor: C.white }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                          <Box>
                            <Typography sx={{ fontSize: '0.88rem', fontWeight: 700, color: C.dark }}>{po.po_number}</Typography>
                            <Typography sx={{ fontSize: '0.75rem', color: C.textMuted }}>
                              {po.project?.project_name || '—'} • {po.po_date ? dayjs(po.po_date).format('MMM D, YYYY') : ''}
                            </Typography>
                          </Box>
                          <Chip size="small" label={(po.status || 'draft').charAt(0).toUpperCase() + (po.status || 'draft').slice(1)}
                            sx={{
                              height: 22, fontSize: '0.7rem', fontWeight: 600,
                              bgcolor: po.status === 'delivered' ? alpha(C.primary, 0.08) : po.status === 'sent' ? alpha('#3B82F6', 0.08) : alpha('#000', 0.04),
                              color: po.status === 'delivered' ? C.primary : po.status === 'sent' ? '#3B82F6' : C.textSec,
                            }} />
                        </Box>
                        <Grid container spacing={2}>
                          {[
                            { key: 'price', label: 'Price' },
                            { key: 'delivery', label: 'Delivery' },
                            { key: 'quality', label: 'Quality' },
                          ].map(({ key, label }) => (
                            <Grid item xs={4} key={key}>
                              <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: C.textSec, mb: 0.25 }}>{label}</Typography>
                              <Rating
                                value={n(r[key])}
                                precision={1}
                                size="small"
                                sx={{ '& .MuiRating-iconFilled': { color: '#f59e0b' } }}
                                onChange={async (_e, newVal) => {
                                  const updated = { ...r, [key]: newVal || 0 };
                                  try {
                                    const updatedPO = await vendorProcurementService.rateVendorPurchaseOrder(po.id, updated);
                                    setVendorPOs(prev => prev.map(p => p.id === po.id ? { ...p, ratings: updatedPO.ratings } : p));
                                    // Refresh vendor to get updated consolidated rating
                                    const freshVendor = await vendorService.getById(id!);
                                    setVendor(enrich(freshVendor));
                                  } catch { /* ignore */ }
                                }}
                              />
                            </Grid>
                          ))}
                        </Grid>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>
          )}

          {/* ACTIVITY TAB */}
          {detailTab === 4 && (
            <Box className="animate-fadeIn">
              <Typography sx={{ fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 700, color: C.textMuted, letterSpacing: '.06em', mb: 2 }}>
                Recent Activity
              </Typography>
              {(vendor.activity || []).length > 0
                ? (vendor.activity || []).map((a: any, i: number) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1.5, py: 1, borderBottom: `1px solid ${alpha('#000', 0.03)}` }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: c, mt: 0.8, flexShrink: 0 }} />
                      <Box>
                        <Typography sx={{ fontSize: '0.82rem', color: C.dark }}>{a.text}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: C.textMuted }}>{dayjs(a.at).format('MMM D, YYYY \u00B7 h:mm A')}</Typography>
                      </Box>
                    </Box>))
                : <Box sx={{ textAlign: 'center', py: 6 }}>
                    <HistoryIcon sx={{ fontSize: 36, color: C.border, mb: 1 }} />
                    <Typography sx={{ color: C.textMuted, fontSize: '0.85rem' }}>No activity recorded yet.</Typography>
                  </Box>}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default VendorDetailPage;
