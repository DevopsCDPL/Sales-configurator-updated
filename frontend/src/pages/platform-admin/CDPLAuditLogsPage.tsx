import React, { useState } from 'react';
import {
  Box, Typography, Card, Chip, Button, TextField, InputAdornment, Select, MenuItem,
  alpha, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, IconButton,
} from '@mui/material';
import {
  Search as SearchIcon, Download as DownloadIcon, FilterList as FilterIcon,
  Close as CloseIcon, VerifiedUser as VerifiedIcon, ArrowForward as ArrowIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';

const T = {
  surface: '#FFFFFF', border: '#E2E8F0', borderSubtle: '#F1F5F9',
  t1: '#0F172A', t2: '#475569', t3: '#94A3B8',
  teal: '#1F7A63', green: '#16A34A', blue: '#166354',
  purple: '#166354', amber: '#F59E0B', red: '#EF4444',
};

const SEVERITY = {
  critical: { label: 'Critical', color: T.red },
  high: { label: 'High', color: T.amber },
  medium: { label: 'Medium', color: T.blue },
  low: { label: 'Low', color: T.green },
  info: { label: 'Info', color: T.t3 },
};
type Sev = keyof typeof SEVERITY;

const MOCK_LOGS = [
  { id: 'AL-001', user: 'Vikraman Nair', resource: 'Company Settings', action: 'Modified billing plan to Enterprise', oldVal: 'Professional - ₹15,000/mo', newVal: 'Enterprise - ₹45,000/mo', severity: 'critical' as Sev, timestamp: '2026-03-15T14:32:00', ip: '192.168.1.45', hash: 'a3f2b1c8d9' },
  { id: 'AL-002', user: 'System', resource: 'User Permissions', action: 'Role escalation detected', oldVal: 'Viewer', newVal: 'Admin', severity: 'critical' as Sev, timestamp: '2026-03-15T14:15:00', ip: '10.0.0.128', hash: 'b7e4c9a1f3' },
  { id: 'AL-003', user: 'Priya Sharma', resource: 'API Key', action: 'Generated new API key', oldVal: '—', newVal: 'Key: ****-8f2a', severity: 'high' as Sev, timestamp: '2026-03-15T13:50:00', ip: '172.16.0.55', hash: 'c2d8f0b5a7' },
  { id: 'AL-004', user: 'Rajesh Kumar', resource: 'Database', action: 'Exported client data (2,450 records)', oldVal: '—', newVal: 'CSV Export', severity: 'high' as Sev, timestamp: '2026-03-15T13:30:00', ip: '10.1.1.200', hash: 'd5a9e3c6b1' },
  { id: 'AL-005', user: 'Deepa Iyer', resource: 'Integration', action: 'Connected Razorpay Payment Gateway', oldVal: 'Disconnected', newVal: 'Connected', severity: 'medium' as Sev, timestamp: '2026-03-15T12:45:00', ip: '192.168.5.100', hash: 'e8f1b4d7c0' },
  { id: 'AL-006', user: 'Ananya Desai', resource: 'User Account', action: 'Disabled user account', oldVal: 'Active', newVal: 'Disabled', severity: 'medium' as Sev, timestamp: '2026-03-15T12:20:00', ip: '10.0.0.65', hash: 'f0c7a2e5d9' },
  { id: 'AL-007', user: 'Suresh Patel', resource: 'Project', action: 'Updated project status', oldVal: 'In Progress', newVal: 'Completed', severity: 'low' as Sev, timestamp: '2026-03-15T11:55:00', ip: '172.16.1.88', hash: 'g3b6d8f1a4' },
  { id: 'AL-008', user: 'Meera Reddy', resource: 'Estimate', action: 'Viewed estimate revision history', oldVal: '—', newVal: '—', severity: 'info' as Sev, timestamp: '2026-03-15T11:30:00', ip: '10.2.2.77', hash: 'h5e9a0c3b7' },
  { id: 'AL-009', user: 'Kiran Joshi', resource: 'Security', action: 'Failed login attempt (3rd)', oldVal: '—', newVal: 'Account locked', severity: 'critical' as Sev, timestamp: '2026-03-15T11:10:00', ip: '192.168.10.33', hash: 'i7d2f4a8c1' },
  { id: 'AL-010', user: 'System', resource: 'Backup', action: 'Automated backup completed', oldVal: '—', newVal: '1.2 GB', severity: 'info' as Sev, timestamp: '2026-03-15T10:00:00', ip: '10.0.0.1', hash: 'j9c5b1e6d3' },
];

const SAVED_FILTERS = ['Critical Events', 'Data Exports', 'Permission Changes', 'Failed Logins', 'System Events'];

const CDPLAuditLogsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('All');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<typeof MOCK_LOGS[0] | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const filtered = MOCK_LOGS.filter((l) => {
    if (search && !l.user.toLowerCase().includes(search.toLowerCase()) && !l.action.toLowerCase().includes(search.toLowerCase())) return false;
    if (severity !== 'All' && l.severity !== severity) return false;
    return true;
  });

  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  MOCK_LOGS.forEach((l) => counts[l.severity]++);

  const handleGenerateReport = () => {
    const headers = ['ID', 'Severity', 'User', 'Resource', 'Action', 'Old Value', 'New Value', 'Timestamp', 'IP', 'Hash'];
    const rows = filtered.map((l) => [l.id, l.severity, l.user, l.resource, l.action, l.oldVal, l.newVal, l.timestamp, l.ip, l.hash]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-report-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setReportOpen(false);
  };

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', mb: 3, gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 11, color: T.t3, mb: 0.5 }}>Operations / Audit Logs</Typography>
          <Typography variant="h5" fontWeight={700} color={T.t1}>Audit Logs</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<DownloadIcon sx={{ fontSize: 16 }} />} onClick={() => setReportOpen(true)}
            sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, borderColor: T.border, color: T.t2, borderRadius: '8px' }}>
            Generate Report
          </Button>
        </Box>
      </Box>

      {/* Severity Summary */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        {Object.entries(SEVERITY).map(([key, s]) => (
          <Card key={key}
            onClick={() => setSeverity(severity === key ? 'All' : key)}
            sx={{
              px: 2, py: 1.5, borderRadius: '10px', border: `1px solid ${severity === key ? s.color : T.border}`,
              cursor: 'pointer', minWidth: 100, boxShadow: 'none',
              bgcolor: severity === key ? alpha(s.color, 0.05) : T.surface,
              '&:hover': { borderColor: s.color },
            }}>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: s.color }}>{counts[key as Sev]}</Typography>
            <Typography sx={{ fontSize: 11, color: T.t3 }}>{s.label}</Typography>
          </Card>
        ))}
      </Box>

      {/* Saved Filter Presets */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <FilterIcon sx={{ fontSize: 16, color: T.t3, mt: 0.5 }} />
        {SAVED_FILTERS.map((f) => (
          <Chip key={f} label={f} size="small" variant="outlined" clickable
            sx={{ fontSize: 11, borderColor: T.border, '&:hover': { borderColor: T.teal, bgcolor: alpha(T.teal, 0.05) } }} />
        ))}
      </Box>

      {/* Search */}
      <Box sx={{ mb: 2.5 }}>
        <TextField size="small" placeholder="Search by user, action, or resource..." value={search} onChange={(e) => setSearch(e.target.value)} fullWidth
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: T.t3 }} /></InputAdornment> }}
          sx={{ maxWidth: 400, '& input': { fontSize: 13 }, bgcolor: T.surface }} />
      </Box>

      {/* Audit Table */}
      <Card sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'auto' }}>
        <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <Box component="thead">
            <Box component="tr" sx={{ borderBottom: `1px solid ${T.border}` }}>
              {['ID', 'Severity', 'User', 'Resource', 'Action', 'Old → New', 'Timestamp', 'Integrity'].map((h) => (
                <Box component="th" key={h} sx={{ px: 2, py: 1.5, textAlign: 'left', fontSize: 11, fontWeight: 600, color: T.t3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</Box>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {filtered.map((log) => {
              const sev = SEVERITY[log.severity];
              return (
                <Box component="tr" key={log.id}
                  onClick={() => { setSelectedLog(log); setDetailOpen(true); }}
                  sx={{ borderBottom: `1px solid ${T.borderSubtle}`, cursor: 'pointer', '&:hover': { bgcolor: alpha(T.teal, 0.02) } }}>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontFamily: 'monospace', fontSize: 11, color: T.t3 }}>{log.id}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5 }}>
                    <Chip label={sev.label} size="small" sx={{ fontSize: 10, height: 20, bgcolor: alpha(sev.color, 0.1), color: sev.color, fontWeight: 600 }} />
                  </Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 13, color: T.t1 }}>{log.user}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: T.t2 }}>{log.resource}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 12, color: T.t1, maxWidth: 240 }}>{log.action}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5 }}>
                    {log.oldVal !== '—' || log.newVal !== '—' ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 11 }}>
                        <Typography sx={{ fontSize: 11, color: T.red, fontFamily: 'monospace', textDecoration: log.oldVal !== '—' ? 'line-through' : 'none' }}>{log.oldVal}</Typography>
                        {log.newVal !== '—' && <ArrowIcon sx={{ fontSize: 12, color: T.t3 }} />}
                        <Typography sx={{ fontSize: 11, color: T.green, fontFamily: 'monospace' }}>{log.newVal}</Typography>
                      </Box>
                    ) : <Typography sx={{ fontSize: 11, color: T.t3 }}>—</Typography>}
                  </Box>
                  <Box component="td" sx={{ px: 2, py: 1.5, fontSize: 11, color: T.t3, whiteSpace: 'nowrap' }}>{dayjs(log.timestamp).format('MMM D, h:mm A')}</Box>
                  <Box component="td" sx={{ px: 2, py: 1.5 }}>
                    <Tooltip title={`Hash: ${log.hash}`}>
                      <VerifiedIcon sx={{ fontSize: 16, color: T.green }} />
                    </Tooltip>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        {selectedLog && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Audit Entry {selectedLog.id}</Typography>
                <Chip label={SEVERITY[selectedLog.severity].label} size="small" sx={{ mt: 0.5, fontSize: 10, bgcolor: alpha(SEVERITY[selectedLog.severity].color, 0.1), color: SEVERITY[selectedLog.severity].color }} />
              </Box>
              <IconButton onClick={() => setDetailOpen(false)} size="small"><CloseIcon /></IconButton>
            </DialogTitle>
            <DialogContent>
              {[
                ['User', selectedLog.user],
                ['Resource', selectedLog.resource],
                ['Action', selectedLog.action],
                ['Timestamp', dayjs(selectedLog.timestamp).format('MMMM D, YYYY h:mm:ss A')],
                ['IP Address', selectedLog.ip],
                ['Integrity Hash', selectedLog.hash],
              ].map(([label, value]) => (
                <Box key={label} sx={{ display: 'flex', py: 1.2, borderBottom: `1px solid ${T.borderSubtle}` }}>
                  <Typography sx={{ fontSize: 12, color: T.t3, width: 120, flexShrink: 0 }}>{label}</Typography>
                  <Typography sx={{ fontSize: 12, color: T.t1, fontFamily: label === 'Integrity Hash' ? 'monospace' : 'inherit' }}>{value}</Typography>
                </Box>
              ))}
              {(selectedLog.oldVal !== '—' || selectedLog.newVal !== '—') && (
                <Box sx={{ mt: 2, p: 2, borderRadius: '8px', bgcolor: '#F8FAFC', border: `1px solid ${T.border}` }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 600, color: T.t3, mb: 1, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Diff View</Typography>
                  {selectedLog.oldVal !== '—' && (
                    <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: T.red, bgcolor: alpha(T.red, 0.05), px: 1, py: 0.5, borderRadius: '4px', mb: 0.5 }}>- {selectedLog.oldVal}</Typography>
                  )}
                  {selectedLog.newVal !== '—' && (
                    <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: T.green, bgcolor: alpha(T.green, 0.05), px: 1, py: 0.5, borderRadius: '4px' }}>+ {selectedLog.newVal}</Typography>
                  )}
                </Box>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>

      {/* Generate Report Dialog */}
      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 600 }}>Generate Audit Report</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Select size="small" defaultValue="all" sx={{ fontSize: 13 }}>
              <MenuItem value="all" sx={{ fontSize: 13 }}>All Severities</MenuItem>
              {Object.entries(SEVERITY).map(([k, v]) => <MenuItem key={k} value={k} sx={{ fontSize: 13 }}>{v.label}</MenuItem>)}
            </Select>
            <Select size="small" defaultValue="7d" sx={{ fontSize: 13 }}>
              <MenuItem value="24h" sx={{ fontSize: 13 }}>Last 24 Hours</MenuItem>
              <MenuItem value="7d" sx={{ fontSize: 13 }}>Last 7 Days</MenuItem>
              <MenuItem value="30d" sx={{ fontSize: 13 }}>Last 30 Days</MenuItem>
              <MenuItem value="90d" sx={{ fontSize: 13 }}>Last 90 Days</MenuItem>
            </Select>
            <Select size="small" defaultValue="pdf" sx={{ fontSize: 13 }}>
              <MenuItem value="pdf" sx={{ fontSize: 13 }}>PDF Report</MenuItem>
              <MenuItem value="csv" sx={{ fontSize: 13 }}>CSV Export</MenuItem>
              <MenuItem value="json" sx={{ fontSize: 13 }}>JSON Export</MenuItem>
            </Select>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReportOpen(false)} sx={{ textTransform: 'none', color: T.t3 }}>Cancel</Button>
          <Button variant="contained" onClick={handleGenerateReport}
            sx={{ bgcolor: T.teal, textTransform: 'none', fontWeight: 600, borderRadius: '8px', '&:hover': { bgcolor: '#166354' } }}>
            Generate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CDPLAuditLogsPage;
