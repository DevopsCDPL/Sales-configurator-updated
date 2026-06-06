import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button, IconButton,
  Tooltip, Alert, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, alpha, Stack, Stepper,
  Step, StepLabel, Paper, Tab, Tabs, LinearProgress,
} from '@mui/material';
import {
  CheckCircle as ApprovedIcon,
  Cancel as RejectedIcon,
  HourglassEmpty as PendingIcon,
  ThumbUp as ApproveIcon,
  ThumbDown as RejectIcon,
  Refresh as RefreshIcon,
  Assignment as RequestIcon,
  Info as InfoIcon,
  Speed as SpeedIcon,
  Block as BlockIcon,
  PlaylistAddCheck as AllIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const PRIMARY = '#1F7A63';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactElement<any>; label: string }> = {
  pending: { color: '#b45309', icon: <PendingIcon sx={{ fontSize: 16 }} />, label: 'Pending' },
  approved: { color: '#1F7A63', icon: <ApprovedIcon sx={{ fontSize: 16 }} />, label: 'Approved' },
  rejected: { color: '#dc2626', icon: <RejectedIcon sx={{ fontSize: 16 }} />, label: 'Rejected' },
  cancelled: { color: '#6B7280', icon: <BlockIcon sx={{ fontSize: 16 }} />, label: 'Cancelled' },
};

const PRIORITY_COLOR: Record<string, string> = { low: '#6B7280', normal: '#1F7A63', high: '#b45309', critical: '#dc2626' };

interface ApprovalRecord {
  id: string; type: string; title: string; description: string; status: string;
  priority: string; entity_type: string; entity_id: string;
  request_data: any; approval_chain: any[]; current_level: number;
  decision_comment: string; created_at: string; expires_at: string;
  decided_at: string;
  requester?: { id: string; name: string; email: string };
  decider?: { name: string };
  company?: { name: string };
}

/* ── Stat Card ───────────────────────────────── */
const StatCard: React.FC<{
  label: string; value: number | string; color: string; icon: React.ReactElement<any>; subtext?: string;
}> = ({ label, value, color, icon, subtext }) => (
  <Card elevation={0} sx={{
    border: '1px solid var(--border)', borderRadius: '12px', height: '100%', bgcolor: 'var(--bg-surface)',
    transition: 'all .25s', position: 'relative', overflow: 'hidden',
    '&:hover': { boxShadow: '0 6px 24px rgba(0,0,0,.06)', transform: 'translateY(-2px)' },
  }}>
    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: color, borderRadius: '16px 16px 0 0' }} />
    <CardContent sx={{ p: '20px 18px 16px !important' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .8, lineHeight: 1, mb: .8 }}>{label}</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 900, color: '#1F2937', lineHeight: 1, letterSpacing: -.5 }}>{value}</Typography>
          {subtext && <Typography sx={{ fontSize: 11.5, color: '#94a3b8', mt: .5, fontWeight: 500 }}>{subtext}</Typography>}
        </Box>
        <Box sx={{
          width: 42, height: 42, borderRadius: '12px', bgcolor: alpha(color, 0.08),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1.5px solid ${alpha(color, 0.15)}`,
        }}>
          {React.cloneElement(icon, { sx: { fontSize: 20, color } })}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const ApprovalWorkflowUI: React.FC = () => {
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'main_admin' || currentUser?.role === 'admin';
  const [loading, setLoading] = useState(false);
  const [approvals, setApprovals] = useState<{ workflows: ApprovalRecord[]; total: number }>({ workflows: [], total: 0 });
  const [pendingCount, setPendingCount] = useState(0);
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ApprovalRecord | null>(null);
  const [commentDialog, setCommentDialog] = useState<{ open: boolean; id: string; action: 'approve' | 'reject' }>({ open: false, id: '', action: 'approve' });
  const [comment, setComment] = useState('');
  const [snack, setSnack] = useState('');

  const statusFilter = tab === 0 ? undefined : ['pending', 'approved', 'rejected', 'cancelled'][tab - 1];

  const loadApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 10 };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get('/approvals', { params });
      setApprovals(data.data || { workflows: [], total: 0 });
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, statusFilter]);

  const loadPendingCount = useCallback(async () => {
    try {
      const { data } = await api.get('/approvals/pending-count');
      setPendingCount(data.data?.count || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadApprovals(); loadPendingCount(); }, [loadApprovals, loadPendingCount]);

  const handleAction = async () => {
    try {
      await api.post(`/approvals/${commentDialog.id}/${commentDialog.action}`, { comment });
      setSnack(`Request ${commentDialog.action}d successfully`);
      setCommentDialog({ open: false, id: '', action: 'approve' });
      setComment(''); loadApprovals(); loadPendingCount();
    } catch (e: any) { setSnack(e.response?.data?.message || 'Action failed'); }
  };

  const handleCancel = async (id: string) => {
    try {
      await api.post(`/approvals/${id}/cancel`);
      setSnack('Request cancelled'); loadApprovals(); loadPendingCount();
    } catch (e: any) { setSnack(e.response?.data?.message || 'Cancel failed'); }
  };

  // Compute stats from loaded data
  const allWorkflows = approvals.workflows;
  const approvedCount = allWorkflows.filter(a => a.status === 'approved').length;
  const rejectedCount = allWorkflows.filter(a => a.status === 'rejected').length;
  const approvalRate = allWorkflows.length > 0 ? Math.round((approvedCount / allWorkflows.length) * 100) : 0;

  // Priority breakdown
  const priorityCounts = allWorkflows.reduce<Record<string, number>>((acc, a) => {
    acc[a.priority] = (acc[a.priority] || 0) + 1;
    return acc;
  }, {});

  return (
    <Box sx={{ pb: 4, minHeight: '100vh', bgcolor: 'var(--bg-canvas)' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 26, fontWeight: 800, color: '#1F2937', letterSpacing: -.3, lineHeight: 1.2 }}>
              Approval Workflows
            </Typography>
            {pendingCount > 0 && (
              <Chip label={`${pendingCount} pending`} size="small"
                sx={{ bgcolor: alpha('#b45309', .08), color: '#b45309', fontWeight: 700, fontSize: 11, borderRadius: '8px' }} />
            )}
          </Box>
          <Typography sx={{ fontSize: 13, color: '#94a3b8', mt: .4 }}>Multi-level approval queue for enterprise operations</Typography>
        </Box>
        <Button startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
          onClick={() => { loadApprovals(); loadPendingCount(); }}
          variant="outlined" size="small"
          sx={{ textTransform: 'none', borderRadius: '10px', borderColor: 'var(--border)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13 }}>
          Refresh
        </Button>
      </Box>

      {snack && <Alert severity="info" onClose={() => setSnack('')} sx={{ mb: 2, borderRadius: '12px' }}>{snack}</Alert>}

      {/* Stat Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard label="Pending" value={pendingCount} color="#b45309" icon={<PendingIcon />} subtext="awaiting review" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Total Requests" value={approvals.total} color={PRIMARY} icon={<RequestIcon />}
            subtext={`${allWorkflows.length} loaded`} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Approved" value={approvedCount} color="#1F7A63" icon={<ApprovedIcon />}
            subtext={approvalRate > 0 ? `${approvalRate}% rate` : 'no data yet'} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard label="Rejected" value={rejectedCount} color="#dc2626" icon={<RejectedIcon />}
            subtext={allWorkflows.length > 0 ? `${Math.round((rejectedCount / allWorkflows.length) * 100)}% rate` : 'no data yet'} />
        </Grid>
      </Grid>

      {/* Priority Breakdown Bar */}
      {Object.keys(priorityCounts).length > 0 && (
        <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: '16px', mb: 3 }}>
          <CardContent sx={{ p: '16px 20px !important' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box sx={{ bgcolor: alpha('#2A9D7E', .08), borderRadius: '10px', p: .6, display: 'flex' }}>
                <SpeedIcon sx={{ fontSize: 17, color: '#2A9D7E' }} />
              </Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>Priority Breakdown</Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {Object.entries(priorityCounts).map(([priority, count]) => (
                <Box key={priority} sx={{ flex: 1, bgcolor: 'var(--bg-canvas)', borderRadius: '10px', p: 1.5, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 18, fontWeight: 800, color: PRIORITY_COLOR[priority] || '#6B7280' }}>{count}</Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'capitalize' }}>{priority}</Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {loading && <LinearProgress sx={{ mb: 2, borderRadius: 2, '& .MuiLinearProgress-bar': { bgcolor: PRIMARY } }} />}

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => { setTab(v); setPage(1); }} sx={{
        mb: 2.5,
        '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: 13, minHeight: 38 },
        '& .Mui-selected': { color: `${PRIMARY} !important` },
        '& .MuiTabs-indicator': { bgcolor: PRIMARY, height: 3, borderRadius: 2 },
      }}>
        <Tab icon={<AllIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="All" />
        <Tab icon={<PendingIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Pending" />
        <Tab icon={<ApprovedIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Approved" />
        <Tab icon={<RejectedIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Rejected" />
        <Tab icon={<BlockIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Cancelled" />
      </Tabs>

      {/* Approval List */}
      {!loading && (
        <Stack spacing={2}>
          {approvals.workflows.map(a => {
            const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
            return (
              <Card key={a.id} elevation={0} sx={{
                border: '1px solid #f0f0f0', borderRadius: '16px', position: 'relative', overflow: 'hidden',
                transition: 'all .2s', '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,.05)', borderColor: alpha(sc.color, .4) },
              }}>
                <Box sx={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, bgcolor: sc.color }} />
                <CardContent sx={{ p: '18px 18px 18px 22px !important' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ flex: 1 }}>
                      {/* Chips row */}
                      <Box sx={{ display: 'flex', gap: .5, flexWrap: 'wrap', mb: 1 }}>
                        <Chip icon={sc.icon} label={sc.label} size="small"
                          sx={{ height: 22, bgcolor: alpha(sc.color, 0.06), color: sc.color, fontWeight: 700, fontSize: 11, '& .MuiChip-icon': { ml: .5 } }} />
                        <Chip label={a.type.replace(/_/g, ' ')} size="small"
                          sx={{ height: 22, bgcolor: 'var(--bg-canvas)', color: '#6B7280', fontWeight: 600, fontSize: 11, textTransform: 'capitalize' }} />
                        <Chip label={a.priority} size="small"
                          sx={{ height: 22, bgcolor: alpha(PRIORITY_COLOR[a.priority] || '#6B7280', 0.06), color: PRIORITY_COLOR[a.priority] || '#6B7280', fontWeight: 700, fontSize: 11, textTransform: 'capitalize' }} />
                      </Box>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1F2937', mb: .3 }}>{a.title}</Typography>
                      {a.description && <Typography sx={{ fontSize: 12, color: '#94a3b8', mb: .5 }}>{a.description}</Typography>}
                      <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>
                          <Box component="strong" sx={{ color: '#6B7280' }}>By:</Box> {a.requester?.name || 'Unknown'}
                        </Typography>
                        {a.company && <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>
                          <Box component="strong" sx={{ color: '#6B7280' }}>Company:</Box> {a.company.name}
                        </Typography>}
                        <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>
                          <Box component="strong" sx={{ color: '#6B7280' }}>Created:</Box> {fmtDate(a.created_at)}
                        </Typography>
                        {a.decided_at && <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>
                          <Box component="strong" sx={{ color: '#6B7280' }}>Decided:</Box> {fmtDate(a.decided_at)} by {a.decider?.name}
                        </Typography>}
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: .3, ml: 1 }}>
                      <Tooltip title="Details">
                        <IconButton size="small" onClick={() => setDetail(a)}
                          sx={{ color: '#6B7280', '&:hover': { bgcolor: alpha(PRIMARY, .06), color: PRIMARY } }}>
                          <InfoIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                      {a.status === 'pending' && isAdmin && (
                        <>
                          <Tooltip title="Approve">
                            <IconButton size="small"
                              onClick={() => setCommentDialog({ open: true, id: a.id, action: 'approve' })}
                              sx={{ color: '#1F7A63', '&:hover': { bgcolor: alpha('#1F7A63', .06) } }}>
                              <ApproveIcon sx={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Reject">
                            <IconButton size="small"
                              onClick={() => setCommentDialog({ open: true, id: a.id, action: 'reject' })}
                              sx={{ color: '#dc2626', '&:hover': { bgcolor: alpha('#dc2626', .06) } }}>
                              <RejectIcon sx={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {a.status === 'pending' && a.requester?.id === currentUser?.id && (
                        <Button size="small" onClick={() => handleCancel(a.id)}
                          sx={{ color: '#6B7280', textTransform: 'none', fontSize: 11, fontWeight: 600, minWidth: 0, px: 1 }}>
                          Cancel
                        </Button>
                      )}
                    </Box>
                  </Box>

                  {/* Approval Chain */}
                  {a.approval_chain && a.approval_chain.length > 0 && (
                    <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #f1f5f9' }}>
                      <Stepper activeStep={a.current_level} alternativeLabel
                        sx={{
                          '& .MuiStepLabel-label': { fontSize: 10.5, fontWeight: 600 },
                          '& .MuiStepIcon-root.Mui-active': { color: PRIMARY },
                          '& .MuiStepIcon-root.Mui-completed': { color: '#1F7A63' },
                        }}>
                        {a.approval_chain.map((step: any, i: number) => (
                          <Step key={i} completed={step.status === 'approved'}>
                            <StepLabel error={step.status === 'rejected'}>
                              {step.role || `Level ${step.level}`}
                            </StepLabel>
                          </Step>
                        ))}
                      </Stepper>
                    </Box>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {approvals.workflows.length === 0 && !loading && (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <RequestIcon sx={{ fontSize: 64, color: 'var(--border)', mb: 2 }} />
              <Typography sx={{ color: '#94a3b8', fontSize: 14 }}>No approval requests found</Typography>
              <Typography sx={{ color: '#cbd5e1', fontSize: 12, mt: .5 }}>Requests will appear here when submitted</Typography>
            </Box>
          )}
        </Stack>
      )}

      {/* Pagination */}
      {approvals.total > 10 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, gap: 1 }}>
          <Button disabled={page <= 1} onClick={() => setPage(p => p - 1)} variant="outlined" size="small"
            sx={{ borderRadius: '10px', borderColor: 'var(--border)', color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 600, fontSize: 12 }}>
            Previous
          </Button>
          <Chip label={`Page ${page} of ${Math.ceil(approvals.total / 10)}`} size="small"
            sx={{ bgcolor: 'var(--bg-canvas)', fontWeight: 600, fontSize: 11.5, borderRadius: '8px' }} />
          <Button disabled={approvals.workflows.length < 10} onClick={() => setPage(p => p + 1)} variant="outlined" size="small"
            sx={{ borderRadius: '10px', borderColor: 'var(--border)', color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 600, fontSize: 12 }}>
            Next
          </Button>
        </Box>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detail} onClose={() => setDetail(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>Request Details</DialogTitle>
        <DialogContent>
          {detail && (
            <Stack spacing={2.5} sx={{ mt: .5 }}>
              {[
                { label: 'Title', value: detail.title },
                { label: 'Type', value: detail.type.replace(/_/g, ' ') },
                { label: 'Description', value: detail.description || '—' },
              ].map(item => (
                <Box key={item.label}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .3 }}>{item.label}</Typography>
                  <Typography sx={{ fontSize: 13.5, color: '#1F2937', fontWeight: 500, textTransform: item.label === 'Type' ? 'capitalize' : 'none' }}>{item.value}</Typography>
                </Box>
              ))}
              {detail.decision_comment && (
                <Box>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .3 }}>Decision Comment</Typography>
                  <Typography sx={{ fontSize: 13.5, color: '#1F2937', fontWeight: 500 }}>{detail.decision_comment}</Typography>
                </Box>
              )}
              {detail.request_data && (
                <Box>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .5, mb: .5 }}>Request Data</Typography>
                  <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'var(--bg-canvas)', borderRadius: '10px', border: '1px solid #f0f0f0' }}>
                    <Box component="pre" sx={{ margin: 0, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                      {JSON.stringify(detail.request_data, null, 2)}
                    </Box>
                  </Paper>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDetail(null)} variant="outlined" size="small"
            sx={{ borderRadius: '10px', borderColor: 'var(--border)', color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 600 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Approve/Reject Dialog */}
      <Dialog open={commentDialog.open}
        onClose={() => { setCommentDialog({ open: false, id: '', action: 'approve' }); setComment(''); }}
        maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16, color: commentDialog.action === 'approve' ? '#1F7A63' : '#dc2626' }}>
          {commentDialog.action === 'approve' ? 'Approve Request' : 'Reject Request'}
        </DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline rows={3} label="Comment (optional)" value={comment}
            onChange={e => setComment(e.target.value)}
            sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => { setCommentDialog({ open: false, id: '', action: 'approve' }); setComment(''); }}
            variant="outlined" size="small"
            sx={{ borderRadius: '10px', borderColor: 'var(--border)', color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 600 }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleAction} size="small"
            sx={{
              borderRadius: '10px', textTransform: 'none', fontWeight: 600, boxShadow: 'none',
              bgcolor: commentDialog.action === 'approve' ? '#1F7A63' : '#dc2626',
              '&:hover': { bgcolor: commentDialog.action === 'approve' ? '#1F7A63' : '#b91c1c' },
            }}>
            {commentDialog.action === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ApprovalWorkflowUI;
