import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Grid, IconButton, Alert, InputAdornment, Snackbar,
  Tooltip, alpha, Skeleton, ToggleButtonGroup, ToggleButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Menu, MenuItem, ListItemIcon, ListItemText, Divider, Checkbox,
  Select, FormControl, InputLabel,
} from '@mui/material';
import {
  Add as AddIcon, Search as SearchIcon, Download as DownloadIcon,
  Upload as UploadIcon,
  Email as EmailIcon, Phone as PhoneIcon,
  Business as BusinessIcon, Edit as EditIcon,
  Delete as DeleteIcon, ViewModule as GridViewIcon, ViewList as ListViewIcon,
  OpenInNew as OpenIcon, MoreVert as MoreIcon,
  History as HistoryIcon, NoteAdd as NoteIcon, ShoppingCart as OrderIcon,
  Refresh as RefreshIcon, Clear as ClearIcon,
  People as PeopleIcon, TrendingUp as TrendingUpIcon,
  AttachMoney as MoneyIcon, ErrorOutline as AlertIcon,
  ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { clientService } from '../services/clientService';
import { useAuth } from '../contexts/AuthContext';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
dayjs.extend(relativeTime);

/* ─── helpers ─────────────────────────────────────────────────────── */
const TIER_COLORS: Record<string, { bg: string; fg: string; label: string; border: string }> = {
  gold:   { bg: '#fef3c7', fg: '#92400e', label: 'Gold', border: '#F59E0B' },
  silver: { bg: '#f1f5f9', fg: '#6B7280', label: 'Silver', border: '#6B7280' },
  bronze: { bg: '#fed7aa', fg: '#9a3412', label: 'Bronze', border: '#EA580C' },
};
const PAL = ['#1F7A63','#1F7A63','#1F7A63','#ea580c','#dc2626','#1F7A63','#d97706','#1F7A63'];
const hashColor = (s: string) => PAL[Math.abs([...(s||'N')].reduce((a,c)=>a+c.charCodeAt(0),0)) % PAL.length];
const initials  = (s: string) => (s||'N').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
const n = (v: any) => Number(v) || 0;
const currency = (v: number) => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${v}`;
const ROWS_PER_PAGE = 10;

/* ─── enrich client with field-name mapping ──────────────────────── */
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

/* ─── sub-components ──────────────────────────────────────────────── */
const ProgressRing: React.FC<{value:number; size?:number; stroke?:number; color?:string}> =
  ({value, size=32, stroke=3, color='#16A34A'}) => {
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (Math.min(value,100) / 100) * circ;
    return (
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)', flexShrink:0 }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition:'stroke-dashoffset 0.6s ease' }} />
      </svg>
    );
  };

const MiniStatCard: React.FC<{icon:React.ReactNode; label:string; value:string|number;
  borderColor:string; sub?:React.ReactNode; customLeft?:React.ReactNode}> =
  ({icon,label,value,borderColor,sub,customLeft}) => (
    <Box sx={{ flex:'1 1 0', minWidth:170, p:'14px 16px', bgcolor:'var(--card)', borderRadius:'var(--radius)',
      border:'1px solid var(--border)', borderLeft:`3px solid ${borderColor}`,
      boxShadow:'var(--shadow-sm)', display:'flex', alignItems:'center', gap:'12px',
      transition:'box-shadow 0.2s', '&:hover':{ boxShadow:'var(--shadow)' } }}>
      {customLeft || (
        <Box sx={{ width:38, height:38, borderRadius:'var(--radius-sm)', bgcolor: alpha(borderColor, 0.08),
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          {icon}
        </Box>
      )}
      <Box sx={{ minWidth:0 }}>
        <Typography sx={{ fontSize:'0.65rem', color:'var(--muted)', fontWeight:600, textTransform:'uppercase',
          letterSpacing:'.06em', lineHeight:1, mb:'4px', whiteSpace:'nowrap' }}>{label}</Typography>
        <Box sx={{ display:'flex', alignItems:'baseline', gap:'6px' }}>
          <Typography sx={{ fontSize:'1.2rem', fontWeight:800, color:'var(--foreground)', lineHeight:1 }}>{value}</Typography>
          {sub}
        </Box>
      </Box>
    </Box>
  );

const TierBadge: React.FC<{tier:string}> = ({tier}) => {
  const t = TIER_COLORS[tier] || TIER_COLORS.silver;
  return (
    <Box sx={{ display:'inline-flex', alignItems:'center', gap:'4px', px:'8px', py:'2px',
      borderRadius:'var(--radius-sm)', bgcolor:t.bg, border:`1px solid ${alpha(t.fg,0.12)}` }}>
      <Box sx={{ width:5, height:5, borderRadius:'50%', bgcolor:t.fg }} />
      <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:t.fg, lineHeight:1 }}>{t.label}</Typography>
    </Box>
  );
};

const PAYMENT_MAP: Record<string, {bg:string;fg:string;dot:string}> = {
  Current:  { bg:'var(--primary-bg)', fg:'#1F7A63', dot:'#16A34A' },
  Overdue:  { bg:'#FEF2F2', fg:'#DC2626', dot:'#DC2626' },
  Pending:  { bg:'#FFFBEB', fg:'#D97706', dot:'#D97706' },
};
const PaymentBadge: React.FC<{status:string}> = ({status}) => {
  const s = PAYMENT_MAP[status] || PAYMENT_MAP.Pending;
  return (
    <Box sx={{ display:'inline-flex', alignItems:'center', gap:'4px', px:'8px', py:'2px',
      borderRadius:'var(--radius-sm)', bgcolor:s.bg, border:`1px solid ${alpha(s.fg,0.12)}` }}>
      <Box sx={{ width:5, height:5, borderRadius:'50%', bgcolor:s.dot }} />
      <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:s.fg, lineHeight:1 }}>{status}</Typography>
    </Box>
  );
};

const cardFade = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.3 } }),
};

/* ═════════════════════════════════════════════════════════════════════ */
const ClientsPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canWrite = user?.role === 'main_admin' || user?.role === 'admin' || user?.role === 'platform_admin';

  const [clients, setClients]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode]     = useState<'grid'|'table'>('table');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tierFilter, setTierFilter]     = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [page, setPage] = useState(1);

  /* dialog */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /* delete confirmation */
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  /* bulk delete */
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  /* action menu */
  const [menuAnchor, setMenuAnchor] = useState<null|HTMLElement>(null);
  const [menuClient, setMenuClient] = useState<any>(null);

  /* selection */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const [formData, setFormData] = useState({
    company_name:'', contact_person:'', position:'', email:'', phone:'',
    address:'', tax_id:'', payment_terms:'Net 30', notes:'',
  });
  const [ccList, setCcList] = useState<{name:string; position:string; email:string}[]>([]);

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { setPage(1); }, [searchQuery, statusFilter, tierFilter, paymentFilter]);

  const loadClients = async () => {
    try { setLoading(true); const d = await clientService.getAll(); setClients((d||[]).map(enrich)); }
    catch { setError('Error loading clients'); }
    finally { setLoading(false); }
  };

  /* metrics */
  const total       = clients.length;
  const active      = clients.filter(c => c.status?.toLowerCase() === 'active').length;
  const totalRev    = clients.reduce((s: number,c: any) => s + n(c.total_revenue), 0);
  const overdue     = clients.filter(c => c.payment_status === 'Overdue').length;
  const activeRate  = total ? Math.round((active / total) * 100) : 0;

  /* filters */
  const clearFilters = useCallback(() => {
    setSearchQuery(''); setStatusFilter('all'); setTierFilter('all'); setPaymentFilter('all'); setPage(1);
  }, []);
  const hasFilters = searchQuery || statusFilter !== 'all' || tierFilter !== 'all' || paymentFilter !== 'all';

  const filtered = useMemo(() => {
    return clients.filter(c => {
      const q = searchQuery.toLowerCase();
      const ms = !q || (c.company_name||'').toLowerCase().includes(q) || (c.contact_person||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q) || (c.address||'').toLowerCase().includes(q);
      const mSt = statusFilter === 'all' || c.status?.toLowerCase() === statusFilter;
      const mT  = tierFilter === 'all' || c.tier === tierFilter;
      const mP  = paymentFilter === 'all' || c.payment_status === paymentFilter;
      return ms && mSt && mT && mP;
    }).sort((a: any,b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [clients, searchQuery, statusFilter, tierFilter, paymentFilter]);

  const totalPages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  const paginated = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filtered.slice(start, start + ROWS_PER_PAGE);
  }, [filtered, page]);

  /* actions */
  const handleOpenDialog = (client?: any) => {
    if (client) {
      setEditingClient(client);
      setFormData({ company_name:client.client_name||client.company_name||'', contact_person:client.poc_name||client.contact_person||'',
        position:client.position||'', email:client.poc_email||client.email||'', phone:client.poc_phone||client.phone||'', address:client.address||'',
        tax_id:client.tax_id||'', payment_terms:client.payment_terms||'Net 30', notes:client.notes||'' });
      setCcList(Array.isArray(client.cc_list) ? client.cc_list.map((c:any) => ({ name: c.name||'', position: c.position||'', email: c.email||'' })) : []);
    } else {
      setEditingClient(null);
      setFormData({ company_name:'', contact_person:'', position:'', email:'', phone:'', address:'', tax_id:'', payment_terms:'Net 30', notes:'' });
      setCcList([]);
    }
    setDialogOpen(true); setDialogError(null);
  };
  const handleCloseDialog = () => { setDialogOpen(false); setEditingClient(null); setDialogError(null); setSubmitting(false); setCcList([]); };
  const handleSubmit = async () => {
    if (!formData.company_name.trim()) { setDialogError('Company name is required'); return; }
    const emailVal = formData.email.trim();
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) { setDialogError('Please enter a valid email address'); return; }
    // Validate CC rows
    for (let i = 0; i < ccList.length; i++) {
      const cc = ccList[i];
      if (!cc.email.trim()) { setDialogError(`CC row ${i + 1}: Email is required`); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cc.email.trim())) { setDialogError(`CC row ${i + 1}: Invalid email address`); return; }
    }
    setSubmitting(true); setDialogError(null);
    try {
      const payload: any = { client_name: formData.company_name.trim(), poc_name: formData.contact_person,
        position: formData.position || undefined, poc_email: emailVal || undefined, poc_phone: formData.phone, address: formData.address,
        tax_id: formData.tax_id, payment_terms: formData.payment_terms, notes: formData.notes,
        cc_list: ccList.filter(cc => cc.email.trim()) };
      if (editingClient) { await clientService.update(editingClient.id, payload); setSuccessMsg('Client updated'); }
      else { await clientService.create(payload); setSuccessMsg('Client added'); }
      handleCloseDialog(); loadClients();
    } catch (err: any) {
      setDialogError(err.response?.data?.errors?.map((e:any)=>e.message).join(', ') || err.response?.data?.message || 'Error saving');
    } finally { setSubmitting(false); }
  };
  const handleDelete = (id: string) => {
    const c = clients.find((cl: any) => cl.id === id);
    if (c) setDeleteTarget(c);
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await clientService.delete(deleteTarget.id); setSuccessMsg('Client deleted'); setDeleteTarget(null); loadClients(); }
    catch (err: any) { setError(err.response?.data?.message || 'Error deleting client'); setDeleteTarget(null); }
    finally { setDeleting(false); }
  };

  const confirmBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selected);
    let failed = 0;
    for (const id of ids) {
      try { await clientService.delete(id); }
      catch { failed++; }
    }
    setBulkDeleting(false);
    setBulkDeleteOpen(false);
    setSelected(new Set());
    if (failed > 0) setError(`${failed} client(s) could not be deleted.`);
    else setSuccessMsg(`${ids.length} client${ids.length !== 1 ? 's' : ''} deleted`);
    loadClients();
  };

  /* selection helpers */
  const toggleSelect = (id: string) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const allPageSelected = paginated.length > 0 && paginated.every((c: any) => selected.has(c.id));
  const somePageSelected = paginated.some((c: any) => selected.has(c.id));
  const toggleSelectAll = () => {
    if (allPageSelected) { setSelected(prev => { const s = new Set(prev); paginated.forEach((c: any) => s.delete(c.id)); return s; }); }
    else { setSelected(prev => { const s = new Set(prev); paginated.forEach((c: any) => s.add(c.id)); return s; }); }
  };

  /* ── Export to Excel ── */
  const exportToExcel = () => {
    const headers = ['S.No', 'Client ID', 'Client Name', 'Contact Person', 'Email', 'Phone', 'Address', 'No of Orders', 'Revenue', 'Status'];
    const rows = filtered.map((c: any, idx: number) => [
      idx + 1,
      c.id?.slice(0, 8)?.toUpperCase() || '',
      c.company_name || '',
      c.contact_person || '',
      c.email || '',
      c.phone || '',
      c.address || '',
      c.total_orders,
      c.total_revenue,
      c.status || 'Active',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((_, i) => ({ wch: i === 0 ? 6 : i === 1 ? 12 : i === 2 ? 25 : i === 8 ? 14 : 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clients');
    XLSX.writeFile(wb, `clients-${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  /* ── Import from Excel ── */
  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      let imported = 0, skipped = 0;
      for (const row of rows) {
        const clientName = (row['Client Name'] || row['client_name'] || row['Company'] || row['company_name'] || '').toString().trim();
        if (!clientName) { skipped++; continue; }
        try {
          await clientService.create({
            client_name: clientName,
            poc_name: (row['Contact Person'] || row['poc_name'] || '').toString().trim() || undefined,
            poc_email: (row['Email'] || row['poc_email'] || '').toString().trim() || undefined,
            poc_phone: (row['Phone'] || row['poc_phone'] || '').toString().trim() || undefined,
            address: (row['Address'] || row['address'] || '').toString().trim() || undefined,
            tax_id: (row['Tax ID'] || row['tax_id'] || '').toString().trim() || undefined,
            payment_terms: (row['Payment Terms'] || row['payment_terms'] || '').toString().trim() || undefined,
          } as any);
          imported++;
        } catch { skipped++; }
      }
      setSuccessMsg(`Imported ${imported} client${imported !== 1 ? 's' : ''}${skipped > 0 ? `, ${skipped} skipped` : ''}`);
      loadClients();
    } catch (err: any) { setError('Failed to read Excel file'); }
    finally { setImporting(false); }
  };

  return (
    <Box sx={{ pb:4 }} className="animate-fadeIn">

      {/* ═══ HEADER ═══════════════════════════════════════════════════ */}
      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb:'20px', flexWrap:'wrap', gap:1.5 }}>
        <Box>
          <Typography sx={{ fontSize:'1.35rem', fontWeight:800, color:'var(--foreground)', letterSpacing:'-0.025em', lineHeight:1.2 }}>
            Client Management
          </Typography>
          <Typography sx={{ fontSize:'0.78rem', color:'var(--muted)', mt:'2px' }}>
            Manage your clients, track revenue, and monitor payments
          </Typography>
        </Box>
        <Box sx={{ display:'flex', gap:'8px', alignItems:'center' }}>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={loadClients}
              sx={{ color:'var(--muted)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', width:34, height:34,
                transition:'all 0.15s', '&:hover':{ borderColor:'var(--primary)', color:'var(--primary)', bgcolor:'var(--primary-bg)' } }}>
              <RefreshIcon sx={{ fontSize:17 }} />
            </IconButton>
          </Tooltip>
          <Button variant="outlined" startIcon={<DownloadIcon sx={{ fontSize:15 }} />} onClick={exportToExcel}
            sx={{ textTransform:'none', borderRadius:'var(--radius-sm)', borderColor:'var(--border)', color:'var(--secondary-foreground)',
              fontWeight:600, fontSize:'0.78rem', height:34, transition:'all 0.15s',
              '&:hover':{ borderColor:'var(--primary)', color:'var(--primary)', bgcolor:'var(--primary-bg)' } }}>
            Export
          </Button>
          {canWrite && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImportExcel} />
              <Button variant="outlined" startIcon={<UploadIcon sx={{ fontSize:15 }} />}
                onClick={() => fileInputRef.current?.click()} disabled={importing}
                sx={{ textTransform:'none', borderRadius:'var(--radius-sm)', borderColor:'var(--border)', color:'var(--secondary-foreground)',
                  fontWeight:600, fontSize:'0.78rem', height:34, transition:'all 0.15s',
                  '&:hover':{ borderColor:'var(--primary)', color:'var(--primary)', bgcolor:'var(--primary-bg)' } }}>
                {importing ? 'Importing...' : 'Import'}
              </Button>
            </>
          )}
          {canWrite && selected.size > 0 && (
            <Button variant="contained" startIcon={<DeleteIcon sx={{ fontSize:15 }} />}
              onClick={() => setBulkDeleteOpen(true)}
              sx={{ bgcolor:'#EF4444', '&:hover':{ bgcolor:'#DC2626' }, textTransform:'none',
                fontWeight:700, borderRadius:'var(--radius-sm)', px:2, height:34, boxShadow:'none', fontSize:'0.78rem', color:'#fff' }}>
              Delete Selected ({selected.size})
            </Button>
          )}
          {canWrite && (
            <Button variant="contained" startIcon={<AddIcon sx={{ fontSize:17 }} />} onClick={() => handleOpenDialog()}
              sx={{ bgcolor:'var(--primary)', '&:hover':{ bgcolor:'var(--primary-light)' }, textTransform:'none',
                fontWeight:700, borderRadius:'var(--radius-sm)', px:2, height:34, boxShadow:'none', fontSize:'0.78rem' }}>
              Create Client
            </Button>
          )}
        </Box>
      </Box>

      {/* ═══ STAT CARDS ═══════════════════════════════════════════════ */}
      <Box sx={{ display:'flex', gap:'14px', mb:'20px', flexWrap:'wrap' }}>
        <MiniStatCard icon={<PeopleIcon sx={{ fontSize:20, color:'#0EA5E9' }} />}
          label="Total Clients" value={total} borderColor="#0EA5E9" />
        <MiniStatCard icon={null} label="Active Rate" value={`${activeRate}%`} borderColor="#16A34A"
          customLeft={
            <Box sx={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', width:38, height:38, flexShrink:0 }}>
              <ProgressRing value={activeRate} size={36} stroke={3} color="#16A34A" />
              <Typography sx={{ position:'absolute', fontSize:'0.55rem', fontWeight:800, color:'var(--foreground)' }}>{active}</Typography>
            </Box>
          } />
        <MiniStatCard icon={<MoneyIcon sx={{ fontSize:20, color:'#F59E0B' }} />}
          label="Total Revenue" value={currency(totalRev)} borderColor="#F59E0B"
          sub={<Typography sx={{ fontSize:'0.62rem', fontWeight:700, color:'#16A34A', display:'flex', alignItems:'center', gap:'1px' }}>
            <TrendingUpIcon sx={{ fontSize:12 }} />12%</Typography>} />
        <MiniStatCard icon={<AlertIcon sx={{ fontSize:20, color:'#DC2626' }} />}
          label="Overdue Alerts" value={overdue} borderColor="#DC2626"
          sub={overdue > 0 ? <Box sx={{ px:'6px', py:'1px', borderRadius:'var(--radius-sm)', bgcolor:'#FEF2F2',
            fontSize:'0.58rem', fontWeight:700, color:'#DC2626', lineHeight:1.4 }}>{overdue} pending</Box> : undefined} />
      </Box>

      {error && <Alert severity="error" sx={{ mb:'20px', borderRadius:'var(--radius-sm)' }} onClose={() => setError(null)}>{error}</Alert>}

      {/* ═══ FILTER TOOLBAR ═══════════════════════════════════════════ */}
      <Box sx={{ display:'flex', alignItems:'center', gap:'10px', mb:'20px', flexWrap:'wrap' }}>
        <TextField size="small" placeholder="Search name, contact, email…"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          sx={{ flex:'1 1 320px', maxWidth:400,
            '& .MuiOutlinedInput-root':{ borderRadius:'var(--radius)', fontSize:'0.8rem', height:38, bgcolor:'var(--card)',
              '&:hover .MuiOutlinedInput-notchedOutline':{ borderColor:'var(--primary)' },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor:'var(--primary)' } } }}
          InputProps={{ startAdornment:<InputAdornment position="start"><SearchIcon sx={{ fontSize:17, color:'var(--muted)' }} /></InputAdornment> }} />

        <FormControl size="small" sx={{ minWidth:110 }}>
          <InputLabel sx={{ fontSize:'0.78rem' }}>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value)}
            sx={{ borderRadius:'var(--radius)', fontSize:'0.78rem', height:38, bgcolor:'var(--card)' }}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth:110 }}>
          <InputLabel sx={{ fontSize:'0.78rem' }}>Tier</InputLabel>
          <Select value={tierFilter} label="Tier" onChange={e => setTierFilter(e.target.value)}
            sx={{ borderRadius:'var(--radius)', fontSize:'0.78rem', height:38, bgcolor:'var(--card)' }}>
            <MenuItem value="all">All Tiers</MenuItem>
            <MenuItem value="gold">Gold</MenuItem>
            <MenuItem value="silver">Silver</MenuItem>
            <MenuItem value="bronze">Bronze</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth:120 }}>
          <InputLabel sx={{ fontSize:'0.78rem' }}>Payment</InputLabel>
          <Select value={paymentFilter} label="Payment" onChange={e => setPaymentFilter(e.target.value)}
            sx={{ borderRadius:'var(--radius)', fontSize:'0.78rem', height:38, bgcolor:'var(--card)' }}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="Current">Current</MenuItem>
            <MenuItem value="Overdue">Overdue</MenuItem>
            <MenuItem value="Pending">Pending</MenuItem>
          </Select>
        </FormControl>

        {hasFilters && (
          <Button size="small" startIcon={<ClearIcon sx={{ fontSize:14 }} />} onClick={clearFilters}
            sx={{ textTransform:'none', fontSize:'0.72rem', fontWeight:600, color:'var(--muted)', borderRadius:'var(--radius-sm)', height:38 }}>Clear</Button>
        )}

        <Box sx={{ ml:'auto', display:'flex', alignItems:'center' }}>
          <ToggleButtonGroup size="small" value={viewMode} exclusive onChange={(_,v) => v && setViewMode(v)}
            sx={{ '& .MuiToggleButton-root':{ border:'1px solid var(--border)', borderRadius:'var(--radius-sm) !important', width:38, height:38, p:0,
              transition:'all 0.15s',
              '&.Mui-selected':{ bgcolor:'var(--primary)', color:'#000', borderColor:'var(--primary)',
                '&:hover':{ bgcolor:'var(--primary-light)', color:'#000' } },
              '&:not(.Mui-selected):hover':{ bgcolor:'var(--accent)' },
              '&:not(:first-of-type)':{ ml:'6px' } } }}>
            <ToggleButton value="grid"><GridViewIcon sx={{ fontSize:17 }} /></ToggleButton>
            <ToggleButton value="table"><ListViewIcon sx={{ fontSize:17 }} /></ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* ═══ CONTENT ══════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">

        {/* ── TABLE VIEW (default) ────────────────────────────────── */}
        {viewMode === 'table' && (
          <motion.div key="table-view" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.15 }}>
            <TableContainer sx={{ borderRadius:'var(--radius)', border:'1px solid var(--border)', bgcolor:'var(--card)', boxShadow:'var(--shadow-sm)', overflow:'hidden' }}>
              <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  <col style={{ width: 36 }} />
                  <col style={{ width: 44 }} />
                  <col style={{ width: 90 }} />
                  <col />{/* client name — fills remaining space */}
                  <col style={{ width: 110 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 108 }} />
                </colgroup>
                <TableHead>
                  <TableRow sx={{ bgcolor:'var(--accent)',
                    '& th':{ fontWeight:700, fontSize:'0.65rem', color:'var(--muted-foreground)', textTransform:'uppercase', letterSpacing:'.08em',
                      borderBottom:'1px solid var(--border)', py:'8px', px:'10px', verticalAlign: 'middle', position:'sticky', top:0, bgcolor:'var(--accent)', zIndex:1 } }}>
                    <TableCell padding="checkbox" sx={{ width: 36, px: '8px' }}>
                      <Checkbox size="small" checked={allPageSelected} indeterminate={!allPageSelected && somePageSelected}
                        onChange={toggleSelectAll}
                        sx={{ color: 'var(--muted)', '&.Mui-checked': { color: 'var(--primary)' }, '&.MuiCheckbox-indeterminate': { color: 'var(--primary)' } }} />
                    </TableCell>
                    <TableCell>S.No</TableCell>
                    <TableCell>Client ID</TableCell>
                    <TableCell>Client Name</TableCell>
                    <TableCell align="center">No of Orders</TableCell>
                    <TableCell align="right">Revenue</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? Array.from({length:5}).map((_,i)=>(
                    <TableRow key={i}>{Array.from({length:7}).map((_,j)=>(<TableCell key={j} sx={{ px:'10px' }}><Skeleton height={22} /></TableCell>))}</TableRow>
                  )) : paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ textAlign:'center', py:8, borderBottom:'none' }}>
                        <Box sx={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                          <Box sx={{ width:64,height:64,borderRadius:'50%',bgcolor:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',mb:1.5 }}>
                            <BusinessIcon sx={{ fontSize:28, color:'var(--muted)' }} />
                          </Box>
                          <Typography sx={{ fontSize:'0.9rem', fontWeight:700, color:'var(--secondary-foreground)', mb:0.5 }}>
                            {hasFilters ? 'No clients match your filters' : 'No clients yet'}
                          </Typography>
                          <Typography sx={{ fontSize:'0.78rem', color:'var(--muted)', mb:2 }}>
                            {hasFilters ? 'Try adjusting your filter criteria.' : 'Add your first client to get started.'}
                          </Typography>
                          {hasFilters && (
                            <Button size="small" variant="outlined" onClick={clearFilters}
                              sx={{ textTransform:'none', fontWeight:600, borderRadius:'var(--radius-sm)', borderColor:'var(--border)', color:'var(--secondary-foreground)' }}>
                              Clear Filters
                            </Button>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : paginated.map((client: any, idx: number) => {
                    const c = hashColor(client.company_name);
                    const isSelected = selected.has(client.id);
                    return (
                      <TableRow key={client.id} hover selected={isSelected}
                        sx={{ cursor:'pointer',
                          bgcolor: idx % 2 === 1 ? alpha('#F1F5F9', 0.5) : 'transparent',
                          borderLeft:'3px solid transparent',
                          transition:'all 0.15s ease',
                          '@keyframes rowIn': { from:{ opacity:0 }, to:{ opacity:1 } },
                          animation: `rowIn 0.2s ease ${idx * 0.03}s both`,
                          '&:hover':{ bgcolor: alpha('#1F7A63', 0.03), borderLeftColor:'var(--primary)' },
                          '&.Mui-selected': { bgcolor: alpha('#1F7A63', 0.03) },
                          '& td':{ fontSize:'0.8rem', color:'var(--card-foreground)', py:'6px', px:'10px', borderBottom:'1px solid var(--border-light)', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' } }}
                        onClick={() => navigate(`/clients/${client.id}/edit`)}>
                        <TableCell padding="checkbox" onClick={e => e.stopPropagation()} sx={{ px:'8px' }}>
                          <Checkbox size="small" checked={isSelected} onChange={() => toggleSelect(client.id)}
                            sx={{ color:'var(--muted)', '&.Mui-checked':{ color:'var(--primary)' } }} />
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize:'0.75rem', color:'var(--muted)', fontWeight:600 }}>
                            {(page - 1) * ROWS_PER_PAGE + idx + 1}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography sx={{ fontSize:'0.72rem', fontWeight:700, color:'var(--primary)', fontFamily:'monospace', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {client.id?.slice(0, 8)?.toUpperCase() || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display:'flex', alignItems:'center', gap:'8px', overflow:'hidden' }}>
                            <Box sx={{ width:28, height:28, borderRadius:'50%', flexShrink:0, bgcolor: c,
                              display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <Typography sx={{ color:'#fff', fontSize:'0.62rem', fontWeight:700, lineHeight:1 }}>{initials(client.company_name)}</Typography>
                            </Box>
                            <Box sx={{ minWidth:0, overflow:'hidden', flex:1 }}>
                              <Typography sx={{ fontSize:'0.8rem', fontWeight:600, color:'var(--foreground)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {client.company_name}
                              </Typography>
                              <Typography sx={{ fontSize:'0.68rem', color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{client.contact_person || '\u2014'}</Typography>
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Typography sx={{ fontSize:'0.8rem', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>{client.total_orders}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography sx={{ fontSize:'0.8rem', fontWeight:700, color:'var(--foreground)', fontVariantNumeric:'tabular-nums' }}>
                            {currency(client.total_revenue)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center" onClick={e => e.stopPropagation()}>
                          <Box sx={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'2px' }}>
                            <Tooltip title="View">
                              <IconButton size="small" onClick={() => navigate(`/clients/${client.id}`)}
                                sx={{ color:'var(--muted)', width:26, height:26, borderRadius:'6px',
                                  '&:hover':{ bgcolor: alpha('#1F7A63', 0.08), color:'var(--primary)' } }}>
                                <OpenIcon sx={{ fontSize:15 }} />
                              </IconButton>
                            </Tooltip>
                            {canWrite && (
                              <Tooltip title="Edit">
                                <IconButton size="small" onClick={() => navigate(`/clients/${client.id}/edit`)}
                                  sx={{ color:'var(--muted)', width:26, height:26, borderRadius:'6px',
                                    '&:hover':{ bgcolor: alpha('#1F7A63', 0.08), color:'var(--primary)' } }}>
                                  <EditIcon sx={{ fontSize:15 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                            {canWrite && (
                              <Tooltip title="Delete">
                                <IconButton size="small" onClick={() => handleDelete(client.id)}
                                  sx={{ color:'var(--muted)', width:26, height:26, borderRadius:'6px',
                                    '&:hover':{ bgcolor: alpha('#dc2626', 0.08), color:'#dc2626' } }}>
                                  <DeleteIcon sx={{ fontSize:15 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </motion.div>
        )}

        {/* ── CARD VIEW ───────────────────────────────────────────── */}
        {viewMode === 'grid' && (
          <motion.div key="grid-view" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} transition={{ duration:0.15 }}>
            <Grid container spacing={2}>
              {loading ? Array.from({length:6}).map((_,i)=>(
                <Grid item xs={12} sm={6} md={4} key={i}><Skeleton variant="rounded" height={300} sx={{ borderRadius:'var(--radius)' }} /></Grid>
              )) : paginated.length === 0 ? (
                <Grid item xs={12}>
                  <Box sx={{ textAlign:'center', py:12 }}>
                    <Box sx={{ width:72,height:72,borderRadius:'50%',bgcolor:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',mx:'auto',mb:2 }}>
                      <BusinessIcon sx={{ fontSize:32, color:'var(--muted)' }} />
                    </Box>
                    <Typography sx={{ fontSize:'1rem', fontWeight:700, color:'var(--secondary-foreground)', mb:0.5 }}>
                      {hasFilters ? 'No clients match your filters' : 'Add your first client'}
                    </Typography>
                    <Typography sx={{ fontSize:'0.82rem', color:'var(--muted)', mb:3, maxWidth:340, mx:'auto' }}>
                      {hasFilters ? 'Try adjusting your filter criteria.' : 'Start building your client base to track orders and revenue.'}
                    </Typography>
                    {!hasFilters && canWrite && (
                      <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}
                        sx={{ bgcolor:'var(--primary)','&:hover':{ bgcolor:'var(--primary-light)' }, textTransform:'none', fontWeight:700, borderRadius:'var(--radius-sm)', px:3, boxShadow:'none' }}>
                        Create Client
                      </Button>
                    )}
                    {hasFilters && (
                      <Button variant="outlined" onClick={clearFilters}
                        sx={{ textTransform:'none', fontWeight:600, borderRadius:'var(--radius-sm)', borderColor:'var(--border)', color:'var(--secondary-foreground)' }}>
                        Clear Filters
                      </Button>
                    )}
                  </Box>
                </Grid>
              ) : paginated.map((client: any, idx: number) => {
                const c = hashColor(client.company_name);
                const isActive = client.status?.toLowerCase() === 'active';
                const tierBorder = (TIER_COLORS[client.tier] || TIER_COLORS.silver).border;
                return (
                  <Grid item xs={12} sm={6} md={4} key={client.id}>
                    <motion.div custom={idx} variants={cardFade} initial="hidden" animate="show">
                      <Box sx={{
                        borderRadius:'var(--radius)', bgcolor:'var(--card)', overflow:'hidden',
                        border:'1px solid var(--border)', borderLeft:`2px solid ${tierBorder}`,
                        boxShadow:'var(--shadow-sm)',
                        transition:'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                        '&:hover':{ boxShadow:'var(--shadow-md)', transform:'scale(1.01)' },
                        p:'16px',
                      }}>
                        {/* HEADER */}
                        <Box sx={{ display:'flex', alignItems:'flex-start', gap:1.5, mb:1.5 }}>
                          <Box sx={{ width:40,height:40,borderRadius:'50%',flexShrink:0, bgcolor:c,
                            display:'flex',alignItems:'center',justifyContent:'center' }}>
                            <Typography sx={{ color:'#fff', fontSize:'0.78rem', fontWeight:700, lineHeight:1 }}>{initials(client.company_name)}</Typography>
                          </Box>
                          <Box sx={{ flex:1, minWidth:0 }}>
                            <Typography sx={{ fontSize:'0.9rem', fontWeight:700, color:'var(--foreground)',
                              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', cursor:'pointer',
                              transition:'color 0.15s', '&:hover':{ color:'var(--primary)' } }}
                              onClick={() => navigate(`/clients/${client.id}/edit`)}>
                              {client.company_name || 'N/A'}
                            </Typography>
                            <Box sx={{ display:'flex', alignItems:'center', gap:0.5, mt:0.25, flexWrap:'wrap' }}>
                              <TierBadge tier={client.tier} />
                              <Box sx={{ display:'inline-flex', alignItems:'center', gap:'3px', px:'6px', py:'1px',
                                borderRadius:'var(--radius-sm)',
                                bgcolor: isActive ? alpha('#16A34A',0.06) : alpha('#94a3b8',0.06) }}>
                                <Box sx={{ width:5, height:5, borderRadius:'50%', bgcolor: isActive ? '#16A34A' : 'var(--text-muted)' }} />
                                <Typography sx={{ fontSize:'0.6rem', fontWeight:600, color: isActive ? '#16A34A' : 'var(--text-muted)', lineHeight:1 }}>
                                  {isActive ? 'Active' : 'Inactive'}
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                          <IconButton size="small" onClick={e => { setMenuAnchor(e.currentTarget); setMenuClient(client); }}
                            sx={{ p:0.4, color:'var(--muted)', '&:hover':{ color:'var(--foreground)' } }}>
                            <MoreIcon sx={{ fontSize:16 }} />
                          </IconButton>
                        </Box>

                        {/* CONTACT */}
                        <Box sx={{ mb:1.5 }}>
                          <Typography sx={{ fontSize:'0.76rem', color:'var(--muted-foreground)', mb:0.25 }}>{client.contact_person || '\u2014'}</Typography>
                          {client.email && (
                            <Box sx={{ display:'flex', alignItems:'center', gap:0.5, mb:0.15 }}>
                              <EmailIcon sx={{ fontSize:12, color:'var(--muted)' }} />
                              <Typography component="a" href={`mailto:${client.email}`}
                                sx={{ fontSize:'0.7rem', color:'var(--primary)', textDecoration:'none','&:hover':{ textDecoration:'underline' },
                                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{client.email}</Typography>
                            </Box>
                          )}
                          {client.phone && (
                            <Box sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                              <PhoneIcon sx={{ fontSize:12, color:'var(--muted)' }} />
                              <Typography sx={{ fontSize:'0.7rem', color:'var(--secondary-foreground)' }}>{client.phone}</Typography>
                            </Box>
                          )}
                        </Box>

                        {/* DIVIDER */}
                        <Box sx={{ height:'1px', bgcolor:'var(--border-light)', mb:1.5 }} />

                        {/* METRICS 2x2 */}
                        <Box sx={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', mb:1.5 }}>
                          <Box>
                            <Typography sx={{ fontSize:'0.6rem', color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em' }}>Revenue</Typography>
                            <Typography sx={{ fontSize:'0.88rem', fontWeight:800, color:'var(--foreground)' }}>{currency(client.total_revenue)}</Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize:'0.6rem', color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em' }}>Orders</Typography>
                            <Typography sx={{ fontSize:'0.88rem', fontWeight:800, color:'var(--foreground)' }}>{client.total_orders}</Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize:'0.6rem', color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em' }}>Credit</Typography>
                            <Typography sx={{ fontSize:'0.88rem', fontWeight:800, color:'var(--foreground)' }}>{currency(client.credit_limit)}</Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize:'0.6rem', color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.06em' }}>Performance</Typography>
                            <Box sx={{ display:'flex', alignItems:'center', gap:'6px' }}>
                              <Box sx={{ flex:1, height:4, borderRadius:2, bgcolor:alpha('#1F7A63',0.1), overflow:'hidden' }}>
                                <Box sx={{ width:`${Math.min(client.perf_score,100)}%`, height:'100%', borderRadius:2,
                                  background:'linear-gradient(90deg, #1F7A63, #2A9D7E)', transition:'width 0.4s ease' }} />
                              </Box>
                              <Typography sx={{ fontSize:'0.65rem', fontWeight:700, color:'var(--foreground)', minWidth:24 }}>{client.perf_score}%</Typography>
                            </Box>
                          </Box>
                        </Box>

                        {/* FOOTER */}
                        <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', pt:'10px',
                          borderTop:'1px solid var(--border-light)' }}>
                          <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                            <PaymentBadge status={client.payment_status} />
                            <Typography sx={{ fontSize:'0.62rem', color:'var(--muted)' }}>
                              Last order {dayjs(client.last_order_date).fromNow()}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    </motion.div>
                  </Grid>
                );
              })}
            </Grid>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ═══ PAGINATION ═══════════════════════════════════════════════ */}
      {!loading && filtered.length > 0 && (
        <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mt:'16px', px:'4px' }}>
          <Typography sx={{ fontSize:'0.78rem', color:'var(--muted)' }}>
            Showing {Math.min((page-1)*ROWS_PER_PAGE+1, filtered.length)}&ndash;{Math.min(page*ROWS_PER_PAGE, filtered.length)} of {filtered.length} clients
          </Typography>
          {totalPages > 1 && (
            <Box sx={{ display:'flex', gap:'4px', alignItems:'center' }}>
              <IconButton size="small" disabled={page===1} onClick={()=>setPage(p=>p-1)}
                sx={{ width:32, height:32, borderRadius:'var(--radius-sm)', border:'1px solid var(--border)',
                  color:'var(--muted-foreground)', '&:hover':{ bgcolor:'var(--accent)' }, '&.Mui-disabled':{ opacity:0.4 } }}>
                <ChevronLeftIcon sx={{ fontSize:18 }} />
              </IconButton>
              {Array.from({length: totalPages}, (_,i) => i+1).map(p => (
                <Button key={p} size="small" onClick={() => setPage(p)}
                  sx={{ minWidth:32, height:32, borderRadius:'var(--radius-sm)', fontSize:'0.78rem', fontWeight:600, p:0,
                    ...(page === p
                      ? { bgcolor:'var(--primary)', color:'#000', '&:hover':{ bgcolor:'var(--primary-light)', color:'#000' } }
                      : { color:'var(--muted-foreground)', border:'1px solid var(--border)', '&:hover':{ bgcolor:'var(--accent)' } }
                    ) }}>
                  {p}
                </Button>
              ))}
              <IconButton size="small" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}
                sx={{ width:32, height:32, borderRadius:'var(--radius-sm)', border:'1px solid var(--border)',
                  color:'var(--muted-foreground)', '&:hover':{ bgcolor:'var(--accent)' }, '&.Mui-disabled':{ opacity:0.4 } }}>
                <ChevronRightIcon sx={{ fontSize:18 }} />
              </IconButton>
            </Box>
          )}
        </Box>
      )}

      {/* ═══ ACTIONS MENU ═════════════════════════════════════════════ */}
      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}
        PaperProps={{ sx:{ borderRadius:2, boxShadow:'0 8px 24px rgba(0,0,0,0.08)', minWidth:160 } }}
        transformOrigin={{ horizontal:'right', vertical:'top' }} anchorOrigin={{ horizontal:'right', vertical:'bottom' }}>
        <MenuItem onClick={() => { navigate(`/clients/${menuClient?.id}`); setMenuAnchor(null); }} sx={{ fontSize:'0.82rem', gap:1.5, py:1 }}>
          <ListItemIcon><OpenIcon sx={{ fontSize:16 }} /></ListItemIcon><ListItemText>View</ListItemText></MenuItem>
        {canWrite && <MenuItem onClick={() => { navigate(`/clients/${menuClient?.id}/edit`); setMenuAnchor(null); }} sx={{ fontSize:'0.82rem', gap:1.5, py:1 }}>
          <ListItemIcon><EditIcon sx={{ fontSize:16 }} /></ListItemIcon><ListItemText>Edit</ListItemText></MenuItem>}
        {canWrite && <MenuItem onClick={() => { handleDelete(menuClient?.id); setMenuAnchor(null); }} sx={{ fontSize:'0.82rem', color:'var(--destructive)', gap:1.5, py:1 }}>
          <ListItemIcon><DeleteIcon sx={{ fontSize:16, color:'var(--destructive)' }} /></ListItemIcon><ListItemText>Delete</ListItemText></MenuItem>}
      </Menu>

      {/* ═══ ADD/EDIT DIALOG ══════════════════════════════════════════ */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth PaperProps={{ sx:{ borderRadius:'var(--radius-lg)' } }}>
        <DialogTitle sx={{ fontWeight:800, fontSize:'1.15rem', pb:0.5 }}>
          {editingClient ? 'Edit Client' : 'Add New Client'}
          <Typography sx={{ fontSize:'0.82rem', color:'var(--muted)', fontWeight:400, mt:0.25 }}>
            Fill in the details below
          </Typography>
        </DialogTitle>
        <DialogContent sx={{ pt:2.5 }}>
          {dialogError && <Alert severity="error" sx={{ mb:2, borderRadius:'var(--radius-sm)' }} onClose={() => setDialogError(null)}>{dialogError}</Alert>}
          <Grid container spacing={2} sx={{ mt:0.5 }}>
            {[
              { name:'company_name', label:'Company Name', required:true, sm:6 },
              { name:'contact_person', label:'Contact Person', sm:6 },
              { name:'tax_id', label:'Tax ID / GST', sm:6 },
              { name:'position', label:'Position', sm:6 },
              { name:'address', label:'Address', multiline:true, rows:2, sm:6 },
              { name:'phone', label:'Phone', sm:6 },
              { name:'payment_terms', label:'Payment Terms', sm:6 },
              { name:'email', label:'Email', type:'email', sm:6 },
              { name:'notes', label:'Notes', multiline:true, rows:3, sm:6 },
            ].map(f => (
              <Grid item xs={12} sm={f.sm} key={f.name}>
                <TextField fullWidth size="small" label={f.label} required={f.required}
                  type={f.type||'text'} multiline={f.multiline} rows={f.rows}
                  value={(formData as any)[f.name]}
                  onChange={e => setFormData({...formData, [f.name]: e.target.value})}
                  sx={{ '& .MuiOutlinedInput-root':{ borderRadius:'var(--radius-sm)' } }} />
              </Grid>
            ))}
          </Grid>

          {/* ── Email CC Section ── */}
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Email CC
              </Typography>
              <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={() => setCcList(prev => [...prev, { name: '', position: '', email: '' }])}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.78rem', color: 'var(--primary)',
                  borderRadius: 'var(--radius-sm)', '&:hover': { bgcolor: 'var(--primary-bg)' } }}>
                Add CC
              </Button>
            </Box>
            {ccList.map((cc, idx) => (
              <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                <TextField size="small" placeholder="Name" value={cc.name}
                  onChange={e => setCcList(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                  sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 'var(--radius-sm)' } }} />
                <TextField size="small" placeholder="Position" value={cc.position}
                  onChange={e => setCcList(prev => prev.map((c, i) => i === idx ? { ...c, position: e.target.value } : c))}
                  sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 'var(--radius-sm)' } }} />
                <TextField size="small" placeholder="Email" type="email" required value={cc.email}
                  onChange={e => setCcList(prev => prev.map((c, i) => i === idx ? { ...c, email: e.target.value } : c))}
                  sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: 'var(--radius-sm)' } }} />
                <IconButton size="small" onClick={() => setCcList(prev => prev.filter((_, i) => i !== idx))}
                  sx={{ color: 'var(--muted)', '&:hover': { color: '#EF4444', bgcolor: '#FEF2F2' } }}>
                  <DeleteIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:2.5, gap:1 }}>
          <Button onClick={handleCloseDialog} disabled={submitting} sx={{ textTransform:'none', color:'var(--muted-foreground)', borderRadius:'var(--radius-sm)' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={submitting}
            sx={{ bgcolor:'var(--primary)','&:hover':{ bgcolor:'var(--primary-light)' }, textTransform:'none', fontWeight:700, borderRadius:'var(--radius-sm)', boxShadow:'none' }}>
            {submitting ? 'Saving...' : (editingClient ? 'Update Client' : 'Create Client')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Bulk Delete Confirmation Dialog ── */}
      <Dialog open={bulkDeleteOpen} onClose={() => !bulkDeleting && setBulkDeleteOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius:'var(--radius-lg)', p:.5 } }}>
        <DialogTitle sx={{ fontSize:16, fontWeight:700, color:'var(--foreground)', pb:.5, display:'flex', alignItems:'center', gap:1 }}>
          <Box sx={{ bgcolor:'#FEE2E2', borderRadius:'var(--radius-sm)', p:.7, display:'flex' }}>
            <DeleteIcon sx={{ fontSize:18, color:'#DC2626' }} />
          </Box>
          Delete {selected.size} Client{selected.size !== 1 ? 's' : ''}
        </DialogTitle>
        <DialogContent sx={{ pt:'8px !important' }}>
          <Typography sx={{ fontSize:13.5, color:'var(--muted-foreground)' }}>
            Are you sure you want to delete <strong>{selected.size} selected client{selected.size !== 1 ? 's' : ''}</strong>?
            All projects associated with these clients will also be deleted. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:2.5, gap:1 }}>
          <Button onClick={() => setBulkDeleteOpen(false)} variant="outlined" disabled={bulkDeleting}
            sx={{ textTransform:'none', fontSize:13, color:'var(--muted-foreground)', borderColor:'var(--border)', borderRadius:'var(--radius-sm)', px:2 }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmBulkDelete} disabled={bulkDeleting}
            sx={{ textTransform:'none', fontSize:13, fontWeight:600, borderRadius:'var(--radius-sm)', px:2, boxShadow:'none',
              bgcolor:'#EF4444', '&:hover':{ bgcolor:'#DC2626' }, color:'#fff' }}>
            {bulkDeleting ? 'Deleting...' : `Delete ${selected.size} Client${selected.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius:'var(--radius-lg)', p:.5 } }}>
        <DialogTitle sx={{ fontSize:16, fontWeight:700, color:'var(--foreground)', pb:.5, display:'flex', alignItems:'center', gap:1 }}>
          <Box sx={{ bgcolor:'#FEE2E2', borderRadius:'var(--radius-sm)', p:.7, display:'flex' }}>
            <DeleteIcon sx={{ fontSize:18, color:'#DC2626' }} />
          </Box>
          Delete Client
        </DialogTitle>
        <DialogContent sx={{ pt:'8px !important' }}>
          <Typography sx={{ fontSize:13.5, color:'var(--muted-foreground)' }}>
            Are you sure you want to delete <strong>&ldquo;{deleteTarget?.company_name || deleteTarget?.client_name}&rdquo;</strong>?
            All projects associated with this client will also be deleted. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:2.5, gap:1 }}>
          <Button onClick={() => setDeleteTarget(null)} variant="outlined" disabled={deleting}
            sx={{ textTransform:'none', fontSize:13, color:'var(--muted-foreground)', borderColor:'var(--border)', borderRadius:'var(--radius-sm)', px:2 }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmDelete} disabled={deleting}
            sx={{ textTransform:'none', fontSize:13, fontWeight:600, borderRadius:'var(--radius-sm)', px:2, boxShadow:'none',
              bgcolor:'#EF4444', '&:hover':{ bgcolor:'#DC2626' }, color:'#fff' }}>
            {deleting ? 'Deleting...' : 'Confirm Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!successMsg} autoHideDuration={3000} onClose={() => setSuccessMsg('')} anchorOrigin={{ vertical:'top', horizontal:'center' }}>
        <Alert onClose={() => setSuccessMsg('')} severity="success" variant="filled" sx={{ borderRadius:2 }}>{successMsg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default ClientsPage;
